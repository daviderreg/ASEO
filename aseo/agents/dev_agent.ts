import { BaseAgent, DecisionContext, AgentDecision } from './base_agent';
import { EventBus, EventType } from '../core/event_bus';
import { AgentProposal, DecisionPoint } from '../planner/types';
import { WorkflowState, Orchestrator } from '../core/orchestrator';
import { GraphManager } from '../core/graph_manager';

export class DevAgent extends BaseAgent {
  public validStates: WorkflowState[] = ["PLANNED", "IMPLEMENTED", "REVIEWED"];

  constructor(id: string, eventBus: EventBus, graphManager: GraphManager, orchestrator: Orchestrator) {
    super(id, "Developer", eventBus, graphManager, orchestrator);
  }

  public setupSubscriptions(): void {
    this.eventBus.subscribe("STATE_TRANSITIONED", (event) => this.handleStateTransition(event));
  }

  private async handleStateTransition(event: any) {
    const newState = event.payload.newState;
    const correlationId = event.correlation_id;

    if (newState === "IMPLEMENTED") {
      console.log(`[Dev] State moved to IMPLEMENTED. Implementing source code for ${correlationId}`);
      
      const events = await this.eventBus.getEventsByCorrelationId(correlationId);
      const planApprovedEvent = events.find(e => e.type === "PLAN_APPROVED");

      const context = {
        event: planApprovedEvent || {
          id: 'fallback',
          timestamp: new Date().toISOString(),
          type: 'PLAN_APPROVED' as any,
          payload: { decision: 'Fallback approval' },
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
  }

  public async decide(context: DecisionContext): Promise<AgentDecision | null> {
    console.log(`[Dev] Performing LLM-backed implementation for correlation: ${context.goalId}`);
    
    const systemPrompt = `You are the Lead Developer of an Autonomous Software Engineering Organization.
    Your role is to translate the approved project plan and technical architecture into high-quality, production-ready source code.
    
    You must produce:
    1. The actual source code implementation.
    2. Unit tests for the core logic.
    3. A summary of the implementation details.
    
    Your output must be a JSON object matching the AgentDecision interface:
    {
      "reason": "Explanation of the implementation approach",
      "confidence": 0.0 to 1.0,
      "proposal": {
        "agentId": "${this.id}",
        "role": "Developer",
        "proposedAction": "IMPLEMENTATION_COMPLETE",
        "payload": { 
          "code": { "filename": "content" },
          "tests": { "filename": "content" },
          "coverage": "Estimated %",
          "status": "CODING_COMPLETE"
        },
        "confidence": 0.0 to 1.0,
        "risk": 0.0 to 1.0,
        "reasoning": "Justification of the implementation against the architecture"
      }
    }`;

    const userPrompt = `Approved Plan & Architecture Context: ${JSON.stringify(context.graphSnapshot)}
    Correlation ID: ${context.goalId}`;

    const result = await this.think({
      systemPrompt,
      userPrompt,
      responseFormat: 'json'
    });

    if (result.structuredData) {
      const data = result.structuredData;
      
      // Persist the actual code implementation as a verifiable artifact
      await this.createArtifact('CODE', `impl_${context.goalId}`, data.proposal.payload, context.goalId);
      
      return data as AgentDecision;
    }

    return null;
  }

  public async propose(correlationId: string, decisionPoint: DecisionPoint): Promise<AgentProposal | null> {
    console.log(`[Dev] Generating LLM-backed proposal for ${decisionPoint.id}`);
    
    const systemPrompt = `You are the Developer. You are participating in a Council Decision for point ${decisionPoint.id}: ${decisionPoint.description}.
    You must defend the implementation details and verify that they align with the approved architecture.
    
    Your output must be a JSON object matching the AgentProposal interface:
    {
      "agentId": "${this.id}",
      "role": "Developer",
      "proposedAction": "APPROVE_IMPLEMENTATION",
      "payload": { "decision": "APPROVE/REJECT", "comments": "Technical justification" },
      "confidence": 0.0 to 1.0,
      "risk": 0.0 to 1.0,
      "reasoning": "Analysis of the implementation vs requirements"
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