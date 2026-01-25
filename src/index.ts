/**
 * OpenCode Teams Plugin
 * 
 * Multi-agent team coordination plugin inspired by Claude Code's TeammateTool.
 * Enables spawning, coordinating, and managing teams of AI agents working together.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

/**
 * Safely read and parse a JSON file
 */
function safeReadJSON(filePath: string): any {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    } else if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in file: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${randomBytes(4).toString('hex')}`;
}

/**
 * Get the plugin's base directory in OpenCode config
 */
function getPluginDir(): string {
  const baseDir = process.env.OPENCODE_TEAMS_DIR || join(homedir(), '.config', 'opencode', 'opencode-teams');
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

/**
 * Get the teams directory path
 */
function getTeamsDir(): string {
  const baseDir = join(getPluginDir(), 'teams');
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

/**
 * Get the tasks directory path
 */
function getTasksDir(): string {
  const baseDir = join(getPluginDir(), 'tasks');
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

interface LeaderInfo {
  agentId?: string;
  agentName?: string;
  agentType?: string;
}

interface TeamMember {
  agentId: string;
  agentName: string;
  agentType: string;
  joinedAt: string;
}

interface TeamConfig {
  name: string;
  created: string;
  leader: string;
  members: TeamMember[];
}

interface Message {
  from: string;
  to: string;
  message: string;
  timestamp: string;
  recipients?: string[];
}

interface Task {
  id: string;
  title?: string;
  description?: string;
  priority?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  owner?: string;
  claimedAt?: string;
  completedAt?: string;
  [key: string]: any;
}

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
    
    if (existsSync(teamDir)) {
      throw new Error(`Team "${teamName}" already exists`);
    }
    
    mkdirSync(teamDir, { recursive: true });
    mkdirSync(join(teamDir, 'messages'), { recursive: true });
    
    const config: TeamConfig = {
      name: teamName,
      created: new Date().toISOString(),
      leader: leaderInfo.agentId || process.env.OPENCODE_AGENT_ID || 'leader',
      members: [{
        agentId: leaderInfo.agentId || process.env.OPENCODE_AGENT_ID || 'leader',
        agentName: leaderInfo.agentName || process.env.OPENCODE_AGENT_NAME || 'Leader',
        agentType: leaderInfo.agentType || 'leader',
        joinedAt: new Date().toISOString()
      }]
    };
    
    writeFileSync(
      join(teamDir, 'config.json'),
      JSON.stringify(config, null, 2)
    );
    
    // Create task queue for team
    const tasksDir = getTasksDir();
    const teamTasksDir = join(tasksDir, teamName);
    mkdirSync(teamTasksDir, { recursive: true });
    
    return config;
  },

  /**
   * Discover available teams
   */
  discoverTeams: (): Array<{name: string; leader: string; memberCount: number; created: string}> => {
    const teamsDir = getTeamsDir();
    if (!existsSync(teamsDir)) {
      return [];
    }
    
    const teams: Array<{name: string; leader: string; memberCount: number; created: string}> = [];
    const teamDirs = readdirSync(teamsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    for (const teamName of teamDirs) {
      const configPath = join(teamsDir, teamName, 'config.json');
      if (existsSync(configPath)) {
        try {
          const config = safeReadJSON(configPath);
          teams.push({
            name: teamName,
            leader: config.leader,
            memberCount: config.members.length,
            created: config.created
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
    
    if (!existsSync(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }
    
    const config = safeReadJSON(configPath);
    
    const member: TeamMember = {
      agentId: agentInfo.agentId || process.env.OPENCODE_AGENT_ID || `agent-${Date.now()}`,
      agentName: agentInfo.agentName || process.env.OPENCODE_AGENT_NAME || 'Agent',
      agentType: agentInfo.agentType || process.env.OPENCODE_AGENT_TYPE || 'worker',
      joinedAt: new Date().toISOString()
    };
    
    config.members.push(member);
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    return member;
  },

  /**
   * Send message to specific teammate
   */
  write: (teamName: string, targetAgentId: string, message: string, fromAgentId?: string): Message => {
    const teamsDir = getTeamsDir();
    const messagesDir = join(teamsDir, teamName, 'messages');
    
    if (!existsSync(messagesDir)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }
    
    const messageFile = join(messagesDir, `${generateId()}-${targetAgentId}.json`);
    const messageData: Message = {
      from: fromAgentId || process.env.OPENCODE_AGENT_ID || 'unknown',
      to: targetAgentId,
      message,
      timestamp: new Date().toISOString()
    };
    
    writeFileSync(messageFile, JSON.stringify(messageData, null, 2));
    return messageData;
  },

  /**
   * Broadcast message to all teammates
   */
  broadcast: (teamName: string, message: string, fromAgentId?: string): Message => {
    const teamsDir = getTeamsDir();
    const teamDir = join(teamsDir, teamName);
    const configPath = join(teamDir, 'config.json');
    
    if (!existsSync(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }
    
    const config = safeReadJSON(configPath);
    const messagesDir = join(teamDir, 'messages');
    
    const messageData: Message = {
      from: fromAgentId || process.env.OPENCODE_AGENT_ID || 'unknown',
      to: 'broadcast',
      message,
      timestamp: new Date().toISOString(),
      recipients: config.members.map((m: TeamMember) => m.agentId)
    };
    
    const messageFile = join(messagesDir, `${generateId()}-broadcast.json`);
    writeFileSync(messageFile, JSON.stringify(messageData, null, 2));
    
    return messageData;
  },

  /**
   * Read messages for current agent
   */
  readMessages: (teamName: string, agentId?: string): Message[] => {
    const teamsDir = getTeamsDir();
    const messagesDir = join(teamsDir, teamName, 'messages');
    
    if (!existsSync(messagesDir)) {
      return [];
    }
    
    const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';
    const messages: Message[] = [];
    
    const files = readdirSync(messagesDir)
      .filter(f => f.endsWith('.json'))
      .sort();
    
    for (const file of files) {
      const msgPath = join(messagesDir, file);
      try {
        const msg = safeReadJSON(msgPath);
        
        // Include if addressed to this agent or broadcast
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
   * Clean up team and all associated data
   */
  cleanup: (teamName: string): {success: boolean; team: string} => {
    const teamsDir = getTeamsDir();
    const teamDir = join(teamsDir, teamName);
    
    if (existsSync(teamDir)) {
      rmSync(teamDir, { recursive: true, force: true });
    }
    
    // Clean up tasks
    const tasksDir = getTasksDir();
    const teamTasksDir = join(tasksDir, teamName);
    if (existsSync(teamTasksDir)) {
      rmSync(teamTasksDir, { recursive: true, force: true });
    }
    
    return { success: true, team: teamName };
  },

  /**
   * Get team info
   */
  getTeamInfo: (teamName: string): TeamConfig => {
    const teamsDir = getTeamsDir();
    const configPath = join(teamsDir, teamName, 'config.json');
    
    if (!existsSync(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }
    
    return safeReadJSON(configPath);
  }
};

/**
 * Task queue operations for team coordination
 */
export const TaskOperations = {
  /**
   * Create a new task
   */
  createTask: (teamName: string, task: Partial<Task>): Task => {
    const tasksDir = getTasksDir();
    const teamTasksDir = join(tasksDir, teamName);
    
    if (!existsSync(teamTasksDir)) {
      mkdirSync(teamTasksDir, { recursive: true });
    }
    
    const taskId = generateId();
    const taskData: Task = {
      id: taskId,
      ...task,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    writeFileSync(
      join(teamTasksDir, `${taskId}.json`),
      JSON.stringify(taskData, null, 2)
    );
    
    return taskData;
  },

  /**
   * Get all tasks for a team
   */
  getTasks: (teamName: string, filters: {status?: string; owner?: string} = {}): Task[] => {
    const tasksDir = getTasksDir();
    const teamTasksDir = join(tasksDir, teamName);
    
    if (!existsSync(teamTasksDir)) {
      return [];
    }
    
    const tasks: Task[] = [];
    const files = readdirSync(teamTasksDir)
      .filter(f => f.endsWith('.json'))
      .sort();
    
    for (const file of files) {
      const taskPath = join(teamTasksDir, file);
      try {
        const task = safeReadJSON(taskPath);
        
        // Apply filters
        if (filters.status && task.status !== filters.status) continue;
        if (filters.owner && task.owner !== filters.owner) continue;
        
        tasks.push(task);
      } catch (error: any) {
        console.warn(`Warning: Could not read task ${file}:`, error.message);
      }
    }
    
    return tasks;
  },

  /**
   * Update a task
   */
  updateTask: (teamName: string, taskId: string, updates: Partial<Task>): Task => {
    const tasksDir = getTasksDir();
    const taskPath = join(tasksDir, teamName, `${taskId}.json`);
    
    if (!existsSync(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }
    
    const task = safeReadJSON(taskPath);
    const updatedTask: Task = {
      ...task,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    writeFileSync(taskPath, JSON.stringify(updatedTask, null, 2));
    return updatedTask;
  },

  /**
   * Claim a task (for worker agents)
   * Includes race condition check
   */
  claimTask: (teamName: string, taskId: string, agentId?: string): Task => {
    const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';
    const tasksDir = getTasksDir();
    const taskPath = join(tasksDir, teamName, `${taskId}.json`);
    
    if (!existsSync(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }
    
    // Read current task state
    const task = safeReadJSON(taskPath);
    
    // Check if task is still available
    if (task.status !== 'pending') {
      throw new Error(`Task ${taskId} is not available (status: ${task.status})`);
    }
    
    // Claim the task
    return TaskOperations.updateTask(teamName, taskId, {
      status: 'in_progress',
      owner: currentAgentId,
      claimedAt: new Date().toISOString()
    });
  }
};

/**
 * Main plugin export
 */
export default async ({ project, client, $, directory, worktree }: any) => {
  console.log('[OpenCode Teams Plugin] Initialized');
  
  // Make operations available globally for skills to use
  (global as any).TeamOperations = TeamOperations;
  (global as any).TaskOperations = TaskOperations;
  
  return {
    // Hook into tool execution to provide team context
    'tool.execute.before': async (input: any, output: any) => {
      // Inject team context if available
      const teamName = process.env.OPENCODE_TEAM_NAME;
      if (teamName) {
        console.log(`[OpenCode Teams] Executing in team context: ${teamName}`);
      }
    },
    
    // Hook into session creation to set up team context
    'session.created': async ({ event }: any) => {
      console.log('[OpenCode Teams] New session created - team coordination available');
    },
    
    // Hook into session cleanup
    'session.deleted': async ({ event }: any) => {
      const teamName = process.env.OPENCODE_TEAM_NAME;
      if (teamName) {
        console.log(`[OpenCode Teams] Session ended - team: ${teamName}`);
      }
    }
  };
};
