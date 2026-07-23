import * as fs from 'fs';
import * as path from 'path';

export class ArtifactManager {
  private baseDir = 'aseo';
  
  private typeToFolder: Record<string, string> = {
    'ADR': 'adr',
    'SECURITY_REPORT': 'security',
    'PERF_REPORT': 'performance',
    'TEST_REPORT': 'tests',
    'DOCS': 'docs',
    'REVIEW': 'reviews',
    'TASK': 'tasks',
    'CODE': 'tasks',
    'EXECUTION_STRATEGY': 'graph',
    'ARTIFACT': 'graph'
  };

  public async persistNode(nodeId: string, node: any): Promise<void> {
    const type = node.type || 'ARTIFACT';
    const folder = this.typeToFolder[type] || 'graph';
    const dirPath = path.join(this.baseDir, folder);

    // Ensure directory exists
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const filePath = path.join(dirPath, `${nodeId}.json`);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(node, null, 2), 'utf8');
    } catch (error) {
      console.error(`[ArtifactManager] Failed to persist node ${nodeId} to ${filePath}:`, error);
    }
  }

  public async persistEvent(event: any): Promise<void> {
    const dirPath = path.join(this.baseDir, 'events');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    const fileName = `${event.timestamp.replace(/:/g, '-')}_${event.id}.json`;
    const filePath = path.join(dirPath, fileName);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(event, null, 2), 'utf8');
    } catch (error) {
      console.error(`[ArtifactManager] Failed to persist event ${event.id}:`, error);
    }
  }

  public async log(message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO', metadata: any = {}): Promise<void> {
    const dirPath = path.join(this.baseDir, 'logs');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata
    };
    
    const fileName = `system.log`;
    const filePath = path.join(dirPath, fileName);
    
    try {
      fs.appendFileSync(filePath, JSON.stringify(logEntry) + '\n', 'utf8');
    } catch (error) {
      console.error(`[ArtifactManager] Failed to write log:`, error);
    }
  }

  public async listArtifacts(category: string): Promise<any[]> {
    const folder = this.typeToFolder[category] || 'graph';
    const dirPath = path.join(this.baseDir, folder);
    
    if (!fs.existsSync(dirPath)) return [];
    
    const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.json'));
    
    return files.map(file => {
      try {
        const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
        return JSON.parse(content);
      } catch (e) {
        console.error(`[ArtifactManager] Failed to read artifact ${file}:`, e);
        return null;
      }
    }).filter(item => item !== null);
  }

  public async getTask(taskId: string): Promise<any | null> {
    const tasks = await this.listArtifacts('TASK');
    return tasks.find(t => t.id === taskId) || null;
  }

  public async getArtifactContent(category: string, artifactId: string): Promise<any | null> {
    const folder = this.typeToFolder[category] || 'graph';
    const filePath = path.join(this.baseDir, folder, `${artifactId}.json`);
    
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.error(`[ArtifactManager] Failed to read artifact ${artifactId}:`, e);
      return null;
    }
  }

  public async hasArtifact(taskId: string, artifactType: string): Promise<boolean> {
    const artifacts = await this.listArtifacts(artifactType);
    // We assume an artifact is linked to a task if it has a taskId property or the task references it.
    // In this system, we check if any artifact of the required type contains the taskId in its properties or metadata.
    return artifacts.some(art => 
      art.taskId === taskId || 
      (art.properties && art.properties.taskId === taskId) ||
      (art.metadata && art.metadata.taskId === taskId)
    );
  }
}
