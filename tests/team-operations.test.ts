/**
 * Comprehensive tests for TeamOperations
 *
 * Each test uses an isolated temp directory via mkdtempSync
 * to prevent cross-test interference.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TeamOperations } from '../src/operations/team';
import { TeamConfigSchema } from '../src/types/schemas';

describe('TeamOperations', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
    savedEnv.OPENCODE_AGENT_ID = process.env.OPENCODE_AGENT_ID;
    savedEnv.OPENCODE_AGENT_NAME = process.env.OPENCODE_AGENT_NAME;
    savedEnv.OPENCODE_AGENT_TYPE = process.env.OPENCODE_AGENT_TYPE;

    tempDir = mkdtempSync(join(tmpdir(), 'opencode-teams-test-'));
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

  // ─── spawnTeam ──────────────────────────────────────────────────────────────

  describe('spawnTeam', () => {
    it('creates team with valid name and returns TeamConfig', () => {
      const team = TeamOperations.spawnTeam('my-team', {
        agentId: 'leader-1',
        agentName: 'Leader One',
        agentType: 'leader',
      });

      expect(team.name).toBe('my-team');
      expect(team.leader).toBe('leader-1');
      expect(team.members).toHaveLength(1);
      expect(team.members[0].agentId).toBe('leader-1');
      expect(team.members[0].agentName).toBe('Leader One');
      expect(team.members[0].agentType).toBe('leader');
      expect(team.created).toBeTruthy();
    });

    it('throws on duplicate team name', () => {
      TeamOperations.spawnTeam('dup-team', { agentId: 'leader-1' });

      expect(() => {
        TeamOperations.spawnTeam('dup-team', { agentId: 'leader-2' });
      }).toThrow('already exists');
    });

    it('throws on invalid team name with special chars', () => {
      expect(() => {
        TeamOperations.spawnTeam('bad team!', { agentId: 'leader-1' });
      }).toThrow('Invalid team name');
    });

    it('throws on invalid team name with spaces', () => {
      expect(() => {
        TeamOperations.spawnTeam('has spaces', { agentId: 'leader-1' });
      }).toThrow('Invalid team name');
    });

    it('throws on empty team name', () => {
      expect(() => {
        TeamOperations.spawnTeam('', { agentId: 'leader-1' });
      }).toThrow();
    });

    it('creates inboxes directory and leader inbox file', () => {
      TeamOperations.spawnTeam('inbox-test', { agentId: 'leader-1' });

      const inboxesDir = join(tempDir, 'teams', 'inbox-test', 'inboxes');
      expect(existsSync(inboxesDir)).toBe(true);

      const leaderInbox = join(inboxesDir, 'leader-1.json');
      expect(existsSync(leaderInbox)).toBe(true);

      const inboxContent = JSON.parse(readFileSync(leaderInbox, 'utf8'));
      expect(inboxContent).toEqual([]);
    });

    it('creates tasks directory for the team', () => {
      TeamOperations.spawnTeam('tasks-dir-test', { agentId: 'leader-1' });

      const tasksDir = join(tempDir, 'tasks', 'tasks-dir-test');
      expect(existsSync(tasksDir)).toBe(true);
    });

    it('written config passes Zod validation', () => {
      TeamOperations.spawnTeam('zod-test', {
        agentId: 'leader-1',
        agentName: 'Leader',
        agentType: 'leader',
      });

      const configPath = join(tempDir, 'teams', 'zod-test', 'config.json');
      expect(existsSync(configPath)).toBe(true);

      const raw = JSON.parse(readFileSync(configPath, 'utf8'));
      const result = TeamConfigSchema.safeParse(raw);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('zod-test');
        expect(result.data.leader).toBe('leader-1');
        expect(result.data.members).toHaveLength(1);
      }
    });

    it('uses env defaults when leaderInfo is empty', () => {
      process.env.OPENCODE_AGENT_ID = 'env-leader';
      process.env.OPENCODE_AGENT_NAME = 'Env Leader';

      const team = TeamOperations.spawnTeam('env-team');

      expect(team.leader).toBe('env-leader');
      expect(team.members[0].agentId).toBe('env-leader');
      expect(team.members[0].agentName).toBe('Env Leader');
    });
  });

  // ─── discoverTeams ──────────────────────────────────────────────────────────

  describe('discoverTeams', () => {
    it('returns empty array when no teams exist', () => {
      const teams = TeamOperations.discoverTeams();
      expect(teams).toEqual([]);
    });

    it('returns summaries for all teams', () => {
      TeamOperations.spawnTeam('team-alpha', { agentId: 'leader-a' });
      TeamOperations.spawnTeam('team-beta', { agentId: 'leader-b' });

      const teams = TeamOperations.discoverTeams();
      expect(teams).toHaveLength(2);

      const names = teams.map((t) => t.name).sort();
      expect(names).toEqual(['team-alpha', 'team-beta']);

      const alpha = teams.find((t) => t.name === 'team-alpha');
      expect(alpha).toBeDefined();
      expect(alpha!.leader).toBe('leader-a');
      expect(alpha!.memberCount).toBe(1);
      expect(alpha!.created).toBeTruthy();
    });

    it('skips invalid team configs gracefully', () => {
      // Create a valid team
      TeamOperations.spawnTeam('valid-team', { agentId: 'leader-1' });

      // Create an invalid team directory with malformed config
      const badTeamDir = join(tempDir, 'teams', 'bad-team');
      mkdirSync(badTeamDir, { recursive: true });
      writeFileSync(join(badTeamDir, 'config.json'), '{"invalid": true}', 'utf8');

      const teams = TeamOperations.discoverTeams();
      expect(teams).toHaveLength(1);
      expect(teams[0].name).toBe('valid-team');
    });

    it('skips directories without config.json', () => {
      TeamOperations.spawnTeam('real-team', { agentId: 'leader-1' });

      // Create a directory that has no config.json
      const emptyDir = join(tempDir, 'teams', 'empty-team');
      mkdirSync(emptyDir, { recursive: true });

      const teams = TeamOperations.discoverTeams();
      expect(teams).toHaveLength(1);
      expect(teams[0].name).toBe('real-team');
    });
  });

  // ─── requestJoin ────────────────────────────────────────────────────────────

  describe('requestJoin', () => {
    it('adds new member to team config', () => {
      TeamOperations.spawnTeam('join-team', { agentId: 'leader-1', agentName: 'Leader' });

      const member = TeamOperations.requestJoin('join-team', {
        agentId: 'worker-1',
        agentName: 'Worker One',
        agentType: 'worker',
      });

      expect(member.agentId).toBe('worker-1');
      expect(member.agentName).toBe('Worker One');
      expect(member.agentType).toBe('worker');
      expect(member.joinedAt).toBeTruthy();

      const info = TeamOperations.getTeamInfo('join-team');
      expect(info.members).toHaveLength(2);
      const found = info.members.find((m) => m.agentId === 'worker-1');
      expect(found).toBeDefined();
      expect(found!.agentName).toBe('Worker One');
    });

    it('creates inbox file for new member', () => {
      TeamOperations.spawnTeam('inbox-join', { agentId: 'leader-1' });
      TeamOperations.requestJoin('inbox-join', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      const inboxPath = join(tempDir, 'teams', 'inbox-join', 'inboxes', 'worker-1.json');
      expect(existsSync(inboxPath)).toBe(true);

      const content = JSON.parse(readFileSync(inboxPath, 'utf8'));
      expect(content).toEqual([]);
    });

    it('throws on duplicate agentId', () => {
      TeamOperations.spawnTeam('dup-member', { agentId: 'leader-1' });
      TeamOperations.requestJoin('dup-member', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      expect(() => {
        TeamOperations.requestJoin('dup-member', {
          agentId: 'worker-1',
          agentName: 'Different Name',
          agentType: 'worker',
        });
      }).toThrow('already a member');
    });

    it('throws when team does not exist', () => {
      expect(() => {
        TeamOperations.requestJoin('nonexistent-team', {
          agentId: 'worker-1',
          agentName: 'Worker',
        });
      }).toThrow('does not exist');
    });
  });

  // ─── getTeamInfo ────────────────────────────────────────────────────────────

  describe('getTeamInfo', () => {
    it('returns validated TeamConfig', () => {
      const created = TeamOperations.spawnTeam('info-team', {
        agentId: 'leader-1',
        agentName: 'Leader',
        agentType: 'leader',
      });

      const info = TeamOperations.getTeamInfo('info-team');
      expect(info.name).toBe('info-team');
      expect(info.leader).toBe('leader-1');
      expect(info.members).toHaveLength(1);
      expect(info.created).toBe(created.created);
      expect(info.members[0].agentId).toBe('leader-1');
    });

    it('throws when team does not exist', () => {
      expect(() => {
        TeamOperations.getTeamInfo('ghost-team');
      }).toThrow('does not exist');
    });
  });

  // ─── write (send message) ──────────────────────────────────────────────────

  describe('write (send message)', () => {
    it('appends message to recipient inbox file', () => {
      TeamOperations.spawnTeam('msg-team', { agentId: 'leader-1' });
      TeamOperations.requestJoin('msg-team', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      const msg = TeamOperations.write('msg-team', 'worker-1', 'Hello!', 'leader-1');

      expect(msg.from).toBe('leader-1');
      expect(msg.to).toBe('worker-1');
      expect(msg.message).toBe('Hello!');
      expect(msg.timestamp).toBeTruthy();

      // Verify inbox file on disk
      const inboxPath = join(tempDir, 'teams', 'msg-team', 'inboxes', 'worker-1.json');
      const inbox = JSON.parse(readFileSync(inboxPath, 'utf8'));
      expect(inbox).toHaveLength(1);
      expect(inbox[0].message).toBe('Hello!');
      expect(inbox[0].from).toBe('leader-1');
    });

    it('throws when recipient is not a team member', () => {
      TeamOperations.spawnTeam('norecip-team', { agentId: 'leader-1' });

      expect(() => {
        TeamOperations.write('norecip-team', 'unknown-agent', 'Hi', 'leader-1');
      }).toThrow('is not a member');
    });

    it('throws when team does not exist', () => {
      expect(() => {
        TeamOperations.write('ghost-team', 'agent-1', 'Hi', 'leader-1');
      }).toThrow('does not exist');
    });

    it('message has read: false initially', () => {
      TeamOperations.spawnTeam('read-flag', { agentId: 'leader-1' });
      TeamOperations.requestJoin('read-flag', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      const msg = TeamOperations.write('read-flag', 'worker-1', 'Check read flag', 'leader-1');
      expect(msg.read).toBe(false);

      // Also verify on disk
      const inboxPath = join(tempDir, 'teams', 'read-flag', 'inboxes', 'worker-1.json');
      const inbox = JSON.parse(readFileSync(inboxPath, 'utf8'));
      expect(inbox[0].read).toBe(false);
    });

    it('appends multiple messages to same inbox', () => {
      TeamOperations.spawnTeam('multi-msg', { agentId: 'leader-1' });
      TeamOperations.requestJoin('multi-msg', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      TeamOperations.write('multi-msg', 'worker-1', 'First', 'leader-1');
      TeamOperations.write('multi-msg', 'worker-1', 'Second', 'leader-1');
      TeamOperations.write('multi-msg', 'worker-1', 'Third', 'leader-1');

      const inboxPath = join(tempDir, 'teams', 'multi-msg', 'inboxes', 'worker-1.json');
      const inbox = JSON.parse(readFileSync(inboxPath, 'utf8'));
      expect(inbox).toHaveLength(3);
    });
  });

  // ─── broadcast ──────────────────────────────────────────────────────────────

  describe('broadcast', () => {
    it('delivers to each non-sender member inbox', () => {
      TeamOperations.spawnTeam('bc-team', { agentId: 'leader-1' });
      TeamOperations.requestJoin('bc-team', {
        agentId: 'worker-1',
        agentName: 'W1',
        agentType: 'worker',
      });
      TeamOperations.requestJoin('bc-team', {
        agentId: 'worker-2',
        agentName: 'W2',
        agentType: 'worker',
      });

      TeamOperations.broadcast('bc-team', 'Hello everyone!', 'leader-1');

      // Workers should each have the message
      const w1Messages = TeamOperations.readMessages('bc-team', 'worker-1');
      expect(w1Messages).toHaveLength(1);
      expect(w1Messages[0].message).toBe('Hello everyone!');

      const w2Messages = TeamOperations.readMessages('bc-team', 'worker-2');
      expect(w2Messages).toHaveLength(1);
      expect(w2Messages[0].message).toBe('Hello everyone!');

      // Sender should NOT have the broadcast in their inbox
      const leaderMessages = TeamOperations.readMessages('bc-team', 'leader-1');
      expect(leaderMessages).toHaveLength(0);
    });

    it('message has recipients list including all members', () => {
      TeamOperations.spawnTeam('bc-recip', { agentId: 'leader-1' });
      TeamOperations.requestJoin('bc-recip', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      const msg = TeamOperations.broadcast('bc-recip', 'Announcement', 'leader-1');

      expect(msg.to).toBe('broadcast');
      expect(msg.recipients).toBeArray();
      expect(msg.recipients).toContain('leader-1');
      expect(msg.recipients).toContain('worker-1');
      expect(msg.recipients).toHaveLength(2);
    });

    it('throws when team does not exist', () => {
      expect(() => {
        TeamOperations.broadcast('ghost-team', 'Hello', 'leader-1');
      }).toThrow('does not exist');
    });
  });

  // ─── readMessages ───────────────────────────────────────────────────────────

  describe('readMessages', () => {
    it('returns messages from agent inbox', () => {
      TeamOperations.spawnTeam('read-msg', { agentId: 'leader-1' });
      TeamOperations.requestJoin('read-msg', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      TeamOperations.write('read-msg', 'worker-1', 'Msg 1', 'leader-1');
      TeamOperations.write('read-msg', 'worker-1', 'Msg 2', 'leader-1');

      const messages = TeamOperations.readMessages('read-msg', 'worker-1');
      expect(messages).toHaveLength(2);
      expect(messages[0].message).toBe('Msg 1');
      expect(messages[1].message).toBe('Msg 2');
    });

    it('marks returned messages as read on disk', () => {
      TeamOperations.spawnTeam('mark-read', { agentId: 'leader-1' });
      TeamOperations.requestJoin('mark-read', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      TeamOperations.write('mark-read', 'worker-1', 'Test msg', 'leader-1');

      // Read messages (this should mark them as read)
      const messages = TeamOperations.readMessages('mark-read', 'worker-1');
      expect(messages).toHaveLength(1);

      // Verify read flag is updated on disk
      const inboxPath = join(tempDir, 'teams', 'mark-read', 'inboxes', 'worker-1.json');
      const inbox = JSON.parse(readFileSync(inboxPath, 'utf8'));
      expect(inbox[0].read).toBe(true);
    });

    it('filters by since timestamp', () => {
      TeamOperations.spawnTeam('since-team', { agentId: 'leader-1' });
      TeamOperations.requestJoin('since-team', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      TeamOperations.write('since-team', 'worker-1', 'Message content', 'leader-1');

      // Use a timestamp far in the past: should return the message
      const pastTimestamp = new Date(0).toISOString();
      const allMessages = TeamOperations.readMessages('since-team', 'worker-1', pastTimestamp);
      expect(allMessages.length).toBeGreaterThanOrEqual(1);

      // Use a timestamp far in the future: should return nothing
      const futureTimestamp = new Date(Date.now() + 100_000).toISOString();
      const noMessages = TeamOperations.readMessages('since-team', 'worker-1', futureTimestamp);
      expect(noMessages).toHaveLength(0);
    });

    it('returns empty array for missing inbox file', () => {
      TeamOperations.spawnTeam('no-inbox', { agentId: 'leader-1' });

      // Query for an agent with no inbox file
      const messages = TeamOperations.readMessages('no-inbox', 'nonexistent-agent');
      expect(messages).toEqual([]);
    });

    it('returns empty array when no messages match since filter', () => {
      TeamOperations.spawnTeam('empty-since', { agentId: 'leader-1' });
      TeamOperations.requestJoin('empty-since', {
        agentId: 'worker-1',
        agentName: 'Worker',
        agentType: 'worker',
      });

      TeamOperations.write('empty-since', 'worker-1', 'Old message', 'leader-1');

      // All messages are before this future timestamp
      const futureTs = new Date(Date.now() + 60_000).toISOString();
      const messages = TeamOperations.readMessages('empty-since', 'worker-1', futureTs);
      expect(messages).toHaveLength(0);
    });
  });

  // ─── cleanup ────────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('removes team directory', () => {
      TeamOperations.spawnTeam('cleanup-team', { agentId: 'leader-1' });

      const teamDir = join(tempDir, 'teams', 'cleanup-team');
      expect(existsSync(teamDir)).toBe(true);

      TeamOperations.cleanup('cleanup-team');
      expect(existsSync(teamDir)).toBe(false);
    });

    it('removes team tasks directory', () => {
      TeamOperations.spawnTeam('cleanup-tasks', { agentId: 'leader-1' });

      // spawnTeam calls getTeamTasksDir which creates the tasks dir
      const tasksDir = join(tempDir, 'tasks', 'cleanup-tasks');
      expect(existsSync(tasksDir)).toBe(true);

      TeamOperations.cleanup('cleanup-tasks');
      expect(existsSync(tasksDir)).toBe(false);
    });

    it('is idempotent on already-cleaned team', () => {
      TeamOperations.spawnTeam('double-clean', { agentId: 'leader-1' });
      TeamOperations.cleanup('double-clean');

      // Should not throw when called again
      expect(() => {
        TeamOperations.cleanup('double-clean');
      }).not.toThrow();
    });

    it('team no longer appears in discoverTeams after cleanup', () => {
      TeamOperations.spawnTeam('discover-clean', { agentId: 'leader-1' });

      let teams = TeamOperations.discoverTeams();
      expect(teams.find((t) => t.name === 'discover-clean')).toBeDefined();

      TeamOperations.cleanup('discover-clean');

      teams = TeamOperations.discoverTeams();
      expect(teams.find((t) => t.name === 'discover-clean')).toBeUndefined();
    });
  });
});
