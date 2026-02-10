import type { E2EScenario } from './types';

export const complexReviewReworkScenario: E2EScenario = {
  name: 'complex-review-rework',
  description:
    'Four-agent coordination: planner, 2 builders, reviewer with dependencies and rework',
  agents: [
    { role: 'planner', name: 'e2e-planner-1' },
    { role: 'builder', name: 'e2e-builder-1' },
    { role: 'builder', name: 'e2e-builder-2' },
    { role: 'reviewer', name: 'e2e-reviewer-1' },
  ],
  tasks: [
    {
      title: 'Design API schema',
      description: 'Define the REST API schema for the user service',
    },
    {
      title: 'Implement user endpoint',
      description: 'Implement GET /users endpoint',
      dependencies: ['Design API schema'],
    },
    {
      title: 'Implement auth endpoint',
      description: 'Implement POST /auth/login endpoint',
      dependencies: ['Design API schema'],
    },
    {
      title: 'Write integration tests',
      description: 'Write tests for both endpoints',
      dependencies: ['Implement user endpoint', 'Implement auth endpoint'],
    },
  ],
  expectedOutcome: {
    allTasksCompleted: true,
    reviewCycles: 1,
    maxDurationMs: 600_000, // 10 minutes
  },
};
