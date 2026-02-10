import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';

describe('Concurrency Stress Tests', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};
  const teamName = 'stress-team';
  const projectRoot = resolve(import.meta.dir, '..');

  beforeEach(() => {
    savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
    savedEnv.OPENCODE_AGENT_ID = process.env.OPENCODE_AGENT_ID;
    savedEnv.OPENCODE_AGENT_NAME = process.env.OPENCODE_AGENT_NAME;
    savedEnv.OPENCODE_AGENT_TYPE = process.env.OPENCODE_AGENT_TYPE;

    tempDir = mkdtempSync(join(tmpdir(), 'opencode-stress-'));
    process.env.OPENCODE_TEAMS_DIR = tempDir;
    delete process.env.OPENCODE_AGENT_ID;
    delete process.env.OPENCODE_AGENT_NAME;
    delete process.env.OPENCODE_AGENT_TYPE;

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

  function spawnChildScript(scriptContent: string): ReturnType<typeof Bun.spawn> {
    return Bun.spawn(['bun', '-e', scriptContent], {
      cwd: projectRoot,
      env: {
        ...process.env,
        OPENCODE_TEAMS_DIR: tempDir,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }

  async function readStdout(proc: ReturnType<typeof Bun.spawn>): Promise<string> {
    if (proc.stdout && typeof proc.stdout !== 'number') {
      return new Response(proc.stdout).text();
    }
    return '';
  }

  // ─── Multi-process claim race ───────────────────────────────────────────

  it('multi-process claim race results in exactly one winner', async () => {
    const task = TaskOperations.createTask(teamName, { title: 'Race Task' });

    const processes = Array.from({ length: 5 }, (_, i) =>
      spawnChildScript(`
import { TaskOperations } from './src/operations/task';
try {
  TaskOperations.claimTask('${teamName}', '${task.id}', 'agent-${i}');
  process.exit(0);
} catch {
  process.exit(1);
}
`),
    );

    const results = await Promise.all(processes.map((p) => p.exited));

    const successes = results.filter((code) => code === 0);
    const failures = results.filter((code) => code === 1);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(4);

    const finalTask = TaskOperations.getTask(teamName, task.id);
    expect(finalTask.status).toBe('in_progress');
    expect(finalTask.owner).toBeTruthy();
  }, 30_000);

  // ─── Multi-process concurrent task creation ─────────────────────────────

  it('concurrent task creation from multiple processes produces distinct tasks', async () => {
    const processes = Array.from({ length: 5 }, (_, i) =>
      spawnChildScript(`
import { TaskOperations } from './src/operations/task';
try {
  const task = TaskOperations.createTask('${teamName}', { title: 'Concurrent-${i}' });
  process.stdout.write(task.id);
  process.exit(0);
} catch (e) {
  process.stderr.write(String(e));
  process.exit(1);
}
`),
    );

    const results = await Promise.all(processes.map((p) => p.exited));
    expect(results.every((code) => code === 0)).toBe(true);

    const taskIds: string[] = [];
    for (const proc of processes) {
      const text = await readStdout(proc);
      if (text) taskIds.push(text.trim());
    }

    expect(taskIds).toHaveLength(5);
    const uniqueIds = new Set(taskIds);
    expect(uniqueIds.size).toBe(5);

    const allTasks = TaskOperations.getTasks(teamName);
    expect(allTasks.length).toBeGreaterThanOrEqual(5);
  }, 30_000);

  // ─── Multi-process concurrent message sends ─────────────────────────────

  it('concurrent messages from multiple processes all arrive in inbox', async () => {
    TeamOperations.requestJoin(teamName, {
      agentId: 'worker-1',
      agentName: 'Worker',
      agentType: 'worker',
    });

    const processes = Array.from({ length: 3 }, (_, i) =>
      spawnChildScript(`
import { TeamOperations } from './src/operations/team';
try {
  TeamOperations.write('${teamName}', 'worker-1', 'Message from process ${i}', 'leader-1');
  process.exit(0);
} catch (e) {
  process.stderr.write(String(e));
  process.exit(1);
}
`),
    );

    const results = await Promise.all(processes.map((p) => p.exited));
    expect(results.every((code) => code === 0)).toBe(true);

    const messages = TeamOperations.readMessages(teamName, 'worker-1');
    expect(messages).toHaveLength(3);
    expect(messages.every((m) => m.from === 'leader-1')).toBe(true);
  }, 30_000);

  // ─── Lock contention under load ─────────────────────────────────────────

  it('lock contention: 10 processes each claim a different task from a pool of 20', async () => {
    const tasks = Array.from({ length: 20 }, (_, i) =>
      TaskOperations.createTask(teamName, { title: `Load-Task-${i}` }),
    );

    const selectedTasks = tasks.slice(0, 10);

    const processes = selectedTasks.map((task, i) =>
      spawnChildScript(`
import { TaskOperations } from './src/operations/task';
try {
  TaskOperations.claimTask('${teamName}', '${task.id}', 'load-agent-${i}');
  process.exit(0);
} catch (e) {
  process.stderr.write(String(e));
  process.exit(1);
}
`),
    );

    const results = await Promise.all(processes.map((p) => p.exited));

    const successes = results.filter((code) => code === 0);
    expect(successes).toHaveLength(10);

    for (let i = 0; i < 10; i++) {
      const task = TaskOperations.getTask(teamName, selectedTasks[i].id);
      expect(task.status).toBe('in_progress');
      expect(task.owner).toBe(`load-agent-${i}`);
    }

    for (let i = 10; i < 20; i++) {
      const task = TaskOperations.getTask(teamName, tasks[i].id);
      expect(task.status).toBe('pending');
    }
  }, 30_000);
});
