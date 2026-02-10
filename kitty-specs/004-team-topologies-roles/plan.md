# Implementation Plan: Team Topologies and Roles

**Branch**: `004-team-topologies-roles` | **Date**: 2026-02-10 | **Spec**: `kitty-specs/004-team-topologies-roles/spec.md`
**Input**: Feature specification from `kitty-specs/004-team-topologies-roles/spec.md`

## Summary

Extend the team coordination system with reusable team templates, formalized roles with
tool-level permissions, topology configuration (flat/swarm vs hierarchical), and conditional
workflow suggestions. Builds on Features 001-003 (core data layer, agent lifecycle, CLI/tmux).

## Technical Context

**Language/Version**: TypeScript 5.3+ (strict mode)
**Runtime**: Bun >= 1.3.2
**Primary Dependencies**: zod (validation), yjs + y-websocket (CRDT), @opencode-ai/plugin (optional peer)
**Storage**: File-based JSON in `.opencode/opencode-teams/` with atomic writes + advisory file locking
**Testing**: bun test (vitest v3.2+ via Bun)
**Target Platform**: Cross-platform (Linux, macOS, Windows via Bun)
**Project Type**: Single project (OpenCode plugin)
**Performance Goals**: Template instantiation < 5s for 10 members; role permission checks < 100ms
**Constraints**: No new runtime dependencies; backward-compatible with existing TeamConfig
**Scale/Scope**: Support 100 concurrent teams

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| TypeScript strict mode | PASS | All new code uses strict: true |
| Bun-first APIs | PASS | File I/O via Bun.file()/Bun.write(), no Node.js fs |
| ES Modules only | PASS | import/export throughout |
| Zod validation on all I/O | PASS | New schemas for templates, roles, topologies |
| Atomic writes for shared state | PASS | Using existing fs-atomic.ts patterns |
| Advisory file locking | PASS | Using existing file-lock.ts |
| No new runtime deps | PASS | Extends existing zod schemas only |
| kebab-case file naming | PASS | All new files follow convention |
| Minimal plugin philosophy | PASS | Provides primitives; agents compose them |
| Test coverage for public APIs | PASS | New test suites for each module |

## Project Structure

### Documentation (this feature)

```text
kitty-specs/004-team-topologies-roles/
|- plan.md              # This file
|- research.md          # Phase 0 output
|- data-model.md        # Phase 1 output
|- quickstart.md        # Phase 1 output
|- contracts/           # Phase 1 output
|- spec.md              # Feature specification
|- tasks.md             # Phase 2 output (/spec-kitty.tasks - NOT created by /spec-kitty.plan)
```

### Source Code (repository root)

```text
src/
|- types/
|  |- schemas.ts           # EXTEND: Add TopologyType, RoleDefinition, TeamTemplate schemas
|  |- index.ts             # EXTEND: Re-export new types
|- operations/
|  |- team.ts              # EXTEND: Template instantiation, topology config, team description
|  |- task.ts              # EXTEND: Role-aware task assignment for swarm topology
|  |- agent.ts             # EXTEND: Role assignment during agent spawn
|  |- template.ts          # NEW: Template CRUD operations (load, save, list, delete)
|  |- role-permissions.ts  # NEW: Role permission checking and enforcement
|  |- workflow-monitor.ts  # NEW: Conditional workflow / backlog manager logic
|  |- index.ts             # EXTEND: Export new operation modules
|- tools/
|  |- spawn-team.ts        # EXTEND: Accept template parameter for template-based creation
|  |- manage-template.ts   # NEW: save-template, list-templates, delete-template tools
|  |- manage-role.ts       # NEW: assign-role, check-permission tools
|  |- delete-team.ts       # NEW: Team deletion tool
|  |- index.ts             # EXTEND: Register new tools
|- index.ts                # EXTEND: Register new tools with OpenCode

tests/
|- team-topologies.test.ts      # NEW: Topology configuration tests
|- role-permissions.test.ts     # NEW: Role permission enforcement tests
|- template-operations.test.ts  # NEW: Template CRUD and instantiation tests
|- workflow-monitor.test.ts     # NEW: Conditional workflow suggestion tests
|- team-deletion.test.ts        # NEW: Team deletion edge cases
```

**Structure Decision**: Single project extending existing `src/operations/` and `src/tools/`
modules. New functionality added as new operation/tool files following established patterns.
No new top-level directories.

## Complexity Tracking

No constitution violations. All additions follow existing patterns.

## Design Decisions

### 1. Backward Compatibility

TeamConfigSchema will be extended with optional fields (`topology`, `description`,
`templateSource`). Existing teams without these fields remain valid since all new fields
have defaults or are optional.

### 2. Role Permission Model

Permissions are checked at tool execution time via a middleware-style guard function.
Each role defines `allowedTools` and `deniedTools` arrays. The guard checks the calling
agent's role against the tool being invoked and returns a rejection error if denied.

### 3. Template Storage

Templates stored as JSON files in `.opencode/opencode-teams/templates/{templateName}.json`.
Each template includes roles, topology, default tasks, and description. Templates are
project-local by default; cross-project sharing via file copy.

### 4. Topology as Configuration, Not Code Path

Topology (flat vs hierarchical) is stored as a config field on TeamConfig. Behavioral
differences are enforced through the existing task claim logic:

- Flat/swarm: Any member can self-assign from the shared queue (existing behavior)
- Hierarchical: Task assignment messages must originate from the leader role

### 5. Workflow Monitor as Polling Check

The conditional workflow / backlog manager runs as a check triggered by task status
changes (not a background daemon). When tasks transition, the monitor evaluates the
ratio of unblocked tasks to active workers and emits a suggestion message if the
threshold is exceeded.