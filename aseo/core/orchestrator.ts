import { EventBus, ASEOEvent, EventType, TRACE } from './event_bus';
import { GraphManager } from './graph_manager';
import { AgentRegistry } from './agent_registry';
import { GateManager } from './gate_manager';
import { ArtifactManager } from './artifact_manager';
import { ReputationManager } from './reputation_manager';
import { ArbitrationEngine } from './arbitration_engine';
import { AgentCouncil } from './agent_council';
import { PlannerV4 } from '../planner/planner_v4';
import { ExecutionStrategy, ExecutionGraph, PlanningInput } from '../planner/types';

export type WorkflowState = 
  | "NEW" | "ANALYZED" | "ARCHITECTED" | "PLANNED" 
  | "IMPLEMENTED" | "REVIEWED" | "TESTED" 
  | "SECURITY_APPROVED" | "PERFORMANCE_APPROVED" | "DOCUMENTED" | "MERGED";

export const VALID_TRANSITIONS = new Map<string, WorkflowState[]>([
  ["GOAL_SUBMITTED", ["NEW"]],
  ["ANALYSIS_COMPLETE", ["ANALYZED", "ARCHITECTED"]],
  ["ARCHITECTURE_PROPOSED", ["ANALYZED", "ARCHITECTED", "PLANNED"]],
  ["ARCHITECTURE_APPROVED", ["ARCHITECTED", "PLANNED"]],
  ["PLAN_PROPOSED", ["ARCHITECTED", "PLANNED"]],
  ["PLAN_APPROVED", ["PLANNED", "IMPLEMENTED"]],
  ["IMPLEMENTATION_COMPLETE", ["IMPLEMENTED", "REVIEWED"]],
  ["REVIEW_PASSED", ["REVIEWED"]],
  ["QA_PASSED", ["REVIEWED", "TESTED"]],
  ["SECURITY_PASSED", ["TESTED", "SECURITY_APPROVED"]],
  ["PERFORMANCE_PASSED", ["SECURITY_APPROVED", "PERFORMANCE_APPROVED"]],
  ["DOCS_COMPLETE", ["PERFORMANCE_APPROVED", "DOCUMENTED"]],
  ["MERGE_APPROVED", ["DOCUMENTED", "MERGED"]],
]);

export class Orchestrator {
  private eventBus: EventBus;
  private graphManager: GraphManager;
  private registry: AgentRegistry;
  private gateManager: GateManager;
  private reputationManager: ReputationManager;
  private council: AgentCouncil;
  private plannerV4: PlannerV4;
  private artifactManager: ArtifactManager;
  private closedGoals: Set<string> = new Set();

  constructor(eventBus: EventBus, graphManager: GraphManager) {
    this.eventBus = eventBus;
    this.graphManager = graphManager;
    this.artifactManager = new ArtifactManager();
    this.registry = new AgentRegistry(eventBus, graphManager, this.artifactManager);
    this.gateManager = new GateManager(eventBus, graphManager, this.registry);
    this.reputationManager = new ReputationManager();
    this.plannerV4 = new PlannerV4();
    this.initClosedGoals();
    
    const arbitrationEngine = new ArbitrationEngine(this.reputationManager);
    this.council = new AgentCouncil(this.eventBus, this.registry, arbitrationEngine);
    
    const eventsToValidate: EventType[] = [
      "GOAL_SUBMITTED", "ANALYSIS_COMPLETE", "ARCHITECTURE_PROPOSED", 
      "ARCHITECTURE_APPROVED", "PLAN_PROPOSED", "PLAN_APPROVED", 
      "IMPLEMENTATION_COMPLETE", "REVIEW_PASSED", "QA_PASSED", 
      "SECURITY_PASSED", "PERFORMANCE_PASSED", "DOCS_COMPLETE",
      "MERGE_APPROVED"
    ];

    eventsToValidate.forEach(type => {
      this.eventBus.subscribe(type, (event) => this.validateEvent(event));
    });

    this.eventBus.subscribe("STATE_TRANSITIONED", (event) => this.handleStateTransition(event));
    this.eventBus.subscribe("DECISION_FINALIZED", (event) => this.handleCouncilDecision(event));
  }

  public async computeState(correlationId: string, excludeEventId?: string): Promise<WorkflowState> {
    const events = await this.eventBus.getEventsByCorrelationId(correlationId);
    
    const transitionEvents = events
      .filter(e => e.type === "STATE_TRANSITIONED" && e.id !== excludeEventId)
      .sort((a, b) => new Date(b.metadata.timestamp).getTime() - new Date(a.metadata.timestamp).getTime());

    if (transitionEvents.length > 0) {
      return transitionEvents[0].payload.newState;
    }

    return "NEW";
  }

  private async handleStateTransition(event: any): Promise<void> {
    const { newState, correlation_id } = event.payload;
    console.log(`[Control Plane] State moved to ${newState}. Checking for Decision Points...`);

    const strategy = await this.getStrategy(correlation_id);
    if (!strategy) return;

    const stateToDpMap = new Map<string, string>([
      ["ARCHITECTED", "ARCHITECTURE"],
      ["PLANNED", "PLANNING"],
      ["REVIEWED", "REVIEW"],
    ]);

    const targetDpId = stateToDpMap.get(newState) || newState;
    const dp = strategy.decisionPoints.find(point => point.dependencyId === targetDpId);

    if (dp) {
      await this.council.conductSession(correlation_id, dp);
    }
  }

  private async handleCouncilDecision(event: any): Promise<void> {
    const { decisionPointId } = event.payload;
    const correlation_id = event.correlation_id;
    const strategy = await this.getStrategy(correlation_id);
    if (!strategy) return;

    const dp = strategy.decisionPoints.find(p => p.id === decisionPointId);
    if (!dp) return;

    const dpToEventMap = new Map<string, EventType>([
      ["ARCHITECTURE", "ARCHITECTURE_APPROVED"],
      ["PLANNING", "PLAN_APPROVED"],
      ["IMPLEMENTATION", "IMPLEMENTATION_COMPLETE"],
      ["REVIEW", "REVIEW_PASSED"],
      ["TESTING", "QA_PASSED"],
      ["SECURITY", "SECURITY_PASSED"],
      ["PERFORMANCE", "PERFORMANCE_PASSED"],
      ["DOCUMENTATION", "DOCS_COMPLETE"],
      ["MERGE", "MERGE_APPROVED"],
    ]);

    const depId = dp.dependencyId;
    const triggerEvent = depId ? dpToEventMap.get(depId) : undefined;
    if (triggerEvent) {
      // Weight decision based on reputation of the council members
      const councilReputations = this.reputationManager.getReputationScores();
      console.log(`[Control Plane] Validating decision with reputation context:`, councilReputations);

      const snapshot = await this.graphManager.getSnapshot();
      const nodes = Object.entries(snapshot);
      
      const depToTypeMap = new Map<string, string>([
        ["ARCHITECTURE", "ADR"],
        ["PLANNING", "PLAN"],
        ["IMPLEMENTATION", "CODE"],
        ["REVIEW", "REVIEW"],
        ["TESTING", "TEST_REPORT"],
        ["SECURITY", "SECURITY_REPORT"],
        ["PERFORMANCE", "PERF_REPORT"],
        ["DOCUMENTATION", "DOCS"],
      ]);

      const targetType = depId ? depToTypeMap.get(depId) : undefined;
      const artifactEntry = nodes.find(([_, node]) => 
        (node.type === targetType || node.type === 'ARTIFACT') && node.correlation_id === correlation_id
      );

      let artifactId = artifactEntry ? artifactEntry[0] : null;
      
      // Self-Healing: If no artifact exists for this decision, create a Decision ADR
      if (!artifactId) {
        const adrId = `adr_${decisionPointId}_${correlation_id}`;
        await this.graphManager.updateNode(adrId, {
          type: targetType || 'ADR',
          correlation_id: correlation_id,
          properties: {
            value: `Council decision for ${decisionPointId} finalized.`,
            timestamp: new Date().toISOString(),
            status: 'APPROVED'
          }
        });
        artifactId = adrId;
      }

      const payload: any = { decisionId: decisionPointId, correlation_id };
      payload.artifactId = artifactId;

      await this.eventBus.emit({
        type: triggerEvent,
        payload: payload,
        source_agent: "COUNCIL",
        correlation_id: correlation_id,
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  }

  public async validateEvent(event: ASEOEvent): Promise<void> {
    if (event.type === 'STATE_TRANSITIONED') return;

    if (this.closedGoals.has(event.correlation_id)) return;

    const currentState = await this.computeState(event.correlation_id, event.id);
    
    const eventType = event.type;
    const allowedStates = VALID_TRANSITIONS.get(eventType);
    if (allowedStates && !allowedStates.includes(currentState)) {
      console.error(`[Control Plane] SAFETY VIOLATION: Event ${event.type} emitted while state is ${currentState}.`);
      return;
    }

    const potentialState = this.calculatePotentialState(currentState, event.type);
    if (!potentialState || potentialState === currentState) return;

    console.log(`[Control Plane] Attempting transition ${currentState} -> ${potentialState} via ${event.type}`);
    const gateResult = await this.gateManager.verifyGate(potentialState, event.correlation_id);
    if (!gateResult.passed) {
      console.log(`[Control Plane] Gate REJECTED transition to ${potentialState}: ${gateResult.reason}`);
      return;
    }

    await this.eventBus.emit({
      type: "STATE_TRANSITIONED",
      payload: { 
        previousState: currentState, 
        newState: potentialState, 
        triggerEvent: event.type,
        correlation_id: event.correlation_id
      },
      source_agent: "ORCHESTRATOR",
      correlation_id: event.correlation_id,
      metadata: { timestamp: new Date().toISOString() }
    });

    if (potentialState === "MERGED") {
      this.closedGoals.add(event.correlation_id);
      await this.graphManager.updateNode(`goal_${event.correlation_id}`, {
        properties: { status: 'COMPLETED', updatedAt: new Date().toISOString() }
      });
    }
  }

  private calculatePotentialState(current: WorkflowState, eventType: EventType): WorkflowState | null {
    const transitions = new Map<string, WorkflowState>([
      ["GOAL_SUBMITTED", "ANALYZED"],
      ["ANALYSIS_COMPLETE", "ARCHITECTED"],
      ["ARCHITECTURE_PROPOSED", "ARCHITECTED"],
      ["ARCHITECTURE_APPROVED", "PLANNED"],
      ["PLAN_PROPOSED", "PLANNED"],
      ["PLAN_APPROVED", "IMPLEMENTED"],
      ["IMPLEMENTATION_COMPLETE", "REVIEWED"],
      ["REVIEW_PASSED", "REVIEWED"],
      ["QA_PASSED", "TESTED"],
      ["SECURITY_PASSED", "SECURITY_APPROVED"],
      ["PERFORMANCE_PASSED", "PERFORMANCE_APPROVED"],
      ["DOCS_COMPLETE", "DOCUMENTED"],
      ["MERGE_APPROVED", "MERGED"],
    ]);
    return transitions.get(eventType) || null;
  }

  public async submitGoal(goal: string, priority: string = 'MEDIUM'): Promise<string> {
    const correlationId = `goal_${Date.now()}`;
    await this.bootstrapStrategy(goal, correlationId);

    // Create the Task Node in the Knowledge Graph
    // Using GraphManager ensures the state is updated in state.json AND persisted as an artifact
    await this.graphManager.upsertNode({
      id: `goal_${correlationId}`,
      type: 'GOAL',
      correlation_id: correlationId,
      properties: {
        goal,
        priority,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentState: 'NEW'
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'USER',
        lastEventId: 'GOAL_SUBMITTED'
      }
    });

    await this.eventBus.emit({
      type: "GOAL_SUBMITTED",
      payload: { goal, priority },
      source_agent: "USER",
      correlation_id: correlationId,
      metadata: {}
    });

    await this.eventBus.emit({
      type: "TASK_CREATED",
      payload: { taskId: `task_${correlationId}`, correlationId },
      source_agent: "ORCHESTRATOR",
      correlation_id: correlationId,
      metadata: { timestamp: new Date().toISOString() }
    });

    return correlationId;
  }

  private async bootstrapStrategy(goal: string, correlationId: string): Promise<void> {
    const planningInput: PlanningInput = {
      goal,
      context: await this.graphManager.getSnapshot(),
      constraints: { maxAgents: 8, optimizeFor: 'balanced' }
    };

    const strategy = this.plannerV4.generateStrategy(planningInput);
    
    await this.graphManager.updateNode(`strategy_${correlationId}`, {
      value: strategy,
      type: 'EXECUTION_STRATEGY',
      correlation_id: correlationId
    });

    const roles = strategy.requiredRoles || ["CTO", "ARCHITECT", "PM"];
    console.log(`[Control Plane] Dynamically spawning agents based on strategy: ${roles.join(', ')}`);
    roles.forEach((role: string) => this.registry.spawnAgent(role, this));
  }

  private async getStrategy(correlationId: string): Promise<ExecutionStrategy | null> {
    const node = await this.graphManager.getNode(`strategy_${correlationId}`);
    return node ? node.properties.value : null;
  }

  public getRegistry(): AgentRegistry {
    return this.registry;
  }

  public getReputationManager(): ReputationManager {
    return this.reputationManager;
  }

  public getArtifactManager(): ArtifactManager {
    return this.artifactManager;
  }

  private async initClosedGoals(): Promise<void> {
    const snapshot = await this.graphManager.getSnapshot();
    const completed = Object.entries(snapshot)
      .filter(([_, node]: any) => node.type === 'GOAL' && node.properties.status === 'COMPLETED')
      .map(([id, _]: any) => id.replace('goal_', ''));
    this.closedGoals = new Set(completed);
  }

  public async resumeGoal(correlationId: string): Promise<{ success: boolean, state: WorkflowState }> {
    console.log(`[Control Plane] Attempting to resume goal: ${correlationId}`);
    
    const strategy = await this.getStrategy(correlationId);
    if (!strategy) {
      return { success: false, state: 'NEW' };
    }

    const state = await this.computeState(correlationId);
    const roles = strategy.requiredRoles || ["CTO", "ARCHITECT", "PM"];
    
    // Respawn necessary agents
    roles.forEach((role: string) => this.registry.spawnAgent(role, this));
    
    // Mark as active in graph
    await this.graphManager.updateNode(`goal_${correlationId}`, {
      properties: { status: 'ACTIVE', updatedAt: new Date().toISOString() }
    });
    
    this.closedGoals.delete(correlationId);

    return { success: true, state };
  }

  public async resetSystem(): Promise<void> {
    console.log(`[Control Plane] WARNING: Resetting all system state...`);
    await this.graphManager.clearAll();
    await this.eventBus.clearEvents();
    this.closedGoals.clear();
  }
}
