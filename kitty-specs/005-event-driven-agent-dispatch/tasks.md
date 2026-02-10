# Tasks: Event-Driven Agent Dispatch

**Feature**: 005-event-driven-agent-dispatch
**Date**: 2026-02-10
**Work Packages**: 4

## Subtask Registry

| ID | Description | WP | Parallel |
|----|-------------|-----|---------|
| T001 | Add DispatchEventType enum schema | WP01 | [P] |
| T002 | Add DispatchEvent schema | WP01 | |
| T003 | Add DispatchCondition schema | WP01 | [P] |
| T004 | Add DispatchAction schema | WP01 | [P] |
| T005 | Add DispatchRule schema | WP01 | |
| T006 | Add DispatchLogEntry schema | WP01 | [P] |
| T007 | Extend TeamConfigSchema with dispatch fields | WP01 | |
| T008 | Create EventBus singleton module | WP01 | |
| T009 | Write schema and event bus unit tests | WP01 | |
| T010 | Emit task.completed in TaskOperations.updateTask | WP02 | |
| T011 | Emit task.unblocked on dependency cascade | WP02 | |
| T012 | Emit task.created in TaskOperations.createTask | WP02 | [P] |
| T013 | Emit agent.idle in AgentOperations.updateHeartbeat | WP02 | [P] |
| T014 | Emit agent.terminated in AgentOperations.forceKill | WP02 | [P] |
| T015 | Emit session.idle from plugin hook | WP02 | [P] |
| T016 | Write event emission integration tests | WP02 | |
| T017 | Create DispatchEngine module with evaluate method | WP03 | |
| T018 | Implement ConditionEvaluator helper | WP03 | |
| T019 | Implement ActionExecutor (assign_task, notify_leader, log) | WP03 | |
| T020 | Implement dispatch logging with ring buffer (500 cap) | WP03 | |
| T021 | Wire DispatchEngine to EventBus subscriptions | WP03 | |
| T022 | Write dispatch engine unit tests | WP03 | |
| T023 | Add addDispatchRule operation | WP04 | [P] |
| T024 | Add removeDispatchRule operation | WP04 | [P] |
| T025 | Add listDispatchRules operation | WP04 | [P] |
| T026 | Add getDispatchLog operation | WP04 | [P] |
| T027 | Register dispatch tools in plugin entry point | WP04 | |
| T028 | Update operations/index.ts barrel exports | WP04 | |
| T029 | Update skill documentation with dispatch tools | WP04 | |
| T030 | Write E2E integration test (rule -> event -> action) | WP04 | |

## Phase 1: Foundation

### WP01 - Infrastructure and Data Model

**Goal**: Add Zod schemas for dispatch events, rules, conditions, actions, and log entries.
Create EventBus singleton. Extend TeamConfig with dispatch fields.

**Priority**: P0 (blocks all other WPs)
**Dependencies**: None
**Subtasks**: T001-T009 (9 subtasks)

**Implementation sketch**:

1. Add new dispatch schemas to `src/types/schemas.ts` after existing schemas
2. Extend TeamConfigSchema with optional dispatchRules and dispatchLog arrays
3. Create `src/operations/event-bus.ts` - typed pub/sub singleton
4. Re-export new types from `src/types/index.ts`
5. Write unit tests for all schemas and event bus behavior

**Parallel opportunities**: T001, T003, T004, T006 are independent schema additions.

**Risks**:
- Backward compatibility: existing TeamConfig files must parse without dispatch fields
- EventBus must handle errors in subscribers without crashing

**Implementation command**: `spec-kitty implement WP01`

---

### WP02 - Event Emission

**Goal**: Instrument existing TaskOperations and AgentOperations to emit typed events
through the EventBus when state changes occur.

**Priority**: P1
**Dependencies**: WP01
**Subtasks**: T010-T016 (7 subtasks)

**Implementation sketch**:

1. Modify `TaskOperations.updateTask` to emit `task.completed` when status -> completed
2. Add unblock cascade detection: when a task completes, check which tasks had it as a dependency,
   emit `task.unblocked` for each newly unblocked task
3. Modify `TaskOperations.createTask` to emit `task.created`
4. Modify `AgentOperations.updateHeartbeat` to emit `agent.idle` on idle transition
5. Modify `AgentOperations.forceKill` to emit `agent.terminated`
6. Modify plugin `session.idle` hook to emit `session.idle` event
7. Write integration tests verifying events are emitted correctly

**Parallel opportunities**: T012-T015 are independent emission points. WP02 + WP03 run in parallel.

**Risks**:
- Must not break existing task/agent operation behavior
- Event emission must not add measurable latency to operations

**Implementation command**: `spec-kitty implement WP02 --base WP01`

---

### WP03 - Dispatch Engine Core

**Goal**: Create the dispatch engine that subscribes to EventBus events, evaluates rules
from TeamConfig, and executes actions (assign tasks, notify leader, log).

**Priority**: P1
**Dependencies**: WP01
**Subtasks**: T017-T022 (6 subtasks)

**Implementation sketch**:

1. Create `src/operations/dispatch-engine.ts` with `evaluate(event)` method
2. Implement ConditionEvaluator: simple_match (field comparison) and resource_count
   (query unblocked tasks or active agents count)
3. Implement ActionExecutor with three action types:
   - assign_task: find idle agent + highest-priority pending task, call TaskOperations.claimTask
   - notify_leader: send message via TeamOperations._sendTypedMessage
   - log: write to dispatch log
4. Implement ring buffer dispatch log (cap at 500 entries per team)
5. Subscribe DispatchEngine to EventBus for all dispatch event types
6. Write unit tests for condition evaluation, action execution, and log capping

**Parallel opportunities**: WP03 + WP02 run in parallel (both depend only on WP01).

**Risks**:
- Circular events: assign_task triggers task state change which emits event - need depth guard
- Must handle missing team config gracefully (team deleted mid-dispatch)
- Action failures must be logged, not thrown

**Implementation command**: `spec-kitty implement WP03 --base WP01`

---

## Phase 2: Integration

### WP04 - Tooling and Integration

**Goal**: Expose dispatch rule management as OpenCode tools. Write E2E tests.
Update barrel exports and skill documentation.

**Priority**: P2
**Dependencies**: WP02, WP03
**Subtasks**: T023-T030 (8 subtasks)

**Implementation sketch**:

1. Add dispatch rule CRUD to operations (addDispatchRule, removeDispatchRule,
   listDispatchRules, getDispatchLog) in a new `src/operations/dispatch-rules.ts`
2. Register 4 new tools in `src/index.ts`:
   - add-dispatch-rule
   - remove-dispatch-rule
   - list-dispatch-rules
   - get-dispatch-log
3. Export new modules from `src/operations/index.ts`
4. Update `skills/team-coordination/SKILL.md` with dispatch tool descriptions
5. Write E2E test: create rule, trigger event, verify action was taken

**Parallel opportunities**: T023-T026 are independent CRUD operations.

**Risks**:
- Tool registration must follow existing patterns exactly
- Rule validation must reject invalid event types and conditions at creation time
- Skill docs must be accurate

**Implementation command**: `spec-kitty implement WP04 --base WP03`

---

## Dependency Graph

```text
WP01 (Infrastructure & Data Model)
 |--- WP02 (Event Emission) ----\
 |                                |--- WP04 (Tooling & Integration)
 |--- WP03 (Dispatch Engine) ---/
```

## Parallelization Summary

- **Sequential**: WP01 must complete first
- **Parallel pair**: WP02 + WP03 (both depend only on WP01)
- **After WP02+WP03**: WP04 (depends on both)

## MVP Scope

WP01 + WP02 + WP03 provide the core value: typed events emitted from operations
and dispatch rules that react automatically. WP04 wires it into the plugin
as agent-accessible tools.
