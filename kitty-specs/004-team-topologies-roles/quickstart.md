# Quickstart: Team Topologies and Roles

**Feature**: 004-team-topologies-roles
**Date**: 2026-02-10

## What's New

Feature 004 adds team templates, role-based permissions, topology configuration, and
conditional workflow suggestions to opencode-teams.

## Quick Examples

### Create a team from a template

```typescript
// Using the built-in code-review template
const team = TeamOperations.spawnTeamFromTemplate('pr-review-42', 'code-review', {
  agentName: 'ReviewLeader',
});
// Creates team with 3 reviewer slots and pre-built tasks:
// security-review, performance-review, style-review
```

### Configure topology

```typescript
// Create a hierarchical team where only the leader assigns tasks
const team = TeamOperations.spawnTeam('deploy-team', {
  agentName: 'DeployLeader',
}, {
  topology: 'hierarchical',
  description: 'Production deployment coordination',
});
```

### Check role permissions

```typescript
import { checkPermission } from './operations/role-permissions';

// Returns true/false based on role definition
const canClaim = checkPermission('worker', 'claim-task');   // true
const canSpawn = checkPermission('worker', 'spawn-team');   // false
const canKill = checkPermission('reviewer', 'kill-agent');  // false
```

### Save a running team as a template

```typescript
import { TemplateOperations } from './operations/template';

// Save current team config as a reusable template
TemplateOperations.saveFromTeam('my-custom-template', 'deploy-team', {
  description: 'Our standard deployment team setup',
});
```

### Delete a team

```typescript
// Clean up team and all associated resources
TeamOperations.deleteTeam('old-review-team');
```

## Implementation Order

1. **WP01 - Schemas**: Extend types with TopologyType, RoleDefinition, TeamTemplate, WorkflowConfig
2. **WP02 - Template Operations**: CRUD for templates + storage in templates/ directory
3. **WP03 - Role Permissions**: Permission guard function and enforcement
4. **WP04 - Team Extensions**: Template instantiation, topology, description, deletion
5. **WP05 - Workflow Monitor**: Conditional auto-scaling suggestion logic
6. **WP06 - Tools & Integration**: New OpenCode tools + skill documentation updates
