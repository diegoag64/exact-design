// The app's furniture: wood, frames, ornaments, badges and the title emblem.
import { rng, svg, texture, ragged, spiral, cornerCurl, gold } from './kit.mjs';

const woodPanel = () => {
  const w = 900, h = 320;
  return svg(w, h, `
    <linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a3717"/><stop offset="0.55" stop-color="#8a5a28"/><stop offset="1" stop-color="#6b4420"/></linearGradient>
    <rect width="${w}" height="${h}" fill="url(#wg)"/>
    <ellipse cx="620" cy="250" rx="380" ry="150" fill="#c08a44" opacity="0.35" filter="url(#softer)"/>
    <g fill="none" stroke="#3d2410" stroke-width="2" opacity="0.28" filter="url(#rough2)">
      <ellipse cx="560" cy="150" rx="60" ry="26"/><ellipse cx="560" cy="150" rx="110" ry="52"/><ellipse cx="560" cy="150" rx="170" ry="84"/><ellipse cx="560" cy="150" rx="240" ry="122"/>
    </g>
    ${texture(w, h, 'woodgrain', 0.75)}${texture(w, h, 'grain', 0.35)}`);
};

const headerEdge = () => {
  const w = 900, h = 44, r = rng(21);
  const edge = ragged(r, 0, w, 20, 5, 14);
  const lip = ragged(rng(21), 0, w, 20, 5, 14);
  return svg(w, h, `
    <path d="M0 0 L${edge.replace(/^/, '')} L${w} 0 Z" fill="#74491f"/>
    <path d="M${lip}" fill="none" stroke="#d09a58" stroke-width="4" stroke-linejoin="round" opacity="0.9"/>
    <path d="M${lip}" fill="none" stroke="#2a180a" stroke-width="5" opacity="0.45" transform="translate(0 5)" filter="url(#glow)"/>
    <rect width="${w}" height="24" filter="url(#woodgrain)" opacity="0.5" clip-path="inset(0 0 20px 0)"/>`);
};

const headerCurl = () => {
  const w = 200, h = 110;
  const curl = (cx, cy, r, dir, start) => `<path d="${spiral(cx, cy, r, 1.35, dir, start)}"/>`;
  const shapes = `${curl(38, 46, 22, 1, Math.PI * 0.9)}${curl(84, 56, 26, -1, Math.PI * 0.1)}${curl(132, 46, 24, 1, Math.PI * 0.9)}${curl(176, 60, 26, -1, Math.PI * 0.1)}<path d="M0 30 C20 22 40 22 60 36 S100 30 118 24 S160 30 200 22"/>`;
  return svg(w, h, `
    <g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#fine)">
      <g stroke="#2a180a" stroke-width="20" opacity="0.5" transform="translate(0 4)">${shapes}</g>
      <g stroke="#74491f" stroke-width="17">${shapes}</g>
      <g stroke="#d09a58" stroke-width="4" transform="translate(0 6)" opacity="0.9">${shapes}</g>
    </g>`);
};

const flourish = (color = gold) => {
  const w = 64, h = 32;
  return svg(w, h, `<g fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round">
    <path d="M10 16 H20"/><path d="M20 16 C26 4 40 4 46 16 C40 28 26 28 20 16 Z"/><path d="M27 16 C31 10 37 10 41 16 C37 22 31 22 27 16"/><path d="M46 16 C52 10 58 12 60 16 C58 20 52 22 46 16"/>
    </g><circle cx="5" cy="16" r="2.6" fill="${color}"/><circle cx="12" cy="9" r="1.8" fill="${color}"/><circle cx="12" cy="23" r="1.8" fill="${color}"/>`);
};

// The square panel behind badges and rewards.
const frame = () => {
  const s = 300;
  return svg(s, s, `
    <rect width="${s}" height="${s}" fill="#6a4423"/>
    <rect width="${s}" height="${s}" fill="#8c6238" opacity="0.5" filter="url(#mottle)"/>
    ${texture(s, s, 'grain', 0.45)}
    <rect x="3" y="3" width="${s - 6}" height="${s - 6}" fill="none" stroke="#3b2411" stroke-width="6"/>
    <g opacity="0.95"><rect x="16" y="16" width="${s - 32}" height="${s - 32}" fill="none" stroke="#c48a35" stroke-width="3.5"/>
    ${cornerCurl(s - 16, 16, -1, 1, 46, '#c48a35', 3.5)}${cornerCurl(16, s - 16, 1, -1, 46, '#c48a35', 3.5)}</g>
    <rect width="${s}" height="${s}" fill="none" stroke="#1d1108" stroke-width="2" opacity="0.6"/>`);
};

const cardPanel = () => {
  const w = 720, h = 300;
  return svg(w, h, `
    <linearGradient id="cp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e5126"/><stop offset="1" stop-color="#5c4220"/></linearGradient>
    <rect width="${w}" height="${h}" fill="url(#cp)"/>
    <rect width="${w}" height="${h}" fill="#a07a3c" opacity="0.5" filter="url(#mottle)"/>
    ${texture(w, h, 'grain', 0.5)}`);
};

// Seventeen glyphs, each drawn around (0, 0) in a 44-point box.
const glyphs = {
  horned: `<path d="M-14 -6 C-22 -16 -20 -24 -15 -27 C-14 -17 -8 -14 -4 -11 M14 -6 C22 -16 20 -24 15 -27 C14 -17 8 -14 4 -11" stroke-width="4" fill="none"/><path d="M0 -12 C12 -12 16 -2 14 8 C12 17 6 21 0 23 C-6 21 -12 17 -14 8 C-16 -2 -12 -12 0 -12 Z"/><g fill="#fff" stroke="none" opacity="0.9"><circle cx="-6" cy="3" r="3.4"/><circle cx="6" cy="3" r="3.4"/></g>`,
  arrow: `<path d="M-12 -18 L14 0 L-12 18 L-4 0 Z"/>`,
  flask: `<path d="M-6 -20 H6 V-8 L15 12 Q16 20 6 20 H-6 Q-16 20 -15 12 L-6 -8 Z"/><g fill="#fff" stroke="none" opacity="0.85"><circle cx="-3" cy="9" r="3"/><circle cx="5" cy="13" r="2"/></g>`,
  target: `<circle r="18" fill="none" stroke-width="5"/><circle r="8"/><path d="M4 -4 L20 -20 M14 -20 H20 V-14" fill="none" stroke-width="4"/>`,
  sprout: `<path d="M0 20 V-2 M0 6 C-14 6 -18 -6 -18 -14 C-6 -14 0 -6 0 6 M0 -2 C0 -14 8 -22 18 -22 C18 -10 10 -2 0 -2" fill="none" stroke-width="4.5"/>`,
  pot: `<path d="M-10 -18 H10 V-12 H-10 Z"/><path d="M-8 -11 H8 C16 -6 18 6 12 18 H-12 C-18 6 -16 -6 -8 -11 Z"/><path d="M-9 2 H9" stroke="#fff" stroke-width="3" opacity="0.8"/>`,
  reed: `<g transform="rotate(-30)"><rect x="-22" y="-6" width="44" height="12" rx="6"/><g fill="#fff" stroke="none" opacity="0.9"><circle cx="-10" r="2.4"/><circle cx="-2" r="2.4"/><circle cx="6" r="2.4"/><circle cx="14" r="2.4"/></g></g>`,
  hourglass: `<path d="M-13 -20 H13 M-13 20 H13" fill="none" stroke-width="5"/><path d="M-10 -18 H10 V-10 L2 0 L10 10 V18 H-10 V10 L-2 0 L-10 -10 Z" fill="none" stroke-width="4"/><path d="M-6 16 H6 V12 L0 6 L-6 12 Z"/>`,
  gem: `<path d="M0 -20 L14 -8 V8 L0 20 L-14 8 V-8 Z" fill="none" stroke-width="5"/><path d="M0 -9 L6 -3 V3 L0 9 L-6 3 V-3 Z"/>`,
  steps: `<ellipse cx="-8" cy="-6" rx="6.5" ry="10"/><ellipse cx="-8" cy="12" rx="5" ry="4.5"/><ellipse cx="9" cy="2" rx="6.5" ry="10"/><ellipse cx="9" cy="20" rx="5" ry="4.5"/>`,
  fish: `<path d="M-20 0 C-10 -14 8 -14 14 0 C8 14 -10 14 -20 0 Z"/><path d="M12 0 L22 -10 V10 Z"/><circle cx="-10" cy="-2" r="2.4" fill="#fff" stroke="none"/>`,
  lattice: `<path d="M0 -20 L10 -10 L0 0 L-10 -10 Z M0 0 L10 10 L0 20 L-10 10 Z" fill="none" stroke-width="4"/><path d="M-12 -4 L-8 0 L-12 4 L-16 0 Z M12 -4 L16 0 L12 4 L8 0 Z"/>`,
  keep: `<path d="M-18 20 V-6 H-12 V-12 H-6 V-6 H-3 V-18 H3 V-6 H6 V-12 H12 V-6 H18 V20 H5 V8 H-5 V20 Z"/>`,
  speech: `<path d="M-20 -14 H10 Q18 -14 18 -6 V4 Q18 12 10 12 H-2 L-12 20 V12 Q-20 12 -20 4 Z"/><g fill="#fff" stroke="none" opacity="0.9"><circle cx="-9" cy="-1" r="2.4"/><circle cx="-1" cy="-1" r="2.4"/><circle cx="7" cy="-1" r="2.4"/></g>`,
  chest: `<path d="M-18 -4 C-18 -16 18 -16 18 -4 V-2 H-18 Z"/><rect x="-18" y="1" width="36" height="16" rx="2"/><rect x="-4" y="-4" width="8" height="10" rx="2" fill="#fff" stroke="none" opacity="0.9"/>`,
  mask: `<path d="M0 -20 C14 -20 18 -8 16 4 C14 14 8 20 0 22 C-8 20 -14 14 -16 4 C-18 -8 -14 -20 0 -20 Z"/><g fill="#fff" stroke="none" opacity="0.9"><path d="M-11 -4 Q-6 -8 -2 -2 Q-7 2 -11 -4 Z M11 -4 Q6 -8 2 -2 Q7 2 11 -4 Z"/><rect x="-5" y="9" width="10" height="3" rx="1.5"/></g>`,
  compass: `<circle r="19" fill="none" stroke-width="4.5"/><path d="M12 -12 L4 4 L-12 12 L-4 -4 Z"/>`,
};
export const glyphNames = Object.keys(glyphs);

const badge = (tier, glyph) => {
  const w = 120, h = 136;
  const dark = { gold: '#7a4a10', silver: '#3f5564', bronze: '#6a2a12' }[tier];
  const light = { gold: '#f8dc84', silver: '#e2ecf0', bronze: '#f4b088' }[tier];
  const inner = { gold: '#e2a02e', silver: '#a9bdc8', bronze: '#c66a3e' }[tier];
  const shield = 'M0 -46 C10 -40 24 -36 36 -36 V0 C36 26 18 40 0 48 C-18 40 -36 26 -36 0 V-36 C-24 -36 -10 -40 0 -46 Z';
  const tail = (sx) => `<g transform="scale(${sx} 1)"><path d="M-8 26 L-34 60 L-22 58 L-18 68 L6 36 Z" fill="#1f3f8a" stroke="#14244e" stroke-width="2"/><path d="M-2 31 L-26 62 L-21 60 L2 34 Z" fill="#e8e2c8"/></g>`;
  return svg(w, h, `<g transform="translate(60 62)" filter="url(#fine)">
    ${tail(1)}${tail(-1)}
    <path d="${shield}" fill="url(#${tier}Grad)" stroke="${dark}" stroke-width="3"/>
    <path d="${shield}" fill="${inner}" stroke="${light}" stroke-width="2.5" transform="scale(0.78)"/>
    <g transform="translate(0 -2) scale(0.92)" fill="${dark}" stroke="${dark}" stroke-linecap="round" stroke-linejoin="round">${glyphs[glyph]}</g>
    <path d="M-30 -30 C-18 -32 -8 -36 0 -40" fill="none" stroke="#fff" stroke-width="3" opacity="0.55" stroke-linecap="round"/>
  </g><rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.18" clip-path="path('M60 16 C70 22 84 26 96 26 V62 C96 88 78 102 60 110 C42 102 24 88 24 62 V26 C36 26 50 22 60 16 Z')"/>`);
};

const gem = () => svg(48, 64, `<g filter="url(#fine)"><path d="M24 4 L42 20 V44 L24 60 L6 44 V20 Z" fill="#1c8a3a" stroke="#0e3a1a" stroke-width="3"/><path d="M24 4 L42 20 L24 26 L6 20 Z" fill="#7be08a"/><path d="M24 26 L42 20 V44 L24 60 Z" fill="#136a2c"/><path d="M24 26 V60 L6 44 V20 Z" fill="#2cab4c"/><path d="M12 22 L22 27" stroke="#d8ffe0" stroke-width="2.5" stroke-linecap="round"/></g>`);

// The reward mark: a rising curl, three coils that open upward.
const note = () => svg(120, 170, `<g fill="none" stroke-linecap="round" filter="url(#fine)">
  <g stroke="#3b2410" stroke-width="15" opacity="0.5" transform="translate(2 3)"><path d="M66 12 C40 28 40 54 62 70 C92 90 96 124 66 138 C40 148 22 126 34 106 C44 90 68 94 68 112 C68 122 58 126 52 120"/><path d="M62 70 C78 62 84 44 72 34"/></g>
  <g stroke="#e9d7ae" stroke-width="10"><path d="M66 12 C40 28 40 54 62 70 C92 90 96 124 66 138 C40 148 22 126 34 106 C44 90 68 94 68 112 C68 122 58 126 52 120"/><path d="M62 70 C78 62 84 44 72 34"/><path d="M66 138 C62 150 58 156 50 160"/></g></g>`);

const price = () => {
  const w = 220, h = 76;
  const d = 'M22 8 H198 L214 38 L198 68 H22 L6 38 Z';
  return svg(w, h, `<path d="${d}" fill="#3a2208" transform="translate(0 2)" opacity="0.6"/><path d="${d}" fill="#99600f" stroke="#5a360a" stroke-width="3"/><path d="M28 15 H192 L204 38 L192 61 H28 L16 38 Z" fill="none" stroke="#e0b050" stroke-width="2.5"/><rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.3" clip-path="path('${d}')"/>`);
};

const node = () => svg(72, 72, `<g transform="translate(36 36) rotate(45)" filter="url(#fine)"><rect x="-22" y="-22" width="44" height="44" fill="#2a1c0c" stroke="#a87a34" stroke-width="4"/><rect x="-12" y="-12" width="24" height="24" fill="none" stroke="#a87a34" stroke-width="3.5"/><rect x="-4.5" y="-4.5" width="9" height="9" fill="#d8ae58"/></g>`);

const braid = () => {
  const w = 44, h = 1200;
  let links = '';
  for (let y = 0; y < h; y += 46) links += `<path d="M22 ${y} C40 ${y + 10} 40 ${y + 34} 22 ${y + 46} C4 ${y + 34} 4 ${y + 10} 22 ${y}" /><path d="M22 ${y + 12} C30 ${y + 18} 30 ${y + 30} 22 ${y + 36} C14 ${y + 30} 14 ${y + 18} 22 ${y + 12}"/>`;
  return svg(w, h, `<g fill="none" stroke="#8a5a26" stroke-width="5" stroke-linecap="round" filter="url(#fine)">${links}</g>`);
};

const logo = () => {
  const w = 720, h = 400;
  const word = (extra) => `<text x="360" y="268" font-family="Baskerville, Georgia, serif" font-weight="700" font-size="88" letter-spacing="2" text-anchor="middle" ${extra}>ALDERMERE</text>`;
  const small = (y, size, text) => `<text x="360" y="${y}" font-family="Baskerville, Georgia, serif" font-weight="700" font-size="${size}" letter-spacing="6" text-anchor="middle" fill="#f6e2a0" stroke="#2a1806" stroke-width="6" paint-order="stroke" stroke-linejoin="round">${text}</text>`;
  const leaves = (sx) => `<g transform="translate(360 96) scale(${sx} 1)">${Array.from({ length: 7 }, (_, i) => `<path d="M0 0 Q14 -12 30 0 Q14 12 0 0 Z" fill="#e2ae45" stroke="#6a4210" stroke-width="2" transform="rotate(${-150 + i * 22}) translate(78 0) rotate(60)"/>`).join('')}</g>`;
  return svg(w, h, `
    <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset="0.45" stop-color="#e6b244"/><stop offset="0.56" stop-color="#b47a1e"/><stop offset="1" stop-color="#f2cc66"/></linearGradient>
    <radialGradient id="night" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#3a62a8"/><stop offset="1" stop-color="#14204a"/></radialGradient>
    <g filter="url(#shadow)">
      <g filter="url(#fine)">${leaves(1)}${leaves(-1)}
        <circle cx="360" cy="96" r="66" fill="url(#goldGrad)" stroke="#3a2408" stroke-width="4"/>
        <circle cx="360" cy="96" r="54" fill="url(#night)" stroke="#3a2408" stroke-width="3"/>
        <path d="M376 58 A40 40 0 1 0 376 134 A31 31 0 1 1 376 58 Z" fill="#f8e6a0" stroke="#8a5a1c" stroke-width="2.5"/>
        <g fill="#f8e6a0"><circle cx="384" cy="84" r="4"/><circle cx="396" cy="106" r="2.8"/><circle cx="378" cy="112" r="2.2"/></g>
      </g>
      ${small(186, 24, 'THE CHRONICLES OF')}
      ${word('fill="none" stroke="#2a1806" stroke-width="14" stroke-linejoin="round"')}
      ${word('fill="url(#lg)" stroke="#6a4210" stroke-width="2.5"')}
      <path d="M70 296 H250 M470 296 H650" stroke="#e2ae45" stroke-width="3"/><path d="M70 296 H250 M470 296 H650" stroke="#2a1806" stroke-width="7" opacity="0.5" transform="translate(0 3)"/>
      ${small(340, 30, 'SONG OF THE HOLLOW MOON')}
    </g>`);
};

export const badgeTiers = { horned: 'gold', arrow: 'gold', flask: 'gold', target: 'gold', sprout: 'gold', pot: 'gold', reed: 'gold', hourglass: 'silver', gem: 'silver', steps: 'silver', fish: 'silver', lattice: 'silver', keep: 'silver', speech: 'silver', chest: 'bronze', mask: 'bronze', compass: 'bronze' };

export const chrome = () => [
  { name: 'wood.jpg', art: woodPanel() },
  { name: 'header-edge.png', art: headerEdge() },
  { name: 'header-curl.png', art: headerCurl() },
  { name: 'flourish.png', art: flourish() },
  { name: 'flourish-dim.png', art: flourish('#c9b48a') },
  { name: 'frame.jpg', art: frame() },
  { name: 'card.jpg', art: cardPanel() },
  { name: 'gem.png', art: gem() },
  { name: 'note.png', art: note() },
  { name: 'price.png', art: price() },
  { name: 'node.png', art: node() },
  { name: 'braid.png', art: braid() },
  { name: 'logo.png', art: logo() },
  ...glyphNames.map((g) => ({ name: `badge-${g}.png`, art: badge(badgeTiers[g], g) })),
];
