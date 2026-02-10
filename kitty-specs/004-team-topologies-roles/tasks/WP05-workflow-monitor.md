---
work_package_id: WP05
title: Workflow Monitor
lane: planned
dependencies: []
subtasks: [T026, T027, T028, T029]
history:
- date: '2026-02-10'
  action: created
  by: planner
---

# WP05: Workflow Monitor

**Implementation command**: `spec-kitty implement WP05 --base WP04`

## Objective

Create `src/operations/workflow-monitor.ts` with conditional auto-scaling suggestion logic.
When tasks complete and the ratio of unblocked pending tasks to active workers exceeds
a configured threshold, emit a suggestion message to the leader.

## Context

- **Task operations**: `src/operations/task.ts` has updateTask with status transitions
- **Team operations**: `src/operations/team.ts` reads team config
- **Messaging**: TeamOperations has sendMessage for inbox messaging
- **Agent operations**: `src/operations/agent.ts` has listing/status of agents
- **WorkflowConfig schema**: From WP01, stored on TeamConfig
- **Pattern**: Follow existing operation module patterns

## Subtasks

### T026: Create WorkflowMonitor.evaluate Function

**Purpose**: Evaluate whether to suggest spawning additional workers.

**Steps**:

1. Create `src/operations/workflow-monitor.ts`:

```typescript
import { readdirSync } from 'node:fs';
import type { Task, TeamConfig, WorkflowConfig } from '../types/schemas';
import { TeamConfigSchema, TaskSchema } from '../types/schemas';
import { readValidatedJSON, writeAtomicJSON } from '../utils/fs-atomic';
import {
  getTeamConfigPath,
  getTeamTasksDir,
  fileExists,
} from '../utils/storage-paths';
import { TeamOperations } from './team';

export interface WorkflowSuggestion {
  teamName: string;
  unblockedTasks: number;
  activeWorkers: number;
  ratio: number;
  message: string;
}

export const WorkflowMonitor = {
  /**
   * Evaluate workflow conditions for a team.
   * Returns a suggestion if threshold is exceeded, null otherwise.
   */
  evaluate: (teamName: string): WorkflowSuggestion | null => {
    const configPath = getTeamConfigPath(teamName);
    if (!fileExists(configPath)) return null;

    const teamConfig = readValidatedJSON(configPath, TeamConfigSchema);
    const wfConfig = teamConfig.workflowConfig;

    // Skip if workflow monitoring not enabled
    if (!wfConfig?.enabled) return null;

    // Count unblocked pending tasks
    const unblockedTasks = countUnblockedPendingTasks(teamName);

    // Count active workers (members minus leader)
    const activeWorkers = teamConfig.members.length - 1; // Subtract leader
    if (activeWorkers <= 0) return null;

    // Calculate ratio
    const ratio = unblockedTasks / activeWorkers;

    // Check against threshold
    if (unblockedTasks < wfConfig.taskThreshold) return null;
    if (ratio < wfConfig.workerRatio) return null;

    return {
      teamName,
      unblockedTasks,
      activeWorkers,
      ratio,
      message: `Backlog alert: ${unblockedTasks} unblocked tasks with ${activeWorkers} active workers ` +
        `(ratio: ${ratio.toFixed(1)}x). Consider spawning additional workers.`,
    };
  },
};

/**
 * Count pending tasks that have no unmet dependencies.
 */
function countUnblockedPendingTasks(teamName: string): number {
  const tasksDir = getTeamTasksDir(teamName);
  let count = 0;

  try {
    const files = readdirSync(tasksDir).filter((f) => f.endsWith('.json') && f !== '.lock');
    for (const file of files) {
      try {
        const task = readValidatedJSON(`${tasksDir}/${file}`, TaskSchema);
        if (task.status === 'pending') {
          // Check if all dependencies are completed
          const allDepsComplete = task.dependencies.every((depId: string) => {
            const depPath = `${tasksDir}/${depId}.json`;
            if (!fileExists(depPath)) return true;
            try {
              const dep = readValidatedJSON(depPath, TaskSchema);
              return dep.status === 'completed';
            } catch {
              return true; // Treat unreadable deps as completed
            }
          });
          if (allDepsComplete) count++;
        }
      } catch { /* skip invalid task files */ }
    }
  } catch { /* tasks dir doesn't exist = 0 */ }

  return count;
}
```

**Validation**:
- [ ] Returns null when workflow not enabled
- [ ] Returns null when below threshold
- [ ] Returns suggestion when threshold exceeded
- [ ] Correctly counts unblocked pending tasks (deps resolved)
- [ ] Handles empty task queue gracefully

---

### T027: Integrate Workflow Evaluation into Task Status Transitions

**Purpose**: Trigger evaluation when a task completes.

**Steps**:

1. In `src/operations/task.ts`, add a call to WorkflowMonitor after task completion:

```typescript
// At the end of updateTask, after writing the updated task:
if (updates.status === 'completed') {
  try {
    const suggestion = WorkflowMonitor.evaluate(teamName);
    if (suggestion) {
      // Send suggestion to leader
      const teamConfig = readValidatedJSON(getTeamConfigPath(teamName), TeamConfigSchema);
      TeamOperations.sendMessage(
        teamName,
        'workflow-monitor',
        teamConfig.leader,
        suggestion.message,
        'task_assignment'
      );
    }
  } catch {
    // Non-fatal: don't fail task update if workflow check fails
  }
}
```

2. Import WorkflowMonitor at top of task.ts

**IMPORTANT**: Workflow evaluation failure must NEVER cause task update to fail.
Wrap in try/catch and swallow errors.

**Validation**:
- [ ] Task completion triggers evaluation
- [ ] Suggestion sent to leader inbox when threshold met
- [ ] Task update succeeds even if workflow check fails
- [ ] Non-completion status changes do not trigger evaluation

---

### T028: Add Cooldown Tracking

**Purpose**: Prevent suggestion spam with a cooldown period.

**Steps**:

1. Add cooldown check to WorkflowMonitor.evaluate:

```typescript
// Check cooldown
if (wfConfig.lastSuggestionAt) {
  const lastSuggestion = new Date(wfConfig.lastSuggestionAt).getTime();
  const cooldownMs = wfConfig.cooldownSeconds * 1000;
  if (Date.now() - lastSuggestion < cooldownMs) {
    return null; // Still in cooldown
  }
}
```

2. After emitting a suggestion, update the team config with lastSuggestionAt:

```typescript
// In the integration point (task.ts or as a separate function):
emitSuggestion: (teamName: string, suggestion: WorkflowSuggestion): void => {
  // Send message
  TeamOperations.sendMessage(/* ... */);

  // Update cooldown timestamp
  const configPath = getTeamConfigPath(teamName);
  const config = readValidatedJSON(configPath, TeamConfigSchema);
  if (config.workflowConfig) {
    config.workflowConfig.lastSuggestionAt = new Date().toISOString();
    writeAtomicJSON(configPath, config);
  }
},
```

**Validation**:
- [ ] First suggestion emitted without delay
- [ ] Second suggestion within cooldown suppressed
- [ ] Suggestion after cooldown expires is emitted
- [ ] lastSuggestionAt persisted to team config

---

### T029: Write Workflow Monitor Tests

**Purpose**: Test threshold evaluation, cooldown, and suggestion emission.

**Steps**:

1. Create `tests/workflow-monitor.test.ts`
2. Test cases:
   - Disabled workflow returns null
   - Below threshold returns null
   - Above threshold returns suggestion with correct message
   - Cooldown suppresses repeated suggestions
   - Cooldown expiry allows new suggestion
   - Dependency-blocked tasks not counted as unblocked
   - Empty task queue returns null
3. Use temp directory with pre-created team configs and task files

**File**: `tests/workflow-monitor.test.ts`

**Validation**:
- [ ] All threshold logic tested
- [ ] Cooldown tested
- [ ] Integration with task completion tested
- [ ] `bun test tests/workflow-monitor.test.ts` passes

## Definition of Done

- [ ] `src/operations/workflow-monitor.ts` created
- [ ] Evaluation integrated into task completion flow
- [ ] Cooldown tracking implemented
- [ ] Exported from `src/operations/index.ts`
- [ ] All tests pass
- [ ] `bun x tsc` compiles
- [ ] Full test suite passes (`bun test`)

## Risks

- **Performance**: Evaluating all tasks on every completion could be slow for large queues.
  For 100 tasks, reading 100 small JSON files should be < 100ms on SSD.
- **Race condition**: Concurrent task completions could trigger duplicate suggestions.
  Cooldown tracking mitigates this.

## Reviewer Guidance

- Verify workflow evaluation is non-fatal (task update must never fail)
- Check cooldown persistence (lastSuggestionAt written atomically)
- Ensure dependency-blocked tasks are correctly excluded from unblocked count
