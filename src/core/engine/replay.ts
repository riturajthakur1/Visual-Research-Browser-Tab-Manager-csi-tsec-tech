// Timeline replay: rebuilds the map as it was at any moment from the event log.
import type { ID, Question, TrailEvent, TrailNode } from '../types';

export interface Snapshot {
  questions: Question[];
  nodes: TrailNode[];
}

export function snapshotAt(t: number, questions: Question[], nodes: TrailNode[], events: TrailEvent[]): Snapshot {
  const past = events.filter((e) => e.at <= t).sort((a, b) => a.at - b.at || (a.seq ?? 0) - (b.seq ?? 0));
  const attachAt = new Map<ID, ID | null>();
  const highlightsAt = new Map<ID, number>();
  for (const e of past) {
    if (e.type === 'node.attach' && e.nodeId) attachAt.set(e.nodeId, e.questionId ?? null);
    if (e.type === 'highlight.add' && e.nodeId) highlightsAt.set(e.nodeId, (highlightsAt.get(e.nodeId) ?? 0) + 1);
  }
  const qs = questions.filter((q) => q.createdAt <= t);
  const ns = nodes
    .filter((n) => n.createdAt <= t)
    .map((n) => {
      // Before its first attach event a page was still being matched: show it parked.
      const qid = attachAt.get(n.id) ?? null;
      return {
        ...n,
        attach: n.attach ? { ...n.attach, questionId: qid } : undefined,
        highlights: n.highlights.slice(0, highlightsAt.get(n.id) ?? 0),
      } as TrailNode;
    });
  return { questions: qs, nodes: ns };
}

export function timelineBounds(questions: Question[], nodes: TrailNode[], events: TrailEvent[]): [number, number] {
  const times = [...questions.map((q) => q.createdAt), ...nodes.map((n) => n.createdAt), ...events.map((e) => e.at)];
  if (!times.length) return [Date.now(), Date.now()];
  return [Math.min(...times), Math.max(...times)];
}
