// Background engine jobs, de-duplicated and run one at a time so a burst of
// tab openings does not flood the local model.
import { attachNodes, processNode, refreshConflicts, refreshProposals } from '../core/engine/pipeline';
import type { ID } from '../core/types';

export type Job =
  | { kind: 'node'; nodeId: ID }
  | { kind: 'reattach'; wsId: ID; nodeIds?: ID[] }
  | { kind: 'conflicts'; wsId: ID; force?: boolean }
  | { kind: 'proposals'; wsId: ID };

const pending = new Map<string, Job>();
let running = false;

const keyOf = (job: Job) =>
  job.kind === 'node'
    ? `node:${job.nodeId}`
    : job.kind === 'reattach'
      ? `reattach:${job.wsId}:${job.nodeIds?.join(',') ?? '*'}`
      : `${job.kind}:${job.wsId}`;

async function run(job: Job) {
  switch (job.kind) {
    case 'node':
      return processNode(job.nodeId);
    case 'reattach':
      await attachNodes(job.wsId, job.nodeIds);
      await refreshConflicts(job.wsId);
      return refreshProposals(job.wsId);
    case 'conflicts':
      return refreshConflicts(job.wsId, undefined, job.force);
    case 'proposals':
      return refreshProposals(job.wsId);
  }
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending.size) {
      const [key, job] = pending.entries().next().value as [string, Job];
      pending.delete(key);
      try {
        await run(job);
      } catch (e) {
        console.warn('[thread.io] job failed', job, e);
      }
    }
  } finally {
    running = false;
  }
}

export function enqueue(job: Job) {
  pending.set(keyOf(job), job);
  void drain();
}

let highlightTimer: ReturnType<typeof setTimeout> | undefined;
/** Highlights change coverage and conflict checks; batch rapid ones. */
export function queueHighlightRefresh(wsId: ID) {
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => enqueue({ kind: 'conflicts', wsId }), 1500);
}

export const queueSize = () => pending.size + (running ? 1 : 0);
