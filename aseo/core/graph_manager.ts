import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ArtifactManager } from './artifact_manager';

export type NodeId = string;
export type EdgeId = string;

export interface GraphNode {
  id: NodeId;
  type: string;
  correlation_id?: string;
  properties: Record<string, any>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    lastEventId: string;
  };
}

export interface GraphEdge {
  id: EdgeId;
  source: NodeId;
  target: NodeId;
  relation: string;
  properties: Record<string, any>;
}

export interface KnowledgeGraph {
  nodes: Record<NodeId, GraphNode>;
  edges: Record<EdgeId, GraphEdge>;
}

export class GraphManager {
  private graphPath: string;
  private graph: KnowledgeGraph;
  private artifactManager: ArtifactManager;

  constructor() {
    this.artifactManager = new ArtifactManager();
    this.graphPath = path.join(process.cwd(), 'aseo', 'storage', 'graph', 'state.json');
    const dir = path.dirname(this.graphPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.graph = this.loadGraph();
  }

  private loadGraph(): KnowledgeGraph {
    let graph: KnowledgeGraph = { nodes: {}, edges: {} };
    if (fs.existsSync(this.graphPath)) {
      try {
        const content = fs.readFileSync(this.graphPath, 'utf-8');
        const parsed = JSON.parse(content);
        graph = {
          nodes: parsed.nodes || {},
          edges: parsed.edges || {}
        };
      } catch (e) {
        console.error(`[GraphManager] Failed to parse graph file, using default:`, e);
      }
    }
    return graph;
  }

  private saveGraph(): void {
    fs.writeFileSync(this.graphPath, JSON.stringify(this.graph, null, 2));
  }

  public upsertNode(node: Partial<GraphNode>): GraphNode {
    const id = node.id || uuidv4();
    const now = new Date().toISOString();
    
    const existing = this.graph.nodes[id];
    const updatedNode: GraphNode = {
      id,
      type: node.type || (existing?.type || 'UNKNOWN'),
      correlation_id: node.correlation_id || existing?.correlation_id,
      properties: { ...existing?.properties, ...node.properties },
      metadata: {
        createdAt: existing?.metadata?.createdAt || now,
        updatedAt: now,
        createdBy: node.metadata?.createdBy || (existing?.metadata?.createdBy || 'SYSTEM'),
        lastEventId: node.metadata?.lastEventId || (existing?.metadata?.lastEventId || 'INIT'),
      }
    };

    this.graph.nodes[id] = updatedNode;
    this.saveGraph();
    
    // Persist as physical artifact
    this.artifactManager.persistNode(id, updatedNode).catch(err => 
      console.error(`[GraphManager] Artifact persistence failed for ${id}:`, err)
    );

    return updatedNode;
  }

  public addEdge(source: NodeId, target: NodeId, relation: string, properties: Record<string, any> = {}): GraphEdge {
    if (!this.graph.nodes[source] || !this.graph.nodes[target]) {
      throw new Error(`Source or target node does not exist: ${source} -> ${target}`);
    }

    const id = uuidv4();
    const edge: GraphEdge = {
      id,
      source,
      target,
      relation,
      properties,
    };

    this.graph.edges[id] = edge;
    this.saveGraph();
    return edge;
  }

  public getNode(id: NodeId): GraphNode | undefined {
    return this.graph.nodes[id];
  }

  public getNodesByType(type: string): GraphNode[] {
    return Object.values(this.graph.nodes).filter(node => node.type === type);
  }

  /**
   * Finds all nodes connected to the given node by a specific relation.
   */
  public getRelatedNodes(nodeId: NodeId, relation: string, direction: 'out' | 'in' = 'out'): GraphNode[] {
    const relatedIds = Object.values(this.graph.edges)
      .filter(edge => direction === 'out' ? (edge.source === nodeId && edge.relation === relation) : (edge.target === nodeId && edge.relation === relation))
      .map(edge => direction === 'out' ? edge.target : edge.source);

    return relatedIds.map(id => this.graph.nodes[id]).filter(node => !!node);
  }

  public getFullGraph(): KnowledgeGraph {
    return { ...this.graph };
  }

  /**
   * Returns a snapshot of the current graph for planning purposes.
   */
  public async getSnapshot(): Promise<KnowledgeGraph> {
    return this.getFullGraph();
  }

  /**
   * Updates a node with simplified input.
   * Maps the input to the formal GraphNode structure.
   */
  public async updateNode(id: NodeId, data: any): Promise<GraphNode> {
    const properties: Record<string, any> = {};
    
    // Separate 'type' from other properties
    if (data.type) {
      // we handle type in upsertNode, but we can keep it in properties too
    }
    
    if (data.properties && typeof data.properties === 'object') {
      Object.assign(properties, data.properties);
    }
    
    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'type' && key !== 'properties') {
        properties[key] = value;
      }
    });
    
    return this.upsertNode({
      id,
      type: data.type,
      correlation_id: data.correlation_id,
      properties: properties,
      metadata: {
        createdBy: 'ORCHESTRATOR',
        lastEventId: 'PLAN_GENERATED'
      } as any
    });
  }

  public async clearAll(): Promise<void> {
    this.graph = { nodes: {}, edges: {} };
    this.saveGraph();
  }
}
