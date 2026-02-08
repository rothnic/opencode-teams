#!/usr/bin/env bun
import { TmuxOperations } from './operations/tmux';
import { getAppConfig } from './utils/index';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const config = getAppConfig();

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(`
Opencode Teams CLI - Tmux Session Management

Usage:
  opencode-teams list                   List all tmux sessions
  opencode-teams start <name>           Start a new tmux session
  opencode-teams stop <name>            Stop a tmux session
  opencode-teams layout <name> [layout] Apply layout to session
  opencode-teams add-pane <name> [cmd]  Add a pane to session
  opencode-teams help                   Show this help message
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
          // Apply default layout from config
          const layout = config.tmux?.layout || 'tiled';
          TmuxOperations.selectLayout(name, layout);
          console.log(`Applied default layout: ${layout}`);
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

      case 'layout': {
        const name = args[1];
        const layout = args[2] || config.tmux?.layout || 'tiled';
        if (!name) {
          console.error('Error: Session name is required');
          process.exit(1);
        }
        const success = TmuxOperations.selectLayout(name, layout);
        if (success) {
          console.log(`Applied layout '${layout}' to session: ${name}`);
        } else {
          console.error(`Error: Failed to apply layout to session: ${name}`);
          process.exit(1);
        }
        break;
      }

      case 'add-pane': {
        const name = args[1];
        const cmd = args[2];
        if (!name) {
          console.error('Error: Session name is required');
          process.exit(1);
        }
        const success = TmuxOperations.addPane(name, cmd);
        if (success) {
          console.log(`Added pane to session: ${name}`);
          // Re-apply layout after adding a pane
          const layout = config.tmux?.layout || 'tiled';
          TmuxOperations.selectLayout(name, layout);
        } else {
          console.error(`Error: Failed to add pane to session: ${name}`);
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
