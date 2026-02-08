/**
 * Tests for poll-inbox tool and long-polling
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TeamOperations } from '../src/operations/team';

describe('pollInbox', () => {
  const testTeamName = `poll-test-team`;
  let tempDir: string;
  let savedTeamsDir: string | undefined;

  beforeAll(() => {
    savedTeamsDir = process.env.OPENCODE_TEAMS_DIR;
    tempDir = mkdtempSync(join(tmpdir(), 'opencode-poll-test-'));
    process.env.OPENCODE_TEAMS_DIR = tempDir;
    TeamOperations.spawnTeam(testTeamName, { agentId: 'leader' });
    // Join agent-1 and agent-2 so they are valid recipients
    TeamOperations.requestJoin(testTeamName, {
      agentId: 'agent-1',
      agentName: 'Agent One',
      agentType: 'worker',
    });
    TeamOperations.requestJoin(testTeamName, {
      agentId: 'agent-2',
      agentName: 'Agent Two',
      agentType: 'worker',
    });
  });

  afterAll(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    if (savedTeamsDir !== undefined) {
      process.env.OPENCODE_TEAMS_DIR = savedTeamsDir;
    } else {
      delete process.env.OPENCODE_TEAMS_DIR;
    }
  });

  it('should return immediately if messages exist', async () => {
    TeamOperations.write(testTeamName, 'agent-1', 'Hello!', 'leader');

    const messages = await TeamOperations.pollInbox(testTeamName, 'agent-1', 1000);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].message).toBe('Hello!');
  });

  it('should wait for new messages', async () => {
    const pollPromise = TeamOperations.pollInbox(testTeamName, 'agent-2', 2000);

    // Send message after a short delay
    (async () => {
      await Bun.sleep(500);
      TeamOperations.write(testTeamName, 'agent-2', 'Delayed message', 'leader');
    })();

    const messages = await pollPromise;
    expect(messages.length).toBe(1);
    expect(messages[0].message).toBe('Delayed message');
  });

  it('should timeout if no messages arrive', async () => {
    // Join empty-agent so their inbox can be checked
    try {
      TeamOperations.requestJoin(testTeamName, {
        agentId: 'empty-agent',
        agentName: 'Empty',
        agentType: 'worker',
      });
    } catch {
      // May already be joined from a previous test run
    }

    const startTime = Date.now();
    const timeout = 1000;
    const messages = await TeamOperations.pollInbox(testTeamName, 'empty-agent', timeout);
    const duration = Date.now() - startTime;

    expect(messages.length).toBe(0);
    expect(duration).toBeGreaterThanOrEqual(timeout);
  });
});
