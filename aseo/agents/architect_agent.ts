import { BaseAgent, DecisionContext, AgentDecision } from './base_agent';
import { EventBus, EventType } from '../core/event_bus';
import { AgentProposal, DecisionPoint } from '../planner/types';
import { ADRManager } from '../core/adr_manager';
import { WorkflowState, Orchestrator } from '../core/orchestrator';
import { GraphManager } from '../core/graph_manager';

export class ArchitectAgent extends BaseAgent {
  public validStates: WorkflowState[] = ["ANALYZED", "ARCHITECTED", "PLANNED"];

  constructor(id: string, eventBus: EventBus, graphManager: GraphManager, orchestrator: Orchestrator, private adrManager: ADRManager) {
    super(id, "Architect", eventBus, graphManager, orchestrator);
  }

  public setupSubscriptions(): void {
    this.eventBus.subscribe("STATE_TRANSITIONED", (event) => this.handleStateTransition(event));
  }

  private async handleStateTransition(event: any) {
    const newState = event.payload.newState;
    const correlationId = event.correlation_id;

    if (newState === "ARCHITECTED") {
      console.log(`[Architect] State moved to ARCHITECTED. Designing technical blueprint for ${correlationId}`);
      
      const events = await this.eventBus.getEventsByCorrelationId(correlationId);
      const analysisEvent = events.find(e => e.type === "ANALYSIS_COMPLETE");
      
      const context = {
        event: analysisEvent || { 
          id: 'fallback', 
          timestamp: new Date().toISOString(), 
          type: 'ANALYSIS_COMPLETE' as any, 
          payload: { analysis: 'Fallback analysis' }, 
          source_agent: 'SYSTEM', 
          correlation_id: correlationId, 
          metadata: {} 
        },
        goalId: correlationId,
        graphSnapshot: await this.graphManager.getSnapshot()
      };

      const decision = await this.decide(context);
      if (decision) {
        // Record architectural decision as ADR
        await this.adrManager.createADR({
          title: `Architecture for ${correlationId}`,
          context: `Analysis complete for goal ${correlationId}. Proposed pattern: ${decision.proposal.payload.pattern}`,
          decision: decision.proposal.payload.rationale,
          alternatives: ["Monolith", "Service-Oriented Architecture"],
          consequences: ["Increased modularity", "Potential communication overhead"],
          risks: ["Complexity of micro-kernel coordination"],
          relatedEvents: [analysisEvent?.id || 'fallback'],
          authorAgent: this.id
        }, correlationId);

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
    console.log(`[Architect] Performing LLM-backed architecture design for correlation: ${context.goalId}`);
    
    const systemPrompt = `You are the System Architect of an Autonomous Software Engineering Organization.
    Your role is to translate strategic requirements into a technical blueprint.
    You must define the architecture pattern, components, API interfaces, and data flow.

    STRICT WORKFLOW RULE:
    Your current phase is TECHNICAL DESIGN. 
    The ONLY valid proposedAction for this phase is "ARCHITECTURE_PROPOSED".
    Do NOT propose implementation plans or code. Your goal is to finalize the ARCHITECTURE artifact.
    
    Your output must be a JSON object matching the AgentDecision interface:
    {
      "reason": "Technical justification for the chosen architecture",
      "confidence": 0.0 to 1.0,
      "proposal": {
        "agentId": "${this.id}",
        "role": "Architect",
        "proposedAction": "ARCHITECTURE_PROPOSED",
        "payload": { 
          "pattern": "Design Pattern Name", 
          "components": ["Comp1", "Comp2"],
          "rationale": "Why this pattern is best",
          "adr": {
            "title": "Primary Architectural Decision",
            "context": "Context for the decision",
            "decision": "The decision made",
            "alternatives": [],
            "consequences": [],
            "risks": []
          }
        },
        "confidence": 0.0 to 1.0,
        "risk": 0.0 to 1.0,
        "reasoning": "Summary of technical trade-offs"
      }
    }`;

    const userPrompt = `Strategic Requirements & Goal Context: ${JSON.stringify(context.graphSnapshot)}
    Correlation ID: ${context.goalId}`;

    const result = await this.think({
      systemPrompt,
      userPrompt,
      responseFormat: 'json'
    });

    if (result.structuredData) {
      const data = result.structuredData;
      const payload = data.proposal.payload;

      // Record the LLM-generated ADR in the ADR manager
      await this.adrManager.createADR({
        title: payload.adr.title,
        context: payload.adr.context,
        decision: payload.adr.decision,
        alternatives: payload.adr.alternatives,
        consequences: payload.adr.consequences,
        risks: payload.adr.risks,
        relatedEvents: [],
        authorAgent: this.id
      }, context.goalId);

      // Persist the full architecture as a verifiable artifact
      await this.createArtifact('ARCHITECTURE', 'Technical_Blueprint', payload, context.goalId);
      
      return data as AgentDecision;
    }

    return null;
  }

  public async propose(correlationId: string, decisionPoint: DecisionPoint): Promise<AgentProposal | null> {
    console.log(`[Architect] Generating LLM-backed proposal for ${decisionPoint.id}`);
    
    const systemPrompt = `You are the Architect. You are participating in a Council Decision for point ${decisionPoint.id}: ${decisionPoint.description}.
    You must defend the technical viability, scalability, and maintainability of the proposed design.
    
    Your output must be a JSON object matching the AgentProposal interface:
    {
      "agentId": "${this.id}",
      "role": "Architect",
      "proposedAction": "APPROVE_ARCHITECTURE",
      "payload": { "decision": "APPROVE/REJECT", "comments": "Technical justification" },
      "confidence": 0.0 to 1.0,
      "risk": 0.0 to 1.0,
      "reasoning": "Detailed architectural analysis"
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