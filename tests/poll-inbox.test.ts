/**
 * Tests for poll-inbox tool and long-polling
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { TeamOperations } from '../src/operations/team';

describe('pollInbox', () => {
  const testTeamName = `poll-test-team-${Date.now()}`;

  beforeAll(() => {
    process.env.OPENCODE_TEAMS_DIR = `/tmp/opencode-teams-poll-test-${Date.now()}`;
    TeamOperations.spawnTeam(testTeamName, { agentId: 'leader' });
  });

  afterAll(() => {
    const testDir = process.env.OPENCODE_TEAMS_DIR;
    if (testDir) {
      Bun.spawnSync(['rm', '-rf', testDir]);
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
    const startTime = Date.now();
    const timeout = 1000;
    const messages = await TeamOperations.pollInbox(testTeamName, 'empty-agent', timeout);
    const duration = Date.now() - startTime;

    expect(messages.length).toBe(0);
    expect(duration).toBeGreaterThanOrEqual(timeout);
  });
});
