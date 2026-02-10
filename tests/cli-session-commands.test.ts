import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('CLI Session Commands', () => {
  let tempDir: string;
  let homeDir: string;
  let binDir: string;
  let projectDir: string;
  const cliPath = resolve(import.meta.dir, '../src/cli.ts');

  beforeEach(() => {
    tempDir = mkdtempSync(`${tmpdir()}/cli-test-`);
    homeDir = join(tempDir, 'home');
    binDir = join(tempDir, 'bin');
    projectDir = join(tempDir, 'project');

    mkdirSync(homeDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const tmuxMockPath = join(binDir, 'tmux');
    const tmuxScript = `#!/bin/sh
echo "$@" >> "${join(tempDir, 'tmux-args.log')}"
if [ "$1" = "has-session" ]; then
  # Mock that session exists if name is provided (simplified for basic tests)
  exit 0
else
  exit 0
fi
`;
    writeFileSync(tmuxMockPath, tmuxScript);
    chmodSync(tmuxMockPath, '755');
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const runCli = (args: string[]) => {
    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      OPENCODE_TEAMS_DIR: join(homeDir, '.config/opencode/opencode-teams'),
      HOME: homeDir,
    };

    return Bun.spawnSync(['bun', cliPath, ...args], {
      env,
      cwd: projectDir,
    });
  };

  // T030: CLI argument parsing and error handling

  it('should show help text including new commands', () => {
    const result = runCli(['help']);
    const output = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(output).toContain('launch');
    expect(output).toContain('attach');
    expect(output).toContain('detach');
    expect(output).toContain('destroy');
    expect(output).toContain('status');
    expect(output).toContain('dashboard');
  });

  it('should show error for unknown commands', () => {
    const result = runCli(['unknown-command']);
    const output = result.stderr.toString();

    expect(result.exitCode).toBe(1);
    expect(output).toContain('Unknown command: unknown-command');
  });

  it('should require session name for basic commands', () => {
    const result = runCli(['start']);
    const output = result.stderr.toString();

    expect(result.exitCode).toBe(1);
    expect(output).toContain('Error: Session name is required');
  });

  it('should launch a session', () => {
    const result = runCli(['launch']);
    const output = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(output).toContain('Session: oc-project');
    expect(output).toContain('Created:');
  });

  it('should show status', () => {
    runCli(['launch']);

    const result = runCli(['status']);
    const output = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(output).toContain('Active sessions:');
    expect(output).toContain('oc-project');
  });
});
