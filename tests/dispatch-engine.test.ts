import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DispatchEngine } from '../src/operations/dispatch-engine';
import { TeamOperations } from '../src/operations/team';
import { TaskOperations } from '../src/operations/task';
import { AgentOperations } from '../src/operations/agent';
import { 
  type DispatchRule, 
  type TeamConfig, 
  TeamConfigSchema,
  type AgentState
} from '../src/types/schemas';
import { getTeamConfigPath } from '../src/utils/storage-paths';
import { writeAtomicJSON } from '../src/utils/fs-atomic';

describe('DispatchEngine', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
    savedEnv.OPENCODE_AGENT_ID = process.env.OPENCODE_AGENT_ID;

    tempDir = mkdtempSync(join(tmpdir(), 'dispatch-test-'));
    process.env.OPENCODE_TEAMS_DIR = tempDir;
    
    DispatchEngine._dispatchDepth = 0;
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  const setupTeam = (teamName: string, rules: DispatchRule[] = []) => {
    const config = TeamOperations.spawnTeam(teamName, { agentId: 'leader-1' });
    const configPath = getTeamConfigPath(teamName);
    
    const updatedConfig: TeamConfig = {
      ...config,
      dispatchRules: rules
    };
    writeAtomicJSON(configPath, updatedConfig, TeamConfigSchema);
    
    return updatedConfig;
  };

  describe('evaluateCondition', () => {
    it('evaluates simple_match correctly', async () => {
      const rule: DispatchRule = {
        id: 'rule-1',
        eventType: 'task.created',
        priority: 1,
        enabled: true,
        condition: {
          type: 'simple_match',
          field: 'priority',
          operator: 'eq',
          value: 'high'
        },
        action: { type: 'log' }
      };

      setupTeam('cond-team', [rule]);

      const logSpy = mock(console.log);
      const originalLog = console.log;
      console.log = logSpy;

      try {
        await DispatchEngine.evaluate({
          id: 'evt-1',
          type: 'task.created',
          teamName: 'cond-team',
          timestamp: new Date().toISOString(),
          payload: { priority: 'high' }
        });
        expect(logSpy).toHaveBeenCalled();
        logSpy.mockClear();

        await DispatchEngine.evaluate({
          id: 'evt-2',
          type: 'task.created',
          teamName: 'cond-team',
          timestamp: new Date().toISOString(),
          payload: { priority: 'low' }
        });
        expect(logSpy).not.toHaveBeenCalled();

      } finally {
        console.log = originalLog;
      }
    });

    it('evaluates resource_count for active_agents', async () => {
      const rule: DispatchRule = {
        id: 'rule-active',
        eventType: 'agent.idle',
        priority: 1,
        enabled: true,
        condition: {
          type: 'resource_count',
          resource: 'active_agents',
          operator: 'gte',
          value: 1
        },
        action: { type: 'log' }
      };

      setupTeam('resource-team', [rule]);
      TeamOperations.requestJoin('resource-team', { agentId: 'worker-1' });

      const logSpy = mock(console.log);
      const originalLog = console.log;
      console.log = logSpy;

      try {
        await DispatchEngine.evaluate({
          id: 'evt-1',
          type: 'agent.idle',
          teamName: 'resource-team',
          timestamp: new Date().toISOString(),
          payload: {}
        });
        expect(logSpy).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });

    it('evaluates resource_count for unblocked_tasks', async () => {
        const rule: DispatchRule = {
            id: 'rule-tasks',
            eventType: 'agent.idle',
            priority: 1,
            enabled: true,
            condition: {
              type: 'resource_count',
              resource: 'unblocked_tasks',
              operator: 'gt',
              value: 0
            },
            action: { type: 'log' }
          };
    
          setupTeam('task-count-team', [rule]);
          
          TaskOperations.createTask('task-count-team', { title: 'Task 1' });
    
          const logSpy = mock(console.log);
          const originalLog = console.log;
          console.log = logSpy;
    
          try {
            await DispatchEngine.evaluate({
              id: 'evt-1',
              type: 'agent.idle',
              teamName: 'task-count-team',
              timestamp: new Date().toISOString(),
              payload: {}
            });
            expect(logSpy).toHaveBeenCalled();
          } finally {
            console.log = originalLog;
          }
    });
  });

  describe('executeAction', () => {
    it('assign_task assigns task to idle agent', async () => {
        const teamName = 'assign-team';
        const rule: DispatchRule = {
            id: 'rule-assign',
            eventType: 'agent.idle',
            priority: 1,
            enabled: true,
            action: { type: 'assign_task' }
        };

        setupTeam(teamName, [rule]);
        
        const task = TaskOperations.createTask(teamName, { title: 'Pending Task' });
        
        const agentState: AgentState = {
            id: 'worker-1',
            name: 'Worker',
            teamName: teamName,
            role: 'worker',
            model: 'test-model',
            sessionId: 'sess-1',
            serverPort: 1234,
            cwd: '/tmp',
            color: '#000000',
            status: 'idle',
            isActive: true,
            createdAt: new Date().toISOString(),
            heartbeatTs: new Date().toISOString(),
            consecutiveMisses: 0,
            sessionRotationCount: 0
        };
        AgentOperations.registerAgent(agentState);
        
        await DispatchEngine.evaluate({
            id: 'evt-assign',
            type: 'agent.idle',
            teamName: teamName,
            timestamp: new Date().toISOString(),
            payload: { agentId: 'worker-1' }
        });
        
        const updatedTask = TaskOperations.getTask(teamName, task.id);
        expect(updatedTask.status).toBe('in_progress');
        expect(updatedTask.owner).toBe('worker-1');
    });

    it('notify_leader sends message to leader', async () => {
        const teamName = 'notify-team';
        const rule: DispatchRule = {
            id: 'rule-notify',
            eventType: 'task.completed',
            priority: 1,
            enabled: true,
            action: { 
                type: 'notify_leader', 
                params: { message: 'Task done' } 
            }
        };

        setupTeam(teamName, [rule]);
        
        await DispatchEngine.evaluate({
            id: 'evt-notify',
            type: 'task.completed',
            teamName: teamName,
            timestamp: new Date().toISOString(),
            payload: { taskId: 'task-1' }
        });
        
        const messages = TeamOperations.readMessages(teamName, 'leader-1');
        expect(messages).toHaveLength(1);
        expect(messages[0].message).toBe('Task done');
        expect(messages[0].from).toBe('dispatch-engine');
    });
  });

  describe('Dispatch Logging', () => {
    it('appends log entries and caps at 500', async () => {
        const teamName = 'log-team';
        const rule: DispatchRule = {
            id: 'rule-log',
            eventType: 'session.idle',
            priority: 1,
            enabled: true,
            action: { type: 'log' }
        };
        
        setupTeam(teamName, [rule]);
        
        const originalLog = console.log;
        console.log = () => {};
        
        try {
            for (let i = 0; i < 505; i++) {
                await DispatchEngine.evaluate({
                    id: `evt-${i}`,
                    type: 'session.idle',
                    teamName: teamName,
                    timestamp: new Date().toISOString(),
                    payload: {}
                });
            }
            
            const configPath = getTeamConfigPath(teamName);
            const config = JSON.parse(readFileSync(configPath, 'utf8'));
            
            expect(config.dispatchLog.length).toBe(500);
            expect(config.dispatchLog[0].ruleId).toBe('rule-log');
            
        } finally {
            console.log = originalLog;
        }
    });
  });
  
  describe('Recursion Guard', () => {
      it('stops recursion at max depth', async () => {
          const teamName = 'recursion-team';
          
          DispatchEngine._dispatchDepth = 3;
          
          const rule: DispatchRule = {
            id: 'rule-guard',
            eventType: 'session.idle',
            priority: 1,
            enabled: true,
            action: { type: 'log' }
          };
          setupTeam(teamName, [rule]);
          
          const logSpy = mock(console.warn);
          const originalWarn = console.warn;
          console.warn = logSpy;
          
          try {
              await DispatchEngine.evaluate({
                id: 'evt-guard',
                type: 'session.idle',
                teamName: teamName,
                timestamp: new Date().toISOString(),
                payload: {}
              });
              
              expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Max depth reached'));
              
          } finally {
              console.warn = originalWarn;
              DispatchEngine._dispatchDepth = 0;
          }
      });
  });
});
