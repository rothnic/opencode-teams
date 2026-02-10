---
work_package_id: WP02
title: Event Emission
lane: "for_review"
dependencies: [WP01]
base_branch: 005-event-driven-agent-dispatch-WP01
base_commit: eab8a91628b5a1b349ba72535a75b701ec0600c1
created_at: '2026-02-10T21:01:04.772843+00:00'
subtasks: [T010, T011, T012, T013, T014, T015, T016]
shell_pid: "16625"
review_status: "has_feedback"
reviewed_by: "Nick Roth"
agent: "Implementer"
history:
- date: '2026-02-10'
  action: created
  by: planner
---

# WP02: Event Emission

**Implementation command**: `spec-kitty implement WP02 --base WP01`

## Objective

Instrument existing TaskOperations and AgentOperations to emit typed DispatchEvents
through the EventBus when state changes occur. Add emission to the plugin's session.idle hook.

## Context

- **TaskOperations**: `src/operations/task.ts` - updateTask handles status transitions, createTask adds tasks
- **AgentOperations**: `src/operations/agent.ts` - updateHeartbeat detects idle transitions, forceKill terminates agents
- **Plugin hooks**: `src/index.ts` - has existing session.idle hook
- **EventBus**: Created in WP01 at `src/operations/event-bus.ts`
- **Pattern**: Import EventBus singleton, call `EventBus.emit()` after successful state changes
- **Key**: Events must be emitted AFTER the state change is persisted, not before

## Subtasks

### T010: Emit task.completed in TaskOperations.updateTask

**Purpose**: Detect task completion and emit event.

**Steps**:

1. In `src/operations/task.ts`, import EventBus and DispatchEvent types
2. In `updateTask()`, after a successful status transition to 'completed':

```typescript
if (updates.status === 'completed') {
  EventBus.emit({
    id: globalThis.crypto.randomUUID(),
    type: 'task.completed',
    teamName,
    timestamp: new Date().toISOString(),
    payload: { taskId: taskId, title: updated.title },
  });
}
```

**Validation**:
- [ ] Completing a task emits task.completed event
- [ ] Updating a task without changing status does not emit
- [ ] Updating status to in_progress does not emit task.completed

---

### T011: Emit task.unblocked on Dependency Cascade

**Purpose**: When a task completes, check what tasks it was blocking and emit task.unblocked
for any that become fully unblocked.

**Steps**:

1. In `updateTask()`, after emitting task.completed, check for unblocked dependents:

```typescript
// After task.completed emission:
// Find tasks that list this taskId in their dependencies
const allTasks = TaskOperations.getTasks(teamName);
for (const task of allTasks) {
  if (task.dependencies.includes(taskId) && task.status === 'pending') {
    // Check if ALL dependencies are now completed
    const allDepsComplete = task.dependencies.every((depId) => {
      const dep = allTasks.find((t) => t.id === depId);
      return dep?.status === 'completed';
    });
    if (allDepsComplete) {
      EventBus.emit({
        id: globalThis.crypto.randomUUID(),
        type: 'task.unblocked',
        teamName,
        timestamp: new Date().toISOString(),
        payload: { taskId: task.id, title: task.title },
      });
    }
  }
}
```

**Validation**:
- [ ] Task B depends on Task A. When A completes, task.unblocked emitted for B
- [ ] Task C depends on A and B. When A completes but B is pending, no unblocked event for C
- [ ] Task C depends on A and B. When B completes (A already complete), unblocked event for C
- [ ] Task with no dependents does not trigger any unblocked events

---

### T012: Emit task.created in TaskOperations.createTask

**Purpose**: Notify the system when new tasks are added to a queue.

**Steps**:

1. In `createTask()`, after the task is written atomically, emit:

```typescript
EventBus.emit({
  id: globalThis.crypto.randomUUID(),
  type: 'task.created',
  teamName,
  timestamp: new Date().toISOString(),
  payload: { taskId: task.id, title: task.title, priority: task.priority },
});
```

**Validation**:
- [ ] Creating a task emits task.created event
- [ ] Payload includes taskId and priority

---

### T013: Emit agent.idle in AgentOperations.updateHeartbeat

**Purpose**: Detect when an agent transitions to idle state.

**Steps**:

1. In `src/operations/agent.ts`, import EventBus
2. In `updateHeartbeat()`, after successfully updating status to 'idle':

```typescript
if (statusUpdate === 'idle') {
  EventBus.emit({
    id: globalThis.crypto.randomUUID(),
    type: 'agent.idle',
    teamName: agent.teamName,
    timestamp: new Date().toISOString(),
    payload: { agentId: agent.id, agentName: agent.name },
  });
}
```

**Validation**:
- [ ] Agent transitioning from active to idle emits agent.idle
- [ ] Agent staying active does not emit agent.idle
- [ ] Agent transitioning from idle to active does not emit agent.idle

---

### T014: Emit agent.terminated in AgentOperations.forceKill

**Purpose**: Notify the system when an agent is terminated.

**Steps**:

1. In `forceKill()`, after successful termination (state updated, tasks reassigned):

```typescript
EventBus.emit({
  id: globalThis.crypto.randomUUID(),
  type: 'agent.terminated',
  teamName,
  timestamp: new Date().toISOString(),
  payload: { agentId, reason: reason || 'Force killed', reassignedTasks },
});
```

**Validation**:
- [ ] Force killing an agent emits agent.terminated
- [ ] Payload includes reassigned task IDs
- [ ] Killing an already-terminated agent does not emit (returns early)

---

### T015: Emit session.idle from Plugin Hook

**Purpose**: Bridge the OpenCode session.idle hook to the dispatch event system.

**Steps**:

1. In `src/index.ts`, import EventBus
2. In the existing `session.idle` handler, add:

```typescript
const teamName = process.env.OPENCODE_TEAM_NAME;
if (teamName) {
  EventBus.emit({
    id: globalThis.crypto.randomUUID(),
    type: 'session.idle',
    teamName,
    timestamp: new Date().toISOString(),
    payload: {},
  });
}
```

**Validation**:
- [ ] Session idle with OPENCODE_TEAM_NAME set emits session.idle event
- [ ] Session idle without OPENCODE_TEAM_NAME does not emit

---

### T016: Write Event Emission Integration Tests

**Purpose**: Verify events are emitted correctly during standard operations.

**Steps**:

1. Create `tests/event-emission.test.ts`
2. Test each emission point:
   - Create task -> task.created emitted
   - Complete task -> task.completed emitted
   - Complete blocking task -> task.unblocked emitted for dependent
   - Heartbeat with idle transition -> agent.idle emitted
3. Use EventBus.subscribe to capture events in tests
4. Use EventBus.clear() in afterEach to reset

**File**: `tests/event-emission.test.ts`

**Validation**:
- [ ] All tests pass with `bun test tests/event-emission.test.ts`
- [ ] Existing tests still pass

## Definition of Done

- [ ] EventBus.emit() called from all 6 emission points
- [ ] Events contain correct type, teamName, timestamp, and payload
- [ ] Integration tests verify all emission points
- [ ] `bun test` (full suite) passes
- [ ] `bun x tsc` compiles without errors
- [ ] No lint errors

## Risks

- Must not break existing task/agent operation behavior
- Event emission is fire-and-forget - must not block the operation
- Careful with imports to avoid circular dependencies

## Reviewer Guidance

- Verify events are emitted AFTER state persistence, not before
- Check that event payloads contain useful debugging information
- Ensure EventBus import does not create circular dependencies
- Verify no `as any` or type suppression

## Activity Log

- 2026-02-10T21:14:18Z – unknown – shell_pid=16625 – lane=for_review – Event emission from task/agent ops
- 2026-02-10T21:17:57Z – unknown – shell_pid=16625 – lane=planned – Moved to planned
- 2026-02-10T21:26:14Z – Implementer – shell_pid=16625 – lane=for_review – Fixed EventBus test isolation: added afterAll cleanup in event-bus.test.ts and defensive clear in event-emission.test.ts beforeEach
