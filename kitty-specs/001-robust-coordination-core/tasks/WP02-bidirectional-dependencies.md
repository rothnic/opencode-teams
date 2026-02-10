---
work_package_id: "WP02"
title: "Bidirectional Dependencies"
lane: "planned"
subtasks:
  - "T006"
  - "T007"
  - "T008"
  - "T009"
  - "T010"
phase: "Phase 1 - Schema + Operations"
assignee: ""
agent: ""
shell_pid: ""
review_status: ""
reviewed_by: ""
history:
  - timestamp: "2026-02-10T16:24:00Z"
    lane: "planned"
    agent: "system"
    action: "Prompt generated via /spec-kitty.tasks"
---

# Work Package Prompt: WP02 -- Bidirectional Dependencies

## Goal

Add a denormalized `blocks` field to `TaskSchema` and maintain it automatically when
tasks with dependencies are created, updated, or deleted (FR-009).

## Requirements Addressed

- **FR-009**: Tasks must support bidirectional dependency relationships with `blocks`
  and `blocked_by` fields.

## Dependencies

None. This WP is independent and can be implemented in parallel with WP01.

## Design Decisions

- `dependencies` = "I am blocked by these tasks" (the canonical `blocked_by` list).
- `blocks` = "I block these tasks" (denormalized reverse index, maintained automatically).
- The `blocks` field is never set directly by callers. It is computed from the `dependencies`
  of other tasks.

## Subtasks

### T006: Add blocks field to TaskSchema

**File**: `src/types/schemas.ts`

Add `blocks` field to `TaskSchema` after the `dependencies` field (line 56):

```typescript
export const TaskSchema = z.object({
  id: z.string().min(1, "Task ID must be non-empty"),
  title: z.string().default("Untitled Task"),
  description: z.string().optional(),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
  status: TaskStatusSchema,
  createdAt: z.string().datetime({ message: "createdAt must be ISO 8601" }),
  updatedAt: z.string().datetime().optional(),
  owner: z.string().optional(),
  claimedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  dependencies: z.array(z.string()).default([]),
  blocks: z.array(z.string()).default([]), // <-- NEW FIELD (FR-009)
  warning: z.string().optional(),
});
```

**Backward compatibility**: `.default([])` means existing task JSON files that lack
the `blocks` field will parse as `blocks: []`. No migration needed.

**Verification**: `bun x tsc --noEmit` must pass. Existing tests should still pass because
the default covers the missing field.

### T007: Update createTask() to sync blocks on dependency targets

**File**: `src/operations/task.ts`

After writing the new task to disk (line 128), if the task has dependencies, update each
dependency's `blocks` array to include the new task ID:

```typescript
// Inside createTask(), after writeAtomicJSON(taskPath, task, TaskSchema):

// Sync blocks: add this task to each dependency's blocks array
if (task.dependencies.length > 0) {
  for (const depId of task.dependencies) {
    const depPath = getTaskFilePath(teamName, depId);
    const depTask = readValidatedJSON(depPath, TaskSchema);
    if (!depTask.blocks.includes(taskId)) {
      const updatedDep = {
        ...depTask,
        blocks: [...depTask.blocks, taskId],
      };
      writeAtomicJSON(depPath, updatedDep, TaskSchema);
    }
  }
}
```

**Note**: This runs inside the existing `withLock()` scope, so no additional locking needed.

### T008: Update deleteTask() to clean up blocks references

**File**: `src/operations/task.ts`

Before removing the task file in `deleteTask()`, remove the task ID from all other tasks'
`blocks` arrays. Modify the existing loop (lines 275-290) that already scans for dependents:

```typescript
withLock(lockPath, () => {
  const teamTasksDir = getTeamTasksDir(teamName);
  const files = listJSONFiles(teamTasksDir);

  // Read the task being deleted to get its dependencies
  const taskToDelete = readValidatedJSON(taskPath, TaskSchema);

  for (const file of files) {
    const otherTaskPath = join(teamTasksDir, file);
    try {
      const otherTask = readValidatedJSON(otherTaskPath, TaskSchema);
      if (otherTask.id === taskId) continue;

      // Existing check: prevent deletion if other tasks depend on this one
      if (otherTask.dependencies?.includes(taskId)) {
        throw new Error(
          `Cannot delete task ${taskId} because task ${otherTask.id} depends on it`,
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("Cannot delete")) {
        throw err;
      }
    }
  }

  // Clean up: remove this task from its dependencies' blocks arrays
  for (const depId of taskToDelete.dependencies) {
    const depPath = getTaskFilePath(teamName, depId);
    if (fileExists(depPath)) {
      try {
        const depTask = readValidatedJSON(depPath, TaskSchema);
        if (depTask.blocks.includes(taskId)) {
          const updatedDep = {
            ...depTask,
            blocks: depTask.blocks.filter((id: string) => id !== taskId),
          };
          writeAtomicJSON(depPath, updatedDep, TaskSchema);
        }
      } catch {
        // If dependency can't be read, skip cleanup
      }
    }
  }

  removeFile(taskPath);
});
```

### T009: Update updateTask() to sync blocks when dependencies change

**File**: `src/operations/task.ts`

When `updateTask()` receives new `dependencies`, it must:

1. Remove the task from old dependencies' `blocks` arrays.
2. Add the task to new dependencies' `blocks` arrays.

Insert this logic after the circular dependency check (around line 236), still inside
the `withLock()` scope:

```typescript
// If dependencies changed, sync blocks on affected tasks
if (updates.dependencies) {
  const oldDeps = new Set(task.dependencies);
  const newDeps = new Set(updates.dependencies);

  // Remove from blocks of deps that are no longer dependencies
  for (const oldDepId of oldDeps) {
    if (!newDeps.has(oldDepId)) {
      const oldDepPath = getTaskFilePath(teamName, oldDepId);
      if (fileExists(oldDepPath)) {
        try {
          const oldDep = readValidatedJSON(oldDepPath, TaskSchema);
          if (oldDep.blocks.includes(taskId)) {
            writeAtomicJSON(
              oldDepPath,
              {
                ...oldDep,
                blocks: oldDep.blocks.filter((id: string) => id !== taskId),
              },
              TaskSchema,
            );
          }
        } catch {
          /* skip unreadable */
        }
      }
    }
  }

  // Add to blocks of new dependencies
  for (const newDepId of newDeps) {
    if (!oldDeps.has(newDepId)) {
      const newDepPath = getTaskFilePath(teamName, newDepId);
      if (fileExists(newDepPath)) {
        try {
          const newDep = readValidatedJSON(newDepPath, TaskSchema);
          if (!newDep.blocks.includes(taskId)) {
            writeAtomicJSON(
              newDepPath,
              { ...newDep, blocks: [...newDep.blocks, taskId] },
              TaskSchema,
            );
          }
        } catch {
          /* skip unreadable */
        }
      }
    }
  }
}
```

### T010: Add bidirectional dependency tests

**File**: `tests/task-operations.test.ts` (MODIFY -- add new `describe` block)

Add a new `describe('bidirectional dependencies (FR-009)')` block with these tests:

1. **Creating task with deps populates blocks**: Create task A, then task B with
   `dependencies: [A.id]`. Read task A back; verify `A.blocks` contains `B.id`.
2. **Deleting dependent cleans up blocks**: Delete task B. Read A; verify `A.blocks`
   is empty.
3. **Updating dependencies syncs blocks**: Create A, B, C. Set B's dependencies to [A].
   Verify A.blocks = [B]. Update B's dependencies to [C]. Verify A.blocks = [] and
   C.blocks = [B].
4. **Multiple dependents in blocks**: Create A, then B and C both depending on A.
   Verify A.blocks = [B.id, C.id].
5. **blocks field defaults to empty array**: Create a task with no dependencies.
   Verify `task.blocks` is `[]`.

## Acceptance Criteria

- [ ] `TaskSchema` includes `blocks: z.array(z.string()).default([])`
- [ ] Creating task B with `dependencies: [A]` adds B to A's `blocks`
- [ ] Deleting task B removes B from A's `blocks`
- [ ] Updating B's dependencies from [A] to [C] removes B from A's blocks, adds to C's
- [ ] Existing task JSON without `blocks` field parses as `blocks: []`
- [ ] `bun x tsc --noEmit` passes
- [ ] `bun test` passes (all existing + new tests)
- [ ] `bunx biome check src/ tests/` passes
