import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';

describe('Status Transitions (FR-011)', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};
  const teamName = 'test-team';

  beforeEach(() => {
    savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
    savedEnv.OPENCODE_AGENT_ID = process.env.OPENCODE_AGENT_ID;

    tempDir = mkdtempSync(join(tmpdir(), 'opencode-transitions-test-'));
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

  it('allows pending -> in_progress via updateTask', () => {
    const task = TaskOperations.createTask(teamName, { title: 'Test' });

    const updated = TaskOperations.updateTask(teamName, task.id, {
      status: 'in_progress',
    });

    expect(updated.status).toBe('in_progress');
  });

  it('allows in_progress -> completed', () => {
    const task = TaskOperations.createTask(teamName, { title: 'Test' });
    TaskOperations.claimTask(teamName, task.id, 'worker-1');

    const updated = TaskOperations.updateTask(teamName, task.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    expect(updated.status).toBe('completed');
  });

  it('rejects pending -> completed', () => {
    const task = TaskOperations.createTask(teamName, { title: 'Test' });

    expect(() => {
      TaskOperations.updateTask(teamName, task.id, { status: 'completed' });
    }).toThrow('Invalid status transition: pending -> completed');
  });

  it('rejects completed -> pending', () => {
    const task = TaskOperations.createTask(teamName, { title: 'Test' });
    TaskOperations.claimTask(teamName, task.id, 'worker-1');
    TaskOperations.updateTask(teamName, task.id, { status: 'completed' });

    expect(() => {
      TaskOperations.updateTask(teamName, task.id, { status: 'pending' });
    }).toThrow('Invalid status transition: completed -> pending');
  });

  it('rejects completed -> in_progress', () => {
    const task = TaskOperations.createTask(teamName, { title: 'Test' });
    TaskOperations.claimTask(teamName, task.id, 'worker-1');
    TaskOperations.updateTask(teamName, task.id, { status: 'completed' });

    expect(() => {
      TaskOperations.updateTask(teamName, task.id, { status: 'in_progress' });
    }).toThrow('Invalid status transition: completed -> in_progress');
  });

  it('rejects in_progress -> pending', () => {
    const task = TaskOperations.createTask(teamName, { title: 'Test' });
    TaskOperations.claimTask(teamName, task.id, 'worker-1');

    expect(() => {
      TaskOperations.updateTask(teamName, task.id, { status: 'pending' });
    }).toThrow('Invalid status transition: in_progress -> pending');
  });

  it('allows same-status update as no-op', () => {
    const task = TaskOperations.createTask(teamName, { title: 'Test' });

    const updated = TaskOperations.updateTask(teamName, task.id, {
      status: 'pending',
    });

    expect(updated.status).toBe('pending');
  });

  it('claimTask still transitions pending -> in_progress', () => {
    const task = TaskOperations.createTask(teamName, { title: 'Test' });

    const claimed = TaskOperations.claimTask(teamName, task.id, 'worker-1');

    expect(claimed.status).toBe('in_progress');
    expect(claimed.owner).toBe('worker-1');
  });
});
