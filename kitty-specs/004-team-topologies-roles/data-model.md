# Data Model: Team Topologies and Roles

**Feature**: 004-team-topologies-roles
**Date**: 2026-02-10

## New Schemas

### TopologyType

Enum defining the team coordination structure.

```text
Values: 'flat' | 'hierarchical'
Default: 'flat'
```

- `flat`: Workers self-assign tasks from shared queue (existing behavior)
- `hierarchical`: Task assignment routed through leader/task-manager roles

### RoleDefinition

Defines a role with associated tool permissions.

```text
Fields:
  name: string (required) - Role identifier (e.g., 'leader', 'worker', 'reviewer', 'task-manager')
  allowedTools: string[] (optional) - Whitelist of tool names this role can invoke
  deniedTools: string[] (optional) - Blacklist of tool names this role cannot invoke
  description: string (optional) - Human-readable role description
```

Permission resolution: `deniedTools` takes precedence over `allowedTools`. If `allowedTools`
is empty/undefined, all tools are allowed except those in `deniedTools`.

### TeamTemplate

A reusable blueprint for creating teams.

```text
Fields:
  name: string (required) - Unique template identifier (kebab-case)
  description: string (optional) - Purpose and usage guidelines
  topology: TopologyType (required, default: 'flat')
  roles: RoleDefinition[] (required, min: 1) - Available roles in this template
  defaultTasks: TaskCreateInput[] (optional) - Tasks to create on instantiation
  workflowConfig: WorkflowConfig (optional) - Auto-scaling configuration
  createdAt: string (ISO 8601)
  updatedAt: string (ISO 8601, optional)
```

### WorkflowConfig

Configuration for conditional workflow suggestions.

```text
Fields:
  enabled: boolean (default: false)
  taskThreshold: number (default: 5) - Unblocked tasks count to trigger suggestion
  workerRatio: number (default: 3.0) - Ratio of unblocked tasks to active workers
  cooldownSeconds: number (default: 300) - Min seconds between suggestions
  lastSuggestionAt: string (ISO 8601, optional) - Timestamp of last suggestion
```

## Extended Schemas

### TeamConfig (extended)

New optional fields added to existing schema:

```text
Existing fields: name, created, leader, members, shutdownApprovals
New fields:
  topology: TopologyType (optional, default: 'flat')
  description: string (optional) - Team purpose/scope documentation
  templateSource: string (optional) - Name of template used to create this team
  roles: RoleDefinition[] (optional) - Role definitions for this team
  workflowConfig: WorkflowConfig (optional) - Auto-scaling configuration
```

### AgentState (extended)

Extended role enum:

```text
Existing role values: 'leader' | 'worker' | 'reviewer'
New role values: 'leader' | 'worker' | 'reviewer' | 'task-manager'
```

## Storage Layout

```text
.opencode/opencode-teams/
|- teams/
|  |- {teamName}/
|     |- config.json        # TeamConfig (extended with new fields)
|     |- tasks/             # Task files (unchanged)
|     |- inboxes/           # Agent inboxes (unchanged)
|- templates/               # NEW directory
|  |- {templateName}.json   # TeamTemplate files
```

## Entity Relationships

- TeamTemplate 1->* RoleDefinition (template defines available roles)
- TeamConfig 0..1->1 TeamTemplate (team may reference source template)
- TeamConfig 1->* TeamMember (unchanged)
- TeamConfig 0..1->1 WorkflowConfig (optional auto-scaling)
- AgentState *->1 RoleDefinition (agent's role maps to a role definition)
- RoleDefinition ->* Tool permissions (role gates tool access)

## State Transitions

### Template Lifecycle

```text
Created -> Active (available for instantiation)
Active -> Updated (modified via save-template)
Active -> Deleted (removed via delete-template)
```

### Workflow Suggestion

```text
Task completed -> Check threshold -> If exceeded -> Emit suggestion to leader inbox
                                   -> If not exceeded -> No action
Suggestion emitted -> Cooldown period -> Ready for next check
```

## Default Role Definitions

### Built-in Roles

```text
leader:
  allowedTools: [spawn-team, spawn-agent, kill-agent, delete-team, broadcast-message,
                 create-task, assign-role]
  deniedTools: [claim-task]

worker:
  allowedTools: [claim-task, update-task, send-message, heartbeat, poll-inbox]
  deniedTools: [spawn-team, spawn-agent, kill-agent, delete-team, assign-role]

reviewer:
  allowedTools: [update-task, send-message, poll-inbox, heartbeat]
  deniedTools: [spawn-team, spawn-agent, kill-agent, delete-team, claim-task, assign-role]

task-manager:
  allowedTools: [create-task, claim-task, update-task, send-message, broadcast-message,
                 poll-inbox, heartbeat]
  deniedTools: [spawn-team, spawn-agent, kill-agent, delete-team, assign-role]
```

## Built-in Templates

### code-review

```text
name: code-review
description: Template for parallel code review with specialized reviewers
topology: flat
roles: [leader, reviewer (x3)]
defaultTasks: [security-review, performance-review, style-review]
```

### leader-workers

```text
name: leader-workers
description: Hierarchical team with a leader directing multiple workers
topology: hierarchical
roles: [leader, worker (variable)]
defaultTasks: []
workflowConfig: { enabled: true, taskThreshold: 5, workerRatio: 3.0 }
```

### swarm

```text
name: swarm
description: Flat topology where workers self-assign from shared task queue
topology: flat
roles: [worker (variable)]
defaultTasks: []
workflowConfig: { enabled: false }
```
