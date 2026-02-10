/**
 * Operations for managing Tmux sessions
 */
export class TmuxOperations {
  /**
   * Check if tmux is installed on the system
   */
  static isTmuxInstalled(): boolean {
    try {
      const proc = Bun.spawnSync(['which', 'tmux']);
      return proc.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * List all tmux sessions
   */
  static listSessions(): string[] {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    const proc = Bun.spawnSync(['tmux', 'ls']);
    if (proc.exitCode !== 0) {
      // tmux ls returns 1 if there are no sessions
      const stderr = proc.stderr.toString();
      if (stderr.includes('no server running') || stderr.includes('error connecting to')) {
        return [];
      }
    }

    const output = proc.stdout.toString().trim();
    return output ? output.split('\n') : [];
  }

  /**
   * Start a new tmux session
   */
  static startSession(sessionName: string): boolean {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    // Check if session already exists
    const sessions = TmuxOperations.listSessions();
    if (sessions.some((s) => s.startsWith(`${sessionName}:`))) {
      return false;
    }

    const proc = Bun.spawnSync(['tmux', 'new-session', '-d', '-s', sessionName]);
    return proc.exitCode === 0;
  }

  /**
   * Stop a tmux session
   */
  static stopSession(sessionName: string): boolean {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    const proc = Bun.spawnSync(['tmux', 'kill-session', '-t', sessionName]);
    return proc.exitCode === 0;
  }

  /**
   * Select a layout for the current window in a tmux session
   */
  static selectLayout(sessionName: string, layout: string): boolean {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    const proc = Bun.spawnSync(['tmux', 'select-layout', '-t', sessionName, layout]);
    return proc.exitCode === 0;
  }

  /**
   * Add a new pane to the current window in a tmux session
   */
  static addPane(sessionName: string, command?: string): boolean {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    const args = ['tmux', 'split-window', '-t', sessionName];
    if (command) {
      args.push(command);
    }

    const proc = Bun.spawnSync(args);
    return proc.exitCode === 0;
  }
}
