import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPermission,
  checkPermissionByRoleName,
  DEFAULT_ROLE_PERMISSIONS,
  getAgentRole,
  getAgentRoleDefinition,
  guardToolPermission,
} from '../src/operations/role-permissions';

describe('Role Permission System', () => {
  let tempDir: string;
  let originalEnv: typeof process.env;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencode-teams-test-'));
    originalEnv = { ...process.env };
    process.env.OPENCODE_TEAMS_DIR = tempDir;
    delete process.env.OPENCODE_PROJECT_ROOT;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  const createAgentState = (agentId: string, role: string) => ({
    id: agentId,
    name: agentId,
    teamName: 'test-team',
    role,
    model: 'claude-3-5-sonnet',
    sessionId: 'session-1',
    serverPort: 3000,
    cwd: process.cwd(),
    color: '#000000',
    status: 'active',
    isActive: true,
    createdAt: new Date().toISOString(),
    heartbeatTs: new Date().toISOString(),
  });

  describe('checkPermission', () => {
    it('should return false if tool is in deniedTools', () => {
      const role = { name: 'test', deniedTools: ['forbidden-tool'] };
      expect(checkPermission(role, 'forbidden-tool')).toBe(false);
    });

    it('should return true if tool is not in deniedTools (default allow)', () => {
      const role = { name: 'test', deniedTools: ['other-tool'] };
      expect(checkPermission(role, 'allowed-tool')).toBe(true);
    });

    it('should return true if tool is in allowedTools', () => {
      const role = { name: 'test', allowedTools: ['specific-tool'] };
      expect(checkPermission(role, 'specific-tool')).toBe(true);
    });

    it('should return false if tool is not in allowedTools (whitelist mode)', () => {
      const role = { name: 'test', allowedTools: ['specific-tool'] };
      expect(checkPermission(role, 'other-tool')).toBe(false);
    });

    it('should prioritize deniedTools over allowedTools', () => {
      const role = {
        name: 'test',
        allowedTools: ['conflict-tool'],
        deniedTools: ['conflict-tool'],
      };
      expect(checkPermission(role, 'conflict-tool')).toBe(false);
    });

    it('should allow all if permissions are empty/undefined', () => {
      const role = { name: 'test' };
      expect(checkPermission(role, 'any-tool')).toBe(true);
    });
  });

  describe('checkPermissionByRoleName', () => {
    it('leader should be denied claim-task', () => {
      expect(checkPermissionByRoleName('leader', 'claim-task')).toBe(false);
    });

    it('leader should be allowed spawn-team', () => {
      expect(checkPermissionByRoleName('leader', 'spawn-team')).toBe(true);
    });

    it('worker should be denied management tools', () => {
      expect(checkPermissionByRoleName('worker', 'spawn-team')).toBe(false);
      expect(checkPermissionByRoleName('worker', 'spawn-agent')).toBe(false);
      expect(checkPermissionByRoleName('worker', 'kill-agent')).toBe(false);
      expect(checkPermissionByRoleName('worker', 'delete-team')).toBe(false);
    });

    it('worker should be allowed claim-task', () => {
      expect(checkPermissionByRoleName('worker', 'claim-task')).toBe(true);
    });

    it('reviewer should include specific allowed tools', () => {
      expect(checkPermissionByRoleName('reviewer', 'update-task')).toBe(true);
      expect(checkPermissionByRoleName('reviewer', 'send-message')).toBe(true);
      expect(checkPermissionByRoleName('reviewer', 'poll-inbox')).toBe(true);
      expect(checkPermissionByRoleName('reviewer', 'heartbeat')).toBe(true);
    });

    it('reviewer should be denied claim-task', () => {
      expect(checkPermissionByRoleName('reviewer', 'claim-task')).toBe(false);
    });

    it('task-manager should be denied team infrastructure tools', () => {
      expect(checkPermissionByRoleName('task-manager', 'spawn-team')).toBe(false);
      expect(checkPermissionByRoleName('task-manager', 'spawn-agent')).toBe(false);
    });

    it('task-manager should be allowed task tools', () => {
      expect(checkPermissionByRoleName('task-manager', 'create-task')).toBe(true);
      expect(checkPermissionByRoleName('task-manager', 'update-task')).toBe(true);
    });

    it('unknown role should allow all tools', () => {
      expect(checkPermissionByRoleName('unknown-role', 'any-tool')).toBe(true);
    });
  });

  describe('getAgentRole', () => {
    it('should return "worker" for nonexistent agent state', () => {
      expect(getAgentRole('nonexistent-agent')).toBe('worker');
    });

    it('should return role from state file', () => {
      const agentId = 'test-agent';
      const stateDir = join(tempDir, 'agents');
      const fs = require('node:fs');
      fs.mkdirSync(stateDir, { recursive: true });
      writeFileSync(
        join(stateDir, `${agentId}.json`),
        JSON.stringify(createAgentState(agentId, 'leader')),
      );

      expect(getAgentRole(agentId)).toBe('leader');
    });
  });

  describe('getAgentRoleDefinition', () => {
    it('should return default role definition when no team specified', () => {
      const agentId = 'test-agent';
      const stateDir = join(tempDir, 'agents');
      const fs = require('node:fs');
      fs.mkdirSync(stateDir, { recursive: true });
      writeFileSync(
        join(stateDir, `${agentId}.json`),
        JSON.stringify(createAgentState(agentId, 'leader')),
      );

      const roleDef = getAgentRoleDefinition(agentId);
      expect(roleDef).toBeDefined();
      expect(roleDef?.name).toBe('leader');
      expect(roleDef?.deniedTools).toContain('claim-task');
    });
  });

  describe('guardToolPermission', () => {
    it('should not throw if OPENCODE_AGENT_ID is not set', () => {
      delete process.env.OPENCODE_AGENT_ID;
      expect(() => guardToolPermission('spawn-team')).not.toThrow();
    });

    it('should throw for denied tool', () => {
      const agentId = 'leader-agent';
      const stateDir = join(tempDir, 'agents');
      const fs = require('node:fs');
      fs.mkdirSync(stateDir, { recursive: true });
      writeFileSync(
        join(stateDir, `${agentId}.json`),
        JSON.stringify(createAgentState(agentId, 'leader')),
      );

      process.env.OPENCODE_AGENT_ID = agentId;

      expect(() => guardToolPermission('claim-task')).toThrow(/Permission denied/);
    });

    it('should allow permitted tool', () => {
      const agentId = 'worker-agent';
      const stateDir = join(tempDir, 'agents');
      const fs = require('node:fs');
      fs.mkdirSync(stateDir, { recursive: true });
      writeFileSync(
        join(stateDir, `${agentId}.json`),
        JSON.stringify(createAgentState(agentId, 'worker')),
      );

      process.env.OPENCODE_AGENT_ID = agentId;

      expect(() => guardToolPermission('claim-task')).not.toThrow();
    });
  });

  describe('DEFAULT_ROLE_PERMISSIONS', () => {
    it('should have exactly 4 entries', () => {
      expect(DEFAULT_ROLE_PERMISSIONS.size).toBe(4);
    });

    it('should contain expected roles', () => {
      expect(DEFAULT_ROLE_PERMISSIONS.has('leader')).toBe(true);
      expect(DEFAULT_ROLE_PERMISSIONS.has('worker')).toBe(true);
      expect(DEFAULT_ROLE_PERMISSIONS.has('reviewer')).toBe(true);
      expect(DEFAULT_ROLE_PERMISSIONS.has('task-manager')).toBe(true);
    });
  });
});
