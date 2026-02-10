---
work_package_id: 'WP09'
title: 'Integration Tests'
lane: "for_review"
subtasks:
  - 'T051'
  - 'T052'
  - 'T053'
  - 'T054'
  - 'T055'
phase: 'Phase 4 - Verification'
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-02-10T06:00:00Z'
    lane: 'planned'
    agent: 'system'
    action: 'Prompt generated via /spec-kitty.tasks'
---
# Work Package Prompt: WP09 – Integration Tests

## Objective

Create end-to-end integration tests that verify the complete agent lifecycle flows: spawn, kill (graceful + force), heartbeat monitoring, task reassignment on death, and error recovery. These tests exercise the full stack from tool → operations → file system, and optionally tmux/SDK when available.

## Prerequisites

- **WP08** (Tools): All four tools must be registered and functional
- All operations modules (WP05-WP07) must be complete
- All schemas (WP01), paths (WP02), server manager (WP03), and tmux extensions (WP04) must be complete

## Context

### Codebase Location
- **New files**: `tests/agent-spawn-e2e.test.ts`, `tests/agent-kill-e2e.test.ts`, `tests/heartbeat-e2e.test.ts`, `tests/task-reassignment.test.ts`, `tests/error-recovery-e2e.test.ts`
- **Existing test pattern**: See `tests/e2e-scenarios.test.ts` for the established E2E test pattern

### Test Environment Strategy
Integration tests operate at two levels:

1. **Always-run tests**: Exercise operations layer with file-based state. No tmux or OpenCode server required. These verify state transitions, task reassignment, and data integrity.

2. **Conditional tests**: Require tmux and/or OpenCode CLI. Use `describe.skipIf()` to skip when dependencies are unavailable.

```typescript
const hasTmux = TmuxOperations.isTmuxInstalled();
const hasOpenCode = (() => {
  try {
    return Bun.spawnSync(['which', 'opencode']).exitCode === 0;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasTmux)('Tmux-dependent tests', () => { ... });
describe.skipIf(!hasOpenCode)('OpenCode-dependent tests', () => { ... });
```

### Test Isolation Pattern
```typescript
let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agent-e2e-'));
  process.env.OPENCODE_PROJECT_ROOT = tmpDir;
});

afterAll(() => {
  delete process.env.OPENCODE_PROJECT_ROOT;
  rmSync(tmpDir, { recursive: true, force: true });
});
```

## Subtasks

### T051: End-to-end spawn flow test

Create `tests/agent-spawn-e2e.test.ts`:

```typescript
describe('Agent Spawn E2E', () => {
  // Always-run: State management tests
  describe('State Management', () => {
    it('creates agent state file on disk with correct schema', async () => {
      // 1. Create team via TeamOperations.spawnTeam()
      // 2. Call AgentOperations.registerAgent() with valid AgentState
      // 3. Verify state file exists at getAgentStatePath()
      // 4. Verify state file parses against AgentStateSchema
      // 5. Verify agent appears in TeamConfig.members[]
    });

    it('allocates unique color from palette', async () => {
      // 1. Register multiple agents
      // 2. Verify each gets a unique color
      // 3. Verify colors are from COLOR_PALETTE
    });

    it('generates UUID v4 agent IDs', async () => {
      // Verify ID format matches UUID v4 pattern
    });

    it('session title follows naming convention', () => {
      // Verify format: teams::{teamName}::agent::{agentId}::role::{role}
    });
  });

  // Conditional: Full spawn with tmux
  describe.skipIf(!hasTmux)('With Tmux', () => {
    it('creates tmux pane for new agent', async () => {
      // 1. Create tmux session
      // 2. Call spawnAgent (mock server/SDK)
      // 3. Verify pane was created
      // 4. Verify pane option @opencode_session_id is set
      // 5. Clean up tmux session
    });
  });

  // Conditional: Full spawn with OpenCode
  describe.skipIf(!hasOpenCode || !hasTmux)('Full Integration', () => {
    it('spawns agent end-to-end within 30s', async () => {
      // 1. Create team
      // 2. Call spawnAgent with real server + tmux
      // 3. Verify server started (port responding)
      // 4. Verify SDK session created
      // 5. Verify tmux pane shows OpenCode TUI
      // 6. Verify prompt was delivered
      // 7. Clean up: kill agent, stop server, clean tmux
    }, 30_000); // 30s timeout per FR success criteria
  });
});
```

### T052: End-to-end kill flow test

Create `tests/agent-kill-e2e.test.ts`:

```typescript
describe('Agent Kill E2E', () => {
  describe('Force Kill', () => {
    it('terminates agent and updates state', async () => {
      // 1. Create team + register agent
      // 2. Create tasks owned by agent
      // 3. Force kill agent
      // 4. Verify agent status is 'terminated'
      // 5. Verify terminatedAt is set
      // 6. Verify tasks reassigned to pending
      // 7. Verify color released from pool
      // 8. Verify agent removed from TeamConfig.members
    });

    it('handles already-terminated agent', async () => {
      // 1. Create + terminate agent
      // 2. Try force kill again
      // 3. Verify error response
    });

    it('handles agent with no tasks', async () => {
      // Verify kill works cleanly when agent owns no tasks
    });
  });

  describe('Graceful Shutdown', () => {
    it('sends shutdown request to agent inbox', () => {
      // 1. Create team with leader + worker
      // 2. Request graceful shutdown of worker
      // 3. Verify shutdown_request message in worker's inbox
      // 4. Verify worker status is 'shutting_down'
    });

    it('rejects shutdown for non-existent agent', () => {
      // Verify error response
    });

    it('rejects shutdown for already shutting down agent', () => {
      // 1. Put agent in shutting_down state
      // 2. Try graceful shutdown again
      // 3. Verify error suggests force=true
    });
  });
});
```

### T053: Heartbeat monitoring integration test

Create `tests/heartbeat-e2e.test.ts`:

```typescript
describe('Heartbeat E2E', () => {
  describe('Heartbeat Updates', () => {
    it('updates heartbeat timestamp and resets misses', () => {
      // 1. Create agent with consecutiveMisses = 1
      // 2. Call updateHeartbeat
      // 3. Verify heartbeatTs updated
      // 4. Verify consecutiveMisses reset to 0
      // 5. Verify nextDeadline is heartbeatTs + 60s
    });

    it('transitions spawning to active on first heartbeat', () => {
      // 1. Create agent with status: 'spawning'
      // 2. Call updateHeartbeat with source: 'tool'
      // 3. Verify status changed to 'active'
    });

    it('transitions active to idle on session.idle event', () => {
      // 1. Create agent with status: 'active'
      // 2. Call updateHeartbeat with source: 'sdk_session_idle'
      // 3. Verify status changed to 'idle'
    });
  });

  describe('Stale Agent Sweep', () => {
    it('detects stale agent after 2 consecutive misses', () => {
      // 1. Create agent with heartbeatTs 70s ago, consecutiveMisses: 0
      // 2. Run sweepStaleAgents (first sweep: increments to 1)
      // 3. Verify agent still active (grace period)
      // 4. Run sweepStaleAgents again (second sweep: increments to 2)
      // 5. Verify agent marked inactive
    });

    it('does not flag agent with recent heartbeat', () => {
      // 1. Create agent with heartbeatTs = now
      // 2. Run sweepStaleAgents
      // 3. Verify agent remains active
    });

    it('reassigns tasks when marking agent inactive', () => {
      // 1. Create agent with in_progress task
      // 2. Set heartbeatTs to 70s ago, consecutiveMisses to 1
      // 3. Run sweepStaleAgents
      // 4. Verify agent inactive AND task reassigned to pending
    });

    it('notifies team leader about stale agent', () => {
      // 1. Create team with leader + worker
      // 2. Make worker stale
      // 3. Run sweep
      // 4. Verify notification message in leader's inbox
    });
  });
});
```

### T054: Task reassignment on agent death test

Create `tests/task-reassignment.test.ts`:

```typescript
describe('Task Reassignment E2E', () => {
  it('reassigns in_progress tasks to pending on agent death', () => {
    // 1. Create team
    // 2. Create 3 tasks: one pending, one in_progress (owned by agent), one completed
    // 3. Reassign agent tasks
    // 4. Verify:
    //    - in_progress task → pending, no owner, warning set
    //    - pending task → unchanged
    //    - completed task → unchanged
  });

  it('handles multiple agents with overlapping task ownership', () => {
    // 1. Create team with agent-A and agent-B
    // 2. Agent-A owns task-1, agent-B owns task-2
    // 3. Kill agent-A
    // 4. Verify: task-1 reassigned, task-2 untouched
  });

  it('sets warning message on reassigned tasks', () => {
    // Verify warning includes terminated agent ID
  });

  it('handles zero tasks gracefully', () => {
    // Kill agent with no tasks — should return empty array
  });

  it('handles missing tasks directory gracefully', () => {
    // Kill agent when team has no tasks directory
  });
});
```

### T055: Error recovery integration test

Create `tests/error-recovery-e2e.test.ts`:

```typescript
describe('Error Recovery E2E', () => {
  describe('Error Classification', () => {
    it('classifies context limit error correctly', async () => {
      // 1. Create agent
      // 2. Call handleSessionError with context limit message
      // 3. Verify lastError contains context limit info
    });

    it('classifies transient error correctly', async () => {
      // 1. Create agent
      // 2. Call handleSessionError with rate limit message
      // 3. Verify lastError contains transient info
    });

    it('classifies unknown error correctly', async () => {
      // 1. Create agent
      // 2. Call handleSessionError with unknown message
      // 3. Verify lastError contains error info
    });
  });

  describe('Context Limit Recovery', () => {
    // These tests are conditional on OpenCode availability
    describe.skipIf(!hasOpenCode)('With OpenCode', () => {
      it('rotates session on context limit', async () => {
        // 1. Create agent with valid sessionId
        // 2. Call recoverContextLimit
        // 3. Verify sessionId changed in state
        // 4. Verify sessionRotationCount incremented
        // 5. Verify heartbeatTs refreshed
      });
    });

    // State-only test (no OpenCode needed)
    it('increments sessionRotationCount on recovery', async () => {
      // 1. Create agent with sessionRotationCount = 2
      // 2. Mock recoverContextLimit state update
      // 3. Verify count becomes 3
    });
  });
});
```

## Verification Checklist

- [ ] `mise run typecheck` passes
- [ ] `mise run lint` passes
- [ ] All always-run tests pass: `bun test tests/agent-spawn-e2e.test.ts tests/agent-kill-e2e.test.ts tests/heartbeat-e2e.test.ts tests/task-reassignment.test.ts tests/error-recovery-e2e.test.ts`
- [ ] Conditional tests skip cleanly when tmux/OpenCode unavailable
- [ ] No test pollution: each test suite uses isolated temp directories
- [ ] Tests clean up temp directories in afterAll
- [ ] Tests clean up tmux sessions in afterAll (conditional tests)
- [ ] All assertions use `expect()` from `bun:test`
- [ ] No hardcoded paths — all use temp directories
- [ ] Full test suite still passes: `bun test`
- [ ] No `as any` or type suppression in test code

## Activity Log

- 2026-02-10T14:37:36Z – unknown – lane=doing – Code already on main
- 2026-02-10T14:37:39Z – unknown – lane=for_review – Code already on main, verified
