import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '../src/operations/session-manager-cli';
import { SessionMetadataSchema } from '../src/types/schemas';

describe('SessionManager (CLI)', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
    tempDir = mkdtempSync(`${tmpdir()}/session-cli-test-`);
    process.env.OPENCODE_TEAMS_DIR = tempDir;
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

  const mockSpawnResult = (code: number, stdout = '', stderr = '') => ({
    exitCode: code,
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(stderr),
  } as any);

  // T027: deriveSessionName determinism and uniqueness
  describe('deriveSessionName', () => {
    it('should generate deterministic hash for the same input', () => {
      const projectDir = '/home/user/projects/my-app';
      const name1 = SessionManager.deriveSessionName(projectDir);
      const name2 = SessionManager.deriveSessionName(projectDir);
      expect(name1).toBe(name2);
    });

    it('should match the expected format oc-<dirName>-<hash>', () => {
      const projectDir = '/home/user/projects/my-app';
      const name = SessionManager.deriveSessionName(projectDir);
      expect(name).toMatch(/^oc-my-app-[a-f0-9]{8}$/);
    });

    it('should produce different names for different directories', () => {
      const dir1 = '/home/user/projects/app1';
      const dir2 = '/home/user/projects/app2';
      const name1 = SessionManager.deriveSessionName(dir1);
      const name2 = SessionManager.deriveSessionName(dir2);
      expect(name1).not.toBe(name2);
    });

    it('should sanitize directory names', () => {
      const projectDir = '/home/user/projects/My@Project!';
      const name = SessionManager.deriveSessionName(projectDir);
      expect(name).toMatch(/^oc-MyProject-[a-f0-9]{8}$/);
    });
  });

  // T028: detectSession with mock tmux
  describe('detectSession', () => {
    it('should return null when no metadata file exists', () => {
      const projectDir = '/nonexistent/project';
      const result = SessionManager.detectSession(projectDir);
      expect(result).toBeNull();
    });

    it('should return metadata when file exists and tmux session is active', () => {
      const projectDir = '/test/project';
      const sessionName = SessionManager.deriveSessionName(projectDir);
      
      const spawnSpy = spyOn(Bun, 'spawnSync').mockImplementation((args: any) => {
        const cmd = args.map((a: string) => a.toString());
        if (cmd[0] === 'which' && cmd[1] === 'tmux') return mockSpawnResult(0);
        
        if (cmd[0] === 'tmux' && cmd[1] === 'has-session' && cmd[3] === sessionName) {
            return mockSpawnResult(0);
        }
        
        if (cmd[0] === 'tmux' && cmd[1] === 'ls') {
             return mockSpawnResult(1, '', 'no server running');
        }
        if (cmd[0] === 'tmux' && cmd[1] === 'new-session') return mockSpawnResult(0);
        if (cmd[0] === 'tmux' && cmd[1] === 'select-layout') return mockSpawnResult(0);

        return mockSpawnResult(1, '', 'error');
      });

      SessionManager.launchSession(projectDir);
      
      const detected = SessionManager.detectSession(projectDir);
      expect(detected).not.toBeNull();
      expect(detected?.sessionName).toBe(sessionName);
      
      spawnSpy.mockRestore();
    });

    it('should clean up metadata when tmux session is gone', () => {
      const projectDir = '/test/project-dead';
      const sessionName = SessionManager.deriveSessionName(projectDir);
      
      let sessionActive = true;
      const spawnSpy = spyOn(Bun, 'spawnSync').mockImplementation((args: any) => {
        const cmd = args.map((a: string) => a.toString());
        if (cmd[0] === 'which' && cmd[1] === 'tmux') return mockSpawnResult(0);
        
        if (cmd[0] === 'tmux' && cmd[1] === 'ls') {
             return mockSpawnResult(1, '', 'no server running');
        }
        if (cmd[0] === 'tmux' && cmd[1] === 'new-session') return mockSpawnResult(0);
        if (cmd[0] === 'tmux' && cmd[1] === 'select-layout') return mockSpawnResult(0);

        if (cmd[0] === 'tmux' && cmd[1] === 'has-session' && cmd[3] === sessionName) {
            return mockSpawnResult(sessionActive ? 0 : 1);
        }

        return mockSpawnResult(1);
      });

      SessionManager.launchSession(projectDir);
      
      sessionActive = false;
      
      const detected = SessionManager.detectSession(projectDir);
      expect(detected).toBeNull();
      
      const detected2 = SessionManager.detectSession(projectDir);
      expect(detected2).toBeNull();
      
      spawnSpy.mockRestore();
    });
  });

  // T029: metadata read/write with Zod validation
  describe('Metadata Validation', () => {
    it('should validate metadata structure on read', () => {
        const projectDir = '/test/project-valid';
        
        const spawnSpy = spyOn(Bun, 'spawnSync').mockImplementation((args: any) => {
             const cmd = args.map((a: string) => a.toString());
             if (cmd[0] === 'which' && cmd[1] === 'tmux') return mockSpawnResult(0);
             if (cmd[0] === 'tmux' && cmd[1] === 'ls') return mockSpawnResult(1, '', 'no server running');
             if (cmd[0] === 'tmux' && cmd[1] === 'new-session') return mockSpawnResult(0);
             if (cmd[0] === 'tmux' && cmd[1] === 'select-layout') return mockSpawnResult(0);
             if (cmd[0] === 'tmux' && cmd[1] === 'has-session') return mockSpawnResult(0);
             return mockSpawnResult(0);
        });
        
        const launched = SessionManager.launchSession(projectDir);
        const detected = SessionManager.detectSession(projectDir);
        
        expect(detected).toEqual(launched);
        
        spawnSpy.mockRestore();
    });

    it('should fail validation for invalid metadata', () => {
        const projectDir = '/test/project-invalid';
        const sessionName = SessionManager.deriveSessionName(projectDir);
        
        const sessionsDir = join(tempDir, 'sessions');
        try { require('fs').mkdirSync(sessionsDir, { recursive: true }); } catch {}
        
        const metadataPath = join(sessionsDir, `${sessionName}.json`);
        writeFileSync(metadataPath, JSON.stringify({
            foo: 'bar' 
        }));

        const result = SessionManager.detectSession(projectDir);
        expect(result).toBeNull();
    });
    
    it('should apply default values correctly', () => {
        const schema = SessionMetadataSchema;
        const minimal = {
            projectDir: '/p',
            sessionName: 's',
            createdAt: 'd'
        };
        const parsed = schema.parse(minimal);
        expect(parsed.agentPanes).toEqual([]); 
        expect(parsed.autoCleanupEnabled).toBe(true); 
    });
  });
});
