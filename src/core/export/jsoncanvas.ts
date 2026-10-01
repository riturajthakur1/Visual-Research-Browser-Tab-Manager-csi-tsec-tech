// Export to JSON Canvas 1.0 (https://jsoncanvas.org/spec/1.0/), the open
// format Obsidian uses for canvases. Pages become link cards, questions become
// text cards coloured by coverage, and the trail becomes labelled edges.
import { coverageMap } from '../engine/coverage';
import { layoutMap } from '../layout';
import type { CoverageStatus, Link, Question, TrailNode, Workspace } from '../types';

interface CanvasNode {
  id: string;
  type: 'text' | 'link' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  url?: string;
  label?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  toEnd?: 'none' | 'arrow';
  color?: string;
  label?: string;
}

// JSON Canvas preset colours: 1 red, 2 orange, 3 yellow, 4 green, 5 cyan, 6 purple.
const COLOR: Record<CoverageStatus, string> = { gap: '1', thin: '3', covered: '4', conflict: '6' };

export function toJsonCanvas(ws: Workspace, questions: Question[], nodes: TrailNode[], links: Link[]) {
  const { placed, parking } = layoutMap(questions, nodes);
  const coverage = coverageMap(questions, nodes, ws);
  const out: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const box = (id: string) => placed.get(id)!;

  const g = box('goal');
  out.push({
    id: 'goal',
    type: 'text',
    x: g.x,
    y: g.y,
    width: g.w,
    height: g.h,
    color: '5',
    text: `# ${ws.goal || ws.name}`,
  });

  questions.forEach((q, i) => {
    const b = box(q.id);
    const c = coverage.get(q.id)!;
    out.push({
      id: q.id,
      type: 'text',
      x: b.x,
      y: b.y,
      width: b.w,
      height: b.h + 20,
      color: COLOR[c.status],
      text: `**Q${i + 1}. ${q.text}**\n\n${c.status} · ${c.detail}`,
    });
    edges.push({ id: `e-goal-${q.id}`, fromNode: 'goal', toNode: q.id, toEnd: 'none' });
  });

  if (parking) {
    out.push({
      id: 'parking',
      type: 'group',
      x: parking.x,
      y: parking.y,
      width: parking.w,
      height: parking.h,
      label: 'Parking lot',
    });
  }

  for (const n of nodes) {
    const b = placed.get(n.id);
    if (!b) continue;
    if (n.kind === 'page') {
      out.push({ id: n.id, type: 'link', x: b.x, y: b.y, width: b.w + 40, height: b.h + 120, url: n.url });
      if (n.notes || n.highlights.length) {
        const text = [n.notes, ...n.highlights.map((h) => `> ${h.text}`)].filter(Boolean).join('\n\n');
        const id = `${n.id}-notes`;
        out.push({ id, type: 'text', x: b.x, y: b.y + b.h + 130, width: b.w + 40, height: 120, text });
        edges.push({ id: `e-${id}`, fromNode: n.id, toNode: id, toEnd: 'none' });
      }
      const qid = n.attach?.questionId;
      if (qid && placed.has(qid)) {
        edges.push({
          id: `e-${qid}-${n.id}`,
          fromNode: qid,
          toNode: n.id,
          label: n.attach!.state === 'suggested' ? 'suggested' : undefined,
        });
      }
      if (n.prov.openerId && placed.has(n.prov.openerId)) {
        edges.push({ id: `e-open-${n.id}`, fromNode: n.prov.openerId, toNode: n.id, label: 'opened from', color: '5' });
      }
    } else if (n.kind === 'note') {
      out.push({ id: n.id, type: 'text', x: b.x, y: b.y, width: b.w, height: b.h, text: n.notes });
    } else if (n.kind === 'search') {
      out.push({ id: n.id, type: 'text', x: b.x, y: b.y, width: b.w, height: b.h, text: `🔎 ${n.query}` });
    }
  }

  for (const l of links) {
    if (l.state === 'rejected' || !placed.has(l.from) || !placed.has(l.to)) continue;
    edges.push({
      id: l.id,
      fromNode: l.from,
      toNode: l.to,
      label: l.type,
      color: l.type === 'contradicts' ? '1' : l.type === 'supports' ? '4' : undefined,
    });
  }
  for (const q of questions) {
    const c = q.conflict;
    if (c?.verdict === 'conflict' && c.nodeIds.length === 2 && placed.has(c.nodeIds[0]) && placed.has(c.nodeIds[1])) {
      edges.push({
        id: `conflict-${q.id}`,
        fromNode: c.nodeIds[0],
        toNode: c.nodeIds[1],
        label: 'disagree',
        color: '1',
        toEnd: 'none',
      });
    }
  }
  return { nodes: out, edges };
}
