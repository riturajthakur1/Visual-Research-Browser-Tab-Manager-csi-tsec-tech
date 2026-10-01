// Edges that attach to the nearest side of each card, so the radial map stays
// readable however the user drags things around.
import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react';

function borderPoint(node: InternalNode, toward: InternalNode) {
  const w = (node.measured.width ?? 0) / 2;
  const h = (node.measured.height ?? 0) / 2;
  const cx = node.internals.positionAbsolute.x + w;
  const cy = node.internals.positionAbsolute.y + h;
  const tx = toward.internals.positionAbsolute.x + (toward.measured.width ?? 0) / 2;
  const ty = toward.internals.positionAbsolute.y + (toward.measured.height ?? 0) / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!w || !h || (!dx && !dy)) return { x: cx, y: cy };
  // Scale the centre-to-centre vector until it hits the rectangle's edge.
  const scale = 1 / Math.max(Math.abs(dx) / w, Math.abs(dy) / h);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export function FloatingEdge({ id, source, target, markerEnd, style, label }: EdgeProps) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t) return null;
  const a = borderPoint(s, t);
  const b = borderPoint(t, s);
  // A soft S-curve that leaves and enters each card square to its side.
  const horizontal = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const c1 = horizontal ? { x: mx, y: a.y } : { x: a.x, y: my };
  const c2 = horizontal ? { x: mx, y: b.y } : { x: b.x, y: my };
  const path = `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
  // Midpoint of the cubic (t = 0.5), so labels sit on the line.
  const lx = (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8;
  const ly = (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
