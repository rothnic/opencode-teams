import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TeamOperations } from '../src/operations/team';
import { getTeamsDir, dirExists } from '../src/utils/index';

describe('Lifecycle Management', () => {
  const teamName = 'test-lifecycle-team';
  let tempDir: string;
  let savedTeamsDir: string | undefined;

  beforeEach(() => {
    savedTeamsDir = process.env.OPENCODE_TEAMS_DIR;
    tempDir = mkdtempSync(join(tmpdir(), 'opencode-lifecycle-test-'));
    process.env.OPENCODE_TEAMS_DIR = tempDir;
    // Ensure clean state
    TeamOperations.cleanup(teamName);
  });

  afterEach(() => {
    TeamOperations.cleanup(teamName);
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    if (savedTeamsDir !== undefined) {
      process.env.OPENCODE_TEAMS_DIR = savedTeamsDir;
    } else {
      delete process.env.OPENCODE_TEAMS_DIR;
    }
  });

  it('should handle shutdown requests and approvals', () => {
    const leaderInfo = { agentId: 'leader-1', agentName: 'Leader' };
    TeamOperations.spawnTeam(teamName, leaderInfo);

    TeamOperations.requestJoin(teamName, {
      agentId: 'member-1',
      agentName: 'Member 1',
      agentType: 'worker',
    });

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

    TeamOperations.requestJoin(teamName, {
      agentId: 'member-1',
      agentName: 'Member 1',
      agentType: 'worker',
    });

    // Member 1 approves
    TeamOperations.approveShutdown(teamName, 'member-1');
    expect(TeamOperations.shouldShutdown(teamName)).toBe(false);

    // Leader approves
    TeamOperations.approveShutdown(teamName, 'leader-1');
    expect(TeamOperations.shouldShutdown(teamName)).toBe(true);
  });

  it('should perform cleanup on shutdown', () => {
    const leaderInfo = { agentId: 'leader-1', agentName: 'Leader' };
    TeamOperations.spawnTeam(teamName, leaderInfo);

    TeamOperations.approveShutdown(teamName, 'leader-1');
    expect(TeamOperations.shouldShutdown(teamName)).toBe(true);

    TeamOperations.cleanup(teamName);
    const teamsDir = getTeamsDir();
    expect(dirExists(join(teamsDir, teamName))).toBe(false);
  });
});
