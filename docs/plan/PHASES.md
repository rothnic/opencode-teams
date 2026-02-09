# Implementation Phases

This document outlines the phased implementation plan for `opencode-teams`. Each phase must
be fully verified against its success criteria before proceeding to the next.

## Phase 1: Foundation & Data Integrity

**Goal**: Establish the robust storage layer required for concurrent agent coordination.

### Tasks

1. **Storage Utilities**: Implement `src/utils/storage-paths.ts` for consistent global vs.
   project path resolution.
2. **File Locking**: Implement `src/utils/file-lock.ts` using Bun FFI for `fcntl` advisory locking.
3. **Atomic Operations**: Implement `src/utils/fs-atomic.ts` for write-temp-then-rename and
   JSON validation via Zod.
4. **Schema Definitions**: Define core Zod schemas for `TeamConfig`, `Task`, and `Message`
   in `src/types/schemas.ts`.
5. **Refactor Base Operations**: Update `TeamOperations` and `TaskOperations` to use the new
   locked/atomic/validated utilities.

### Phase Verification Criteria

- [ ] Concurrent writes to the same task file do not result in data loss or corruption
      (verified via stress test).
- [ ] Partial writes (simulated crashes) leave the original file intact.
- [ ] Invalid JSON or schema-mismatched data triggers immediate validation errors.
- [ ] Paths resolve correctly to `.opencode/` within the project root.

---

## Phase 2: Enhanced Messaging & Protocol

**Goal**: Transition to the per-agent inbox model and implement high-efficiency communication.

### Tasks

1. **Per-Agent Inboxes**: Migrate messaging from the shared-directory scan to individual
   agent inbox files (`inboxes/<agent-id>.json`).
2. **Messaging Operations**: Implement `readInbox`, `sendMessage`, and `broadcastMessage`
   with proper locking and delivery to individual files.
3. **Structured Messages**: Add support for typed messages (`plain`, `idle`, `task_assignment`,
   `shutdown_request`).
4. **Long-Polling Protocol**: Enhance `poll-inbox` to use the `read` flag on messages and
   provide a reliable timeout/new-message response.

### Phase Verification Criteria

- [ ] `sendMessage` appends to exactly one recipient file; `broadcastMessage` appends to N
      files.
- [ ] `poll-inbox` returns immediately on new messages and waits correctly up to the timeout.
- [ ] Message retrieval marks messages as `read: true` atomically.
- [ ] Structured messages are correctly parsed and validated by recipients.

---

## Phase 3: Advanced Task System

**Goal**: Implement production-grade task dependencies and state machine enforcement.

### Tasks

1. **Bidirectional Dependencies**: Update task schema to include both `blocks` and
   `blocked_by`. Implement automatic cascading updates (completing A unblocks B).
2. **State Machine Enforcement**: Enforce forward-only status transitions (`pending` ->
   `in_progress` -> `completed`).
3. **Dependency Guard**: Prevent status updates to `in_progress` or `completed` if
   `blocked_by` tasks are not `completed`.
4. **Cycle Detection**: Implement robust cycle detection to prevent infinite dependency loops.
5. **Soft Blocking**: Implement the `claim-task` override that allows claiming blocked tasks
   with a warning.

### Phase Verification Criteria

- [ ] Completing a task automatically removes its ID from the `blocked_by` list of all
      dependent tasks.
- [ ] Attempting to create a circular dependency (A->B, B->A) returns a validation error.
- [ ] Status regression attempts (e.g., `completed` -> `in_progress`) are rejected.
- [ ] `claim-task` on a blocked task returns the required warning metadata.

---

## Phase 4: Team Topologies & Role Configuration

**Goal**: Enable flexible team structures and agent roles.

### Tasks

1. **Team Templates**: Implement global templates in `~/.config/opencode/opencode-teams/
templates/`.
2. **Role System**: Define agent roles in `TeamConfig` (Leader, Member, Reviewer, etc.).
3. **Conditional Workflows**: Implement logic for "backlog manager" agents that trigger based
   on team state (e.g., spawning more workers when unblocked tasks > N).
4. **Topologies**: Support flat vs. hierarchical configurations in `spawn-team`.

### Phase Verification Criteria

- [ ] A team can be spawned from a predefined template.
- [ ] Agents can distinguish their role and permissions based on `TeamConfig`.
- [ ] Flat teams correctly share the task backlog without a central leader.
- [ ] Hierarchical teams allow the leader to manage the `blocks`/`blocked_by` relationships.

---

## Phase 5: Session & Process Management

**Goal**: Orchestrate the actual agent processes via OpenCode.

### Tasks

1. **OpenCode SDK Integration**: Build the `Spawner` utility using the OpenCode SDK to create
   sessions and inject prompts.
2. **Agent Spawning**: Implement `spawn-teammate` tool to launch new agents with injected
   environment variables (`OPENCODE_AGENT_ID`, `OPENCODE_TEAM_NAME`).
3. **Lifecycle Hooks**: Register hooks for `session.created` and `session.idle` to track
   agent liveness and update `TeamConfig`.
4. **Shutdown Protocol**: Implement the `request-shutdown` / `approve-shutdown` negotiation.

### Phase Verification Criteria

- [ ] `spawn-teammate` successfully creates a new OpenCode session with the correct agent
      identity.
- [ ] Agents automatically join their assigned team upon session start.
- [ ] Idle agents are correctly identified and their tasks can be optionally reassigned.
- [ ] Graceful shutdown cleans up sessions and updates team state.

---

## Phase 6: CLI & TUI Visualization

**Goal**: Provide human-facing tools to monitor and manage the team.

### Tasks

1. **Global CLI**: Finalize the `opencode-teams` binary using Bun.
2. **Tmux Layout Manager**: Implement the project-specific tmux session manager to tile
   agent panes.
3. **Real-time Visualization**: Implement a "dashboard" command that shows task progress and
   message flow.
4. **Session Attachment**: Provide easy `attach` commands to jump into any agent's tmux pane.

### Phase Verification Criteria

- [ ] `opencode-teams init` starts the project server and tiles panes correctly in tmux.
- [ ] The dashboard accurately reflects the current state of tasks and team membership.
- [ ] Detaching and re-attaching to the tmux session preserves the layout and state.
