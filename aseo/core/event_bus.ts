import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ArtifactManager } from './artifact_manager';

export type EventType = 
  | "ALL"
  | "GOAL_SUBMITTED" 
  | "ANALYSIS_STARTED" 
  | "ANALYSIS_COMPLETE" 
  | "ARCHITECTURE_PROPOSED" 
  | "ARCHITECTURE_APPROVED" 
  | "PLAN_PROPOSED" 
  | "PLAN_APPROVED" 
  | "IMPLEMENTATION_STARTED" 
  | "IMPLEMENTATION_COMPLETE" 
  | "REVIEW_STARTED" 
  | "REVIEW_COMPLETE" 
  | "REVIEW_PASSED"
  | "REVIEW_REJECTED"
  | "QA_STARTED" 
  | "QA_COMPLETE" 
  | "QA_PASSED"
  | "QA_FAILED"
  | "SECURITY_STARTED" 
  | "SECURITY_COMPLETE" 
  | "SECURITY_PASSED"
  | "SECURITY_FAILED"
  | "PERFORMANCE_STARTED" 
  | "PERFORMANCE_COMPLETE" 
  | "PERFORMANCE_PASSED"
  | "PERFORMANCE_FAILED"
  | "DOCS_STARTED" 
  | "DOCS_COMPLETE" 
  | "ADR_CREATED"
  | "ADR_STATUS_CHANGED"
  | "STATE_TRANSITIONED"
  | "REVIEW_REQUESTED"
  | "RESEARCH_REQUESTED"
  | "QA_REQUESTED"
  | "SECURITY_REQUESTED"
  | "PERFORMANCE_REQUESTED"
  | "DOCS_REQUESTED"
  | "RESEARCH_COMPLETE"
  | "GRAPH_UPDATE_REQUESTED"
  | "MERGE_STARTED" 
  | "MERGE_COMPLETE"
  | "APPROVE_PERFORMANCE"
  | "APPROVE_SECURITY"
  | "APPROVE_QA"
  | "APPROVE_REVIEW"
  | "APPROVE_STRATEGY"
  | "APPROVE_ARCHITECTURE"
  | "MERGE_APPROVED"
  | "DECISION_FINALIZED"
  | "TASK_CREATED";

export interface ASEOEvent {
  id: string;
  timestamp: string;
  type: EventType;
  payload: any;
  source_agent: string;
  correlation_id: string;
  target_module?: string;
  metadata: Record<string, any>;
}

export type EventHandler = (event: ASEOEvent) => Promise<void>;

export const TRACE = true;

export class EventBus {
  private eventLogDir: string;
  private subscribers: Map<EventType, EventHandler[]> = new Map();
  private artifactManager: ArtifactManager;

  constructor() {
    this.artifactManager = new ArtifactManager();
    this.eventLogDir = path.join(process.cwd(), 'aseo', 'events');
    if (!fs.existsSync(this.eventLogDir)) {
      fs.mkdirSync(this.eventLogDir, { recursive: true });
    }
  }

  /**
   * Subscribe to a specific event type.
   */
  public subscribe(type: EventType, handler: EventHandler) {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, []);
    }
    this.subscribers.get(type)!.push(handler);
  }

  /**
   * Publishes an event: persists it first, then notifies subscribers.
   */
  public async emit(eventData: Omit<ASEOEvent, 'id' | 'timestamp'>): Promise<ASEOEvent> {
    const fullEvent: ASEOEvent = {
      ...eventData,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      metadata: eventData.metadata || {},
    };

    // 1. Persist (Event Sourcing via ArtifactManager)
    this.artifactManager.persistEvent(fullEvent).catch(err => 
      console.error(`[EventBus] Event persistence failed for ${fullEvent.id}:`, err)
    );
    
    // Unified Event Log Mirroring
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\x1b[36m[${timestamp}] 🪞 EVENT MIRROR\x1b[0m`);
    console.log(`  Type:   \x1b[33m${fullEvent.type}\x1b[0m`);
    console.log(`  From:   ${fullEvent.source_agent}`);
    console.log(`  Goal:   ${fullEvent.correlation_id}`);
    if (fullEvent.payload && Object.keys(fullEvent.payload).length > 0) {
      console.log(`  Payload: ${JSON.stringify(fullEvent.payload, null, 2)}`);
    }
    console.log(`--------------------------------------------------`);

    if (TRACE) {
      console.log(`[TRACE] state=UNKNOWN event=${fullEvent.type} goal=${fullEvent.correlation_id}`);
    }
    await new Promise(r => setImmediate(r));

    // 2. Notify Subscribers (Asynchronous)
    const specificHandlers = this.subscribers.get(fullEvent.type) || [];
    const allHandlers = this.subscribers.get("ALL") || [];
    const handlers = [...specificHandlers, ...allHandlers];
    
    if (TRACE) {
      console.log(`[EVENT-BUS] Notifying ${handlers.length} handlers for event ${fullEvent.type}`);
    }

    for (const handler of handlers) {
      try {
        await handler(fullEvent);
      } catch (err) {
        console.error(`[EventBus] Error in handler for ${fullEvent.type}:`, err);
      }
    }

    return fullEvent;
  }

  public async getEventsByCorrelationId(correlationId: string): Promise<ASEOEvent[]> {
    const files = fs.readdirSync(this.eventLogDir);
    const events: ASEOEvent[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = fs.readFileSync(path.join(this.eventLogDir, file), 'utf-8');
        const event = JSON.parse(content) as ASEOEvent;
        if (event.correlation_id === correlationId) {
          events.push(event);
        }
      }
    }

    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public async getLastEventOfType(correlationId: string, type: EventType): Promise<ASEOEvent | null> {
    const events = await this.getEventsByCorrelationId(correlationId);
    return events.filter(e => e.type === type).pop() || null;
  }

  public async getAllEvents(): Promise<ASEOEvent[]> {
    const files = fs.readdirSync(this.eventLogDir);
    const events: ASEOEvent[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = fs.readFileSync(path.join(this.eventLogDir, file), 'utf-8');
        events.push(JSON.parse(content) as ASEOEvent);
      }
    }

    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public async clearEvents(): Promise<void> {
    const files = fs.readdirSync(this.eventLogDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(this.eventLogDir, file));
      }
    }
  }
}
