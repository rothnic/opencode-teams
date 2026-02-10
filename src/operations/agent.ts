/**
 * Agent Lifecycle Operations Module
 *
 * Manages agent spawning, monitoring, shutdown, and state.
 * All operations use:
 * - Advisory file locks (via file-lock.ts) for concurrency safety
 * - Atomic writes (via fs-atomic.ts) for crash safety
 * - Zod schemas (via schemas.ts) for runtime validation
 * - Project-specific storage paths (via storage-paths.ts)
 */

import { join } from 'node:path';
import {
  type AgentState,
  AgentStateSchema,
  type AgentStatus,
  TeamConfigSchema,
} from '../types/schemas';
import { allocateColor, releaseColor } from '../utils/color-pool';
import { withLock } from '../utils/file-lock';
import {
  listJSONFiles,
  lockedUpdate,
  readValidatedJSON,
  writeAtomicJSON,
} from '../utils/fs-atomic';
import {
  fileExists,
  getAgentLockPath,
  getAgentStatePath,
  getAgentsDir,
  getTeamConfigPath,
  getTeamLockPath,
} from '../utils/storage-paths';
import { ServerManager } from './server-manager';
import { TmuxOperations } from './tmux';

/**
 * Agent lifecycle operations.
 */
export const AgentOperations = {
  /**
   * Register an agent: write state file and add to TeamConfig.members.
   */
  registerAgent(agentState: AgentState, projectRoot?: string): AgentState {
    const validated = AgentStateSchema.parse(agentState);
    const statePath = getAgentStatePath(validated.id, projectRoot);

    if (fileExists(statePath)) {
      throw new Error(`Agent '${validated.id}' is already registered`);
    }

    // Write agent state atomically
    writeAtomicJSON(statePath, validated, AgentStateSchema);

    // Add agent to team members
    const configPath = getTeamConfigPath(validated.teamName, projectRoot);
    const lockPath = getTeamLockPath(validated.teamName, projectRoot);

    lockedUpdate(lockPath, configPath, TeamConfigSchema, (config) => {
      if (config.members.some((m) => m.agentId === validated.id)) {
        return config;
      }
      return {
        ...config,
        members: [
          ...config.members,
          {
            agentId: validated.id,
            agentName: validated.name,
            agentType: validated.role,
            joinedAt: new Date().toISOString(),
          },
        ],
      };
    });

    return validated;
  },

  /**
   * Get a single agent's state by ID.
   */
  getAgentState(agentId: string, projectRoot?: string): AgentState | null {
    const statePath = getAgentStatePath(agentId, projectRoot);
    if (!fileExists(statePath)) return null;
    try {
      return readValidatedJSON(statePath, AgentStateSchema);
    } catch {
      return null;
    }
  },

  /**
   * List all agents, optionally filtered by team and/or status.
   */
  listAgents(
    filters?: {
      teamName?: string;
      status?: AgentStatus;
      isActive?: boolean;
    },
    projectRoot?: string,
  ): AgentState[] {
    const agentsDir = getAgentsDir(projectRoot);
    const files = listJSONFiles(agentsDir);
    const agents: AgentState[] = [];

    for (const file of files) {
      try {
        const agent = readValidatedJSON(join(agentsDir, file), AgentStateSchema);
        if (filters?.teamName && agent.teamName !== filters.teamName) continue;
        if (filters?.status && agent.status !== filters.status) continue;
        if (filters?.isActive !== undefined && agent.isActive !== filters.isActive) continue;
        agents.push(agent);
      } catch {
        // Skip corrupted files
      }
    }

    return agents;
  },

  /**
   * Update agent state fields atomically.
   */
  updateAgentState(
    agentId: string,
    updates: Partial<AgentState>,
    projectRoot?: string,
  ): AgentState {
    const statePath = getAgentStatePath(agentId, projectRoot);
    const lockPath = getAgentLockPath(projectRoot);

    if (!fileExists(statePath)) {
      throw new Error(`Agent '${agentId}' not found`);
    }

    const definedUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        definedUpdates[key] = value;
      }
    }

    return withLock(lockPath, () => {
      const current = readValidatedJSON(statePath, AgentStateSchema);
      const merged = { ...current, ...definedUpdates, updatedAt: new Date().toISOString() };
      // Preserve immutable fields
      merged.id = current.id;
      merged.createdAt = current.createdAt;
      const validated = AgentStateSchema.parse(merged);
      writeAtomicJSON(statePath, validated, AgentStateSchema);
      return validated;
    });
  },

  /**
   * Find an agent by their SDK session ID.
   */
  findAgentBySessionId(sessionId: string, projectRoot?: string): AgentState | null {
    const agents = AgentOperations.listAgents(undefined, projectRoot);
    return agents.find((a) => a.sessionId === sessionId) ?? null;
  },

  /**
   * Spawn a new agent into a team.
   *
   * Orchestrates: server start → session creation → color allocation →
   * tmux pane → agent registration → prompt delivery → status update.
   */
  async spawnAgent(params: {
    teamName: string;
    prompt: string;
    name?: string;
    model?: string;
    providerId?: string;
    role?: 'worker' | 'reviewer';
    cwd?: string;
    projectRoot?: string;
  }): Promise<{
    success: boolean;
    agentId?: string;
    sessionId?: string;
    paneId?: string;
    name?: string;
    color?: string;
    port?: number;
    error?: string;
  }> {
    const teamName = params.teamName;
    const prompt = params.prompt;
    const role: 'worker' | 'reviewer' = params.role ?? 'worker';
    const projectRoot = params.projectRoot;

    // Step 1: Validate team exists
    const configPath = getTeamConfigPath(teamName, projectRoot);
    if (!fileExists(configPath)) {
      return { success: false, error: `Team '${teamName}' does not exist` };
    }

    let teamConfig;
    try {
      teamConfig = readValidatedJSON(configPath, TeamConfigSchema);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to read team config: ${msg}` };
    }

    // Step 2: Check tmux availability
    if (!TmuxOperations.isInsideTmux() && !TmuxOperations.isTmuxInstalled()) {
      return { success: false, error: 'tmux is required for agent spawning' };
    }

    // Step 3: Ensure server is running
    const projectPath = params.cwd || process.cwd();
    let serverInfo;
    try {
      serverInfo = await ServerManager.ensureRunning(projectPath);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to start OpenCode server: ${msg}` };
    }

    const agentId = globalThis.crypto.randomUUID();
    const agentName = params.name || `agent-${agentId.slice(0, 8)}`;
    const model = params.model || 'claude-sonnet-4-20250514';
    const cwd = params.cwd || process.cwd();
    const title = `teams::${teamName}::agent::${agentId}::role::${role}`;

    // Step 4: Create SDK session
    let sessionId: string;
    try {
      const session = await ServerManager.createSession(
        serverInfo.port,
        title,
        cwd,
        serverInfo.hostname,
      );
      sessionId = session.sessionId;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to create SDK session: ${msg}` };
    }

    // Step 5: Allocate color
    const color = allocateColor(agentId, projectRoot);

    // Step 6: Create tmux pane
    const tmuxSession = process.env.TMUX_SESSION || teamConfig.name;
    let paneId: string | null = null;
    try {
      paneId = TmuxOperations.splitWindow(tmuxSession, cwd);
      if (!paneId) {
        throw new Error('splitWindow returned null');
      }
      TmuxOperations.setPaneTitle(paneId, title);
      TmuxOperations.sendKeys(
        paneId,
        `opencode attach --session ${sessionId} http://${serverInfo.hostname}:${serverInfo.port}`,
      );
      TmuxOperations.setPaneOption(paneId, '@opencode_session_id', sessionId);
      TmuxOperations.selectLayout(tmuxSession, 'main-vertical');
    } catch (error: unknown) {
      releaseColor(agentId, projectRoot);
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to create tmux pane: ${msg}` };
    }

    // Step 7: Register agent state
    const now = new Date().toISOString();
    const agentState: AgentState = {
      id: agentId,
      name: agentName,
      teamName,
      role,
      model,
      providerId: params.providerId,
      sessionId,
      paneId: paneId || undefined,
      serverPort: serverInfo.port,
      cwd,
      initialPrompt: prompt,
      color,
      status: 'spawning',
      isActive: false,
      createdAt: now,
      heartbeatTs: now,
      consecutiveMisses: 0,
      sessionRotationCount: 0,
    };

    try {
      AgentOperations.registerAgent(agentState, projectRoot);
    } catch (error: unknown) {
      if (paneId) TmuxOperations.killPane(paneId);
      releaseColor(agentId, projectRoot);
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to register agent: ${msg}` };
    }

    // Step 8: Send initial prompt
    const deliveryResult = await ServerManager.sendPromptReliable(
      serverInfo.port,
      sessionId,
      prompt,
      { model: params.model, providerId: params.providerId, hostname: serverInfo.hostname },
    );

    if (!deliveryResult.success) {
      // Agent stays in 'spawning' state — leader can retry prompt later
      console.warn(
        `Prompt delivery failed for agent ${agentId}: ${deliveryResult.error}. Agent is in 'spawning' state.`,
      );
    }

    // Step 9: Update status to 'active'
    try {
      AgentOperations.updateAgentState(
        agentId,
        { status: 'active', isActive: true, heartbeatTs: new Date().toISOString() },
        projectRoot,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to update agent status to active: ${msg}`);
    }

    // Step 10: Return success
    return {
      success: true,
      agentId,
      sessionId,
      paneId: paneId || undefined,
      name: agentName,
      color,
      port: serverInfo.port,
    };
  },
};
