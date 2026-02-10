/**
 * OpenCode Tools for Team Coordination
 *
 * This module exports all custom tools following OpenCode's tool registration pattern.
 * Each tool defines parameters and execution logic that OpenCode can invoke.
 */

import { AgentOperations } from '../operations/agent';
import { checkPermissionByRoleName, guardToolPermission } from '../operations/role-permissions';
import { TaskOperations } from '../operations/task';
import { TeamOperations } from '../operations/team';
import { TemplateOperations } from '../operations/template';
import type {
  AgentState,
  LeaderInfo,
  Message,
  Task,
  TaskFilters,
  TeamConfig,
  TeamMember,
  TeamSummary,
  TeamTemplate,
} from '../types/index';
import { type ToolDefinition, tool } from './tool-helper';

/**
 * Create a new team
 */
export const spawnTeam = tool<
  { teamName: string; leaderInfo?: LeaderInfo; templateName?: string; description?: string },
  TeamConfig
>({
  name: 'spawn-team',
  description:
    'Create a new team of AI agents. Optionally use a template for pre-configured roles.',
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
    guardToolPermission('spawn-team');
    if (templateName) {
      return TeamOperations.spawnTeamFromTemplate(teamName, templateName, leaderInfo, {
        description,
      });
    }
    return TeamOperations.spawnTeam(teamName, leaderInfo, { description });
  },
});

/**
 * Discover available teams
 */
export const discoverTeams = tool<Record<string, never>, TeamSummary[]>({
  name: 'discover-teams',
  description: 'List all available teams',
  parameters: {},
  execute: async () => TeamOperations.discoverTeams(),
});

/**
 * Join a team
 */
export const joinTeam = tool<{ teamName: string; agentInfo?: LeaderInfo }, TeamMember>({
  name: 'join-team',
  description: 'Join an existing team as a member',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Name of the team to join',
      required: true,
    },
    agentInfo: {
      type: 'object',
      description: 'Agent information',
      required: false,
      properties: {
        agentId: { type: 'string', description: 'Agent ID', required: false },
        agentName: { type: 'string', description: 'Display name', required: false },
        agentType: { type: 'string', description: 'Agent type/role', required: false },
      },
    },
  },
  execute: async ({ teamName, agentInfo }) => TeamOperations.requestJoin(teamName, agentInfo),
});

/**
 * Get team information
 */
export const getTeamInfo = tool<{ teamName: string }, TeamConfig>({
  name: 'get-team-info',
  description: 'Get detailed information about a team',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Name of the team',
      required: true,
    },
  },
  execute: async ({ teamName }) => TeamOperations.getTeamInfo(teamName),
});

/**
 * Send a direct message
 */
export const sendMessage = tool<
  { teamName: string; targetAgentId: string; message: string; fromAgentId?: string },
  Message
>({
  name: 'send-message',
  description: 'Send a direct message to another team member',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Team name',
      required: true,
    },
    targetAgentId: {
      type: 'string',
      description: 'ID of the agent to message',
      required: true,
    },
    message: {
      type: 'string',
      description: 'Message content',
      required: true,
    },
    fromAgentId: {
      type: 'string',
      description: 'Sender agent ID (defaults to current agent)',
      required: false,
    },
  },
  execute: async ({ teamName, targetAgentId, message, fromAgentId }) =>
    TeamOperations.write(teamName, targetAgentId, message, fromAgentId),
});

/**
 * Broadcast a message
 */
export const broadcastMessage = tool<
  { teamName: string; message: string; fromAgentId?: string },
  Message
>({
  name: 'broadcast-message',
  description: 'Broadcast a message to all team members',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Team name',
      required: true,
    },
    message: {
      type: 'string',
      description: 'Message content',
      required: true,
    },
    fromAgentId: {
      type: 'string',
      description: 'Sender agent ID (defaults to current agent)',
      required: false,
    },
  },
  execute: async ({ teamName, message, fromAgentId }) =>
    TeamOperations.broadcast(teamName, message, fromAgentId),
});

/**
 * Read messages
 */
export const readMessages = tool<{ teamName: string; agentId?: string }, Message[]>({
  name: 'read-messages',
  description: 'Read messages for the current agent',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Team name',
      required: true,
    },
    agentId: {
      type: 'string',
      description: 'Agent ID (defaults to current agent)',
      required: false,
    },
  },
  execute: async ({ teamName, agentId }) => TeamOperations.readMessages(teamName, agentId),
});

/**
 * Poll inbox for new messages
 */
export const pollInbox = tool<
  { teamName: string; agentId?: string; timeoutMs?: number; since?: string },
  Message[]
>({
  name: 'poll-inbox',
  description: 'Poll for new messages with long-polling support',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Team name',
      required: true,
    },
    agentId: {
      type: 'string',
      description: 'Agent ID (defaults to current agent)',
      required: false,
    },
    timeoutMs: {
      type: 'number',
      description: 'Timeout in milliseconds (default 30000)',
      required: false,
    },
    since: {
      type: 'string',
      description: 'ISO timestamp to only get messages after this time',
      required: false,
    },
  },
  execute: async ({ teamName, agentId, timeoutMs, since }) =>
    TeamOperations.pollInbox(teamName, agentId, timeoutMs, since),
});

/**
 * Create a task
 */
export const createTask = tool<{ teamName: string; taskData: Partial<Task> }, Task>({
  name: 'create-task',
  description: 'Create a new task in the team queue',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Team name',
      required: true,
    },
    taskData: {
      type: 'object',
      description: 'Task details',
      required: true,
      properties: {
        title: { type: 'string', description: 'Task title', required: false },
        description: { type: 'string', description: 'Task description', required: false },
        priority: { type: 'string', description: 'Priority (high, normal, low)', required: false },
      },
    },
  },
  execute: async ({ teamName, taskData }) => TaskOperations.createTask(teamName, taskData),
});

/**
 * Get tasks
 */
export const getTasks = tool<
  { teamName: string; filters?: { status?: string; owner?: string } },
  Task[]
>({
  name: 'get-tasks',
  description: 'Get tasks from the team queue',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Team name',
      required: true,
    },
    filters: {
      type: 'object',
      description: 'Filter criteria',
      required: false,
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status (pending, in_progress, completed)',
          required: false,
        },
        owner: { type: 'string', description: 'Filter by owner agent ID', required: false },
      },
    },
  },
  execute: async ({ teamName, filters }) =>
    TaskOperations.getTasks(teamName, filters as TaskFilters | undefined),
});

/**
 * Claim a task
 */
export const claimTask = tool<{ teamName: string; taskId: string; agentId?: string }, Task>({
  name: 'claim-task',
  description: 'Claim a pending task',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Team name',
      required: true,
    },
    taskId: {
      type: 'string',
      description: 'Task ID to claim',
      required: true,
    },
    agentId: {
      type: 'string',
      description: 'Agent ID (defaults to current agent)',
      required: false,
    },
  },
  execute: async ({ teamName, taskId, agentId }) => {
    guardToolPermission('claim-task', teamName);
    return TaskOperations.claimTask(teamName, taskId, agentId);
  },
});

/**
 * Update a task
 */
export const updateTask = tool<{ teamName: string; taskId: string; updates: Partial<Task> }, Task>({
  name: 'update-task',
  description: 'Update task details or status',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Team name',
      required: true,
    },
    taskId: {
      type: 'string',
      description: 'Task ID',
      required: true,
    },
    updates: {
      type: 'object',
      description: 'Fields to update',
      required: true,
      properties: {
        status: { type: 'string', description: 'New status', required: false },
        description: { type: 'string', description: 'New description', required: false },
      },
    },
  },
  execute: async ({ teamName, taskId, updates }) =>
    TaskOperations.updateTask(teamName, taskId, updates),
});

/**
 * Export all tools as a registry
 */
export const spawnAgent = tool<
  {
    teamName: string;
    prompt: string;
    name?: string;
    model?: string;
    providerId?: string;
    role?: 'worker' | 'reviewer';
    cwd?: string;
  },
  {
    success: boolean;
    agentId?: string;
    sessionId?: string;
    paneId?: string;
    name?: string;
    color?: string;
    port?: number;
    error?: string;
  }
>({
  name: 'spawn-agent',
  description: 'Spawn a new AI agent into an existing team',
  parameters: {
    teamName: { type: 'string', description: 'Team to spawn the agent into', required: true },
    prompt: { type: 'string', description: 'Initial prompt/task for the agent', required: true },
    name: { type: 'string', description: 'Display name for the agent', required: false },
    model: { type: 'string', description: 'Model to use', required: false },
    providerId: { type: 'string', description: 'Provider ID', required: false },
    role: { type: 'string', description: 'Agent role: worker or reviewer', required: false },
    cwd: { type: 'string', description: 'Working directory', required: false },
  },
  execute: async ({ teamName, prompt, name, model, providerId, role, cwd }) => {
    guardToolPermission('spawn-agent', teamName);
    return AgentOperations.spawnAgent({ teamName, prompt, name, model, providerId, role, cwd });
  },
});

export const killAgent = tool<
  { teamName: string; agentId: string; force?: boolean; reason?: string },
  { success: boolean; reassignedTasks?: string[]; phase?: string; error?: string }
>({
  name: 'kill-agent',
  description: 'Terminate an agent (force kill or graceful shutdown)',
  parameters: {
    teamName: { type: 'string', description: 'Team name', required: true },
    agentId: { type: 'string', description: 'Agent ID to terminate', required: true },
    force: {
      type: 'boolean',
      description: 'Force kill (true) or graceful shutdown (false)',
      required: false,
    },
    reason: { type: 'string', description: 'Reason for termination', required: false },
  },
  execute: async ({ teamName, agentId, force, reason }) => {
    guardToolPermission('kill-agent', teamName);
    if (force) {
      return AgentOperations.forceKill({ teamName, agentId, reason });
    }
    const requesterAgentId = process.env.OPENCODE_AGENT_ID || 'leader';
    const result = AgentOperations.requestGracefulShutdown({
      teamName,
      requesterAgentId,
      targetAgentId: agentId,
      reason,
    });
    return { success: result.success, phase: result.phase, error: result.error };
  },
});

export const heartbeatTool = tool<
  { agentId: string },
  {
    success: boolean;
    heartbeatTs: string;
    nextDeadline: string;
    agentStatus: string;
    error?: string;
  }
>({
  name: 'heartbeat',
  description: 'Send a heartbeat signal for an agent to confirm it is alive',
  parameters: {
    agentId: { type: 'string', description: 'Agent ID sending the heartbeat', required: true },
  },
  execute: async ({ agentId }) => AgentOperations.updateHeartbeat(agentId, 'tool'),
});

export const getAgentStatus = tool<
  { agentId?: string; teamName?: string },
  AgentState | AgentState[] | { error: string }
>({
  name: 'get-agent-status',
  description: 'Get status of a specific agent or all agents in a team',
  parameters: {
    agentId: { type: 'string', description: 'Specific agent ID to query', required: false },
    teamName: { type: 'string', description: 'Team name to list all agents', required: false },
  },
  execute: async ({ agentId, teamName }) => {
    if (agentId) {
      const agent = AgentOperations.getAgentState(agentId);
      if (!agent) return { error: `Agent '${agentId}' not found` };
      return agent;
    }
    if (teamName) {
      return AgentOperations.listAgents({ teamName });
    }
    return AgentOperations.listAgents();
  },
});

export const saveTemplate = tool<{ template: TeamTemplate }, TeamTemplate>({
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
        topology: {
          type: 'string',
          description: 'Team topology: flat or hierarchical',
          required: false,
        },
        roles: {
          type: 'array',
          description: 'Role definitions',
          required: true,
          items: {
            type: 'object',
            description: 'Role definition',
            properties: {
              name: { type: 'string', description: 'Role name', required: true },
              allowedTools: {
                type: 'array',
                description: 'Allowed tool names',
                required: false,
              },
              deniedTools: {
                type: 'array',
                description: 'Denied tool names',
                required: false,
              },
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

export const deleteTemplate = tool<{ templateName: string }, { deleted: boolean }>({
  name: 'delete-template',
  description: 'Delete a project-local team template',
  parameters: {
    templateName: {
      type: 'string',
      description: 'Name of the template to delete',
      required: true,
    },
  },
  execute: async ({ templateName }) => {
    TemplateOperations.delete(templateName);
    return { deleted: true };
  },
});

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

export const deleteTeamTool = tool<{ teamName: string }, { deleted: boolean; teamName: string }>({
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

export const tools: Record<string, ToolDefinition> = {
  'spawn-team': spawnTeam,
  'discover-teams': discoverTeams,
  'join-team': joinTeam,
  'get-team-info': getTeamInfo,
  'send-message': sendMessage,
  'broadcast-message': broadcastMessage,
  'read-messages': readMessages,
  'poll-inbox': pollInbox,
  'create-task': createTask,
  'get-tasks': getTasks,
  'claim-task': claimTask,
  'update-task': updateTask,
  'spawn-agent': spawnAgent,
  'kill-agent': killAgent,
  heartbeat: heartbeatTool,
  'get-agent-status': getAgentStatus,
  'save-template': saveTemplate,
  'list-templates': listTemplates,
  'delete-template': deleteTemplate,
  'check-permission': checkPermissionTool,
  'delete-team': deleteTeamTool,
};
