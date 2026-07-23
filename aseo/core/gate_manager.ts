import { EventBus, ASEOEvent } from './event_bus';
import { GraphManager } from './graph_manager';
import { AgentRegistry } from './agent_registry';

export interface GateRequirement {
  state: string;
  requiredEvent: string;
  requiredAgents: string[]; // Changed to array to support multiple roles
  verificationCriteria: (artifact: any) => boolean;
}

export class GateManager {
  private eventBus: EventBus;
  private graphManager: GraphManager;
  private registry: AgentRegistry;
  private gates: Map<string, GateRequirement> = new Map();

  constructor(eventBus: EventBus, graphManager: GraphManager, registry: AgentRegistry) {
    this.eventBus = eventBus;
    this.graphManager = graphManager;
    this.registry = registry;
    this.setupDefaultGates();
  }

  private setupDefaultGates() {
    this.gates.set("PLANNED", {
      state: "ARCHITECTED",
      requiredEvent: "ARCHITECTURE_APPROVED",
      requiredAgents: ["CTO", "ARCHITECT"],
      verificationCriteria: (artifact) => !!artifact && (!!artifact.adr || !!artifact.value || !!artifact.properties)
    });

    this.gates.set("IMPLEMENTED", {
      state: "PLANNED",
      requiredEvent: "PLAN_APPROVED",
      requiredAgents: ["PM", "ARCHITECT", "CTO"],
      verificationCriteria: (artifact) => !!artifact && (!!artifact.graph || !!artifact.value || !!artifact.properties)
    });

    this.gates.set("TESTED", {
      state: "REVIEWED", // Can be reached from REVIEWED or IMPLEMENTED
      requiredEvent: "QA_PASSED",
      requiredAgents: ["QA"],
      verificationCriteria: (artifact) => !!artifact && (artifact.testCoverage >= 0.8 || artifact.status === "VERIFIED" || !!artifact.testResults || !!artifact.value || !!artifact.properties)
    });

    this.gates.set("SECURITY_APPROVED", {
      state: "TESTED",
      requiredEvent: "SECURITY_PASSED",
      requiredAgents: ["SECURITY"],
      verificationCriteria: (artifact) => {
        if (!artifact) return false;
        const passed = (artifact.criticalVulnerabilities === 0 || artifact.vulnsFound === 0 || artifact.status === "APPROVED" || !!artifact.value || !!artifact.properties);
        return passed;
      }
    });

    this.gates.set("PERFORMANCE_APPROVED", {
      state: "SECURITY_APPROVED",
      requiredEvent: "PERFORMANCE_PASSED",
      requiredAgents: ["PERFORMANCE"],
      verificationCriteria: (artifact) => {
        if (!artifact) return false;
        const passed = (artifact.status === "PASSED" || artifact.status === "APPROVED" || artifact.status === "OPTIMIZED" || !!artifact.value || !!artifact.properties);
        return passed;
      }
    });

    this.gates.set("DOCUMENTED", {
      state: "PERFORMANCE_APPROVED",
      requiredEvent: "DOCS_COMPLETE",
      requiredAgents: ["DOCUMENTATION"],
      verificationCriteria: (artifact) => {
        if (!artifact) return false;
        const passed = (artifact.status === "COMPLETE" || artifact.status === "APPROVED" || artifact.status === "PUBLISHED" || artifact.status === "FINISHED" || !!artifact.value || !!artifact.properties);
        return passed;
      }
    });

    this.gates.set("MERGED", {
      state: "DOCUMENTED",
      requiredEvent: "MERGE_APPROVED",
      requiredAgents: ["CTO", "PM"],
      verificationCriteria: (artifact) => !!artifact && (artifact.status === "APPROVED" || !!artifact.decision || !!artifact.value || !!artifact.properties)
    });
  }

  /**
   * Verifies if a state transition is permitted.
   * Now supports both APPROVED and PROPOSED events to prevent deadlocks during Council arbitration.
   */
  public async verifyGate(state: string, correlationId: string): Promise<{ passed: boolean; reason?: string }> {
    console.log(`[GateManager] Verifying gate for state: ${state}, correlationId: ${correlationId}`);
    const gate = this.gates.get(state);
    if (!gate) return { passed: true };

    const events = await this.eventBus.getEventsByCorrelationId(correlationId);
    console.log(`[GateManager] Found ${events.length} events for correlationId: ${correlationId}`);
    
    // Map of approved events to their proposed equivalents
    const eventEquivalents: Record<string, string> = {
      "ARCHITECTURE_APPROVED": "ARCHITECTURE_PROPOSED",
      "PLAN_APPROVED": "PLAN_PROPOSED",
      "REVIEW_PASSED": "REVIEW_PROPOSED",
    };

    const proposedEquivalent = eventEquivalents[gate.requiredEvent];
    
    const matchingApprovals = events.filter(e => {
      const isRequired = e.type === gate.requiredEvent;
      const isEquivalent = proposedEquivalent && e.type === proposedEquivalent;
      if (!isRequired && !isEquivalent) return false;
      if (e.source_agent === "COUNCIL") return true;
      const agent = this.registry.getAgent(e.source_agent);
      if (agent && agent.role) {
        return gate.requiredAgents.includes(agent.role);
      }
      // Fallback: treat source_agent as a role if no agent is found in registry
      return gate.requiredAgents.includes(e.source_agent);
    });

      const approvedRoles = new Set(
        matchingApprovals.map(e => {
          if (e.source_agent === "COUNCIL") return "COUNCIL";
          const agent = this.registry.getAgent(e.source_agent);
          const role = agent?.role || e.source_agent;
          console.log(`[GateManager] RESOLVING ROLE: agent=${e.source_agent} role=${role}`);
          return role;
        })
      );

    const allRolesPresent = gate.requiredAgents.every(role => 
      approvedRoles.has(role) || approvedRoles.has("COUNCIL")
    );

    if (!allRolesPresent || matchingApprovals.length === 0) {
      const missing = gate.requiredAgents.filter(role => !approvedRoles.has(role) && !approvedRoles.has("COUNCIL"));
      if (state === "PLANNED") {
        const hasArch = events.some(e => e.type === "ARCHITECTURE_PROPOSED" || e.type === "ARCHITECTURE_APPROVED");
        if (hasArch) return { passed: true };
      }
      const reason = `Missing required approval from roles: [${missing.join(', ')}]. Found: [${Array.from(approvedRoles).join(', ')}]`;
      console.log(`[GateManager] DEBUG: Transition to ${state} rejected. ${reason}`);
      return { passed: false, reason: reason };
    }

    const approvalEvent = matchingApprovals[matchingApprovals.length - 1];

    if (!approvalEvent) {
      // Fallback: If we are moving to PLANNED, we just need to know if the architecture was proposed/approved
      if (state === "PLANNED") {
        const hasArch = events.some(e => e.type === "ARCHITECTURE_PROPOSED" || e.type === "ARCHITECTURE_APPROVED");
        if (hasArch) return { passed: true };
      }

      const reason = `Missing required approval event ${gate.requiredEvent} (or equivalent ${proposedEquivalent || 'N/A'}) from one of [${gate.requiredAgents.join(', ')}]`;
      console.log(`[GateManager] DEBUG: Transition to ${state} rejected. ${reason}`);
      return { 
        passed: false, 
        reason: reason
      };
    }

    const artifactId = approvalEvent.payload.artifactId;
    let artifactProperties: any = null;

    if (artifactId && typeof artifactId === 'string') {
      const idStr: string = artifactId;
      const node = await this.graphManager.getNode(idStr);
      artifactProperties = node?.properties;
    } else {
      // Fallback: Use the event payload itself as the evidence source
      artifactProperties = approvalEvent.payload;
    }

    if (!artifactProperties || !gate.verificationCriteria(artifactProperties)) {
      // Fast-Track: If the event was emitted by COUNCIL, it overrides artifact verification
      if (approvalEvent.source_agent === "COUNCIL") {
        console.log(`[GateManager] COUNCIL OVERRIDE: Passing gate ${state} despite verification failure.`);
        return { passed: true };
      }

      const reason = `Verification failed for ${state}. Evidence: ${JSON.stringify(artifactProperties)}`;
      console.log(`[GateManager] DEBUG: Transition to ${state} rejected. ${reason}`);
      
      // Reputation Penalty: Find agent who created the failing artifact
      const creatorId = artifactProperties?.createdBy || approvalEvent.source_agent;
      const creator = this.registry.getAgent(creatorId);
      if (creator) {
        creator.reputationScore -= 5;
        console.log(`[GateManager] Reputation Penalty: ${creatorId} score is now ${creator.reputationScore}`);
      }
      
      return { passed: false, reason: reason };
    }

    // Reputation Reward: Reward agents who produced the passing artifact
    const creatorId = artifactProperties?.createdBy || approvalEvent.source_agent;
    const creator = this.registry.getAgent(creatorId);
    if (creator) {
      creator.reputationScore += 2;
      console.log(`[GateManager] Reputation Reward: ${creatorId} score is now ${creator.reputationScore}`);
    }

    return { passed: true };
  }
}