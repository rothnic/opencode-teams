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
