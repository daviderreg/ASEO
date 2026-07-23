import { EventBus, ASEOEvent, EventType } from '../core/event_bus';
import { GraphManager } from '../core/graph_manager';
import { AgentProposal, DecisionPoint } from '../planner/types';
import { WorkflowState, Orchestrator, VALID_TRANSITIONS } from '../core/orchestrator';
import { llm, LLMRequest, LLMResponse } from '../core/llm_client';

export interface DecisionContext {
  event: ASEOEvent;
  goalId: string;
  graphSnapshot: any;
}

/**
 * V4 Decision: Now purely a proposal.
 * Agents no longer return 'type: PROPOSE' to trigger the orchestrator directly.
 * Instead, they return an AgentProposal that is then arbitrated.
 */
export interface AgentDecision {
  proposal: AgentProposal;
  reason: string;
  confidence: number;
}

export abstract class BaseAgent {
  public id: string;
  public role: string;
  public reputationScore: number = 100;
  protected memory: Map<string, any> = new Map();
  public abstract validStates: WorkflowState[];

  constructor(
    id: string, 
    role: string, 
    protected eventBus: EventBus, 
    protected graphManager: GraphManager,
    protected orchestrator: Orchestrator
  ) {
    this.id = id;
    this.role = role;
    this.loadMemory();
  }

  protected async loadMemory() {
    try {
      const fs = await import('fs/promises');
      const path = `aseo/agents/memory/${this.id}.json`;
      const data = await fs.readFile(path, 'utf8');
      this.memory = new Map(Object.entries(JSON.parse(data)));
    } catch (e) {
      // Memory file doesn't exist yet, start fresh
    }
  }

  protected async saveMemory() {
    try {
      const fs = await import('fs/promises');
      const path = `aseo/agents/memory/${this.id}.json`;
      await fs.mkdir(`aseo/agents/memory`, { recursive: true });
      await fs.writeFile(path, JSON.stringify(Object.fromEntries(this.memory)), 'utf8');
    } catch (e) {
      console.error(`[Agent ${this.role}] Failed to save memory: ${e}`);
    }
  }

  public canExecute(currentState: WorkflowState): boolean {
    return this.validStates.includes(currentState);
  }

  public abstract setupSubscriptions(): void;
  
  /**
   * The Decision Layer: Processes a context and returns a proposal.
   * NOTE: Agents MUST NOT call eventBus.emit() directly in V4.
   */
  public abstract decide(context: DecisionContext): Promise<AgentDecision | null>;

  /**
   * V4 Extension: Proposes a specific solution for a given DecisionPoint.
   */
  public abstract propose(correlationId: string, decisionPoint: DecisionPoint): Promise<AgentProposal | null>;

  /**
   * The Cognitive Core: Interfaces with the LLM to generate a decision or artifact content.
   */
  protected async think(request: { systemPrompt: string, userPrompt: string, responseFormat?: 'json' | 'text' }): Promise<LLMResponse> {
    console.log(`[Agent ${this.role}] Thinking...`);
    return await llm.generate({
      systemPrompt: `You are the ${this.role} agent in an Autonomous Software Engineering Organization. ${request.systemPrompt}`,
      userPrompt: request.userPrompt,
      responseFormat: request.responseFormat
    });
  }

  /**
   * Safely emits an event only if the current state is valid for this agent.
   * This prevents "out-of-phase" events and SAFETY VIOLATIONS by querying the live state.
   */
  protected async emitSafe(event: Partial<ASEOEvent>): Promise<void> {
    const correlationId = event.correlation_id || '';
    const currentState = await this.orchestrator.computeState(correlationId);

    if (currentState === 'MERGED') {
      // Silently ignore events after MERGED to avoid noise from asynchronous handlers
      return;
    }

    if (!this.canExecute(currentState)) {
      // Silently ignore obsolete events to avoid dashboard noise from async race conditions
      return;
    }

    // Hard State-Guard: Validate if this specific event type is allowed in the current state
    if (event.type) {
      const allowedStates = VALID_TRANSITIONS.get(event.type);
      if (allowedStates && !allowedStates.includes(currentState)) {
        // Log as info rather than error, as this is often a race condition in async environments
        console.log(`[Agent ${this.role}] Obsolete Event: ${event.type} ignored in state ${currentState}.`);
        return;
      }
    }
    
    // Ensure mandatory fields are present before emitting
    const finalizedEvent: ASEOEvent = {
      id: event.id || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: event.timestamp || new Date().toISOString(),
      type: event.type as EventType,
      payload: event.payload || {},
      source_agent: event.source_agent || this.id,
      correlation_id: event.correlation_id || '',
      metadata: { 
        timestamp: event.metadata?.timestamp || new Date().toISOString(),
        ...event.metadata 
      }
    };

    await this.eventBus.emit(finalizedEvent);
    await this.saveMemory();
  }

  protected async createArtifact(
    category: string, 
    name: string, 
    content: any, 
    correlationId: string
  ): Promise<string> {
    const artifactId = `${category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.graphManager.updateNode(artifactId, {
      type: category,
      correlation_id: correlationId,
      properties: {
        value: content,
        category: category,
        createdBy: this.id, 
        timestamp: new Date().toISOString() 
      },
      metadata: { createdBy: this.id, timestamp: new Date().toISOString() }
    });
    await this.saveMemory();
    return artifactId;
  }

  protected upsertGraphNode(node: any): void {
    this.graphManager.updateNode(node.id, node);
  }
}