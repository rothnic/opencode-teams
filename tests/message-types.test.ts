import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TeamOperations } from '../src/operations/team';
import { InboxSchema, MessageSchema, MessageTypeSchema } from '../src/types/schemas';

describe('MessageTypes', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
    savedEnv.OPENCODE_AGENT_ID = process.env.OPENCODE_AGENT_ID;
    savedEnv.OPENCODE_AGENT_NAME = process.env.OPENCODE_AGENT_NAME;
    savedEnv.OPENCODE_AGENT_TYPE = process.env.OPENCODE_AGENT_TYPE;

    tempDir = mkdtempSync(join(tmpdir(), 'opencode-teams-msgtype-'));
    process.env.OPENCODE_TEAMS_DIR = tempDir;
    delete process.env.OPENCODE_AGENT_ID;
    delete process.env.OPENCODE_AGENT_NAME;
    delete process.env.OPENCODE_AGENT_TYPE;
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

  // ─── Backward compatibility ──────────────────────────────────────────────

  describe('backward compatibility', () => {
    it('parses a message without type field as plain', () => {
      const raw = {
        from: 'agent-a',
        to: 'agent-b',
        message: 'hello',
        timestamp: new Date().toISOString(),
        read: false,
      };
      const parsed = MessageSchema.parse(raw);
      expect(parsed.type).toBe('plain');
    });

    it('parses existing inbox JSON without type fields', () => {
      const rawInbox = [
        {
          from: 'agent-a',
          to: 'agent-b',
          message: 'msg 1',
          timestamp: new Date().toISOString(),
          read: false,
        },
        {
          from: 'agent-b',
          to: 'agent-a',
          message: 'msg 2',
          timestamp: new Date().toISOString(),
          read: true,
        },
      ];
      const parsed = InboxSchema.parse(rawInbox);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].type).toBe('plain');
      expect(parsed[1].type).toBe('plain');
    });
  });

  // ─── Schema validation ──────────────────────────────────────────────────

  describe('schema validation', () => {
    const validTypes = [
      'plain',
      'idle',
      'task_assignment',
      'shutdown_request',
      'shutdown_approved',
    ] as const;

    for (const type of validTypes) {
      it(`accepts valid type: ${type}`, () => {
        const msg = MessageSchema.parse({
          from: 'a',
          to: 'b',
          message: 'test',
          type,
          timestamp: new Date().toISOString(),
        });
        expect(msg.type).toBe(type);
      });
    }

    it('rejects invalid type', () => {
      expect(() =>
        MessageSchema.parse({
          from: 'a',
          to: 'b',
          message: 'test',
          type: 'invalid',
          timestamp: new Date().toISOString(),
        }),
      ).toThrow();
    });

    it('MessageTypeSchema rejects arbitrary strings', () => {
      const result = MessageTypeSchema.safeParse('not_a_type');
      expect(result.success).toBe(false);
    });
  });

  // ─── Shutdown request sends typed message ───────────────────────────────

  describe('requestShutdown typed message', () => {
    it('sends shutdown_request to leader inbox', () => {
      TeamOperations.spawnTeam('shutdown-req', { agentId: 'leader-1' });
      TeamOperations.requestJoin('shutdown-req', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      TeamOperations.requestShutdown('shutdown-req', 'worker-1');

      const inboxPath = join(tempDir, 'teams', 'shutdown-req', 'inboxes', 'leader-1.json');
      expect(existsSync(inboxPath)).toBe(true);
      const inbox = JSON.parse(readFileSync(inboxPath, 'utf8'));
      const shutdownMsgs = inbox.filter(
        (m: Record<string, unknown>) => m.type === 'shutdown_request',
      );
      expect(shutdownMsgs).toHaveLength(1);
      expect(shutdownMsgs[0].from).toBe('worker-1');
      expect(shutdownMsgs[0].to).toBe('leader-1');
    });

    it('does not send message when leader requests own shutdown', () => {
      TeamOperations.spawnTeam('leader-self', { agentId: 'leader-1' });
      TeamOperations.requestShutdown('leader-self', 'leader-1');

      const inboxPath = join(tempDir, 'teams', 'leader-self', 'inboxes', 'leader-1.json');
      const inbox = JSON.parse(readFileSync(inboxPath, 'utf8'));
      const shutdownMsgs = inbox.filter(
        (m: Record<string, unknown>) => m.type === 'shutdown_request',
      );
      expect(shutdownMsgs).toHaveLength(0);
    });
  });

  // ─── Shutdown approval sends typed message ──────────────────────────────

  describe('approveShutdown typed message', () => {
    it('sends shutdown_approved to requester inboxes', () => {
      TeamOperations.spawnTeam('shutdown-appr', { agentId: 'leader-1' });
      TeamOperations.requestJoin('shutdown-appr', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      // Worker requests shutdown first
      TeamOperations.requestShutdown('shutdown-appr', 'worker-1');

      // Leader approves
      TeamOperations.approveShutdown('shutdown-appr', 'leader-1');

      const workerInboxPath = join(tempDir, 'teams', 'shutdown-appr', 'inboxes', 'worker-1.json');
      expect(existsSync(workerInboxPath)).toBe(true);
      const inbox = JSON.parse(readFileSync(workerInboxPath, 'utf8'));
      const approvedMsgs = inbox.filter(
        (m: Record<string, unknown>) => m.type === 'shutdown_approved',
      );
      expect(approvedMsgs).toHaveLength(1);
      expect(approvedMsgs[0].from).toBe('leader-1');
    });
  });

  // ─── Type preserved on disk ─────────────────────────────────────────────

  describe('type preserved on disk', () => {
    it('_sendTypedMessage persists type field to inbox file', () => {
      TeamOperations.spawnTeam('persist-type', { agentId: 'leader-1' });
      TeamOperations.requestJoin('persist-type', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      TeamOperations._sendTypedMessage(
        'persist-type',
        'worker-1',
        'Task assigned',
        'task_assignment',
        'leader-1',
      );

      const inboxPath = join(tempDir, 'teams', 'persist-type', 'inboxes', 'worker-1.json');
      const raw = JSON.parse(readFileSync(inboxPath, 'utf8'));
      expect(raw).toHaveLength(1);
      expect(raw[0].type).toBe('task_assignment');

      // Re-parse through schema to verify roundtrip
      const parsed = InboxSchema.parse(raw);
      expect(parsed[0].type).toBe('task_assignment');
    });

    it('write() produces plain-typed messages on disk', () => {
      TeamOperations.spawnTeam('plain-disk', { agentId: 'leader-1' });
      TeamOperations.requestJoin('plain-disk', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      TeamOperations.write('plain-disk', 'worker-1', 'Hello', 'leader-1');

      const inboxPath = join(tempDir, 'teams', 'plain-disk', 'inboxes', 'worker-1.json');
      const raw = JSON.parse(readFileSync(inboxPath, 'utf8'));
      expect(raw[0].type).toBe('plain');
    });
  });
});
