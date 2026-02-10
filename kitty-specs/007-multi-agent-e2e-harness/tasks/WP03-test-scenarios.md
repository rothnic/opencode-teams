---
work_package_id: WP03
title: Test Scenarios and Coordination Flow Tests
lane: "planned"
dependencies:
  - WP01
  - WP02
base_branch: main
base_commit: 1cdc1b8c9f335b775df1fea4b46f427030806215
created_at: '2026-02-10T14:28:00+00:00'
subtasks:
  - T012
  - T013
  - T014
  - T015
  - T016
  - T017
  - T018
  - T019
  - T020
phase: Phase 2 - Scenarios
assignee: ''
agent: ""
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-02-10T14:28:00Z'
    lane: planned
    agent: system
    action: Prompt generated via /spec-kitty.tasks
---
# Work Package Prompt: WP03 -- Test Scenarios and Coordination Flow Tests

## Objective

Define the two E2E scenario configurations (P1 Simple, P2 Complex) and write comprehensive
coordination flow tests that exercise team creation, task lifecycle, dependency scheduling,
review/rework cycles, and cleanup — all using the plugin's real operations in isolated
temp directories.

## Context

These tests exercise the coordination primitives **without** spawning real AI agents.
They simulate agent behavior by calling operations directly (like the existing
`tests/e2e-scenarios.test.ts` does). Live agent tests are gated behind `E2E_LIVE`
(handled in WP04).

**Existing pattern** from `tests/e2e-scenarios.test.ts`:
- `beforeEach`: mkdtemp, set OPENCODE_TEAMS_DIR, spawnTeam with leader
- `afterEach`: rmSync, restore env
- Tests call TaskOperations/TeamOperations directly to simulate agent actions

**Available imports** from WP01:
```typescript
import {
  createTestEnvironment,
  destroyTestEnvironment,
  setupTeamWithAgents,
  waitForCondition,
  assertAllTasksCompleted,
  assertNoResidualState,
} from '../src/testing/e2e-harness';
import type { E2EScenario } from '../src/testing/scenarios/types';
```

## Subtasks

### T012: Define P1 Simple Scenario
**File**: `src/testing/scenarios/simple-planner-builder.ts`

Export a constant `simplePlannerBuilderScenario` of type `E2EScenario`:

```typescript
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
```

### T013: Define P2 Complex Scenario
**File**: `src/testing/scenarios/complex-review-rework.ts`

Export a constant `complexReviewReworkScenario` of type `E2EScenario`:

```typescript
export const complexReviewReworkScenario: E2EScenario = {
  name: 'complex-review-rework',
  description: 'Four-agent workflow: planner, 2 builders, reviewer with dependencies and rework',
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
```

### T014-T020: Coordination Flow Tests
**File**: `tests/e2e-multi-agent.test.ts`

Structure the test file as follows:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';
import {
  assertAllTasksCompleted,
  assertNoResidualState,
  createTestEnvironment,
  destroyTestEnvironment,
  setupTeamWithAgents,
} from '../src/testing/e2e-harness';
import { simplePlannerBuilderScenario } from '../src/testing/scenarios/simple-planner-builder';
import { complexReviewReworkScenario } from '../src/testing/scenarios/complex-review-rework';

describe('E2E Multi-Agent Coordination', () => {
  let env: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    destroyTestEnvironment(env);
  });

  // P1 tests and P2 tests here...
});
```

#### T014: Test P1 AC1 — Agent Spawning and Team Membership
```
it('P1-AC1: both agents join team and are visible in membership')
```
- Call `setupTeamWithAgents` with simplePlannerBuilderScenario.agents
- Verify team has exactly 2 members
- Verify the planner is the leader
- Verify both agent names match scenario definition

#### T015: Test P1 AC2 — Task Creation and Completion Loop
```
it('P1-AC2: planner creates task, builder claims and completes it')
```
- Setup team with 2 agents
- Planner creates a task using `TaskOperations.createTask`
- Builder claims the task using `TaskOperations.claimTask`
- Builder completes the task using `TaskOperations.updateTask(status: 'completed')`
- Verify `assertAllTasksCompleted` returns true
- Verify the planner can observe completion via `TaskOperations.getTask`

#### T016: Test P1 AC3 — Cleanup Removes All State
```
it('P1-AC3: cleanup removes all temporary state')
```
- Create environment, setup team, create/complete tasks
- Call `destroyTestEnvironment`
- Verify `assertNoResidualState` returns clean=true

#### T017: Test P2 AC1 — Dependency-Aware Scheduling
```
it('P2-AC1: dependent tasks are held until dependencies complete')
```
- Setup team with complexReviewReworkScenario.agents
- Create tasks with dependency graph: Task A (root), Task B depends on A, Task C depends on A
- Verify Task B and Task C have dependencies listing Task A's ID
- Complete Task A
- Verify Task B and Task C dependencies are now empty (auto-unblocked)

#### T018: Test P2 AC2 — Parallel Assignment Without Double-Claim
```
it('P2-AC2: each builder gets a different task, no double-assignment')
```
- Setup team, create 2 independent tasks
- Builder-1 claims Task 1, Builder-2 claims Task 2
- Verify each task has a different owner
- Verify no task is claimed by both builders

#### T019: Test P2 AC3+AC4 — Review Rejection and Rework
```
it('P2-AC3/AC4: reviewer rejects, planner re-assigns with feedback, builder revises')
```
- Setup team, create and complete a task
- Simulate review: reviewer sends rejection message via `TeamOperations.write`
- Planner receives rejection via `TeamOperations.readMessages`
- Planner updates task back to pending (simulating rework re-assignment)
  - Note: TaskOperations doesn't allow backward transitions normally, so use
    `TaskOperations.updateTask` with description including reviewer feedback
  - Alternative: Create a new "rework" task with the same title + feedback
- Builder claims the rework task and completes it
- Verify the rework cycle is captured in task/message history

**Important implementation note**: The existing TaskOperations enforces forward-only status
transitions (`pending → in_progress → completed`). For rework simulation:
1. Create a **new task** with title like "REWORK: {original title}" and include reviewer
   feedback in the description
2. Add a dependency on the original task (which is completed)
3. Have the builder claim and complete the rework task
This matches how a real planner would handle rework — creating new work items, not
reverting completed ones.

#### T020: Test P2 AC5 — Full Workflow Completion
```
it('P2-AC5: reviewer approves all tasks, workflow is complete')
```
- Setup team with 4 agents
- Create full dependency graph from complex scenario
- Walk through: create root task → complete → unblock dependents → assign →
  builders complete → reviewer approves (via message) → all tasks completed
- Verify `assertAllTasksCompleted` returns true
- This is the happy-path integration test

## Edge Case Tests (include in the same file)

```
it('handles spawn failure gracefully')
```
- Try to setup team with empty agents array → should handle gracefully

```
it('prevents double-claiming of tasks')
```
- Create task, builder-1 claims → verify builder-2 cannot claim same task (already in_progress)

```
it('enforces rework cycle limit')
```
- Create 4 rework tasks sequentially → verify test logic stops after maxReworkCycles (3)

## Verification

- `bun test tests/e2e-multi-agent.test.ts` passes
- All P1 tests (3) pass
- All P2 tests (4) pass
- All edge case tests pass
- No modifications to existing production code

## Activity Log
