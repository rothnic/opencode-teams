import { createHash } from 'node:crypto';
import { z } from 'zod';
import { lockedUpsert } from './fs-atomic';
import { getColorPoolPath } from './storage-paths';

export const COLOR_PALETTE = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
] as const;

export const ColorPoolSchema = z.object({
  assignments: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)),
  lastUpdated: z.string().datetime(),
});

export type ColorPool = z.infer<typeof ColorPoolSchema>;

const DEFAULT_POOL: ColorPool = {
  assignments: {},
  lastUpdated: new Date().toISOString(),
};

export function allocateColor(agentId: string, projectRoot?: string): string {
  const poolPath = getColorPoolPath(projectRoot);
  const lockPath = `${poolPath}.lock`;

  const updated = lockedUpsert(lockPath, poolPath, ColorPoolSchema, DEFAULT_POOL, (pool) => {
    if (pool.assignments[agentId]) {
      return pool;
    }

    const usedColors = new Set(Object.values(pool.assignments));

    for (const color of COLOR_PALETTE) {
      if (!usedColors.has(color)) {
        return {
          assignments: { ...pool.assignments, [agentId]: color },
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    const fallback = `#${createHash('md5').update(agentId).digest('hex').slice(0, 6)}`;
    return {
      assignments: { ...pool.assignments, [agentId]: fallback },
      lastUpdated: new Date().toISOString(),
    };
  });

  return updated.assignments[agentId];
}

export function releaseColor(agentId: string, projectRoot?: string): void {
  const poolPath = getColorPoolPath(projectRoot);
  const lockPath = `${poolPath}.lock`;

  lockedUpsert(lockPath, poolPath, ColorPoolSchema, DEFAULT_POOL, (pool) => {
    if (!pool.assignments[agentId]) {
      return pool;
    }

    const { [agentId]: _, ...remaining } = pool.assignments;
    return {
      assignments: remaining,
      lastUpdated: new Date().toISOString(),
    };
  });
}
