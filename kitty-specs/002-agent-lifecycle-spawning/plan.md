# Implementation Plan: Agent Lifecycle and Spawning

**Branch**: `002-agent-lifecycle-spawning` | **Date**: 2026-02-10 | **Spec**: `kitty-specs/002-agent-lifecycle-spawning/spec.md`
**Input**: Feature specification from `kitty-specs/002-agent-lifecycle-spawning/spec.md`

## Summary

Implement comprehensive agent lifecycle management for the opencode-teams plugin, enabling dynamic spawning, monitoring, and termination of AI agents within tmux-based OpenCode sessions. The system uses a single OpenCode server per project (via `opencode serve`), provisions individual sessions via the `@opencode-ai/sdk`, and attaches each agent to a dedicated tmux pane running the OpenCode TUI. Agents are monitored via SDK SSE events and an explicit heartbeat tool, with automatic error recovery (context limit exhaustion, crashes) and task reassignment.

This design is directly informed by the ntm project's OpenCode integration (`/data/projects/ntm/internal/opencode/manager.go`) and oh-my-opencode's tmux configuration patterns.

## Technical Context

**Language/Version**: TypeScript 5.3+ (strict mode), targeting ESNext
**Runtime**: Bun >= 1.3.2 (Bun-first development per constitution)
**Primary Dependencies**:
- `@opencode-ai/plugin` (peer dependency - tool registration, lifecycle hooks)
- `@opencode-ai/sdk` (NEW - server/session management, prompt delivery, SSE events)
- `zod` (existing - runtime validation)
- Bun `$` shell API (tmux command execution, cross-platform safe)
- Bun FFI (existing - advisory file locking via fcntl)

**Storage**: File-based JSON in `.opencode/opencode-teams/` with atomic writes + Zod validation (existing pattern)
**Testing**: Vitest via `bun test` with isolated temp directories (existing pattern)
**Target Platform**: Linux, macOS (tmux required for this feature)
**Project Type**: Single project (OpenCode plugin)
**Performance Goals**: Agent spawn within 30s (FR success criteria), crash detection within 60s, heartbeat every 30s
**Constraints**: Single OpenCode server per project, tmux required, OpenCode backend only (FR-009 excludes Claude CLI)
**Scale/Scope**: Support 1-10 concurrent agents per team

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| TypeScript strict mode | PASS | All new code follows `strict: true` |
| Bun-first APIs | PASS | `Bun.$` for tmux commands, `Bun.spawn()` for server process management |
| ES Modules only | PASS | All imports use ES module syntax |
| No type suppression | PASS | No `as any`, `@ts-ignore`, `@ts-expect-error` |
| Zod validation on I/O | PASS | All agent state, server info validated via Zod schemas |
| Atomic writes | PASS | Uses existing `writeAtomicJSON` for agent state |
| Advisory file locking | PASS | Uses existing `withLock` for concurrent agent state updates |
| Minimal dependencies | PASS | Only adding `@opencode-ai/sdk` (necessary for session management) |
| File naming kebab-case | PASS | New files: `agent.ts`, `server-manager.ts`, `heartbeat.ts` |
| Re-export from index | PASS | Each directory has `index.ts` barrel file |
| Conventional commits | PASS | All commits follow format |
| Tests required | PASS | Unit tests for all operations, integration test for spawn flow |
| Single responsibility modules | PASS | `agent.ts` (lifecycle), `server-manager.ts` (server), `heartbeat.ts` (monitoring) |

## Project Structure

### Documentation (this feature)

```
kitty-specs/002-agent-lifecycle-spawning/
+-- plan.md              # This file
+-- research.md          # Phase 0: Reference implementation analysis
+-- data-model.md        # Phase 1: Entity schemas and state design
+-- contracts/           # Phase 1: New tool API definitions
|   +-- spawn-agent.md
|   +-- kill-agent.md
|   +-- heartbeat.md
|   +-- get-agent-status.md
+-- tasks.md             # Phase 2 output (NOT created by /spec-kitty.plan)
```

### Source Code (repository root)

```
src/
+-- types/
|   +-- schemas.ts              # EXTEND: Add AgentState, ServerInfo, HeartbeatRecord schemas
|   +-- index.ts                # EXTEND: Re-export new types
+-- operations/
|   +-- team.ts                 # EXISTING: Team coordination (minor extensions)
|   +-- task.ts                 # EXTEND: Add task reassignment on agent death
|   +-- tmux.ts                 # EXTEND: Enhanced pane management (attach, capture, layout, options)
|   +-- agent.ts                # NEW: Agent lifecycle ops (spawn, kill, heartbeat, status)
|   +-- server-manager.ts       # NEW: OpenCode server lifecycle (start, stop, status, health)
|   +-- index.ts                # EXTEND: Export new operations
+-- tools/
|   +-- spawn-agent.ts          # NEW: Tool definition for spawning agents
|   +-- kill-agent.ts           # NEW: Tool definition for graceful/force kill
|   +-- heartbeat.ts            # NEW: Tool definition for agent heartbeat
|   +-- get-agent-status.ts     # NEW: Tool definition for agent/server status query
|   +-- index.ts                # EXTEND: Export new tools
+-- utils/
|   +-- storage-paths.ts        # EXTEND: Add agent state paths, server state paths
|   +-- fs-atomic.ts            # EXISTING: Atomic file operations (reuse as-is)
|   +-- file-lock.ts            # EXISTING: Advisory file locking (reuse as-is)
|   +-- color-pool.ts           # NEW: Color assignment pool for agent visual identification
+-- index.ts                    # EXTEND: Register new tools, add SSE event monitoring hooks

tests/
+-- agent-operations.test.ts    # NEW: Agent spawn/kill/heartbeat unit tests
+-- server-manager.test.ts      # NEW: Server lifecycle unit tests
+-- agent-heartbeat.test.ts     # NEW: Heartbeat monitoring and timeout detection tests
+-- task-reassignment.test.ts   # NEW: Task reassignment on agent death tests
```

**Structure Decision**: Follows existing single-project layout per constitution. New modules are peers to existing `team.ts`, `task.ts`, `tmux.ts` in `src/operations/`. New tools are individual files in `src/tools/`. This maintains the established pattern of one module per concern (constitution: Module Organization).

## Architecture Overview

### Agent Spawn Flow

The spawn flow follows the pattern proven in the ntm project (`/data/projects/ntm/internal/opencode/manager.go`), ported to TypeScript/Bun:

```
Leader requests spawn-agent tool
        |
        v
ServerManager.ensureRunning(projectPath)
  - Calculate stable port from project path hash (MD5 mod 1000 + 28000)
  - If not running: Bun.spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", port])
  - Detach from parent (independent process via SysProcAttr equivalent)
  - Poll health endpoint (TCP connect) until ready (5s timeout, 100ms interval)
  - Persist state: { pid, port, projectPath } to server state dir
  - Return ServerInfo
        |
        v
ServerManager.createSession(title, projectPath)
  - SDK: client.session.new({ title, directory })
  - Return sessionId
        |
        v
TmuxOperations.splitWindow(sessionName, workingDir)
  - Bun.$`tmux split-window -t ${sessionName} -c ${workingDir}`
  - Get new pane ID from output
        |
        v
TmuxOperations.sendKeys(paneId, attachCommand)
  - Command: opencode attach --session <sessionId> http://127.0.0.1:<port>
  - Bun.$`tmux send-keys -t ${paneId} ${command} Enter`
        |
        v
Store session ID as tmux pane option
  - Bun.$`tmux set-option -p -t ${paneId} @opencode_session_id ${sessionId}`
        |
        v
AgentOperations.registerAgent(agentState)
  - Write agent state to .opencode/opencode-teams/agents/<agent-id>.json
  - Atomic write + Zod validation
  - Add agent to team config members list
        |
        v
ServerManager.sendPromptReliable(sessionId, initialPrompt)
  - SDK: client.session.prompt({ parts: [{ type: "text", text: prompt }] })
  - Verify delivery by checking message count increase
  - Retry up to 3 times with 2s interval
  - Fallback to tmux send-keys if SDK delivery fails
```

### Heartbeat Monitoring Flow

```
Hybrid Heartbeat Strategy:

  1. PASSIVE: SDK SSE Event Stream (primary)
     - Subscribe to opencode server events: client.event.list() streaming
     - Events that update heartbeat_ts:
       - session.idle -> agent waiting for input (alive)
       - session.updated -> agent processing (alive)
       - tool.execute.after -> agent using tools (alive)
     - Events that trigger error recovery:
       - session.error -> classify error type, handle accordingly

  2. ACTIVE: Heartbeat Tool (fallback for long computations)
     - Agent calls 'heartbeat' tool periodically
     - Updates heartbeat_ts in agent state file
     - Useful when agent is in long computation with no tool calls

  3. MONITOR: Periodic sweep (detection loop)
     - Background timer runs every 15s
     - For each active agent: check if (now - heartbeat_ts) > 60s
     - If stale -> mark agent inactive, reassign owned tasks to pending
     - Grace period for network interruptions: 2 consecutive misses required
```

### Error Recovery Flow (Critical per user requirements)

```
SDK Event Stream detects error:
  session.error event (context limit, API error, crash)
        |
        v
  Classify error type:
        |
        +-- Context limit exhaustion:
        |     1. Create new SDK session via client.session.new()
        |     2. Capture current pane output for context continuity
        |     3. Respawn pane: tmux send-keys to attach new session
        |     4. Send continuation prompt with handoff context
        |     5. Update agent state with new session_id
        |
        +-- Transient API error (rate limit, timeout):
        |     1. Exponential backoff retry (2s, 4s, 8s)
        |     2. If all retries fail -> mark for manual intervention
        |
        +-- Process crash (no heartbeat, pane dead):
              1. Mark agent as inactive in state
              2. Reassign all owned tasks to pending status
              3. Clean up tmux pane
              4. Notify leader via team messaging
```

### Server Lifecycle

```
Single server per project (mirrors ntm pattern):

  Port calculation:
    - MD5 hash of absolute project path
    - Port = 28000 + (first 2 hash bytes as uint16 mod 1000)
    - Deterministic: same project always gets same port

  State directory: .opencode/opencode-teams/servers/<project-hash>/
    - server.pid     # Process ID of opencode serve
    - port           # Port number
    - project_path   # Absolute path to project
    - server.log     # Server output log

  Lifecycle:
    - ensureRunning(): Start if not running, return existing if alive
    - stop(force): SIGTERM -> grace period -> SIGKILL if still running
    - status(): Check PID alive + port responding
    - reap(): Stop servers with zero active connections
    - Server stays alive until explicitly stopped or all sessions detached
```

### Tmux Integration

```
Required (not optional) for this feature:

  Layout: main-vertical (configurable)
    +-------------------+-------------------+
    |                   | Agent Pane 1      |
    |    Leader Pane    +-------------------+
    |  (Primary Agent)  | Agent Pane 2      |
    |                   +-------------------+
    |                   | Agent Pane N      |
    +-------------------+-------------------+

  Pane operations (extending existing TmuxOperations):
    - splitWindow(session, workdir) -> pane ID
    - sendKeys(paneId, command, enterKey)
    - capturePaneOutput(paneId, lines) -> string
    - setPaneOption(paneId, key, value)
    - getPaneOption(paneId, key) -> string
    - killPane(paneId)
    - setPaneTitle(paneId, title)
    - selectLayout(session, layout)

  Agent detection via pane options:
    - @opencode_session_id: SDK session ID for prompt delivery
    - Pane title format: {session}__{type}_{index}
```

## Clarification Addendum (Session 2)

Decisions made after deeper analysis of ntm reliability issues, OpenCode SDK capabilities, and tmux integration options.

### D1: Server Half-Alive Recovery

**Decision**: Retry then escalate.

**Problem**: ntm experiences cases where the server PID exists, port accepts TCP connections, but the SDK can't create sessions or deliver prompts. ntm's `manager.go` just fails after a 5s timeout.

**Our approach**:
1. Detect via SDK health check (not just TCP connect): attempt `client.session.list()` after TCP passes
2. If SDK fails: kill the zombie process, restart server, retry
3. If second attempt also fails: surface to leader with diagnostic payload:
   - Server PID, port, log tail (last 50 lines from `server.log`)
   - Error classification (connection refused, timeout, auth failure)
4. Leader decides: retry manually, investigate logs, or abandon

```
ensureRunning():
  1. TCP connect -> pass? Continue. Fail? Start server.
  2. SDK client.session.list() -> pass? Return info.
  3. Fail? Kill PID, restart server.
  4. Retry step 1-2 once.
  5. Still failing? Return error with diagnostics to caller.
```

### D2: Prompt Delivery - No Global Mutex

**Decision**: Per-session serialization only. No global mutex needed.

**Rationale**: ntm's global mutex (`opencodePromptMu`) was needed because ntm also uses `tmux send-keys` as a fallback prompt delivery mechanism, which requires serialization across all panes. We exclusively use the SDK for prompt delivery (`client.session.prompt()`), which targets a specific session ID. The OpenCode HTTP server handles concurrent requests to different sessions natively - each session is independent server-side.

**What we serialize**: Only concurrent operations on the *same* session (e.g., sending a prompt while checking message count). This is naturally handled by per-agent serialization in our operations layer - each agent has one session, and we process one operation per agent at a time.

**ntm failure modes we avoid**:
- Phantom success: We verify via SSE event (`session.updated`) in addition to message count polling
- Race conditions: No global lock contention means no deadlock risk with multiple agents

### D3: Session-Pane Mapping via OpenCode Session Title

**Decision**: Use OpenCode session title as the primary mapping mechanism. Tmux pane options as secondary/fallback.

**Session title format**: `teams::{teamName}::agent::{agentId}::role::{role}`

**Recovery flow**: If our state files are corrupted or lost, we can rediscover all team agents by:
1. Querying the OpenCode server: `client.session.list()` returns all sessions with titles
2. Parsing titles matching `teams::*` pattern to reconstruct agent mappings
3. Matching tmux panes to sessions via `@opencode_session_id` pane option (backup)

**Why session title over tmux pane options**:
- OpenCode sessions persist on disk across server restarts
- Session title is visible in the OpenCode TUI header (user sees it)
- `client.session.list()` is a single API call for full discovery
- Tmux pane options are lost if the pane dies

**We still set tmux pane options** (`@opencode_session_id`, `@agent_id`) as a local cache for fast lookup without SDK calls, but the session title is authoritative.

### D4: Team Restart - Resume Existing Sessions

**Decision**: Resume existing sessions by default.

**Use case**: Server restart for config changes (plugin update, MCP server addition, `opencode.json` changes).

**Flow**:
```
restart-team:
  1. Read all AgentState files -> collect session IDs
  2. For each agent pane: detach from current server
     - Send Ctrl+C to tmux pane (kills `opencode attach`)
  3. Stop OpenCode server: ServerManager.stop(projectPath)
  4. Start OpenCode server: ServerManager.ensureRunning(projectPath)
     - New server process picks up updated config from disk
  5. For each agent: re-attach to existing session
     - tmux send-keys: `opencode attach --session <sessionId> http://127.0.0.1:<port>`
  6. Verify all agents reconnected via heartbeat
  7. Report status
```

**Why sessions survive**: OpenCode persists sessions to `<project>/.opencode/sessions/` on disk. The server process is stateless WRT session data - it reads from disk on startup. Restarting the server process reloads all config while preserving session history.

**Config changes picked up on restart**:
- `opencode.json` (plugin list, provider config)
- MCP server definitions
- Model configuration
- Custom instructions

### D5: Compaction vs New Session - Agent-Controlled + Context Files

**Decision**: Agent-controlled with proactive compaction. Provide tools for both strategies. Prefer context files over compaction when possible.

**Two strategies, agent/leader decides**:

| Situation | Strategy | Rationale |
|-----------|----------|-----------|
| Brand-new unrelated task | New session | Clean context, no baggage |
| Iterating on existing work | Pre-compact then continue | Preserve relevant history, reduce noise |
| Context near limit but work ongoing | Write context to files, then new session | Avoids compaction quality issues |
| Review/synthesis of prior work | New session with file-based context | Best of both worlds |

**Context file pattern** (alternative to compaction):
```
Agent writes key context to files before session rotation:
  .opencode/opencode-teams/context/<agent-id>/
    current-task.md    # What I'm working on, current state
    decisions.md       # Key decisions made in this session
    blockers.md        # Known issues and blockers
    
New session's initial prompt references these files:
  "Continue from context in .opencode/opencode-teams/context/<agent-id>/"
```

**Tools to expose**:
- `compact-session`: Triggers OpenCode compaction on agent's session (if SDK supports it)
- `rotate-session`: Creates new session, writes handoff context to files, detaches from old, attaches to new
- Context file write is normal file operations (no special tool needed)

**Compaction caveats**:
- Compaction quality varies - some LLMs produce poor summaries
- Compacted context can't be un-compacted
- File-based context is inspectable, debuggable, and versionable

### D6: Background/Specialized Agents - Headless by Default

**Decision**: SDK-only sessions by default (no TUI running). Attach tmux pane on demand, detach when done.

**Rationale**: The OpenCode TUI is the primary RAM consumer. An agent that only needs to wake periodically (backlog manager, dependency checker) doesn't need a TUI running continuously. The SDK session exists server-side regardless of whether a TUI is attached.

**Lifecycle for background agents**:
```
Spawn (background mode):
  1. Create SDK session: client.session.new({ title: "teams::myteam::agent::backlog-mgr::role::worker" })
  2. Send initial prompt via SDK (no tmux pane needed)
  3. AgentState.paneId = undefined (no pane)
  4. AgentState.visibility = 'headless'
  5. Monitor via SSE events (same as visible agents)

Attach on demand (human wants to observe):
  1. TmuxOperations.splitWindow() -> paneId
  2. tmux send-keys: `opencode attach --session <sessionId> http://127.0.0.1:<port>`
  3. AgentState.paneId = paneId
  4. AgentState.visibility = 'visible'

Detach when done:
  1. In the tmux pane: Ctrl+C (exits `opencode attach`)
  2. TmuxOperations.killPane(paneId) 
  3. AgentState.paneId = undefined
  4. AgentState.visibility = 'headless'
  5. SDK session continues server-side (agent still receives prompts)
```

**RAM savings**: Each TUI pane consumes ~50-100MB for the Go process + terminal rendering. Headless agents consume zero additional RAM beyond the server's per-session overhead.

### D7: Tmux Status Display - Global Bar + Session Title

**Decision**: Use tmux global status bar for team overview + OpenCode session title for per-agent status. Avoid pane-border-format initially (OpenCode TUI has its own header bar).

**Global status bar** (tmux status-right):
```
tmux set-option status-right "#{E:@team_status} | port:#{E:@server_port}"

# Updated by our monitoring loop:
tmux set-option -g @team_status "review-pr-123: 3/4 active"
tmux set-option -g @server_port "28042"
```

**Per-agent status via OpenCode session title** (visible in TUI header):
```
Session title format: "{icon} {name} | {status} | {task}"
Examples:
  "🟢 worker-1 | active | reviewing auth module"
  "🟡 worker-2 | idle | waiting for tasks"  
  "🔴 reviewer | inactive | heartbeat timeout"
  "⚫ backlog-mgr | headless | monitoring backlog"

Updated via SDK: client.session.update(sessionId, { title: newTitle })
```

**Why not pane-border-format**:
- OpenCode TUI already renders a header bar with session info
- Adding pane-border-status would create visual noise (two status bars per pane)
- The session title is visible IN the OpenCode header naturally
- May revisit if the OpenCode header proves insufficient

## Complexity Tracking

No constitution violations. All patterns follow established conventions.