import { BaseAgent, DecisionContext, AgentDecision } from './base_agent';
import { WorkflowState } from '../core/workflow_manager';
import { ASEOEvent } from '../core/event_bus';
import { DecisionPoint, AgentProposal } from '../planner/types';

export class PerformanceAgent extends BaseAgent {
  public validStates: WorkflowState[] = [WorkflowState.SECURITY_APPROVED];

  constructor(id: string, eventBus: any, graphManager: any, orchestrator: any) {
    super(id, 'Performance', eventBus, graphManager, orchestrator);
  }

  public setupSubscriptions(): void {
    this.eventBus.subscribe('STATE_TRANSITIONED', async (event: ASEOEvent) => {
      const { correlation_id } = event;
      const state = event.payload?.newState;

      if (state === WorkflowState.SECURITY_APPROVED) {
        console.log(`[Performance] Detected SECURITY_APPROVED state for ${correlation_id}. Starting performance profiling...`);
        await this.emitSafe({
          type: 'PERFORMANCE_REQUESTED',
          correlation_id,
          payload: { taskId: correlation_id },
          metadata: { trigger: 'state_transition' }
        });
      }
    });
  }

  public async decide(context: DecisionContext): Promise<AgentDecision | null> {
    const { event } = context;
    if (event.type !== 'PERFORMANCE_REQUESTED') return null;

    const correlationId = event.correlation_id;
    
    const prompt = `You are the Performance Agent. A task (${correlationId}) has passed security and needs performance profiling.
    Analyze the implementation for time/space complexity, bottlenecks, and resource utilization.
    
    Your response must be a JSON object matching the AgentDecision interface:
    {
      "reason": "Performance profiling results",
      "confidence": 0.85,
      "proposal": {
        "agentId": "${this.id}",
        "role": "Performance",
        "proposedAction": "PERFORMANCE_COMPLETE",
        "payload": { 
          "taskId": "${correlationId}",
          "verdict": "PASSED" | "FAILED",
          "metrics": {
            "latency": "...",
            "throughput": "...",
            "memoryFootprint": "..."
          },
          "bottlenecks": [],
          "recommendations": "..."
        },
        "confidence": 0.85,
        "risk": 0.15,
        "reasoning": "Summary of performance analysis"
      }
    }`;

    const response = await this.think({
      systemPrompt: "You are a Performance Engineering Expert.",
      userPrompt: prompt,
      responseFormat: 'json'
    });

    try {
      const decision: AgentDecision = response.structuredData || JSON.parse(response.content);
      
      if (decision.proposal.proposedAction === 'PERFORMANCE_COMPLETE') {
        const payload = decision.proposal.payload;
        await this.createArtifact(
          'PERF_REPORT', 
          `perf_report_${correlationId}`, 
          { 
            verdict: payload.verdict, 
            metrics: payload.metrics, 
            bottlenecks: payload.bottlenecks, 
            recommendations: payload.recommendations 
          }, 
          correlationId
        );
      }

      return decision;
    } catch (e) {
      console.error(`[Performance] Failed to parse LLM response:`, e);
      return null;
    }
  }

  public async propose(correlationId: string, decisionPoint: DecisionPoint): Promise<AgentProposal | null> {
    return null;
  }
}