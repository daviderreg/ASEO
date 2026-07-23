import { BaseAgent, DecisionContext, AgentDecision } from './base_agent';
import { WorkflowState } from '../core/workflow_manager';
import { ASEOEvent } from '../core/event_bus';
import { DecisionPoint, AgentProposal } from '../planner/types';

export class ResearchAgent extends BaseAgent {
  public validStates: WorkflowState[] = [WorkflowState.NEW, WorkflowState.ANALYZED];

  constructor(id: string, eventBus: any, graphManager: any, orchestrator: any) {
    super(id, 'Research', eventBus, graphManager, orchestrator);
  }

  public setupSubscriptions(): void {
    this.eventBus.subscribe('RESEARCH_REQUESTED', async (event: ASEOEvent) => {
      console.log(`[Research] Research request received for ${event.correlation_id}`);
    });
  }

  public async decide(context: DecisionContext): Promise<AgentDecision | null> {
    const { event } = context;
    if (event.type !== 'RESEARCH_REQUESTED') return null;

    const correlationId = event.correlation_id;
    const query = event.payload?.query || "General research on the task goals";
    
    const prompt = `You are the Research Agent. You have been tasked to research the following: ${query}
    Provide a comprehensive research report including existing libraries, industry standards, and potential technical hurdles.
    
    Your response must be a JSON object matching the AgentDecision interface:
    {
      "reason": "Research findings",
      "confidence": 0.9,
      "proposal": {
        "agentId": "${this.id}",
        "role": "Research",
        "proposedAction": "RESEARCH_COMPLETE",
        "payload": { 
          "taskId": "${correlationId}",
          "findings": [],
          "sources": [],
          "conclusion": "..."
        },
        "confidence": 0.9,
        "risk": 0.1,
        "reasoning": "Summary of research results"
      }
    }`;

    const response = await this.think({
      systemPrompt: "You are a world-class Technical Researcher.",
      userPrompt: prompt,
      responseFormat: 'json'
    });

    try {
      const decision: AgentDecision = response.structuredData || JSON.parse(response.content);
      
      if (decision.proposal.proposedAction === 'RESEARCH_COMPLETE') {
        const payload = decision.proposal.payload;
        await this.createArtifact(
          'RESEARCH_REPORT', 
          `research_${correlationId}`, 
          { 
            findings: payload.findings, 
            sources: payload.sources, 
            conclusion: payload.conclusion 
          }, 
          correlationId
        );
      }

      return decision;
    } catch (e) {
      console.error(`[Research] Failed to parse LLM response:`, e);
      return null;
    }
  }

  public async propose(correlationId: string, decisionPoint: DecisionPoint): Promise<AgentProposal | null> {
    return null;
  }
}