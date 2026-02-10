import type { E2EScenario } from './types';

export const simplePlannerBuilderScenario: E2EScenario = {
  name: 'simple-planner-builder',
  description: 'Basic two-agent coordination: planner creates task, builder completes it',
  agents: [
    { role: 'planner', name: 'e2e-planner-1' },
    { role: 'builder', name: 'e2e-builder-1' },
  ],
  tasks: [
    {
      title: 'Implement greeting module',
      description: 'Create a simple greeting function that returns "Hello, World!"',
    },
  ],
  expectedOutcome: {
    allTasksCompleted: true,
    maxDurationMs: 300_000, // 5 minutes
  },
};
