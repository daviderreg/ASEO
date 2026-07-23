import { BaseAgent, DecisionContext, AgentDecision } from './base_agent';
import { WorkflowState } from '../core/workflow_manager';
import { ASEOEvent } from '../core/event_bus';
import { DecisionPoint, AgentProposal } from '../planner/types';

export class SecurityAgent extends BaseAgent {
  public validStates: WorkflowState[] = [WorkflowState.TESTED];

  constructor(id: string, eventBus: any, graphManager: any, orchestrator: any) {
    super(id, 'Security', eventBus, graphManager, orchestrator);
  }

  public setupSubscriptions(): void {
    this.eventBus.subscribe('STATE_TRANSITIONED', async (event: ASEOEvent) => {
      const { correlation_id } = event;
      const state = event.payload?.newState;

      if (state === WorkflowState.TESTED) {
        console.log(`[Security] Detected TESTED state for ${correlation_id}. Starting security audit...`);
        await this.emitSafe({
          type: 'SECURITY_REQUESTED',
          correlation_id,
          payload: { taskId: correlation_id },
          metadata: { trigger: 'state_transition' }
        });
      }
    });
  }

  public async decide(context: DecisionContext): Promise<AgentDecision | null> {
    const { event } = context;
    if (event.type !== 'SECURITY_REQUESTED') return null;

    const correlationId = event.correlation_id;
    
    const prompt = `You are the Security Agent. A task (${correlationId}) has been tested and needs a security audit.
    Analyze the implementation for vulnerabilities (OWASP Top 10, memory leaks, injection, etc.).
    
    Your response must be a JSON object matching the AgentDecision interface:
    {
      "reason": "Security audit findings",
      "confidence": 0.9,
      "proposal": {
        "agentId": "${this.id}",
        "role": "Security",
        "proposedAction": "SECURITY_COMPLETE",
        "payload": { 
          "taskId": "${correlationId}",
          "verdict": "PASSED" | "FAILED",
          "vulnerabilities": [],
          "riskLevel": "Low" | "Medium" | "High" | "Critical",
          "remediation": "..."
        },
        "confidence": 0.9,
        "risk": 0.1,
        "reasoning": "Summary of security posture"
      }
    }`;

    const response = await this.think({
      systemPrompt: "You are a world-class Cybersecurity Expert.",
      userPrompt: prompt,
      responseFormat: 'json'
    });

    try {
      const decision: AgentDecision = response.structuredData || JSON.parse(response.content);
      
      if (decision.proposal.proposedAction === 'SECURITY_COMPLETE') {
        const payload = decision.proposal.payload;
        await this.createArtifact(
          'SECURITY_REPORT', 
          `security_report_${correlationId}`, 
          { 
            verdict: payload.verdict, 
            vulnerabilities: payload.vulnerabilities, 
            riskLevel: payload.riskLevel, 
            remediation: payload.remediation 
          }, 
          correlationId
        );
      }

      return decision;
    } catch (e) {
      console.error(`[Security] Failed to parse LLM response:`, e);
      return null;
    }
  }

  public async propose(correlationId: string, decisionPoint: DecisionPoint): Promise<AgentProposal | null> {
    return null;
  }
}