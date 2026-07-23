import 'dotenv/config';
import { EventBus } from './aseo/core/event_bus';
import { GraphManager } from './aseo/core/graph_manager';
import { Orchestrator } from './aseo/core/orchestrator';
import { AgentRegistry } from './aseo/core/agent_registry';
import { ADRManager } from './aseo/core/adr_manager';
import { GraphSyncService } from './aseo/core/graph_sync_service';
import { CTOAgent } from './aseo/agents/cto_agent';
import { ArchitectAgent } from './aseo/agents/architect_agent';
import { PMAgent } from './aseo/agents/pm_agent';
import { DevAgent } from './aseo/agents/dev_agent';
import { ReviewerAgent } from './aseo/agents/reviewer_agent';
import { QAAgent } from './aseo/agents/qa_agent';
import { SecurityAgent } from './aseo/agents/security_agent';
import { PerformanceAgent } from './aseo/agents/performance_agent';
import { DocumentationAgent } from './aseo/agents/documentation_agent';
import { ResearchAgent } from './aseo/agents/research_agent';
import { startDashboardServer } from './aseo/dashboard/server';

async function runASEOTest() {
  console.log("=== Initializing ASEO V4 System Verification ===");

  const eventBus: EventBus = new EventBus();
  const graphManager: GraphManager = new GraphManager();
  const graphSync = new GraphSyncService(eventBus, graphManager);
  const adrManager = new ADRManager(graphManager);
  
  const orchestrator = new Orchestrator(
    eventBus, 
    graphManager
  );
  const registry = orchestrator.getRegistry();

  // Start Dashboard Server with real-time components
  await startDashboardServer({
    eventBus,
    graphManager,
    reputationManager: orchestrator.getReputationManager(),
    artifactManager: orchestrator.getArtifactManager(),
    orchestrator
  });

  // Register all agents into the system
    const agents = [
      new CTOAgent('cto_01', eventBus, graphManager, orchestrator),
      new ArchitectAgent('arch_01', eventBus, graphManager, orchestrator, adrManager),
      new PMAgent('pm_01', eventBus, graphManager, orchestrator),
      new DevAgent('dev_01', eventBus, graphManager, orchestrator),
      new ReviewerAgent('rev_01', eventBus, graphManager, orchestrator),
      new QAAgent('qa_01', eventBus, graphManager, orchestrator),
      new SecurityAgent('sec_01', eventBus, graphManager, orchestrator),
      new PerformanceAgent('perf_01', eventBus, graphManager, orchestrator),
      new DocumentationAgent('doc_01', eventBus, graphManager, orchestrator),
      new ResearchAgent('res_01', eventBus, graphManager, orchestrator),
    ];

  agents.forEach(agent => {
    registry.registerAgent(agent);
  });

   console.log("\n[Test] Submitting Goal: 'Mission 3: Self-Documenting Framework'");
   const correlationId = await orchestrator.submitGoal("Mission 3: Self-Documenting Framework", "CRITICAL");

  // We will now monitor the event bus for state transitions
  // Since this is a simulated environment, we can wait for the chain of events to complete
  let currentState = "NEW";
  const targetState = "MERGED";
  
  // In a real system, we'd use a promise or event listener. 
  // Here we will wait a bit to let the asynchronous event chain resolve.
  console.log("\n[Test] Monitoring Workflow Progression...");
  
  // Timeout after 30 seconds if not reached
  const timeoutId = setTimeout(() => {
    console.error("\n=== FAILURE: Workflow timed out before reaching MERGED state ===");
  }, 30000);

  const checkInterval = setInterval(async () => {
    currentState = await orchestrator.computeState(correlationId);
    console.log(`[Current Workflow State]: ${currentState}`);
    
    if (currentState === targetState) {
      console.log("\n=== SUCCESS: Goal reached the MERGED state! ===");
      clearInterval(checkInterval);
      clearTimeout(timeoutId);
      return;
    }
  }, 1000);
}

runASEOTest().catch(err => {
  console.error("Test failed with error:", err);
});
