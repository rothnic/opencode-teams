# Research: Agent Lifecycle and Spawning

**Feature**: 002-agent-lifecycle-spawning
**Date**: 2026-02-10
**Status**: Complete

## Research Questions

### R1: How should OpenCode agent processes be spawned and managed?

**Decision**: Single OpenCode server per project + SDK session provisioning + tmux pane attachment

**Rationale**: This pattern is battle-tested in the ntm project (`/data/projects/ntm/internal/opencode/manager.go`) and follows OpenCode's native server-client architecture. Unlike Claude Code which uses simple scrollback buffers, OpenCode is a full-screen TUI that requires the `opencode serve` + `opencode attach` pattern for multi-agent visibility.

**Alternatives considered**:
1. **Direct `Bun.spawn()` per agent** - Rejected: No TUI visibility, no human takeover capability
2. **OpenCode SDK session API only (headless)** - Rejected: User explicitly requires tmux for monitoring and intervention
3. **Multiple independent `opencode` processes** - Rejected: Resource wasteful, no shared session state

**Key reference implementation**: ntm's `Manager.ProvisionSessions()`:
- Start server: `opencode serve --hostname 127.0.0.1 --port <stable-port>`
- Create sessions: `client.Session.New({ title, directory })`
- Attach to tmux pane: `opencode attach --session <session-id> <server-url>`
- Send prompts via SDK: `client.Session.Prompt()` with retry/verification

### R2: How should the OpenCode server port be determined?

**Decision**: Deterministic port from MD5 hash of absolute project path

**Rationale**: Ensures the same project always gets the same port. No port conflicts between projects. Simple to compute and verify. Direct port from ntm implementation.

**Algorithm**:
```typescript
function portForProject(projectPath: string): number {
  const absPath = path.resolve(projectPath);
  const hash = crypto.createHash('md5').update(absPath).digest();
  const offset = (hash[0] << 8) | hash[1];
  return 28000 + (offset % 1000);
}
```

**Range**: 28000-28999 (1000 ports, sufficient for typical dev machine)

### R3: How should heartbeat/liveness monitoring work?

**Decision**: Hybrid - SDK SSE events (primary) + explicit heartbeat tool (fallback)

**Rationale**: OpenCode agents interact through tool calls, so `tool.execute.after` events serve as natural heartbeat signals without requiring agent cooperation. The explicit heartbeat tool covers edge cases where agents are in long computations without tool calls.

**SDK Event Sources** (from `@opencode-ai/sdk`):
- `session.idle` - Agent waiting for input
- `session.updated` - Agent processing
- `tool.execute.after` - Agent completed a tool call
- `session.error` - Agent encountered an error
- `session.compacted` - Session was compacted (context management)

**SSE Subscription**:
```typescript
const stream = client.event.list(); // SSE stream
for await (const event of stream) {
  if (event.type === 'session.idle' || event.type === 'session.updated') {
    updateHeartbeat(event.properties.sessionID);
  }
  if (event.type === 'session.error') {
    handleError(event.properties);
  }
}
```

**Detection thresholds**:
- Heartbeat interval: 30s
- Stale detection: 60s since last heartbeat
- Grace period: 2 consecutive misses (prevents false positives from network blips)

### R4: How should error recovery work for context limit exhaustion?

**Decision**: Create new session, capture context, re-prompt with handoff

**Rationale**: Context limit exhaustion is a common failure mode in long-running agent sessions. The system must detect this via SDK events and recover automatically by creating a fresh session with sufficient context to continue the agent's work.

**Recovery flow**:
1. Detect `session.error` with context limit indicator
2. Capture current pane output via `tmux capture-pane` for context
3. Create new SDK session via `client.session.new()`
4. Update tmux pane to attach new session
5. Send continuation prompt with captured context
6. Update agent state file with new `session_id`

**ntm reference**: `SendPromptReliable()` with retry/verification pattern, `WaitForSessionIdle()` via SSE events

### R5: How should tmux pane management work?

**Decision**: Required (not optional), extending existing `TmuxOperations` class

**Rationale**: User explicitly confirmed tmux is required for this integration. Oh-my-opencode demonstrates the pattern with configurable layouts.

**Oh-my-opencode config pattern** (from `src/config/schema/tmux.ts`):
```typescript
const TmuxConfigSchema = z.object({
  enabled: z.boolean().default(true),  // Required for this feature
  layout: z.enum(['main-horizontal', 'main-vertical', 'tiled', 'even-horizontal', 'even-vertical']).default('main-vertical'),
  main_pane_size: z.number().min(20).max(80).default(60),
  main_pane_min_width: z.number().min(40).default(120),
  agent_pane_min_width: z.number().min(20).default(40),
});
```

**Extended TmuxOperations** (new methods needed):
- `splitWindow(session, workdir)` -> pane ID
- `sendKeys(paneId, command, enterKey)`
- `capturePaneOutput(paneId, lines)` -> string
- `setPaneOption(paneId, key, value)` - e.g., `@opencode_session_id`
- `getPaneOption(paneId, key)` -> string
- `killPane(paneId)`
- `setPaneTitle(paneId, title)` - format: `{session}__{type}_{index}`
- `selectLayout(session, layout)` - already exists
- `isInsideTmux()` -> boolean

**Using Bun `$` shell API** for tmux commands (safer than `Bun.spawnSync`):
```typescript
const output = await $`tmux split-window -t ${sessionName} -c ${workDir} -PF '#{pane_id}'`.text();
```

### R6: What is the Bun `$` shell API and how does it help?

**Decision**: Use Bun `$` shell API for all tmux command execution

**Rationale**: Automatic string escaping prevents command injection. Template literal syntax is cleaner than argument arrays. Cross-platform support. Better error handling.

**Key capabilities**:
- Template literals with auto-escaping: `$`tmux new-session -s ${name}``
- Output methods: `.text()`, `.json()`, `.lines()`
- Error handling: Throws on non-zero exit (configurable with `.nothrow()`)
- No shell invocation: Runs in-process, safer than `exec()`

**Migration from existing pattern**:
```typescript
// Current (Bun.spawnSync)
const proc = Bun.spawnSync(['tmux', 'new-session', '-d', '-s', sessionName]);
return proc.exitCode === 0;

// New (Bun.$ shell API)
const result = await $`tmux new-session -d -s ${sessionName}`.nothrow();
return result.exitCode === 0;
```

### R7: What OpenCode SDK API surface is needed?

**Decision**: Use `@opencode-ai/sdk` for session management, prompt delivery, and event streaming

**Key APIs** (from ntm's Go SDK usage, TypeScript equivalents):
```typescript
import { createClient } from '@opencode-ai/sdk';

// Client creation
const client = createClient({ baseURL: `http://127.0.0.1:${port}` });

// Session management
const session = await client.session.new({ title, directory });
const messages = await client.session.messages(sessionId);
await client.session.prompt(sessionId, {
  parts: [{ type: 'text', text: promptText }],
  model: { providerID, modelID },  // optional
});

// Event streaming (SSE)
const stream = client.event.list();
for await (const event of stream) {
  // Handle session.idle, session.error, etc.
}
```

**Authentication**: `OPENCODE_SERVER_PASSWORD=user:pass` environment variable (if needed)

### R8: How should task reassignment work when an agent dies?

**Decision**: Extend existing `TaskOperations` with reassignment logic

**Rationale**: The existing task system already has owner tracking and status transitions. When an agent is detected as dead, all tasks owned by that agent should be reset to `pending` status with no owner.

**Implementation**:
```typescript
// In src/operations/task.ts
reassignAgentTasks(teamName: string, agentId: string): Task[] {
  const tasks = getTasks(teamName, { owner: agentId });
  const reassigned: Task[] = [];
  for (const task of tasks) {
    if (task.status === 'in_progress') {
      updateTask(teamName, task.id, {
        status: 'pending',
        owner: undefined,
        claimedAt: undefined,
        warning: `Reassigned: previous owner ${agentId} became inactive`,
      });
      reassigned.push(task);
    }
  }
  return reassigned;
}
```
