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
   * Check for circular dependencies
   */
  checkCircularDependency: (
    teamName: string,
    taskId: string,
    dependencies: string[],
    visited = new Set<string>()
  ): void => {
    visited.add(taskId);

    for (const depId of dependencies) {
      if (visited.has(depId)) {
        throw new Error(`Circular dependency detected: ${depId}`);
      }

      try {
        const dep = TaskOperations.getTask(teamName, depId);
        if (dep.dependencies && dep.dependencies.length > 0) {
          TaskOperations.checkCircularDependency(
            teamName,
            depId,
            dep.dependencies,
            new Set(visited)
          );
        }
      } catch (error: any) {
        // If dependency doesn't exist, it will be caught by other validation logic
        if (!error.message.includes('not found')) {
          throw error;
        }
      }
    }
  },

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
      dependencies: taskData.dependencies || [],
      ...taskData,
    };

    // Validate dependencies exist
    if (task.dependencies && task.dependencies.length > 0) {
      for (const depId of task.dependencies) {
        const depPath = join(teamTasksDir, `${depId}.json`);
        if (!dirExists(depPath)) {
          throw new Error(`Dependency task ${depId} does not exist`);
        }
      }

      // Check for circular dependencies
      TaskOperations.checkCircularDependency(teamName, taskId, task.dependencies);
    }

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
   * Get a single task by ID
   */
  getTask: (teamName: string, taskId: string): Task => {
    const tasksDir = getTasksDir();
    const taskPath = join(tasksDir, teamName, `${taskId}.json`);

    if (!dirExists(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }

    return safeReadJSONSync(taskPath);
  },

  /**
   * Check if all dependencies for a task are completed
   */
  areDependenciesMet: (teamName: string, taskId: string): boolean => {
    const task = TaskOperations.getTask(teamName, taskId);
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    for (const depId of task.dependencies) {
      const dep = TaskOperations.getTask(teamName, depId);
      if (dep.status !== 'completed') {
        return false;
      }
    }

    return true;
  },

  /**
   * Update a task
   */
  updateTask: (teamName: string, taskId: string, updates: Partial<Task>): Task => {
    const tasksDir = getTasksDir();
    const teamTasksDir = join(tasksDir, teamName);
    const taskPath = join(teamTasksDir, `${taskId}.json`);

    if (!dirExists(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }

    const task = safeReadJSONSync(taskPath);

    // If updating dependencies, validate them
    if (updates.dependencies) {
      for (const depId of updates.dependencies) {
        const depPath = join(teamTasksDir, `${depId}.json`);
        if (!dirExists(depPath)) {
          throw new Error(`Dependency task ${depId} does not exist`);
        }
      }

      // Check for circular dependencies
      TaskOperations.checkCircularDependency(teamName, taskId, updates.dependencies);
    }

    const updatedTask: Task = {
      ...task,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    writeJSONSync(taskPath, updatedTask);
    return updatedTask;
  },

  /**
   * Delete a task
   */
  deleteTask: (teamName: string, taskId: string): void => {
    const tasksDir = getTasksDir();
    const taskPath = join(tasksDir, teamName, `${taskId}.json`);

    if (!dirExists(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }

    // Check if any other task depends on this one
    const allTasks = TaskOperations.getTasks(teamName);
    const dependents = allTasks.filter((t) => t.dependencies?.includes(taskId));

    if (dependents.length > 0) {
      throw new Error(
        `Cannot delete task ${taskId} because other tasks depend on it: ${dependents
          .map((t) => t.id)
          .join(', ')}`
      );
    }

    // In a real system we would delete the file, but for now let's just use Bun.spawnSync to rm
    Bun.spawnSync(['rm', taskPath]);
  },

  /**
   * Claim a task (for worker agents)
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

    // Check if dependencies are met
    if (!TaskOperations.areDependenciesMet(teamName, taskId)) {
      throw new Error(`Task ${taskId} cannot be claimed because its dependencies are not met`);
    }

    // Claim the task
    return TaskOperations.updateTask(teamName, taskId, {
      status: 'in_progress',
      owner: currentAgentId,
      claimedAt: new Date().toISOString(),
    });
  },
};
