---
work_package_id: 'WP06'
title: 'Agent Kill and Task Reassignment'
lane: 'planned'
subtasks:
  - 'T034'
  - 'T035'
  - 'T036'
  - 'T037'
  - 'T038'
phase: 'Phase 2 - Core Operations'
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
# Work Package Prompt: WP06 – Agent Kill and Task Reassignment

## Objective

Add force-kill and graceful shutdown operations to `AgentOperations` in `src/operations/agent.ts`, and extend `TaskOperations` in `src/operations/task.ts` with task reassignment logic for dead agents. Implements FR-002, FR-003, FR-008.

## Prerequisites

- **WP01** (Schemas): `ShutdownRequestSchema`, `ShutdownPhaseSchema` must exist
- **WP02** (Paths/Color): `releaseColor()` must exist
- **WP04** (Tmux): `TmuxOperations.killPane()` must exist
- **WP05** (Agent Spawn): `AgentOperations.getAgentState()`, `.updateAgentState()`, `.listAgents()` must exist

## Context

### Codebase Location
- **Extend**: `src/operations/agent.ts` (add kill methods)
- **Extend**: `src/operations/task.ts` (add `reassignAgentTasks`)
- **Test file**: `tests/agent-kill.test.ts` (CREATE)
- **Contract reference**: `kitty-specs/002-agent-lifecycle-spawning/contracts/kill-agent.md`

### Shutdown Protocol (FR-003, data-model.md)
Three-phase negotiation:
1. **Phase 1**: Leader sends `shutdown_request` message to agent's inbox
2. **Phase 2**: Agent responds with `shutdown_approved` (approved: true/false)
3. **Phase 3**: If approved, cleanup (kill pane, reassign tasks, update state)

Force kill skips all phases and goes directly to cleanup.

### Task Reassignment (FR-008, research.md R8)
When an agent dies, all `in_progress` tasks owned by that agent are reset to `pending` with `owner: undefined`. This reuses the existing `TaskOperations.updateTask()` but requires a special case: task reassignment must bypass the normal forward-only status transition rule (`in_progress` → `pending` is normally invalid).

**Key decision**: Add a new method `reassignAgentTasks()` to `TaskOperations` that internally handles the backward transition, rather than modifying the generic `updateTask()` validation.

## Subtasks

### T034: Implement `forceKill()`

Add to `AgentOperations` in `src/operations/agent.ts`:

```typescript
/**
 * Immediately terminate an agent, bypassing graceful shutdown.
 * Steps: kill pane → reassign tasks → release color → update state → remove from team
 */
async forceKill(params: {
  teamName: string;
  agentId: string;
  reason?: string;
  projectRoot?: string;
}): Promise<{
  success: boolean;
  reassignedTasks: string[];
  error?: string;
}> {
  const { teamName, agentId, reason, projectRoot } = params;

  // 1. Read agent state — fail if not found or already terminated
  const agent = AgentOperations.getAgentState(agentId, projectRoot);
  if (!agent) {
    return { success: false, reassignedTasks: [], error: `Agent '${agentId}' not found` };
  }
  if (agent.status === 'terminated') {
    return { success: false, reassignedTasks: [], error: `Agent '${agentId}' is already terminated` };
  }

  // 2. Kill tmux pane (best-effort — pane might already be gone)
  if (agent.paneId) {
    try {
      TmuxOperations.killPane(agent.paneId);
    } catch {
      // Pane may already be dead — continue cleanup
    }
  }

  // 3. Reassign tasks owned by this agent
  const reassignedTasks = TaskOperations.reassignAgentTasks(teamName, agentId, projectRoot);

  // 4. Release color back to pool
  releaseColor(agentId, projectRoot);

  // 5. Update agent state to terminated
  AgentOperations.updateAgentState(agentId, {
    status: 'terminated',
    isActive: false,
    terminatedAt: new Date().toISOString(),
    lastError: reason ? `Force killed: ${reason}` : 'Force killed',
  }, projectRoot);

  // 6. Remove agent from TeamConfig.members[]
  AgentOperations._removeFromTeam(teamName, agentId, projectRoot);

  // 7. Decrement server active sessions (best-effort)
  // (Deferred to WP03 ServerManager.decrementSessions if method exists)

  return { success: true, reassignedTasks };
}
```

### T035: Implement graceful shutdown request flow

Add to `AgentOperations`:

```typescript
/**
 * Initiate graceful shutdown (Phase 1 of FR-003).
 * Sends shutdown_request to agent's inbox. Does NOT terminate immediately.
 */
requestGracefulShutdown(params: {
  teamName: string;
  requesterAgentId: string;
  targetAgentId: string;
  reason?: string;
  projectRoot?: string;
}): {
  success: boolean;
  phase: string;
  error?: string;
} {
  const { teamName, requesterAgentId, targetAgentId, reason, projectRoot } = params;

  // 1. Read target agent state — fail if not found or already terminated
  const agent = AgentOperations.getAgentState(targetAgentId, projectRoot);
  if (!agent) {
    return { success: false, phase: 'requested', error: `Agent '${targetAgentId}' not found` };
  }
  if (agent.status === 'terminated') {
    return { success: false, phase: 'requested', error: `Agent '${targetAgentId}' is already terminated` };
  }
  if (agent.status === 'shutting_down') {
    return { success: false, phase: 'requested', error: `Agent already in shutdown. Use force=true to override.` };
  }

  // 2. Create ShutdownRequest and deliver via team messaging
  const shutdownMessage = JSON.stringify({
    id: crypto.randomUUID(),
    requesterAgentId,
    targetAgentId,
    teamName,
    reason,
    phase: 'requested',
    force: false,
    requestedAt: new Date().toISOString(),
  });

  TeamOperations._sendTypedMessage(
    teamName,
    targetAgentId,
    shutdownMessage,
    'shutdown_request',
    requesterAgentId,
  );

  // 3. Update agent status to 'shutting_down'
  AgentOperations.updateAgentState(targetAgentId, {
    status: 'shutting_down',
  }, projectRoot);

  return { success: true, phase: 'requested' };
}
```

### T036: Add `reassignAgentTasks()` to TaskOperations

Extend `src/operations/task.ts` with a method that resets all in_progress tasks owned by a dead agent:

```typescript
/**
 * Reassign all in_progress tasks owned by a terminated/inactive agent
 * back to pending status. This is a special backward transition allowed
 * only through this method (FR-008).
 *
 * @returns Array of reassigned task IDs
 */
reassignAgentTasks: (teamName: string, agentId: string, projectRoot?: string): string[] => {
  const teamTasksDir = getTeamTasksDir(teamName, projectRoot);
  const lockPath = getTaskLockPath(teamName, projectRoot);

  if (!dirExists(teamTasksDir)) {
    return [];
  }

  return withLock(lockPath, () => {
    const reassigned: string[] = [];
    const files = listJSONFiles(teamTasksDir);

    for (const file of files) {
      const taskPath = join(teamTasksDir, file);
      try {
        const task = readValidatedJSON(taskPath, TaskSchema);

        // Only reassign in_progress tasks owned by this agent
        if (task.status === 'in_progress' && task.owner === agentId) {
          const updated = {
            ...task,
            status: 'pending' as const,
            owner: undefined,
            claimedAt: undefined,
            updatedAt: new Date().toISOString(),
            warning: `Reassigned: previous owner ${agentId} terminated`,
          };
          writeAtomicJSON(taskPath, updated, TaskSchema);
          reassigned.push(task.id);
        }
      } catch {
        // Skip unreadable tasks
      }
    }

    return reassigned;
  });
},
```

**Important**: This method writes `status: 'pending'` directly, bypassing the `VALID_TRANSITIONS` check in `updateTask()`. This is intentional — task reassignment is a system-level operation, not a user-facing status transition. The backward transition `in_progress → pending` is ONLY allowed here.

### T037: Implement cleanup helpers

Add to `AgentOperations`:

```typescript
/**
 * Remove an agent from TeamConfig.members[].
 * Internal helper — does NOT update agent state.
 */
_removeFromTeam(teamName: string, agentId: string, projectRoot?: string): void {
  const configPath = getTeamConfigPath(teamName, projectRoot);
  const lockPath = getTeamLockPath(teamName, projectRoot);

  if (!fileExists(configPath)) return;

  lockedUpdate(lockPath, configPath, TeamConfigSchema, (config) => ({
    ...config,
    members: config.members.filter((m) => m.agentId !== agentId),
  }));
}
```

### T038: Add unit tests

Create `tests/agent-kill.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'bun:test';

describe('AgentOperations - Kill', () => {
  describe('forceKill', () => {
    // 1. Terminates agent and updates state to 'terminated'
    // 2. Sets terminatedAt timestamp
    // 3. Returns reassigned task IDs
    // 4. Returns error for non-existent agent
    // 5. Returns error for already terminated agent
    // 6. Releases color from pool
    // 7. Removes agent from TeamConfig.members
  });

  describe('requestGracefulShutdown', () => {
    // 1. Delivers shutdown_request message to target agent inbox
    // 2. Updates target agent status to 'shutting_down'
    // 3. Returns error for non-existent agent
    // 4. Returns error for already terminated agent
    // 5. Returns error if agent already shutting down
  });
});

describe('TaskOperations - reassignAgentTasks', () => {
  // 1. Reassigns in_progress tasks owned by agent to pending
  // 2. Clears owner and claimedAt fields
  // 3. Sets warning message
  // 4. Does NOT reassign completed tasks
  // 5. Does NOT reassign pending tasks (no owner)
  // 6. Does NOT reassign tasks owned by other agents
  // 7. Returns empty array if no tasks to reassign
  // 8. Returns empty array if team tasks directory doesn't exist
});
```

**Test setup**: Create team + agents + tasks on disk using existing `TeamOperations.spawnTeam()` and `TaskOperations.createTask()` in beforeEach. Then test kill flows and task reassignment.

## Verification Checklist

- [ ] `mise run typecheck` passes
- [ ] `mise run lint` passes
- [ ] `forceKill()` kills pane, reassigns tasks, releases color, updates state
- [ ] `requestGracefulShutdown()` delivers message to inbox and updates status
- [ ] `reassignAgentTasks()` resets in_progress tasks to pending with warning
- [ ] `reassignAgentTasks()` does NOT touch completed or other agents' tasks
- [ ] `_removeFromTeam()` removes agent from TeamConfig.members[]
- [ ] All state mutations use advisory locking
- [ ] `bun test tests/agent-kill.test.ts` passes
- [ ] Existing tests still pass: `bun test tests/task-operations.test.ts`
- [ ] No `as any` or type suppression
