/**
 * Server Manager Operations
 *
 * Manages OpenCode server lifecycle: deterministic port calculation,
 * server start/stop, health checking, SDK session creation, and
 * reliable prompt delivery.
 *
 * All operations use:
 * - Advisory file locks (via file-lock.ts) for concurrency safety
 * - Atomic writes (via fs-atomic.ts) for crash safety
 * - Zod schemas (via schemas.ts) for runtime validation
 * - Project-specific storage paths (via storage-paths.ts)
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ServerInfo } from '../types/schemas';
import { ServerInfoSchema } from '../types/schemas';
import { withLock } from '../utils/file-lock';
import { readValidatedJSON, writeAtomicJSON } from '../utils/fs-atomic';
import { getServerLogPath, getServerStatePath } from '../utils/storage-paths';

/**
 * Check if a process with the given PID is alive.
 * Uses signal 0 which checks existence without sending a signal.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Poll a server's HTTP endpoint until it responds OK or timeout.
 */
async function waitForServer(port: number, hostname: string, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await globalThis.fetch(`http://${hostname}:${port}/`);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(100);
  }
  return false;
}

/**
 * Server lifecycle management operations.
 */
export const ServerManager = {
  /**
   * Calculate deterministic port from project path.
   * Port = 28000 + (first 2 bytes of MD5 hash mod 1000).
   */
  portForProject(projectPath: string): number {
    const absPath = resolve(projectPath);
    const hash = createHash('md5').update(absPath).digest();
    const offset = (hash[0] << 8) | hash[1];
    return 28000 + (offset % 1000);
  },

  /**
   * Calculate project hash for directory naming.
   */
  projectHash(projectPath: string): string {
    return createHash('md5').update(resolve(projectPath)).digest('hex');
  },

  /**
   * Create an SDK client for a running server.
   * Uses dynamic import to avoid hard dependency when SDK not installed.
   */
  async createClient(port: number, hostname = '127.0.0.1') {
    const { createOpencodeClient } = await import('@opencode-ai/sdk');
    return createOpencodeClient({ baseUrl: `http://${hostname}:${port}` });
  },

  /**
   * Ensure an OpenCode server is running for the given project.
   *
   * Recovery pattern (D1):
   * 1. Read existing ServerInfo from disk
   * 2. Check PID alive → TCP connect → SDK health
   * 3. If any check fails: kill zombie, start fresh
   * 4. Poll health endpoint until ready (5s timeout)
   * 5. Persist ServerInfo atomically
   */
  async ensureRunning(projectPath: string, hostname = '127.0.0.1'): Promise<ServerInfo> {
    const absPath = resolve(projectPath);
    const hash = ServerManager.projectHash(absPath);
    const port = ServerManager.portForProject(absPath);
    const statePath = getServerStatePath(hash);
    const logPath = getServerLogPath(hash);
    const lockPath = `${statePath}.lock`;

    // Check existing server
    if (existsSync(statePath)) {
      try {
        const existing = readValidatedJSON(statePath, ServerInfoSchema);
        if (existing.isRunning && isPidAlive(existing.pid)) {
          const healthy = await waitForServer(existing.port, existing.hostname, 2000);
          if (healthy) {
            const updated: ServerInfo = {
              ...existing,
              lastHealthCheck: new Date().toISOString(),
            };
            withLock(lockPath, () => {
              writeAtomicJSON(statePath, updated, ServerInfoSchema);
            });
            return updated;
          }
          // Zombie process — kill it
          try {
            process.kill(existing.pid, 'SIGKILL');
          } catch {
            // Already dead
          }
        }
      } catch {
        // Corrupted state file — start fresh
      }
    }

    // Start fresh server
    const proc = Bun.spawn(['opencode', 'serve', '--hostname', hostname, '--port', String(port)], {
      cwd: absPath,
      stdout: Bun.file(logPath),
      stderr: Bun.file(logPath),
    });
    proc.unref();

    const ready = await waitForServer(port, hostname, 5000);
    if (!ready) {
      throw new Error(`Server failed to start on ${hostname}:${port} within 5s. Check ${logPath}`);
    }

    const serverInfo: ServerInfo = {
      projectPath: absPath,
      projectHash: hash,
      pid: proc.pid,
      port,
      hostname,
      isRunning: true,
      activeSessions: 0,
      logPath,
      startedAt: new Date().toISOString(),
      lastHealthCheck: new Date().toISOString(),
    };

    withLock(lockPath, () => {
      writeAtomicJSON(statePath, serverInfo, ServerInfoSchema);
    });

    return serverInfo;
  },

  /**
   * Stop a running OpenCode server.
   * Sends SIGTERM, waits up to 5s, then SIGKILL if still alive.
   */
  async stop(projectPath: string): Promise<void> {
    const absPath = resolve(projectPath);
    const hash = ServerManager.projectHash(absPath);
    const statePath = getServerStatePath(hash);
    const lockPath = `${statePath}.lock`;

    if (!existsSync(statePath)) return;

    let serverInfo: ServerInfo;
    try {
      serverInfo = readValidatedJSON(statePath, ServerInfoSchema);
    } catch {
      return;
    }

    if (!serverInfo.isRunning || !isPidAlive(serverInfo.pid)) {
      withLock(lockPath, () => {
        writeAtomicJSON(statePath, { ...serverInfo, isRunning: false }, ServerInfoSchema);
      });
      return;
    }

    // Graceful shutdown with SIGTERM
    try {
      process.kill(serverInfo.pid, 'SIGTERM');
    } catch {
      // Process already dead
    }

    // Wait up to 5s for graceful shutdown
    const start = Date.now();
    while (Date.now() - start < 5000) {
      if (!isPidAlive(serverInfo.pid)) break;
      await Bun.sleep(200);
    }

    // Force kill if still alive
    if (isPidAlive(serverInfo.pid)) {
      try {
        process.kill(serverInfo.pid, 'SIGKILL');
      } catch {
        // Already dead
      }
    }

    withLock(lockPath, () => {
      writeAtomicJSON(statePath, { ...serverInfo, isRunning: false }, ServerInfoSchema);
    });
  },

  /**
   * Create an SDK session for a new agent.
   * Session title format: teams::{teamName}::agent::{agentId}::role::{role}
   */
  async createSession(
    port: number,
    title: string,
    directory: string,
    hostname = '127.0.0.1',
  ): Promise<{ sessionId: string }> {
    const client = await ServerManager.createClient(port, hostname);
    const result = await client.session.create({
      body: { title },
      query: { directory },
    });
    if (!result.data) {
      throw new Error('Failed to create session: no data returned');
    }
    return { sessionId: result.data.id };
  },

  /**
   * Reliable prompt delivery with retry and verification (D2).
   *
   * 1. Get current message count
   * 2. Send prompt
   * 3. Verify delivery: poll until message count increases (5s timeout)
   * 4. If verification fails: retry up to 3 times with 2s interval
   */
  async sendPromptReliable(
    port: number,
    sessionId: string,
    prompt: string,
    options?: {
      model?: string;
      providerId?: string;
      hostname?: string;
      maxRetries?: number;
    },
  ): Promise<{ success: boolean; error?: string }> {
    const hostname = options?.hostname ?? '127.0.0.1';
    const maxRetries = options?.maxRetries ?? 3;
    const client = await ServerManager.createClient(port, hostname);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get current message count
        const beforeMessages = await client.session.messages({
          path: { id: sessionId },
        });
        const beforeCount = Array.isArray(beforeMessages.data) ? beforeMessages.data.length : 0;

        // Send prompt
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            parts: [{ type: 'text' as const, text: prompt }],
            ...(options?.model && { modelID: options.model }),
            ...(options?.providerId && { providerID: options.providerId }),
          },
        });

        // Verify delivery: poll until message count increases (5s timeout)
        const verifyStart = Date.now();
        while (Date.now() - verifyStart < 5000) {
          const afterMessages = await client.session.messages({
            path: { id: sessionId },
          });
          const afterCount = Array.isArray(afterMessages.data) ? afterMessages.data.length : 0;
          if (afterCount > beforeCount) {
            return { success: true };
          }
          await Bun.sleep(500);
        }

        // Verification timed out — retry
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === maxRetries - 1) {
          return {
            success: false,
            error: `All ${maxRetries} retries failed: ${message}`,
          };
        }
      }

      // Wait before retry
      await Bun.sleep(2000);
    }

    return {
      success: false,
      error: `Prompt delivery failed after ${maxRetries} retries`,
    };
  },

  /**
   * Check if a server is running and healthy.
   * Returns ServerInfo with isRunning=false if PID is dead.
   */
  async status(projectPath: string): Promise<ServerInfo | null> {
    const absPath = resolve(projectPath);
    const hash = ServerManager.projectHash(absPath);
    const statePath = getServerStatePath(hash);

    if (!existsSync(statePath)) return null;

    try {
      const info = readValidatedJSON(statePath, ServerInfoSchema);
      if (!isPidAlive(info.pid)) {
        return { ...info, isRunning: false };
      }
      return info;
    } catch {
      return null;
    }
  },
};
