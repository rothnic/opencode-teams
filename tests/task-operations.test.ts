/**
 * Unit tests for Task Operations
 * Using Bun's built-in test runner
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { TeamOperations } from '../src/operations/team';
import { TaskOperations } from '../src/operations/task';

describe('TaskOperations', () => {
  const testTeamName = `task-test-team-${Date.now()}`;
  let taskId: string;

  beforeAll(() => {
    // Set up test environment
    process.env.OPENCODE_TEAMS_DIR = `/tmp/opencode-teams-test-${Date.now()}`;
    process.env.OPENCODE_AGENT_ID = 'test-agent-1';

    // Create a test team
    TeamOperations.spawnTeam(testTeamName);
  });

  afterAll(() => {
    // Clean up test directory
    TeamOperations.cleanup(testTeamName);
    const testDir = process.env.OPENCODE_TEAMS_DIR;
    if (testDir && testDir.startsWith('/tmp/opencode-teams-test-')) {
      Bun.spawnSync(['rm', '-rf', testDir]);
    }
    delete process.env.OPENCODE_TEAMS_DIR;
    delete process.env.OPENCODE_AGENT_ID;
  });

  describe('createTask', () => {
    it('should create a new task', () => {
      const task = TaskOperations.createTask(testTeamName, {
        title: 'Test Task',
        description: 'This is a test task',
        priority: 'high',
      });

      taskId = task.id; // Save for other tests

      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('This is a test task');
      expect(task.priority).toBe('high');
      expect(task.status).toBe('pending');
      expect(task.createdAt).toBeDefined();
    });

    it('should create task with default values', () => {
      const task = TaskOperations.createTask(testTeamName, {});

      expect(task.title).toBe('Untitled Task');
      expect(task.priority).toBe('normal');
      expect(task.status).toBe('pending');
    });

    it('should throw error for non-existent team', () => {
      expect(() => {
        TaskOperations.createTask('non-existent-team', {});
      }).toThrow('does not exist');
    });
  });

  describe('getTasks', () => {
    it('should return all tasks', () => {
      const tasks = TaskOperations.getTasks(testTeamName);

      expect(tasks).toBeArray();
      expect(tasks.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter tasks by status', () => {
      const tasks = TaskOperations.getTasks(testTeamName, { status: 'pending' });

      expect(tasks).toBeArray();
      tasks.forEach((task) => {
        expect(task.status).toBe('pending');
      });
    });

    it('should return empty array for non-existent team', () => {
      const tasks = TaskOperations.getTasks('non-existent-team');
      expect(tasks).toEqual([]);
    });
  });

  describe('getTask', () => {
    it('should return a single task by ID', () => {
      const task = TaskOperations.getTask(testTeamName, taskId);
      expect(task.id).toBe(taskId);
      expect(task.title).toBeDefined();
    });

    it('should throw error for non-existent task', () => {
      expect(() => {
        TaskOperations.getTask(testTeamName, 'invalid-task-id');
      }).toThrow('not found');
    });
  });

  describe('Dependencies', () => {
    let taskA: string;
    let taskB: string;

    beforeEach(() => {
      taskA = TaskOperations.createTask(testTeamName, { title: 'Task A' }).id;
      taskB = TaskOperations.createTask(testTeamName, { title: 'Task B' }).id;
    });

    it('should create a task with dependencies', () => {
      const taskC = TaskOperations.createTask(testTeamName, {
        title: 'Task C',
        dependencies: [taskA, taskB],
      });

      expect(taskC.dependencies).toContain(taskA);
      expect(taskC.dependencies).toContain(taskB);
    });

    it('should throw error if dependency does not exist', () => {
      expect(() => {
        TaskOperations.createTask(testTeamName, {
          title: 'Task C',
          dependencies: ['non-existent-task'],
        });
      }).toThrow('does not exist');
    });

    it('should detect circular dependencies on update', () => {
      // taskA depends on taskB
      TaskOperations.updateTask(testTeamName, taskA, { dependencies: [taskB] });

      // Try to make taskB depend on taskA
      expect(() => {
        TaskOperations.updateTask(testTeamName, taskB, { dependencies: [taskA] });
      }).toThrow('Circular dependency detected');
    });

    it('should check if dependencies are met', () => {
      const taskC = TaskOperations.createTask(testTeamName, {
        title: 'Task C',
        dependencies: [taskA],
      });

      expect(TaskOperations.areDependenciesMet(testTeamName, taskC.id)).toBe(false);

      // Complete taskA
      TaskOperations.updateTask(testTeamName, taskA, { status: 'completed' });

      expect(TaskOperations.areDependenciesMet(testTeamName, taskC.id)).toBe(true);
    });

    it('should allow claiming with warning if dependencies are not met', () => {
      const taskC = TaskOperations.createTask(testTeamName, {
        title: 'Task C',
        dependencies: [taskA],
      });

      const claimedTask = TaskOperations.claimTask(testTeamName, taskC.id, 'worker-1');
      expect(claimedTask.status).toBe('in_progress');
      expect(claimedTask.warning).toContain('dependencies are not met');

      // Complete taskA
      TaskOperations.updateTask(testTeamName, taskA, { status: 'completed' });

      // If we update it again (e.g. status), the warning should persist if not explicitly cleared
      const taskCInfo = TaskOperations.getTask(testTeamName, taskC.id);
      expect(taskCInfo.status).toBe('in_progress');
    });

    it('should block deletion if other tasks depend on it', () => {
      TaskOperations.createTask(testTeamName, {
        title: 'Task C',
        dependencies: [taskA],
      });

      expect(() => {
        TaskOperations.deleteTask(testTeamName, taskA);
      }).toThrow('other tasks depend on it');
    });

    it('should delete a task with no dependents', () => {
      const taskC = TaskOperations.createTask(testTeamName, { title: 'Task C' });
      TaskOperations.deleteTask(testTeamName, taskC.id);

      expect(() => {
        TaskOperations.getTask(testTeamName, taskC.id);
      }).toThrow('not found');
    });
  });

  describe('updateTask', () => {
    it('should update task fields', () => {
      const updatedTask = TaskOperations.updateTask(testTeamName, taskId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });

      expect(updatedTask.status).toBe('completed');
      expect(updatedTask.completedAt).toBeDefined();
      expect(updatedTask.updatedAt).toBeDefined();
    });

    it('should throw error for non-existent task', () => {
      expect(() => {
        TaskOperations.updateTask(testTeamName, 'invalid-task-id', {});
      }).toThrow('not found');
    });
  });

  describe('claimTask', () => {
    let claimableTaskId: string;

    beforeEach(() => {
      // Create a fresh task for claiming
      const task = TaskOperations.createTask(testTeamName, {
        title: 'Claimable Task',
      });
      claimableTaskId = task.id;
    });

    it('should claim a pending task', () => {
      const claimedTask = TaskOperations.claimTask(testTeamName, claimableTaskId, 'worker-1');

      expect(claimedTask.status).toBe('in_progress');
      expect(claimedTask.owner).toBe('worker-1');
      expect(claimedTask.claimedAt).toBeDefined();
    });

    it('should throw error when claiming non-pending task', () => {
      // First claim
      TaskOperations.claimTask(testTeamName, claimableTaskId, 'worker-1');

      // Try to claim again
      expect(() => {
        TaskOperations.claimTask(testTeamName, claimableTaskId, 'worker-2');
      }).toThrow('is not available');
    });

    it('should throw error for non-existent task', () => {
      expect(() => {
        TaskOperations.claimTask(testTeamName, 'invalid-task-id');
      }).toThrow('not found');
    });
  });
});
