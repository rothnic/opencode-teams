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
  type HeartbeatSource,
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
import { TaskOperations } from './task';
import { TeamOperations } from './team';
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

  /**
   * Immediately terminate an agent, bypassing graceful shutdown.
   * Kills pane, reassigns tasks, releases color, updates state, removes from team.
   */
  async forceKill(params: {
    teamName: string;
    agentId: string;
    reason?: string;
    projectRoot?: string;
  }): Promise<{
    success: boolean;
    reassignedTasks: string[];
    error?: string;
  }> {
    const { teamName, agentId, reason, projectRoot } = params;

    const agent = AgentOperations.getAgentState(agentId, projectRoot);
    if (!agent) {
      return { success: false, reassignedTasks: [], error: `Agent '${agentId}' not found` };
    }
    if (agent.status === 'terminated') {
      return {
        success: false,
        reassignedTasks: [],
        error: `Agent '${agentId}' is already terminated`,
      };
    }

    if (agent.paneId) {
      try {
        TmuxOperations.killPane(agent.paneId);
      } catch {
        // Pane may already be dead
      }
    }

    const reassignedTasks = TaskOperations.reassignAgentTasks(teamName, agentId, projectRoot);

    releaseColor(agentId, projectRoot);

    AgentOperations.updateAgentState(
      agentId,
      {
        status: 'terminated',
        isActive: false,
        terminatedAt: new Date().toISOString(),
        lastError: reason ? `Force killed: ${reason}` : 'Force killed',
      },
      projectRoot,
    );

    AgentOperations._removeFromTeam(teamName, agentId, projectRoot);

    return { success: true, reassignedTasks };
  },

  /**
   * Initiate graceful shutdown (Phase 1 of FR-003).
   * Sends shutdown_request to agent's inbox. Does NOT terminate immediately.
   */
  requestGracefulShutdown(params: {
    teamName: string;
    requesterAgentId: string;
    targetAgentId: string;
    reason?: string;
    projectRoot?: string;
  }): {
    success: boolean;
    phase: string;
    error?: string;
  } {
    const { teamName, requesterAgentId, targetAgentId, reason, projectRoot } = params;

    const agent = AgentOperations.getAgentState(targetAgentId, projectRoot);
    if (!agent) {
      return { success: false, phase: 'requested', error: `Agent '${targetAgentId}' not found` };
    }
    if (agent.status === 'terminated') {
      return {
        success: false,
        phase: 'requested',
        error: `Agent '${targetAgentId}' is already terminated`,
      };
    }
    if (agent.status === 'shutting_down') {
      return {
        success: false,
        phase: 'requested',
        error: 'Agent already in shutdown. Use force=true to override.',
      };
    }

    const shutdownMessage = JSON.stringify({
      id: globalThis.crypto.randomUUID(),
      requesterAgentId,
      targetAgentId,
      teamName,
      reason,
      phase: 'requested',
      force: false,
      requestedAt: new Date().toISOString(),
    });

    TeamOperations._sendTypedMessage(
      teamName,
      targetAgentId,
      shutdownMessage,
      'shutdown_request',
      requesterAgentId,
    );

    AgentOperations.updateAgentState(targetAgentId, { status: 'shutting_down' }, projectRoot);

    return { success: true, phase: 'requested' };
  },

  /**
   * Remove an agent from TeamConfig.members[].
   * Internal helper — does NOT update agent state.
   */
  _removeFromTeam(teamName: string, agentId: string, projectRoot?: string): void {
    const configPath = getTeamConfigPath(teamName, projectRoot);
    const lockPath = getTeamLockPath(teamName, projectRoot);

    if (!fileExists(configPath)) return;

    lockedUpdate(lockPath, configPath, TeamConfigSchema, (config) => {
      const filtered = config.members.filter((m) => m.agentId !== agentId);
      // TeamConfigSchema requires at least 1 member — keep leader
      if (filtered.length === 0) return config;
      return { ...config, members: filtered };
    });
  },

  updateHeartbeat(
    agentId: string,
    source: HeartbeatSource,
    metadata?: Record<string, unknown>,
    projectRoot?: string,
  ): {
    success: boolean;
    heartbeatTs: string;
    nextDeadline: string;
    agentStatus: string;
    error?: string;
  } {
    const agent = AgentOperations.getAgentState(agentId, projectRoot);
    if (!agent) {
      return {
        success: false,
        heartbeatTs: '',
        nextDeadline: '',
        agentStatus: '',
        error: `Agent '${agentId}' not found`,
      };
    }
    if (agent.status === 'terminated' || agent.status === 'inactive') {
      return {
        success: false,
        heartbeatTs: '',
        nextDeadline: '',
        agentStatus: agent.status,
        error: `Cannot heartbeat for ${agent.status} agent`,
      };
    }

    const now = new Date();
    const heartbeatTs = now.toISOString();
    const nextDeadline = new Date(now.getTime() + 60_000).toISOString();

    let statusUpdate: AgentStatus | undefined;
    if (source === 'sdk_session_idle' && agent.status === 'active') {
      statusUpdate = 'idle';
    } else if (
      (source === 'sdk_session_updated' || source === 'sdk_tool_execute') &&
      agent.status === 'idle'
    ) {
      statusUpdate = 'active';
    } else if (source === 'tool' && agent.status === 'spawning') {
      statusUpdate = 'active';
    }

    const updates: Partial<AgentState> = {
      heartbeatTs,
      consecutiveMisses: 0,
      ...(statusUpdate && { status: statusUpdate, isActive: statusUpdate !== 'inactive' }),
    };

    const updated = AgentOperations.updateAgentState(agentId, updates, projectRoot);

    return {
      success: true,
      heartbeatTs,
      nextDeadline,
      agentStatus: updated.status,
    };
  },

  /**
   * Check all active agents for stale heartbeats.
   * Detection: if (now - heartbeatTs) > 60s, increment consecutiveMisses.
   * If consecutiveMisses >= 2, mark inactive and reassign tasks.
   */
  sweepStaleAgents(projectRoot?: string): string[] {
    const activeAgents = AgentOperations.listAgents({ isActive: true }, projectRoot);
    const now = Date.now();
    const staleIds: string[] = [];

    for (const agent of activeAgents) {
      const lastHeartbeat = new Date(agent.heartbeatTs).getTime();
      const elapsed = now - lastHeartbeat;

      if (elapsed > 60_000) {
        const newMisses = agent.consecutiveMisses + 1;

        if (newMisses >= 2) {
          AgentOperations.updateAgentState(
            agent.id,
            {
              status: 'inactive',
              isActive: false,
              consecutiveMisses: newMisses,
              lastError: `Heartbeat timeout: ${Math.round(elapsed / 1000)}s since last heartbeat`,
            },
            projectRoot,
          );

          TaskOperations.reassignAgentTasks(agent.teamName, agent.id, projectRoot);

          try {
            const teamConfig = readValidatedJSON(
              getTeamConfigPath(agent.teamName, projectRoot),
              TeamConfigSchema,
            );
            TeamOperations._sendTypedMessage(
              agent.teamName,
              teamConfig.leader,
              `Agent ${agent.name} (${agent.id}) became inactive. Heartbeat timeout after ${Math.round(elapsed / 1000)}s. Tasks reassigned.`,
              'plain',
              'system',
            );
          } catch {
            // Team config read failure — skip notification
          }

          staleIds.push(agent.id);
        } else {
          AgentOperations.updateAgentState(agent.id, { consecutiveMisses: newMisses }, projectRoot);
        }
      }
    }

    return staleIds;
  },

  startStaleSweep(intervalMs = 15_000, projectRoot?: string): ReturnType<typeof setInterval> {
    return setInterval(() => {
      try {
        AgentOperations.sweepStaleAgents(projectRoot);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[StaleSweep] Error during sweep: ${msg}`);
      }
    }, intervalMs);
  },

  async startHeartbeatMonitor(
    serverPort: number,
    hostname = '127.0.0.1',
    projectRoot?: string,
  ): Promise<AbortController> {
    const controller = new AbortController();

    const client = await ServerManager.createClient(serverPort, hostname);

    (async () => {
      try {
        const stream = (client as Record<string, any>).event?.list?.();
        if (!stream) return;

        for await (const event of stream) {
          if (controller.signal.aborted) break;

          const sessionId = (event as Record<string, any>).properties?.sessionID;
          if (!sessionId) continue;

          const agent = AgentOperations.findAgentBySessionId(sessionId as string, projectRoot);
          if (!agent) continue;

          const eventType = (event as Record<string, any>).type;
          switch (eventType) {
            case 'session.idle':
              AgentOperations.updateHeartbeat(agent.id, 'sdk_session_idle', undefined, projectRoot);
              break;
            case 'session.updated':
              AgentOperations.updateHeartbeat(
                agent.id,
                'sdk_session_updated',
                undefined,
                projectRoot,
              );
              break;
            case 'tool.execute.after':
              AgentOperations.updateHeartbeat(agent.id, 'sdk_tool_execute', undefined, projectRoot);
              break;
            case 'session.error':
              await AgentOperations.handleSessionError(
                agent,
                (event as Record<string, any>).properties || {},
                projectRoot,
              );
              break;
          }
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(`[HeartbeatMonitor] SSE stream disconnected: ${msg}`);
        }
      }
    })();

    return controller;
  },

  async handleSessionError(
    agent: AgentState,
    eventProperties: Record<string, unknown>,
    projectRoot?: string,
  ): Promise<void> {
    const errorMessage = String(
      eventProperties.error || eventProperties.message || 'Unknown error',
    );

    if (errorMessage.includes('context') || errorMessage.includes('token limit')) {
      await AgentOperations.recoverContextLimit(agent, projectRoot);
    } else if (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('503') ||
      errorMessage.includes('529')
    ) {
      AgentOperations.updateAgentState(
        agent.id,
        { lastError: `Transient error: ${errorMessage}` },
        projectRoot,
      );
    } else {
      AgentOperations.updateAgentState(
        agent.id,
        { lastError: `Session error: ${errorMessage}` },
        projectRoot,
      );
    }
  },

  async recoverContextLimit(agent: AgentState, projectRoot?: string): Promise<void> {
    const title = `teams::${agent.teamName}::agent::${agent.id}::role::${agent.role}`;
    const { sessionId: newSessionId } = await ServerManager.createSession(
      agent.serverPort,
      title,
      agent.cwd,
    );

    let capturedContext = '';
    if (agent.paneId) {
      const output = TmuxOperations.capturePaneOutput(agent.paneId, 200);
      if (output) {
        capturedContext = output;
      }

      TmuxOperations.sendKeys(agent.paneId, 'C-c', false);
      await Bun.sleep(500);

      const attachCmd = `opencode attach --session ${newSessionId} http://127.0.0.1:${agent.serverPort}`;
      TmuxOperations.sendKeys(agent.paneId, attachCmd);

      TmuxOperations.setPaneOption(agent.paneId, '@opencode_session_id', newSessionId);
    }

    const continuationPrompt = capturedContext
      ? `You are continuing from a previous session that hit the context limit. Here is the last visible output from your terminal:\n\n---\n${capturedContext.slice(-2000)}\n---\n\nPlease continue your work from where you left off.`
      : 'You are continuing from a previous session that hit the context limit. Please check your team inbox and task queue for context, then continue your work.';

    await ServerManager.sendPromptReliable(agent.serverPort, newSessionId, continuationPrompt);

    AgentOperations.updateAgentState(
      agent.id,
      {
        sessionId: newSessionId,
        sessionRotationCount: agent.sessionRotationCount + 1,
        lastError: `Context limit: rotated to session ${newSessionId}`,
        heartbeatTs: new Date().toISOString(),
        consecutiveMisses: 0,
      },
      projectRoot,
    );
  },
};
