# Product Requirements Document: OpenCode Teams Plugin (v1.0)

## 1. Project Overview
**Title**: OpenCode Teams - Advanced Agent Coordination Framework  
**Status**: Draft  
**Reference**: [claude-code-teams-mcp](https://github.com/cs50victor/claude-code-teams-mcp)  

The `opencode-teams` plugin extends OpenCode with robust multi-agent coordination capabilities. It provides a task-based workflow, inter-agent messaging, and a visual session manager (Tmux) to orchestrate complex software engineering tasks involving multiple specialized AI agents.

## 2. User Stories

### 2.1 Coordination & State (Phase 1 & 2)
- **As an Agent Leader**, I want to create a team and define a plan so that I can delegate sub-tasks to specialized workers.
- **As a Worker Agent**, I want to poll for new messages and tasks without blocking my execution loop for long periods.
- **As a Developer**, I want the team state to be persistent and safe from concurrent write corruption.

### 2.2 Task Management & Dependencies (Phase 3)
- **As an Agent**, I want to see which tasks are "blocked" by other tasks so that I don't start work that isn't ready.
- **As an Agent**, I should be able to claim a task even if it is blocked (Soft Blocking), but receive a clear warning about missing dependencies.

### 2.3 Tmux Session Manager (Phase 4)
- **As a User**, I want to see all active agents in a tiled Tmux layout so I can monitor their progress in real-time.
- **As a User**, I want to be able to run `opencode-teams` from any directory to manage my agent sessions.

## 3. Technical Requirements

### 3.1 State Management
- **Storage Location**: Centralized global directory at `~/.config/opencode-teams/` (mirrors the `~/.claude/teams` pattern).
- **Concurrency**: Implement advisory file locking (using `fcntl` or similar Bun-compatible locking) for all JSON state files (inboxes, tasks, config).
- **Atomic Writes**: All state updates must use the "Write-Temp-then-Rename" pattern to ensure atomicity.

### 3.2 Messaging & Polling
- **Long-Polling**: Implement a `poll_inbox` tool that supports a configurable timeout (default 30s) to reduce CPU overhead and latency.
- **Inbox Protocol**: JSON-based message persistence with support for broadcasts and direct replies.

### 3.3 Task System
- **Schema**: Tasks must include `id`, `title`, `status` (pending, in_progress, completed, failed), `owner`, and `dependencies` (`blocked_by` array).
- **Soft Blocking**: The `claim_task` tool must return a warning if dependencies are not met but should not prevent the assignment unless requested by the user.

### 3.4 Tmux Integration
- **Layout**: Default to `tiled` layout. Support `main-vertical` and `even-horizontal` via configuration.
- **Agent Naming**: Agents should be spawned with consistent naming: `<name>@<team>`.
- **Command Line**: Provide a CLI binary `opencode-teams` that manages session creation, attachment, and cleanup.

## 4. Operational Requirements

### 4.1 Installation
- **Method**: Use a `postinstall` script in `package.json` to link the binary into the user's path.
- **OpenCode Plugin**: The plugin must register itself and its tools via the OpenCode manifest.

### 4.2 Quality & Standards
- **Linter**: `mise run lint`
- **Type Check**: `mise run typecheck`
- **Testing**: `bun test` (must achieve >80% coverage on core operations).

## 5. Lifecycle Management
- **Shutdown**: Agents signal "Ready for Shutdown" via an `approve_shutdown` tool call.
- **Fallback**: The plugin should hook into OpenCode's `session_idle` events to mark agents as inactive if they have not made a tool call or sent a message within a threshold.

## 6. Success Criteria
1. Successfully spawn a 3-agent team in a tiled Tmux session using a single command.
2. Demonstrate a worker agent waiting for a "plan_approval" message via long-polling.
3. Successfully complete a task chain where a "Review" task is correctly identified as blocked by a "Code" task.
4. Cleanly shut down all agents and close the Tmux session upon completion.