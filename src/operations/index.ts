/**
 * Operations Module Barrel Exports
 *
 * Re-exports all operation modules for convenient access.
 */

export { AgentOperations } from './agent';
export {
  checkPermission,
  checkPermissionByRoleName,
  DEFAULT_ROLE_PERMISSIONS,
  getAgentRole,
  getAgentRoleDefinition,
  guardToolPermission,
} from './role-permissions';
export { ServerManager } from './server-manager';
export { SessionManager } from './session-manager-cli';
export { TaskOperations } from './task';
export { TeamOperations } from './team';
export { getBuiltinTemplates, TemplateOperations } from './template';
export { TmuxOperations } from './tmux';
export type { WorkflowSuggestion } from './workflow-monitor';
export { WorkflowMonitor } from './workflow-monitor';
