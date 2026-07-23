import { EventBus, ASEOEvent } from './event_bus';
import { AgentRegistry } from './agent_registry';
import { ArbitrationEngine } from './arbitration_engine';
import { DecisionPoint, AgentProposal, AgentDecision } from '../planner/types';

export class AgentCouncil {
  constructor(
    private eventBus: EventBus,
    private registry: AgentRegistry,
    private arbitrationEngine: ArbitrationEngine
  ) {}

  /**
   * Coordinates a council session to resolve a specific decision point.
   */
  public async conductSession(
    correlationId: string,
    decisionPoint: DecisionPoint
  ): Promise<AgentDecision> {
    console.log(`[Council] Starting session for Decision Point: ${decisionPoint.id} (${decisionPoint.description})`);

    const proposals: AgentProposal[] = [];
    
    // 1. Identify agents that should contribute
    const participatingAgents = this.registry.getAgentsByRoles(decisionPoint.requiredRoles);

    // 2. Collect proposals from participating agents
    // Note: In a real runtime, this would be an async event-based request/response.
    // Here we call the agent's decision logic directly to simulate the proposal phase.
    for (const agent of participatingAgents) {
      try {
        // We construct a DecisionContext for the agent to evaluate
        // This is a simplified context specifically for Council-led decisions
        const proposal = await agent.propose(correlationId, decisionPoint);
        if (proposal) {
          proposals.push(proposal);
          console.log(`[Council] Proposal received from ${agent.id} (${agent.role})`);
        }
      } catch (error) {
        console.error(`[Council] Agent ${agent.id} failed to provide proposal:`, error);
      }
    }

    if (proposals.length === 0) {
      throw new Error(`Council failed: No proposals collected for ${decisionPoint.id}`);
    }

    // 3. Arbitrate the proposals
    const decision = await this.arbitrationEngine.resolve(
      decisionPoint.id,
      proposals,
      decisionPoint.resolutionMode
    );

    console.log(`[Council] Decision finalized. Winner: ${decision.winningProposal.agentId} via ${decision.resolvedVia}`);

    // 4. Transform the winning proposal into a system event
    await this.emitFinalDecision(correlationId, decision, decisionPoint.id);

    return decision;
  }

  private async emitFinalDecision(correlationId: string, decision: AgentDecision, dpId: string): Promise<void> {
    const winning = decision.winningProposal;
    
    // Emit the specific action proposed by the winner for the audit trail
    await this.eventBus.emit({
      type: winning.proposedAction as any,
      payload: {
        ...winning.payload,
        decisionId: decision.decisionId,
        resolvedVia: decision.resolvedVia
      },
      source_agent: winning.agentId,
      correlation_id: correlationId,
      metadata: { timestamp: new Date().toISOString() }
    });

    // Emit a system-level decision event that the Orchestrator can use to drive state
    await this.eventBus.emit({
      type: "DECISION_FINALIZED",
      payload: {
        decisionPointId: dpId, // Use the static DP ID from the strategy
        winningAgentId: winning.agentId,
        resolution: decision.resolvedVia
      },
      source_agent: "COUNCIL",
      correlation_id: correlationId,
      metadata: { timestamp: new Date().toISOString() }
    });
  }
}