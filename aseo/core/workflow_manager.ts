export enum WorkflowState {
  NEW = 'NEW',
  ANALYZED = 'ANALYZED',
  ARCHITECTED = 'ARCHITECTED',
  PLANNED = 'PLANNED',
  IMPLEMENTED = 'IMPLEMENTED',
  REVIEWED = 'REVIEWED',
  TESTED = 'TESTED',
  SECURITY_APPROVED = 'SECURITY_APPROVED',
  PERFORMANCE_APPROVED = 'PERFORMANCE_APPROVED',
  DOCUMENTED = 'DOCUMENTED',
  MERGED = 'MERGED',
}

export const WORKFLOW_SEQUENCE: WorkflowState[] = [
  WorkflowState.NEW,
  WorkflowState.ANALYZED,
  WorkflowState.ARCHITECTED,
  WorkflowState.PLANNED,
  WorkflowState.IMPLEMENTED,
  WorkflowState.REVIEWED,
  WorkflowState.TESTED,
  WorkflowState.SECURITY_APPROVED,
  WorkflowState.PERFORMANCE_APPROVED,
  WorkflowState.DOCUMENTED,
  WorkflowState.MERGED,
];

export interface GateRequirement {
  state: WorkflowState;
  requiredArtifactType: string;
  requiredAgentRole: string;
}

export const GATES: GateRequirement[] = [
  { state: WorkflowState.REVIEWED, requiredArtifactType: 'REVIEW', requiredAgentRole: 'Reviewer' },
  { state: WorkflowState.TESTED, requiredArtifactType: 'TEST_REPORT', requiredAgentRole: 'QA' },
  { state: WorkflowState.SECURITY_APPROVED, requiredArtifactType: 'SECURITY_REPORT', requiredAgentRole: 'Security' },
  { state: WorkflowState.PERFORMANCE_APPROVED, requiredArtifactType: 'PERF_REPORT', requiredAgentRole: 'Performance' },
];

export class WorkflowManager {
  static async canTransition(taskId: string, targetState: WorkflowState, artifactManager: any): Promise<{ allowed: boolean; reason?: string }> {
    const task = await artifactManager.getTask(taskId);
    if (!task) return { allowed: false, reason: 'Task not found' };

    const currentStateIndex = WORKFLOW_SEQUENCE.indexOf(task.state as WorkflowState);
    const targetStateIndex = WORKFLOW_SEQUENCE.indexOf(targetState);

    if (targetStateIndex === -1) return { allowed: false, reason: 'Invalid target state' };
    if (targetStateIndex !== currentStateIndex + 1) {
      return { allowed: false, reason: `Invalid sequence. Must transition from ${task.state} to ${WORKFLOW_SEQUENCE[currentStateIndex + 1]}` };
    }

    const gate = GATES.find(g => g.state === targetState);
    if (gate) {
      const hasArtifact = await artifactManager.hasArtifact(taskId, gate.requiredArtifactType);
      if (!hasArtifact) {
        return { allowed: false, reason: `Gate blocked: Missing ${gate.requiredArtifactType} from ${gate.requiredAgentRole}` };
      }
    }

    return { allowed: true };
  }
}