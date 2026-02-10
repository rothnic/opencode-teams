/**
 * OpenCode Teams Plugin
 *
 * Multi-agent team coordination plugin for OpenCode.
 * Enables AI agents to create teams, share task queues, and communicate.
 *
 * Follows OpenCode's plugin architecture with proper tool registration.
 */

// Try to import from @opencode-ai/plugin, fall back to local types
let tool: any;
try {
  // @ts-expect-error - Peer dependency might not be present during local development
  const pkg = await import('@opencode-ai/plugin');
  tool = pkg.tool;
} catch {
  // Use local type definitions when @opencode-ai/plugin is not available
  const local = await import('./plugin-types');
  tool = local.tool;
}

import { AgentOperations } from './operations/agent';
import { SessionManager } from './operations/session-manager-cli';
import { TaskOperations } from './operations/task';
import { TeamOperations } from './operations/team';
import type { AgentState, Message, Task, TeamConfig, TeamMember } from './types/index';

/**
 * OpenCode Teams Plugin
 *
 * Registers custom tools for team coordination:
 * - spawn-team: Create a new team
 * - discover-teams: List available teams
 * - join-team: Join an existing team
 * - send-message: Send direct message to team member
 * - broadcast-message: Broadcast to all team members
 * - read-messages: Read messages for current agent
 * - create-task: Create a task in team queue
 * - get-tasks: Get tasks from team queue
 * - claim-task: Claim a pending task
 * - update-task: Update task status or details
 * - get-team-info: Get team details
 */
export const OpenCodeTeamsPlugin = async (ctx: any) => {
  console.log('[OpenCode Teams Plugin] Initializing...');

  return {
    // Register custom tools
    tool: {
      'spawn-team': tool({
        description: 'Create a new team of AI agents for collaborative work',
        args: {
          teamName: tool.schema.string().describe('Unique name for the team'),
          leaderInfo: tool.schema
            .object({
              agentId: tool.schema.string().optional(),
              agentName: tool.schema.string().optional(),
              agentType: tool.schema.string().optional(),
            })
            .optional()
            .describe('Optional leader information'),
        },
        async execute(args: any, _ctx: any): Promise<TeamConfig> {
          return TeamOperations.spawnTeam(args.teamName, args.leaderInfo);
        },
      }),

      'discover-teams': tool({
        description: 'List all available teams',
        args: {},
        async execute(_args: any, _ctx: any) {
          return TeamOperations.discoverTeams();
        },
      }),

      'join-team': tool({
        description: 'Join an existing team as a member',
        args: {
          teamName: tool.schema.string().describe('Name of the team to join'),
          agentInfo: tool.schema
            .object({
              agentId: tool.schema.string().optional(),
              agentName: tool.schema.string().optional(),
              agentType: tool.schema.string().optional(),
            })
            .optional()
            .describe('Optional agent information'),
        },
        async execute(args: any, _ctx: any): Promise<TeamMember> {
          return TeamOperations.requestJoin(args.teamName, args.agentInfo);
        },
      }),

      'get-team-info': tool({
        description: 'Get detailed information about a team',
        args: {
          teamName: tool.schema.string().describe('Name of the team'),
        },
        async execute(args: any, _ctx: any): Promise<TeamConfig> {
          return TeamOperations.getTeamInfo(args.teamName);
        },
      }),

      'send-message': tool({
        description: 'Send a direct message to another team member',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          targetAgentId: tool.schema.string().describe('ID of the agent to message'),
          message: tool.schema.string().describe('Message content'),
          fromAgentId: tool.schema.string().optional().describe('Sender agent ID (optional)'),
        },
        async execute(args: any, _ctx: any): Promise<Message> {
          return TeamOperations.write(
            args.teamName,
            args.targetAgentId,
            args.message,
            args.fromAgentId,
          );
        },
      }),

      'broadcast-message': tool({
        description: 'Broadcast a message to all team members',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          message: tool.schema.string().describe('Message content'),
          fromAgentId: tool.schema.string().optional().describe('Sender agent ID (optional)'),
        },
        async execute(args: any, _ctx: any): Promise<Message> {
          return TeamOperations.broadcast(args.teamName, args.message, args.fromAgentId);
        },
      }),

      'read-messages': tool({
        description: 'Read messages for the current agent',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          agentId: tool.schema.string().optional().describe('Agent ID (optional)'),
        },
        async execute(args: any, _ctx: any): Promise<Message[]> {
          return TeamOperations.readMessages(args.teamName, args.agentId);
        },
      }),
      'poll-inbox': tool({
        description: 'Poll for new messages with long-polling support',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          agentId: tool.schema.string().optional().describe('Agent ID (optional)'),
          timeoutMs: tool.schema
            .number()
            .optional()
            .describe('Timeout in milliseconds (default 30000)'),
          since: tool.schema
            .string()
            .optional()
            .describe('ISO timestamp to only get messages after this time'),
        },
        async execute(args: any, _ctx: any): Promise<Message[]> {
          return TeamOperations.pollInbox(args.teamName, args.agentId, args.timeoutMs, args.since);
        },
      }),

      'create-task': tool({
        description: 'Create a new task in the team queue',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          taskData: tool.schema
            .object({
              title: tool.schema.string().optional(),
              description: tool.schema.string().optional(),
              priority: tool.schema.string().optional(),
            })
            .describe('Task details'),
        },
        async execute(args: any, _ctx: any): Promise<Task> {
          return TaskOperations.createTask(args.teamName, args.taskData);
        },
      }),

      'get-tasks': tool({
        description: 'Get tasks from the team queue',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          filters: tool.schema
            .object({
              status: tool.schema.string().optional(),
              owner: tool.schema.string().optional(),
            })
            .optional()
            .describe('Optional filter criteria'),
        },
        async execute(args: any, _ctx: any): Promise<Task[]> {
          return TaskOperations.getTasks(args.teamName, args.filters);
        },
      }),

      'claim-task': tool({
        description: 'Claim a pending task from the team queue',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          taskId: tool.schema.string().describe('Task ID to claim'),
          agentId: tool.schema.string().optional().describe('Agent ID (optional)'),
        },
        async execute(args: any, _ctx: any): Promise<Task> {
          return TaskOperations.claimTask(args.teamName, args.taskId, args.agentId);
        },
      }),

      'update-task': tool({
        description: 'Update task details or status',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          taskId: tool.schema.string().describe('Task ID'),
          updates: tool.schema
            .object({
              status: tool.schema.string().optional(),
              description: tool.schema.string().optional(),
              completedAt: tool.schema.string().optional(),
            })
            .describe('Fields to update'),
        },
        async execute(args: any, _ctx: any): Promise<Task> {
          return TaskOperations.updateTask(args.teamName, args.taskId, args.updates);
        },
      }),
      'request-shutdown': tool({
        description: 'Request graceful team shutdown',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          agentId: tool.schema.string().optional().describe('Agent ID (optional)'),
        },
        async execute(args: any, _ctx: any): Promise<TeamConfig> {
          return TeamOperations.requestShutdown(args.teamName, args.agentId);
        },
      }),
      'approve-shutdown': tool({
        description: 'Approve a shutdown request for a team',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          agentId: tool.schema.string().optional().describe('Agent ID (optional)'),
        },
        async execute(args: any, _ctx: any): Promise<TeamConfig> {
          const config = TeamOperations.approveShutdown(args.teamName, args.agentId);
          if (TeamOperations.shouldShutdown(args.teamName)) {
            console.log(
              `[OpenCode Teams] Shutdown approved for team: ${args.teamName}. Cleaning up...`,
            );
            TeamOperations.cleanup(args.teamName);
          }
          return config;
        },
      }),

      'spawn-agent': tool({
        description: 'Spawn a new AI agent into an existing team',
        args: {
          teamName: tool.schema.string().describe('Team to spawn the agent into'),
          prompt: tool.schema.string().describe('Initial prompt/task for the agent'),
          name: tool.schema.string().optional().describe('Display name for the agent'),
          model: tool.schema.string().optional().describe('Model to use'),
          providerId: tool.schema.string().optional().describe('Provider ID'),
          role: tool.schema.string().optional().describe('Agent role: worker or reviewer'),
          cwd: tool.schema.string().optional().describe('Working directory'),
        },
        async execute(args: any, _ctx: any) {
          return AgentOperations.spawnAgent({
            teamName: args.teamName,
            prompt: args.prompt,
            name: args.name,
            model: args.model,
            providerId: args.providerId,
            role: args.role,
            cwd: args.cwd,
          });
        },
      }),

      'kill-agent': tool({
        description: 'Terminate an agent (force kill or graceful shutdown)',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          agentId: tool.schema.string().describe('Agent ID to terminate'),
          force: tool.schema.boolean().optional().describe('Force kill (true) or graceful (false)'),
          reason: tool.schema.string().optional().describe('Reason for termination'),
        },
        async execute(args: any, _ctx: any) {
          if (args.force) {
            return AgentOperations.forceKill({
              teamName: args.teamName,
              agentId: args.agentId,
              reason: args.reason,
            });
          }
          const requesterAgentId = process.env.OPENCODE_AGENT_ID || 'leader';
          return AgentOperations.requestGracefulShutdown({
            teamName: args.teamName,
            requesterAgentId,
            targetAgentId: args.agentId,
            reason: args.reason,
          });
        },
      }),

      heartbeat: tool({
        description: 'Send a heartbeat signal for an agent to confirm it is alive',
        args: {
          agentId: tool.schema.string().describe('Agent ID sending the heartbeat'),
        },
        async execute(args: any, _ctx: any) {
          return AgentOperations.updateHeartbeat(args.agentId, 'tool');
        },
      }),

      'get-agent-status': tool({
        description: 'Get status of a specific agent or all agents in a team',
        args: {
          agentId: tool.schema.string().optional().describe('Specific agent ID'),
          teamName: tool.schema.string().optional().describe('Team name to list all agents'),
        },
        async execute(
          args: any,
          _ctx: any,
        ): Promise<AgentState | AgentState[] | { error: string }> {
          if (args.agentId) {
            const agent = AgentOperations.getAgentState(args.agentId);
            if (!agent) return { error: `Agent '${args.agentId}' not found` };
            return agent;
          }
          if (args.teamName) {
            return AgentOperations.listAgents({ teamName: args.teamName });
          }
          return AgentOperations.listAgents();
        },
      }),
    },

    // Hook into session events
    'session.created': async (_event: any) => {
      console.log('[OpenCode Teams] Session created - team coordination tools available');
    },

    'session.deleted': async (_event: any) => {
      const teamName = process.env.OPENCODE_TEAM_NAME;
      if (teamName) {
        console.log(`[OpenCode Teams] Session ended - team: ${teamName}`);
      }
    },

    'session.idle': async (_event: any) => {
      console.log('[OpenCode Teams] Session idle - performing maintenance');
      // Fallback logic for idle sessions: check if any teams should be cleaned up
      const teams = TeamOperations.discoverTeams();
      for (const team of teams) {
        if (TeamOperations.shouldShutdown(team.name)) {
          console.log(`[OpenCode Teams] Idle session cleanup for team: ${team.name}`);
          TeamOperations.cleanup(team.name);
        }
      }

      // Auto-cleanup stale tmux sessions with no attached clients
      const activeSessions = SessionManager.listActiveSessions();
      for (const session of activeSessions) {
        if (SessionManager.checkAutoCleanup(session.sessionName)) {
          console.log(`[OpenCode Teams] Auto-cleaned stale session: ${session.sessionName}`);
        }
      }
    },

    // Hook into tool execution for context injection
    'tool.execute.before': async (input: any, _output: any) => {
      const teamName = process.env.OPENCODE_TEAM_NAME;
      if (teamName && !input.tool.startsWith('spawn-team')) {
        // Inject team context for debugging
        if (ctx.client?.app?.log) {
          await ctx.client.app.log({
            service: 'opencode-teams',
            level: 'debug',
            message: `Executing ${input.tool} in team context: ${teamName}`,
          });
        }
      }
    },
  };
};

// Export as default for OpenCode to load
export default OpenCodeTeamsPlugin;
