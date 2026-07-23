import { BaseAgent, DecisionContext, AgentDecision } from './base_agent';
import { EventBus, EventType } from '../core/event_bus';
import { AgentProposal, DecisionPoint } from '../planner/types';

import { WorkflowState, Orchestrator } from '../core/orchestrator';
import { GraphManager } from '../core/graph_manager';

export class PMAgent extends BaseAgent {
  public validStates: WorkflowState[] = ["ANALYZED", "ARCHITECTED", "PLANNED", "IMPLEMENTED", "DOCUMENTED", "MERGED"];

  constructor(id: string, eventBus: EventBus, graphManager: GraphManager, orchestrator: Orchestrator) {
    super(id, "PM", eventBus, graphManager, orchestrator);
  }

  public setupSubscriptions(): void {
    this.eventBus.subscribe("STATE_TRANSITIONED", (event) => this.handleStateTransition(event));
  }

  private async handleStateTransition(event: any) {
    const newState = event.payload.newState;
    const correlationId = event.correlation_id;

    console.log(`[PM] Observed state transition to: ${newState} for ${correlationId}`);

    if (newState === "PLANNED") {
      console.log(`[PM] State moved to PLANNED. Creating execution roadmap for ${correlationId}`);
      
      const events = await this.eventBus.getEventsByCorrelationId(correlationId);
      const archApprovedEvent = events.find(e => e.type === "ARCHITECTURE_APPROVED");

      const context = {
        event: archApprovedEvent || {
          id: 'fallback',
          timestamp: new Date().toISOString(),
          type: 'ARCHITECTURE_APPROVED' as any,
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
          metadata: { reasoning: decision.reason }
        });
      }
    }

    if (newState === "DOCUMENTED") {
      console.log(`[PM] System is DOCUMENTED. Finalizing project management review for ${correlationId}`);
      await this.emitSafe({
        type: "MERGE_APPROVED",
        payload: { 
          decision: "MERGE", 
          comments: "Project milestones achieved. All deliverables documented and verified.",
          status: "APPROVED" 
        },
        source_agent: this.id,
        correlation_id: correlationId,
      });
    }
  }

  public async decide(context: DecisionContext): Promise<AgentDecision | null> {
    console.log(`[PM] Performing LLM-backed project planning for correlation: ${context.goalId}`);
    
    const systemPrompt = `You are the Project Manager (PM) of an Autonomous Software Engineering Organization.
    Your role is to convert the approved architecture and strategic analysis into a detailed execution plan.
    You must define milestones, break down the architecture into implementable tasks, and estimate complexity.

    STRICT WORKFLOW RULE:
    Your current phase is PROJECT PLANNING. 
    The ONLY valid proposedAction for this phase is "PLAN_PROPOSED".
    Do NOT propose code or test reports. Your goal is to finalize the EXECUTION_PLAN artifact.
    
    Your output must be a JSON object matching the AgentDecision interface:
    {
      "reason": "Explanation of the planning strategy",
      "confidence": 0.0 to 1.0,
      "proposal": {
        "agentId": "${this.id}",
        "role": "PM",
        "proposedAction": "PLAN_PROPOSED",
        "payload": { 
          "plan": "Detailed delivery roadmap",
          "milestones": [], 
          "tasks": [], 
          "estimatedComplexity": "Low/Medium/High" 
        },
        "confidence": 0.0 to 1.0,
        "risk": 0.0 to 1.0,
        "reasoning": "Justification for this specific plan sequence"
      }
    }`;

    const userPrompt = `Approved Architecture & Goal Context: ${JSON.stringify(context.graphSnapshot)}
    Correlation ID: ${context.goalId}`;

    const result = await this.think({
      systemPrompt,
      userPrompt,
      responseFormat: 'json'
    });

    if (result.structuredData) {
      // Persist the execution plan as a verifiable artifact
      await this.createArtifact('EXECUTION_PLAN', 'Project_Roadmap', result.structuredData.proposal.payload, context.goalId);
      return result.structuredData as AgentDecision;
    }

    return null;
  }

  public async propose(correlationId: string, decisionPoint: DecisionPoint): Promise<AgentProposal | null> {
    console.log(`[PM] Generating LLM-backed proposal for ${decisionPoint.id}`);
    
    const systemPrompt = `You are the PM. You are participating in a Council Decision for point ${decisionPoint.id}: ${decisionPoint.description}.
    You must evaluate this from the perspective of timeline, resource feasibility, and risk management.
    
    Your output must be a JSON object matching the AgentProposal interface:
    {
      "agentId": "${this.id}",
      "role": "PM",
      "proposedAction": "APPROVE_PLAN",
      "payload": { "decision": "APPROVE/REJECT", "comments": "..." },
      "confidence": 0.0 to 1.0,
      "risk": 0.0 to 1.0,
      "reasoning": "Justification based on project management constraints"
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