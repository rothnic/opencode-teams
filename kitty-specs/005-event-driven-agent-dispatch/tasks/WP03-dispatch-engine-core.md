---
work_package_id: "WP03"
title: "Dispatch Engine Core"
lane: "planned"
dependencies: ["WP01"]
subtasks: ["T017", "T018", "T019", "T020", "T021", "T022"]
history:
  - date: "2026-02-10"
    action: "created"
    by: "planner"
---

# WP03: Dispatch Engine Core

**Implementation command**: `spec-kitty implement WP03 --base WP01`

## Objective

Create the dispatch engine that subscribes to EventBus events, loads dispatch rules from
TeamConfig, evaluates conditions, executes actions, and logs results. This is the core
intelligence of the event-driven dispatch system.

## Context

- **EventBus**: Created in WP01 at `src/operations/event-bus.ts`
- **TeamConfig**: Extended in WP01 with `dispatchRules` and `dispatchLog` fields
- **TaskOperations**: `src/operations/task.ts` - claimTask for auto-assignment
- **TeamOperations**: `src/operations/team.ts` - _sendTypedMessage for notifications
- **WorkflowMonitor**: `src/operations/workflow-monitor.ts` - existing pattern for team-scoped evaluation
- **File locking**: Use `lockedUpdate` from `src/utils/fs-atomic.ts` for safe config updates
- **Storage**: `getTeamConfigPath` from `src/utils/storage-paths.ts`

## Subtasks

### T017: Create DispatchEngine Module

**Purpose**: Central dispatch engine with evaluate method.

**Steps**:

1. Create `src/operations/dispatch-engine.ts`:

```typescript
import type { DispatchEvent } from '../types/schemas';
import { DispatchEngine } from './dispatch-engine';

export const DispatchEngine = {
  /**
   * Maximum recursion depth to prevent circular event loops.
   */
  _dispatchDepth: 0,
  _maxDepth: 3,

  /**
   * Evaluate an event against all enabled dispatch rules for its team.
   */
  async evaluate(event: DispatchEvent): Promise<void> {
    if (DispatchEngine._dispatchDepth >= DispatchEngine._maxDepth) {
      console.warn(`[DispatchEngine] Max depth reached, skipping event: ${event.type}`);
      return;
    }

    DispatchEngine._dispatchDepth++;
    try {
      // 1. Load team config
      // 2. Filter rules by event.type and enabled
      // 3. Sort by priority (lower = higher priority)
      // 4. For each rule: evaluate condition, execute action if condition passes
      // 5. Log results
    } finally {
      DispatchEngine._dispatchDepth--;
    }
  },
};
```

2. Implement the full evaluate logic:
   - Read TeamConfig using readValidatedJSON + TeamConfigSchema
   - Filter dispatchRules where rule.eventType === event.type && rule.enabled
   - Sort by rule.priority ascending
   - For each matching rule, call ConditionEvaluator then ActionExecutor
   - Log each dispatch attempt via the logging helper

**Validation**:
- [ ] evaluate() with no matching rules completes without error
- [ ] evaluate() with matching rule calls condition evaluator
- [ ] evaluate() respects depth limit (no infinite loops)
- [ ] evaluate() logs all dispatch attempts

---

### T018: Implement ConditionEvaluator Helper

**Purpose**: Evaluate dispatch conditions against events and team state.

**Steps**:

1. Add to `src/operations/dispatch-engine.ts`:

```typescript
function evaluateCondition(
  condition: DispatchCondition,
  event: DispatchEvent,
  teamName: string,
): boolean {
  if (condition.type === 'simple_match') {
    // Compare event payload field against value
    const fieldValue = getNestedField(event.payload, condition.field || '');
    return compare(fieldValue, condition.operator, condition.value);
  }

  if (condition.type === 'resource_count') {
    // Count resources and compare
    const count = getResourceCount(condition.resource, teamName);
    return compare(count, condition.operator, condition.value);
  }

  return false;
}
```

2. Implement helper functions:
   - `getNestedField(obj, path)` - dot-notation field access (e.g., "priority")
   - `compare(left, operator, right)` - comparison operators (eq, neq, gt, lt, gte, lte)
   - `getResourceCount(resource, teamName)` - count unblocked_tasks or active_agents

3. For `getResourceCount`:
   - 'unblocked_tasks': use pattern from workflow-monitor.ts countUnblockedPendingTasks
   - 'active_agents': count team members (from TeamConfig.members.length - 1)

**Validation**:
- [ ] simple_match with eq operator works
- [ ] simple_match with gt operator works
- [ ] resource_count for unblocked_tasks returns correct count
- [ ] resource_count for active_agents returns correct count
- [ ] Missing field returns false (not crash)
- [ ] Unknown condition type returns false

---

### T019: Implement ActionExecutor

**Purpose**: Execute dispatch actions (assign task, notify leader, log).

**Steps**:

1. Add to `src/operations/dispatch-engine.ts`:

```typescript
async function executeAction(
  action: DispatchAction,
  event: DispatchEvent,
  teamName: string,
): Promise<{ success: boolean; details: string }> {
  switch (action.type) {
    case 'assign_task':
      return assignTaskAction(event, teamName);
    case 'notify_leader':
      return notifyLeaderAction(event, teamName, action.params);
    case 'log':
      return logAction(event, action.params);
    default:
      return { success: false, details: `Unknown action type` };
  }
}
```

2. Implement each action:

**assign_task**:
- Find idle agents on the team (via AgentOperations.listAgents)
- Find highest-priority unblocked pending task
- Call TaskOperations.claimTask to assign
- Return success/failure

**notify_leader**:
- Load team config to get leader ID
- Send message via TeamOperations._sendTypedMessage
- Include event details in message

**log**:
- Console.log the event with timestamp and details
- Always returns success

**Validation**:
- [ ] assign_task with idle agent and pending task succeeds
- [ ] assign_task with no idle agents returns failure with details
- [ ] assign_task with no pending tasks returns failure with details
- [ ] notify_leader sends message to team leader
- [ ] log action always succeeds
- [ ] Unknown action type returns failure

---

### T020: Implement Dispatch Logging with Ring Buffer

**Purpose**: Record dispatch actions with a 500-entry cap per team.

**Steps**:

1. Add to `src/operations/dispatch-engine.ts`:

```typescript
const DISPATCH_LOG_MAX = 500;

function appendDispatchLog(
  teamName: string,
  entry: DispatchLogEntry,
  projectRoot?: string,
): void {
  const configPath = getTeamConfigPath(teamName, projectRoot);
  const lockPath = getTeamLockPath(teamName, projectRoot);

  lockedUpdate(lockPath, configPath, TeamConfigSchema, (config) => {
    const log = [...(config.dispatchLog || []), entry];
    // Ring buffer: evict oldest entries beyond cap
    const trimmed = log.length > DISPATCH_LOG_MAX
      ? log.slice(log.length - DISPATCH_LOG_MAX)
      : log;
    return { ...config, dispatchLog: trimmed };
  });
}
```

2. Call `appendDispatchLog` from the evaluate method after each rule fires.

**Validation**:
- [ ] Log entry is written after dispatch
- [ ] Log entries beyond 500 are evicted (oldest first)
- [ ] Log entry contains ruleId, eventType, success, details, timestamp

---

### T021: Wire DispatchEngine to EventBus Subscriptions

**Purpose**: Connect the dispatch engine to receive events from the bus.

**Steps**:

1. Create an initialization function:

```typescript
export function initDispatchEngine(): void {
  const eventTypes: DispatchEventType[] = [
    'task.created', 'task.completed', 'task.unblocked',
    'agent.idle', 'agent.terminated', 'session.idle',
  ];

  for (const eventType of eventTypes) {
    EventBus.subscribe(eventType, async (event) => {
      await DispatchEngine.evaluate(event);
    });
  }
}
```

2. Call `initDispatchEngine()` from the plugin entry point (`src/index.ts`) during initialization.

**Validation**:
- [ ] After init, EventBus events flow to DispatchEngine.evaluate
- [ ] All relevant event types are subscribed
- [ ] Subscription errors don't crash the plugin

---

### T022: Write Dispatch Engine Unit Tests

**Purpose**: Validate condition evaluation, action execution, and logging.

**Steps**:

1. Create `tests/dispatch-engine.test.ts`:
   - Test ConditionEvaluator with simple_match (eq, gt, lt, neq)
   - Test ConditionEvaluator with resource_count
   - Test ActionExecutor assign_task (success and failure cases)
   - Test ActionExecutor notify_leader
   - Test ActionExecutor log
   - Test DispatchEngine.evaluate with matching rule
   - Test DispatchEngine.evaluate with no matching rules
   - Test DispatchEngine.evaluate with disabled rule (skipped)
   - Test depth guard prevents infinite loops
   - Test dispatch log ring buffer capping at 500

**File**: `tests/dispatch-engine.test.ts`

**Validation**:
- [ ] All tests pass with `bun test tests/dispatch-engine.test.ts`
- [ ] Existing tests still pass

## Definition of Done

- [ ] DispatchEngine module created at `src/operations/dispatch-engine.ts`
- [ ] ConditionEvaluator handles simple_match and resource_count
- [ ] ActionExecutor handles assign_task, notify_leader, and log
- [ ] Dispatch log appends with ring buffer capping
- [ ] DispatchEngine wired to EventBus subscriptions
- [ ] initDispatchEngine() callable from plugin entry point
- [ ] All tests pass
- [ ] `bun test` (full suite) passes
- [ ] `bun x tsc` compiles without errors
- [ ] No lint errors

## Risks

- **Circular events**: assign_task triggers task state change -> may emit new event -> re-enters
  dispatch engine. The depth guard (max 3) prevents infinite loops.
- **Missing team config**: Team may be deleted between event emission and dispatch evaluation.
  Handle gracefully with early return.
- **File locking contention**: Dispatch log writes compete with other config updates.
  Use existing lockedUpdate pattern.

## Reviewer Guidance

- Verify depth guard prevents infinite recursion
- Check that action failures are logged, not thrown
- Ensure assign_task uses existing TaskOperations.claimTask (atomic)
- Verify no `as any` or type suppression
