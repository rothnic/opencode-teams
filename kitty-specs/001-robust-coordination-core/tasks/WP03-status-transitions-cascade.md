---
work_package_id: WP03
title: Status Transitions + Cascade Unblocking
lane: "for_review"
dependencies: []
base_branch: main
base_commit: e8c8da4de4adbc31c0b7e022d603c62e2ed1b7cd
created_at: '2026-02-10T04:05:54.120420+00:00'
subtasks:
- T011
- T012
- T013
- T014
phase: Phase 2 - Logic Hardening
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

# Work Package Prompt: WP03 -- Status Transitions + Cascade Unblocking

## Goal

Enforce forward-only status transitions (FR-011) and implement cascade unblocking
when a task completes (FR-010).

## Requirements Addressed

- **FR-010**: Completing a task must automatically remove it from the `blocked_by`
  lists of dependent tasks.
- **FR-011**: Task status transitions must only allow forward progress from `pending`
  to `in_progress` to `completed`.

## Dependencies

- **WP02**: The `blocks` field must exist on `TaskSchema` before cascade logic can
  update it during unblocking.

## Subtasks

### T011: Define VALID_TRANSITIONS and add transition guard

**File**: `src/operations/task.ts`

Add the transition map as a module-level constant (before the `TaskOperations` object):

```typescript
import type { TaskStatus } from "../types/schemas";

/**
 * Forward-only status transitions (FR-011).
 * pending -> in_progress -> completed. No backward transitions.
 */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["in_progress"],
  in_progress: ["completed"],
  completed: [], // terminal state
};
```

Then replace the existing status validation in `updateTask()` (lines 239-244) with a
transition guard:

```typescript
// Validate status transition if status is being updated
if (updates.status && updates.status !== task.status) {
  const allowed = VALID_TRANSITIONS[task.status];
  if (!allowed.includes(updates.status)) {
    throw new Error(
      `Invalid status transition: ${task.status} -> ${updates.status}`,
    );
  }
}
```

**BREAKING CHANGE TO EXISTING TESTS**: The existing test at `tests/task-operations.test.ts`
line 296-313 (`'updates task fields'`) transitions `pending -> completed` directly. This
will now throw. The test must be updated to go through `in_progress` first:

```typescript
it("updates task fields", () => {
  const task = TaskOperations.createTask(teamName, {
    title: "Original",
    priority: "normal",
  });

  // First transition to in_progress (FR-011: forward-only)
  TaskOperations.claimTask(teamName, task.id, "worker-1");

  const updated = TaskOperations.updateTask(teamName, task.id, {
    title: "Updated Title",
    priority: "high",
    status: "completed",
    completedAt: new Date().toISOString(),
  });

  expect(updated.title).toBe("Updated Title");
  expect(updated.priority).toBe("high");
  expect(updated.status).toBe("completed");
  expect(updated.completedAt).toBeTruthy();
});
```

**Other tests that need the same fix** (all use `updateTask(... { status: 'completed' })`
on pending tasks):

- `areDependenciesMet` tests (lines 259-263, 274-277): The dependency tasks go
  `pending -> completed` directly. Add `claimTask()` calls before completing.
- `claimTask` test `'does not add warning when all dependencies are met'` (line 493):
  Same fix needed.
- `full task lifecycle` > `'dependency chain'` test (lines 694-696): Same fix.

### T012: Implement cascade unblock on task completion

**File**: `src/operations/task.ts`

After applying the status update in `updateTask()`, if the new status is `completed`,
cascade to dependent tasks. This runs inside the existing `withLock()` scope:

```typescript
// After writeAtomicJSON(taskPath, updatedTask, TaskSchema):

// Cascade unblock on completion (FR-010)
if (updatedTask.status === "completed" && task.status !== "completed") {
  const teamTasksDir = getTeamTasksDir(teamName);
  const files = listJSONFiles(teamTasksDir);

  for (const file of files) {
    const otherTaskPath = join(teamTasksDir, file);
    try {
      const otherTask = readValidatedJSON(otherTaskPath, TaskSchema);
      if (otherTask.id === taskId) continue;

      let modified = false;

      // Remove completed task from dependencies
      if (otherTask.dependencies.includes(taskId)) {
        otherTask.dependencies = otherTask.dependencies.filter(
          (id: string) => id !== taskId,
        );
        modified = true;

        // Clear warning if all dependencies are now met
        if (
          otherTask.dependencies.length === 0 &&
          otherTask.warning?.includes("dependencies are not met")
        ) {
          otherTask.warning = undefined;
        }
      }

      // Remove completed task from blocks (cleanup)
      if (otherTask.blocks.includes(taskId)) {
        otherTask.blocks = otherTask.blocks.filter(
          (id: string) => id !== taskId,
        );
        modified = true;
      }

      if (modified) {
        writeAtomicJSON(otherTaskPath, otherTask, TaskSchema);
      }
    } catch {
      // Skip unreadable tasks during cascade
    }
  }
}
```

**Important**: The cascade logic needs `listJSONFiles` and `join` which are already
imported. It also needs `getTeamTasksDir` which is already imported.

### T013: Create tests/status-transitions.test.ts

**File**: `tests/status-transitions.test.ts` (NEW)

Use the same test setup pattern as `tests/task-operations.test.ts`.

Test cases:

1. **pending -> in_progress**: allowed (via `claimTask` or `updateTask`)
2. **in_progress -> completed**: allowed
3. **pending -> completed**: rejected with `"Invalid status transition: pending -> completed"`
4. **completed -> pending**: rejected
5. **completed -> in_progress**: rejected
6. **in_progress -> pending**: rejected
7. **Same status update is no-op**: `updateTask(... { status: 'pending' })` on a pending
   task should not throw (status unchanged)
8. **claimTask still works**: `claimTask()` transitions `pending -> in_progress` via its
   own code path (it does not go through the `updateTask` guard, so this should still work)

### T014: Create tests/cascade-unblock.test.ts

**File**: `tests/cascade-unblock.test.ts` (NEW)

Use the same test setup pattern. All tests must first transition tasks through
`claimTask()` before completing.

Test cases:

1. **Simple cascade**: Create A, B depends on A. Complete A (claim then complete).
   Verify B's `dependencies` no longer contains A.
2. **Chain cascade**: A -> B -> C. Complete A. Verify B's deps cleared. Complete B.
   Verify C's deps cleared.
3. **Multiple dependents**: A blocks B and C. Complete A. Verify both B's and C's deps cleared.
4. **Warning cleared on cascade**: Claim B (with unmet dep A, gets warning). Complete A.
   Read B; verify `warning` is cleared.
5. **Cascade updates blocks field**: A blocks B. Complete A. Verify B's `blocks` no longer
   contains A (reverse cleanup).
6. **Partial cascade**: A blocks B, B depends on A and C. Complete A. Verify B still has
   C in dependencies but A is removed.

## Acceptance Criteria

- [ ] `VALID_TRANSITIONS` enforces `pending -> in_progress -> completed` only
- [ ] Backward transitions throw `"Invalid status transition: X -> Y"`
- [ ] Completing a task removes it from all dependents' `dependencies` arrays
- [ ] Completing a task removes it from all tasks' `blocks` arrays
- [ ] Warning is cleared when all dependencies become met
- [ ] All existing tests pass (after updating the broken ones documented above)
- [ ] `bun x tsc --noEmit` passes
- [ ] `bun test` passes
- [ ] `bunx biome check src/ tests/` passes

## Activity Log

- 2026-02-10T04:05:56Z – Antigravity – shell_pid=1368003 – lane=doing – Assigned agent via workflow command
- 2026-02-10T04:13:25Z – Antigravity – shell_pid=1368003 – lane=for_review – Ready for review: Forward-only status transitions (FR-011) and cascade unblocking (FR-010) with full test coverage. .gitignore change is from sparse-checkout, not WP03.
