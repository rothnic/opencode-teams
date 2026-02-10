import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { TmuxOperations } from '../src/operations/tmux';

describe('TmuxOperations', () => {
  afterEach(() => {
    // Reset all mocks
  });

  it('should check if tmux is installed', () => {
    const spy = spyOn(Bun, 'spawnSync').mockImplementation((args: any) => {
      if (args[0] === 'which' && args[1] === 'tmux') {
        return { exitCode: 0 } as any;
      }
      return { exitCode: 1 } as any;
    });

    const isInstalled = TmuxOperations.isTmuxInstalled();
    expect(isInstalled).toBe(true);
    expect(spy).toHaveBeenCalledWith(['which', 'tmux']);
    spy.mockRestore();
  });

  it('should list sessions', () => {
    const spawnSpy = spyOn(Bun, 'spawnSync').mockImplementation((args: any) => {
      if (args[0] === 'which' && args[1] === 'tmux') {
        return { exitCode: 0 } as any;
      }
      if (args[0] === 'tmux' && args[1] === 'ls') {
        return {
          exitCode: 0,
          stdout: Buffer.from(
            'session1: 1 windows (created Sun Feb  8 12:00:00 2026)\nsession2: 2 windows',
          ),
          stderr: Buffer.from(''),
        } as any;
      }
      return { exitCode: 1 } as any;
    });

    const sessions = TmuxOperations.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toContain('session1');
    expect(sessions[1]).toContain('session2');
    spawnSpy.mockRestore();
  });

  it('should return empty list if no sessions', () => {
    const spawnSpy = spyOn(Bun, 'spawnSync').mockImplementation((args: any) => {
      if (args[0] === 'which' && args[1] === 'tmux') {
        return { exitCode: 0 } as any;
      }
      if (args[0] === 'tmux' && args[1] === 'ls') {
        return {
          exitCode: 1,
          stdout: Buffer.from(''),
          stderr: Buffer.from('no server running'),
        } as any;
      }
      return { exitCode: 1 } as any;
    });

    const sessions = TmuxOperations.listSessions();
    expect(sessions).toHaveLength(0);
    spawnSpy.mockRestore();
  });

  it('should start a session', () => {
    const spawnSpy = spyOn(Bun, 'spawnSync').mockImplementation((args: any) => {
      if (args[0] === 'which' && args[1] === 'tmux') {
        return { exitCode: 0 } as any;
      }
      if (args[0] === 'tmux' && args[1] === 'ls') {
        return {
          exitCode: 1,
          stdout: Buffer.from(''),
          stderr: Buffer.from('no server running'),
        } as any;
      }
      if (args[0] === 'tmux' && args[1] === 'new-session') {
        return { exitCode: 0 } as any;
      }
      return { exitCode: 1 } as any;
    });

    const success = TmuxOperations.startSession('test-session');
    expect(success).toBe(true);
    expect(spawnSpy).toHaveBeenCalledWith(['tmux', 'new-session', '-d', '-s', 'test-session']);
    spawnSpy.mockRestore();
  });

  it('should stop a session', () => {
    const spawnSpy = spyOn(Bun, 'spawnSync').mockImplementation((args: any) => {
      if (args[0] === 'which' && args[1] === 'tmux') {
        return { exitCode: 0 } as any;
      }
      if (args[0] === 'tmux' && args[1] === 'kill-session') {
        return { exitCode: 0 } as any;
      }
      return { exitCode: 1 } as any;
    });

    const success = TmuxOperations.stopSession('test-session');
    expect(success).toBe(true);
    expect(spawnSpy).toHaveBeenCalledWith(['tmux', 'kill-session', '-t', 'test-session']);
    spawnSpy.mockRestore();
  });

  it('should select a layout', () => {
    const spawnSpy = spyOn(Bun, 'spawnSync').mockImplementation((args: any) => {
      if (args[0] === 'which' && args[1] === 'tmux') {
        return { exitCode: 0 } as any;
      }
      if (args[0] === 'tmux' && args[1] === 'select-layout') {
        return { exitCode: 0 } as any;
      }
      return { exitCode: 1 } as any;
    });

    const success = TmuxOperations.selectLayout('test-session', 'tiled');
    expect(success).toBe(true);
    expect(spawnSpy).toHaveBeenCalledWith(['tmux', 'select-layout', '-t', 'test-session', 'tiled']);
    spawnSpy.mockRestore();
  });

  it('should add a pane', () => {
    const spawnSpy = spyOn(Bun, 'spawnSync').mockImplementation((args: any) => {
      if (args[0] === 'which' && args[1] === 'tmux') {
        return { exitCode: 0 } as any;
      }
      if (args[0] === 'tmux' && args[1] === 'split-window') {
        return { exitCode: 0 } as any;
      }
      return { exitCode: 1 } as any;
    });

    const success = TmuxOperations.addPane('test-session');
    expect(success).toBe(true);
    expect(spawnSpy).toHaveBeenCalledWith(['tmux', 'split-window', '-t', 'test-session']);
    spawnSpy.mockRestore();
  });

  it('should add a pane with command', () => {
    const spawnSpy = spyOn(Bun, 'spawnSync').mockImplementation((args: any) => {
      if (args[0] === 'which' && args[1] === 'tmux') {
        return { exitCode: 0 } as any;
      }
      if (args[0] === 'tmux' && args[1] === 'split-window') {
        return { exitCode: 0 } as any;
      }
      return { exitCode: 1 } as any;
    });

    const success = TmuxOperations.addPane('test-session', 'ls');
    expect(success).toBe(true);
    expect(spawnSpy).toHaveBeenCalledWith(['tmux', 'split-window', '-t', 'test-session', 'ls']);
    spawnSpy.mockRestore();
  });
});
