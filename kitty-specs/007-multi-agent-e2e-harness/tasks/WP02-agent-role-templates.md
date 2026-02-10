---
work_package_id: WP02
title: E2E Agent Role Templates
lane: "planned"
dependencies: []
base_branch: main
base_commit: 1cdc1b8c9f335b775df1fea4b46f427030806215
created_at: '2026-02-10T14:28:00+00:00'
subtasks:
  - T009
  - T010
  - T011
phase: Phase 1 - Foundation
assignee: ''
agent: ""
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-02-10T14:28:00Z'
    lane: planned
    agent: system
    action: Prompt generated via /spec-kitty.tasks
---
# Work Package Prompt: WP02 -- E2E Agent Role Templates

## Objective

Create three agent role templates for E2E testing: `e2e-planner`, `e2e-builder`,
and `e2e-reviewer`. Each template defines the agent's model, tool permissions, and
behavioral instructions for exercising the coordination primitives.

## Context

This project has existing agent templates in `agent/` with a consistent format:
- `agent/team-leader/AGENT.md` — leader role
- `agent/team-member/AGENT.md` — worker role
- `agent/task-manager/AGENT.md` — task management role

All templates use YAML frontmatter with fields: `name`, `description`, `mode`, `model`,
`tools` (allow/deny per tool), `permissions.tool` (same allow/deny mapping).

**Critical requirement**: All E2E templates MUST use `model: google/antigravity-gemini-3-flash`.
This is a hard requirement from the user.

**Available tools in this plugin** (from `src/index.ts`):
- `spawn-team`, `discover-teams`, `get-team-info`, `join-team`
- `send-message`, `broadcast-message`, `read-messages`
- `create-task`, `get-tasks`, `claim-task`, `update-task`

## Subtasks

### T009: Create e2e-planner AGENT.md
**File**: `agent/e2e-planner/AGENT.md`

YAML frontmatter:
```yaml
name: e2e-planner
description: E2E test planner that creates teams, manages task dependency graphs, and handles review rework cycles
mode: agent
model: google/antigravity-gemini-3-flash
tools:
  spawn-team: allow
  discover-teams: allow
  get-team-info: allow
  join-team: deny
  send-message: allow
  broadcast-message: allow
  read-messages: allow
  create-task: allow
  get-tasks: allow
  claim-task: deny
  update-task: allow
permissions:
  tool:
    spawn-team: allow
    discover-teams: allow
    get-team-info: allow
    create-task: allow
    get-tasks: allow
    update-task: allow
    broadcast-message: allow
    send-message: allow
    read-messages: allow
    join-team: deny
    claim-task: deny
```

Markdown body instructions (follow the style of `agent/team-leader/AGENT.md`):
- Title: "# E2E Test Planner Agent"
- Responsibilities: Create team, break work into tasks with dependencies, assign tasks to builders, route completed tasks to reviewer, handle rework cycles (re-assign with reviewer feedback)
- Workflow: spawn-team → create tasks with dependency graph → assign → monitor → route to reviewer → handle rework → verify all complete
- Emphasize: dependency-aware scheduling (don't assign blocked tasks), parallel assignment to multiple builders, rework loop handling

### T010: Create e2e-builder AGENT.md
**File**: `agent/e2e-builder/AGENT.md`

YAML frontmatter:
```yaml
name: e2e-builder
description: E2E test builder that joins teams, claims assigned tasks, and completes work
mode: agent
model: google/antigravity-gemini-3-flash
tools:
  spawn-team: deny
  discover-teams: allow
  get-team-info: allow
  join-team: allow
  send-message: allow
  broadcast-message: allow
  read-messages: allow
  create-task: deny
  get-tasks: allow
  claim-task: allow
  update-task: allow
permissions:
  tool:
    discover-teams: allow
    join-team: allow
    get-tasks: allow
    claim-task: allow
    update-task: allow
    send-message: allow
    broadcast-message: allow
    read-messages: allow
    get-team-info: allow
    spawn-team: deny
    create-task: deny
```

Markdown body instructions (follow the style of `agent/team-member/AGENT.md`):
- Title: "# E2E Test Builder Agent"
- Responsibilities: Join team, check inbox for assignments, claim assigned tasks, complete work, report completion via message
- Workflow: join-team → read-messages → get-tasks → claim-task → execute → update-task(completed) → send-message to planner
- Emphasize: only claim tasks assigned to you, update status promptly, handle rework requests by revising and re-completing

### T011: Create e2e-reviewer AGENT.md
**File**: `agent/e2e-reviewer/AGENT.md`

YAML frontmatter:
```yaml
name: e2e-reviewer
description: E2E test reviewer that evaluates completed tasks and approves or requests rework
mode: agent
model: google/antigravity-gemini-3-flash
tools:
  spawn-team: deny
  discover-teams: allow
  get-team-info: allow
  join-team: allow
  send-message: allow
  broadcast-message: deny
  read-messages: allow
  create-task: deny
  get-tasks: allow
  claim-task: deny
  update-task: allow
permissions:
  tool:
    discover-teams: allow
    join-team: allow
    get-tasks: allow
    update-task: allow
    send-message: allow
    read-messages: allow
    get-team-info: allow
    spawn-team: deny
    create-task: deny
    claim-task: deny
    broadcast-message: deny
```

Markdown body instructions:
- Title: "# E2E Test Reviewer Agent"
- Responsibilities: Join team, review completed tasks routed by planner, approve good work, reject with specific feedback for rework
- Workflow: join-team → read-messages (for review requests) → get-tasks(completed) → evaluate → send-message to planner with approval or rework request
- Emphasize: provide actionable feedback on rejections, approve when quality is sufficient, communicate clearly

## Verification

- All three files exist under `agent/`
- YAML frontmatter parses correctly
- All use `model: google/antigravity-gemini-3-flash`
- Tool permissions match the spec (planner can't claim, builder can't create, reviewer can't claim or create)

## Activity Log
