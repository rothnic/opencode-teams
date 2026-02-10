# Implementation Plan - Multi-Agent E2E Test Harness (Feature 007)

**Feature Branch**: 007-multi-agent-e2e-harness
**Spec**: [spec.md](./spec.md)

## 1. Architecture Overview

This feature adds E2E testing infrastructure that exercises multi-agent coordination workflows using the plugin's existing operations (TeamOperations, TaskOperations, AgentOperations) in isolated temporary environments. Tests are written using Bun's built-in test runner and follow the established patterns from `tests/e2e-scenarios.test.ts`.

### Design Approach

The harness operates at **two levels**:

1. **Coordination Tests (bun test)**: Exercise the full coordination lifecycle (team creation → task assignment → claiming → completion → dependency cascading → review/rework) by calling operations directly. These run in CI without needing a live OpenCode server or AI model.

2. **Live Agent Tests (manual/integration)**: Spawn real agents via `AgentOperations.spawnAgent` with `google/antigravity-gemini-3-flash` in tmux sessions. These require a running OpenCode server and are gated behind an `E2E_LIVE` environment variable.

### Component Layout

```
src/testing/
  e2e-harness.ts          # Core harness: setup, teardown, assertions, recording
  scenarios/
    types.ts              # Scenario definition types
    simple-planner-builder.ts    # P1 scenario definition
    complex-review-rework.ts     # P2 scenario definition

agent/
  e2e-planner/AGENT.md   # Planner role template for E2E
  e2e-builder/AGENT.md   # Builder role template for E2E
  e2e-reviewer/AGENT.md  # Reviewer role template for E2E

tests/
  e2e-harness.test.ts    # Harness unit tests
  e2e-multi-agent.test.ts # Coordination flow tests (P1 + P2)
```

## 2. Data Model

No new schemas needed. The harness uses existing types:
- `TeamConfig` for team setup
- `Task` for task creation and lifecycle
- `AgentState` for agent registration and tracking
- `Message` for inter-agent communication

### Scenario Definition Type

```typescript
interface E2EScenario {
  name: string;
  description: string;
  agents: Array<{ role: 'planner' | 'builder' | 'reviewer'; name: string }>;
  tasks: Array<{ title: string; dependencies?: string[]; assignTo?: string }>;
  expectedOutcome: {
    allTasksCompleted: boolean;
    reviewCycles?: number;
    maxDurationMs: number;
  };
}
```

## 3. Implementation Strategy

### 3.1 E2E Harness (`src/testing/e2e-harness.ts`)

Provides a reusable test environment:
- `createTestEnvironment()`: Creates temp dir, sets `OPENCODE_TEAMS_DIR`, saves/restores env vars
- `destroyTestEnvironment()`: Removes temp dir, restores env vars, kills tmux sessions
- `setupTeamWithAgents()`: Creates team, registers simulated agents
- `simulateAgentWork()`: Simulates task claiming, completion, and messaging
- `waitForCondition()`: Polls state until condition met or timeout
- `captureRecording()`: Wraps `TmuxOperations.capturePaneOutput` for live tests
- `assertAllTasksCompleted()`: Verifies all tasks reached 'completed' status
- `assertNoResidualState()`: Verifies cleanup left no artifacts

### 3.2 Agent Templates

Three new agent templates with YAML frontmatter defining:
- **e2e-planner**: Creates team, breaks work into tasks with dependencies, assigns tasks, handles review feedback and rework cycles
- **e2e-builder**: Joins team, claims assigned tasks, completes work, reports completion
- **e2e-reviewer**: Joins team, reviews completed tasks, approves or requests rework with feedback

### 3.3 Test Scenarios

**Simple (P1)**: Planner creates team → creates 1 task → builder claims → builder completes → planner observes completion. Validates the basic coordination loop.

**Complex (P2)**: Planner creates team with dependency graph → assigns independent tasks to 2 builders in parallel → builders complete → planner routes to reviewer → reviewer rejects one (rework) → planner re-assigns → builder revises → reviewer approves all → workflow complete.

## 4. Testing Strategy

All tests use `bun test` with `describe`/`it` blocks. The harness provides beforeEach/afterEach hooks for isolation.

- **Harness unit tests**: Verify setup/teardown, env isolation, timeout enforcement
- **P1 scenario tests**: 3 acceptance criteria from spec
- **P2 scenario tests**: 5 acceptance criteria from spec
- **Edge case tests**: Spawn failure, timeout, double-claim prevention, rework loop limit
- **Live tests** (gated): Real agent spawning with `google/antigravity-gemini-3-flash`

## 5. Dependencies

- Feature 001 (Robust Coordination Core) - TeamOperations, TaskOperations
- Feature 002 (Agent Lifecycle Spawning) - AgentOperations, TmuxOperations
- Feature 005 (Event-Driven Agent Dispatch) - EventBus for task.unblocked events
