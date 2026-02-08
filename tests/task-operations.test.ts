/**
 * Comprehensive tests for TaskOperations
 *
 * Each test uses an isolated temp directory via mkdtempSync.
 * A team is created in each test's beforeEach to provide task storage.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TeamOperations } from '../src/operations/team';
import { TaskOperations } from '../src/operations/task';
import { TaskSchema } from '../src/types/schemas';

describe('TaskOperations', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};
  const teamName = 'test-team';

  beforeEach(() => {
    savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
    savedEnv.OPENCODE_AGENT_ID = process.env.OPENCODE_AGENT_ID;
    savedEnv.OPENCODE_AGENT_NAME = process.env.OPENCODE_AGENT_NAME;
    savedEnv.OPENCODE_AGENT_TYPE = process.env.OPENCODE_AGENT_TYPE;

    tempDir = mkdtempSync(join(tmpdir(), 'opencode-tasks-test-'));
    process.env.OPENCODE_TEAMS_DIR = tempDir;
    delete process.env.OPENCODE_AGENT_ID;
    delete process.env.OPENCODE_AGENT_NAME;
    delete process.env.OPENCODE_AGENT_TYPE;

    // Create a team for task operations
    TeamOperations.spawnTeam(teamName, {
      agentId: 'leader-1',
      agentName: 'Leader',
      agentType: 'leader',
    });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  // ─── createTask ─────────────────────────────────────────────────────────────

  describe('createTask', () => {
    it('creates task with default values', () => {
      const task = TaskOperations.createTask(teamName, {});

      expect(task.id).toBeTruthy();
      expect(task.title).toBe('Untitled Task');
      expect(task.priority).toBe('normal');
      expect(task.status).toBe('pending');
      expect(task.createdAt).toBeTruthy();
      expect(task.dependencies).toEqual([]);
      expect(task.owner).toBeUndefined();
    });

    it('creates task with all fields specified', () => {
      const task = TaskOperations.createTask(teamName, {
        title: 'Full Task',
        description: 'A detailed description',
        priority: 'high',
        dependencies: [],
      });

      expect(task.title).toBe('Full Task');
      expect(task.description).toBe('A detailed description');
      expect(task.priority).toBe('high');
      expect(task.status).toBe('pending');
      expect(task.createdAt).toBeTruthy();
      expect(task.dependencies).toEqual([]);
    });

    it('creates task with valid dependencies', () => {
      const taskA = TaskOperations.createTask(teamName, { title: 'Dependency' });
      const taskB = TaskOperations.createTask(teamName, {
        title: 'Dependent',
        dependencies: [taskA.id],
      });

      expect(taskB.dependencies).toContain(taskA.id);
      expect(taskB.dependencies).toHaveLength(1);
    });

    it('persists task to disk and passes Zod validation', () => {
      const task = TaskOperations.createTask(teamName, {
        title: 'Disk Task',
        priority: 'low',
      });

      const taskPath = join(tempDir, 'tasks', teamName, `${task.id}.json`);
      expect(existsSync(taskPath)).toBe(true);

      const raw = JSON.parse(readFileSync(taskPath, 'utf8'));
      const result = TaskSchema.safeParse(raw);
      expect(result.success).toBe(true);
    });

    it('throws when team does not exist', () => {
      // NOTE: getTeamTasksDir auto-creates the directory via ensureDir,
      // making the dirExists check in createTask a dead code path.
      // This test documents the intended behavior. If it fails, it reveals
      // that the implementation needs to check for team existence differently
      // (e.g., check for team config.json instead of the tasks directory).
      expect(() => {
        TaskOperations.createTask('nonexistent-team', { title: 'Orphan' });
      }).toThrow('does not exist');
    });

    it('throws when dependency task does not exist', () => {
      expect(() => {
        TaskOperations.createTask(teamName, {
          title: 'Bad Deps',
          dependencies: ['fake-task-id-999'],
        });
      }).toThrow('does not exist');
    });

    it('throws on circular dependency via updateTask', () => {
      // Circular dependency detection in createTask is unreachable because
      // a new task's generated ID can't be in any existing dependency chain.
      // Test the mechanism through updateTask instead, where it is effective.
      const taskA = TaskOperations.createTask(teamName, { title: 'A' });
      const taskB = TaskOperations.createTask(teamName, {
        title: 'B',
        dependencies: [taskA.id],
      });

      // Make A depend on B, creating A -> B -> A cycle
      expect(() => {
        TaskOperations.updateTask(teamName, taskA.id, { dependencies: [taskB.id] });
      }).toThrow('Circular dependency');
    });

    it('generates unique IDs for each task', () => {
      const task1 = TaskOperations.createTask(teamName, { title: 'One' });
      const task2 = TaskOperations.createTask(teamName, { title: 'Two' });
      const task3 = TaskOperations.createTask(teamName, { title: 'Three' });

      expect(task1.id).not.toBe(task2.id);
      expect(task2.id).not.toBe(task3.id);
      expect(task1.id).not.toBe(task3.id);
    });
  });

  // ─── getTasks ───────────────────────────────────────────────────────────────

  describe('getTasks', () => {
    it('returns all tasks for a team', () => {
      TaskOperations.createTask(teamName, { title: 'Task A' });
      TaskOperations.createTask(teamName, { title: 'Task B' });
      TaskOperations.createTask(teamName, { title: 'Task C' });

      const tasks = TaskOperations.getTasks(teamName);
      expect(tasks).toHaveLength(3);
    });

    it('filters by status', () => {
      const task1 = TaskOperations.createTask(teamName, { title: 'Pending' });
      const task2 = TaskOperations.createTask(teamName, { title: 'Will Claim' });
      TaskOperations.claimTask(teamName, task2.id, 'worker-1');

      const pendingTasks = TaskOperations.getTasks(teamName, { status: 'pending' });
      expect(pendingTasks).toHaveLength(1);
      expect(pendingTasks[0].id).toBe(task1.id);

      const inProgressTasks = TaskOperations.getTasks(teamName, { status: 'in_progress' });
      expect(inProgressTasks).toHaveLength(1);
      expect(inProgressTasks[0].id).toBe(task2.id);
    });

    it('filters by owner', () => {
      const task1 = TaskOperations.createTask(teamName, { title: 'Owned' });
      TaskOperations.createTask(teamName, { title: 'Unowned' });
      TaskOperations.claimTask(teamName, task1.id, 'worker-1');

      const ownedTasks = TaskOperations.getTasks(teamName, { owner: 'worker-1' });
      expect(ownedTasks).toHaveLength(1);
      expect(ownedTasks[0].owner).toBe('worker-1');
    });

    it('returns empty array for non-existent team', () => {
      // getTasks returns [] if directory doesn't exist (after getTeamTasksDir creates it)
      // The behavior is that it returns [] since there are no .json files
      const tasks = TaskOperations.getTasks('brand-new-team');
      expect(tasks).toEqual([]);
    });

    it('combines status and owner filters', () => {
      const task1 = TaskOperations.createTask(teamName, { title: 'Task 1' });
      const task2 = TaskOperations.createTask(teamName, { title: 'Task 2' });
      TaskOperations.claimTask(teamName, task1.id, 'agent-a');
      TaskOperations.claimTask(teamName, task2.id, 'agent-b');

      const filtered = TaskOperations.getTasks(teamName, {
        status: 'in_progress',
        owner: 'agent-a',
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(task1.id);
    });
  });

  // ─── getTask ────────────────────────────────────────────────────────────────

  describe('getTask', () => {
    it('returns task by ID', () => {
      const created = TaskOperations.createTask(teamName, {
        title: 'Lookup Task',
        description: 'Find me',
        priority: 'high',
      });

      const fetched = TaskOperations.getTask(teamName, created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.title).toBe('Lookup Task');
      expect(fetched.description).toBe('Find me');
      expect(fetched.priority).toBe('high');
      expect(fetched.status).toBe('pending');
    });

    it('throws for non-existent task', () => {
      expect(() => {
        TaskOperations.getTask(teamName, 'invalid-task-id');
      }).toThrow('not found');
    });
  });

  // ─── areDependenciesMet ─────────────────────────────────────────────────────

  describe('areDependenciesMet', () => {
    it('returns true when task has no dependencies', () => {
      const task = TaskOperations.createTask(teamName, { title: 'No deps' });
      expect(TaskOperations.areDependenciesMet(teamName, task.id)).toBe(true);
    });

    it('returns true when all dependencies are completed', () => {
      const depA = TaskOperations.createTask(teamName, { title: 'Dep A' });
      const depB = TaskOperations.createTask(teamName, { title: 'Dep B' });
      const task = TaskOperations.createTask(teamName, {
        title: 'Dependent',
        dependencies: [depA.id, depB.id],
      });

      // Initially not met
      expect(TaskOperations.areDependenciesMet(teamName, task.id)).toBe(false);

      // Complete both dependencies
      TaskOperations.updateTask(teamName, depA.id, { status: 'completed' });
      TaskOperations.updateTask(teamName, depB.id, { status: 'completed' });

      expect(TaskOperations.areDependenciesMet(teamName, task.id)).toBe(true);
    });

    it('returns false when some dependencies are not completed', () => {
      const depA = TaskOperations.createTask(teamName, { title: 'Dep A' });
      const depB = TaskOperations.createTask(teamName, { title: 'Dep B' });
      const task = TaskOperations.createTask(teamName, {
        title: 'Dependent',
        dependencies: [depA.id, depB.id],
      });

      // Complete only one
      TaskOperations.updateTask(teamName, depA.id, { status: 'completed' });

      expect(TaskOperations.areDependenciesMet(teamName, task.id)).toBe(false);
    });

    it('returns false when dependency is in_progress', () => {
      const dep = TaskOperations.createTask(teamName, { title: 'Dep' });
      const task = TaskOperations.createTask(teamName, {
        title: 'Dependent',
        dependencies: [dep.id],
      });

      TaskOperations.claimTask(teamName, dep.id, 'worker-1');

      expect(TaskOperations.areDependenciesMet(teamName, task.id)).toBe(false);
    });
  });

  // ─── updateTask ─────────────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('updates task fields', () => {
      const task = TaskOperations.createTask(teamName, {
        title: 'Original',
        priority: 'normal',
      });

      const updated = TaskOperations.updateTask(teamName, task.id, {
        title: 'Updated Title',
        priority: 'high',
        status: 'completed',
        completedAt: new Date().toISOString(),
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.priority).toBe('high');
      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeTruthy();
    });

    it('validates dependency updates', () => {
      const depA = TaskOperations.createTask(teamName, { title: 'Dep A' });
      const task = TaskOperations.createTask(teamName, { title: 'Main Task' });

      const updated = TaskOperations.updateTask(teamName, task.id, {
        dependencies: [depA.id],
      });

      expect(updated.dependencies).toContain(depA.id);
    });

    it('throws for non-existent dependency in update', () => {
      const task = TaskOperations.createTask(teamName, { title: 'Task' });

      expect(() => {
        TaskOperations.updateTask(teamName, task.id, {
          dependencies: ['non-existent-dep'],
        });
      }).toThrow('does not exist');
    });

    it('throws for non-existent task', () => {
      expect(() => {
        TaskOperations.updateTask(teamName, 'invalid-task-id', { title: 'Nope' });
      }).toThrow('not found');
    });

    it('sets updatedAt timestamp', () => {
      const task = TaskOperations.createTask(teamName, { title: 'Timestamp Test' });
      expect(task.updatedAt).toBeUndefined();

      const beforeUpdate = new Date().toISOString();
      const updated = TaskOperations.updateTask(teamName, task.id, { title: 'Changed' });

      expect(updated.updatedAt).toBeTruthy();
      expect(updated.updatedAt! >= beforeUpdate).toBe(true);
    });

    it('preserves id and createdAt even if passed in updates', () => {
      const task = TaskOperations.createTask(teamName, { title: 'Immutable Fields' });
      const originalId = task.id;
      const originalCreatedAt = task.createdAt;

      const updated = TaskOperations.updateTask(teamName, task.id, {
        id: 'hacked-id',
        createdAt: '2000-01-01T00:00:00.000Z',
        title: 'New Title',
      } as any);

      expect(updated.id).toBe(originalId);
      expect(updated.createdAt).toBe(originalCreatedAt);
      expect(updated.title).toBe('New Title');
    });

    it('detects circular dependencies on update', () => {
      const taskA = TaskOperations.createTask(teamName, { title: 'A' });
      const taskB = TaskOperations.createTask(teamName, { title: 'B' });
      const taskC = TaskOperations.createTask(teamName, { title: 'C' });

      // A -> B -> C chain
      TaskOperations.updateTask(teamName, taskA.id, { dependencies: [taskB.id] });
      TaskOperations.updateTask(teamName, taskB.id, { dependencies: [taskC.id] });

      // Try to make C depend on A, creating A -> B -> C -> A cycle
      expect(() => {
        TaskOperations.updateTask(teamName, taskC.id, { dependencies: [taskA.id] });
      }).toThrow('Circular dependency');
    });
  });

  // ─── deleteTask ─────────────────────────────────────────────────────────────

  describe('deleteTask', () => {
    it('deletes task file from disk', () => {
      const task = TaskOperations.createTask(teamName, { title: 'Delete Me' });

      const taskPath = join(tempDir, 'tasks', teamName, `${task.id}.json`);
      expect(existsSync(taskPath)).toBe(true);

      TaskOperations.deleteTask(teamName, task.id);
      expect(existsSync(taskPath)).toBe(false);
    });

    it('throws when other tasks depend on it', () => {
      const dep = TaskOperations.createTask(teamName, { title: 'Dependency' });
      TaskOperations.createTask(teamName, {
        title: 'Dependent',
        dependencies: [dep.id],
      });

      expect(() => {
        TaskOperations.deleteTask(teamName, dep.id);
      }).toThrow('Cannot delete');
    });

    it('throws for non-existent task', () => {
      expect(() => {
        TaskOperations.deleteTask(teamName, 'does-not-exist');
      }).toThrow('not found');
    });

    it('allows deletion after dependent tasks are removed', () => {
      const dep = TaskOperations.createTask(teamName, { title: 'Dependency' });
      const dependent = TaskOperations.createTask(teamName, {
        title: 'Dependent',
        dependencies: [dep.id],
      });

      // Can't delete dep yet
      expect(() => {
        TaskOperations.deleteTask(teamName, dep.id);
      }).toThrow('Cannot delete');

      // Delete the dependent first
      TaskOperations.deleteTask(teamName, dependent.id);

      // Now dep can be deleted
      expect(() => {
        TaskOperations.deleteTask(teamName, dep.id);
      }).not.toThrow();
    });

    it('deleted task is no longer returned by getTask', () => {
      const task = TaskOperations.createTask(teamName, { title: 'Gone' });
      TaskOperations.deleteTask(teamName, task.id);

      expect(() => {
        TaskOperations.getTask(teamName, task.id);
      }).toThrow('not found');
    });
  });

  // ─── claimTask ──────────────────────────────────────────────────────────────

  describe('claimTask', () => {
    it('claims pending task and sets owner and status to in_progress', () => {
      const task = TaskOperations.createTask(teamName, { title: 'Claim Me' });

      const claimed = TaskOperations.claimTask(teamName, task.id, 'worker-1');

      expect(claimed.status).toBe('in_progress');
      expect(claimed.owner).toBe('worker-1');
      expect(claimed.claimedAt).toBeTruthy();
      expect(claimed.updatedAt).toBeTruthy();
    });

    it('throws when task is not pending', () => {
      const task = TaskOperations.createTask(teamName, { title: 'Already Claimed' });
      TaskOperations.claimTask(teamName, task.id, 'worker-1');

      expect(() => {
        TaskOperations.claimTask(teamName, task.id, 'worker-2');
      }).toThrow('is not available');
    });

    it('throws for non-existent task', () => {
      expect(() => {
        TaskOperations.claimTask(teamName, 'ghost-task-id', 'worker-1');
      }).toThrow('not found');
    });

    it('adds warning when dependencies are not met (soft blocking)', () => {
      const dep = TaskOperations.createTask(teamName, { title: 'Unfinished Dep' });
      const task = TaskOperations.createTask(teamName, {
        title: 'Dependent Task',
        dependencies: [dep.id],
      });

      // Claim despite unmet dependencies (soft blocking)
      const claimed = TaskOperations.claimTask(teamName, task.id, 'worker-1');

      expect(claimed.status).toBe('in_progress');
      expect(claimed.warning).toBeTruthy();
      expect(claimed.warning).toContain('dependencies are not met');
    });

    it('does not add warning when all dependencies are met', () => {
      const dep = TaskOperations.createTask(teamName, { title: 'Finished Dep' });
      TaskOperations.updateTask(teamName, dep.id, { status: 'completed' });

      const task = TaskOperations.createTask(teamName, {
        title: 'Ready Task',
        dependencies: [dep.id],
      });

      const claimed = TaskOperations.claimTask(teamName, task.id, 'worker-1');
      expect(claimed.status).toBe('in_progress');
      expect(claimed.warning).toBeUndefined();
    });

    it('uses OPENCODE_AGENT_ID as default owner when no agentId provided', () => {
      process.env.OPENCODE_AGENT_ID = 'env-agent';

      const task = TaskOperations.createTask(teamName, { title: 'Default Owner' });
      const claimed = TaskOperations.claimTask(teamName, task.id);

      expect(claimed.owner).toBe('env-agent');
    });

    it('persists claimed state to disk', () => {
      const task = TaskOperations.createTask(teamName, { title: 'Persist Claim' });
      TaskOperations.claimTask(teamName, task.id, 'worker-1');

      // Re-read from disk
      const fromDisk = TaskOperations.getTask(teamName, task.id);
      expect(fromDisk.status).toBe('in_progress');
      expect(fromDisk.owner).toBe('worker-1');
      expect(fromDisk.claimedAt).toBeTruthy();
    });
  });

  // ─── Concurrent writes (claim-once semantics) ──────────────────────────────

  describe('concurrent writes', () => {
    it('concurrent claim attempts result in exactly one success', async () => {
      const task = TaskOperations.createTask(teamName, { title: 'Concurrent Test' });

      // Launch 10 concurrent claim attempts via microtasks.
      // Since claimTask is synchronous, microtasks execute sequentially in
      // the single-threaded JS event loop. The first claim transitions the
      // task to in_progress; all subsequent claims fail because the task
      // is no longer pending. This tests claim-once idempotency.
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          Promise.resolve().then(() => TaskOperations.claimTask(teamName, task.id, `agent-${i}`))
        )
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(9);

      // Verify final task state is consistent
      const finalTask = TaskOperations.getTask(teamName, task.id);
      expect(finalTask.status).toBe('in_progress');
      expect(finalTask.owner).toBeTruthy();
      expect(finalTask.owner).toStartWith('agent-');
    });

    it('concurrent updates do not lose data', async () => {
      // Create multiple tasks and update them concurrently
      const tasks = Array.from({ length: 5 }, (_, i) =>
        TaskOperations.createTask(teamName, { title: `Task ${i}` })
      );

      // Claim all tasks concurrently
      const results = await Promise.allSettled(
        tasks.map((task, i) =>
          Promise.resolve().then(() => TaskOperations.claimTask(teamName, task.id, `agent-${i}`))
        )
      );

      // All claims should succeed since they target different tasks
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(5);

      // Verify each task has the correct owner
      for (let i = 0; i < tasks.length; i++) {
        const finalTask = TaskOperations.getTask(teamName, tasks[i].id);
        expect(finalTask.status).toBe('in_progress');
        expect(finalTask.owner).toBe(`agent-${i}`);
      }
    });

    it('rapid sequential updates maintain data integrity', () => {
      const task = TaskOperations.createTask(teamName, { title: 'Rapid Updates' });

      // Perform many sequential updates
      for (let i = 0; i < 20; i++) {
        TaskOperations.updateTask(teamName, task.id, {
          title: `Update ${i}`,
          description: `Description after update ${i}`,
        });
      }

      const finalTask = TaskOperations.getTask(teamName, task.id);
      expect(finalTask.title).toBe('Update 19');
      expect(finalTask.description).toBe('Description after update 19');
      expect(finalTask.id).toBe(task.id);
      expect(finalTask.createdAt).toBe(task.createdAt);
    });
  });

  // ─── checkCircularDependency ────────────────────────────────────────────────

  describe('checkCircularDependency', () => {
    it('does not throw for valid dependency chains', () => {
      const taskA = TaskOperations.createTask(teamName, { title: 'A' });
      const taskB = TaskOperations.createTask(teamName, { title: 'B' });
      const taskC = TaskOperations.createTask(teamName, { title: 'C' });

      // A -> B -> C (linear chain, no cycles)
      expect(() => {
        TaskOperations.checkCircularDependency(teamName, taskA.id, [taskB.id]);
      }).not.toThrow();

      TaskOperations.updateTask(teamName, taskB.id, { dependencies: [taskC.id] });

      // A still depends on B which depends on C - no cycle
      expect(() => {
        TaskOperations.checkCircularDependency(teamName, taskA.id, [taskB.id]);
      }).not.toThrow();
    });

    it('throws for direct circular dependency', () => {
      const taskA = TaskOperations.createTask(teamName, { title: 'A' });
      const taskB = TaskOperations.createTask(teamName, {
        title: 'B',
        dependencies: [taskA.id],
      });

      // Trying to make A depend on B creates A -> B -> A
      expect(() => {
        TaskOperations.checkCircularDependency(teamName, taskA.id, [taskB.id]);
      }).toThrow('Circular dependency');
    });

    it('throws for indirect circular dependency', () => {
      const taskA = TaskOperations.createTask(teamName, { title: 'A' });
      const taskB = TaskOperations.createTask(teamName, {
        title: 'B',
        dependencies: [taskA.id],
      });
      const taskC = TaskOperations.createTask(teamName, {
        title: 'C',
        dependencies: [taskB.id],
      });

      // Trying to make A depend on C creates A -> C -> B -> A
      expect(() => {
        TaskOperations.checkCircularDependency(teamName, taskA.id, [taskC.id]);
      }).toThrow('Circular dependency');
    });
  });

  // ─── Integration: full task lifecycle ───────────────────────────────────────

  describe('full task lifecycle', () => {
    it('create -> claim -> complete -> delete', () => {
      // Create
      const task = TaskOperations.createTask(teamName, {
        title: 'Lifecycle Task',
        priority: 'high',
      });
      expect(task.status).toBe('pending');

      // Claim
      const claimed = TaskOperations.claimTask(teamName, task.id, 'worker-1');
      expect(claimed.status).toBe('in_progress');
      expect(claimed.owner).toBe('worker-1');

      // Complete
      const completed = TaskOperations.updateTask(teamName, task.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeTruthy();

      // Delete
      TaskOperations.deleteTask(teamName, task.id);
      expect(() => {
        TaskOperations.getTask(teamName, task.id);
      }).toThrow('not found');
    });

    it('dependency chain: create deps, complete them, claim dependent', () => {
      const dep1 = TaskOperations.createTask(teamName, { title: 'Dep 1' });
      const dep2 = TaskOperations.createTask(teamName, { title: 'Dep 2' });
      const main = TaskOperations.createTask(teamName, {
        title: 'Main Task',
        dependencies: [dep1.id, dep2.id],
      });

      // Dependencies not met
      expect(TaskOperations.areDependenciesMet(teamName, main.id)).toBe(false);

      // Complete dependencies
      TaskOperations.updateTask(teamName, dep1.id, { status: 'completed' });
      TaskOperations.updateTask(teamName, dep2.id, { status: 'completed' });

      // Now dependencies are met
      expect(TaskOperations.areDependenciesMet(teamName, main.id)).toBe(true);

      // Claim without warning
      const claimed = TaskOperations.claimTask(teamName, main.id, 'worker-1');
      expect(claimed.warning).toBeUndefined();
      expect(claimed.status).toBe('in_progress');
    });
  });
});
