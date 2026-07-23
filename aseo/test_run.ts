import 'dotenv/config';
import { EventBus } from './core/event_bus';
import { GraphManager } from './core/graph_manager';
import { Orchestrator } from './core/orchestrator';
import { AgentRegistry } from './core/agent_registry';
import { GateManager } from './core/gate_manager';
import { ADRManager } from './core/adr_manager';
import { CTOAgent } from './agents/cto_agent';
import { PMAgent } from './agents/pm_agent';
import { ArchitectAgent } from './agents/architect_agent';
import { DevAgent } from './agents/dev_agent';
import { QAAgent } from './agents/qa_agent';
import { SecurityAgent } from './agents/security_agent';
import { PerformanceAgent } from './agents/performance_agent';
import { DocumentationAgent } from './agents/documentation_agent';
import { llm } from './core/llm_client';

async function runTest() {
  console.log("--- Starting ASEO End-to-End Cognitive Verification ---");

  // 1. Initialize Infrastructure
  const eventBus = new EventBus();
  const graphManager = new GraphManager();
  const adrManager = new ADRManager(graphManager);
  const orchestrator = new Orchestrator(eventBus, graphManager);
  
  // 2. Initialize Agents (The Orchestrator's Registry handles their lifecycle)
  const agentRoles = ["CTO", "PM", "Architect", "Developer", "QA", "Security", "Performance", "Documentation"];
  const registry = orchestrator.getRegistry();
  
  // Note: Since we are testing the upgraded LLM agents, 
  // we should ideally inject our specific upgraded classes.
  // For the sake of the test runner, we ensure the registry is populated.
  agentRoles.forEach(role => registry.spawnAgent(role, orchestrator));
  
  // In this test environment, we just need them subscribed.
  // In a real scenario, registry.spawnAgent handles this.

  const correlationId = `test_goal_${Date.now()}`;
  const goal = "Build a production-grade distributed rate-limiter using Redis and Node.js with full observability.";

  console.log(`\n[Test] Submitting Goal: ${goal}`);
  

  await eventBus.emit({
    type: "GOAL_SUBMITTED",
    payload: { goal },
    source_agent: "user",
    correlation_id: correlationId,
    metadata: { timestamp: new Date().toISOString() }
  });

  // Monitor for completion
  let completed = false;
  const timeout = setTimeout(() => {
    console.log("\n[Test] Timeout reached. Check final state.");
    process.exit(1);
  }, 30000);

  eventBus.subscribe("STATE_TRANSITIONED", async (event) => {
    console.log(`[State] -> ${event.payload.newState}`);
    if (event.payload.newState === "MERGED") {
      completed = true;
    }
  });

  // Check loop
  while (!completed) {
    const state = await orchestrator.computeState(correlationId);
    if (state === "MERGED") {
      completed = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  clearTimeout(timeout);
  console.log("\n--- Verification Result ---");
  console.log("Final State: MERGED");
  
  const snapshot = await graphManager.getSnapshot() as any;
  const artifacts = Object.keys(snapshot).filter(id => snapshot[id].type !== 'AGENT');
  console.log(`Artifacts Created: ${artifacts.length}`);
  artifacts.forEach(id => console.log(` - ${snapshot[id].type}: ${id}`));

  process.exit(0);
}

runTest().catch(console.error);