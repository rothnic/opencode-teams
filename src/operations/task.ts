/**
 * Task Operations Module
 * Using Bun built-in APIs for file operations
 */

import { join } from 'node:path';
import type { Task, TaskFilters } from '../types/index';
import {
  getTasksDir,
  generateId,
  safeReadJSONSync,
  writeJSONSync,
  dirExists,
  readDir,
} from '../utils/index';

/**
 * Task coordination operations
 */
export const TaskOperations = {
  /**
   * Create a new task
   */
  createTask: (teamName: string, taskData: Partial<Task>): Task => {
    const tasksDir = getTasksDir();
    const teamTasksDir = join(tasksDir, teamName);

    if (!dirExists(teamTasksDir)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    const taskId = generateId();
    const task: Task = {
      id: taskId,
      title: taskData.title || 'Untitled Task',
      description: taskData.description,
      priority: taskData.priority || 'normal',
      status: 'pending',
      createdAt: new Date().toISOString(),
      ...taskData,
    };

    const taskPath = join(teamTasksDir, `${taskId}.json`);
    writeJSONSync(taskPath, task);

    return task;
  },

  /**
   * Get tasks for a team with optional filters
   */
  getTasks: (teamName: string, filters: TaskFilters = {}): Task[] => {
    const tasksDir = getTasksDir();
    const teamTasksDir = join(tasksDir, teamName);

    if (!dirExists(teamTasksDir)) {
      return [];
    }

    const tasks: Task[] = [];
    const files = readDir(teamTasksDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const taskPath = join(teamTasksDir, file);
      try {
        const task = safeReadJSONSync(taskPath);

        // Apply filters
        if (filters.status && task.status !== filters.status) {
          continue;
        }
        if (filters.owner && task.owner !== filters.owner) {
          continue;
        }

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

    if (!dirExists(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }

    const task = safeReadJSONSync(taskPath);
    const updatedTask: Task = {
      ...task,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    writeJSONSync(taskPath, updatedTask);
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

    if (!dirExists(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }

    // Read current task state
    const task = safeReadJSONSync(taskPath);

    // Check if task is still available
    if (task.status !== 'pending') {
      throw new Error(`Task ${taskId} is not available (status: ${task.status})`);
    }

    // Claim the task
    return TaskOperations.updateTask(teamName, taskId, {
      status: 'in_progress',
      owner: currentAgentId,
      claimedAt: new Date().toISOString(),
    });
  },
};
