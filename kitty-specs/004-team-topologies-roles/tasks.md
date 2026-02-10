# Tasks: Team Topologies and Roles

**Feature**: 004-team-topologies-roles
**Date**: 2026-02-10
**Work Packages**: 6

## Subtask Registry

| ID | Description | WP | Parallel |
|----|-------------|-----|---------|
| T001 | Add TopologyType enum schema | WP01 | [P] |
| T002 | Add RoleDefinition schema | WP01 | [P] |
| T003 | Add WorkflowConfig schema | WP01 | [P] |
| T004 | Add TeamTemplate schema | WP01 | |
| T005 | Extend TeamConfigSchema with optional fields | WP01 | |
| T006 | Extend AgentState role enum with task-manager | WP01 | |
| T007 | Add template storage paths to storage-paths.ts | WP01 | |
| T008 | Write schema unit tests | WP01 | |
| T009 | Create TemplateOperations.save | WP02 | |
| T010 | Create TemplateOperations.load | WP02 | |
| T011 | Create TemplateOperations.list | WP02 | [P] |
| T012 | Create TemplateOperations.delete | WP02 | [P] |
| T013 | Create TemplateOperations.saveFromTeam | WP02 | |
| T014 | Add built-in default templates (code-review, leader-workers, swarm) | WP02 | |
| T015 | Write template operations tests | WP02 | |
| T016 | Create checkPermission guard function | WP03 | |
| T017 | Define default role permission map | WP03 | |
| T018 | Create getAgentRole helper | WP03 | |
| T019 | Integrate permission checks into existing tool entry points | WP03 | |
| T020 | Write role permission tests | WP03 | |
| T021 | Implement spawnTeamFromTemplate in team.ts | WP04 | |
| T022 | Add topology enforcement to task claiming | WP04 | |
| T023 | Add description field support to team operations | WP04 | [P] |
| T024 | Implement TeamOperations.deleteTeam | WP04 | [P] |
| T025 | Write team extension tests | WP04 | |
| T026 | Create WorkflowMonitor.evaluate function | WP05 | |
| T027 | Integrate workflow evaluation into task status transitions | WP05 | |
| T028 | Add cooldown tracking to prevent suggestion spam | WP05 | |
| T029 | Write workflow monitor tests | WP05 | |
| T030 | Create manage-template tool (save, list, delete) | WP06 | [P] |
| T031 | Create manage-role tool (assign-role, check-permission) | WP06 | [P] |
| T032 | Create delete-team tool | WP06 | [P] |
| T033 | Update spawn-team tool to accept template parameter | WP06 | |
| T034 | Register all new tools in src/tools/index.ts and src/index.ts | WP06 | |
| T035 | Update operations/index.ts barrel exports | WP06 | |
| T036 | Update skill documentation in skills/ | WP06 | |

## Phase 1: Foundation

### WP01 - Schema Extensions

**Goal**: Add Zod schemas for TopologyType, RoleDefinition, WorkflowConfig, TeamTemplate.
Extend TeamConfigSchema and AgentState role enum. Add template storage paths.

**Priority**: P0 (blocks all other WPs)
**Dependencies**: None
**Subtasks**: T001-T008 (8 subtasks)
**Estimated prompt size**: ~450 lines

**Implementation sketch**:

1. Add new schemas to `src/types/schemas.ts` after existing schemas
2. Extend TeamConfigSchema with optional topology, description, templateSource, roles, workflowConfig
3. Add 'task-manager' to AgentState role enum
4. Add getTemplatesDir() and getTemplatePath() to storage-paths.ts
5. Re-export new types from src/types/index.ts
6. Write tests validating all new schemas (valid and invalid cases)

**Parallel opportunities**: T001-T003 are independent schema additions. T004-T006 depend on T001-T003.

**Risks**:
- Backward compatibility: ensure existing TeamConfig files parse without new fields
- Schema ordering: TeamTemplate references RoleDefinition, so RoleDefinition must come first

**Implementation command**: `spec-kitty implement WP01`

---

### WP02 - Template Operations

**Goal**: Create TemplateOperations module for template CRUD + built-in templates.

**Priority**: P1
**Dependencies**: WP01
**Subtasks**: T009-T015 (7 subtasks)
**Estimated prompt size**: ~500 lines

**Implementation sketch**:

1. Create `src/operations/template.ts` following team.ts patterns
2. Implement save/load/list/delete using atomic writes + file locking
3. Implement saveFromTeam to extract template from running team config
4. Ship 3 built-in templates: code-review, leader-workers, swarm
5. Write comprehensive tests for all CRUD operations

**Parallel opportunities**: T011 (list) and T012 (delete) are independent.

**Risks**:
- Template validation must reject invalid role references
- Built-in templates must match the TeamTemplate schema exactly

**Implementation command**: `spec-kitty implement WP02 --base WP01`

---

## Phase 2: Core Features

### WP03 - Role Permission System

**Goal**: Create role-based tool access control with guard function and permission maps.

**Priority**: P1
**Dependencies**: WP01
**Subtasks**: T016-T020 (5 subtasks)
**Estimated prompt size**: ~400 lines

**Implementation sketch**:

1. Create `src/operations/role-permissions.ts`
2. Define DEFAULT_ROLE_PERMISSIONS map with allowedTools/deniedTools per role
3. Implement checkPermission(role, toolName) -> boolean
4. Implement getAgentRole(agentId, teamName) -> role string
5. Add permission check calls at the start of sensitive tool execute() functions
6. Write tests for permission enforcement (allow, deny, unknown role)

**Parallel opportunities**: WP03 and WP02 can run in parallel (both depend on WP01 only).

**Risks**:
- Must not break existing tool functionality for agents without roles
- Default behavior (no role assigned) should allow all tools (backward compat)

**Implementation command**: `spec-kitty implement WP03 --base WP01`

---

### WP04 - Team Extensions

**Goal**: Template instantiation, topology enforcement on task claiming, team description,
team deletion.

**Priority**: P1
**Dependencies**: WP01, WP02, WP03
**Subtasks**: T021-T025 (5 subtasks)
**Estimated prompt size**: ~450 lines

**Implementation sketch**:

1. Add spawnTeamFromTemplate to team.ts - loads template, creates team with roles/tasks
2. Modify task claim logic: if topology is 'hierarchical', only leader/task-manager can assign
3. Add description field handling to spawnTeam and team config read/write
4. Implement deleteTeam - removes team directory and all contents (tasks, inboxes, config)
5. Write tests for template instantiation, topology enforcement, deletion edge cases

**Parallel opportunities**: T023 (description) and T024 (deleteTeam) are independent.

**Risks**:
- deleteTeam must handle active tasks and in-progress work gracefully
- Topology enforcement must not break flat topology (existing default behavior)

**Implementation command**: `spec-kitty implement WP04 --base WP03`

---

### WP05 - Workflow Monitor

**Goal**: Conditional auto-scaling suggestion logic triggered on task status transitions.

**Priority**: P2
**Dependencies**: WP01, WP04
**Subtasks**: T026-T029 (4 subtasks)
**Estimated prompt size**: ~350 lines

**Implementation sketch**:

1. Create `src/operations/workflow-monitor.ts`
2. Implement evaluate(teamName) - checks unblocked/worker ratio against threshold
3. Integrate into TaskOperations.updateTask - call evaluate after status transitions
4. Add cooldown tracking via WorkflowConfig.lastSuggestionAt field
5. Emit suggestion as inbox message to leader when threshold exceeded
6. Write tests for threshold evaluation, cooldown, suggestion emission

**Parallel opportunities**: WP05 can run in parallel with WP06 after WP04 completes.

**Risks**:
- Must not add perceptible latency to task updates (check must be fast)
- Cooldown tracking modifies team config - needs atomic write

**Implementation command**: `spec-kitty implement WP05 --base WP04`

---

## Phase 3: Integration

### WP06 - Tool Integration and Documentation

**Goal**: Create OpenCode tools, register in plugin, update skill documentation.

**Priority**: P2
**Dependencies**: WP02, WP03, WP04
**Subtasks**: T030-T036 (7 subtasks)
**Estimated prompt size**: ~500 lines

**Implementation sketch**:

1. Create `src/tools/manage-template.ts` - save-template, list-templates, delete-template
2. Create `src/tools/manage-role.ts` - assign-role, check-permission
3. Create `src/tools/delete-team.ts` - delete-team
4. Update `src/tools/spawn-team.ts` - add optional template parameter
5. Register all new tools in src/tools/index.ts
6. Register all new tools in src/index.ts plugin entry point
7. Export new operation modules from src/operations/index.ts
8. Update skills/team-coordination/SKILL.md with new tool descriptions

**Parallel opportunities**: T030, T031, T032 are independent tool files.

**Risks**:
- Tool registration must follow the exact pattern in existing tools
- Skill documentation must accurately describe new capabilities

**Implementation command**: `spec-kitty implement WP06 --base WP04`

---

## Dependency Graph

```text
WP01 (Schema Extensions)
 |--- WP02 (Template Operations)
 |     |--- WP04 (Team Extensions) <-- also depends on WP03
 |           |--- WP05 (Workflow Monitor)
 |           |--- WP06 (Tool Integration) <-- also depends on WP02, WP03
 |--- WP03 (Role Permissions)
```

## Parallelization Summary

- **Sequential**: WP01 must complete first
- **Parallel pair 1**: WP02 + WP03 (both depend only on WP01)
- **After WP02+WP03**: WP04
- **Parallel pair 2**: WP05 + WP06 (both depend on WP04, but independent of each other)

## MVP Scope

WP01 + WP02 + WP04 provide the core value: team templates, topology configuration,
and template-based team creation. WP03 (permissions) and WP05 (workflow monitor) add
enforcement and automation. WP06 wires everything into the OpenCode plugin.
