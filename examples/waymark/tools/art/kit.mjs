// Shared drawing helpers for Waymark's generated art. Every picture is an SVG string built
// from seeded randomness, so a rerun draws the same files.
export const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const n = (v) => Math.round(v * 10) / 10;
export const between = (r, a, b) => a + r() * (b - a);
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

export const ink = '#33290f';
export const gold = '#e2ae45';
export const goldLight = '#f6d87a';
export const goldDark = '#8a5a1c';
export const wood = '#7a4d22';
export const woodDark = '#4a2c12';
export const woodLight = '#b07a3c';
export const cream = '#fff3d6';

export const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${filters}${defs}</defs>${body}</svg>`;

// `rough` wobbles outlines like a brush, `grain` adds paper tooth, `wood` streaks along x.
export const filters = `
<filter id="rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="5"/></filter>
<filter id="rough2" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="9" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="12"/></filter>
<filter id="fine" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="2" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.2"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 0.75"/></filter>
<filter id="mottle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="11"/><feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.06  0 0 0 0 0  0 0 0 -1.6 0.9"/></filter>
<filter id="woodgrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.16" numOctaves="4" seed="3"/><feColorMatrix values="0 0 0 0 0.18  0 0 0 0 0.09  0 0 0 0 0.02  0 0 0 -2.2 1.25"/></filter>
<filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="softer"><feGaussianBlur stdDeviation="18"/></filter>
<filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.5"/></filter>
<linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${goldLight}"/><stop offset="0.5" stop-color="${gold}"/><stop offset="1" stop-color="${goldDark}"/></linearGradient>
<linearGradient id="silverGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6eef2"/><stop offset="0.5" stop-color="#9fb4c0"/><stop offset="1" stop-color="#5d7483"/></linearGradient>
<linearGradient id="bronzeGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0a070"/><stop offset="0.5" stop-color="#c2643a"/><stop offset="1" stop-color="#7c3418"/></linearGradient>
`;

export const texture = (w, h, id = 'grain', opacity = 0.5, clip = '') =>
  `<rect width="${w}" height="${h}" filter="url(#${id})" opacity="${opacity}" ${clip}/>`;

// A horizontal edge that wanders by `amp`, as torn bark or paper does.
export const ragged = (r, x0, x1, y, amp, step) => {
  let d = '';
  for (let x = x0; x <= x1 + 0.01; x += step) d += `${d ? 'L' : ''}${n(Math.min(x, x1))} ${n(y + between(r, -amp, amp))} `;
  return d;
};

export const spiral = (cx, cy, r0, turns, dir = 1, start = 0) => {
  const points = [];
  const steps = Math.ceil(turns * 28);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + dir * t * turns * Math.PI * 2;
    const r = r0 * (1 - t * 0.92);
    points.push(`${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`);
  }
  return `M${points.join(' L')}`;
};

export const blob = (r, cx, cy, rx, ry, points = 10, wobble = 0.25) => {
  const ps = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = 1 + between(r, -wobble, wobble);
    ps.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let d = `M${n((ps[0][0] + ps[points - 1][0]) / 2)} ${n((ps[0][1] + ps[points - 1][1]) / 2)} `;
  for (let i = 0; i < points; i++) {
    const p = ps[i], q = ps[(i + 1) % points];
    d += `Q${n(p[0])} ${n(p[1])} ${n((p[0] + q[0]) / 2)} ${n((p[1] + q[1]) / 2)} `;
  }
  return `${d}Z`;
};

// A corner scroll for frames: a quarter turn with a curl at its end.
export const cornerCurl = (x, y, sx, sy, size, color, width = 3) =>
  `<g transform="translate(${x} ${y}) scale(${sx} ${sy})" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"><path d="M0 ${size} V${size * 0.35} Q0 0 ${size * 0.35} 0 H${size}"/><path d="${spiral(size * 0.42, size * 0.42, size * 0.2, 1.1, 1, Math.PI)}"/></g>`;
