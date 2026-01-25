/**
 * OpenCode Teams Plugin
 * 
 * Multi-agent team coordination plugin inspired by Claude Code's TeammateTool.
 * Enables spawning, coordinating, and managing teams of AI agents working together.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

/**
 * Safely read and parse a JSON file
 */
function safeReadJSON(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
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
function generateId() {
  return `${Date.now()}-${randomBytes(4).toString('hex')}`;
}

/**
 * Get the teams directory path
 */
function getTeamsDir() {
  const baseDir = process.env.OPENCODE_TEAMS_DIR || join(homedir(), '.opencode', 'teams');
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

/**
 * Get the tasks directory path
 */
function getTasksDir() {
  const baseDir = process.env.OPENCODE_TASKS_DIR || join(homedir(), '.opencode', 'tasks');
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

/**
 * Team coordination operations
 */
const TeamOperations = {
  /**
   * Create a new team
   */
  spawnTeam: (teamName, leaderInfo = {}) => {
    const teamsDir = getTeamsDir();
    const teamDir = join(teamsDir, teamName);
    
    if (existsSync(teamDir)) {
      throw new Error(`Team "${teamName}" already exists`);
    }
    
    mkdirSync(teamDir, { recursive: true });
    mkdirSync(join(teamDir, 'messages'), { recursive: true });
    
    const config = {
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
  discoverTeams: () => {
    const teamsDir = getTeamsDir();
    if (!existsSync(teamsDir)) {
      return [];
    }
    
    const teams = [];
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
        } catch (error) {
          console.warn(`Warning: Could not read team config for ${teamName}:`, error.message);
        }
      }
    }
    
    return teams;
  },

  /**
   * Request to join a team
   */
  requestJoin: (teamName, agentInfo = {}) => {
    const teamsDir = getTeamsDir();
    const teamDir = join(teamsDir, teamName);
    const configPath = join(teamDir, 'config.json');
    
    if (!existsSync(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }
    
    const config = safeReadJSON(configPath);
    
    // Add to pending requests (simplified - could be enhanced with approval workflow)
    const member = {
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
  write: (teamName, targetAgentId, message, fromAgentId = null) => {
    const teamsDir = getTeamsDir();
    const messagesDir = join(teamsDir, teamName, 'messages');
    
    if (!existsSync(messagesDir)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }
    
    const messageFile = join(messagesDir, `${generateId()}-${targetAgentId}.json`);
    const messageData = {
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
  broadcast: (teamName, message, fromAgentId = null) => {
    const teamsDir = getTeamsDir();
    const teamDir = join(teamsDir, teamName);
    const configPath = join(teamDir, 'config.json');
    
    if (!existsSync(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }
    
    const config = safeReadJSON(configPath);
    const messagesDir = join(teamDir, 'messages');
    
    const messageData = {
      from: fromAgentId || process.env.OPENCODE_AGENT_ID || 'unknown',
      to: 'broadcast',
      message,
      timestamp: new Date().toISOString(),
      recipients: config.members.map(m => m.agentId)
    };
    
    const messageFile = join(messagesDir, `${generateId()}-broadcast.json`);
    writeFileSync(messageFile, JSON.stringify(messageData, null, 2));
    
    return messageData;
  },

  /**
   * Read messages for current agent
   */
  readMessages: (teamName, agentId = null) => {
    const teamsDir = getTeamsDir();
    const messagesDir = join(teamsDir, teamName, 'messages');
    
    if (!existsSync(messagesDir)) {
      return [];
    }
    
    const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';
    const messages = [];
    
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
      } catch (error) {
        console.warn(`Warning: Could not read message ${file}:`, error.message);
      }
    }
    
    return messages;
  },

  /**
   * Clean up team and all associated data
   */
  cleanup: (teamName) => {
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
  getTeamInfo: (teamName) => {
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
const TaskOperations = {
  /**
   * Create a new task
   */
  createTask: (teamName, task) => {
    const tasksDir = getTasksDir();
    const teamTasksDir = join(tasksDir, teamName);
    
    if (!existsSync(teamTasksDir)) {
      mkdirSync(teamTasksDir, { recursive: true });
    }
    
    const taskId = generateId(); // Use unique ID with random component
    const taskData = {
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
  getTasks: (teamName, filters = {}) => {
    const tasksDir = getTasksDir();
    const teamTasksDir = join(tasksDir, teamName);
    
    if (!existsSync(teamTasksDir)) {
      return [];
    }
    
    const tasks = [];
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
      } catch (error) {
        console.warn(`Warning: Could not read task ${file}:`, error.message);
      }
    }
    
    return tasks;
  },

  /**
   * Update a task
   */
  updateTask: (teamName, taskId, updates) => {
    const tasksDir = getTasksDir();
    const taskPath = join(tasksDir, teamName, `${taskId}.json`);
    
    if (!existsSync(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }
    
    const task = safeReadJSON(taskPath);
    const updatedTask = {
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
  claimTask: (teamName, taskId, agentId = null) => {
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
export default async ({ project, client, $, directory, worktree }) => {
  console.log('[OpenCode Teams Plugin] Initialized');
  
  // Make operations available globally for skills to use
  global.TeamOperations = TeamOperations;
  global.TaskOperations = TaskOperations;
  
  return {
    // Hook into tool execution to provide team context
    'tool.execute.before': async (input, output) => {
      // Inject team context if available
      const teamName = process.env.OPENCODE_TEAM_NAME;
      if (teamName) {
        console.log(`[OpenCode Teams] Executing in team context: ${teamName}`);
      }
    },
    
    // Hook into session creation to set up team context
    'session.created': async ({ event }) => {
      console.log('[OpenCode Teams] New session created - team coordination available');
    },
    
    // Hook into session cleanup
    'session.deleted': async ({ event }) => {
      const teamName = process.env.OPENCODE_TEAM_NAME;
      if (teamName) {
        console.log(`[OpenCode Teams] Session ended - team: ${teamName}`);
      }
    }
  };
};
