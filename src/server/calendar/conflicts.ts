import type { CommitmentLevel, TimeBlockStatus } from "@/types";

export interface IntervalLike {
  id?: string;
  startTime: Date | string;
  endTime: Date | string;
  commitmentLevel?: CommitmentLevel;
  status?: TimeBlockStatus | string;
}

export interface ConflictInfo {
  hasConflict: boolean;
  hasHardConflict: boolean;
  conflictingBlockIds: string[];
}

/**
 * Checks whether two half-open intervals [startA, endA) and [startB, endB) overlap.
 * Adjacent intervals touching at the boundary (endA === startB) do NOT overlap.
 */
export function doIntervalsOverlap(
  startA: Date | string,
  endA: Date | string,
  startB: Date | string,
  endB: Date | string
): boolean {
  const tStartA = typeof startA === "string" ? new Date(startA).getTime() : startA.getTime();
  const tEndA = typeof endA === "string" ? new Date(endA).getTime() : endA.getTime();
  const tStartB = typeof startB === "string" ? new Date(startB).getTime() : startB.getTime();
  const tEndB = typeof endB === "string" ? new Date(endB).getTime() : endB.getTime();

  if (isNaN(tStartA) || isNaN(tEndA) || isNaN(tStartB) || isNaN(tEndB)) {
    return false;
  }

  return tStartA < tEndB && tEndA > tStartB;
}

/**
 * Finds if a candidate hard commitment overlaps with any active (non-cancelled) hard commitment block.
 * Returns the conflicting block if found, or null if none.
 */
export function findHardCommitmentConflict<T extends IntervalLike>(
  candidate: { id?: string; startTime: Date | string; endTime: Date | string },
  existingBlocks: T[]
): T | null {
  for (const block of existingBlocks) {
    if (block.id && candidate.id && block.id === candidate.id) {
      continue;
    }
    if (block.status === "cancelled") {
      continue;
    }
    if (block.commitmentLevel !== "hard") {
      continue;
    }
    if (
      doIntervalsOverlap(
        candidate.startTime,
        candidate.endTime,
        block.startTime,
        block.endTime
      )
    ) {
      return block;
    }
  }
  return null;
}

/**
 * Analyzes an array of time blocks and detects all overlapping pairs.
 * Returns a map of block id -> ConflictInfo.
 */
export function detectConflicts<T extends IntervalLike & { id: string }>(
  blocks: T[]
): Map<string, ConflictInfo> {
  const conflictMap = new Map<string, ConflictInfo>();

  for (const b of blocks) {
    conflictMap.set(b.id, {
      hasConflict: false,
      hasHardConflict: false,
      conflictingBlockIds: [],
    });
  }

  const activeBlocks = blocks.filter((b) => b.status !== "cancelled");

  for (let i = 0; i < activeBlocks.length; i++) {
    const a = activeBlocks[i];
    for (let j = i + 1; j < activeBlocks.length; j++) {
      const b = activeBlocks[j];
      if (doIntervalsOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
        const infoA = conflictMap.get(a.id)!;
        const infoB = conflictMap.get(b.id)!;

        infoA.hasConflict = true;
        infoB.hasConflict = true;

        if (!infoA.conflictingBlockIds.includes(b.id)) {
          infoA.conflictingBlockIds.push(b.id);
        }
        if (!infoB.conflictingBlockIds.includes(a.id)) {
          infoB.conflictingBlockIds.push(a.id);
        }

        const isHardCollision =
          a.commitmentLevel === "hard" || b.commitmentLevel === "hard";
        if (isHardCollision) {
          infoA.hasHardConflict = true;
          infoB.hasHardConflict = true;
        }
      }
    }
  }

  return conflictMap;
}

/**
 * Annotates an array of time blocks with their calculated conflict indicators.
 */
export function annotateBlocksWithConflicts<
  T extends IntervalLike & {
    id: string;
  }
>(
  blocks: T[]
): Array<
  T & {
    hasConflict: boolean;
    hasHardConflict: boolean;
    conflictingBlockIds: string[];
  }
> {
  const conflictMap = detectConflicts(blocks);
  return blocks.map((b) => {
    const info = conflictMap.get(b.id);
    return {
      ...b,
      hasConflict: info?.hasConflict ?? false,
      hasHardConflict: info?.hasHardConflict ?? false,
      conflictingBlockIds: info?.conflictingBlockIds ?? [],
    };
  });
}
