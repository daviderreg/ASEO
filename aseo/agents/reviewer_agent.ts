import { BaseAgent, DecisionContext, AgentDecision } from './base_agent';
import { WorkflowState } from '../core/workflow_manager';
import { ASEOEvent } from '../core/event_bus';
import { DecisionPoint, AgentProposal } from '../planner/types';

export class ReviewerAgent extends BaseAgent {
  public validStates: WorkflowState[] = [WorkflowState.IMPLEMENTED];

  constructor(id: string, eventBus: any, graphManager: any, orchestrator: any) {
    super(id, 'Reviewer', eventBus, graphManager, orchestrator);
  }

  public setupSubscriptions(): void {
    this.eventBus.subscribe('STATE_TRANSITIONED', async (event: ASEOEvent) => {
      const { correlation_id } = event;
      const state = event.payload?.newState;

      if (state === WorkflowState.IMPLEMENTED) {
        console.log(`[Reviewer] Detected IMPLEMENTED state for ${correlation_id}. Triggering review...`);
        
        // In V4, agents can't just "act", they must be prompted by the orchestrator or 
        // react by emitting a request for a decision point.
        // For this automated gate, we emit a "REVIEW_REQUESTED" event to signal the need for a review.
        await this.emitSafe({
          type: 'REVIEW_REQUESTED',
          correlation_id,
          payload: { taskId: correlation_id },
          metadata: { trigger: 'state_transition' }
        });
      }
    });
  }

  public async decide(context: DecisionContext): Promise<AgentDecision | null> {
    const { event, goalId } = context;
    if (event.type !== 'REVIEW_REQUESTED') return null;

    const correlationId = event.correlation_id;
    
    const prompt = `You are the Reviewer Agent. A task (${correlationId}) has been implemented. 
    Review the implementation for correctness, maintainability, and adherence to architecture.
    
    Your response must be a JSON object matching the AgentDecision interface:
    {
      "reason": "Detailed review findings",
      "confidence": 0.9,
      "proposal": {
        "agentId": "${this.id}",
        "role": "Reviewer",
        "proposedAction": "REVIEW_COMPLETE",
        "payload": { 
          "taskId": "${correlationId}",
          "verdict": "APPROVED" | "REJECTED",
          "comments": "...",
          "suggestions": []
        },
        "confidence": 0.9,
        "risk": 0.1,
        "reasoning": "Summary of review"
      }
    }`;

    const response = await this.think({
      systemPrompt: "You are an expert software reviewer.",
      userPrompt: prompt,
      responseFormat: 'json'
    });

    try {
      const decision: AgentDecision = response.structuredData || JSON.parse(response.content);
      
      // Persist the review as an artifact before returning the proposal
      if (decision.proposal.proposedAction === 'REVIEW_COMPLETE') {
        const payload = decision.proposal.payload;
        await this.createArtifact(
          'REVIEW', 
          `review_${correlationId}`, 
          { 
            verdict: payload.verdict, 
            comments: payload.comments, 
            suggestions: payload.suggestions 
          }, 
          correlationId
        );
      }

      return decision;
    } catch (e) {
      console.error(`[Reviewer] Failed to parse LLM response:`, e);
      return null;
    }
  }

  public async propose(correlationId: string, decisionPoint: DecisionPoint): Promise<AgentProposal | null> {
    // Simplified: Reviewer only operates via the decide() flow in this version
    return null;
  }
}