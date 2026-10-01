// Deterministic map layout shared by the canvas and the JSON Canvas export.
// Questions sit on a ring around the goal; each question's pages fan outward
// from it. Slots are assigned in capture order, so a new page never moves the
// ones already placed, and any node the user dragged keeps its position.
import type { CoverageStatus, ID, Question, TrailNode } from './types';

export const SIZE = {
  goal: { w: 300, h: 96 },
  question: { w: 256, h: 92 },
  page: { w: 224, h: 52 },
  search: { w: 200, h: 40 },
  note: { w: 220, h: 96 },
};

export interface Placed {
  id: ID;
  kind: 'goal' | 'question' | 'page' | 'search' | 'note' | 'parking';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  placed: Map<ID, Placed>;
  parking?: Placed;
}

const FAN = [0, 1, -1, 2, -2];
const FAN_STEP = 0.36; // radians between neighbours in a fan
const FIRST_RING = 210;
const RING_GAP = 112;
const CLEARANCE = 30;
const GAP = 14;

/** Distance from a hub centre at which a page card in direction `a` no longer overlaps the hub card. */
function clearDistance(a: number, hub: { w: number; h: number }, card: { w: number; h: number }) {
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  const byX = cos > 1e-3 ? (hub.w / 2 + card.w / 2 + CLEARANCE) / cos : Infinity;
  const byY = sin > 1e-3 ? (hub.h / 2 + card.h / 2 + CLEARANCE) / sin : Infinity;
  return Math.min(byX, byY);
}

function topLeft(cx: number, cy: number, size: { w: number; h: number }) {
  return { x: Math.round(cx - size.w / 2), y: Math.round(cy - size.h / 2) };
}

export function layoutMap(
  questions: Question[],
  nodes: TrailNode[],
  opts: { showSearches?: boolean } = {},
): LayoutResult {
  const placed = new Map<ID, Placed>();
  const put = (
    id: ID,
    kind: Placed['kind'],
    cx: number,
    cy: number,
    size: { w: number; h: number },
    node?: Pick<TrailNode, 'pinned' | 'pos'>,
  ) => {
    const pos = node?.pinned && node.pos ? node.pos : topLeft(cx, cy, size);
    placed.set(id, { id, kind, ...pos, w: size.w, h: size.h });
  };

  const pages = nodes.filter((n) => n.kind === 'page').sort((a, b) => a.createdAt - b.createdAt);
  const searches = nodes.filter((n) => n.kind === 'search').sort((a, b) => a.createdAt - b.createdAt);
  const notes = nodes.filter((n) => n.kind === 'note');

  // Hubs: questions in GPS mode, searches in explore mode.
  const exploring = !questions.length;
  const hubs: { id: ID; node?: Pick<TrailNode, 'pinned' | 'pos'> }[] = exploring
    ? searches.map((s) => ({ id: s.id, node: s }))
    : questions.map((q) => ({ id: q.id, node: q.pos ? { pinned: true, pos: q.pos } : undefined }));
  const radius = Math.max(360, hubs.length * 68);
  put('goal', 'goal', 0, 0, SIZE.goal);

  const hubAngle = new Map<ID, number>();
  hubs.forEach((h, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, hubs.length)) * Math.PI * 2;
    hubAngle.set(h.id, a);
    put(h.id, exploring ? 'search' : 'question', Math.cos(a) * radius, Math.sin(a) * radius, SIZE.question, h.node);
  });

  const hubOf = (n: TrailNode): ID | undefined =>
    exploring
      ? n.prov.searchId && hubAngle.has(n.prov.searchId)
        ? n.prov.searchId
        : undefined
      : (n.attach?.questionId ?? undefined);

  const overlaps = (x: number, y: number, w: number, h: number) =>
    [...placed.values()].some(
      (o) => x < o.x + o.w + GAP && x + w + GAP > o.x && y < o.y + o.h + GAP && y + h + GAP > o.y,
    );

  // Each page takes the first free slot fanning outward from its hub. Pages are placed in capture
  // order and earlier cards are obstacles, so a new page never moves one already on the map.
  const parked: TrailNode[] = [];
  for (const p of pages) {
    const hub = hubOf(p);
    if (!hub || !hubAngle.has(hub)) {
      parked.push(p);
      continue;
    }
    if (p.pinned && p.pos) {
      put(p.id, 'page', 0, 0, SIZE.page, p);
      continue;
    }
    const a = hubAngle.get(hub)!;
    const h = placed.get(hub)!;
    const hx = h.x + h.w / 2;
    const hy = h.y + h.h / 2;
    let spot: { x: number; y: number } | undefined;
    search: for (let ring = 0; ring < 14; ring++) {
      for (const f of FAN) {
        const dir = a + f * FAN_STEP + (ring % 2 ? FAN_STEP / 2 : 0);
        const r = Math.max(FIRST_RING * 0.7, clearDistance(dir, SIZE.question, SIZE.page)) + ring * RING_GAP * 0.6;
        const c = topLeft(hx + Math.cos(dir) * r, hy + Math.sin(dir) * r, SIZE.page);
        if (!overlaps(c.x, c.y, SIZE.page.w, SIZE.page.h)) {
          spot = c;
          break search;
        }
      }
    }
    spot ??= topLeft(
      hx + Math.cos(a) * (FIRST_RING + 14 * RING_GAP),
      hy + Math.sin(a) * (FIRST_RING + 14 * RING_GAP),
      SIZE.page,
    );
    placed.set(p.id, { id: p.id, kind: 'page', ...spot, w: SIZE.page.w, h: SIZE.page.h });
  }

  let parking: Placed | undefined;
  if (parked.length) {
    const cols = Math.min(2, parked.length);
    const rows = Math.ceil(parked.length / cols);
    const gapX = SIZE.page.w + 24;
    const gapY = SIZE.page.h + 22;
    const width = cols * gapX + 24;
    const height = rows * gapY + 60;
    // Beside the ring rather than below it: screens are wider than tall, so the whole map fits at a readable zoom.
    const left = Math.max(radius + SIZE.question.w / 2, ...[...placed.values()].map((o) => o.x + o.w)) + 120;
    parking = { id: 'parking', kind: 'parking', x: Math.round(left), y: Math.round(-height / 2), w: width, h: height };
    parked.forEach((p, i) => {
      const cx = parking!.x + 12 + (i % cols) * gapX + SIZE.page.w / 2 + 12;
      const cy = parking!.y + 48 + Math.floor(i / cols) * gapY + SIZE.page.h / 2;
      put(p.id, 'page', cx, cy, SIZE.page, p);
    });
  }

  if (opts.showSearches && !exploring) {
    for (const s of searches) {
      const kids = pages
        .filter((p) => p.prov.searchId === s.id)
        .map((p) => placed.get(p.id))
        .filter(Boolean) as Placed[];
      if (!kids.length) continue;
      const cx = kids.reduce((sum, k) => sum + k.x + k.w / 2, 0) / kids.length;
      const cy = kids.reduce((sum, k) => sum + k.y + k.h / 2, 0) / kids.length;
      const len = Math.hypot(cx, cy) || 1;
      put(s.id, 'search', cx + (cx / len) * 150, cy + (cy / len) * 150, SIZE.search, s);
    }
  }

  notes.forEach((n, i) => put(n.id, 'note', -radius - 340, -200 + i * 130, SIZE.note, n));
  return { placed, parking };
}

export const STATUS_COLOR: Record<CoverageStatus, string> = {
  gap: '#D93A32',
  thin: '#D4920F',
  covered: '#1F8A5B',
  conflict: '#7C4DC4',
};
