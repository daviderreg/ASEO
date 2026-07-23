import { 
  PlanningInput, 
  ExecutionGraph, 
  GraphNode, 
  GraphEdge, 
  GoalType, 
  AgentStats 
} from './types';

/**
 * Planner V3: Dynamic Execution Graph Generator
 * A pure functional module for generating deterministic agent execution DAGs.
 */

// Static Agent Capability Map for deterministic scoring
const AGENT_CAPABILITIES: Record<string, { skill: number; reliability: number; speed: number; cost: number }> = {
  "CTO": { skill: 1.0, reliability: 0.9, speed: 0.8, cost: 0.2 },
  "ARCHITECT": { skill: 0.9, reliability: 0.8, speed: 0.7, cost: 0.1 },
  "PM": { skill: 0.8, reliability: 0.9, speed: 0.9, cost: 0.1 },
  "DEVELOPER": { skill: 0.9, reliability: 0.7, speed: 0.9, cost: 0.3 },
  "REVIEWER": { skill: 0.7, reliability: 0.9, speed: 0.8, cost: 0.1 },
  "QA": { skill: 0.8, reliability: 0.9, speed: 0.6, cost: 0.2 },
  "SECURITY": { skill: 0.9, reliability: 0.9, speed: 0.5, cost: 0.2 },
  "PERFORMANCE": { skill: 0.8, reliability: 0.8, speed: 0.7, cost: 0.2 },
  "DOCUMENTATION": { skill: 0.7, reliability: 0.9, speed: 0.9, cost: 0.1 },
  "RESEARCH": { skill: 0.9, reliability: 0.7, speed: 0.6, cost: 0.3 },
};

function classifyGoal(goal: string): GoalType {
  const text = goal.toLowerCase();
  if (text.includes("distributed") || text.includes("cluster") || text.includes("scaling")) return "distributed";
  if (text.includes("ai") || text.includes("ml") || text.includes("llm") || text.includes("model")) return "ai_ml";
  if (text.includes("frontend") || text.includes("ui") || text.includes("react") || text.includes("vue")) return "frontend";
  if (text.includes("pipeline") || text.includes("etl") || text.includes("data flow")) return "data_pipeline";
  if (text.includes("api") || text.includes("database") || text.includes("backend") || text.includes("server")) return "backend";
  return "mixed";
}

function calculateScore(agentId: string, goalType: GoalType, optimizeFor: string): number {
  const cap = AGENT_CAPABILITIES[agentId];
  if (!cap) return 0;

  // Skill match is influenced by goal type (simplified for determinism)
  let skillMatch = cap.skill;
  if (goalType === "distributed" && (agentId === "PERFORMANCE" || agentId === "ARCHITECT")) skillMatch += 0.1;
  if (goalType === "ai_ml" && agentId === "RESEARCH") skillMatch += 0.2;

  const score = 
    (skillMatch * 0.5) + 
    (cap.reliability * 0.3) + 
    (cap.speed * 0.2) - 
    (cap.cost * 0.1);

  return score;
}

export function generateExecutionGraph(input: PlanningInput): ExecutionGraph {
  const { goal, constraints } = input;
  const maxAgents = constraints.maxAgents || 8;
  const optimizeFor = constraints.optimizeFor || "balanced";

  const goalType = classifyGoal(goal);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 1. Deterministic Agent Selection
  const scoredAgents: AgentStats[] = Object.keys(AGENT_CAPABILITIES)
    .map(id => ({
      id,
      skill_match: AGENT_CAPABILITIES[id].skill,
      reliability: AGENT_CAPABILITIES[id].reliability,
      speed: AGENT_CAPABILITIES[id].speed,
      cost_penalty: AGENT_CAPABILITIES[id].cost
    }))
    .map(agent => ({
      ...agent,
      // We use the calculated score for filtering, though not returned in AgentStats interface
      // but stored in a local variable for sorting
    }));

  // Sort agents by a deterministic scoring function
  const sortedAgents = Object.keys(AGENT_CAPABILITIES).sort((a, b) => 
    calculateScore(b, goalType, optimizeFor) - calculateScore(a, goalType, optimizeFor)
  );

  // 2. Build DAG following Mandatory Rules
  const selectedAgents = new Set<string>();

  // RULE: CTO MUST ALWAYS EXIST
  selectedAgents.add("CTO");

  // RULE: DEV must exist if implementation is required (basically always for a goal)
  selectedAgents.add("DEVELOPER");

  // RULE: ARCHITECT depends on CTO
  if (sortedAgents.includes("ARCHITECT")) selectedAgents.add("ARCHITECT");

  // RULE: QA must depend on DEV
  if (selectedAgents.has("DEVELOPER")) selectedAgents.add("QA");

  // RULE: SECURITY based on goal
  if (["backend", "distributed", "mixed"].includes(goalType)) {
    selectedAgents.add("SECURITY");
  }

  // RULE: PERFORMANCE based on goal
  if (["distributed", "ai_ml"].includes(goalType) || goal.toLowerCase().includes("performance")) {
    selectedAgents.add("PERFORMANCE");
  }

  // RULE: RESEARCH if ambiguous (simple heuristic: goal length < 20 or keywords)
  if (goal.length < 20 || goal.toLowerCase().includes("research") || goal.toLowerCase().includes("explore")) {
    selectedAgents.add("RESEARCH");
  }

  // Fill remaining slots up to maxAgents using top scored agents
  for (const agentId of sortedAgents) {
    if (selectedAgents.size >= maxAgents) break;
    selectedAgents.add(agentId);
  }

  // 3. Map selected agents to Graph Nodes
  const agentToNodeId = new Map<string, string>();
  let priorityCounter = 0;

  // Strict Order: CTO -> Research -> Architect -> Dev -> (QA/Security/Perf) -> Docs
  const order: string[] = ["CTO", "RESEARCH", "ARCHITECT", "PM", "DEVELOPER", "REVIEWER", "QA", "SECURITY", "PERFORMANCE", "DOCUMENTATION"];
  
  for (const role of order) {
    if (selectedAgents.has(role)) {
      const id = `node_${role.toLowerCase()}`;
      agentToNodeId.set(role, id);
      nodes.push({
        id,
        agent: role,
        task: `Perform ${role} duties for goal: ${goal}`,
        requires: [],
        inputContract: "Goal/Context",
        outputContract: `${role}_Artifact`,
        priority: priorityCounter++
      });
    }
  }

  // 4. Construct Edges based on Dependency Rules
  const addEdge = (fromRole: string, toRole: string) => {
    const fromId = agentToNodeId.get(fromRole);
    const toId = agentToNodeId.get(toRole);
    if (fromId && toId) {
      edges.push({ from: fromId, to: toId, type: "depends_on" });
      // Update requires array in node
      const node = nodes.find(n => n.id === toId);
      if (node) node.requires.push(fromId);
    }
  };

  addEdge("CTO", "RESEARCH");
  addEdge("CTO", "ARCHITECT");
  addEdge("CTO", "PM");
  addEdge("ARCHITECT", "DEVELOPER");
  addEdge("PM", "DEVELOPER");
  addEdge("DEVELOPER", "REVIEWER");
  addEdge("DEVELOPER", "QA");
  addEdge("DEVELOPER", "SECURITY");
  addEdge("SECURITY", "PERFORMANCE");
  addEdge("DEVELOPER", "PERFORMANCE");
  addEdge("QA", "DOCUMENTATION");
  addEdge("SECURITY", "DOCUMENTATION");

  return { nodes, edges };
}