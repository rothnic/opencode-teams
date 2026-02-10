# Implementation Plan - Event-Driven Agent Dispatch (Feature 005)

**Feature Branch**: 005-event-driven-agent-dispatch
**Spec**: [spec.md](./spec.md)

## 1. Architecture Overview

This feature introduces an event-driven architecture to `opencode-teams`. We will implement an in-process **Event Bus** that decouples state changes (Tasks, Agents, Session) from reaction logic (Dispatch Rules).

### Core Components

1.  **Event Bus (`src/operations/event-bus.ts`)**: A singleton typed `EventEmitter` that carries system events.
2.  **Dispatch Engine (`src/operations/dispatch-engine.ts`)**: A service that listens to the Event Bus, evaluates `DispatchRules` defined in `TeamConfig`, and executes actions.
3.  **Event Sources**: Existing operations (`TaskOperations`, `AgentOperations`) and plugin hooks (`src/index.ts`) will be updated to emit events.

### Data Flow

```mermaid
graph LR
    A[Task/Agent Ops] -- emit --> B(Event Bus)
    C[Plugin Hooks] -- emit --> B
    B -- notify --> D[Dispatch Engine]
    D -- read --> E[Team Config (Rules)]
    D -- execute --> F[Dispatch Actions]
    F -- update --> A
    F -- log --> G[Dispatch Log]
```

## 2. Data Model Changes

We will extend `src/types/schemas.ts` with new Zod schemas.

### 2.1 New Schemas

**`DispatchEventType`**
```typescript
z.enum([
  'task.created',
  'task.completed',
  'task.unblocked',
  'agent.idle',
  'agent.active',
  'agent.terminated',
  'team.created',
  'session.idle'
])
```

**`DispatchEvent`**
```typescript
z.object({
  id: z.string().uuid(),
  type: DispatchEventTypeSchema,
  teamName: z.string(),
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()) // Typed based on event type in implementation
})
```

**`DispatchCondition`**
```typescript
z.object({
  type: z.enum(['simple_match', 'resource_count']),
  field: z.string().optional(), // For simple_match (e.g., "payload.priority")
  resource: z.enum(['unblocked_tasks', 'active_agents']).optional(), // For resource_count
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains']),
  value: z.union([z.string(), z.number(), z.boolean()])
})
```

**`DispatchAction`**
```typescript
z.object({
  type: z.enum(['assign_task', 'notify_leader', 'log']),
  params: z.record(z.unknown()).optional()
})
```

**`DispatchRule`**
```typescript
z.object({
  id: z.string().uuid(),
  eventType: DispatchEventTypeSchema,
  condition: DispatchConditionSchema.optional(),
  action: DispatchActionSchema,
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true)
})
```

**`DispatchLogEntry`**
```typescript
z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  ruleId: z.string(),
  eventType: DispatchEventTypeSchema,
  success: z.boolean(),
  details: z.string().optional(),
  actionResult: z.unknown().optional()
})
```

### 2.2 Extension of `TeamConfig`

```typescript
// Extended TeamConfigSchema
dispatchRules: z.array(DispatchRuleSchema).default([]),
dispatchLog: z.array(DispatchLogEntrySchema).default([]), // Capped at 500 in operations
```

## 3. Implementation Steps

### Phase 1: Event Bus & Types
**Goal**: Create the infrastructure for emitting and listening to typed events.

1.  **Define Schemas**: Update `src/types/schemas.ts` with the new types defined above.
2.  **Create Event Bus**: Implement `src/operations/event-bus.ts`.
    *   Singleton instance.
    *   Methods: `emit(event)`, `subscribe(type, handler)`.
    *   Async handling to ensure the main thread isn't blocked, but with `await` support where strict ordering is needed.

### Phase 2: Instrumenting Event Sources
**Goal**: Emit events from existing operations.

1.  **Update `TaskOperations.ts`**:
    *   Emit `task.created` in `createTask`.
    *   Emit `task.completed` in `updateTask`.
    *   **Crucial**: In `updateTask`, when cascading updates unblock a dependency, emit `task.unblocked`.
2.  **Update `AgentOperations.ts`**:
    *   Emit `agent.idle` in `updateHeartbeat`.
    *   Emit `agent.terminated` in `forceKill`.
3.  **Update `src/index.ts`**:
    *   Emit `session.idle` from the existing hook.

### Phase 3: Dispatch Engine & Rules
**Goal**: Implement the logic to process events against rules.

1.  **Create `src/operations/dispatch-engine.ts`**:
    *   `evaluate(event)` method.
    *   Logic:
        *   Load team config.
        *   Filter rules by `eventType` and `enabled`.
        *   Sort by `priority`.
        *   Check `condition` (implement `ConditionEvaluator` helper).
        *   Execute `action` (implement `ActionExecutor` helper).
        *   Log result to `dispatchLog` in `TeamConfig`.
2.  **Implement Actions**:
    *   `assign_task`: Find suitable task/agent and call `TaskOperations.claimTask`.
    *   `notify_leader`: Use `TeamOperations.sendMessage`.
    *   `log`: Simple console/file logging.

### Phase 4: Tools & API
**Goal**: Expose rule management to agents.

1.  **Update `TeamOperations.ts`**:
    *   `addDispatchRule(teamName, rule)`
    *   `removeDispatchRule(teamName, ruleId)`
    *   `listDispatchRules(teamName)`
    *   `getDispatchLog(teamName)`
2.  **Register Tools in `src/index.ts`**:
    *   `add-dispatch-rule`
    *   `remove-dispatch-rule`
    *   `list-dispatch-rules`
    *   `get-dispatch-log`

## 4. Work Packages

### WP1: Infrastructure & Data Model
*   Update `src/types/schemas.ts`.
*   Create `src/operations/event-bus.ts`.
*   Unit tests for schemas and event bus.

### WP2: Event Emission
*   Modify `TaskOperations.ts` and `AgentOperations.ts` to emit events.
*   Integration tests to verify events are fired correctly during standard operations.

### WP3: Dispatch Engine Core
*   Create `src/operations/dispatch-engine.ts`.
*   Implement condition evaluation logic.
*   Implement action execution logic (`assign_task`, `notify_leader`).
*   Implement logging.

### WP4: Tooling & Integration
*   Implement `add/remove/list` operations in `TeamOperations`.
*   Register tools in `src/index.ts`.
*   End-to-end test: Create a rule, trigger an event, verify action.

## 5. Risk Assessment

*   **Circular Events**: An action (e.g., `assign_task`) triggers an event (`task.updated`) which might trigger another rule.
    *   *Mitigation*: We will implement a depth limit or "loop detection" in the Dispatch Engine if necessary. For now, careful rule design and distinct event types (`task.assigned` vs `task.unblocked`) should suffice.
*   **Performance**: High event volume could slow down operations.
    *   *Mitigation*: Dispatch Engine processing should be lightweight. File writes for logs should be batched or carefully managed (maybe not strictly atomic for every single log if volume is high, but we'll stick to safety first).
*   **Race Conditions**: Two agents becoming idle simultaneously.
    *   *Mitigation*: The `TaskOperations.claimTask` is already atomic/locked. The Dispatch Engine will run sequentially per event in the main process loop.

## 6. Verification Plan

*   **Automated Tests**:
    *   Unit tests for `EventBus`.
    *   Integration tests mocking `TaskOperations` to verify `task.unblocked` emission.
    *   Scenario tests: "Given Task A blocks B, when A completes, B unblocks and auto-assigns."
*   **Manual Verification**:
    *   Use `add-dispatch-rule` to create a "notify on idle" rule.
    *   Wait for agent to go idle.
    *   Verify message received.
