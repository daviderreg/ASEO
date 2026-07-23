import { generateExecutionGraph } from './planner_v3';
import { PlanningInput } from './types';

const testCases: { name: string, input: PlanningInput }[] = [
  {
    name: "Distributed System",
    input: {
      goal: "Implement a high-performance distributed cache system with LRU eviction",
      context: {},
      constraints: { maxAgents: 8, optimizeFor: "quality" }
    }
  },
  {
    name: "Simple Backend",
    input: {
      goal: "Create a simple REST API for a todo list",
      context: {},
      constraints: { maxAgents: 5, optimizeFor: "speed" }
    }
  },
  {
    name: "Ambiguous/Research Goal",
    input: {
      goal: "Explore potential AI options",
      context: {},
      constraints: { maxAgents: 8, optimizeFor: "balanced" }
    }
  }
];

function verifyGraph(name: string, graph: any) {
  console.log(`\n--- Verifying ${name} ---`);
  console.log(`Nodes: ${graph.nodes.length}, Edges: ${graph.edges.length}`);
  
  // 1. Max 8 nodes
  if (graph.nodes.length > 8) throw new Error("Constraint Violation: More than 8 nodes");

  // 2. Mandatory Nodes
  const agents = graph.nodes.map((n: any) => n.agent);
  if (!agents.includes("CTO")) throw new Error("Mandatory Node Missing: CTO");
  if (!agents.includes("DEVELOPER")) throw new Error("Mandatory Node Missing: DEVELOPER");

  // 3. Determinism check (conceptual here, we will run it twice)
  console.log("✅ Structure Verified");
}

function runTests() {
  try {
    for (const tc of testCases) {
      const g1 = generateExecutionGraph(tc.input);
      const g2 = generateExecutionGraph(tc.input);
      
      if (JSON.stringify(g1) !== JSON.stringify(g2)) {
        throw new Error(`Determinism Violation in ${tc.name}`);
      }
      
      verifyGraph(tc.name, g1);
      console.log("Result:", JSON.stringify(g1, null, 2));
    }
    console.log("\n🚀 ALL PLANNER V3 TESTS PASSED");
  } catch (e: any) {
    console.error(`❌ TEST FAILED: ${e.message}`);
    process.exit(1);
  }
}

runTests();