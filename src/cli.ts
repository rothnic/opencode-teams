#!/usr/bin/env bun
import { TmuxOperations } from './operations/tmux';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(`
Opencode Teams CLI - Tmux Session Management

Usage:
  opencode-teams list               List all tmux sessions
  opencode-teams start <name>       Start a new tmux session
  opencode-teams stop <name>        Stop a tmux session
  opencode-teams help               Show this help message
`);
    return;
  }

  try {
    switch (command) {
      case 'list': {
        const sessions = TmuxOperations.listSessions();
        if (sessions.length === 0) {
          console.log('No active tmux sessions.');
        } else {
          sessions.forEach((s) => console.log(s));
        }
        break;
      }

      case 'start': {
        const name = args[1];
        if (!name) {
          console.error('Error: Session name is required');
          process.exit(1);
        }
        const success = TmuxOperations.startSession(name);
        if (success) {
          console.log(`Started tmux session: ${name}`);
        } else {
          console.error(`Error: Failed to start tmux session: ${name} (it might already exist)`);
          process.exit(1);
        }
        break;
      }

      case 'stop': {
        const name = args[1];
        if (!name) {
          console.error('Error: Session name is required');
          process.exit(1);
        }
        const success = TmuxOperations.stopSession(name);
        if (success) {
          console.log(`Stopped tmux session: ${name}`);
        } else {
          console.error(`Error: Failed to stop tmux session: ${name} (it might not exist)`);
          process.exit(1);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log('Use "opencode-teams help" for usage information.');
        process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
