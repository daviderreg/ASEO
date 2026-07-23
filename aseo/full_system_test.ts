import { Orchestrator } from './core/orchestrator';
import { EventBus } from './core/event_bus';
import { GraphManager } from './core/graph_manager';

async function runFullSystemTest() {
  console.log("🚀 Starting ASEO Full System Stress Test...");

  try {
    // 1. Setup Core
    const eventBus = new EventBus();
    const graphManager = new GraphManager();
    const orchestrator = new Orchestrator(eventBus, graphManager);

    console.log("\n--- Phase 1: Goal Submission ---");
    const goal = "Implement a simple HelloWorld module to verify ASEO pipeline";
    const correlationId = await orchestrator.submitGoal(goal, 'HIGH');
    console.log(`Goal submitted. Correlation ID: ${correlationId}`);

    // 2. Verify Initial State
    const initialState = await orchestrator.computeState(correlationId);
    console.log(`Initial state: ${initialState} (Expected: NEW)`);

    // 3. Simulate the pipeline events to test the state machine and gates
    // In a real run, agents would emit these. Here we simulate a "happy path" to verify the Orchestrator's integrity.
    
    const eventsToSimulate = [
      { type: "ANALYSIS_COMPLETE", agent: "PM", payload: { status: 'SUCCESS' } },
      // Architecture Phase
      { type: "ARCHITECTURE_PROPOSED", agent: "ARCHITECT", payload: { adr: 'ADR-001', value: 'System Blueprint' } },
      { type: "ARCHITECTURE_APPROVED", agent: "CTO", payload: { status: 'APPROVED', value: 'Approved by CTO' } }, 
      { type: "ARCHITECTURE_APPROVED", agent: "ARCHITECT", payload: { status: 'APPROVED', value: 'Approved by Architect' } },
      { type: "ARCHITECTURE_APPROVED", agent: "SECURITY", payload: { status: 'APPROVED', value: 'Approved by Security' } },
      // Planning Phase
      { type: "PLAN_PROPOSED", agent: "PM", payload: { graph: 'TaskGraph_001', value: 'Implementation Plan' } },
      { type: "PLAN_APPROVED", agent: "CTO", payload: { status: 'APPROVED', value: 'Approved by CTO' } },
      { type: "PLAN_APPROVED", agent: "PM", payload: { status: 'APPROVED', value: 'Approved by PM' } },
      { type: "PLAN_APPROVED", agent: "ARCHITECT", payload: { status: 'APPROVED', value: 'Approved by Architect' } },
      // Implementation Phase
      { type: "IMPLEMENTATION_COMPLETE", agent: "DEVELOPER", payload: { status: 'COMPLETE', value: 'Code implemented' } },
      // Review Phase
      { type: "REVIEW_PASSED", agent: "REVIEWER", payload: { status: 'PASSED', value: 'Code review passed' } },
      // Testing Phase
      { type: "QA_PASSED", agent: "QA", payload: { testCoverage: 0.95, status: 'VERIFIED', value: 'All tests passed' } },
      // Security Phase
      { type: "SECURITY_PASSED", agent: "SECURITY", payload: { criticalVulnerabilities: 0, status: 'APPROVED', value: 'Security scan clean' } },
      // Performance Phase
      { type: "PERFORMANCE_PASSED", agent: "PERFORMANCE", payload: { status: 'PASSED', value: 'Performance metrics within limits' } },
      // Documentation Phase
      { type: "DOCS_COMPLETE", agent: "DOCUMENTATION", payload: { status: 'COMPLETE', value: 'Documentation finished' } },
      // Merge Phase
      { type: "MERGE_APPROVED", agent: "CTO", payload: { status: 'APPROVED', decision: 'MERGE_NOW' } },
    ];

    for (const e of eventsToSimulate) {
      console.log(`Simulating ${e.type} from ${e.agent}...`);
      await eventBus.emit({
        type: e.type as any,
        payload: { ...e.payload, correlation_id: correlationId },
        source_agent: e.agent,
        correlation_id: correlationId,
        metadata: { timestamp: new Date().toISOString() }
      });
      
      const state = await orchestrator.computeState(correlationId);
      console.log(`Current state: ${state}`);
    }

    const finalState = await orchestrator.computeState(correlationId);
    if (finalState === 'MERGED') {
      console.log("\n✅ SYSTEM TEST PASSED: Pipeline reached MERGED state.");
    } else {
      console.error(`\n❌ SYSTEM TEST FAILED: Pipeline stopped at ${finalState}`);
    }

  } catch (error) {
    console.error("\n💥 CRITICAL SYSTEM ERROR during test:");
    console.error(error);
    process.exit(1);
  }
}

runFullSystemTest();