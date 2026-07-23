import { BaseAgent, DecisionContext, AgentDecision } from './base_agent';
import { WorkflowState } from '../core/workflow_manager';
import { ASEOEvent } from '../core/event_bus';
import { DecisionPoint, AgentProposal } from '../planner/types';

export class QAAgent extends BaseAgent {
  public validStates: WorkflowState[] = [WorkflowState.REVIEWED];

  constructor(id: string, eventBus: any, graphManager: any, orchestrator: any) {
    super(id, 'QA', eventBus, graphManager, orchestrator);
  }

  public setupSubscriptions(): void {
    this.eventBus.subscribe('STATE_TRANSITIONED', async (event: ASEOEvent) => {
      const { correlation_id } = event;
      const state = event.payload?.newState;

      if (state === WorkflowState.REVIEWED) {
        console.log(`[QA] Detected REVIEWED state for ${correlation_id}. Starting test suite...`);
        await this.emitSafe({
          type: 'QA_REQUESTED',
          correlation_id,
          payload: { taskId: correlation_id },
          metadata: { trigger: 'state_transition' }
        });
      }
    });
  }

  public async decide(context: DecisionContext): Promise<AgentDecision | null> {
    const { event } = context;
    if (event.type !== 'QA_REQUESTED') return null;

    const correlationId = event.correlation_id;
    
    const prompt = `You are the QA Agent. A task (${correlationId}) has been reviewed and is ready for testing.
    Verify the implementation against requirements. Run simulated tests and provide a detailed test report.
    
    Your response must be a JSON object matching the AgentDecision interface:
    {
      "reason": "Test execution results",
      "confidence": 0.95,
      "proposal": {
        "agentId": "${this.id}",
        "role": "QA",
        "proposedAction": "QA_COMPLETE",
        "payload": { 
          "taskId": "${correlationId}",
          "verdict": "PASSED" | "FAILED",
          "testCases": [],
          "bugsFound": 0,
          "coverage": "percentage"
        },
        "confidence": 0.95,
        "risk": 0.05,
        "reasoning": "Summary of test results"
      }
    }`;

    const response = await this.think({
      systemPrompt: "You are a meticulous Quality Assurance Engineer.",
      userPrompt: prompt,
      responseFormat: 'json'
    });

    try {
      const decision: AgentDecision = response.structuredData || JSON.parse(response.content);
      
      if (decision.proposal.proposedAction === 'QA_COMPLETE') {
        const payload = decision.proposal.payload;
        await this.createArtifact(
          'TEST_REPORT', 
          `test_report_${correlationId}`, 
          { 
            verdict: payload.verdict, 
            testCases: payload.testCases, 
            bugsFound: payload.bugsFound, 
            coverage: payload.coverage 
          }, 
          correlationId
        );
      }

      return decision;
    } catch (e) {
      console.error(`[QA] Failed to parse LLM response:`, e);
      return null;
    }
  }

  public async propose(correlationId: string, decisionPoint: DecisionPoint): Promise<AgentProposal | null> {
    return null;
  }
}