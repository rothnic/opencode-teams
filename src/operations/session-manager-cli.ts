import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import type { SessionMetadata } from '../types/index';
import { SessionMetadataSchema } from '../types/index';
import { readValidatedJSON, removeFile, writeAtomicJSON } from '../utils/fs-atomic';
import { fileExists, getSessionMetadataPath, getSessionsDir } from '../utils/storage-paths';
import { TmuxOperations } from './tmux';

export class SessionManager {
  static deriveSessionName(projectDir: string): string {
    const hash = createHash('md5').update(projectDir).digest('hex').slice(0, 8);
    const dirName = basename(projectDir)
      .replace(/[^a-zA-Z0-9-]/g, '')
      .slice(0, 20);
    return `oc-${dirName}-${hash}`;
  }

  static detectSession(projectDir: string): SessionMetadata | null {
    const sessionName = SessionManager.deriveSessionName(projectDir);
    const metadataPath = getSessionMetadataPath(sessionName);

    if (!fileExists(metadataPath)) {
      return null;
    }

    try {
      const metadata = readValidatedJSON(metadataPath, SessionMetadataSchema);

      if (!TmuxOperations.isTmuxInstalled()) {
        return metadata;
      }

      const proc = Bun.spawnSync(['tmux', 'has-session', '-t', sessionName]);
      if (proc.exitCode !== 0) {
        removeFile(metadataPath);
        return null;
      }

      return metadata;
    } catch {
      return null;
    }
  }

  static launchSession(projectDir: string, teamName?: string): SessionMetadata {
    const existing = SessionManager.detectSession(projectDir);
    if (existing) {
      return existing;
    }

    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed. Install tmux to use session management.');
    }

    const sessionName = SessionManager.deriveSessionName(projectDir);

    const started = TmuxOperations.startSession(sessionName);
    if (!started) {
      const proc = Bun.spawnSync(['tmux', 'has-session', '-t', sessionName]);
      if (proc.exitCode === 0) {
        const existingMeta = SessionManager.getSessionInfo(projectDir);
        if (existingMeta) return existingMeta;
      }
      throw new Error(`Failed to create tmux session: ${sessionName}`);
    }

    const metadata: SessionMetadata = {
      projectDir,
      sessionName,
      agentPanes: [],
      createdAt: new Date().toISOString(),
      autoCleanupEnabled: true,
    };

    if (teamName) {
      TmuxOperations.selectLayout(sessionName, 'tiled');
    }

    const metadataPath = getSessionMetadataPath(sessionName);
    writeAtomicJSON(metadataPath, metadata, SessionMetadataSchema);

    return metadata;
  }

  static destroySession(sessionName: string): boolean {
    const killed = TmuxOperations.stopSession(sessionName);

    const metadataPath = getSessionMetadataPath(sessionName);
    if (fileExists(metadataPath)) {
      removeFile(metadataPath);
    }

    return killed;
  }

  static getSessionInfo(projectDir: string): SessionMetadata | null {
    const sessionName = SessionManager.deriveSessionName(projectDir);
    const metadataPath = getSessionMetadataPath(sessionName);

    if (!fileExists(metadataPath)) {
      return null;
    }

    try {
      return readValidatedJSON(metadataPath, SessionMetadataSchema);
    } catch {
      return null;
    }
  }

  static listActiveSessions(): SessionMetadata[] {
    const sessionsDir = getSessionsDir();
    const sessions: SessionMetadata[] = [];

    try {
      const files = Bun.spawnSync(['ls', sessionsDir]);
      if (files.exitCode !== 0) return sessions;

      const fileNames = files.stdout.toString().trim().split('\n').filter(Boolean);

      for (const file of fileNames) {
        if (!file.endsWith('.json')) continue;
        const sessionName = file.replace('.json', '');
        const metadataPath = getSessionMetadataPath(sessionName);

        try {
          const metadata = readValidatedJSON(metadataPath, SessionMetadataSchema);

          if (TmuxOperations.isTmuxInstalled()) {
            const proc = Bun.spawnSync(['tmux', 'has-session', '-t', sessionName]);
            if (proc.exitCode !== 0) {
              removeFile(metadataPath);
              continue;
            }
          }

          sessions.push(metadata);
        } catch {
          continue;
        }
      }
    } catch {
      return sessions;
    }

    return sessions;
  }

  static checkAutoCleanup(sessionName: string): boolean {
    const metadataPath = getSessionMetadataPath(sessionName);

    if (!fileExists(metadataPath)) {
      return false;
    }

    try {
      const metadata = readValidatedJSON(metadataPath, SessionMetadataSchema);

      if (!metadata.autoCleanupEnabled) {
        return false;
      }

      if (TmuxOperations.isTmuxInstalled()) {
        const clientProc = Bun.spawnSync(['tmux', 'list-clients', '-t', sessionName]);
        const clientOutput = clientProc.stdout.toString().trim();
        if (clientOutput.length > 0) {
          return false;
        }
      }

      SessionManager.destroySession(sessionName);
      return true;
    } catch {
      return false;
    }
  }
}
