/**
 * Zod Schemas for OpenCode Teams Plugin
 *
 * Runtime-validated schemas for all shared state structures.
 * These schemas ensure data integrity when reading from and writing to disk.
 * Every JSON file on disk must pass through these schemas.
 */

import { z } from 'zod';

// ─── Team Member ───────────────────────────────────────────────────────────

export const TeamMemberSchema = z.object({
  agentId: z.string().min(1, 'agentId must be non-empty'),
  agentName: z.string().min(1, 'agentName must be non-empty'),
  agentType: z.string().min(1, 'agentType must be non-empty'),
  joinedAt: z.string().datetime({ message: 'joinedAt must be ISO 8601' }),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;

// ─── Team Config ───────────────────────────────────────────────────────────

export const TeamConfigSchema = z.object({
  name: z
    .string()
    .min(1, 'Team name must be non-empty')
    .regex(/^[A-Za-z0-9_-]+$/, 'Team name must be alphanumeric with hyphens/underscores'),
  created: z.string().datetime({ message: 'created must be ISO 8601' }),
  leader: z.string().min(1, 'leader must be non-empty'),
  members: z.array(TeamMemberSchema).min(1, 'Team must have at least one member'),
  shutdownApprovals: z.array(z.string()).optional(),
});

export type TeamConfig = z.infer<typeof TeamConfigSchema>;

// ─── Task Status ───────────────────────────────────────────────────────────

export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed']);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// ─── Task ──────────────────────────────────────────────────────────────────

export const TaskSchema = z.object({
  id: z.string().min(1, 'Task ID must be non-empty'),
  title: z.string().default('Untitled Task'),
  description: z.string().optional(),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  status: TaskStatusSchema,
  createdAt: z.string().datetime({ message: 'createdAt must be ISO 8601' }),
  updatedAt: z.string().datetime().optional(),
  owner: z.string().optional(),
  claimedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  dependencies: z.array(z.string()).default([]),
  warning: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

// ─── Task Create Input (for creating new tasks) ───────────────────────────

export const TaskCreateInputSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(['high', 'normal', 'low']).optional(),
  dependencies: z.array(z.string()).optional(),
});

export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>;

// ─── Task Update Input ─────────────────────────────────────────────────────

export const TaskUpdateInputSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
    status: TaskStatusSchema.optional(),
    owner: z.string().optional(),
    claimedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    dependencies: z.array(z.string()).optional(),
    warning: z.string().optional(),
  })
  .strict();

export type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>;

// ─── Message Type ───────────────────────────────────────────────────────────

export const MessageTypeSchema = z.enum([
  'plain',
  'idle',
  'task_assignment',
  'shutdown_request',
  'shutdown_approved',
]);

export type MessageType = z.infer<typeof MessageTypeSchema>;

// ─── Message ───────────────────────────────────────────────────────────────

export const MessageSchema = z.object({
  from: z.string().min(1, 'Sender must be non-empty'),
  to: z.string().min(1, 'Recipient must be non-empty'),
  message: z.string(),
  type: MessageTypeSchema.default('plain'),
  timestamp: z.string().datetime({ message: 'timestamp must be ISO 8601' }),
  read: z.boolean().default(false),
  summary: z.string().optional(),
  recipients: z.array(z.string()).optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// ─── Inbox (array of messages per agent) ───────────────────────────────────

export const InboxSchema = z.array(MessageSchema);

export type Inbox = z.infer<typeof InboxSchema>;

// ─── Team Summary (for discovery listings) ─────────────────────────────────

export const TeamSummarySchema = z.object({
  name: z.string(),
  leader: z.string(),
  memberCount: z.number().int().nonnegative(),
  created: z.string(),
});

export type TeamSummary = z.infer<typeof TeamSummarySchema>;

// ─── Task Filters ──────────────────────────────────────────────────────────

export const TaskFiltersSchema = z.object({
  status: TaskStatusSchema.optional(),
  owner: z.string().optional(),
});

export type TaskFilters = z.infer<typeof TaskFiltersSchema>;

// ─── Leader Info (for team creation) ───────────────────────────────────────

export const LeaderInfoSchema = z.object({
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  agentType: z.string().optional(),
});

export type LeaderInfo = z.infer<typeof LeaderInfoSchema>;
