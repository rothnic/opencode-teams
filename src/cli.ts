#!/usr/bin/env bun
import { AgentOperations } from './operations/agent';
import { SessionManager } from './operations/session-manager-cli';
import { TaskOperations } from './operations/task';
import { TeamOperations } from './operations/team';
import { TmuxOperations } from './operations/tmux';
import { getAppConfig } from './utils/index';

function printHelp(): void {
  console.log(`
Opencode Teams CLI - Tmux Session Management

Usage:
  opencode-teams list                   List all tmux sessions
  opencode-teams start <name>           Start a new tmux session
  opencode-teams stop <name>            Stop a tmux session
  opencode-teams layout <name> [layout] Apply layout to session
  opencode-teams add-pane <name> [cmd]  Add a pane to session

  opencode-teams launch [team]          Launch project session (detect or create)
  opencode-teams attach                 Attach to project session
  opencode-teams detach                 Detach from project session
  opencode-teams destroy                Destroy project session
  opencode-teams status                 Show all active sessions
  opencode-teams dashboard [team]       Show team dashboard

  opencode-teams help                   Show this help message
`);
}

function formatDashboard(teamName: string): void {
  console.log(`\n=== Team Dashboard: ${teamName} ===\n`);

  try {
    const teamInfo = TeamOperations.getTeamInfo(teamName);
    console.log(`Team: ${teamInfo.name}`);
    console.log(`Leader: ${teamInfo.leader}`);
    console.log(`Members: ${teamInfo.members.length}`);
    console.log(`Created: ${teamInfo.created}`);
  } catch {
    console.log('(Team info unavailable)');
  }

  console.log('\n--- Agents ---');
  try {
    const agents = AgentOperations.listAgents({ teamName });
    if (agents.length === 0) {
      console.log('  No agents active.');
    } else {
      for (const agent of agents) {
        const status = agent.status || 'unknown';
        const name = agent.name || agent.id;
        console.log(`  ${name}: ${status} (role: ${agent.role})`);
      }
    }
  } catch {
    console.log('  (Agent data unavailable)');
  }

  console.log('\n--- Tasks ---');
  try {
    const tasks = TaskOperations.getTasks(teamName);
    if (tasks.length === 0) {
      console.log('  No tasks.');
    } else {
      const pending = tasks.filter((t) => t.status === 'pending').length;
      const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
      const completed = tasks.filter((t) => t.status === 'completed').length;
      console.log(
        `  Total: ${tasks.length} | Pending: ${pending} | In Progress: ${inProgress} | Completed: ${completed}`,
      );
      console.log('');
      for (const task of tasks) {
        const icon =
          task.status === 'completed' ? '[x]' : task.status === 'in_progress' ? '[>]' : '[ ]';
        const owner = task.owner ? ` (${task.owner})` : '';
        console.log(`  ${icon} ${task.title || task.id}${owner}`);
      }
    }
  } catch {
    console.log('  (Task data unavailable)');
  }

  console.log('\n--- Recent Messages ---');
  try {
    const messages = TeamOperations.readMessages(teamName);
    const recent = messages.slice(-5);
    if (recent.length === 0) {
      console.log('  No messages.');
    } else {
      for (const msg of recent) {
        const from = msg.from || 'unknown';
        const text = msg.message.slice(0, 80);
        console.log(`  [${from}] ${text}`);
      }
    }
  } catch {
    console.log('  (Message data unavailable)');
  }

  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const config = getAppConfig();

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
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
          const layout = config.tmux?.layout || 'tiled';
          TmuxOperations.selectLayout(name, layout);
        } else {
          console.error(`Error: Failed to add pane to session: ${name}`);
          process.exit(1);
        }
        break;
      }

      case 'launch': {
        const teamName = args[1];
        const projectDir = process.cwd();
        const session = SessionManager.launchSession(projectDir, teamName);
        console.log(`Session: ${session.sessionName}`);
        console.log(`Project: ${session.projectDir}`);
        console.log(`Created: ${session.createdAt}`);
        if (teamName) {
          console.log(`Team: ${teamName}`);
        }
        break;
      }

      case 'attach': {
        const projectDir = process.cwd();
        const session = SessionManager.detectSession(projectDir);
        if (!session) {
          console.error(
            'Error: No active session for this project. Run "opencode-teams launch" first.',
          );
          process.exit(1);
        }
        const proc = Bun.spawnSync(['tmux', 'attach-session', '-t', session.sessionName], {
          stdio: ['inherit', 'inherit', 'inherit'],
        });
        if (proc.exitCode !== 0) {
          console.error(`Error: Failed to attach to session: ${session.sessionName}`);
          process.exit(1);
        }
        break;
      }

      case 'detach': {
        const projectDir = process.cwd();
        const session = SessionManager.detectSession(projectDir);
        if (!session) {
          console.error('Error: No active session for this project.');
          process.exit(1);
        }
        Bun.spawnSync(['tmux', 'detach-client', '-s', session.sessionName]);
        console.log(`Detached from session: ${session.sessionName}`);
        break;
      }

      case 'destroy': {
        const projectDir = process.cwd();
        const session = SessionManager.detectSession(projectDir);
        if (!session) {
          console.error('Error: No active session for this project.');
          process.exit(1);
        }
        const destroyed = SessionManager.destroySession(session.sessionName);
        if (destroyed) {
          console.log(`Destroyed session: ${session.sessionName}`);
        } else {
          console.error(`Error: Failed to destroy session: ${session.sessionName}`);
          process.exit(1);
        }
        break;
      }

      case 'status': {
        const sessions = SessionManager.listActiveSessions();
        if (sessions.length === 0) {
          console.log('No active sessions.');
        } else {
          console.log(`Active sessions: ${sessions.length}\n`);
          for (const session of sessions) {
            const paneCount = session.agentPanes.length;
            console.log(`  ${session.sessionName}`);
            console.log(`    Project: ${session.projectDir}`);
            console.log(`    Agents: ${paneCount}`);
            console.log(`    Created: ${session.createdAt}`);
            console.log(`    Auto-cleanup: ${session.autoCleanupEnabled ? 'enabled' : 'disabled'}`);
            console.log('');
          }
        }
        break;
      }

      case 'dashboard': {
        const teamName = args[1];
        if (!teamName) {
          const projectDir = process.cwd();
          const session = SessionManager.detectSession(projectDir);
          if (!session) {
            console.log(
              'No active session. Use "opencode-teams dashboard <team-name>" to specify a team.',
            );
            process.exit(0);
          }
          const teams = TeamOperations.discoverTeams();
          if (teams.length === 0) {
            console.log('No teams found.');
          } else {
            for (const team of teams) {
              formatDashboard(team.name);
            }
          }
        } else {
          formatDashboard(teamName);
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
