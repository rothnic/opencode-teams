import type { RoleDefinition } from '../types/schemas';
import { AgentStateSchema, TeamConfigSchema } from '../types/schemas';
import { readValidatedJSON } from '../utils/fs-atomic';
import { fileExists, getAgentStatePath, getTeamConfigPath } from '../utils/storage-paths';

/**
 * Default permission map for built-in roles.
 */
export const DEFAULT_ROLE_PERMISSIONS = new Map<string, RoleDefinition>([
  [
    'leader',
    {
      name: 'leader',
      description: 'Team leader - can spawn agents and manage team, cannot self-assign tasks',
      deniedTools: ['claim-task'],
    },
  ],
  [
    'worker',
    {
      name: 'worker',
      description: 'Team worker - can claim and complete tasks, cannot manage team',
      deniedTools: ['spawn-team', 'spawn-agent', 'kill-agent', 'delete-team', 'assign-role'],
    },
  ],
  [
    'reviewer',
    {
      name: 'reviewer',
      description: 'Code reviewer - can update tasks and communicate, limited tool access',
      allowedTools: ['update-task', 'send-message', 'poll-inbox', 'heartbeat'],
      deniedTools: [
        'spawn-team',
        'spawn-agent',
        'kill-agent',
        'delete-team',
        'claim-task',
        'assign-role',
      ],
    },
  ],
  [
    'task-manager',
    {
      name: 'task-manager',
      description:
        'Task coordinator - can manage tasks and communicate, cannot manage team infrastructure',
      deniedTools: ['spawn-team', 'spawn-agent', 'kill-agent', 'delete-team', 'assign-role'],
    },
  ],
]);

/**
 * Check if a role is permitted to use a specific tool.
 * Resolution: deniedTools > allowedTools > default allow
 */
export function checkPermission(role: RoleDefinition, toolName: string): boolean {
  if (role.deniedTools?.includes(toolName)) return false;
  if (role.allowedTools && role.allowedTools.length > 0) {
    return role.allowedTools.includes(toolName);
  }
  return true;
}

/**
 * Check permission by role name against default permission map.
 * Unknown roles allow all tools (backward compat).
 */
export function checkPermissionByRoleName(roleName: string, toolName: string): boolean {
  const roleDef = DEFAULT_ROLE_PERMISSIONS.get(roleName);
  if (!roleDef) return true;
  return checkPermission(roleDef, toolName);
}

/**
 * Get role for an agent from state file. Default: 'worker'.
 */
export function getAgentRole(agentId: string): string {
  const statePath = getAgentStatePath(agentId);
  if (!fileExists(statePath)) return 'worker';
  try {
    const state = readValidatedJSON(statePath, AgentStateSchema);
    return state.role;
  } catch {
    return 'worker';
  }
}

/**
 * Get role definition: team-specific first, then defaults.
 */
export function getAgentRoleDefinition(
  agentId: string,
  teamName?: string,
): RoleDefinition | undefined {
  const roleName = getAgentRole(agentId);
  if (teamName) {
    try {
      const teamConfigPath = getTeamConfigPath(teamName);
      if (fileExists(teamConfigPath)) {
        const teamConfig = readValidatedJSON(teamConfigPath, TeamConfigSchema);
        const teamRole = teamConfig.roles?.find((r: RoleDefinition) => r.name === roleName);
        if (teamRole) return teamRole;
      }
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_ROLE_PERMISSIONS.get(roleName);
}

/**
 * Guard a tool execution against role permissions.
 * No agent context = no restriction (backward compat).
 */
export function guardToolPermission(toolName: string, teamName?: string): void {
  const agentId = process.env.OPENCODE_AGENT_ID;
  if (!agentId) return;
  const roleDef = getAgentRoleDefinition(agentId, teamName);
  if (!roleDef) return;
  if (!checkPermission(roleDef, toolName)) {
    throw new Error(`Permission denied: role "${roleDef.name}" cannot use tool "${toolName}"`);
  }
}
