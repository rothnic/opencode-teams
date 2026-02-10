/**
 * Task Operations Module
 *
 * All operations use:
 * - Advisory file locks (via file-lock.ts) for concurrency safety
 * - Atomic writes (via fs-atomic.ts) for crash safety
 * - Zod schemas (via schemas.ts) for runtime validation
 * - Project-specific storage paths (via storage-paths.ts)
 */

import { join } from 'node:path';
import {
  type Task,
  type TaskCreateInput,
  type TaskFilters,
  TaskSchema,
  type TaskStatus,
  TeamConfigSchema,
} from '../types/schemas';
import { withLock } from '../utils/file-lock';
import {
  generateId,
  listJSONFiles,
  readValidatedJSON,
  removeFile,
  writeAtomicJSON,
} from '../utils/fs-atomic';
import {
  dirExists,
  fileExists,
  getTaskFilePath,
  getTaskLockPath,
  getTeamConfigPath,
  getTeamTasksDir,
} from '../utils/storage-paths';
import { EventBus } from './event-bus';
import { getAgentRole } from './role-permissions';
import { WorkflowMonitor } from './workflow-monitor';

/**
 * Forward-only status transitions (FR-011).
 * pending -> in_progress -> completed. No backward transitions.
 */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress'],
  in_progress: ['completed'],
  completed: [], // terminal state
};

/**
 * Task coordination operations
 */
export const TaskOperations = {
  /**
   * Check for circular dependencies using iterative BFS.
   * Also considers pending edges not yet written to disk.
   */
  checkCircularDependency: (
    teamName: string,
    taskId: string,
    dependencies: string[],
    _visited = new Set<string>(),
  ): void => {
    const teamTasksDir = getTeamTasksDir(teamName);

    // BFS: starting from each dependency, walk its dependencies.
    // If we reach taskId, we have a cycle.
    const queue = [...dependencies];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current === taskId) {
        throw new Error(`Circular dependency detected: ${current}`);
      }

      if (visited.has(current)) continue;
      visited.add(current);

      // Read the current task's dependencies
      const depFilePath = join(teamTasksDir, `${current}.json`);
      if (!fileExists(depFilePath)) continue;

      try {
        const depTask = readValidatedJSON(depFilePath, TaskSchema);
        if (depTask.dependencies && depTask.dependencies.length > 0) {
          for (const dep of depTask.dependencies) {
            if (!visited.has(dep)) {
              queue.push(dep);
            }
          }
        }
      } catch {
        // If task can't be read, skip it in cycle detection
      }
    }
  },

  /**
   * Create a new task (locked write)
   */
  createTask: (teamName: string, taskData: Partial<TaskCreateInput>): Task => {
    // Verify team exists by checking for team config file
    const configPath = getTeamConfigPath(teamName);
    if (!fileExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    getTeamTasksDir(teamName); // ensure dir exists
    const lockPath = getTaskLockPath(teamName);

    return withLock(lockPath, () => {
      const taskId = generateId();
      const now = new Date().toISOString();

      const task: Task = {
        id: taskId,
        title: taskData.title || 'Untitled Task',
        description: taskData.description,
        priority: taskData.priority || 'normal',
        status: 'pending',
        createdAt: now,
        dependencies: taskData.dependencies || [],
        blocks: [],
      };

      // Validate dependencies exist
      if (task.dependencies.length > 0) {
        for (const depId of task.dependencies) {
          const depPath = getTaskFilePath(teamName, depId);
          if (!fileExists(depPath)) {
            throw new Error(`Dependency task ${depId} does not exist`);
          }
        }

        // Check for circular dependencies
        TaskOperations.checkCircularDependency(teamName, taskId, task.dependencies);
      }

      // Validate and write atomically
      const taskPath = getTaskFilePath(teamName, taskId);
      writeAtomicJSON(taskPath, task, TaskSchema);

      EventBus.emit({
        id: globalThis.crypto.randomUUID(),
        type: 'task.created',
        teamName,
        timestamp: new Date().toISOString(),
        payload: { taskId: task.id, title: task.title, priority: task.priority },
      });

      // Sync blocks: add this task to each dependency's blocks array (FR-009)
      if (task.dependencies.length > 0) {
        for (const depId of task.dependencies) {
          const depPath = getTaskFilePath(teamName, depId);
          const depTask = readValidatedJSON(depPath, TaskSchema);
          if (!depTask.blocks.includes(taskId)) {
            writeAtomicJSON(
              depPath,
              { ...depTask, blocks: [...depTask.blocks, taskId] },
              TaskSchema,
            );
          }
        }
      }

      return task;
    });
  },

  /**
   * Get tasks for a team with optional filters (locked read)
   */
  getTasks: (teamName: string, filters: TaskFilters = {}): Task[] => {
    const teamTasksDir = getTeamTasksDir(teamName);
    const lockPath = getTaskLockPath(teamName);

    if (!dirExists(teamTasksDir)) {
      return [];
    }

    return withLock(
      lockPath,
      () => {
        const tasks: Task[] = [];
        const files = listJSONFiles(teamTasksDir);

        for (const file of files) {
          const taskPath = join(teamTasksDir, file);
          try {
            const task = readValidatedJSON(taskPath, TaskSchema);

            // Apply filters
            if (filters.status && task.status !== filters.status) continue;
            if (filters.owner && task.owner !== filters.owner) continue;

            tasks.push(task);
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`Warning: Could not read task ${file}: ${msg}`);
          }
        }

        return tasks;
      },
      false, // shared lock for reads
    );
  },

  /**
   * Get a single task by ID (locked read)
   */
  getTask: (teamName: string, taskId: string): Task => {
    const taskPath = getTaskFilePath(teamName, taskId);
    const lockPath = getTaskLockPath(teamName);

    if (!fileExists(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }

    return withLock(lockPath, () => readValidatedJSON(taskPath, TaskSchema), false);
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
      try {
        const dep = TaskOperations.getTask(teamName, depId);
        if (dep.status !== 'completed') {
          return false;
        }
      } catch {
        // If dependency doesn't exist, treat as not met
        return false;
      }
    }

    return true;
  },

  /**
   * Update a task (locked read-modify-write)
   */
  updateTask: (teamName: string, taskId: string, updates: Partial<Task>): Task => {
    const taskPath = getTaskFilePath(teamName, taskId);
    const lockPath = getTaskLockPath(teamName);

    if (!fileExists(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }

    const result = withLock(lockPath, () => {
      const task = readValidatedJSON(taskPath, TaskSchema);

      // If updating dependencies, validate them
      if (updates.dependencies) {
        for (const depId of updates.dependencies) {
          const depPath = getTaskFilePath(teamName, depId);
          if (!fileExists(depPath)) {
            throw new Error(`Dependency task ${depId} does not exist`);
          }
        }

        // Check for circular dependencies
        TaskOperations.checkCircularDependency(teamName, taskId, updates.dependencies);

        // Sync blocks on affected dependency targets (FR-009)
        const oldDeps = new Set(task.dependencies);
        const newDeps = new Set(updates.dependencies);

        for (const oldDepId of oldDeps) {
          if (!newDeps.has(oldDepId)) {
            const oldDepPath = getTaskFilePath(teamName, oldDepId);
            if (fileExists(oldDepPath)) {
              try {
                const oldDep = readValidatedJSON(oldDepPath, TaskSchema);
                if (oldDep.blocks.includes(taskId)) {
                  writeAtomicJSON(
                    oldDepPath,
                    {
                      ...oldDep,
                      blocks: oldDep.blocks.filter((id: string) => id !== taskId),
                    },
                    TaskSchema,
                  );
                }
              } catch {
                /* skip unreadable */
              }
            }
          }
        }

        for (const newDepId of newDeps) {
          if (!oldDeps.has(newDepId)) {
            const newDepPath = getTaskFilePath(teamName, newDepId);
            if (fileExists(newDepPath)) {
              try {
                const newDep = readValidatedJSON(newDepPath, TaskSchema);
                if (!newDep.blocks.includes(taskId)) {
                  writeAtomicJSON(
                    newDepPath,
                    { ...newDep, blocks: [...newDep.blocks, taskId] },
                    TaskSchema,
                  );
                }
              } catch {
                /* skip unreadable */
              }
            }
          }
        }
      }

      // Validate status transition (FR-011: forward-only)
      if (updates.status && updates.status !== task.status) {
        const allowed = VALID_TRANSITIONS[task.status];
        if (!allowed.includes(updates.status)) {
          throw new Error(`Invalid status transition: ${task.status} -> ${updates.status}`);
        }
      }

      const updatedTask: Task = {
        ...task,
        ...updates,
        id: task.id, // ID cannot be changed
        createdAt: task.createdAt, // createdAt cannot be changed
        updatedAt: new Date().toISOString(),
      };

      writeAtomicJSON(taskPath, updatedTask, TaskSchema);

      if (updates.status === 'completed') {
        EventBus.emit({
          id: globalThis.crypto.randomUUID(),
          type: 'task.completed',
          teamName,
          timestamp: new Date().toISOString(),
          payload: { taskId, title: updatedTask.title },
        });

        const allTasks = TaskOperations.getTasks(teamName);
        for (const t of allTasks) {
          if (t.dependencies.includes(taskId) && t.status === 'pending') {
            const allDepsComplete = t.dependencies.every((depId) => {
              const dep = allTasks.find((d) => d.id === depId);
              return dep?.status === 'completed';
            });
            if (allDepsComplete) {
              EventBus.emit({
                id: globalThis.crypto.randomUUID(),
                type: 'task.unblocked',
                teamName,
                timestamp: new Date().toISOString(),
                payload: { taskId: t.id, title: t.title },
              });
            }
          }
        }
      }

      // Cascade unblock on completion (FR-010)
      if (updatedTask.status === 'completed' && task.status !== 'completed') {
        const teamTasksDir = getTeamTasksDir(teamName);
        const files = listJSONFiles(teamTasksDir);

        for (const file of files) {
          const otherTaskPath = join(teamTasksDir, file);
          try {
            const otherTask = readValidatedJSON(otherTaskPath, TaskSchema);
            if (otherTask.id === taskId) continue;

            let modified = false;

            if (otherTask.dependencies.includes(taskId)) {
              otherTask.dependencies = otherTask.dependencies.filter((id: string) => id !== taskId);
              modified = true;

              if (
                otherTask.dependencies.length === 0 &&
                otherTask.warning?.includes('dependencies are not met')
              ) {
                otherTask.warning = undefined;
              }
            }

            if (otherTask.blocks.includes(taskId)) {
              otherTask.blocks = otherTask.blocks.filter((id: string) => id !== taskId);
              modified = true;
            }

            if (modified) {
              writeAtomicJSON(otherTaskPath, otherTask, TaskSchema);
            }
          } catch {
            // Skip unreadable tasks during cascade
          }
        }
      }

      return updatedTask;
    });

    if (updates.status === 'completed') {
      try {
        const suggestion = WorkflowMonitor.evaluate(teamName);
        if (suggestion) {
          WorkflowMonitor.emitSuggestion(teamName, suggestion);
        }
      } catch {
        // Non-fatal: workflow check must not fail task update
      }
    }

    return result;
  },

  /**
   * Delete a task (locked)
   */
  deleteTask: (teamName: string, taskId: string): void => {
    const taskPath = getTaskFilePath(teamName, taskId);
    const lockPath = getTaskLockPath(teamName);

    if (!fileExists(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }

    withLock(lockPath, () => {
      // Check if any other task depends on this one
      const teamTasksDir = getTeamTasksDir(teamName);
      const files = listJSONFiles(teamTasksDir);

      const taskToDelete = readValidatedJSON(taskPath, TaskSchema);

      for (const file of files) {
        const otherTaskPath = join(teamTasksDir, file);
        try {
          const otherTask = readValidatedJSON(otherTaskPath, TaskSchema);
          if (otherTask.id !== taskId && otherTask.dependencies?.includes(taskId)) {
            throw new Error(
              `Cannot delete task ${taskId} because task ${otherTask.id} depends on it`,
            );
          }
        } catch (err: unknown) {
          // Re-throw dependency errors, skip read errors
          if (err instanceof Error && err.message.includes('Cannot delete')) {
            throw err;
          }
        }
      }

      // Clean up: remove this task from its dependencies' blocks arrays (FR-009)
      for (const depId of taskToDelete.dependencies) {
        const depPath = getTaskFilePath(teamName, depId);
        if (fileExists(depPath)) {
          try {
            const depTask = readValidatedJSON(depPath, TaskSchema);
            if (depTask.blocks.includes(taskId)) {
              writeAtomicJSON(
                depPath,
                {
                  ...depTask,
                  blocks: depTask.blocks.filter((id: string) => id !== taskId),
                },
                TaskSchema,
              );
            }
          } catch {
            // If dependency can't be read, skip cleanup
          }
        }
      }

      removeFile(taskPath);
    });
  },

  /**
   * Claim a task (locked read-modify-write with soft blocking)
   */
  /**
   * Reassign all in_progress tasks owned by a terminated/inactive agent
   * back to pending status. This is a special backward transition allowed
   * only through this method (FR-008).
   *
   * @returns Array of reassigned task IDs
   */
  reassignAgentTasks: (teamName: string, agentId: string, projectRoot?: string): string[] => {
    const teamTasksDir = getTeamTasksDir(teamName, projectRoot);
    const lockPath = getTaskLockPath(teamName, projectRoot);

    if (!dirExists(teamTasksDir)) {
      return [];
    }

    return withLock(lockPath, () => {
      const reassigned: string[] = [];
      const files = listJSONFiles(teamTasksDir);

      for (const file of files) {
        const taskPath = join(teamTasksDir, file);
        try {
          const task = readValidatedJSON(taskPath, TaskSchema);

          // Only reassign in_progress tasks owned by this agent
          if (task.status === 'in_progress' && task.owner === agentId) {
            const updated = {
              ...task,
              status: 'pending' as const,
              owner: undefined,
              claimedAt: undefined,
              updatedAt: new Date().toISOString(),
              warning: `Reassigned: previous owner ${agentId} terminated`,
            };
            writeAtomicJSON(taskPath, updated, TaskSchema);
            reassigned.push(task.id);
          }
        } catch {
          // Skip unreadable tasks
        }
      }

      return reassigned;
    });
  },

  claimTask: (teamName: string, taskId: string, agentId?: string): Task => {
    const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';
    const taskPath = getTaskFilePath(teamName, taskId);
    const lockPath = getTaskLockPath(teamName);

    if (!fileExists(taskPath)) {
      throw new Error(`Task ${taskId} not found in team ${teamName}`);
    }

    const teamConfigPath = getTeamConfigPath(teamName);
    if (fileExists(teamConfigPath)) {
      try {
        const teamConfig = readValidatedJSON(teamConfigPath, TeamConfigSchema);
        if (teamConfig.topology === 'hierarchical') {
          if (currentAgentId !== teamConfig.leader) {
            const role = getAgentRole(currentAgentId);
            if (role !== 'leader' && role !== 'task-manager') {
              throw new Error(
                'Hierarchical topology: only leader or task-manager can assign tasks. ' +
                  'Request task assignment via message to the leader.',
              );
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('Hierarchical topology')) throw e;
      }
    }

    return withLock(lockPath, () => {
      const task = readValidatedJSON(taskPath, TaskSchema);

      // Check if task is still available
      if (task.status !== 'pending') {
        throw new Error(`Task ${taskId} is not available (status: ${task.status})`);
      }

      const now = new Date().toISOString();
      const updatedTask: Task = {
        ...task,
        status: 'in_progress',
        owner: currentAgentId,
        claimedAt: now,
        updatedAt: now,
      };

      // Check if dependencies are met (soft blocking: warn but allow)
      if (task.dependencies && task.dependencies.length > 0) {
        let allMet = true;
        for (const depId of task.dependencies) {
          try {
            const depPath = getTaskFilePath(teamName, depId);
            if (fileExists(depPath)) {
              const dep = readValidatedJSON(depPath, TaskSchema);
              if (dep.status !== 'completed') {
                allMet = false;
                break;
              }
            } else {
              allMet = false;
              break;
            }
          } catch {
            allMet = false;
            break;
          }
        }

        if (!allMet) {
          updatedTask.warning = `Warning: Task ${taskId} dependencies are not met. Proceed with caution.`;
        }
      }

      writeAtomicJSON(taskPath, updatedTask, TaskSchema);
      return updatedTask;
    });
  },
};
