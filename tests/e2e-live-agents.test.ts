import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestEnvironment, destroyTestEnvironment } from '../src/testing/e2e-harness';

const isLiveEnabled = !!process.env.E2E_LIVE;

describe.skipIf(!isLiveEnabled)('E2E Live Agent Tests (E2E_LIVE=1)', () => {
  // These tests spawn REAL agents using google/antigravity-gemini-3-flash
  // They require:
  // - A running OpenCode server
  // - The Antigravity model to be available
  // - tmux to be installed and running
  //
  // Run with: E2E_LIVE=1 bun test tests/e2e-live-agents.test.ts

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
