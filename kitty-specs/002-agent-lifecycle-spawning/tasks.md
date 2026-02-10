# Tasks: Agent Lifecycle and Spawning

**Feature**: 002-agent-lifecycle-spawning
**Date**: 2026-02-10
**Source**: plan.md, data-model.md, contracts/*.md
**Total Work Packages**: 9
**Total Subtasks**: 55

## Dependency Graph

```
WP01 (Schemas)  ──┐
                   ├──► WP05 (Agent Spawn) ──┐
WP02 (Paths/Color) ┤                         │
                   ├──► WP06 (Agent Kill)  ──┤
WP03 (Server Mgr) ─┤                         ├──► WP08 (Tools) ──► WP09 (Integration Tests)
                   ├──► WP07 (Heartbeat)  ───┘
WP04 (Tmux Ext) ───┘
```

## Phase 1 — Foundation (Parallelizable)

### WP01: Schemas and Types

**File**: `tasks/WP01-schemas-and-types.md`
**Target**: `src/types/schemas.ts`, `src/types/index.ts`
**Depends on**: Nothing
**Blocks**: WP03, WP05, WP06, WP07, WP08

| ID | Subtask | Target File |
|----|---------|-------------|
| T001 | Add `AgentStatusSchema` enum | `src/types/schemas.ts` |
| T002 | Add `AgentStateSchema` object | `src/types/schemas.ts` |
| T003 | Add `ServerInfoSchema` object | `src/types/schemas.ts` |
| T004 | Add `HeartbeatSourceSchema` enum and `HeartbeatRecordSchema` object | `src/types/schemas.ts` |
| T005 | Add `ShutdownPhaseSchema` enum and `ShutdownRequestSchema` object | `src/types/schemas.ts` |
| T006 | Re-export all new types from `types/index.ts` | `src/types/index.ts` |

### WP02: Storage Paths and Color Pool

**File**: `tasks/WP02-storage-paths-and-color-pool.md`
**Target**: `src/utils/storage-paths.ts`, `src/utils/color-pool.ts`, `src/utils/index.ts`
**Depends on**: Nothing
**Blocks**: WP05, WP06, WP07

| ID | Subtask | Target File |
|----|---------|-------------|
| T007 | Add agent directory/file/lock path functions | `src/utils/storage-paths.ts` |
| T008 | Add server directory/file/log path functions | `src/utils/storage-paths.ts` |
| T009 | Add color pool path function | `src/utils/storage-paths.ts` |
| T010 | Create `color-pool.ts` with `COLOR_PALETTE`, `ColorPoolSchema`, and `allocateColor()`/`releaseColor()` | `src/utils/color-pool.ts` |
| T011 | Re-export color-pool from `utils/index.ts` | `src/utils/index.ts` |
| T012 | Add unit tests for new storage path functions | `tests/storage-paths-agent.test.ts` |
| T013 | Add unit tests for color pool allocation/release/exhaustion | `tests/color-pool.test.ts` |

### WP03: Server Manager Operations

**File**: `tasks/WP03-server-manager.md`
**Target**: `src/operations/server-manager.ts`, `src/operations/index.ts`
**Depends on**: WP01 (ServerInfoSchema), WP02 (server paths)
**Blocks**: WP05, WP07

| ID | Subtask | Target File |
|----|---------|-------------|
| T014 | Create module with `portForProject()` hash calculation and SDK client factory | `src/operations/server-manager.ts` |
| T015 | Implement `ensureRunning()` with TCP + SDK health checks and zombie recovery | `src/operations/server-manager.ts` |
| T016 | Implement `stop()` with SIGTERM → grace → SIGKILL | `src/operations/server-manager.ts` |
| T017 | Implement `createSession()` via `client.session.new()` | `src/operations/server-manager.ts` |
| T018 | Implement `sendPromptReliable()` with 3-retry + message count verification | `src/operations/server-manager.ts` |
| T019 | Implement `status()` with PID alive + port probe | `src/operations/server-manager.ts` |
| T020 | Add unit tests for port calculation and server state management | `tests/server-manager.test.ts` |

### WP04: Tmux Operations Extensions

**File**: `tasks/WP04-tmux-operations.md`
**Target**: `src/operations/tmux.ts`
**Depends on**: Nothing
**Blocks**: WP05, WP06

| ID | Subtask | Target File |
|----|---------|-------------|
| T021 | Add `splitWindow(session, workdir)` returning pane ID via `-PF '#{pane_id}'` | `src/operations/tmux.ts` |
| T022 | Add `sendKeys(paneId, command, enterKey)` | `src/operations/tmux.ts` |
| T023 | Add `capturePaneOutput(paneId, lines)` returning captured text | `src/operations/tmux.ts` |
| T024 | Add `setPaneOption(paneId, key, value)` and `getPaneOption(paneId, key)` | `src/operations/tmux.ts` |
| T025 | Add `killPane(paneId)` and `setPaneTitle(paneId, title)` | `src/operations/tmux.ts` |
| T026 | Add `isInsideTmux()` check via `$TMUX` env var | `src/operations/tmux.ts` |
| T027 | Add unit tests for all new tmux methods | `tests/tmux-operations-ext.test.ts` |

## Phase 2 — Core Operations (Partially Parallelizable)

### WP05: Agent Spawn Operations

**File**: `tasks/WP05-agent-spawn.md`
**Target**: `src/operations/agent.ts`, `src/operations/index.ts`
**Depends on**: WP01, WP02, WP03, WP04
**Blocks**: WP06, WP07, WP08

| ID | Subtask | Target File |
|----|---------|-------------|
| T028 | Create `agent.ts` with module structure and exports | `src/operations/agent.ts` |
| T029 | Implement `registerAgent()` — write state file + add to TeamConfig.members | `src/operations/agent.ts` |
| T030 | Implement `spawnAgent()` orchestration (server → session → pane → prompt) | `src/operations/agent.ts` |
| T031 | Implement state helpers: `getAgentState()`, `listAgents()`, `updateAgentState()` | `src/operations/agent.ts` |
| T032 | Implement `findAgentBySessionId()` lookup across all agent files | `src/operations/agent.ts` |
| T033 | Add unit tests for agent registration and state helpers | `tests/agent-operations.test.ts` |

### WP06: Agent Kill and Task Reassignment

**File**: `tasks/WP06-agent-kill.md`
**Target**: `src/operations/agent.ts`, `src/operations/task.ts`
**Depends on**: WP01, WP02, WP04, WP05
**Blocks**: WP08

| ID | Subtask | Target File |
|----|---------|-------------|
| T034 | Implement `forceKill()` — kill pane, cleanup state, reassign tasks | `src/operations/agent.ts` |
| T035 | Implement graceful shutdown request flow — create ShutdownRequest + deliver to inbox | `src/operations/agent.ts` |
| T036 | Add `reassignAgentTasks()` to TaskOperations — reset owned in_progress tasks to pending | `src/operations/task.ts` |
| T037 | Implement cleanup helpers — release color, remove from TeamConfig, decrement sessions | `src/operations/agent.ts` |
| T038 | Add unit tests for kill flows and task reassignment | `tests/agent-kill.test.ts` |

### WP07: Heartbeat and Monitoring

**File**: `tasks/WP07-heartbeat-monitoring.md`
**Target**: `src/operations/agent.ts`
**Depends on**: WP01, WP02, WP03, WP05
**Blocks**: WP08

| ID | Subtask | Target File |
|----|---------|-------------|
| T039 | Implement `updateHeartbeat()` — update heartbeatTs, reset consecutiveMisses | `src/operations/agent.ts` |
| T040 | Implement `startHeartbeatMonitor()` — SSE event subscription loop | `src/operations/agent.ts` |
| T041 | Implement `sweepStaleAgents()` — 15s interval, 60s threshold, 2-miss grace | `src/operations/agent.ts` |
| T042 | Implement `handleSessionError()` — classify error type and route recovery | `src/operations/agent.ts` |
| T043 | Implement context limit recovery — new session, capture pane, re-prompt | `src/operations/agent.ts` |
| T044 | Add unit tests for heartbeat, sweep, and error classification | `tests/agent-heartbeat.test.ts` |

## Phase 3 — Integration Layer

### WP08: Tool Definitions

**File**: `tasks/WP08-tool-definitions.md`
**Target**: `src/tools/*.ts`, `src/index.ts`
**Depends on**: WP05, WP06, WP07
**Blocks**: WP09

| ID | Subtask | Target File |
|----|---------|-------------|
| T045 | Create `spawn-agent.ts` tool with Zod input/output schemas | `src/tools/spawn-agent.ts` |
| T046 | Create `kill-agent.ts` tool with graceful/force modes | `src/tools/kill-agent.ts` |
| T047 | Create `heartbeat.ts` tool with next-deadline calculation | `src/tools/heartbeat.ts` |
| T048 | Create `get-agent-status.ts` tool with summary aggregation | `src/tools/get-agent-status.ts` |
| T049 | Register all new tools in `src/index.ts` + add SSE monitoring hook | `src/index.ts` |
| T050 | Update `src/tools/index.ts` barrel exports | `src/tools/index.ts` |

## Phase 4 — Verification

### WP09: Integration Tests

**File**: `tasks/WP09-integration-tests.md`
**Target**: `tests/`
**Depends on**: WP08
**Blocks**: Nothing

| ID | Subtask | Target File |
|----|---------|-------------|
| T051 | End-to-end spawn flow test (server + session + pane + prompt) | `tests/agent-spawn-e2e.test.ts` |
| T052 | End-to-end kill flow test (graceful 3-phase + force) | `tests/agent-kill-e2e.test.ts` |
| T053 | Heartbeat monitoring integration test (SSE + sweep + detection) | `tests/heartbeat-e2e.test.ts` |
| T054 | Task reassignment on agent death test | `tests/task-reassignment.test.ts` |
| T055 | Error recovery integration test (context limit, transient errors) | `tests/error-recovery-e2e.test.ts` |

## Parallelization Strategy

```
Time ──►
Phase 1:  [WP01] [WP02] [WP04]  (fully parallel — no deps)
          [WP03 waits on WP01+WP02]
Phase 2:  [WP05 waits on WP01-04]
          [WP06 waits on WP01,02,04,05] [WP07 waits on WP01-03,05]
Phase 3:  [WP08 waits on WP05-07]
Phase 4:  [WP09 waits on WP08]
```

**Maximum parallelism**: 3 workers in Phase 1 (WP01, WP02, WP04 simultaneously).
