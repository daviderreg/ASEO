import { BaseAgent } from '../agents/base_agent';
import { EventBus } from './event_bus';
import { GraphManager } from './graph_manager';
import { Orchestrator } from './orchestrator';
import { CTOAgent } from '../agents/cto_agent';
import { PMAgent } from '../agents/pm_agent';
import { ArchitectAgent } from '../agents/architect_agent';
import { DevAgent } from '../agents/dev_agent';
import { ReviewerAgent } from '../agents/reviewer_agent';
import { QAAgent } from '../agents/qa_agent';
import { SecurityAgent } from '../agents/security_agent';
import { PerformanceAgent } from '../agents/performance_agent';
import { DocumentationAgent } from '../agents/documentation_agent';
import { ResearchAgent } from '../agents/research_agent';
import { ADRManager } from './adr_manager';

export class AgentRegistry {
  private agents: Map<string, BaseAgent> = new Map();

  constructor(private eventBus: EventBus, private graphManager: GraphManager, private artifactManager: any) {}

  public registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
    agent.setupSubscriptions();
  }

  public getAgent(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }

  public getAgentsByRoles(roles: string[]): BaseAgent[] {
    return Array.from(this.agents.values()).filter(agent => 
      roles.includes(agent.role)
    );
  }

  public spawnAgent(role: string, orchestrator: Orchestrator): void {
    const normalizedRole = role.toUpperCase();
    console.log(`[Registry] Spawning agent for role: ${normalizedRole}`);
    
    const adrManager = new ADRManager(this.artifactManager, this.eventBus);
    let agent: BaseAgent;

    switch (normalizedRole) {
      case 'CTO':
        agent = new CTOAgent(`cto_${Date.now()}`, this.eventBus, this.graphManager, orchestrator);
        break;
      case 'PM':
        agent = new PMAgent(`pm_${Date.now()}`, this.eventBus, this.graphManager, orchestrator);
        break;
      case 'ARCHITECT':
        agent = new ArchitectAgent(`arch_${Date.now()}`, this.eventBus, this.graphManager, orchestrator, adrManager);
        break;
      case 'DEVELOPER':
        agent = new DevAgent(`dev_${Date.now()}`, this.eventBus, this.graphManager, orchestrator);
        break;
      case 'REVIEWER':
        agent = new ReviewerAgent(`rev_${Date.now()}`, this.eventBus, this.graphManager, orchestrator);
        break;
      case 'QA':
        agent = new QAAgent(`qa_${Date.now()}`, this.eventBus, this.graphManager, orchestrator);
        break;
      case 'SECURITY':
        agent = new SecurityAgent(`sec_${Date.now()}`, this.eventBus, this.graphManager, orchestrator);
        break;
      case 'PERFORMANCE':
        agent = new PerformanceAgent(`perf_${Date.now()}`, this.eventBus, this.graphManager, orchestrator);
        break;
      case 'DOCUMENTATION':
        agent = new DocumentationAgent(`doc_${Date.now()}`, this.eventBus, this.graphManager, orchestrator);
        break;
      case 'RESEARCH':
        agent = new ResearchAgent(`res_${Date.now()}`, this.eventBus, this.graphManager, orchestrator);
        break;
      default:
        throw new Error(`Unknown role: ${role}`);
    }

    this.registerAgent(agent);
  }
}