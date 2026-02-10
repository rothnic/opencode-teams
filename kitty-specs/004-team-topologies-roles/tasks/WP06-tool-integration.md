---
work_package_id: WP06
title: Tool Integration and Documentation
lane: planned
dependencies: []
subtasks: [T030, T031, T032, T033, T034, T035, T036]
history:
- date: '2026-02-10'
  action: created
  by: planner
---

# WP06: Tool Integration and Documentation

**Implementation command**: `spec-kitty implement WP06 --base WP04`

## Objective

Create new OpenCode tools (manage-template, manage-role, delete-team), update the spawn-team
tool to accept templates, register all new tools, update barrel exports, and update skill
documentation.

## Context

- **Tool pattern**: `src/tools/tool-helper.ts` defines the `tool()` helper function
- **Tool registration**: `src/tools/index.ts` exports all tools; `src/index.ts` registers them
- **Existing tool example**: `src/tools/spawn-team.ts` shows the full pattern
- **Operations**: TemplateOperations (WP02), role-permissions (WP03), TeamOperations.deleteTeam (WP04)
- **Skills**: `skills/team-coordination/SKILL.md` describes available tools for agents

## Subtasks

### T030: Create manage-template Tool

**Purpose**: Expose template CRUD as OpenCode tools.

**Steps**:

1. Create `src/tools/manage-template.ts`:

```typescript
import { TemplateOperations } from '../operations/template';
import type { TeamTemplate } from '../types/index';
import { type ToolDefinition, tool } from './tool-helper';

export const saveTemplate = tool<
  { template: TeamTemplate },
  TeamTemplate
>({
  name: 'save-template',
  description: 'Save a team template for reuse',
  parameters: {
    template: {
      type: 'object',
      description: 'Template configuration to save',
      required: true,
      properties: {
        name: { type: 'string', description: 'Unique template name (kebab-case)', required: true },
        description: { type: 'string', description: 'Template description', required: false },
        topology: { type: 'string', description: 'Team topology: flat or hierarchical', required: false },
        roles: {
          type: 'array',
          description: 'Role definitions',
          required: true,
          items: {
            type: 'object',
            description: 'Role definition',
            properties: {
              name: { type: 'string', description: 'Role name', required: true },
              allowedTools: { type: 'array', description: 'Allowed tool names', required: false },
              deniedTools: { type: 'array', description: 'Denied tool names', required: false },
            },
          },
        },
      },
    },
  },
  execute: async ({ template }) => TemplateOperations.save(template),
});

export const listTemplates = tool<
  Record<string, never>,
  Array<{ name: string; description?: string; source: string }>
>({
  name: 'list-templates',
  description: 'List all available team templates',
  parameters: {},
  execute: async () => TemplateOperations.list(),
});

export const deleteTemplate = tool<{ templateName: string }, void>({
  name: 'delete-template',
  description: 'Delete a project-local team template',
  parameters: {
    templateName: {
      type: 'string',
      description: 'Name of the template to delete',
      required: true,
    },
  },
  execute: async ({ templateName }) => TemplateOperations.delete(templateName),
});
```

**Validation**:
- [ ] save-template creates template file
- [ ] list-templates returns template summaries
- [ ] delete-template removes template file

---

### T031: Create manage-role Tool

**Purpose**: Expose role assignment and permission checking as tools.

**Steps**:

1. Create `src/tools/manage-role.ts`:

```typescript
import { checkPermissionByRoleName } from '../operations/role-permissions';
import { type ToolDefinition, tool } from './tool-helper';

export const checkPermissionTool = tool<
  { roleName: string; toolName: string },
  { allowed: boolean; roleName: string; toolName: string }
>({
  name: 'check-permission',
  description: 'Check if a role is allowed to use a specific tool',
  parameters: {
    roleName: {
      type: 'string',
      description: 'Role name to check (leader, worker, reviewer, task-manager)',
      required: true,
    },
    toolName: {
      type: 'string',
      description: 'Tool name to check permission for',
      required: true,
    },
  },
  execute: async ({ roleName, toolName }) => ({
    allowed: checkPermissionByRoleName(roleName, toolName),
    roleName,
    toolName,
  }),
});
```

**Validation**:
- [ ] check-permission returns correct allowed/denied status
- [ ] Works for all built-in role names

---

### T032: Create delete-team Tool

**Purpose**: Expose team deletion as an OpenCode tool.

**Steps**:

1. Create `src/tools/delete-team.ts`:

```typescript
import { TeamOperations } from '../operations/team';
import { guardToolPermission } from '../operations/role-permissions';
import { type ToolDefinition, tool } from './tool-helper';

export const deleteTeamTool = tool<
  { teamName: string },
  { deleted: boolean; teamName: string }
>({
  name: 'delete-team',
  description: 'Delete a team and all its resources (tasks, inboxes, config)',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Name of the team to delete',
      required: true,
    },
  },
  execute: async ({ teamName }) => {
    guardToolPermission('delete-team', teamName);
    TeamOperations.deleteTeam(teamName);
    return { deleted: true, teamName };
  },
});
```

**Validation**:
- [ ] Deletes team when called by authorized role
- [ ] Permission denied for unauthorized role
- [ ] Returns confirmation object

---

### T033: Update spawn-team Tool to Accept Template Parameter

**Purpose**: Allow spawn-team to create teams from templates.

**Steps**:

1. Update `src/tools/spawn-team.ts` (or the spawn-team section in `src/tools/index.ts`):

```typescript
export const spawnTeam = tool<
  { teamName: string; leaderInfo?: LeaderInfo; templateName?: string; description?: string },
  TeamConfig
>({
  name: 'spawn-team',
  description: 'Create a new team of AI agents for collaborative work. Optionally use a template.',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Unique name for the team',
      required: true,
    },
    leaderInfo: {
      type: 'object',
      description: 'Leader agent information',
      required: false,
      properties: {
        agentId: { type: 'string', description: 'Leader agent ID', required: false },
        agentName: { type: 'string', description: 'Leader display name', required: false },
        agentType: { type: 'string', description: 'Agent type', required: false },
      },
    },
    templateName: {
      type: 'string',
      description: 'Name of a template to create the team from',
      required: false,
    },
    description: {
      type: 'string',
      description: 'Team description/purpose',
      required: false,
    },
  },
  execute: async ({ teamName, leaderInfo, templateName, description }) => {
    if (templateName) {
      return TeamOperations.spawnTeamFromTemplate(teamName, templateName, leaderInfo, { description });
    }
    return TeamOperations.spawnTeam(teamName, leaderInfo, { description });
  },
});
```

**Validation**:
- [ ] spawn-team without template works as before
- [ ] spawn-team with templateName creates from template
- [ ] spawn-team with description passes it through

---

### T034: Register All New Tools

**Purpose**: Add new tools to tool registry and plugin entry point.

**Steps**:

1. Update `src/tools/index.ts`:
   - Import new tool files (manage-template, manage-role, delete-team)
   - Export them alongside existing tools

2. Update `src/index.ts`:
   - Import new tools
   - Register with OpenCode's plugin system (follow existing registration pattern)

**Validation**:
- [ ] All new tools exported from tools/index.ts
- [ ] All new tools registered in src/index.ts
- [ ] `bun x tsc` compiles successfully

---

### T035: Update Operations Barrel Exports

**Purpose**: Export new operation modules from `src/operations/index.ts`.

**Steps**:

1. Add to `src/operations/index.ts`:

```typescript
export { TemplateOperations } from './template';
export { checkPermission, checkPermissionByRoleName, guardToolPermission, getAgentRole } from './role-permissions';
export { WorkflowMonitor } from './workflow-monitor';
```

**Validation**:
- [ ] All new operations importable from 'operations/index'
- [ ] No circular dependency issues

---

### T036: Update Skill Documentation

**Purpose**: Update team coordination skill with new tool descriptions.

**Steps**:

1. Update `skills/team-coordination/SKILL.md`:
   - Add save-template, list-templates, delete-template tool descriptions
   - Add check-permission tool description
   - Add delete-team tool description
   - Update spawn-team description to mention template support
   - Add section on team topologies (flat vs hierarchical)
   - Add section on role permissions

**Validation**:
- [ ] All new tools documented in skill file
- [ ] Template workflow example included
- [ ] Topology configuration example included
- [ ] markdownlint passes

## Definition of Done

- [ ] All 3 new tool files created (manage-template, manage-role, delete-team)
- [ ] spawn-team updated with template support
- [ ] All tools registered in tools/index.ts and src/index.ts
- [ ] Operations barrel exports updated
- [ ] Skill documentation updated
- [ ] `bun x tsc` compiles
- [ ] Full test suite passes (`bun test`)
- [ ] `mise run lint:fix` passes
- [ ] markdownlint passes on skill files

## Risks

- **Tool registration pattern**: Must match the exact pattern used by existing tools.
  Copy the import/export style from src/tools/index.ts.
- **Skill documentation format**: Must follow YAML frontmatter format in skills/ directory.
  Check existing SKILL.md for the correct structure.

## Reviewer Guidance

- Verify all new tools follow the exact same pattern as existing tools
- Check that tool names are consistent with what role-permissions.ts references
- Ensure skill documentation is comprehensive and includes examples
- Check that no existing tool registrations are accidentally removed
