---
work_package_id: WP04
title: Integration and Stress Tests
lane: "doing"
dependencies: []
base_branch: main
base_commit: 600be332758ca23d725cd063c2f3bf945bd9b852
created_at: '2026-02-10T04:27:18.020100+00:00'
subtasks:
- T015
- T016
- T017
phase: Phase 3 - Verification
assignee: ''
agent: "Antigravity"
shell_pid: "1368003"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-02-10T16:24:00Z'
  lane: planned
  agent: system
  action: Prompt generated via /spec-kitty.tasks
---

# Work Package Prompt: WP04 -- Integration and Stress Tests

## Goal

Add multi-process concurrency stress tests and end-to-end scenario tests that verify
the P1-P4 acceptance criteria from the spec. Final FR compliance check.

## Requirements Addressed

- **P1**: Concurrent state access safety
- **P2**: Structured shutdown coordination
- **P3**: Automatic dependency unblocking
- **P4**: Soft blocking on task claims
- **All FRs**: Compliance verification

## Dependencies

- **WP01**: Message types must be implemented for P2 tests
- **WP02**: Bidirectional deps must work for P3 tests
- **WP03**: Status transitions + cascade must work for P3 tests

## Subtasks

### T015: Create tests/concurrency-stress.test.ts

**File**: `tests/concurrency-stress.test.ts` (NEW)

**Purpose**: Test true multi-process concurrency (not just Promise.allSettled in a single
event loop). The existing concurrent tests in `task-operations.test.ts` use microtasks
which execute sequentially in Bun's single-threaded runtime.

**Approach**: Use `Bun.spawn()` to launch child processes that perform operations on
the same team state simultaneously. Each child process runs a small inline script.

Test cases:

1. **Multi-process claim race**: Spawn 5 child processes that each try to claim the same
   task. Verify exactly 1 succeeds and 4 fail.

   ```typescript
   it("multi-process claim race results in exactly one winner", async () => {
     const task = TaskOperations.createTask(teamName, { title: "Race Task" });

     const processes = Array.from({ length: 5 }, (_, i) => {
       return Bun.spawn(
         [
           "bun",
           "-e",
           `
         process.env.OPENCODE_TEAMS_DIR = '${tempDir}';
         const { TaskOperations } = require('../src/operations/task');
         try {
           TaskOperations.claimTask('${teamName}', '${task.id}', 'agent-${i}');
           process.exit(0);
         } catch {
           process.exit(1);
         }
       `,
         ],
         { cwd: projectRoot },
       );
     });

     const results = await Promise.all(processes.map((p) => p.exited));

     const successes = results.filter((code) => code === 0);
     expect(successes).toHaveLength(1);
   });
   ```

   **Note**: Adjust the child process script to use proper imports for ES modules. You may
   need to write a temporary `.ts` helper file that the child processes execute.

2. **Multi-process concurrent task creation**: Spawn 5 processes that each create a task
   in the same team. Verify all 5 tasks exist with distinct IDs.

3. **Multi-process concurrent message sends**: Spawn 3 processes that each send a message
   to the same agent. Verify the agent's inbox contains all 3 messages.

4. **Lock contention under load**: Create 20 tasks sequentially, then spawn 10 processes
   that each claim a different task. Verify all 10 claims succeed.

**Test setup**: Follow the same temp dir isolation pattern. Use `process.cwd()` or
`import.meta.dir` to find the project root for child process CWD.

**Timeout**: Set test timeout to 30 seconds for multi-process tests:

```typescript
it('test name', async () => { ... }, 30_000);
```

### T016: Create tests/e2e-scenarios.test.ts

**File**: `tests/e2e-scenarios.test.ts` (NEW)

End-to-end scenario tests that map directly to the spec's P1-P4 acceptance criteria.

**P1: Concurrent State Access Safety**

```typescript
describe("P1: Concurrent State Access Safety", () => {
  it("write then immediate read returns updated state", () => {
    // Agent 1 creates a task
    const task = TaskOperations.createTask(teamName, { title: "P1 Test" });
    // Agent 2 reads immediately after
    const fetched = TaskOperations.getTask(teamName, task.id);
    expect(fetched.title).toBe("P1 Test");
  });

  it("concurrent config updates preserve all changes", async () => {
    // Multiple agents join the team concurrently
    const joins = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        Promise.resolve().then(() =>
          TeamOperations.requestJoin(teamName, {
            agentId: `worker-${i}`,
            agentName: `Worker ${i}`,
            agentType: "worker",
          }),
        ),
      ),
    );
    const fulfilled = joins.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(5);

    const info = TeamOperations.getTeamInfo(teamName);
    expect(info.members).toHaveLength(6); // leader + 5 workers
  });
});
```

**P2: Structured Shutdown Coordination**

```typescript
describe("P2: Structured Shutdown Coordination", () => {
  it("shutdown request sends typed message and approval responds", () => {
    // Setup: leader + worker
    TeamOperations.requestJoin(teamName, {
      agentId: "worker-1",
      agentName: "Worker",
      agentType: "worker",
    });

    // Worker requests shutdown
    TeamOperations.requestShutdown(teamName, "worker-1");

    // Verify leader received shutdown_request message
    const leaderMessages = TeamOperations.readMessages(teamName, "leader-1");
    const shutdownReq = leaderMessages.find(
      (m) => m.type === "shutdown_request",
    );
    expect(shutdownReq).toBeDefined();
    expect(shutdownReq!.from).toBe("worker-1");

    // Leader approves
    TeamOperations.approveShutdown(teamName, "leader-1");

    // Verify worker received shutdown_approved message
    const workerMessages = TeamOperations.readMessages(teamName, "worker-1");
    const shutdownApproved = workerMessages.find(
      (m) => m.type === "shutdown_approved",
    );
    expect(shutdownApproved).toBeDefined();
    expect(shutdownApproved!.from).toBe("leader-1");
  });
});
```

**P3: Automatic Dependency Unblocking**

```typescript
describe("P3: Automatic Dependency Unblocking", () => {
  it("completing task unblocks all dependents", () => {
    const taskA = TaskOperations.createTask(teamName, { title: "Root" });
    const taskB = TaskOperations.createTask(teamName, {
      title: "Dep B",
      dependencies: [taskA.id],
    });
    const taskC = TaskOperations.createTask(teamName, {
      title: "Dep C",
      dependencies: [taskA.id],
    });

    // Complete A (must go through in_progress first)
    TaskOperations.claimTask(teamName, taskA.id, "worker-1");
    TaskOperations.updateTask(teamName, taskA.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    // B and C should have empty dependencies
    const b = TaskOperations.getTask(teamName, taskB.id);
    const c = TaskOperations.getTask(teamName, taskC.id);
    expect(b.dependencies).toEqual([]);
    expect(c.dependencies).toEqual([]);
  });

  it("chain cascade unblocks sequentially", () => {
    const root = TaskOperations.createTask(teamName, { title: "Root" });
    const mid = TaskOperations.createTask(teamName, {
      title: "Mid",
      dependencies: [root.id],
    });
    const leaf = TaskOperations.createTask(teamName, {
      title: "Leaf",
      dependencies: [mid.id],
    });

    // Complete root
    TaskOperations.claimTask(teamName, root.id, "w1");
    TaskOperations.updateTask(teamName, root.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    // Mid is unblocked
    const midTask = TaskOperations.getTask(teamName, mid.id);
    expect(midTask.dependencies).toEqual([]);

    // Leaf still depends on mid
    const leafTask = TaskOperations.getTask(teamName, leaf.id);
    expect(leafTask.dependencies).toEqual([mid.id]);

    // Complete mid
    TaskOperations.claimTask(teamName, mid.id, "w2");
    TaskOperations.updateTask(teamName, mid.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    // Now leaf is unblocked
    const leafFinal = TaskOperations.getTask(teamName, leaf.id);
    expect(leafFinal.dependencies).toEqual([]);
  });
});
```

**P4: Soft Blocking on Task Claims**

```typescript
describe("P4: Soft Blocking on Task Claims", () => {
  it("claiming blocked task succeeds with warning", () => {
    const dep = TaskOperations.createTask(teamName, { title: "Blocker" });
    const task = TaskOperations.createTask(teamName, {
      title: "Blocked",
      dependencies: [dep.id],
    });

    const claimed = TaskOperations.claimTask(teamName, task.id, "worker-1");
    expect(claimed.status).toBe("in_progress");
    expect(claimed.warning).toContain("dependencies are not met");
  });

  it("warning remains visible on re-read", () => {
    const dep = TaskOperations.createTask(teamName, { title: "Blocker" });
    const task = TaskOperations.createTask(teamName, {
      title: "Blocked",
      dependencies: [dep.id],
    });

    TaskOperations.claimTask(teamName, task.id, "worker-1");
    const reread = TaskOperations.getTask(teamName, task.id);
    expect(reread.warning).toContain("dependencies are not met");
  });
});
```

### T017: FR compliance validation

This is a manual verification step, not a new test file. After all WPs are implemented:

1. Run `bun test` and verify all tests pass.
2. Run `bun x tsc --noEmit` and verify type check passes.
3. Run `bunx biome check src/ tests/` and verify linting passes.
4. Walk through each FR in `quickstart.md` and verify the corresponding test exists:

| FR     | Test File                                                        | Status       |
| ------ | ---------------------------------------------------------------- | ------------ |
| FR-001 | `tests/file-lock.test.ts`                                        | Pre-existing |
| FR-002 | `tests/fs-atomic.test.ts`                                        | Pre-existing |
| FR-003 | `tests/task-operations.test.ts`, `tests/team-operations.test.ts` | Pre-existing |
| FR-004 | `tests/storage-paths.test.ts`                                    | Pre-existing |
| FR-005 | `tests/message-types.test.ts`                                    | WP01         |
| FR-006 | `tests/team-operations.test.ts` (`readMessages` marks read)      | Pre-existing |
| FR-007 | `tests/poll-inbox.test.ts`                                       | Pre-existing |
| FR-008 | `tests/poll-inbox.test.ts`                                       | Pre-existing |
| FR-009 | `tests/task-operations.test.ts` (bidirectional deps)             | WP02         |
| FR-010 | `tests/cascade-unblock.test.ts`                                  | WP03         |
| FR-011 | `tests/status-transitions.test.ts`                               | WP03         |
| FR-012 | `tests/task-operations.test.ts` (circular dep check)             | Pre-existing |
| FR-013 | `tests/task-operations.test.ts` (soft blocking)                  | Pre-existing |

## Acceptance Criteria

- [ ] Multi-process concurrency tests pass (claim race, concurrent creates)
- [ ] P1 scenario: write-then-read returns updated state
- [ ] P2 scenario: shutdown request/approval via typed messages
- [ ] P3 scenario: cascade unblock on completion (simple + chain)
- [ ] P4 scenario: soft blocking with persistent warnings
- [ ] All 13 FRs have corresponding passing tests
- [ ] `bun x tsc --noEmit` passes
- [ ] `bun test` passes
- [ ] `bunx biome check src/ tests/` passes

## Activity Log

- 2026-02-10T04:27:20Z – Antigravity – shell_pid=1368003 – lane=doing – Assigned agent via workflow command
