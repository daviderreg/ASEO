import { EventBus, ASEOEvent } from './event_bus';
import { GraphManager, GraphNode } from './graph_manager';
import * as fs from 'fs';
import * as path from 'path';

export interface AuditEntry {
  timestamp: string;
  eventType: string;
  agent: string;
  action: string;
  outcome: string;
  graphChanges?: string[];
}

export interface AuditTrail {
  goalId: string;
  startTime: string;
  endTime: string;
  finalStatus: string;
  history: AuditEntry[];
}

export class AuditLog {
  private eventBus: EventBus;
  private graphManager: GraphManager;
  private auditDir: string;

  constructor() {
    this.eventBus = new EventBus();
    this.graphManager = new GraphManager();
    this.auditDir = path.join(process.cwd(), 'aseo', 'logs', 'audits');
    if (!fs.existsSync(this.auditDir)) {
      fs.mkdirSync(this.auditDir, { recursive: true });
    }
  }

  /**
   * Generates a detailed audit trail for a specific goal (correlationId).
   */
  public async generateTrail(correlationId: string): Promise<AuditTrail> {
    const events = await this.eventBus.getEventsByCorrelationId(correlationId);
    if (events.length === 0) {
      throw new Error(`No events found for correlationId: ${correlationId}`);
    }

    const history: AuditEntry[] = events.map(event => {
      return {
        timestamp: event.timestamp,
        eventType: event.type,
        agent: event.source_agent,
        action: this.describeEventAction(event),
        outcome: this.describeEventOutcome(event),
        graphChanges: this.extractGraphChanges(event)
      };
    });

    const startTime = events[0].timestamp;
    const endTime = events[events.length - 1].timestamp;
    const finalStatus = this.determineFinalStatus(events);

    return {
      goalId: correlationId,
      startTime,
      endTime,
      finalStatus,
      history
    };
  }

  private describeEventAction(event: ASEOEvent): string {
    switch (event.type) {
      case 'GOAL_SUBMITTED': return 'User submitted a new software engineering goal';
      case 'ANALYSIS_STARTED': return 'Started analyzing requirements';
      case 'ANALYSIS_COMPLETE': return 'Completed requirement analysis';
      case 'ARCHITECTURE_PROPOSED': return 'Proposed a system architecture';
      case 'ARCHITECTURE_APPROVED': return 'Approved the proposed architecture';
      case 'PLAN_PROPOSED': return 'Proposed a technical implementation plan';
      case 'PLAN_APPROVED': return 'Approved the implementation plan';
      case 'IMPLEMENTATION_STARTED': return 'Started implementing the code';
      case 'IMPLEMENTATION_COMPLETE': return 'Completed the implementation';
      case 'REVIEW_STARTED': return 'Started code review process';
      case 'REVIEW_COMPLETE': return 'Completed code review';
      case 'REVIEW_PASSED': return 'Code review passed';
      case 'REVIEW_REJECTED': return 'Code review rejected';
      case 'QA_STARTED': return 'Started quality assurance testing';
      case 'QA_COMPLETE': return 'Completed QA testing';
      case 'QA_PASSED': return 'QA tests passed';
      case 'QA_FAILED': return 'QA tests failed';
      case 'SECURITY_STARTED': return 'Started security audit';
      case 'SECURITY_COMPLETE': return 'Completed security audit';
      case 'SECURITY_PASSED': return 'Security audit passed';
      case 'SECURITY_FAILED': return 'Security audit failed';
      case 'PERFORMANCE_STARTED': return 'Started performance analysis';
      case 'PERFORMANCE_COMPLETE': return 'Completed performance analysis';
      case 'PERFORMANCE_PASSED': return 'Performance criteria met';
      case 'PERFORMANCE_FAILED': return 'Performance criteria not met';
      case 'DOCS_STARTED': return 'Started generating documentation';
      case 'DOCS_COMPLETE': return 'Completed documentation';
      case 'ADR_CREATED': return 'Generated an Architectural Decision Record';
      case 'STATE_TRANSITIONED': return 'Moved workflow state forward';
      case 'RESEARCH_COMPLETE': return 'Completed background research';
      case 'GRAPH_UPDATE_REQUESTED': return 'Requested update to the knowledge graph';
      case 'MERGE_STARTED': return 'Started merging changes to main';
      case 'MERGE_COMPLETE': return 'Successfully merged changes';
      case 'APPROVE_PERFORMANCE': return 'Manually approved performance metrics';
      case 'APPROVE_SECURITY': return 'Manually approved security findings';
      case 'APPROVE_QA': return 'Manually approved QA results';
      case 'APPROVE_REVIEW': return 'Manually approved code review';
      case 'APPROVE_STRATEGY': return 'Manually approved strategic direction';
      case 'APPROVE_ARCHITECTURE': return 'Manually approved architecture';
      case 'MERGE_APPROVED': return 'Approved final merge to production';
      case 'DECISION_FINALIZED': return 'Finalized project decision';
      default: return `Executed action: ${event.type}`;
    }
  }

  private describeEventOutcome(event: ASEOEvent): string {
    const payload = event.payload;
    if (payload && typeof payload === 'object' && payload.result) {
      return payload.result;
    }
    if (payload && typeof payload === 'object' && payload.outcome) {
      return payload.outcome;
    }
    return 'Completed successfully';
  }

  private extractGraphChanges(event: ASEOEvent): string[] {
    const changes: string[] = [];
    const payload = event.payload;
    
    if (payload && typeof payload === 'object') {
      if (payload.node_id && payload.type) {
        changes.push(`Upserted node [${payload.type}] ${payload.node_id}`);
      }
      if (payload.edge) {
        changes.push(`Added edge: ${payload.edge.source} -> ${payload.edge.target} (${payload.edge.relation})`);
      }
    }
    
    return changes;
  }

  private determineFinalStatus(events: ASEOEvent[]): string {
    const types = events.map(e => e.type);
    if (types.includes('MERGE_COMPLETE')) return 'MERGED';
    if (types.includes('REVIEW_REJECTED') || types.includes('QA_FAILED') || types.includes('SECURITY_FAILED')) return 'FAILED';
    
    const lastEvent = events[events.length - 1];
    return `STALLED_AT_${lastEvent.type}`;
  }

  /**
   * Saves the audit trail to a machine-readable JSON file and a human-readable Markdown file.
   */
  public async persistAudit(correlationId: string): Promise<void> {
    const trail = await this.generateTrail(correlationId);
    
    // Save JSON
    const jsonPath = path.join(this.auditDir, `${correlationId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(trail, null, 2));

    // Save Markdown
    const mdPath = path.join(this.auditDir, `${correlationId}.md`);
    let mdContent = `# Audit Trail: ${correlationId}\n\n`;
    mdContent += `**Start Time:** ${trail.startTime}\n`;
    mdContent += `**End Time:** ${trail.endTime}\n`;
    mdContent += `**Final Status:** ${trail.finalStatus}\n\n`;
    mdContent += `## Timeline\n\n`;
    mdContent += `| Timestamp | Agent | Event | Action | Outcome |\n`;
    mdContent += `|---|---|---|---|---|\n`;
    
    trail.history.forEach(entry => {
      mdContent += `| ${entry.timestamp} | ${entry.agent} | ${entry.eventType} | ${entry.action} | ${entry.outcome} |\n`;
    });

    mdContent += `\n\n## Graph Transitions\n`;
    trail.history.forEach(entry => {
      if (entry.graphChanges && entry.graphChanges.length > 0) {
        mdContent += `\n**${entry.timestamp} (${entry.agent}):**\n`;
        entry.graphChanges.forEach(change => {
          mdContent += `- ${change}\n`;
        });
      }
    });

    fs.writeFileSync(mdPath, mdContent);
  }
}
