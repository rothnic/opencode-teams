/**
 * Team Operations Module
 * Using Bun built-in APIs for file operations
 */

import { join } from 'node:path';
import type { TeamConfig, TeamMember, LeaderInfo, Message, TeamSummary } from '../types/index';
import {
  getTeamsDir,
  getTasksDir,
  generateId,
  safeReadJSONSync,
  writeJSONSync,
  dirExists,
  readDir,
  removeDir,
} from '../utils/index';

/**
 * Team coordination operations
 */
export const TeamOperations = {
  /**
   * Create a new team
   */
  spawnTeam: (teamName: string, leaderInfo: LeaderInfo = {}): TeamConfig => {
    const teamsDir = getTeamsDir();
    const teamDir = join(teamsDir, teamName);

    if (dirExists(teamDir)) {
      throw new Error(`Team "${teamName}" already exists`);
    }

    // Create team directories using Bun
    Bun.spawnSync(['mkdir', '-p', join(teamDir, 'messages')]);

    const config: TeamConfig = {
      name: teamName,
      created: new Date().toISOString(),
      leader: leaderInfo.agentId || process.env.OPENCODE_AGENT_ID || 'leader',
      members: [
        {
          agentId: leaderInfo.agentId || process.env.OPENCODE_AGENT_ID || 'leader',
          agentName: leaderInfo.agentName || process.env.OPENCODE_AGENT_NAME || 'Leader',
          agentType: leaderInfo.agentType || 'leader',
          joinedAt: new Date().toISOString(),
        },
      ],
    };

    writeJSONSync(join(teamDir, 'config.json'), config);

    // Create task queue for team
    const tasksDir = getTasksDir();
    const teamTasksDir = join(tasksDir, teamName);
    Bun.spawnSync(['mkdir', '-p', teamTasksDir]);

    return config;
  },

  /**
   * Discover available teams
   */
  discoverTeams: (): TeamSummary[] => {
    const teamsDir = getTeamsDir();
    if (!dirExists(teamsDir)) {
      return [];
    }

    const teams: TeamSummary[] = [];
    const teamDirs = readDir(teamsDir);

    for (const teamName of teamDirs) {
      const configPath = join(teamsDir, teamName, 'config.json');
      if (dirExists(configPath)) {
        try {
          const config = safeReadJSONSync(configPath);
          teams.push({
            name: teamName,
            leader: config.leader,
            memberCount: config.members.length,
            created: config.created,
          });
        } catch (error: any) {
          console.warn(`Warning: Could not read team config for ${teamName}:`, error.message);
        }
      }
    }

    return teams;
  },

  /**
   * Request to join a team
   */
  requestJoin: (teamName: string, agentInfo: LeaderInfo = {}): TeamMember => {
    const teamsDir = getTeamsDir();
    const teamDir = join(teamsDir, teamName);
    const configPath = join(teamDir, 'config.json');

    if (!dirExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    const config = safeReadJSONSync(configPath);

    const member: TeamMember = {
      agentId: agentInfo.agentId || process.env.OPENCODE_AGENT_ID || `agent-${Date.now()}`,
      agentName: agentInfo.agentName || process.env.OPENCODE_AGENT_NAME || 'Agent',
      agentType: agentInfo.agentType || process.env.OPENCODE_AGENT_TYPE || 'worker',
      joinedAt: new Date().toISOString(),
    };

    config.members.push(member);
    writeJSONSync(configPath, config);

    return member;
  },

  /**
   * Get team information
   */
  getTeamInfo: (teamName: string): TeamConfig => {
    const teamsDir = getTeamsDir();
    const configPath = join(teamsDir, teamName, 'config.json');

    if (!dirExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    return safeReadJSONSync(configPath);
  },

  /**
   * Send message to specific teammate
   */
  write: (
    teamName: string,
    targetAgentId: string,
    message: string,
    fromAgentId?: string
  ): Message => {
    const teamsDir = getTeamsDir();
    const messagesDir = join(teamsDir, teamName, 'messages');

    if (!dirExists(messagesDir)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    const messageFile = join(messagesDir, `${generateId()}-${targetAgentId}.json`);
    const messageData: Message = {
      from: fromAgentId || process.env.OPENCODE_AGENT_ID || 'unknown',
      to: targetAgentId,
      message,
      timestamp: new Date().toISOString(),
    };

    writeJSONSync(messageFile, messageData);
    return messageData;
  },

  /**
   * Broadcast message to all teammates
   */
  broadcast: (teamName: string, message: string, fromAgentId?: string): Message => {
    const teamsDir = getTeamsDir();
    const teamDir = join(teamsDir, teamName);
    const configPath = join(teamDir, 'config.json');

    if (!dirExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    const config = safeReadJSONSync(configPath);
    const messagesDir = join(teamDir, 'messages');

    const messageData: Message = {
      from: fromAgentId || process.env.OPENCODE_AGENT_ID || 'unknown',
      to: 'broadcast',
      message,
      timestamp: new Date().toISOString(),
      recipients: config.members.map((m: TeamMember) => m.agentId),
    };

    const messageFile = join(messagesDir, `${generateId()}-broadcast.json`);
    writeJSONSync(messageFile, messageData);

    return messageData;
  },

  /**
   * Read messages for current agent
   */
  readMessages: (teamName: string, agentId?: string, since?: string): Message[] => {
    const teamsDir = getTeamsDir();
    const messagesDir = join(teamsDir, teamName, 'messages');

    if (!dirExists(messagesDir)) {
      return [];
    }

    const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';
    const messages: Message[] = [];

    const files = readDir(messagesDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    for (const file of files) {
      const msgPath = join(messagesDir, file);
      try {
        const msg = safeReadJSONSync(msgPath);

        // Filter by timestamp if provided
        if (since && msg.timestamp <= since) {
          continue;
        }

        // Check if message is for this agent
        if (msg.to === currentAgentId || msg.to === 'broadcast') {
          messages.push(msg);
        }
      } catch (error: any) {
        console.warn(`Warning: Could not read message ${file}:`, error.message);
      }
    }

    return messages;
  },

  /**
   * Poll inbox for new messages with long-polling
   */
  pollInbox: async (
    teamName: string,
    agentId?: string,
    timeoutMs: number = 30000,
    since?: string
  ): Promise<Message[]> => {
    const startTime = Date.now();
    const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';
    let lastCheck = since;

    while (Date.now() - startTime < timeoutMs) {
      const messages = TeamOperations.readMessages(teamName, currentAgentId, lastCheck);
      if (messages.length > 0) {
        return messages;
      }
      // Wait for a bit before checking again to avoid CPU hogging
      await Bun.sleep(1000);
    }

    return [];
  },

  /**
   * Request team shutdown
   */
  requestShutdown: (teamName: string, agentId?: string): TeamConfig => {
    const teamsDir = getTeamsDir();
    const configPath = join(teamsDir, teamName, 'config.json');

    if (!dirExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    const config = safeReadJSONSync(configPath) as TeamConfig;
    const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';

    if (!config.shutdownApprovals) {
      config.shutdownApprovals = [];
    }

    if (!config.shutdownApprovals.includes(currentAgentId)) {
      config.shutdownApprovals.push(currentAgentId);
    }

    writeJSONSync(configPath, config);
    return config;
  },

  /**
   * Approve team shutdown
   */
  approveShutdown: (teamName: string, agentId?: string): TeamConfig => {
    return TeamOperations.requestShutdown(teamName, agentId);
  },

  /**
   * Check if team should shutdown
   */
  shouldShutdown: (teamName: string): boolean => {
    const teamsDir = getTeamsDir();
    const configPath = join(teamsDir, teamName, 'config.json');

    if (!dirExists(configPath)) {
      return false;
    }

    const config = safeReadJSONSync(configPath) as TeamConfig;
    if (!config.shutdownApprovals || config.shutdownApprovals.length === 0) {
      return false;
    }

    // If leader approved, or if all members approved
    const isLeaderApproved = config.shutdownApprovals.includes(config.leader);
    const areAllMembersApproved = config.members.every((m) =>
      config.shutdownApprovals?.includes(m.agentId)
    );

    return isLeaderApproved || areAllMembersApproved;
  },

  /**
   * Clean up team data
   */
  cleanup: (teamName: string): void => {
    const teamsDir = getTeamsDir();
    const tasksDir = getTasksDir();

    const teamDir = join(teamsDir, teamName);
    const teamTasksDir = join(tasksDir, teamName);

    if (dirExists(teamDir)) {
      removeDir(teamDir);
    }

    if (dirExists(teamTasksDir)) {
      removeDir(teamTasksDir);
    }
  },
};
