/**
 * Storage Path Resolution
 *
 * Resolves paths for global config vs project-specific storage.
 * - Global Config: ~/.config/opencode/opencode-teams/ (Preferences, Templates)
 * - Project Storage: <project-root>/.opencode/opencode-teams/ (Teams, Tasks, Inboxes)
 */

import { existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PLUGIN_NAME = 'opencode-teams';

/** Markers that indicate a project root directory */
const PROJECT_ROOT_MARKERS = ['.git', 'package.json', 'opencode.json', '.opencode'];

/**
 * Detect the project root by walking up from cwd looking for marker files/dirs.
 * Falls back to cwd if no marker is found.
 */
export function detectProjectRoot(startDir?: string): string {
  // Allow override via environment variable
  if (process.env.OPENCODE_PROJECT_ROOT) {
    return process.env.OPENCODE_PROJECT_ROOT;
  }

  let dir = startDir || process.cwd();

  // Walk up the directory tree
  while (true) {
    for (const marker of PROJECT_ROOT_MARKERS) {
      const markerPath = join(dir, marker);
      if (existsSync(markerPath)) {
        return dir;
      }
    }

    const parent = join(dir, '..');
    if (parent === dir) {
      // Reached filesystem root, fall back to cwd
      return process.cwd();
    }
    dir = parent;
  }
}

/**
 * Get the global config directory.
 * ~/.config/opencode/opencode-teams/
 */
export function getGlobalConfigDir(): string {
  const dir =
    process.env.OPENCODE_TEAMS_GLOBAL_DIR || join(homedir(), '.config', 'opencode', PLUGIN_NAME);
  ensureDir(dir);
  return dir;
}

/**
 * Get the project-specific storage directory.
 * <project-root>/.opencode/opencode-teams/
 */
export function getProjectStorageDir(projectRoot?: string): string {
  const root = projectRoot || detectProjectRoot();
  const dir = process.env.OPENCODE_TEAMS_DIR || join(root, '.opencode', PLUGIN_NAME);
  ensureDir(dir);
  return dir;
}

/**
 * Get the teams directory within project storage.
 * <project-root>/.opencode/opencode-teams/teams/
 */
export function getTeamsDir(projectRoot?: string): string {
  const dir = join(getProjectStorageDir(projectRoot), 'teams');
  ensureDir(dir);
  return dir;
}

/**
 * Get the tasks directory within project storage.
 * <project-root>/.opencode/opencode-teams/tasks/
 */
export function getTasksDir(projectRoot?: string): string {
  const dir = join(getProjectStorageDir(projectRoot), 'tasks');
  ensureDir(dir);
  return dir;
}

/**
 * Get a specific team's directory.
 * <project-root>/.opencode/opencode-teams/teams/<team-name>/
 */
export function getTeamDir(teamName: string, projectRoot?: string): string {
  return join(getTeamsDir(projectRoot), teamName);
}

/**
 * Get the config file path for a specific team.
 */
export function getTeamConfigPath(teamName: string, projectRoot?: string): string {
  return join(getTeamDir(teamName, projectRoot), 'config.json');
}

/**
 * Get the inboxes directory for a specific team (per-agent inbox model).
 * <project-root>/.opencode/opencode-teams/teams/<team-name>/inboxes/
 */
export function getInboxesDir(teamName: string, projectRoot?: string): string {
  const dir = join(getTeamDir(teamName, projectRoot), 'inboxes');
  ensureDir(dir);
  return dir;
}

/**
 * Get the inbox file path for a specific agent in a team.
 * <project-root>/.opencode/opencode-teams/teams/<team-name>/inboxes/<agent-id>.json
 */
export function getAgentInboxPath(teamName: string, agentId: string, projectRoot?: string): string {
  return join(getInboxesDir(teamName, projectRoot), `${agentId}.json`);
}

/**
 * Get a specific team's tasks directory.
 * <project-root>/.opencode/opencode-teams/tasks/<team-name>/
 */
export function getTeamTasksDir(teamName: string, projectRoot?: string): string {
  const dir = join(getTasksDir(projectRoot), teamName);
  ensureDir(dir);
  return dir;
}

/**
 * Get the lock file path for a team's operations.
 * <project-root>/.opencode/opencode-teams/teams/<team-name>/.lock
 */
export function getTeamLockPath(teamName: string, projectRoot?: string): string {
  return join(getTeamDir(teamName, projectRoot), '.lock');
}

/**
 * Get the lock file path for a team's task operations.
 * <project-root>/.opencode/opencode-teams/tasks/<team-name>/.lock
 */
export function getTaskLockPath(teamName: string, projectRoot?: string): string {
  return join(getTeamTasksDir(teamName, projectRoot), '.lock');
}

/**
 * Get the task file path for a specific task.
 */
export function getTaskFilePath(teamName: string, taskId: string, projectRoot?: string): string {
  return join(getTeamTasksDir(teamName, projectRoot), `${taskId}.json`);
}

/**
 * Get the agents directory within project storage.
 * <project-root>/.opencode/opencode-teams/agents/
 */
export function getAgentsDir(projectRoot?: string): string {
  const dir = join(getProjectStorageDir(projectRoot), 'agents');
  ensureDir(dir);
  return dir;
}

/**
 * Get the state file path for a specific agent.
 * <project-root>/.opencode/opencode-teams/agents/<agent-id>.json
 */
export function getAgentStatePath(agentId: string, projectRoot?: string): string {
  return join(getAgentsDir(projectRoot), `${agentId}.json`);
}

/**
 * Get the lock file path for agent state operations.
 * <project-root>/.opencode/opencode-teams/agents/.lock
 */
export function getAgentLockPath(projectRoot?: string): string {
  return join(getAgentsDir(projectRoot), '.lock');
}

/**
 * Get the servers directory within project storage.
 * <project-root>/.opencode/opencode-teams/servers/
 */
export function getServersDir(projectRoot?: string): string {
  const dir = join(getProjectStorageDir(projectRoot), 'servers');
  ensureDir(dir);
  return dir;
}

/**
 * Get the state file path for a specific server instance.
 * <project-root>/.opencode/opencode-teams/servers/<project-hash>/server.json
 */
export function getServerStatePath(projectHash: string, projectRoot?: string): string {
  const dir = join(getServersDir(projectRoot), projectHash);
  ensureDir(dir);
  return join(dir, 'server.json');
}

/**
 * Get the log file path for a specific server instance.
 * <project-root>/.opencode/opencode-teams/servers/<project-hash>/server.log
 */
export function getServerLogPath(projectHash: string, projectRoot?: string): string {
  const dir = join(getServersDir(projectRoot), projectHash);
  ensureDir(dir);
  return join(dir, 'server.log');
}

/**
 * Get the color pool state file path.
 * <project-root>/.opencode/opencode-teams/color-pool.json
 */
export function getColorPoolPath(projectRoot?: string): string {
  return join(getProjectStorageDir(projectRoot), 'color-pool.json');
}

export function getSessionsDir(projectRoot?: string): string {
  const dir = join(getProjectStorageDir(projectRoot), 'sessions');
  ensureDir(dir);
  return dir;
}

export function getSessionMetadataPath(sessionName: string, projectRoot?: string): string {
  return join(getSessionsDir(projectRoot), `${sessionName}.json`);
}

/**
 * Get the global templates directory.
 * ~/.config/opencode/opencode-teams/templates/
 */
export function getTemplatesDir(): string {
  const dir = join(getGlobalConfigDir(), 'templates');
  ensureDir(dir);
  return dir;
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Check if a path exists and is a file.
 */
export function fileExists(filePath: string): boolean {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists and is a directory.
 */
export function dirExists(dirPath: string): boolean {
  try {
    return existsSync(dirPath) && statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
