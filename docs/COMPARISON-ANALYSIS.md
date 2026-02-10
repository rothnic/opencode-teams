# Comprehensive Comparison: opencode-teams vs claude-code-teams-mcp

## Document Purpose

This document provides a deep, line-by-line comparison between two implementations of
multi-agent team coordination, both inspired by Claude Code's hidden TeammateTool feature
(discovered via binary analysis of Claude Code v2.1.19):

1. **opencode-teams** (this project) - TypeScript/Bun native OpenCode plugin
2. **claude-code-teams-mcp** (reference) - Python FastMCP server by cs50victor

Both derive from the same source material: Kieran Klaassen's gist analyzing Claude Code's
internal 13-operation TeammateTool protocol. The expected difference is that opencode-teams
is OpenCode-native. This analysis focuses on the \*meaningful behavioral, architectural, and
data model divergences\_ beyond that surface-level distinction.

---

## 1. Architectural Philosophy

### 1.1 Integration Model

| Aspect               | claude-code-teams-mcp (Python)               | opencode-teams (TypeScript)              |
| -------------------- | -------------------------------------------- | ---------------------------------------- |
| **Integration type** | Standalone MCP server                        | Native OpenCode plugin                   |
| **Protocol**         | MCP (Model Context Protocol) via FastMCP     | OpenCode plugin API via `tool()` helper  |
| **Process model**    | Separate process, communicates via stdio/SSE | In-process, loaded by OpenCode runtime   |
| **Client coupling**  | Client-agnostic (any MCP client)             | OpenCode-only                            |
| **Installation**     | `uvx --from git+... claude-teams`            | `opencode plugin install opencode-teams` |

**Analysis**: The Python project is a **protocol-first** design. It implements MCP as a
standalone server, meaning any MCP-compatible client (Claude Code, OpenCode, Cursor, etc.)
can use it without modification. The TypeScript project is a **host-first** design, deeply
coupled to OpenCode's plugin lifecycle, tool registration, and permission system. This is a
fundamental architectural trade-off: portability vs. integration depth.

**Claude Code alignment**: The Python project is *more aligned* with Claude Code's approach.
Claude Code's TeammateTool is an internal tool registered within the Claude Code process, but
it operates via file-based IPC that is process-agnostic. The MCP server approach preserves
this process-agnostic quality. The opencode-teams plugin, being in-process, is closer to how
Claude Code's internal tool is actually *loaded*, but farther from how it *communicates*.

### 1.2 Framework Dependencies

| Aspect               | Python                               | TypeScript                       |
| -------------------- | ------------------------------------ | -------------------------------- |
| **Runtime**          | Python 3.12+                         | Bun                              |
| **Server framework** | FastMCP 3.0.0b1                      | None (OpenCode SDK)              |
| **Validation**       | Pydantic v2                          | None (manual types)              |
| **File locking**     | `filelock` library (cross-platform)  | `Bun.spawnSync` (shell commands) |
| **Runtime deps**     | 2 (`fastmcp`, `filelock`)            | 0 (Bun built-ins only)           |
| **Test framework**   | pytest + pytest-asyncio (~183 tests) | Bun test runner (~15 tests)      |

**Analysis**: The Python project has a mature, validated foundation with Pydantic for data
integrity and a dedicated file-locking library. The TypeScript project has zero runtime
dependencies, using only Bun built-ins, but at the cost of lacking data validation, proper
file locking, and comprehensive test coverage.

---

## 2. Data Models

### 2.1 Team Configuration

**Python (Pydantic models with discriminated unions)**:

```python
class LeadMember(BaseModel):
    agent_id: str          # "team-lead@{team-name}"
    name: str              # "team-lead"
    agent_type: str        # "team-lead"
    model: str             # "claude-opus-4-6"
    joined_at: int         # Unix milliseconds
    tmux_pane_id: str      # "%42" or "@3"
    cwd: str               # Working directory
    subscriptions: list    # Event subscriptions

class TeammateMember(BaseModel):
    # All of LeadMember fields PLUS:
    prompt: str            # Initial instructions
    color: str             # Terminal color
    plan_mode_required: bool
    backend_type: str      # "claude" | "opencode"
    opencode_session_id: str | None
    is_active: bool

class TeamConfig(BaseModel):
    name: str
    description: str
    created_at: int        # Unix milliseconds
    lead_agent_id: str     # "team-lead@{team-name}"
    lead_session_id: str   # Parent session ID
    members: list[MemberUnion]  # Discriminated union
```

**TypeScript (plain interfaces)**:

```typescript
interface TeamMember {
  agentId: string; // "leader" or env var
  agentName: string; // "Leader" or env var
  agentType: string; // "leader" or "worker"
  joinedAt: string; // ISO 8601 string
}

interface TeamConfig {
  name: string;
  created: string; // ISO 8601 string
  leader: string; // Just the agentId string
  members: TeamMember[]; // Flat array, no union
}
```

**Critical differences**:

| Field                     | Python                                   | TypeScript                          | Impact                                                                                |
| ------------------------- | ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| **Member discrimination** | Discriminated union (Lead vs Teammate)   | Single flat type                    | Python can enforce different behavior per role at the type level                      |
| **Timestamps**            | Unix milliseconds (int)                  | ISO 8601 strings                    | Python aligns with Claude Code's binary format; TypeScript uses human-readable format |
| **Agent ID format**       | `{name}@{team}` (structured)             | Arbitrary string (env var fallback) | Python IDs encode team membership; TypeScript IDs are opaque                          |
| **Model tracking**        | Required `model` field                   | Not tracked                         | Python knows which AI model each agent runs                                           |
| **Working directory**     | Required `cwd` field                     | Not tracked                         | Python tracks where each agent operates                                               |
| **Prompt/instructions**   | Stored on TeammateMember                 | Not tracked                         | Python preserves the initial prompt; TypeScript discards it                           |
| **Tmux pane ID**          | Required `tmux_pane_id`                  | Not tracked                         | Python can manage tmux panes; TypeScript cannot                                       |
| **Color assignment**      | `color` field from 8-color palette       | Not tracked                         | Python supports visual differentiation                                                |
| **Backend type**          | `backend_type` ("claude"\|"opencode")    | Not tracked                         | Python supports multiple backends                                                     |
| **Activity state**        | `is_active` field                        | Not tracked                         | Python can track agent liveness                                                       |
| **Session linkage**       | `lead_session_id`, `opencode_session_id` | Not tracked                         | Python links to parent/child sessions                                                 |
| **Description**           | Team-level `description` field           | Not present                         | Python supports team documentation                                                    |
| **Validation**            | Pydantic with aliases (camelCase JSON)   | No runtime validation               | Python guarantees schema compliance                                                   |

**Verdict**: The Python data model is significantly richer. It captures the full state
needed for lifecycle management, visual rendering, and multi-backend orchestration. The
TypeScript model captures only the minimum needed for basic team creation and member listing.

### 2.2 Task Schema

**Python**:

```python
class TaskFile(BaseModel):
    id: str                    # Auto-incrementing numeric string
    subject: str               # Required, validated non-empty
    description: str
    active_form: str           # Current working state
    status: Literal["pending", "in_progress", "completed", "deleted"]
    blocks: list[str]          # Forward dependency links
    blocked_by: list[str]      # Backward dependency links
    owner: str | None
    metadata: dict | None      # Extensible key-value storage
```

**TypeScript**:

```typescript
interface Task {
  id: string; // Timestamp + random hex
  title?: string;
  description?: string;
  priority?: string; // "high" | "normal" | "low"
  status: string; // No literal constraint
  createdAt: string;
  updatedAt?: string;
  owner?: string;
  claimedAt?: string;
  completedAt?: string;
  dependencies?: string[]; // Only backward links
  [key: string]: any; // Open-ended
}
```

**Critical differences**:

| Aspect                   | Python                                                      | TypeScript                           | Impact                                                                                         |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **ID scheme**            | Sequential integers ("1", "2", "3")                         | Timestamp + random hex               | Python IDs are human-friendly and orderable; TypeScript IDs are collision-resistant but opaque |
| **Status type safety**   | Literal enum with 4 values                                  | Untyped string                       | Python prevents invalid states at the type level                                               |
| **Dependency model**     | Bidirectional (`blocks` + `blocked_by`)                     | Unidirectional (`dependencies` only) | Python maintains referential integrity in both directions                                      |
| **Dependency cascading** | Completing a task auto-removes it from others' `blocked_by` | No cascade                           | Python maintains consistency automatically                                                     |
| **Status transitions**   | Enforced forward-only (pending -> in_progress -> completed) | No validation                        | Python prevents status regression; TypeScript allows any transition                            |
| **Deletion**             | `deleted` status + reference cleanup across all tasks       | File deletion + dependent check      | Python preserves audit trail and cleans up references                                          |
| **Priority**             | Not present                                                 | String field                         | TypeScript has priority; Python relies on task ordering                                        |
| **Timestamps**           | Not present (relies on file system)                         | Multiple timestamp fields            | TypeScript tracks lifecycle events explicitly                                                  |
| **Metadata**             | Typed `dict` with null-merge semantics                      | Open `[key: string]: any`            | Python has structured extension; TypeScript uses index signature                               |
| **Active form**          | Dedicated field for current working state                   | Not present                          | Python supports iterative refinement tracking                                                  |

**Verdict**: The Python task system is production-grade with proper state machine semantics,
bidirectional dependency tracking, and cascading updates. The TypeScript task system is a
simpler CRUD interface without state machine enforcement.

### 2.3 Message Schema

**Python**:

```python
class InboxMessage(BaseModel):
    from_: str         # Sender name
    text: str          # Message body (can be serialized structured type)
    timestamp: str     # ISO 8601
    read: bool         # Read receipt tracking
    summary: str | None  # Short summary for inbox listing
    color: str | None    # Sender's color for UI

# Plus structured message subtypes:
class IdleNotification(BaseModel):   # Agent going idle
class TaskAssignment(BaseModel):     # Task assigned to agent
class ShutdownRequest(BaseModel):    # Graceful shutdown request
class ShutdownApproved(BaseModel):   # Shutdown confirmation
```

**TypeScript**:

```typescript
interface Message {
  from: string;
  to: string;
  message: string;
  timestamp: string;
  recipients?: string[]; // For broadcasts
}
```

**Critical differences**:

| Aspect                  | Python                                                                     | TypeScript                                             | Impact                                                                         |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Message types**       | 5 distinct types (plain, idle, task assignment, shutdown request/approved) | 1 generic type                                         | Python supports typed protocol messages                                        |
| **Read tracking**       | `read` boolean with mark-as-read on retrieval                              | No tracking                                            | Python supports inbox management; TypeScript re-reads everything               |
| **Routing**             | Per-agent inbox files, messages go to recipient's file                     | Per-team messages dir, filtered by `to` field on read  | Python is O(1) per agent; TypeScript is O(n) scanning all messages             |
| **Summary field**       | Dedicated `summary` for inbox listing                                      | Not present                                            | Python supports inbox preview without reading full message                     |
| **Structured payloads** | Messages can contain serialized Pydantic models                            | Plain string only                                      | Python supports machine-readable protocol messages                             |
| **Broadcast**           | Appends to each recipient's individual inbox                               | Single file with `to: "broadcast"` and recipients list | Python guarantees delivery per-agent; TypeScript relies on read-time filtering |

---

## 3. Storage Model

### 3.1 Directory Layout

```text
~/.claude/
├── teams/{team-name}/
│   ├── config.json              # Team config + all members
│   └── inboxes/
│       ├── {agent-name}.json    # Per-agent inbox (JSON array)
│       └── .lock                # File lock for inbox operations
└── tasks/{team-name}/
    ├── 1.json                   # Task 1
    ├── 2.json                   # Task 2
    └── .lock                    # File lock for task operations
```

**TypeScript** (`~/.config/opencode/opencode-teams/`):

```text
~/.config/opencode/opencode-teams/
├── teams/{team-name}/
│   ├── config.json              # Team config + members
│   └── messages/
│       └── {id}-{target}.json   # Individual message files
└── tasks/{team-name}/
    └── {id}.json                # Task files
```

**Critical differences**:

| Aspect                 | Python                                               | TypeScript                                       | Impact                                                                                |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **Base path**          | `~/.claude/`                                         | `~/.config/opencode/opencode-teams/`             | Python uses Claude Code's native location; TypeScript uses XDG-style path             |
| **Inbox model**        | **Per-agent file** (JSON array of all messages)      | **Per-message file** (one JSON file per message) | Python has atomic inbox reads; TypeScript must scan and sort directory                |
| **Lock files**         | Explicit `.lock` files in each operational directory | No lock files                                    | Python has concurrency safety; TypeScript does not                                    |
| **Message addressing** | File name = agent name (`alice.json`)                | File name = `{generatedId}-{targetAgentId}.json` | Python routing is O(1) file open; TypeScript routing requires filename parsing        |
| **Task ID strategy**   | Auto-incrementing integers scanned from directory    | Timestamp + crypto random                        | Python IDs are stable across processes; TypeScript IDs are globally unique but longer |
| **Config file name**   | `config.json` in both                                | `config.json` in both                            | Same                                                                                  |

### 3.2 Concurrency & Atomicity

**Python** - Full concurrency safety:

```python
# File locking via filelock library (cross-platform)
from filelock import FileLock

@contextmanager
def file_lock(lock_path: Path):
    with FileLock(str(lock_path)):
        yield

# Atomic writes via temp-file-then-rename
fd, tmp_path = tempfile.mkstemp(dir=config_dir, suffix=".tmp")
os.write(fd, data.encode())
os.close(fd)
os.replace(tmp_path, target_path)  # Atomic on POSIX
```

**TypeScript** - No concurrency safety:

```typescript
// No file locking
// Direct writes via Bun.write (not atomic)
export function writeJSONSync(filePath: string, data: any): void {
  Bun.write(filePath, JSON.stringify(data, null, 2));
}
```

**Analysis**: This is a *major behavioral gap*. The Python implementation ensures that when two agents
simultaneously try to read and update the same inbox or task, one waits for the other's lock to release,
preventing data loss. The TypeScript implementation has classic TOCTOU race conditions:

1. Agent A reads task status = "pending"
2. Agent B reads task status = "pending"
3. Agent A writes status = "in_progress", owner = A
4. Agent B overwrites with status = "in_progress", owner = B
5. Agent A's claim is silently lost

The PRD for opencode-teams explicitly requires file locking (`fcntl` or Bun-compatible), but
this has not been implemented. The `OPENCODE-INTEGRATION-PLAN.md` shows detailed plans for
Bun FFI-based `fcntl` locking, but none of this code exists in the actual source.

---

## 4. Tool Surface Area

### 4.1 Complete Tool Comparison

| #   | Claude Code (Binary) | Python MCP Server               | TypeScript Plugin         | Notes                                                |
| --- | -------------------- | ------------------------------- | ------------------------- | ---------------------------------------------------- |
| 1   | `spawnTeam`          | `team_create`                   | `spawn-team`              | All three create teams                               |
| 2   | `discoverTeams`      | (via `read_config`)             | `discover-teams`          | Python returns config directly                       |
| 3   | `requestJoin`        | (spawn adds member)             | `join-team`               | Python auto-adds via spawn                           |
| 4   | `approveJoin`        | Not implemented                 | Not implemented           | Neither implements join approval                     |
| 5   | `rejectJoin`         | Not implemented                 | Not implemented           |                                                      |
| 6   | `write`              | `send_message`                  | `send-message`            | All support direct messages                          |
| 7   | `broadcast`          | `send_message` (type=broadcast) | `broadcast-message`       | Python unifies send+broadcast                        |
| 8   | `requestShutdown`    | `send_message` (type=shutdown)  | Not implemented           | Python uses typed messages                           |
| 9   | `approveShutdown`    | `process_shutdown_approved`     | Not implemented           | Python has full shutdown protocol                    |
| 10  | `rejectShutdown`     | Not implemented                 | Not implemented           |                                                      |
| 11  | `approvePlan`        | Not implemented                 | Not implemented           |                                                      |
| 12  | `rejectPlan`         | Not implemented                 | Not implemented           |                                                      |
| 13  | `cleanup`            | `team_delete`                   | (cleanup method, no tool) | Python has tool; TypeScript has internal method only |
| 14  | -                    | `spawn_teammate`                | Not implemented           | **Python-only**: spawns agent in tmux pane           |
| 15  | -                    | `poll_inbox`                    | `poll-inbox`              | Both implement long-polling                          |
| 16  | -                    | `read_inbox`                    | `read-messages`           | Both read messages                                   |
| 17  | -                    | `read_config`                   | `get-team-info`           | Both read team config                                |
| 18  | -                    | `force_kill_teammate`           | Not implemented           | **Python-only**: kills tmux pane                     |
| 19  | -                    | `task_create`                   | `create-task`             | Both create tasks                                    |
| 20  | -                    | `task_update`                   | `update-task`             | Both update tasks                                    |
| 21  | -                    | `task_list`                     | `get-tasks`               | Both list tasks                                      |
| 22  | -                    | `task_get`                      | Not a tool (internal)     | Python exposes as tool; TypeScript internal only     |
| 23  | -                    | -                               | `claim-task`              | **TypeScript-only**: explicit claim operation        |

**Tool count**: Python = 13 MCP tools, TypeScript = 12 registered tools (11 in
`src/tools/index.ts` + `poll-inbox`)

### 4.2 Functional Gaps in TypeScript vs Python

**Missing entirely from TypeScript**:

1. **Agent spawning** (`spawn_teammate`) - No ability to create new agent processes in tmux panes
2. **Force kill** (`force_kill_teammate`) - No ability to terminate misbehaving agents
3. **Shutdown protocol** - No graceful shutdown negotiation
4. **Team deletion** tool - Internal `cleanup()` exists but is not exposed as a tool
5. **Backend detection** - No discovery of available AI backends (Claude, OpenCode)
6. **OpenCode API client** - No HTTP client for OpenCode's server API
7. **Session management** - No creation/attachment of OpenCode sessions

**Present in TypeScript but missing from Python**:

1. **Explicit `claim-task`** - Python handles ownership via `task_update(owner=...)`,
   TypeScript has a dedicated claim operation with dependency warnings

### 4.3 Tool Behavior Deep-Dive: `send_message` vs `send-message`

**Python** (`server.py` - unified send_message tool):

```python
@mcp.tool
async def send_message(
    team_name: str,
    type: Literal["message", "broadcast", "shutdown_request"],
    sender: str,
    content: str,
    summary: str = "",
    recipient: str | None = None,
    # ...
) -> SendMessageResult:
    # Validates team exists, sender is member
    # Handles three message types through a single tool
    # For broadcast: iterates all non-sender members, appends to each inbox
    # For shutdown: creates ShutdownRequest structured message
    # Returns routing info (who received the message)
```

**TypeScript** (`team.ts` - separate write/broadcast methods):

```typescript
write: (teamName, targetAgentId, message, fromAgentId?) => {
  // Creates single file in messages/ directory
  // No validation that sender or target are team members
  // No routing info returned
};

broadcast: (teamName, message, fromAgentId?) => {
  // Creates single broadcast file
  // Stores recipients list but doesn't create per-agent copies
  // Relies on read-time filtering by message "to" field
};
```

**Key behavioral differences**:

- Python validates sender membership; TypeScript does not
- Python delivers broadcast to each agent's individual inbox; TypeScript creates one shared file
- Python supports structured message types (shutdown, task assignment);
  TypeScript only supports plain text
- Python returns delivery confirmation with routing details; TypeScript returns just the message data

---

## 5. Spawning & Process Management

### 5.1 Agent Spawning

````text

**TypeScript** - No spawning capability:

```text

Not implemented. The TypeScript plugin has no mechanism to spawn new agent
processes. Team creation only records configuration. Members must manually
join by calling join-team.

````

**Analysis**: This is the single largest capability gap. The Python project can orchestrate
a full multi-agent team from a single command: create team, spawn agents in tmux panes, inject
initial prompts, track pane IDs, and clean up on failure. The TypeScript project requires
external orchestration (like ntm or manual tmux management) to achieve the same result.

### 5.2 Backend Support

**Python** supports two backends:

1. **Claude Code CLI** - Spawns `claude` binary with `--agent-id`, `--team-name`, etc.
2. **OpenCode CLI** - Creates session via HTTP API, sends prompt via `prompt_async`,
   attaches via `opencode attach`

The OpenCode backend in Python:

```python
# 1. Verify claude-teams MCP is configured in OpenCode
opencode_client.verify_mcp_configured(server_url)

# 2. Create a new OpenCode session
session_id = opencode_client.create_session(server_url, title=f"{name}@{team}")

# 3. Send wrapped prompt with MCP tool instructions
opencode_client.send_prompt_async(server_url, session_id, wrapped_prompt)

# 4. Attach tmux pane to the session
cmd = f"opencode attach {server_url} -s {session_id}"
```

**TypeScript** has no backend support - it is purely a data layer.

### 5.3 Lifecycle Management

**Python**:

```python
# Killing an agent
def force_kill_teammate(team_name, agent_name):
    # 1. Read team config
    # 2. Find member's tmux pane ID
    # 3. Kill tmux pane/window
    # 4. If opencode backend: abort session, delete session
    # 5. Reset agent's owned tasks to "pending"
    # 6. Remove member from team config
    # 7. Delete agent's inbox file

# Shutdown protocol
def process_shutdown_approved(team_name, request_id, agent_name):
    # 1. Read shutdown approval from inbox
    # 2. Kill the agent's tmux pane
    # 3. Clean up OpenCode session if applicable
    # 4. Reset owned tasks
    # 5. Remove from team
```

**TypeScript**:

```typescript
// Only cleanup method (not exposed as tool)
cleanup: (teamName: string): void => {
  // Removes entire team directory
  // Removes entire task directory
  // No per-agent cleanup
  // No task reassignment
  // No session cleanup
};
```

---

## 6. Messaging Protocol

### 6.1 Inbox Architecture

```text
teams/{team}/inboxes/
├── team-lead.json     # [msg1, msg2, msg3, ...]
├── alice.json         # [msg4, msg5, ...]
├── bob.json           # [msg6, ...]
└── .lock              # File lock
```

- Each agent has its own JSON array file
- Broadcasts deliver a copy to each agent's inbox
- File-locked atomic read-modify-write
- Read tracking via `read` boolean
- Mark-as-read on retrieval (configurable)

**TypeScript** - Shared message directory:

```text
teams/{team}/messages/
├── 1738000000000-a1b2c3d4-worker-1.json   # Direct message
├── 1738000001000-e5f6a7b8-broadcast.json  # Broadcast
└── 1738000002000-c9d0e1f2-worker-2.json   # Direct message
```

- All messages in one directory
- Filtered by `to` field at read time
- No file locking
- No read tracking
- Full directory scan on every read

### 6.2 Long-Polling

````text

**TypeScript** (`team.ts`):

```typescript
pollInbox: async (teamName, agentId?, timeoutMs = 30000, since?) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const messages = TeamOperations.readMessages(teamName, currentAgentId, lastCheck);
    if (messages.length > 0) return messages;
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 1000ms interval
  }
  return [];
};
````

**Differences**:

| Aspect                | Python                                  | TypeScript                                               |
| --------------------- | --------------------------------------- | -------------------------------------------------------- |
| **Poll interval**     | 500ms                                   | 1000ms                                                   |
| **Unread filtering**  | Via `read` flag on messages             | Via `since` timestamp parameter                          |
| **Return format**     | `{messages, polled_seconds, timed_out}` | Plain message array                                      |
| **Timeout indicator** | `timed_out: true` flag                  | Empty array (indistinguishable from "no messages exist") |
| **Concurrency**       | `asyncio.sleep` (non-blocking)          | `setTimeout` promise (non-blocking)                      |
| **Agent validation**  | Validates agent exists in team          | No validation                                            |

---

## 7. Task Dependency System

### 7.1 Dependency Model

**Python** - Bidirectional with cascading:

```python
# Task A blocks Task B:
# A.blocks = ["B"]     (A knows it blocks B)
# B.blocked_by = ["A"] (B knows it's blocked by A)

# When A completes:
# Iterates ALL tasks, removes A from their blocked_by lists
# This is done atomically under file lock

# When A is deleted:
# Removes A from all other tasks' blocks AND blocked_by lists
# Does NOT delete the task file - sets status to "deleted"
```

**TypeScript** - Unidirectional without cascading:

```typescript
// Task B depends on Task A:
// B.dependencies = ["A"]  (B knows about A)
// A has no knowledge of B

// When A completes:
// Nothing happens to B automatically
// B's dependencies array still contains A's ID
// Caller must check areDependenciesMet() manually
```

### 7.2 Cycle Detection

**Python** - BFS with pending edge tracking:

```python
def _would_create_cycle(team_dir, from_id, to_id, pending_edges):
    """Check if adding edge from_id -> to_id would create a cycle.
    Uses BFS traversal following blocked_by links.
    Also considers pending (not-yet-written) edges."""
    visited = set()
    queue = deque([to_id])
    while queue:
        current = queue.popleft()
        if current == from_id:
            return True
        # ... traverses both on-disk tasks and pending_edges
```

**TypeScript** - Recursive DFS:

```typescript
checkCircularDependency: (teamName, taskId, dependencies, visited = new Set()) => {
  visited.add(taskId);
  for (const depId of dependencies) {
    if (visited.has(depId)) throw new Error(`Circular dependency detected: ${depId}`);
    const dep = TaskOperations.getTask(teamName, depId);
    if (dep.dependencies?.length > 0) {
      TaskOperations.checkCircularDependency(teamName, depId, dep.dependencies, new Set(visited));
    }
  }
};
```

**Differences**:

| Aspect               | Python                                                      | TypeScript                         |
| -------------------- | ----------------------------------------------------------- | ---------------------------------- |
| **Algorithm**        | BFS (iterative, handles pending edges)                      | DFS (recursive, simpler)           |
| **Pending edges**    | Considers edges not yet written to disk                     | Only checks existing on-disk tasks |
| **Atomicity**        | Runs under file lock                                        | No locking                         |
| **Phase separation** | Validate first, write second (no partial writes on failure) | Writes immediately, checks after   |

### 7.3 Status Transitions

**Python** enforces a strict forward-only state machine:

```python
_STATUS_ORDER = {"pending": 0, "in_progress": 1, "completed": 2}

# Cannot go backwards:
if new_order < cur_order:
    raise ValueError(f"Cannot transition from {task.status!r} to {status!r}")

# Cannot advance past blockers:
if status in ("in_progress", "completed") and effective_blocked_by:
    for blocker_id in effective_blocked_by:
        blocker = TaskFile(**json.loads(blocker_path.read_text()))
        if blocker.status != "completed":
            raise ValueError(f"Cannot set status to {status!r}: blocked by {blocker_id}")
```

**TypeScript** has no transition enforcement:

```typescript
// Any status can be set at any time
const updatedTask = { ...task, ...updates, updatedAt: new Date().toISOString() };
writeJSONSync(taskPath, updatedTask);
```

---

## 8. Error Handling & Robustness

### 8.1 Write Safety

| Mechanism                     | Python                                           | TypeScript               |
| ----------------------------- | ------------------------------------------------ | ------------------------ |
| **Atomic writes**             | `tempfile.mkstemp` + `os.replace`                | Direct `Bun.write`       |
| **Windows support**           | Retry loop for `PermissionError` on `os.replace` | N/A (Bun is Linux/macOS) |
| **Partial write protection**  | Temp file cleaned up in `except` block           | No protection            |
| **File locking**              | `filelock` library on all state mutations        | None                     |
| **Rollback on spawn failure** | Removes member, aborts session, deletes session  | No spawn capability      |

### 8.2 Validation

| Check                        | Python                                 | TypeScript                       |
| ---------------------------- | -------------------------------------- | -------------------------------- |
| Team name format             | Regex `^[A-Za-z0-9_-]+$`, max 64 chars | None                             |
| Agent name format            | Same regex + reserved name check       | None                             |
| Team exists before operation | Yes (file existence check)             | Partial (some operations)        |
| Sender is team member        | Yes                                    | No                               |
| Recipient is team member     | Yes                                    | No                               |
| Task subject non-empty       | Yes                                    | No (defaults to "Untitled Task") |
| Status is valid literal      | Yes (Pydantic Literal type)            | No                               |

---

## 9. OpenCode-Specific Features

### 9.1 Features Only in TypeScript (OpenCode-native)

1. **Plugin lifecycle hooks**:
   - `session.created` - Log when agent session starts
   - `session.deleted` - Log when agent session ends
   - `tool.execute.before` - Inject team context into tool calls

2. **Permission-based role system** (documented in ARCHITECTURE.md, not fully implemented):
   - Leaders: can spawn teams, create tasks, broadcast
   - Members: can join, claim tasks, update own tasks
   - Task Managers: can create/manage tasks, no team operations
3. **OpenCode tool schema integration**:
   - Tools registered via `tool.schema.string()`, `tool.schema.object()`, etc.
   - Follows OpenCode's expected schema format for parameter validation

4. **Environment variable convention**:
   - Uses `OPENCODE_*` prefix instead of `CLAUDE_CODE_*`
   - `OPENCODE_TEAMS_DIR` for storage override

5. **Skill definitions** (YAML frontmatter markdown):
   - `skills/team-coordination/SKILL.md` describes tool usage for AI agents

6. **Agent templates**:
   - `agent/team-leader/AGENT.md`
   - `agent/team-member/AGENT.md`
   - `agent/task-manager/AGENT.md`

### 9.2 Features Only in Python (MCP-native)

1. **OpenCode HTTP API client** (`opencode_client.py`):
   - Session creation/deletion
   - Prompt injection
   - MCP configuration verification
   - Agent listing
   - Session status polling

2. **Multi-backend spawning** (`spawner.py`):
   - Claude Code CLI backend
   - OpenCode CLI backend
   - Tmux pane/window management
   - Color assignment from 8-color palette
   - Environment variable injection for agent identity

3. **Lifespan context** (`server.py`):
   - Discovers available backends at startup
   - Detects tmux availability
   - Finds binary paths for claude/opencode CLIs
   - Reports capabilities to tools

4. **FastMCP integration**:
   - Proper MCP protocol compliance
   - Tool error handling via `ToolError`
   - Context injection via `Context` parameter
   - SSE and stdio transport

---

## 10. Testing Maturity

| Metric                | Python                                                            | TypeScript                              |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| **Test files**        | 7                                                                 | 3                                       |
| **Test count**        | ~183                                                              | ~15                                     |
| **Coverage areas**    | Models, messaging, tasks, teams, spawner, server, opencode_client | Team operations, task operations, utils |
| **Async testing**     | pytest-asyncio                                                    | Bun test (async support)                |
| **Fixtures**          | Shared conftest.py with temp dirs                                 | BeforeAll/afterAll in each file         |
| **CI matrix**         | Ubuntu + macOS + Windows                                          | None                                    |
| **Integration tests** | Server tool integration tests                                     | Shell script (not automated)            |

---

## 11. Where opencode-teams is More Aligned with Claude Code

Despite the Python project being a more feature-complete reimplementation, the TypeScript
project aligns with Claude Code's design in several specific ways:

1. **In-process tool registration**: Claude Code's TeammateTool is registered internally,
   not as a separate server.
   The TypeScript plugin follows this pattern.

2. **Per-message file storage**: Claude Code uses `messages/{session-id}/` with individual message files.
   TypeScript's `messages/{id}-{target}.json` is closer to this than Python's per-agent inbox arrays.

3. **Flat member model**: Claude Code's binary shows a simpler member concept without
   the Lead/Teammate discrimination that Python introduces.
   TypeScript's flat `TeamMember` is closer to this than the binary's representation.

4. **Environment variable naming**: TypeScript uses `OPENCODE_*` which mirrors Claude Code's `CLAUDE_CODE_*`
   pattern (just different prefix).
   Python doesn't use environment variables for context.

5. **Operation naming**: TypeScript's tool names (`spawn-team`, `discover-teams`, `join-team`, `send-message`,
   `broadcast-message`, `read-messages`)
   are direct kebab-case translations of Claude Code's camelCase operations
   (`spawnTeam`, `discoverTeams`, `requestJoin`, `write`, `broadcast`).
   Python uses different names (`team_create`, `send_message`).

6. **Soft blocking on claim**: TypeScript's `claimTask` checks dependencies and returns a warning
   but allows the claim (matching the PRD's "Soft Blocking" requirement).
   Python's `task_update` hard-blocks status transitions when blockers are incomplete.

---

## 12. Summary Matrix

| Dimension             | Python (claude-code-teams-mcp) | TypeScript (opencode-teams) | Claude Code Binary           |
| --------------------- | ------------------------------ | --------------------------- | ---------------------------- |
| **Integration**       | Standalone MCP server          | Native plugin               | Internal tool                |
| **Data validation**   | Pydantic v2                    | None                        | Unknown                      |
| **File locking**      | filelock library               | None                        | Likely fcntl                 |
| **Atomic writes**     | temp+rename                    | Direct write                | Unknown                      |
| **Member types**      | Discriminated union (2)        | Flat (1)                    | Flat (1)                     |
| **Message routing**   | Per-agent inbox file           | Shared directory scan       | Per-session directory        |
| **Read tracking**     | Boolean flag                   | None                        | Unknown                      |
| **Task dependencies** | Bidirectional + cascade        | Unidirectional              | Bidirectional                |
| **Status machine**    | Enforced forward-only          | Open                        | Unknown                      |
| **Cycle detection**   | BFS + pending edges            | Recursive DFS               | Yes                          |
| **Agent spawning**    | Tmux pane/window               | Not implemented             | iTerm2/tmux/in-process       |
| **Backend support**   | Claude + OpenCode              | OpenCode only               | Claude only                  |
| **Shutdown protocol** | Yes (request/approve)          | No                          | Yes (request/approve/reject) |
| **Plan approval**     | No                             | No                          | Yes (approve/reject)         |
| **Test coverage**     | ~183 tests, 3 OS CI            | ~15 tests, no CI            | N/A                          |
| **Timestamps**        | Unix ms (int)                  | ISO 8601 (string)           | Unix ms (int)                |
| **Agent IDs**         | `{name}@{team}`                | Arbitrary string            | `{name}@{team}`              |
| **Tool count**        | 13                             | 12                          | 13                           |

---

## 13. Recommendations

### High Priority (Behavioral Gaps)

1. **Implement file locking** - The single most important missing feature. Without it,
   concurrent agent operations can corrupt state.
   The PRD and integration plan both specify this requirement.

2. **Add per-agent inbox files** - The current shared-directory scan is O(n) and doesn't
   support read tracking.
   Switch to the per-agent inbox model used by Python and planned in the integration docs.

3. **Implement atomic writes** - Use Bun's `Bun.write` to a temp file, then rename.
   This prevents partial writes from corrupting JSON state.

4. **Add status transition enforcement** - Prevent backwards state transitions (completed -> pending)
   which can cause confusion in multi-agent workflows.

### Medium Priority (Feature Gaps)

1. **Implement agent spawning** - This is the core value
   proposition.
   Without it, team coordination requires external orchestration.

2. **Add bidirectional dependency tracking** - When task A blocks task B,
   both should know about it, and completing A should automatically unblock B.

3. **Add structured message types** - Support shutdown requests, task assignments,
   and idle notifications as typed messages.

4. **Add Pydantic-equivalent validation** - Use Zod or TypeBox for runtime schema validation
   of all data structures.

### Lower Priority (Polish)

1. **Add read receipt tracking** on messages
2. **Add agent color assignment** for visual differentiation
3. **Track model and working directory** per agent
4. **Add team deletion tool** (cleanup is internal only)
5. **Increase test coverage** to match Python's ~183 tests
6. **Add CI pipeline** with multi-platform testing

---

## Appendix A: Source File Mapping

| Concept          | Python File                      | TypeScript File                       |
| ---------------- | -------------------------------- | ------------------------------------- |
| Entry point      | `server.py`                      | `src/index.ts`                        |
| Data models      | `models.py` (210 lines)          | `src/types/index.ts` (63 lines)       |
| Team operations  | `teams.py` (175 lines)           | `src/operations/team.ts` (268 lines)  |
| Task operations  | `tasks.py` (235 lines)           | `src/operations/task.ts` (266 lines)  |
| Messaging        | `messaging.py` (130 lines)       | (inline in team.ts)                   |
| File locking     | `_filelock.py` (12 lines)        | Not implemented                       |
| Spawning         | `spawner.py` (225 lines)         | Not implemented                       |
| OpenCode client  | `opencode_client.py` (150 lines) | Not implemented                       |
| Tool definitions | `server.py` (~500 lines)         | `src/tools/index.ts` (330 lines)      |
| Tool helper      | (FastMCP built-in)               | `src/tools/tool-helper.ts` (37 lines) |
| Plugin types     | (FastMCP built-in)               | `src/plugin-types.ts` (91 lines)      |
| Utilities        | (Python stdlib)                  | `src/utils/index.ts` (150 lines)      |

## Appendix B: Data Format Examples

### Team Config - Python

```json
{
  "name": "code-review",
  "description": "PR #456 review team",
  "createdAt": 1738000000000,
  "leadAgentId": "team-lead@code-review",
  "leadSessionId": "ses_abc123",
  "members": [
    {
      "agentId": "team-lead@code-review",
      "name": "team-lead",
      "agentType": "team-lead",
      "model": "claude-opus-4-6",
      "joinedAt": 1738000000000,
      "tmuxPaneId": "",
      "cwd": "/data/projects/myapp"
    },
    {
      "agentId": "alice@code-review",
      "name": "alice",
      "agentType": "security-reviewer",
      "model": "sonnet",
      "prompt": "Review for security vulnerabilities...",
      "color": "blue",
      "planModeRequired": false,
      "joinedAt": 1738000001000,
      "tmuxPaneId": "%42",
      "cwd": "/data/projects/myapp",
      "backendType": "opencode",
      "opencodeSessionId": "ses_xyz789",
      "isActive": true
    }
  ]
}
```

### Team Config - TypeScript

```json
{
  "name": "code-review",
  "created": "2026-01-27T15:00:00.000Z",
  "leader": "leader-1",
  "members": [
    {
      "agentId": "leader-1",
      "agentName": "Team Leader",
      "agentType": "leader",
      "joinedAt": "2026-01-27T15:00:00.000Z"
    },
    {
      "agentId": "worker-1",
      "agentName": "Worker Agent",
      "agentType": "worker",
      "joinedAt": "2026-01-27T15:00:01.000Z"
    }
  ]
}
```

### Task - Python

```json
{
  "id": "3",
  "subject": "Integration Tests",
  "description": "Write integration tests for API endpoints",
  "activeForm": "",
  "status": "pending",
  "blocks": ["5"],
  "blockedBy": ["1", "2"],
  "owner": null
}
```

### Task - TypeScript

```json
{
  "id": "1738000000000-a1b2c3d4",
  "title": "Integration Tests",
  "description": "Write integration tests for API endpoints",
  "priority": "normal",
  "status": "pending",
  "createdAt": "2026-01-27T15:00:00.000Z",
  "dependencies": ["1738000000000-e5f6a7b8"]
}
```
