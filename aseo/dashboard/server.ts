import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { EventBus } from '../core/event_bus';
import { GraphManager } from '../core/graph_manager';
import { ReputationManager } from '../core/reputation_manager';
import { Orchestrator } from '../core/orchestrator';
import { ArtifactManager } from '../core/artifact_manager';

export async function startDashboardServer(components: {
  eventBus: EventBus,
  graphManager: GraphManager,
  reputationManager: ReputationManager,
  artifactManager: ArtifactManager,
  orchestrator: Orchestrator
}) {
  const { eventBus, graphManager, reputationManager, artifactManager, orchestrator } = components;
  const app = express();
  const PORT = process.env.ASEO_DASHBOARD_PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // --- API Endpoints ---

  // Knowledge Graph
  app.get('/api/graph', async (req, res) => {
    const graph = await graphManager.getFullGraph();
    res.json(graph);
  });

  app.get('/api/goals', async (req, res) => {
    const graph = await graphManager.getFullGraph();
    const goals = Object.entries(graph.nodes)
      .filter(([_, node]: any) => node.type === 'GOAL')
      .map(([id, node]: any) => ({
        id,
        ...node.properties
      }));
    res.json(goals);
  });

  app.get('/api/active-goal', async (req, res) => {
    const graph = await graphManager.getFullGraph();
    const goals = Object.entries(graph.nodes)
      .filter(([_, node]: any) => node.type === 'GOAL')
      .sort((a, b) => b[0].localeCompare(a[0])); // Sort by ID descending (timestamp)

    if (goals.length === 0) {
      return res.json({ goal: 'No active goal' });
    }

    const [id, node]: any = goals[0];
    res.json({
      id,
      goal: node.properties.goal || node.properties.description || 'No description available',
      status: node.properties.status
    });
  });

  // Event Stream
  app.get('/api/events', async (req, res) => {
    const events = await eventBus.getAllEvents();
    res.json(events);
  });

  // Agent Status & Reputation
  app.get('/api/agents', async (req, res) => {
    const agents = await reputationManager.getReputationScores();
    res.json(agents);
  });

  // Active Tasks & Workflow State
  app.get('/api/tasks', async (req, res) => {
    const tasks = await artifactManager.listArtifacts('tasks');
    res.json(tasks);
  });

  // ADRs
  app.get('/api/adrs', async (req, res) => {
    const adrs = await artifactManager.listArtifacts('adr');
    res.json(adrs);
  });

  // Artifacts Explorer
  app.get('/api/artifacts/:category', async (req, res) => {
    const category = req.params.category;
    const artifacts = await artifactManager.listArtifacts(category);
    res.json(artifacts);
  });

  app.get('/api/artifacts/:category/:id', async (req, res) => {
    const { category, id } = req.params;
    const content = await artifactManager.getArtifactContent(category, id);
    if (!content) return res.status(404).json({ error: 'Artifact not found' });
    res.json(content);
  });

  // Trigger a new goal (Bridge to Orchestrator)
  app.post('/api/goal', async (req, res) => {
    const { goal } = req.body;
    if (!goal) return res.status(400).json({ error: 'Goal is required' });
    
    try {
      const correlationId = await orchestrator.submitGoal(goal);
      res.json({ message: 'Goal submitted and processing started', correlationId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/goal/resume', async (req, res) => {
    const { correlationId } = req.body;
    if (!correlationId) return res.status(400).json({ error: 'correlationId is required' });
    
    try {
      const result = await orchestrator.resumeGoal(correlationId);
      if (result.success) {
        res.json({ message: `Goal ${correlationId} resumed successfully`, state: result.state });
      } else {
        res.status(404).json({ error: 'Goal not found or cannot be resumed' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/system/reset', async (req, res) => {
    try {
      await orchestrator.resetSystem();
      res.json({ message: 'System state has been completely reset' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Static files for the frontend
  app.use(express.static(path.join(__dirname, 'public')));

  app.listen(PORT, () => {
    console.log(`🚀 ASEO Dashboard Server running at http://localhost:${PORT}`);
    console.log(`📈 Monitoring Event Bus, Knowledge Graph, and Agent Reputation...`);
  });
}