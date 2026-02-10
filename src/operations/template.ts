import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { TeamConfigSchema, type TeamTemplate, TeamTemplateSchema } from '../types/schemas';
import { readValidatedJSON, writeAtomicJSON } from '../utils/fs-atomic';
import {
  fileExists,
  getProjectTemplatesDir,
  getTeamConfigPath,
  getTemplatePath,
  getTemplatesDir,
} from '../utils/storage-paths';

function safeReadDir(dirPath: string): string[] {
  try {
    return readdirSync(dirPath);
  } catch {
    return [];
  }
}

export const TemplateOperations = {
  save: (template: TeamTemplate): TeamTemplate => {
    const validated = TeamTemplateSchema.parse(template);
    const filePath = getTemplatePath(validated.name);
    writeAtomicJSON(filePath, validated);
    return validated;
  },

  load: (templateName: string): TeamTemplate => {
    const projectPath = getTemplatePath(templateName);
    if (fileExists(projectPath)) {
      return readValidatedJSON(projectPath, TeamTemplateSchema);
    }

    const globalPath = join(getTemplatesDir(), `${templateName}.json`);
    if (fileExists(globalPath)) {
      return readValidatedJSON(globalPath, TeamTemplateSchema);
    }

    throw new Error(`Template "${templateName}" not found`);
  },

  list: (): Array<{ name: string; description?: string; source: 'project' | 'global' }> => {
    const results = new Map<
      string,
      { name: string; description?: string; source: 'project' | 'global' }
    >();

    const globalDir = getTemplatesDir();
    for (const file of safeReadDir(globalDir)) {
      if (file.endsWith('.json')) {
        const name = file.replace('.json', '');
        try {
          const template = readValidatedJSON(join(globalDir, file), TeamTemplateSchema);
          results.set(name, { name, description: template.description, source: 'global' });
        } catch {
          /* skip invalid */
        }
      }
    }

    const projectDir = getProjectTemplatesDir();
    for (const file of safeReadDir(projectDir)) {
      if (file.endsWith('.json')) {
        const name = file.replace('.json', '');
        try {
          const template = readValidatedJSON(join(projectDir, file), TeamTemplateSchema);
          results.set(name, { name, description: template.description, source: 'project' });
        } catch {
          /* skip invalid */
        }
      }
    }

    return Array.from(results.values());
  },

  delete: (templateName: string): void => {
    const filePath = getTemplatePath(templateName);
    if (!fileExists(filePath)) {
      throw new Error(`Template "${templateName}" not found in project templates`);
    }
    unlinkSync(filePath);
  },

  saveFromTeam: (
    templateName: string,
    teamName: string,
    options?: { description?: string },
  ): TeamTemplate => {
    const configPath = getTeamConfigPath(teamName);
    const teamConfig = readValidatedJSON(configPath, TeamConfigSchema);

    const template: TeamTemplate = {
      name: templateName,
      description: options?.description || `Extracted from team "${teamName}"`,
      topology: teamConfig.topology || 'flat',
      roles: teamConfig.roles || [{ name: 'worker' }],
      workflowConfig: teamConfig.workflowConfig,
      createdAt: new Date().toISOString(),
    };

    return TemplateOperations.save(template);
  },
};

export function getBuiltinTemplates(): TeamTemplate[] {
  const now = new Date().toISOString();
  return [
    {
      name: 'code-review',
      description: 'Parallel code review with specialized reviewers',
      topology: 'flat',
      roles: [
        { name: 'leader', deniedTools: ['claim-task'] },
        {
          name: 'reviewer',
          allowedTools: ['update-task', 'send-message', 'poll-inbox', 'heartbeat'],
        },
      ],
      defaultTasks: [
        { title: 'Security Review', priority: 'high' },
        { title: 'Performance Review', priority: 'normal' },
        { title: 'Style Review', priority: 'normal' },
      ],
      createdAt: now,
    },
    {
      name: 'leader-workers',
      description: 'Hierarchical team with leader directing workers',
      topology: 'hierarchical',
      roles: [
        { name: 'leader', deniedTools: ['claim-task'] },
        {
          name: 'worker',
          deniedTools: ['spawn-team', 'spawn-agent', 'kill-agent', 'delete-team'],
        },
      ],
      workflowConfig: {
        enabled: true,
        taskThreshold: 5,
        workerRatio: 3.0,
        cooldownSeconds: 300,
      },
      createdAt: now,
    },
    {
      name: 'swarm',
      description: 'Flat topology where workers self-assign from shared queue',
      topology: 'flat',
      roles: [
        {
          name: 'worker',
          deniedTools: ['spawn-team', 'spawn-agent', 'kill-agent', 'delete-team'],
        },
      ],
      createdAt: now,
    },
  ];
}
