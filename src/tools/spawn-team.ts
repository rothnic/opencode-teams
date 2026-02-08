/**
 * Spawn Team Tool
 * Creates a new team for multi-agent collaboration
 */

import { tool } from './tool-helper';
import { TeamOperations } from '../operations/team';
import type { TeamConfig, LeaderInfo } from '../types/index';

export const spawnTeam = tool<{ teamName: string; leaderInfo?: LeaderInfo }, TeamConfig>({
  name: 'spawn-team',
  description: 'Create a new team of AI agents for collaborative work',
  parameters: {
    teamName: {
      type: 'string',
      description: 'Unique name for the team (e.g., "code-review-pr-123")',
      required: true,
    },
    leaderInfo: {
      type: 'object',
      description: 'Information about the team leader',
      required: false,
      properties: {
        agentId: {
          type: 'string',
          description: 'Unique ID for the leader agent',
          required: false,
        },
        agentName: {
          type: 'string',
          description: 'Display name for the leader',
          required: false,
        },
        agentType: {
          type: 'string',
          description: 'Type of agent (e.g., "leader")',
          required: false,
        },
      },
    },
  },
  execute: async ({ teamName, leaderInfo }, _context) => {
    return TeamOperations.spawnTeam(teamName, leaderInfo);
  },
});
