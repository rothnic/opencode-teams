---
work_package_id: WP01
title: E2E Harness Core and Scenario Types
lane: "planned"
dependencies: []
base_branch: main
base_commit: 1cdc1b8c9f335b775df1fea4b46f427030806215
created_at: '2026-02-10T14:28:00+00:00'
subtasks:
  - T001
  - T002
  - T003
  - T004
  - T005
  - T006
  - T007
  - T008
phase: Phase 1 - Foundation
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
# Work Package Prompt: WP01 -- E2E Harness Core and Scenario Types

## Objective

Create the foundational E2E test harness infrastructure: scenario type definitions, test
environment setup/teardown with guaranteed cleanup, helper assertions, and unit tests
verifying the harness itself works correctly.

## Context

This project is an OpenCode plugin for multi-agent team coordination. The harness exercises
TeamOperations, TaskOperations, AgentOperations, and TmuxOperations in isolated temp
directories. Follow the existing test patterns from `tests/e2e-scenarios.test.ts` which uses
`mkdtempSync`, env var save/restore, and `rmSync` cleanup in afterEach.

**Codebase conventions:**
- Bun runtime, ES modules, `import`/`export`
- Single quotes, 2-space indent, 100-char line width, semicolons always
- Zod schemas for runtime validation
- `bun:test` with `describe`/`it`/`expect`
- Explicit types on function parameters and returns

## Subtasks

### T001: Create Scenario Type Definitions
**File**: `src/testing/scenarios/types.ts`

Define the following interfaces:

```typescript
interface E2EAgentRole {
  role: 'planner' | 'builder' | 'reviewer';
  name: string;
}

interface E2ETaskDef {
  title: string;
  description?: string;
  dependencies?: string[];  // references to other task titles in the scenario
  assignTo?: string;         // agent name to assign to
}

interface E2EExpectedOutcome {
  allTasksCompleted: boolean;
  reviewCycles?: number;      // expected review/rework cycles (P2)
  maxDurationMs: number;
}

interface E2EScenario {
  name: string;
  description: string;
  agents: E2EAgentRole[];
  tasks: E2ETaskDef[];
  expectedOutcome: E2EExpectedOutcome;
}

interface E2EScenarioResult {
  scenario: string;
  passed: boolean;
  durationMs: number;
  acceptanceCriteria: Array<{ name: string; passed: boolean; error?: string }>;
}

interface E2EHarnessConfig {
  model: string;             // default: 'google/antigravity-gemini-3-flash'
  providerId?: string;
  recording: boolean;        // default: false
  outputDir?: string;        // for recordings
  scenarioTimeoutMs: number; // default: 300_000 (5 min)
  setupTimeoutMs: number;    // default: 60_000 (1 min)
  cleanupTimeoutMs: number;  // default: 30_000 (30 sec)
  maxReworkCycles: number;   // default: 3
}
```

Export all types. Use `export interface`, not `type` alias.

### T002: Implement createTestEnvironment()
**File**: `src/testing/e2e-harness.ts`

```typescript
export function createTestEnvironment(config?: Partial<E2EHarnessConfig>): {
  tempDir: string;
  config: E2EHarnessConfig;
  savedEnv: Record<string, string | undefined>;
};
```

- Create temp dir with `mkdtempSync(join(tmpdir(), 'opencode-e2e-harness-'))`
- Save `OPENCODE_TEAMS_DIR`, `OPENCODE_AGENT_ID`, `OPENCODE_AGENT_NAME`, `OPENCODE_AGENT_TYPE`
- Set `OPENCODE_TEAMS_DIR` to tempDir
- Delete `OPENCODE_AGENT_ID`, `OPENCODE_AGENT_NAME`, `OPENCODE_AGENT_TYPE`
- Return tempDir, merged config with defaults, and savedEnv

Import types from `./scenarios/types`.

### T003: Implement destroyTestEnvironment()
**File**: `src/testing/e2e-harness.ts`

```typescript
export function destroyTestEnvironment(env: {
  tempDir: string;
  savedEnv: Record<string, string | undefined>;
}): void;
```

- `rmSync(tempDir, { recursive: true, force: true })` if it exists
- Restore all saved env vars (set or delete)
- Best-effort: do not throw on cleanup failure, log warnings

### T004: Implement setupTeamWithAgents()
**File**: `src/testing/e2e-harness.ts`

```typescript
export function setupTeamWithAgents(
  teamName: string,
  agents: E2EAgentRole[],
  projectRoot?: string,
): {
  team: TeamConfig;
  registeredAgents: Array<{ agentId: string; name: string; role: string }>;
};
```

- Create team with first agent as leader (using TeamOperations.spawnTeam)
- Register remaining agents using TeamOperations.requestJoin
- Return team config and list of registered agents with their generated IDs
- The first `planner` agent should be the leader; if no planner, use the first agent

### T005: Implement waitForCondition()
**File**: `src/testing/e2e-harness.ts`

```typescript
export async function waitForCondition(
  condition: () => boolean,
  timeoutMs: number,
  intervalMs?: number,
): Promise<boolean>;
```

- Poll `condition()` every `intervalMs` (default 250ms)
- Return `true` if condition met before timeout
- Return `false` if timeout reached
- Use `await Bun.sleep(intervalMs)` between polls

### T006: Implement assertAllTasksCompleted()
**File**: `src/testing/e2e-harness.ts`

```typescript
export function assertAllTasksCompleted(
  teamName: string,
  projectRoot?: string,
): { allCompleted: boolean; tasks: Array<{ id: string; title: string; status: string }> };
```

- Get all tasks via `TaskOperations.getTasks(teamName, undefined, projectRoot)`
- Return whether all have status 'completed', plus task summary

### T007: Implement assertNoResidualState()
**File**: `src/testing/e2e-harness.ts`

```typescript
export function assertNoResidualState(tempDir: string): {
  clean: boolean;
  issues: string[];
};
```

- Check tempDir no longer exists
- Return issues list if any residual state found

### T008: Write Harness Unit Tests
**File**: `tests/e2e-harness.test.ts`

Test the harness itself (not the scenarios):

1. `createTestEnvironment` sets OPENCODE_TEAMS_DIR to a temp dir that exists
2. `createTestEnvironment` saves previous env vars
3. `destroyTestEnvironment` removes temp dir and restores env
4. `setupTeamWithAgents` creates a team with the correct number of members
5. `setupTeamWithAgents` makes the planner the leader
6. `waitForCondition` returns true when condition is met immediately
7. `waitForCondition` returns false on timeout
8. `assertAllTasksCompleted` returns true when all tasks completed
9. `assertAllTasksCompleted` returns false when some tasks pending
10. `assertNoResidualState` returns clean=true when dir is removed

Follow the pattern from `tests/e2e-scenarios.test.ts`: use beforeEach/afterEach for
temp dir isolation.

## Imports

```typescript
// In e2e-harness.ts
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskOperations } from '../operations/task';
import { TeamOperations } from '../operations/team';
import type { TeamConfig } from '../types/index';
import type { E2EAgentRole, E2EHarnessConfig } from './scenarios/types';

// In tests/e2e-harness.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  assertAllTasksCompleted,
  assertNoResidualState,
  createTestEnvironment,
  destroyTestEnvironment,
  setupTeamWithAgents,
  waitForCondition,
} from '../src/testing/e2e-harness';
import { TaskOperations } from '../src/operations/task';
```

## Verification

- `bunx tsc --noEmit` passes
- `bun test tests/e2e-harness.test.ts` passes
- All 10 test cases pass

## Activity Log
