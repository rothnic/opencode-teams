import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';

describe('E2E Scenarios', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};
  const teamName = 'e2e-team';

  beforeEach(() => {
    savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
    savedEnv.OPENCODE_AGENT_ID = process.env.OPENCODE_AGENT_ID;
    savedEnv.OPENCODE_AGENT_NAME = process.env.OPENCODE_AGENT_NAME;
    savedEnv.OPENCODE_AGENT_TYPE = process.env.OPENCODE_AGENT_TYPE;

    tempDir = mkdtempSync(join(tmpdir(), 'opencode-e2e-'));
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

  // ─── P1: Concurrent State Access Safety ─────────────────────────────────

  describe('P1: Concurrent State Access Safety', () => {
    it('write then immediate read returns updated state', () => {
      const task = TaskOperations.createTask(teamName, { title: 'P1 Test' });
      const fetched = TaskOperations.getTask(teamName, task.id);
      expect(fetched.title).toBe('P1 Test');
    });

    it('concurrent config updates preserve all changes', async () => {
      const joins = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          Promise.resolve().then(() =>
            TeamOperations.requestJoin(teamName, {
              agentId: `worker-${i}`,
              agentName: `Worker ${i}`,
              agentType: 'worker',
            }),
          ),
        ),
      );
      const fulfilled = joins.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(5);

      const info = TeamOperations.getTeamInfo(teamName);
      expect(info.members).toHaveLength(6);
    });
  });

  // ─── P2: Structured Shutdown Coordination ───────────────────────────────

  describe('P2: Structured Shutdown Coordination', () => {
    it('shutdown request sends typed message and approval responds', () => {
      TeamOperations.requestJoin(teamName, {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      TeamOperations.requestShutdown(teamName, 'worker-1');

      const leaderMessages = TeamOperations.readMessages(teamName, 'leader-1');
      const shutdownReq = leaderMessages.find((m) => m.type === 'shutdown_request');
      expect(shutdownReq).toBeDefined();
      expect(shutdownReq!.from).toBe('worker-1');

      TeamOperations.approveShutdown(teamName, 'leader-1');

      const workerMessages = TeamOperations.readMessages(teamName, 'worker-1');
      const shutdownApproved = workerMessages.find((m) => m.type === 'shutdown_approved');
      expect(shutdownApproved).toBeDefined();
      expect(shutdownApproved!.from).toBe('leader-1');
    });
  });

  // ─── P3: Automatic Dependency Unblocking ────────────────────────────────

  describe('P3: Automatic Dependency Unblocking', () => {
    it('completing task unblocks all dependents', () => {
      const taskA = TaskOperations.createTask(teamName, { title: 'Root' });
      const taskB = TaskOperations.createTask(teamName, {
        title: 'Dep B',
        dependencies: [taskA.id],
      });
      const taskC = TaskOperations.createTask(teamName, {
        title: 'Dep C',
        dependencies: [taskA.id],
      });

      TaskOperations.claimTask(teamName, taskA.id, 'worker-1');
      TaskOperations.updateTask(teamName, taskA.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });

      const b = TaskOperations.getTask(teamName, taskB.id);
      const c = TaskOperations.getTask(teamName, taskC.id);
      expect(b.dependencies).toEqual([]);
      expect(c.dependencies).toEqual([]);
    });

    it('chain cascade unblocks sequentially', () => {
      const root = TaskOperations.createTask(teamName, { title: 'Root' });
      const mid = TaskOperations.createTask(teamName, {
        title: 'Mid',
        dependencies: [root.id],
      });
      const leaf = TaskOperations.createTask(teamName, {
        title: 'Leaf',
        dependencies: [mid.id],
      });

      TaskOperations.claimTask(teamName, root.id, 'w1');
      TaskOperations.updateTask(teamName, root.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });

      const midTask = TaskOperations.getTask(teamName, mid.id);
      expect(midTask.dependencies).toEqual([]);

      const leafTask = TaskOperations.getTask(teamName, leaf.id);
      expect(leafTask.dependencies).toEqual([mid.id]);

      TaskOperations.claimTask(teamName, mid.id, 'w2');
      TaskOperations.updateTask(teamName, mid.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });

      const leafFinal = TaskOperations.getTask(teamName, leaf.id);
      expect(leafFinal.dependencies).toEqual([]);
    });
  });

  // ─── P4: Soft Blocking on Task Claims ───────────────────────────────────

  describe('P4: Soft Blocking on Task Claims', () => {
    it('claiming blocked task succeeds with warning', () => {
      const dep = TaskOperations.createTask(teamName, { title: 'Blocker' });
      const task = TaskOperations.createTask(teamName, {
        title: 'Blocked',
        dependencies: [dep.id],
      });

      const claimed = TaskOperations.claimTask(teamName, task.id, 'worker-1');
      expect(claimed.status).toBe('in_progress');
      expect(claimed.warning).toContain('dependencies are not met');
    });

    it('warning remains visible on re-read', () => {
      const dep = TaskOperations.createTask(teamName, { title: 'Blocker' });
      const task = TaskOperations.createTask(teamName, {
        title: 'Blocked',
        dependencies: [dep.id],
      });

      TaskOperations.claimTask(teamName, task.id, 'worker-1');
      const reread = TaskOperations.getTask(teamName, task.id);
      expect(reread.warning).toContain('dependencies are not met');
    });
  });
});
