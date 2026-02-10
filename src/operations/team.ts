/**
 * Team Operations Module
 *
 * All operations use:
 * - Advisory file locks (via file-lock.ts) for concurrency safety
 * - Atomic writes (via fs-atomic.ts) for crash safety
 * - Zod schemas (via schemas.ts) for runtime validation
 * - Project-specific storage paths (via storage-paths.ts)
 */

import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  InboxSchema,
  type LeaderInfo,
  type Message,
  MessageSchema,
  type TeamConfig,
  TeamConfigSchema,
  type TeamMember,
  TeamMemberSchema,
  type TeamSummary,
} from '../types/schemas';
import { withLock } from '../utils/file-lock';
import { lockedUpdate, lockedUpsert, readValidatedJSON, writeAtomicJSON } from '../utils/fs-atomic';
import {
  dirExists,
  ensureDir,
  fileExists,
  getAgentInboxPath,
  getInboxesDir,
  getTasksDir,
  getTeamConfigPath,
  getTeamDir,
  getTeamLockPath,
  getTeamsDir,
  getTeamTasksDir,
} from '../utils/storage-paths';

/**
 * Team coordination operations
 */
export const TeamOperations = {
  /**
   * Create a new team
   */
  spawnTeam: (teamName: string, leaderInfo: LeaderInfo = {}): TeamConfig => {
    // Validate team name format via schema
    const nameResult = TeamConfigSchema.shape.name.safeParse(teamName);
    if (!nameResult.success) {
      throw new Error(`Invalid team name "${teamName}": ${nameResult.error.issues[0].message}`);
    }

    const teamDir = getTeamDir(teamName);

    if (dirExists(teamDir) && fileExists(getTeamConfigPath(teamName))) {
      throw new Error(`Team "${teamName}" already exists`);
    }

    // Create team directories
    ensureDir(teamDir);
    ensureDir(getInboxesDir(teamName));
    ensureDir(getTeamTasksDir(teamName));

    const now = new Date().toISOString();
    const leaderId = leaderInfo.agentId || process.env.OPENCODE_AGENT_ID || 'leader';

    const config: TeamConfig = {
      name: teamName,
      created: now,
      leader: leaderId,
      members: [
        {
          agentId: leaderId,
          agentName: leaderInfo.agentName || process.env.OPENCODE_AGENT_NAME || 'Leader',
          agentType: leaderInfo.agentType || 'leader',
          joinedAt: now,
        },
      ],
    };

    // Validate and write atomically
    const configPath = getTeamConfigPath(teamName);
    writeAtomicJSON(configPath, config, TeamConfigSchema);

    // Initialize leader's inbox as empty array
    const leaderInboxPath = getAgentInboxPath(teamName, leaderId);
    writeAtomicJSON(leaderInboxPath, [], InboxSchema);

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

    let entries: string[];
    try {
      entries = readdirSync(teamsDir);
    } catch {
      return [];
    }

    for (const teamName of entries) {
      const configPath = getTeamConfigPath(teamName);
      if (!fileExists(configPath)) continue;

      try {
        const config = readValidatedJSON(configPath, TeamConfigSchema);
        teams.push({
          name: config.name,
          leader: config.leader,
          memberCount: config.members.length,
          created: config.created,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Could not read team config for ${teamName}: ${msg}`);
      }
    }

    return teams;
  },

  /**
   * Request to join a team (locked read-modify-write)
   */
  requestJoin: (teamName: string, agentInfo: LeaderInfo = {}): TeamMember => {
    const configPath = getTeamConfigPath(teamName);
    const lockPath = getTeamLockPath(teamName);

    if (!fileExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    const now = new Date().toISOString();
    const agentId = agentInfo.agentId || process.env.OPENCODE_AGENT_ID || `agent-${Date.now()}`;

    const member: TeamMember = {
      agentId,
      agentName: agentInfo.agentName || process.env.OPENCODE_AGENT_NAME || 'Agent',
      agentType: agentInfo.agentType || process.env.OPENCODE_AGENT_TYPE || 'worker',
      joinedAt: now,
    };

    // Validate member before modifying config
    TeamMemberSchema.parse(member);

    // Locked read-modify-write
    lockedUpdate(lockPath, configPath, TeamConfigSchema, (config) => {
      // Check for duplicate membership
      if (config.members.some((m) => m.agentId === agentId)) {
        throw new Error(`Agent "${agentId}" is already a member of team "${teamName}"`);
      }
      return { ...config, members: [...config.members, member] };
    });

    // Create agent's inbox file
    const inboxPath = getAgentInboxPath(teamName, agentId);
    if (!fileExists(inboxPath)) {
      writeAtomicJSON(inboxPath, [], InboxSchema);
    }

    return member;
  },

  /**
   * Get team information (locked read)
   */
  getTeamInfo: (teamName: string): TeamConfig => {
    const configPath = getTeamConfigPath(teamName);
    const lockPath = getTeamLockPath(teamName);

    if (!fileExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    return withLock(lockPath, () => readValidatedJSON(configPath, TeamConfigSchema), false);
  },

  /**
   * Send a direct message to a specific teammate (per-agent inbox model)
   */
  write: (
    teamName: string,
    targetAgentId: string,
    message: string,
    fromAgentId?: string,
  ): Message => {
    const configPath = getTeamConfigPath(teamName);
    const lockPath = getTeamLockPath(teamName);

    if (!fileExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    const senderId = fromAgentId || process.env.OPENCODE_AGENT_ID || 'unknown';

    // Validate sender and recipient are team members
    const config = withLock(lockPath, () => readValidatedJSON(configPath, TeamConfigSchema), false);

    if (!config.members.some((m) => m.agentId === targetAgentId)) {
      throw new Error(`Recipient "${targetAgentId}" is not a member of team "${teamName}"`);
    }

    const messageData: Message = {
      from: senderId,
      to: targetAgentId,
      message,
      timestamp: new Date().toISOString(),
      read: false,
    };

    // Validate the message
    MessageSchema.parse(messageData);

    // Append to recipient's inbox (locked upsert)
    const inboxPath = getAgentInboxPath(teamName, targetAgentId);
    lockedUpsert(lockPath, inboxPath, InboxSchema, [], (inbox) => {
      return [...inbox, messageData];
    });

    return messageData;
  },

  /**
   * Broadcast message to all teammates (per-agent inbox model)
   */
  broadcast: (teamName: string, message: string, fromAgentId?: string): Message => {
    const configPath = getTeamConfigPath(teamName);
    const lockPath = getTeamLockPath(teamName);

    if (!fileExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    const senderId = fromAgentId || process.env.OPENCODE_AGENT_ID || 'unknown';

    // Read config under lock to get member list
    const config = withLock(lockPath, () => readValidatedJSON(configPath, TeamConfigSchema), false);

    const messageData: Message = {
      from: senderId,
      to: 'broadcast',
      message,
      timestamp: new Date().toISOString(),
      read: false,
      recipients: config.members.map((m) => m.agentId),
    };

    MessageSchema.parse(messageData);

    // Deliver to each agent's inbox (except sender)
    for (const member of config.members) {
      if (member.agentId === senderId) continue;
      const inboxPath = getAgentInboxPath(teamName, member.agentId);
      lockedUpsert(lockPath, inboxPath, InboxSchema, [], (inbox) => {
        return [...inbox, messageData];
      });
    }

    return messageData;
  },

  /**
   * Read messages for current agent from their inbox
   */
  readMessages: (teamName: string, agentId?: string, since?: string): Message[] => {
    const lockPath = getTeamLockPath(teamName);
    const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';
    const inboxPath = getAgentInboxPath(teamName, currentAgentId);

    if (!fileExists(inboxPath)) {
      return [];
    }

    return withLock(
      lockPath,
      () => {
        const inbox = readValidatedJSON(inboxPath, InboxSchema);

        let filtered = inbox;
        if (since) {
          filtered = inbox.filter((m) => m.timestamp > since);
        }

        // Mark returned messages as read
        if (filtered.length > 0) {
          const readTimestamps = new Set(filtered.map((m) => m.timestamp));
          const updatedInbox = inbox.map((m) => {
            if (readTimestamps.has(m.timestamp) && !m.read) {
              return { ...m, read: true };
            }
            return m;
          });
          writeAtomicJSON(inboxPath, updatedInbox, InboxSchema);
        }

        return filtered;
      },
      true,
    );
  },

  /**
   * Poll inbox for new messages with long-polling
   */
  pollInbox: async (
    teamName: string,
    agentId?: string,
    timeoutMs: number = 30000,
    since?: string,
  ): Promise<Message[]> => {
    const startTime = Date.now();
    const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';
    const inboxPath = getAgentInboxPath(teamName, currentAgentId);

    // If inbox doesn't exist yet, wait for it
    while (Date.now() - startTime < timeoutMs) {
      if (fileExists(inboxPath)) {
        const messages = TeamOperations.readMessages(teamName, currentAgentId, since);
        if (messages.length > 0) {
          return messages;
        }
      }
      await Bun.sleep(500);
    }

    return [];
  },

  /**
   * Request team shutdown (locked read-modify-write)
   */
  requestShutdown: (teamName: string, agentId?: string): TeamConfig => {
    const configPath = getTeamConfigPath(teamName);
    const lockPath = getTeamLockPath(teamName);

    if (!fileExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';

    return lockedUpdate(lockPath, configPath, TeamConfigSchema, (config) => {
      const approvals = config.shutdownApprovals || [];
      if (!approvals.includes(currentAgentId)) {
        approvals.push(currentAgentId);
      }
      return { ...config, shutdownApprovals: approvals };
    });
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
    const configPath = getTeamConfigPath(teamName);
    const lockPath = getTeamLockPath(teamName);

    if (!fileExists(configPath)) {
      return false;
    }

    const config = withLock(lockPath, () => readValidatedJSON(configPath, TeamConfigSchema), false);

    if (!config.shutdownApprovals || config.shutdownApprovals.length === 0) {
      return false;
    }

    const isLeaderApproved = config.shutdownApprovals.includes(config.leader);
    const areAllMembersApproved = config.members.every((m) =>
      config.shutdownApprovals?.includes(m.agentId),
    );

    return isLeaderApproved || areAllMembersApproved;
  },

  /**
   * Clean up team data
   */
  cleanup: (teamName: string): void => {
    const teamDir = getTeamDir(teamName);
    // Construct path manually to avoid getTeamTasksDir() auto-creating the directory
    const teamTasksDir = join(getTasksDir(), teamName);

    if (dirExists(teamDir)) {
      rmSync(teamDir, { recursive: true, force: true });
    }

    if (dirExists(teamTasksDir)) {
      rmSync(teamTasksDir, { recursive: true, force: true });
    }
  },
};
