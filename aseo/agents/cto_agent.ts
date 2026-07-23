import { BaseAgent, DecisionContext, AgentDecision } from './base_agent';
import { EventBus, EventType } from '../core/event_bus';
import { AgentProposal, DecisionPoint } from '../planner/types';
import { WorkflowState, Orchestrator } from '../core/orchestrator';
import { GraphManager } from '../core/graph_manager';

export class CTOAgent extends BaseAgent {
  public validStates: WorkflowState[] = ["NEW", "ANALYZED", "ARCHITECTED", "REVIEWED", "DOCUMENTED", "MERGED"];

  constructor(id: string, eventBus: EventBus, graphManager: GraphManager, orchestrator: Orchestrator) {
    super(id, "CTO", eventBus, graphManager, orchestrator);
  }

  public setupSubscriptions(): void {
    this.eventBus.subscribe("STATE_TRANSITIONED", (event) => this.handleStateTransition(event));
  }

  private async handleStateTransition(event: any) {
    const newState = event.payload.newState;
    const correlationId = event.correlation_id;

    if (newState === "ANALYZED") {
      console.log(`[CTO] State moved to ANALYZED. Performing strategic analysis for ${correlationId}`);
      
      const events = await this.eventBus.getEventsByCorrelationId(correlationId);
      const goalEvent = events.find(e => e.type === "GOAL_SUBMITTED");
      
      const context = {
        event: goalEvent || { 
          id: 'fallback', 
          timestamp: new Date().toISOString(), 
          type: 'GOAL_SUBMITTED' as any, 
          payload: { goal: 'Unknown Goal' }, 
          source_agent: 'SYSTEM', 
          correlation_id: correlationId, 
          metadata: {} 
        },
        goalId: correlationId,
        graphSnapshot: await this.graphManager.getSnapshot()
      };
      
      const decision = await this.decide(context);
      if (decision) {
        await this.emitSafe({
          type: decision.proposal.proposedAction as EventType,
          payload: decision.proposal.payload,
          source_agent: this.id,
          correlation_id: correlationId,
        });
      }
    }

    if (newState === "DOCUMENTED") {
      console.log(`[CTO] System is DOCUMENTED. Performing final merge review for ${correlationId}`);
      await this.emitSafe({
        type: "MERGE_APPROVED",
        payload: { 
          decision: "MERGE", 
          comments: "All gates passed. Architecture and implementation verified. Final approval granted.",
          status: "APPROVED" 
        },
        source_agent: this.id,
        correlation_id: correlationId,
      });
    }
  }

  public async decide(context: DecisionContext): Promise<AgentDecision | null> {
    console.log(`[CTO] Performing LLM-backed strategic analysis for correlation: ${context.goalId}`);
    
    const systemPrompt = `You are the CTO of an Autonomous Software Engineering Organization. 
    Your role is to perform high-level strategic analysis of goals.
    You must decompose the goal into core requirements, identify strategic risks, and determine if the project is viable.

    STRICT WORKFLOW RULE:
    Your current phase is INITIAL ANALYSIS. 
    The ONLY valid proposedAction for this phase is "ANALYSIS_COMPLETE".
    Do NOT propose architecture, plans, or implementation. Your goal is to finalize the STRATEGY artifact.
    
    Your output must be a JSON object matching the AgentDecision interface:
    {
      "reason": "Detailed explanation of your reasoning",
      "confidence": 0.0 to 1.0,
      "proposal": {
        "agentId": "${this.id}",
        "role": "CTO",
        "proposedAction": "ANALYSIS_COMPLETE",
        "payload": { "analysis": "...", "requirements": [], "risks": [] },
        "confidence": 0.0 to 1.0,
        "risk": 0.0 to 1.0,
        "reasoning": "Summary of the proposal"
      }
    }`;

    const userPrompt = `Goal: ${context.event.payload.goal || 'Unknown'}
    Correlation ID: ${context.goalId}
    Current Knowledge Graph Snapshot: ${JSON.stringify(context.graphSnapshot)}`;

    const result = await this.think({
      systemPrompt,
      userPrompt,
      responseFormat: 'json'
    });

    if (result.structuredData) {
      // Persist the detailed analysis as a strategic artifact
      await this.createArtifact('STRATEGY', 'Initial_Analysis', result.structuredData.proposal.payload, context.goalId);
      return result.structuredData as AgentDecision;
    }

    return null;
  }

  public async propose(correlationId: string, decisionPoint: DecisionPoint): Promise<AgentProposal | null> {
    console.log(`[CTO] Generating LLM-backed proposal for ${decisionPoint.id}`);
    
    const systemPrompt = `You are the CTO. You are participating in a Council Decision for point ${decisionPoint.id}: ${decisionPoint.description}.
    You must provide a proposal based on your strategic vision.
    
    Your output must be a JSON object matching the AgentProposal interface:
    {
      "agentId": "${this.id}",
      "role": "CTO",
      "proposedAction": "APPROVE_STRATEGY",
      "payload": { "decision": "APPROVE/REJECT", "comments": "..." },
      "confidence": 0.0 to 1.0,
      "risk": 0.0 to 1.0,
      "reasoning": "Detailed justification"
    }`;

    const userPrompt = `Decision Point: ${JSON.stringify(decisionPoint)}
    Correlation ID: ${correlationId}`;

    const result = await this.think({
      systemPrompt,
      userPrompt,
      responseFormat: 'json'
    });

    return result.structuredData as AgentProposal | null;
  }
}