---
work_package_id: "WP01"
title: "Infrastructure and Data Model"
lane: "planned"
dependencies: []
subtasks: ["T001", "T002", "T003", "T004", "T005", "T006", "T007", "T008", "T009"]
history:
  - date: "2026-02-10"
    action: "created"
    by: "planner"
---

# WP01: Infrastructure and Data Model

**Implementation command**: `spec-kitty implement WP01`

## Objective

Add Zod schemas for dispatch event types, events, conditions, actions, rules, and log entries
to `src/types/schemas.ts`. Extend TeamConfigSchema with optional dispatch fields. Create an
in-process EventBus singleton for typed pub/sub. Write unit tests for all new schemas and the
event bus.

## Context

- **Existing schemas**: `src/types/schemas.ts` (377 lines) defines TeamConfig, Task, AgentState, etc.
- **Pattern**: All schemas use Zod with explicit type inference via `z.infer<typeof Schema>`
- **Re-exports**: `src/types/index.ts` re-exports everything from schemas.ts
- **Backward compat**: New fields on TeamConfig MUST be `.optional()` or have `.default([])`
- **Operations pattern**: Singleton objects exported as `const X = { ... }` (see team.ts, task.ts)

## Subtasks

### T001: Add DispatchEventType Enum Schema

**Purpose**: Define the taxonomy of events the dispatch system handles.

**Steps**:

1. Add at end of `src/types/schemas.ts`:

```typescript
// --- Dispatch Event Types ---
export const DispatchEventTypeSchema = z.enum([
  'task.created',
  'task.completed',
  'task.unblocked',
  'agent.idle',
  'agent.active',
  'agent.terminated',
  'team.created',
  'session.idle',
]);
export type DispatchEventType = z.infer<typeof DispatchEventTypeSchema>;
```

**Validation**:
- [ ] `DispatchEventTypeSchema.parse('task.completed')` succeeds
- [ ] `DispatchEventTypeSchema.parse('invalid.event')` throws ZodError

---

### T002: Add DispatchEvent Schema

**Purpose**: Typed envelope for events emitted through the bus.

**Steps**:

1. Add after DispatchEventType in `src/types/schemas.ts`:

```typescript
// --- Dispatch Event ---
export const DispatchEventSchema = z.object({
  id: z.string().min(1, 'Event ID must be non-empty'),
  type: DispatchEventTypeSchema,
  teamName: z.string().min(1, 'Team name must be non-empty'),
  timestamp: z.string().datetime({ message: 'timestamp must be ISO 8601' }),
  payload: z.record(z.unknown()).default({}),
});
export type DispatchEvent = z.infer<typeof DispatchEventSchema>;
```

**Dependencies**: Requires T001 (DispatchEventType).

**Validation**:
- [ ] Valid event with all fields parses
- [ ] Event with empty payload `{}` parses
- [ ] Event with missing type rejected

---

### T003: Add DispatchCondition Schema

**Purpose**: Define filter predicates for dispatch rules.

**Steps**:

1. Add after DispatchEvent in `src/types/schemas.ts`:

```typescript
// --- Dispatch Condition ---
export const DispatchConditionSchema = z.object({
  type: z.enum(['simple_match', 'resource_count']),
  field: z.string().optional(),
  resource: z.enum(['unblocked_tasks', 'active_agents']).optional(),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte']),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type DispatchCondition = z.infer<typeof DispatchConditionSchema>;
```

**Validation**:
- [ ] simple_match condition with field parses
- [ ] resource_count condition with resource parses
- [ ] Missing operator rejected

---

### T004: Add DispatchAction Schema

**Purpose**: Define what happens when a dispatch rule fires.

**Steps**:

1. Add after DispatchCondition in `src/types/schemas.ts`:

```typescript
// --- Dispatch Action ---
export const DispatchActionSchema = z.object({
  type: z.enum(['assign_task', 'notify_leader', 'log']),
  params: z.record(z.unknown()).optional(),
});
export type DispatchAction = z.infer<typeof DispatchActionSchema>;
```

**Validation**:
- [ ] Action with type 'assign_task' parses
- [ ] Action with params parses
- [ ] Invalid action type rejected

---

### T005: Add DispatchRule Schema

**Purpose**: The core ECA (Event-Condition-Action) rule definition.

**Steps**:

1. Add after DispatchAction in `src/types/schemas.ts`:

```typescript
// --- Dispatch Rule ---
export const DispatchRuleSchema = z.object({
  id: z.string().min(1, 'Rule ID must be non-empty'),
  eventType: DispatchEventTypeSchema,
  condition: DispatchConditionSchema.optional(),
  action: DispatchActionSchema,
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
});
export type DispatchRule = z.infer<typeof DispatchRuleSchema>;
```

**Dependencies**: Requires T001, T003, T004.

**Validation**:
- [ ] Minimal rule (id, eventType, action) parses with defaults
- [ ] Rule with condition parses
- [ ] Rule with priority 10 parses
- [ ] Disabled rule (enabled: false) parses

---

### T006: Add DispatchLogEntry Schema

**Purpose**: Audit trail for dispatch actions taken.

**Steps**:

1. Add after DispatchRule in `src/types/schemas.ts`:

```typescript
// --- Dispatch Log Entry ---
export const DispatchLogEntrySchema = z.object({
  id: z.string().min(1, 'Log entry ID must be non-empty'),
  timestamp: z.string().datetime({ message: 'timestamp must be ISO 8601' }),
  ruleId: z.string().min(1),
  eventType: DispatchEventTypeSchema,
  success: z.boolean(),
  details: z.string().optional(),
  actionResult: z.unknown().optional(),
});
export type DispatchLogEntry = z.infer<typeof DispatchLogEntrySchema>;
```

**Validation**:
- [ ] Valid log entry parses
- [ ] Log entry with actionResult parses
- [ ] Missing ruleId rejected

---

### T007: Extend TeamConfigSchema with Dispatch Fields

**Purpose**: Store dispatch rules and log per team.

**Steps**:

1. Add two new optional fields to TeamConfigSchema in `src/types/schemas.ts`:

```typescript
// Add to existing TeamConfigSchema.object():
dispatchRules: z.array(DispatchRuleSchema).default([]),
dispatchLog: z.array(DispatchLogEntrySchema).default([]),
```

**CRITICAL**: DispatchRuleSchema and DispatchLogEntrySchema must be defined BEFORE
TeamConfigSchema. Since TeamConfig is near the top of schemas.ts, either:
- Move the new dispatch schemas ABOVE TeamConfig, OR
- Place them after TeamMemberSchema but before TeamConfigSchema

**Validation**:
- [ ] Existing TeamConfig without dispatch fields still parses (backward compat!)
- [ ] TeamConfig with empty dispatchRules array parses
- [ ] TeamConfig with a dispatch rule in the array parses
- [ ] TeamConfig with dispatch log entries parses

---

### T008: Create EventBus Singleton Module

**Purpose**: In-process typed pub/sub for dispatch events.

**Steps**:

1. Create `src/operations/event-bus.ts`:

```typescript
import type { DispatchEvent, DispatchEventType } from '../types/schemas';

type EventHandler = (event: DispatchEvent) => void | Promise<void>;

export const EventBus = {
  _handlers: new Map<DispatchEventType, Set<EventHandler>>(),

  subscribe(eventType: DispatchEventType, handler: EventHandler): () => void {
    if (!EventBus._handlers.has(eventType)) {
      EventBus._handlers.set(eventType, new Set());
    }
    EventBus._handlers.get(eventType)!.add(handler);
    // Return unsubscribe function
    return () => { EventBus._handlers.get(eventType)?.delete(handler); };
  },

  async emit(event: DispatchEvent): Promise<void> {
    const handlers = EventBus._handlers.get(event.type);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[EventBus] Handler error for ${event.type}: ${msg}`);
      }
    }
  },

  clear(): void {
    EventBus._handlers.clear();
  },
};
```

2. Export from `src/operations/index.ts`
3. Re-export new types from `src/types/index.ts`

**Validation**:
- [ ] subscribe() returns an unsubscribe function
- [ ] emit() calls all subscribed handlers for the event type
- [ ] Handler errors are caught and logged, not thrown
- [ ] clear() removes all handlers
- [ ] Handlers for different event types don't interfere

---

### T009: Write Schema and EventBus Unit Tests

**Purpose**: Validate all new schemas and event bus behavior.

**Steps**:

1. Create `tests/dispatch-schemas.test.ts`:
   - Test DispatchEventType (valid/invalid values)
   - Test DispatchEvent (valid, missing fields)
   - Test DispatchCondition (simple_match, resource_count, invalid)
   - Test DispatchAction (all types, invalid type)
   - Test DispatchRule (minimal with defaults, full, invalid)
   - Test DispatchLogEntry (valid, invalid)
   - Test TeamConfig backward compat (old config parses, config with dispatch fields parses)

2. Create `tests/event-bus.test.ts`:
   - Test subscribe/emit cycle
   - Test multiple handlers
   - Test unsubscribe
   - Test error handling in handlers
   - Test clear()
   - Test emit with no subscribers (no error)

**Files**: `tests/dispatch-schemas.test.ts`, `tests/event-bus.test.ts`

**Validation**:
- [ ] All tests pass with `bun test tests/dispatch-schemas.test.ts tests/event-bus.test.ts`
- [ ] Backward compatibility confirmed for existing TeamConfig

## Definition of Done

- [ ] All new dispatch schemas added to `src/types/schemas.ts`
- [ ] TeamConfigSchema extended with dispatchRules and dispatchLog
- [ ] EventBus singleton created at `src/operations/event-bus.ts`
- [ ] Types re-exported from `src/types/index.ts`
- [ ] Operations exported from `src/operations/index.ts`
- [ ] Schema and EventBus tests pass
- [ ] `bun test` (full suite) passes
- [ ] `bun x tsc` compiles without errors
- [ ] No lint errors

## Risks

- **Schema ordering**: Dispatch schemas must be defined before TeamConfigSchema in the file
- **Backward compat**: If TeamConfigSchema changes break existing TeamConfig parsing,
  all team operations will fail. Test with existing team config format.
- **EventBus error isolation**: Handler errors must not crash the emit loop

## Reviewer Guidance

- Verify backward compatibility: parse an old TeamConfig JSON without dispatch fields
- Check that defaults are sensible (dispatchRules: [], dispatchLog: [])
- Ensure EventBus properly isolates handler errors
- Ensure no `as any` or type suppression
