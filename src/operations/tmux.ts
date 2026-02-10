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

  /**
   * Split window and return the new pane ID.
   * @returns pane ID string (e.g., "%42") or null on failure
   */
  static splitWindow(sessionName: string, workingDir?: string): string | null {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    const args = ['tmux', 'split-window', '-t', sessionName, '-PF', '#{pane_id}'];
    if (workingDir) {
      args.push('-c', workingDir);
    }

    const proc = Bun.spawnSync(args);
    if (proc.exitCode !== 0) {
      return null;
    }

    return proc.stdout.toString().trim();
  }

  /**
   * Send keys to a tmux pane.
   * @param paneId - Target pane (e.g., "%42")
   * @param keys - Keys/command to send
   * @param enterKey - Whether to append Enter keystroke (default: true)
   */
  static sendKeys(paneId: string, keys: string, enterKey = true): boolean {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    const args = ['tmux', 'send-keys', '-t', paneId, keys];
    if (enterKey) {
      args.push('Enter');
    }

    const proc = Bun.spawnSync(args);
    return proc.exitCode === 0;
  }

  /**
   * Capture pane output.
   * @param paneId - Target pane
   * @param lines - Number of lines to capture (default: 100)
   * @returns Captured text or null on failure
   */
  static capturePaneOutput(paneId: string, lines = 100): string | null {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    const proc = Bun.spawnSync(['tmux', 'capture-pane', '-t', paneId, '-p', '-S', `-${lines}`]);
    if (proc.exitCode !== 0) {
      return null;
    }

    return proc.stdout.toString();
  }

  /**
   * Set a custom option on a tmux pane.
   * Option names should start with '@' (tmux user option convention).
   */
  static setPaneOption(paneId: string, key: string, value: string): boolean {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    const proc = Bun.spawnSync(['tmux', 'set-option', '-p', '-t', paneId, key, value]);
    return proc.exitCode === 0;
  }

  /**
   * Get a custom option from a tmux pane.
   * @returns Option value or null if not set
   */
  static getPaneOption(paneId: string, key: string): string | null {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    const proc = Bun.spawnSync(['tmux', 'show-options', '-p', '-t', paneId, '-v', key]);
    if (proc.exitCode !== 0) {
      return null;
    }

    return proc.stdout.toString().trim() || null;
  }

  /**
   * Kill a tmux pane.
   * @returns true if pane was killed successfully
   */
  static killPane(paneId: string): boolean {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    const proc = Bun.spawnSync(['tmux', 'kill-pane', '-t', paneId]);
    return proc.exitCode === 0;
  }

  /**
   * Set the title of a tmux pane.
   * Format convention: {session}__{type}_{index}
   */
  static setPaneTitle(paneId: string, title: string): boolean {
    if (!TmuxOperations.isTmuxInstalled()) {
      throw new Error('tmux is not installed');
    }

    const proc = Bun.spawnSync(['tmux', 'select-pane', '-t', paneId, '-T', title]);
    return proc.exitCode === 0;
  }

  /**
   * Check if the current process is running inside a tmux session.
   */
  static isInsideTmux(): boolean {
    return !!process.env.TMUX;
  }
}
