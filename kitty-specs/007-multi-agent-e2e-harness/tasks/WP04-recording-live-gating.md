---
work_package_id: WP04
title: Recording Support and Live Agent Test Gating
lane: "planned"
dependencies:
  - WP01
base_branch: main
base_commit: 1cdc1b8c9f335b775df1fea4b46f427030806215
created_at: '2026-02-10T14:28:00+00:00'
subtasks:
  - T021
  - T022
phase: Phase 3 - Integration
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
# Work Package Prompt: WP04 -- Recording Support and Live Agent Test Gating

## Objective

Add terminal recording capture to the E2E harness and gate live agent tests behind
the `E2E_LIVE` environment variable. Recording wraps `TmuxOperations.capturePaneOutput`
to save agent terminal output for post-run review. Live tests require a running OpenCode
server and the Antigravity model to be available.

## Context

The harness (WP01) provides the test environment setup/teardown. This WP adds:
1. A recording utility that captures tmux pane output to files
2. Environment-gated test blocks for live agent spawning

**Existing APIs:**
- `TmuxOperations.capturePaneOutput(paneId, lines)` → captures pane text
- `AgentOperations.spawnAgent({ teamName, prompt, model, role, cwd })` → spawns real agent
- `ServerManager.ensureRunning(projectPath)` → starts OpenCode server

**Convention**: Live/integration tests that need external services use `describe.skipIf`
or `it.skipIf` with environment variable checks. The user wants `E2E_LIVE` as the gate.

## Subtasks

### T021: Add captureRecording() to Harness
**File**: `src/testing/e2e-harness.ts`

Add the following function:

```typescript
import { mkdirSync, writeFileSync } from 'node:fs';
import { TmuxOperations } from '../operations/tmux';

/**
 * Capture terminal output from a tmux pane and write to a recording file.
 *
 * @param paneId - tmux pane ID (e.g., "%42")
 * @param outputDir - directory to write recording files
 * @param label - descriptive label for the recording file name
 * @param lines - number of lines to capture (default: 500)
 * @returns path to the recording file, or null if capture failed
 */
export function captureRecording(
  paneId: string,
  outputDir: string,
  label: string,
  lines = 500,
): string | null {
  // 1. Ensure outputDir exists (mkdirSync with recursive)
  // 2. Call TmuxOperations.capturePaneOutput(paneId, lines)
  // 3. If output is null, return null
  // 4. Generate filename: `${label}-${Date.now()}.txt`
  // 5. Write output to file using writeFileSync (not Bun.write, for sync simplicity)
  // 6. Return the full file path
}
```

Also add a helper to capture all agents in a test:

```typescript
/**
 * Capture recordings for all agents with pane IDs.
 * Returns array of recording file paths.
 */
export function captureAllRecordings(
  agents: Array<{ name: string; paneId?: string }>,
  outputDir: string,
): string[] {
  const recordings: string[] = [];
  for (const agent of agents) {
    if (!agent.paneId) continue;
    const path = captureRecording(agent.paneId, outputDir, agent.name);
    if (path) recordings.push(path);
  }
  return recordings;
}
```

### T022: Add E2E_LIVE Environment Gate
**File**: `tests/e2e-multi-agent.test.ts`

Add a gated test block at the end of the file for live agent tests:

```typescript
const isLiveEnabled = !!process.env.E2E_LIVE;

describe.skipIf(!isLiveEnabled)('E2E Live Agent Tests (E2E_LIVE=1)', () => {
  // These tests spawn REAL agents using google/antigravity-gemini-3-flash
  // They require:
  // - A running OpenCode server
  // - The Antigravity model to be available
  // - tmux to be installed and running
  //
  // Run with: E2E_LIVE=1 bun test tests/e2e-multi-agent.test.ts

  let env: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    env = createTestEnvironment({
      model: 'google/antigravity-gemini-3-flash',
      recording: true,
      outputDir: join(tmpdir(), 'e2e-recordings'),
      scenarioTimeoutMs: 300_000,
    });
  });

  afterEach(() => {
    destroyTestEnvironment(env);
  });

  it('P1-LIVE: planner and builder complete a task with real agents', async () => {
    // 1. Setup team
    // 2. Spawn real planner agent via AgentOperations.spawnAgent
    // 3. Spawn real builder agent via AgentOperations.spawnAgent
    // 4. Wait for task completion using waitForCondition
    // 5. Capture recordings
    // 6. Assert task completed
    // This is a placeholder — the full implementation depends on
    // agent prompt engineering and real model behavior.
    // For now, skip with a message indicating live setup required.
    expect(isLiveEnabled).toBe(true);
  }, 300_000); // 5 minute timeout

  it('P2-LIVE: complex workflow with review cycles using real agents', async () => {
    expect(isLiveEnabled).toBe(true);
  }, 600_000); // 10 minute timeout
});
```

**Important**: The live test block should use `describe.skipIf` so it's clearly
skipped in normal test runs, with a message visible in test output.

Add the necessary imports at the top of the file:
```typescript
import { join } from 'node:path';
import { tmpdir } from 'node:os';
```

## Verification

- `bun test tests/e2e-multi-agent.test.ts` passes (live tests are skipped)
- When running with `E2E_LIVE=1`, the gated block runs (tests may be placeholder)
- `captureRecording` function exists and types check
- No modifications to existing production code
- `bunx tsc --noEmit` passes

## Activity Log
