// Timeline replay: rebuilds the map as it was at any moment from the event log.
import type { ID, Question, TrailEvent, TrailNode } from '../types';

export interface Snapshot {
  questions: Question[];
  nodes: TrailNode[];
}

export function snapshotAt(t: number, questions: Question[], nodes: TrailNode[], events: TrailEvent[]): Snapshot {
  const past = events.filter((e) => e.at <= t).sort((a, b) => a.at - b.at || (a.seq ?? 0) - (b.seq ?? 0));
  const attachAt = new Map<ID, ID | null>();
  // Pages a teammate captured have no filing history on this machine.
  const tracked = new Set(events.filter((e) => e.type === 'node.attach' && e.nodeId).map((e) => e.nodeId!));
  for (const e of past) {
    if (e.type === 'node.attach' && e.nodeId) attachAt.set(e.nodeId, e.questionId ?? null);
  }
  const qs = questions.filter((q) => q.createdAt <= t);
  const ns = nodes
    .filter((n) => n.createdAt <= t)
    .map((n) => {
      // Before its first attach event a page was still being matched: show it parked.
      const qid = tracked.has(n.id) ? (attachAt.get(n.id) ?? null) : (n.attach?.questionId ?? null);
      return {
        ...n,
        attach: n.attach ? { ...n.attach, questionId: qid } : undefined,
        highlights: n.highlights.filter((h) => h.at <= t),
      } as TrailNode;
    });
  return { questions: qs, nodes: ns };
}

export function timelineBounds(questions: Question[], nodes: TrailNode[], events: TrailEvent[]): [number, number] {
  const times = [...questions.map((q) => q.createdAt), ...nodes.map((n) => n.createdAt), ...events.map((e) => e.at)];
  if (!times.length) return [Date.now(), Date.now()];
  return [Math.min(...times), Math.max(...times)];
}
