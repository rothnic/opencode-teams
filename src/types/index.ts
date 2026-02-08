/**
 * Type definitions for OpenCode Teams Plugin
 */

export interface LeaderInfo {
  agentId?: string;
  agentName?: string;
  agentType?: string;
}

export interface TeamMember {
  agentId: string;
  agentName: string;
  agentType: string;
  joinedAt: string;
}

export interface TeamConfig {
  name: string;
  created: string;
  leader: string;
  members: TeamMember[];
  shutdownApprovals?: string[]; // Array of agent IDs who approved shutdown
}

export interface Message {
  from: string;
  to: string;
  message: string;
  timestamp: string;
  recipients?: string[];
}

export interface Task {
  id: string;
  title?: string;
  description?: string;
  priority?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  owner?: string;
  claimedAt?: string;
  completedAt?: string;
  dependencies?: string[]; // Array of task IDs
  warning?: string;
  [key: string]: any;
}

export interface TeamSummary {
  name: string;
  leader: string;
  memberCount: number;
  created: string;
}

export interface TaskFilters {
  status?: string;
  owner?: string;
}

export interface JoinResult {
  success: boolean;
  team: string;
}

export interface TmuxConfig {
  enabled?: boolean;
  layout?: string;
  mainPaneSize?: number;
  autoCleanup?: boolean;
}

export interface AppConfig {
  tmux?: TmuxConfig;
}
