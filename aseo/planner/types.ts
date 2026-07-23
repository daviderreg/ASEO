export type GoalType = 
  | "backend" 
  | "frontend" 
  | "distributed" 
  | "ai_ml" 
  | "data_pipeline" 
  | "mixed";

export interface PlanningInput {
  goal: string;
  context: any; // KnowledgeGraphSnapshot
  constraints: {
    maxAgents?: number;
    optimizeFor?: "speed" | "quality" | "balanced";
  };
}

export interface GraphNode {
  id: string;
  agent: string;
  task: string;
  requires: string[];
  inputContract: string;
  outputContract: string;
  priority: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: "depends_on" | "triggers" | "optional";
}

export interface ExecutionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AgentStats {
  id: string;
  skill_match: number;
  reliability: number;
  speed: number;
  cost_penalty: number;
}

/**
 * PLANNER V4 EXTENSIONS
 */

export type ResolutionMode = "VOTE" | "ARBITRATION" | "HIGHEST_REPUTATION";

export interface AgentProposal {
  agentId: string;
  role: string;
  proposedAction: string; // The event type or action to take
  payload: any;
  confidence: number; // 0.0 to 1.0
  risk: number;       // 0.0 to 1.0 (lower is safer)
  reasoning: string;
}

export interface DecisionPoint {
  id: string;
  description: string;
  requiredRoles: string[];
  resolutionMode: ResolutionMode;
  dependencyId?: string; // Which node/task triggers this decision
}

export interface ExecutionStrategy {
  goalId: string;
  intentGraph: any; // Semantic map of objectives
  executionPaths: string[][]; // Array of possible task sequences
  riskMap: Record<string, number>; // TaskID -> Risk Score
  decisionPoints: DecisionPoint[];
  requiredRoles: string[];
  version: "4.0";
}

export interface AgentDecision {
  decisionId: string;
  winningProposal: AgentProposal;
  finalScore: number;
  resolvedVia: ResolutionMode;
  proposalsConsidered: AgentProposal[];
  timestamp: string;
}