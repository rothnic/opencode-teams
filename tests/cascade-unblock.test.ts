import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';

describe('Cascade Unblock (FR-010)', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};
  const teamName = 'test-team';

  beforeEach(() => {
    savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
    savedEnv.OPENCODE_AGENT_ID = process.env.OPENCODE_AGENT_ID;

    tempDir = mkdtempSync(join(tmpdir(), 'opencode-cascade-test-'));
    process.env.OPENCODE_TEAMS_DIR = tempDir;
    delete process.env.OPENCODE_AGENT_ID;

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

  it('removes completed task from dependent dependencies', () => {
    const taskA = TaskOperations.createTask(teamName, { title: 'A' });
    const taskB = TaskOperations.createTask(teamName, {
      title: 'B',
      dependencies: [taskA.id],
    });

    expect(TaskOperations.getTask(teamName, taskB.id).dependencies).toContain(taskA.id);

    TaskOperations.claimTask(teamName, taskA.id, 'worker-1');
    TaskOperations.updateTask(teamName, taskA.id, { status: 'completed' });

    const updatedB = TaskOperations.getTask(teamName, taskB.id);
    expect(updatedB.dependencies).not.toContain(taskA.id);
    expect(updatedB.dependencies).toHaveLength(0);
  });

  it('cascades through a chain: A -> B -> C', () => {
    const taskA = TaskOperations.createTask(teamName, { title: 'A' });
    const taskB = TaskOperations.createTask(teamName, {
      title: 'B',
      dependencies: [taskA.id],
    });
    const taskC = TaskOperations.createTask(teamName, {
      title: 'C',
      dependencies: [taskB.id],
    });

    TaskOperations.claimTask(teamName, taskA.id, 'worker-1');
    TaskOperations.updateTask(teamName, taskA.id, { status: 'completed' });

    expect(TaskOperations.getTask(teamName, taskB.id).dependencies).toHaveLength(0);
    expect(TaskOperations.getTask(teamName, taskC.id).dependencies).toContain(taskB.id);

    TaskOperations.claimTask(teamName, taskB.id, 'worker-2');
    TaskOperations.updateTask(teamName, taskB.id, { status: 'completed' });

    expect(TaskOperations.getTask(teamName, taskC.id).dependencies).toHaveLength(0);
  });

  it('unblocks multiple dependents when blocker completes', () => {
    const taskA = TaskOperations.createTask(teamName, { title: 'A' });
    const taskB = TaskOperations.createTask(teamName, {
      title: 'B',
      dependencies: [taskA.id],
    });
    const taskC = TaskOperations.createTask(teamName, {
      title: 'C',
      dependencies: [taskA.id],
    });

    TaskOperations.claimTask(teamName, taskA.id, 'worker-1');
    TaskOperations.updateTask(teamName, taskA.id, { status: 'completed' });

    expect(TaskOperations.getTask(teamName, taskB.id).dependencies).toHaveLength(0);
    expect(TaskOperations.getTask(teamName, taskC.id).dependencies).toHaveLength(0);
  });

  it('clears warning when all dependencies become met', () => {
    const taskA = TaskOperations.createTask(teamName, { title: 'A' });
    const taskB = TaskOperations.createTask(teamName, {
      title: 'B',
      dependencies: [taskA.id],
    });

    const claimed = TaskOperations.claimTask(teamName, taskB.id, 'worker-1');
    expect(claimed.warning).toContain('dependencies are not met');

    TaskOperations.claimTask(teamName, taskA.id, 'worker-2');
    TaskOperations.updateTask(teamName, taskA.id, { status: 'completed' });

    const updatedB = TaskOperations.getTask(teamName, taskB.id);
    expect(updatedB.warning).toBeUndefined();
  });

  it('removes completed task from blocks arrays', () => {
    const taskA = TaskOperations.createTask(teamName, { title: 'A' });
    const taskB = TaskOperations.createTask(teamName, {
      title: 'B',
      dependencies: [taskA.id],
    });

    expect(TaskOperations.getTask(teamName, taskB.id).blocks).toEqual([]);

    const refreshedA = TaskOperations.getTask(teamName, taskA.id);
    expect(refreshedA.blocks).toContain(taskB.id);

    TaskOperations.claimTask(teamName, taskA.id, 'worker-1');
    TaskOperations.updateTask(teamName, taskA.id, { status: 'completed' });

    const updatedB = TaskOperations.getTask(teamName, taskB.id);
    expect(updatedB.blocks).not.toContain(taskA.id);
  });

  it('partial cascade: removes only completed dep, keeps others', () => {
    const taskA = TaskOperations.createTask(teamName, { title: 'A' });
    const taskC = TaskOperations.createTask(teamName, { title: 'C' });
    const taskB = TaskOperations.createTask(teamName, {
      title: 'B',
      dependencies: [taskA.id, taskC.id],
    });

    TaskOperations.claimTask(teamName, taskA.id, 'worker-1');
    TaskOperations.updateTask(teamName, taskA.id, { status: 'completed' });

    const updatedB = TaskOperations.getTask(teamName, taskB.id);
    expect(updatedB.dependencies).not.toContain(taskA.id);
    expect(updatedB.dependencies).toContain(taskC.id);
    expect(updatedB.dependencies).toHaveLength(1);
  });
});
