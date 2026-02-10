---
work_package_id: WP03
title: Role Permission System
lane: planned
dependencies: []
subtasks: [T016, T017, T018, T019, T020]
history:
- date: '2026-02-10'
  action: created
  by: planner
---

# WP03: Role Permission System

**Implementation command**: `spec-kitty implement WP03 --base WP01`

## Objective

Create `src/operations/role-permissions.ts` with a permission guard function, default role
permission mappings, and an agent role lookup helper. Integrate permission checks into
existing tool entry points.

## Context

- **AgentState**: `src/types/schemas.ts` has AgentStateSchema with role enum (now includes 'task-manager')
- **Agent lookup**: `src/operations/agent.ts` has AgentOperations for reading agent state
- **Tools**: `src/tools/index.ts` defines all tools with `execute` functions
- **Tool helper**: `src/tools/tool-helper.ts` defines the ToolDefinition interface
- **Pattern**: Validation checks at operation entry points (see team.ts spawnTeam name validation)
- **Backward compat**: When no role is assigned (role is default 'worker'), existing behavior must not break. When a team has no roles defined, permission checks should be skipped entirely.

## Subtasks

### T016: Create checkPermission Guard Function

**Purpose**: Check if a role is allowed to invoke a specific tool.

**Steps**:

1. Create `src/operations/role-permissions.ts`
2. Implement the core permission check:

```typescript
import type { RoleDefinition } from '../types/schemas';

/**
 * Check if a role is permitted to use a specific tool.
 *
 * Resolution order:
 * 1. If deniedTools includes toolName -> DENIED
 * 2. If allowedTools is defined and non-empty, toolName must be in it -> ALLOWED/DENIED
 * 3. If allowedTools is undefined/empty -> ALLOWED (open by default)
 */
export function checkPermission(role: RoleDefinition, toolName: string): boolean {
  // Denied tools take precedence
  if (role.deniedTools?.includes(toolName)) {
    return false;
  }

  // If allowedTools is defined and non-empty, tool must be in the list
  if (role.allowedTools && role.allowedTools.length > 0) {
    return role.allowedTools.includes(toolName);
  }

  // Default: allowed (open permission model)
  return true;
}

/**
 * Check permission by role name against the default permission map.
 * Returns true if role is unknown (backward compat - don't block unknown roles).
 */
export function checkPermissionByRoleName(roleName: string, toolName: string): boolean {
  const roleDef = DEFAULT_ROLE_PERMISSIONS.get(roleName);
  if (!roleDef) {
    return true; // Unknown role = allow all (backward compat)
  }
  return checkPermission(roleDef, toolName);
}
```

**Validation**:
- [ ] Denied tools are rejected
- [ ] Allowed tools whitelist is enforced when present
- [ ] Empty/undefined allowedTools means open access
- [ ] deniedTools takes precedence over allowedTools
- [ ] Unknown role name allows all tools

---

### T017: Define Default Role Permission Map

**Purpose**: Map built-in roles to their default permissions.

**Steps**:

1. Add to `src/operations/role-permissions.ts`:

```typescript
export const DEFAULT_ROLE_PERMISSIONS = new Map<string, RoleDefinition>([
  ['leader', {
    name: 'leader',
    description: 'Team leader - can spawn agents and manage team, cannot self-assign tasks',
    deniedTools: ['claim-task'],
  }],
  ['worker', {
    name: 'worker',
    description: 'Team worker - can claim and complete tasks, cannot manage team',
    deniedTools: ['spawn-team', 'spawn-agent', 'kill-agent', 'delete-team', 'assign-role'],
  }],
  ['reviewer', {
    name: 'reviewer',
    description: 'Code reviewer - can update tasks and communicate, limited tool access',
    allowedTools: ['update-task', 'send-message', 'poll-inbox', 'heartbeat'],
    deniedTools: ['spawn-team', 'spawn-agent', 'kill-agent', 'delete-team', 'claim-task', 'assign-role'],
  }],
  ['task-manager', {
    name: 'task-manager',
    description: 'Task coordinator - can manage tasks and communicate, cannot manage team infrastructure',
    deniedTools: ['spawn-team', 'spawn-agent', 'kill-agent', 'delete-team', 'assign-role'],
  }],
]);
```

**Validation**:
- [ ] All 4 roles defined in the map
- [ ] Leader cannot claim-task
- [ ] Worker cannot spawn-team, spawn-agent, kill-agent, delete-team
- [ ] Reviewer has explicit allowedTools whitelist
- [ ] Task-manager can claim-task and create-task

---

### T018: Create getAgentRole Helper

**Purpose**: Look up an agent's role from their state file.

**Steps**:

1. Add to `src/operations/role-permissions.ts`:

```typescript
import { AgentStateSchema } from '../types/schemas';
import { readValidatedJSON } from '../utils/fs-atomic';
import { getAgentStatePath, fileExists } from '../utils/storage-paths';

/**
 * Get the role for an agent. Returns 'worker' as default.
 */
export function getAgentRole(agentId: string): string {
  const statePath = getAgentStatePath(agentId);
  if (!fileExists(statePath)) {
    return 'worker'; // Default role for unknown agents
  }
  try {
    const state = readValidatedJSON(statePath, AgentStateSchema);
    return state.role;
  } catch {
    return 'worker'; // Default on error
  }
}

/**
 * Get the role definition for an agent, checking team-specific roles first,
 * then falling back to default permissions.
 */
export function getAgentRoleDefinition(
  agentId: string,
  teamName?: string,
): RoleDefinition | undefined {
  const roleName = getAgentRole(agentId);

  // If team provided, check team-specific role definitions
  if (teamName) {
    try {
      const teamConfigPath = getTeamConfigPath(teamName);
      if (fileExists(teamConfigPath)) {
        const teamConfig = readValidatedJSON(teamConfigPath, TeamConfigSchema);
        const teamRole = teamConfig.roles?.find((r: RoleDefinition) => r.name === roleName);
        if (teamRole) return teamRole;
      }
    } catch { /* fall through to defaults */ }
  }

  return DEFAULT_ROLE_PERMISSIONS.get(roleName);
}
```

**Validation**:
- [ ] Returns 'worker' for unknown agent
- [ ] Returns actual role from agent state file
- [ ] Team-specific roles override defaults
- [ ] Graceful fallback on errors

---

### T019: Integrate Permission Checks into Tool Entry Points

**Purpose**: Add permission guards to sensitive tool execute() functions.

**Steps**:

1. Create a guard wrapper function:

```typescript
/**
 * Guard a tool execution against role permissions.
 * Throws if the current agent's role denies the tool.
 *
 * @param toolName - The tool being invoked
 * @param teamName - Optional team context for team-specific roles
 */
export function guardToolPermission(toolName: string, teamName?: string): void {
  const agentId = process.env.OPENCODE_AGENT_ID;
  if (!agentId) return; // No agent context = no restriction (backward compat)

  const roleDef = getAgentRoleDefinition(agentId, teamName);
  if (!roleDef) return; // No role definition = allow all

  if (!checkPermission(roleDef, toolName)) {
    throw new Error(
      `Permission denied: role "${roleDef.name}" cannot use tool "${toolName}"`
    );
  }
}
```

2. Add `guardToolPermission` calls at the START of sensitive tool execute() functions in
   `src/tools/index.ts`. Focus on these tools:
   - `spawn-team`: guard with toolName 'spawn-team'
   - `claim-task`: guard with toolName 'claim-task'
   - `spawn-agent`: guard with toolName 'spawn-agent'
   - `kill-agent`: guard with toolName 'kill-agent'

   Example integration:
   ```typescript
   export const claimTask = tool<{ teamName: string; taskId: string }, Task>({
     name: 'claim-task',
     // ...
     execute: async ({ teamName, taskId }) => {
       guardToolPermission('claim-task', teamName);
       return TaskOperations.claimTask(teamName, taskId);
     },
   });
   ```

**IMPORTANT**: Do NOT modify tools that should always be accessible (heartbeat, poll-inbox,
send-message). Only guard tools that have role restrictions.

**Validation**:
- [ ] Leader calling claim-task gets permission denied
- [ ] Worker calling spawn-team gets permission denied
- [ ] Worker calling claim-task succeeds
- [ ] No agent context (no env var) = all tools allowed
- [ ] Tool without guard remains accessible

---

### T020: Write Role Permission Tests

**Purpose**: Comprehensive tests for the permission system.

**Steps**:

1. Create `tests/role-permissions.test.ts`
2. Test cases:
   - checkPermission with denied tools
   - checkPermission with allowed tools whitelist
   - checkPermission with empty permissions (allow all)
   - checkPermissionByRoleName for each built-in role
   - Unknown role name allows all
   - getAgentRole with and without state file
   - guardToolPermission with and without OPENCODE_AGENT_ID
   - Integration: leader denied claim-task, worker denied spawn-team

**File**: `tests/role-permissions.test.ts`

**Validation**:
- [ ] All permission logic tested
- [ ] Backward compatibility tested (no agent ID = allow all)
- [ ] Tests pass with `bun test tests/role-permissions.test.ts`

## Definition of Done

- [ ] `src/operations/role-permissions.ts` created
- [ ] Default role permissions defined for all 4 roles
- [ ] Guard function integrated into sensitive tools
- [ ] Exported from `src/operations/index.ts`
- [ ] All tests pass
- [ ] `bun x tsc` compiles
- [ ] Full test suite passes (`bun test`)
- [ ] No lint errors

## Risks

- **Breaking existing tools**: Guard must not block tools when no agent context exists.
  Always check for `OPENCODE_AGENT_ID` env var first.
- **Performance**: Role lookup reads agent state from disk. Must be fast (< 100ms).
  Single file read + JSON parse should be well under this.

## Reviewer Guidance

- Verify backward compat: tool works without OPENCODE_AGENT_ID set
- Check that deniedTools takes precedence over allowedTools
- Ensure guard is only added to tools that should be restricted
- Verify unknown roles allow all tools (don't accidentally block)
