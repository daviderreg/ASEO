import { AgentProposal, AgentDecision, ResolutionMode } from '../planner/types';
import { ReputationManager } from './reputation_manager';

export class ArbitrationEngine {
  constructor(private reputationManager: ReputationManager) {}

  public async resolve(
    decisionPointId: string,
    proposals: AgentProposal[],
    mode: ResolutionMode
  ): Promise<AgentDecision> {
    if (proposals.length === 0) {
      throw new Error(`No proposals provided for decision point ${decisionPointId}`);
    }

    let winningProposal: AgentProposal;
    let finalScore = 0;

    switch (mode) {
      case "HIGHEST_REPUTATION":
        winningProposal = this.resolveByReputation(proposals);
        finalScore = 1.0; // Trust-based
        break;
      case "VOTE":
        winningProposal = this.resolveByVote(proposals);
        finalScore = 0.8; // Consensus-based
        break;
      case "ARBITRATION":
      default:
        const results = proposals.map(p => ({
          proposal: p,
          score: this.calculateWeightedScore(p)
        }));
        results.sort((a, b) => b.score - a.score);
        winningProposal = results[0].proposal;
        finalScore = results[0].score;
        break;
    }

    return {
      decisionId: `dec_${Date.now()}_${decisionPointId}`,
      winningProposal,
      finalScore,
      resolvedVia: mode,
      proposalsConsidered: proposals,
      timestamp: new Date().toISOString()
    };
  }

  private calculateWeightedScore(proposal: AgentProposal): number {
    const confidence = Number(proposal.confidence ?? 0);
    const risk = Number(proposal.risk ?? 0);
    const reputation = Number(this.reputationManager.getReputation(proposal.agentId) ?? 0.5);
    
    // score = confidence * 0.4 + (1 - risk) * 0.3 + reputation * 0.3
    const score = 
      (confidence * 0.4) + 
      ((1 - risk) * 0.3) + 
      (reputation * 0.3);
    
    return score;
  }

  private resolveByReputation(proposals: AgentProposal[]): AgentProposal {
    return proposals.reduce((prev, current) => {
      const prevRep = this.reputationManager.getReputation(prev.agentId) ?? 0.5;
      const currRep = this.reputationManager.getReputation(current.agentId) ?? 0.5;
      return (currRep > prevRep) ? current : prev;
    });
  }

  private resolveByVote(proposals: AgentProposal[]): AgentProposal {
    const votes = new Map<string, number>();
    proposals.forEach(p => {
      const action = p.proposedAction;
      votes.set(action, (votes.get(action) || 0) + 1);
    });

    let winningAction = "";
    let maxVotes = -1;
    votes.forEach((count, action) => {
      if (count > maxVotes) {
        maxVotes = count;
        winningAction = action;
      }
    });

    // Return the first proposal that matches the winning action
    return proposals.find(p => p.proposedAction === winningAction)!;
  }
}