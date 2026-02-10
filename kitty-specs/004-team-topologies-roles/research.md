# Research: Team Topologies and Roles

**Feature**: 004-team-topologies-roles
**Date**: 2026-02-10

## Research Questions

### RQ1: How to extend TeamConfigSchema with backward compatibility?

**Decision**: Add optional fields with sensible defaults via Zod `.optional()` and `.default()`.

**Rationale**: Existing TeamConfig files on disk lack topology/description/template fields.
Zod's `.optional()` allows parsing without these fields. New teams get defaults applied at
creation time. No migration needed for existing data.

**Alternatives considered**:

- Schema versioning with migration scripts: Rejected because overkill for additive-only changes
- Separate TopologyConfig file per team: Rejected because it fragments team state unnecessarily

### RQ2: How to enforce role-based tool permissions?

**Decision**: Guard function called at tool execution entry point. Each role maps to
allowed/denied tool name arrays. Guard checks the calling agent's role (from AgentState)
against the invoked tool name and throws an error if denied.

**Rationale**: Simple, auditable, and testable. No middleware framework needed. Follows the
existing pattern of validation checks at the start of operations (e.g., team name validation
in `spawnTeam`).

**Alternatives considered**:

- OpenCode plugin hook interception: Rejected because the hook API doesn't expose tool-level
  gating. Permission checks must be in-tool.
- Decorator pattern on tool functions: Rejected because TypeScript decorators are stage 3 and
  add complexity without clear benefit over a simple function call.

### RQ3: How to implement swarm vs hierarchical task assignment?

**Decision**: Swarm is the default (existing behavior). Hierarchical adds a check in task
claim: if topology is `hierarchical`, only the leader or a `task-manager` role can assign
tasks. Self-assignment by workers is blocked.

**Rationale**: Minimal code change. The existing `claimTask` operation just needs a topology
check. Hierarchical topology redirects workers to request assignment via messages rather than
self-claiming.

**Alternatives considered**:

- Separate task queue per topology type: Rejected because it duplicates task management logic.
- Event-based assignment dispatch: Deferred to Feature 005 (Event-Driven Agent Dispatch).

### RQ4: Template storage format and location

**Decision**: Templates stored in `.opencode/opencode-teams/templates/{name}.json`. Each is
a self-contained JSON file validated by `TeamTemplateSchema`. Templates are instantiated by
copying their config and creating the team with pre-defined roles and tasks.

**Rationale**: Consistent with existing file-based storage pattern. Templates are portable
(copy file to share). Atomic write + advisory locking applies.

**Alternatives considered**:

- Templates in a SQLite database: Rejected per constitution (file-based storage).
- Templates bundled with the plugin source: Rejected because user-defined templates need
  runtime persistence. Built-in templates can be shipped as defaults and copied to storage.

### RQ5: Conditional workflow threshold evaluation

**Decision**: Evaluate on task status transitions (not polling). When a task moves to
`completed`, check: `unblockedPendingTasks / activeWorkers > threshold`. If exceeded,
emit a suggestion message to the leader's inbox.

**Rationale**: Event-driven evaluation avoids polling overhead. The check runs inline during
task update, which is already an atomic operation. Suggestion via inbox message follows the
existing messaging pattern.

**Alternatives considered**:

- Background polling timer: Rejected because the plugin has no daemon process.
- Real-time WebSocket push: Deferred to when yjs CRDT integration is more mature.
