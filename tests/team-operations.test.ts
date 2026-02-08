/**
 * Unit tests for Team Operations
 * Using Bun's built-in test runner
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { TeamOperations } from '../src/operations/team';

describe('TeamOperations', () => {
  const testTeamName = `test-team-${Date.now()}`;

  beforeAll(() => {
    // Set up test environment
    process.env.OPENCODE_TEAMS_DIR = `/tmp/opencode-teams-test-${Date.now()}`;
    process.env.OPENCODE_AGENT_ID = 'test-agent-1';
    process.env.OPENCODE_AGENT_NAME = 'Test Agent';
  });

  afterAll(() => {
    // Clean up test directory
    const testDir = process.env.OPENCODE_TEAMS_DIR;
    if (testDir && testDir.startsWith('/tmp/opencode-teams-test-')) {
      Bun.spawnSync(['rm', '-rf', testDir]);
    }
    delete process.env.OPENCODE_TEAMS_DIR;
    delete process.env.OPENCODE_AGENT_ID;
    delete process.env.OPENCODE_AGENT_NAME;
  });

  describe('spawnTeam', () => {
    it('should create a new team', () => {
      const team = TeamOperations.spawnTeam(testTeamName, {
        agentId: 'leader-1',
        agentName: 'Team Leader',
        agentType: 'leader',
      });

      expect(team.name).toBe(testTeamName);
      expect(team.leader).toBe('leader-1');
      expect(team.members).toHaveLength(1);
      expect(team.members[0].agentId).toBe('leader-1');
      expect(team.members[0].agentType).toBe('leader');
    });

    it('should throw error if team already exists', () => {
      expect(() => {
        TeamOperations.spawnTeam(testTeamName);
      }).toThrow(`Team "${testTeamName}" already exists`);
    });
  });

  describe('discoverTeams', () => {
    it('should return list of teams', () => {
      const teams = TeamOperations.discoverTeams();

      expect(teams).toBeArray();
      expect(teams.length).toBeGreaterThanOrEqual(1);

      const team = teams.find((t) => t.name === testTeamName);
      expect(team).toBeDefined();
      expect(team?.leader).toBe('leader-1');
    });
  });

  describe('requestJoin', () => {
    it('should allow agent to join team', () => {
      const member = TeamOperations.requestJoin(testTeamName, {
        agentId: 'worker-1',
        agentName: 'Worker Agent',
        agentType: 'worker',
      });

      expect(member.agentId).toBe('worker-1');
      expect(member.agentType).toBe('worker');

      const teamInfo = TeamOperations.getTeamInfo(testTeamName);
      expect(teamInfo.members).toHaveLength(2);
    });

    it('should throw error for non-existent team', () => {
      expect(() => {
        TeamOperations.requestJoin('non-existent-team');
      }).toThrow('does not exist');
    });
  });

  describe('messaging', () => {
    it('should send direct message', () => {
      const message = TeamOperations.write(testTeamName, 'worker-1', 'Hello worker!', 'leader-1');

      expect(message.from).toBe('leader-1');
      expect(message.to).toBe('worker-1');
      expect(message.message).toBe('Hello worker!');
      expect(message.timestamp).toBeDefined();
    });

    it('should broadcast message', () => {
      const message = TeamOperations.broadcast(testTeamName, 'Team announcement', 'leader-1');

      expect(message.from).toBe('leader-1');
      expect(message.to).toBe('broadcast');
      expect(message.message).toBe('Team announcement');
      expect(message.recipients).toBeArray();
      expect(message.recipients?.length).toBe(2); // leader + worker
    });

    it('should read messages for agent', () => {
      const messages = TeamOperations.readMessages(testTeamName, 'worker-1');

      expect(messages).toBeArray();
      expect(messages.length).toBeGreaterThanOrEqual(2); // direct + broadcast
    });
  });

  describe('cleanup', () => {
    it('should remove team data', () => {
      TeamOperations.cleanup(testTeamName);

      const teams = TeamOperations.discoverTeams();
      const team = teams.find((t) => t.name === testTeamName);
      expect(team).toBeUndefined();
    });
  });
});
