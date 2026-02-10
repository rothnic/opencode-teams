export interface E2EAgentRole {
  role: 'planner' | 'builder' | 'reviewer';
  name: string;
}

export interface E2ETaskDef {
  title: string;
  description?: string;
  dependencies?: string[];
  assignTo?: string;
}

export interface E2EExpectedOutcome {
  allTasksCompleted: boolean;
  reviewCycles?: number;
  maxDurationMs: number;
}

export interface E2EScenario {
  name: string;
  description: string;
  agents: E2EAgentRole[];
  tasks: E2ETaskDef[];
  expectedOutcome: E2EExpectedOutcome;
}

export interface E2EScenarioResult {
  scenario: string;
  passed: boolean;
  durationMs: number;
  acceptanceCriteria: Array<{ name: string; passed: boolean; error?: string }>;
}

export interface E2EHarnessConfig {
  model: string;
  providerId?: string;
  recording: boolean;
  outputDir?: string;
  scenarioTimeoutMs: number;
  setupTimeoutMs: number;
  cleanupTimeoutMs: number;
  maxReworkCycles: number;
}
