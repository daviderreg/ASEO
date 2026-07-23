import { ArtifactManager } from './artifact_manager';
import { EventBus } from './event_bus';

export interface ADR {
  id: string;
  type: 'ADR';
  title: string;
  context: string;
  decision: string;
  alternatives: string[];
  consequences: string[];
  risks: string[];
  status: 'PROPOSED' | 'ACCEPTED' | 'SUPERSEDED' | 'DEPRECATED';
  timestamp: string;
  relatedEvents: string[];
  authorAgent: string;
}

export class ADRManager {
  constructor(private artifactManager: ArtifactManager, private eventBus: EventBus) {}

  async createADR(data: Omit<ADR, 'id' | 'timestamp' | 'status' | 'type'>, correlationId: string): Promise<ADR> {
    const id = `ADR-${Date.now()}`;
    const adr: ADR = {
      ...data,
      id,
      type: 'ADR',
      status: 'PROPOSED',
      timestamp: new Date().toISOString(),
      relatedEvents: [correlationId],
    };

    await this.artifactManager.persistNode(id, adr);
    
    await this.eventBus.emit({
      type: 'ADR_CREATED',
      payload: { adrId: id, title: adr.title },
      source_agent: data.authorAgent,
      correlation_id: correlationId,
      metadata: { action: 'create_adr' },
    });

    return adr;
  }

  async updateADRStatus(id: string, status: ADR['status'], authorAgent: string, correlationId: string): Promise<void> {
    const adrs = await this.artifactManager.listArtifacts('ADR');
    const adr = adrs.find(a => a.id === id) as ADR | undefined;
    if (!adr) throw new Error(`ADR ${id} not found`);

    adr.status = status;
    await this.artifactManager.persistNode(id, adr);

    await this.eventBus.emit({
      type: 'ADR_STATUS_CHANGED',
      payload: { adrId: id, newStatus: status },
      source_agent: authorAgent,
      correlation_id: correlationId,
      metadata: { action: 'update_adr_status' },
    });
  }

  async getADRsByTask(taskId: string): Promise<ADR[]> {
    const allADRs = await this.artifactManager.listArtifacts('ADR');
    return allADRs.filter(adr => {
      const a = adr as ADR;
      return a.relatedEvents?.includes(taskId) || a.context?.includes(taskId);
    }) as ADR[];
  }
}