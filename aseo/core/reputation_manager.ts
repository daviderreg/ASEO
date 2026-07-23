import * as fs from 'fs';
import * as path from 'path';

export interface AgentReputation {
  agentId: string;
  role: string;
  successCount: number;
  failureCount: number;
  score: number; // Calculated as success / (success + failure)
}

export class ReputationManager {
  private storagePath: string;
  private reputations: Map<string, AgentReputation> = new Map();

  constructor() {
    this.storagePath = path.join(process.cwd(), 'aseo', 'storage', 'reputations.json');
    this.load();
  }

  private load() {
    if (fs.existsSync(this.storagePath)) {
      const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'));
      Object.entries(data).forEach(([id, rep]) => {
        this.reputations.set(id, rep as AgentReputation);
      });
    }
  }

  private save() {
    const data = Object.fromEntries(this.reputations);
    fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
  }

  public updateReputation(agentId: string, role: string, success: boolean) {
    const rep = this.reputations.get(agentId) || {
      agentId,
      role,
      successCount: 0,
      failureCount: 0,
      score: 1.0
    };

    if (success) {
      rep.successCount++;
    } else {
      rep.failureCount++;
    }

    const total = rep.successCount + rep.failureCount;
    rep.score = total === 0 ? 1.0 : rep.successCount / total;

    this.reputations.set(agentId, rep);
    this.save();
  }

  public getReputation(agentId: string): AgentReputation | null {
    return this.reputations.get(agentId) || null;
  }

  public getBestAgentForRole(role: string): string | null {
    const candidates = Array.from(this.reputations.values()).filter(r => r.role === role);
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => b.score - a.score)[0].agentId;
  }

  public getReputationScores(): AgentReputation[] {
    return Array.from(this.reputations.values());
  }
}
