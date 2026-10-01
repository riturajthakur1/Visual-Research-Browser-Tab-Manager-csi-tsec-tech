// Generates the Thread.io mark as clean vector SVG: six "connected node"
// dumbbells alternating with six droplets, arranged around a hexagonal core.
// Writes public/icons/mark.svg (mark only, currentColor) and logo.svg (app icon).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const C = 200; // centre of a 400×400 canvas
const R_OUT = 144; // radius of the outer ring of circles
const R_IN = 64; // radius of the inner end of each dumbbell
const r = 24.5; // circle radius
const NECK = 8.5; // half-width of a dumbbell neck
const DROP_TIP = 40; // distance from droplet centre to its tip

const f = (n) => Number(n.toFixed(2));
const polar = (rad, deg) => [C + rad * Math.cos((deg * Math.PI) / 180), C - rad * Math.sin((deg * Math.PI) / 180)];

/** Rotate local (x along the spoke, y across it) into canvas space. */
function frame(deg) {
  const a = (deg * Math.PI) / 180;
  const ux = [Math.cos(a), -Math.sin(a)];
  const uy = [Math.sin(a), Math.cos(a)];
  return (x, y) => [C + x * ux[0] + y * uy[0], C + x * ux[1] + y * uy[1]];
}

function dumbbell(deg) {
  const P = frame(deg);
  const L = R_OUT - R_IN;
  const phi = (55 * Math.PI) / 180;
  const cx = r * Math.cos(phi);
  const cy = r * Math.sin(phi);
  // Tangent length chosen so the neck's narrowest half-width equals NECK.
  const t = (cy - NECK) / (0.75 * Math.cos(phi));
  const tx = t * Math.sin(phi);
  const ty = t * Math.cos(phi);
  const pt = (x, y) =>
    P(R_IN + x, y)
      .map(f)
      .join(' ');
  return [
    `M ${pt(cx, cy)}`,
    `C ${pt(cx + tx, cy - ty)}, ${pt(L - cx - tx, cy - ty)}, ${pt(L - cx, cy)}`,
    `A ${r} ${r} 0 1 0 ${pt(L - cx, -cy)}`,
    `C ${pt(L - cx - tx, -cy + ty)}, ${pt(cx + tx, -cy + ty)}, ${pt(cx, -cy)}`,
    `A ${r} ${r} 0 1 0 ${pt(cx, cy)}`,
    'Z',
  ].join(' ');
}

function droplet(deg) {
  const P = frame(deg);
  // Local x points outward; the tip sits inward of the circle centre.
  const alpha = Math.acos(r / DROP_TIP);
  const pt = (x, y) =>
    P(R_OUT + x, y)
      .map(f)
      .join(' ');
  const t1 = [-r * Math.cos(alpha), r * Math.sin(alpha)];
  const t2 = [-r * Math.cos(alpha), -r * Math.sin(alpha)];
  return `M ${pt(-DROP_TIP, 0)} L ${pt(...t1)} A ${r} ${r} 0 1 0 ${pt(...t2)} Z`;
}

const paths = [];
for (let i = 0; i < 6; i++) {
  paths.push(dumbbell(30 + i * 60));
  paths.push(droplet(i * 60));
}
const markPaths = paths.map((d) => `<path d="${d}"/>`).join('');
void polar;

const VIEW = 'viewBox="22 22 356 356"';
writeFileSync(
  join(out, 'mark.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" ${VIEW} fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round">${markPaths}</svg>\n`,
);

// App icon: the mark on the brand's red gradient.
writeFileSync(
  join(out, 'logo.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    <radialGradient id="g" cx="30%" cy="22%" r="95%">
      <stop offset="0" stop-color="#F06A55"/>
      <stop offset="0.38" stop-color="#D3170C"/>
      <stop offset="0.8" stop-color="#8F0C07"/>
      <stop offset="1" stop-color="#6E0805"/>
    </radialGradient>
  </defs>
  <rect width="400" height="400" rx="92" fill="url(#g)"/>
  <g transform="translate(200 200) scale(0.8) translate(-200 -200)" fill="#FBF3EC" stroke="#FBF3EC" stroke-width="3" stroke-linejoin="round">${markPaths}</g>
</svg>
`,
);
console.log('✓ mark.svg, logo.svg');
