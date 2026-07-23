import { EventBus, ASEOEvent, EventType } from './event_bus';
import { GraphManager, NodeId } from './graph_manager';

export class GraphSyncService {
  constructor(private eventBus: EventBus, private graphManager: GraphManager) {
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    // Subscribe to all events to maintain the Knowledge Graph
    this.eventBus.subscribe("ALL", (event) => this.syncEventToGraph(event));
  }

  private async syncEventToGraph(event: ASEOEvent): Promise<void> {
    const { type, correlation_id, payload, source_agent } = event;
    if (!correlation_id) return;

    console.log(`[GraphSync] Syncing event ${type} for ${correlation_id}`);

    // 1. Ensure the Goal node exists
    const goalNodeId = `goal_${correlation_id}`;
    this.graphManager.upsertNode({
      id: goalNodeId,
      type: 'GOAL',
      correlation_id,
      properties: {
        description: payload.goal || 'Unknown Goal',
        priority: payload.priority || 'MEDIUM',
        status: 'ACTIVE'
      },
      metadata: {
        createdBy: 'USER',
        lastEventId: event.id
      } as any
    });

    // 2. Handle specific event types
    switch (type) {
      case 'STATE_TRANSITIONED':
        this.handleStateTransition(event, goalNodeId);
        break;
      case 'PLAN_PROPOSED':
      case 'ARCHITECTURE_PROPOSED':
      case 'IMPLEMENTATION_COMPLETE':
      case 'QA_PASSED':
      case 'SECURITY_PASSED':
      case 'PERFORMANCE_PASSED':
      case 'DOCS_COMPLETE':
        this.handleArtifactEvent(event, goalNodeId);
        break;
      case 'DECISION_FINALIZED':
        this.handleDecisionEvent(event, goalNodeId);
        break;
    }
  }

  private handleStateTransition(event: ASEOEvent, goalNodeId: NodeId): void {
    const { newState, previousState } = event.payload;
    const stateNodeId = `state_${event.correlation_id}_${newState}`;

    this.graphManager.upsertNode({
      id: stateNodeId,
      type: 'WORKFLOW_STATE',
      correlation_id: event.correlation_id,
      properties: {
        state: newState,
        transitionedFrom: previousState,
        timestamp: event.metadata.timestamp
      }
    });

    this.graphManager.addEdge(goalNodeId, stateNodeId, 'HAS_STATE');
  }

  private handleArtifactEvent(event: ASEOEvent, goalNodeId: NodeId): void {
    const artifactId = `art_${event.id}`;
    const typeMap: Record<string, string> = {
      'PLAN_PROPOSED': 'PLAN',
      'ARCHITECTURE_PROPOSED': 'ARCHITECTURE',
      'IMPLEMENTATION_COMPLETE': 'CODE',
      'QA_PASSED': 'TEST_REPORT',
      'SECURITY_PASSED': 'SECURITY_REPORT',
      'PERFORMANCE_PASSED': 'PERF_REPORT',
      'DOCS_COMPLETE': 'DOCS'
    };

    this.graphManager.upsertNode({
      id: artifactId,
      type: typeMap[event.type] || 'ARTIFACT',
      correlation_id: event.correlation_id,
      properties: { ...event.payload },
      metadata: {
        createdBy: event.source_agent,
        lastEventId: event.id
      } as any
    });

    this.graphManager.addEdge(goalNodeId, artifactId, 'PRODUCED');
  }

  private handleDecisionEvent(event: ASEOEvent, goalNodeId: NodeId): void {
    const decisionId = `decision_${event.id}`;
    this.graphManager.upsertNode({
      id: decisionId,
      type: 'DECISION',
      correlation_id: event.correlation_id,
      properties: { ...event.payload },
      metadata: {
        createdBy: 'COUNCIL',
        lastEventId: event.id
      } as any
    });

    this.graphManager.addEdge(goalNodeId, decisionId, 'DECIDED');
  }
}