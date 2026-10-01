// Turns workspace data into React Flow nodes and edges.
import type { Edge, Node } from '@xyflow/react';
import type { QuestionCoverage } from '../../core/engine/coverage';
import { layoutMap } from '../../core/layout';
import type { CoverageStatus, Link, Question, TrailNode, Workspace } from '../../core/types';

export interface GraphOptions {
  showSearches: boolean;
  showTrail: boolean;
}

export type GoalData = { ws: Workspace; questions: Question[]; coverage: Map<string, QuestionCoverage> };
export type QuestionData = { q: Question; index: number; coverage?: QuestionCoverage };
export type PageData = { node: TrailNode; status?: CoverageStatus; questionIndex?: number };
export type SearchData = { node: TrailNode };
export type NoteData = { node: TrailNode };
export type ParkingData = { count: number };

export function buildGraph(
  ws: Workspace,
  questions: Question[],
  nodes: TrailNode[],
  links: Link[],
  coverage: Map<string, QuestionCoverage>,
  opts: GraphOptions,
): { nodes: Node[]; edges: Edge[] } {
  const { placed, parking } = layoutMap(questions, nodes, { showSearches: opts.showSearches });
  const rf: Node[] = [];
  const edges: Edge[] = [];
  const qIndex = new Map(questions.map((q, i) => [q.id, i]));
  const exploring = !questions.length;

  if (parking) {
    rf.push({
      id: 'parking',
      type: 'parking',
      position: { x: parking.x, y: parking.y },
      data: {
        count: nodes.filter(
          (n) => n.kind === 'page' && placed.get(n.id) && !(exploring ? n.prov.searchId : n.attach?.questionId),
        ).length,
      } satisfies ParkingData,
      style: { width: parking.w, height: parking.h },
      draggable: false,
      selectable: false,
      zIndex: -1,
    });
  }

  const goal = placed.get('goal')!;
  rf.push({
    id: 'goal',
    type: 'goal',
    position: { x: goal.x, y: goal.y },
    data: { ws, questions, coverage } satisfies GoalData,
    draggable: false,
  });

  questions.forEach((q, index) => {
    const p = placed.get(q.id)!;
    rf.push({
      id: q.id,
      type: 'question',
      position: { x: p.x, y: p.y },
      data: { q, index, coverage: coverage.get(q.id) } satisfies QuestionData,
    });
    edges.push({
      id: `g-${q.id}`,
      source: 'goal',
      target: q.id,
      type: 'floating',
      className: 'e-goal',
      selectable: false,
    });
  });

  for (const n of nodes) {
    const p = placed.get(n.id);
    if (!p) continue;
    if (n.kind === 'page') {
      const qid = n.attach?.questionId ?? undefined;
      const status = qid ? coverage.get(qid)?.status : undefined;
      rf.push({
        id: n.id,
        type: 'page',
        position: { x: p.x, y: p.y },
        data: { node: n, status, questionIndex: qid ? qIndex.get(qid) : undefined } satisfies PageData,
      });
      if (qid && qIndex.has(qid)) {
        edges.push({
          id: `a-${n.id}`,
          source: qid,
          target: n.id,
          type: 'floating',
          className: `e-attach ${status ?? ''} ${n.attach?.state === 'suggested' ? 'suggested' : ''}`,
          data: { kind: 'attach' },
        });
      }
      if (exploring && n.prov.searchId && placed.has(n.prov.searchId)) {
        edges.push({ id: `s-${n.id}`, source: n.prov.searchId, target: n.id, type: 'floating', className: 'e-search' });
      }
    } else if (n.kind === 'search') {
      if (exploring) {
        rf.push({
          id: n.id,
          type: 'search',
          position: { x: p.x, y: p.y },
          data: { node: n } satisfies SearchData,
          className: 'hub',
        });
        edges.push({
          id: `g-${n.id}`,
          source: 'goal',
          target: n.id,
          type: 'floating',
          className: 'e-goal',
          selectable: false,
        });
      } else {
        rf.push({ id: n.id, type: 'search', position: { x: p.x, y: p.y }, data: { node: n } satisfies SearchData });
      }
    } else if (n.kind === 'note') {
      rf.push({ id: n.id, type: 'note', position: { x: p.x, y: p.y }, data: { node: n } satisfies NoteData });
    }
  }

  const has = (id?: string) => !!id && placed.has(id);
  if (opts.showTrail) {
    for (const n of nodes) {
      if (n.kind !== 'page') continue;
      if (has(n.prov.openerId)) {
        edges.push({
          id: `o-${n.id}`,
          source: n.prov.openerId!,
          target: n.id,
          type: 'floating',
          className: 'e-trail',
          label: 'opened from',
          data: { kind: 'trail' },
        });
      }
      if (!exploring && opts.showSearches && has(n.prov.searchId)) {
        edges.push({
          id: `s-${n.id}`,
          source: n.prov.searchId!,
          target: n.id,
          type: 'floating',
          className: 'e-search',
        });
      }
    }
  }

  for (const l of links) {
    if (l.state === 'rejected' || !has(l.from) || !has(l.to)) continue;
    edges.push({
      id: l.id,
      source: l.from,
      target: l.to,
      type: 'floating',
      className: `e-link ${l.type} ${l.state}`,
      label: l.type,
      data: { kind: 'link', link: l },
    });
  }

  for (const q of questions) {
    const c = q.conflict;
    if (
      coverage.get(q.id)?.status === 'conflict' &&
      c?.nodeIds.length === 2 &&
      has(c.nodeIds[0]) &&
      has(c.nodeIds[1])
    ) {
      edges.push({
        id: `c-${q.id}`,
        source: c.nodeIds[0],
        target: c.nodeIds[1],
        type: 'floating',
        className: 'e-conflict',
        label: 'disagree',
        data: { kind: 'conflict' },
      });
    }
  }

  return { nodes: rf, edges };
}
