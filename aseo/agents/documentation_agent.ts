import { BaseAgent, DecisionContext, AgentDecision } from './base_agent';
import { EventBus, EventType } from '../core/event_bus';
import { AgentProposal, DecisionPoint } from '../planner/types';
import { WorkflowState, Orchestrator } from '../core/orchestrator';
import { GraphManager } from '../core/graph_manager';

export class DocumentationAgent extends BaseAgent {
  public validStates: WorkflowState[] = ["PERFORMANCE_APPROVED", "DOCUMENTED"];

  constructor(id: string, eventBus: EventBus, graphManager: GraphManager, orchestrator: Orchestrator) {
    super(id, "DOCUMENTATION", eventBus, graphManager, orchestrator);
  }

  public setupSubscriptions(): void {
    this.eventBus.subscribe("STATE_TRANSITIONED", (event) => this.handleStateTransition(event));
  }

  private async handleStateTransition(event: any) {
    const newState = event.payload.newState;
    const correlationId = event.correlation_id;

    if (newState === "DOCUMENTED") {
      console.log(`[Docs] State moved to DOCUMENTED. Synthesizing knowledge for ${correlationId}`);
      
      const events = await this.eventBus.getEventsByCorrelationId(correlationId);
      const perfPassedEvent = events.find(e => e.type === "PERFORMANCE_PASSED");

      const context = {
        event: perfPassedEvent || {
          id: 'fallback',
          timestamp: new Date().toISOString(),
          type: 'PERFORMANCE_PASSED' as any,
          payload: { status: 'Fallback performance' },
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
    console.log(`[Docs] Performing LLM-backed knowledge synthesis for correlation: ${context.goalId}`);
    
    const systemPrompt = `You are the Documentation Engineer of an Autonomous Software Engineering Organization.
    Your role is to synthesize all artifacts from the project lifecycle into a final, comprehensive knowledge base.
    You must create a System Manual, API Specifications, and a Traceability Matrix that maps Goals -> Architecture -> Implementation -> Verification.
    
    Your output must be a JSON object matching the AgentDecision interface:
    {
      "reason": "Summary of the documentation synthesis process",
      "confidence": 0.0 to 1.0,
      "proposal": {
        "agentId": "${this.id}",
        "role": "DOCUMENTATION",
        "proposedAction": "DOCS_COMPLETE",
        "payload": { 
          "systemManual": "Comprehensive text describing the system",
          "apiSpec": { "endpoints": [] },
          "traceabilityMatrix": { "goalId": ["archId", "implId", "testId"] },
          "status": "FINISHED"
        },
        "confidence": 0.0 to 1.0,
        "risk": 0.0 to 1.0,
        "reasoning": "Verification that all components are fully documented"
      }
    }`;

    const userPrompt = `Full Knowledge Graph Snapshot for Synthesis: ${JSON.stringify(context.graphSnapshot)}
    Correlation ID: ${context.goalId}`;

    const result = await this.think({
      systemPrompt,
      userPrompt,
      responseFormat: 'json'
    });

    if (result.structuredData) {
      const data = result.structuredData;
      
      // Persist the final documentation as a verifiable artifact
      await this.createArtifact('DOCS', `final_docs_${context.goalId}`, data.proposal.payload, context.goalId);
      
      return data as AgentDecision;
    }

    return null;
  }

  public async propose(correlationId: string, decisionPoint: DecisionPoint): Promise<AgentProposal | null> {
    console.log(`[Docs] Generating LLM-backed proposal for ${decisionPoint.id}`);
    
    const systemPrompt = `You are the Documentation Engineer. You are participating in a Council Decision for point ${decisionPoint.id}: ${decisionPoint.description}.
    You must verify that the project documentation is complete, accurate, and provides enough detail for a human operator to maintain the system.
    
    Your output must be a JSON object matching the AgentProposal interface:
    {
      "agentId": "${this.id}",
      "role": "DOCUMENTATION",
      "proposedAction": "APPROVE_DOCS",
      "payload": { "decision": "APPROVE/REJECT", "comments": "Documentation review details" },
      "confidence": 0.0 to 1.0,
      "risk": 0.0 to 1.0,
      "reasoning": "Detailed analysis of documentation coverage"
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