import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TeamOperations } from '../src/operations/team';
import { getTeamsDir, dirExists } from '../src/utils/index';
import { join } from 'node:path';

describe('Lifecycle Management', () => {
  const teamName = 'test-lifecycle-team';

  beforeEach(() => {
    // Ensure clean state
    TeamOperations.cleanup(teamName);
  });

  afterEach(() => {
    TeamOperations.cleanup(teamName);
  });

  it('should handle shutdown requests and approvals', () => {
    const leaderInfo = { agentId: 'leader-1', agentName: 'Leader' };
    TeamOperations.spawnTeam(teamName, leaderInfo);

    TeamOperations.requestJoin(teamName, { agentId: 'member-1', agentName: 'Member 1' });

    // Initial state: not should shutdown
    expect(TeamOperations.shouldShutdown(teamName)).toBe(false);

    // Member 1 requests shutdown
    TeamOperations.requestShutdown(teamName, 'member-1');
    expect(TeamOperations.shouldShutdown(teamName)).toBe(false);

    // Leader approves shutdown
    TeamOperations.approveShutdown(teamName, 'leader-1');
    expect(TeamOperations.shouldShutdown(teamName)).toBe(true);
  });

  it('should shutdown if all members approve', () => {
    const leaderInfo = { agentId: 'leader-1', agentName: 'Leader' };
    TeamOperations.spawnTeam(teamName, leaderInfo);

    TeamOperations.requestJoin(teamName, { agentId: 'member-1', agentName: 'Member 1' });

    // Member 1 approves
    TeamOperations.approveShutdown(teamName, 'member-1');
    expect(TeamOperations.shouldShutdown(teamName)).toBe(false);

    // Leader approves
    TeamOperations.approveShutdown(teamName, 'leader-1');
    expect(TeamOperations.shouldShutdown(teamName)).toBe(true);
  });

  it('should perform cleanup on shutdown', () => {
    // This is tested by the tool execution logic in src/index.ts
    // Here we just test the shouldShutdown logic which the tool uses
    const leaderInfo = { agentId: 'leader-1', agentName: 'Leader' };
    TeamOperations.spawnTeam(teamName, leaderInfo);

    TeamOperations.approveShutdown(teamName, 'leader-1');
    expect(TeamOperations.shouldShutdown(teamName)).toBe(true);

    TeamOperations.cleanup(teamName);
    const teamsDir = getTeamsDir();
    expect(dirExists(join(teamsDir, teamName))).toBe(false);
  });
});
