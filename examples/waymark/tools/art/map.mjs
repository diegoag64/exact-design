// The realm map: an inked parchment. Place names are drawn by the app over this picture,
// so each one stays a selectable element; positions here and in app.ts share one 1000×1400 grid.
import { rng, n, between, pick, svg, texture, blob, ink } from './kit.mjs';

const peak = (r, x, y, w, h, fill = '#b89c52') => {
  const tip = x + between(r, -w * 0.08, w * 0.08);
  let hatch = '';
  for (let i = 1; i < 6; i++) hatch += `<path d="M${n(tip + i * w * 0.06)} ${n(y - h + i * h * 0.16)} l${n(-w * 0.07)} ${n(h * 0.2)}" />`;
  return `<path d="M${n(x - w / 2)} ${y} L${n(tip - w * 0.1)} ${n(y - h * 0.7)} L${n(tip)} ${n(y - h)} L${n(tip + w * 0.14)} ${n(y - h * 0.6)} L${n(x + w / 2)} ${y} Z" fill="${fill}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/><path d="M${n(tip)} ${n(y - h)} L${n(tip + w * 0.14)} ${n(y - h * 0.6)} L${n(x + w / 2)} ${y} L${n(x + w * 0.1)} ${y} L${n(tip + w * 0.02)} ${n(y - h * 0.5)} Z" fill="#6a5a2a" opacity="0.45"/><g stroke="${ink}" stroke-width="1.6" fill="none" opacity="0.8">${hatch}</g>`;
};

const tree = (r, x, y, s = 1) => `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><path d="M-3 0 V-16 H3 V0 Z" fill="#6a5a2a" stroke="${ink}" stroke-width="1.6"/><path d="M-17 -14 C-19 -30 -8 -38 0 -38 C8 -38 19 -30 17 -14 C10 -10 -10 -10 -17 -14 Z" fill="${pick(r, ['#8f9440', '#7f8a3a', '#9a9c48', '#75803a'])}" stroke="${ink}" stroke-width="2"/><path d="M-9 -26 Q-2 -32 6 -29" stroke="${ink}" stroke-width="1.2" fill="none" opacity="0.6"/></g>`;

const house = (x, y, s = 1, roof = '#9a6a3a') => `<g transform="translate(${x} ${y}) scale(${s})" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"><path d="M-16 0 V-16 H16 V0 Z" fill="#d8c48a"/><path d="M-21 -15 L0 -32 L21 -15 Z" fill="${roof}"/><path d="M-4 0 V-9 H4 V0" fill="#5a4a22"/></g>`;

const tower = (x, y, w, h, cap = '#7a5a3a') => `<g stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"><path d="M${x - w / 2} ${y} V${y - h} H${x + w / 2} V${y} Z" fill="#cdbb84"/><path d="M${x - w / 2 - 4} ${y - h} L${x} ${y - h - w * 1.3} L${x + w / 2 + 4} ${y - h} Z" fill="${cap}"/><path d="M${x} ${y - h * 0.6} v8" /></g>`;

export const map = () => {
  const w = 1000, h = 1400, r = rng(77);
  let peaks = '', woods = '', fog = '', tufts = '', waves = '';
  const range = [];
  for (let i = 0; i < 46; i++) range.push([between(r, 60, 960), between(r, 300, 600), between(r, 90, 170), between(r, 70, 150)]);
  range.filter(([x, y]) => !(x > 380 && x < 640 && y < 470) && !(x > 500 && x < 700 && y > 520)).sort((a, b) => a[1] - b[1]).forEach(([x, y, pw, ph]) => { peaks += peak(r, x, y, pw, ph, pick(r, ['#b89c52', '#ad9048', '#c2a65a'])); });
  const trees = [];
  for (let i = 0; i < 520; i++) {
    const x = between(r, 300, 1010), y = between(r, 1010, 1400);
    if (x < 420 && y < 1150) continue;
    if (Math.hypot(x - 640, y - 1215) < 80 || Math.hypot(x - 850, y - 1100) < 60 || Math.hypot(x - 460, y - 1110) < 62 || Math.hypot(x - 660, y - 1050) < 50) continue;
    trees.push([x, y]);
  }
  for (let i = 0; i < 46; i++) trees.push([between(r, 90, 330), between(r, 880, 1120)]);
  for (let i = 0; i < 26; i++) trees.push([between(r, 420, 620), between(r, 860, 930)]);
  trees.sort((a, b) => a[1] - b[1]).forEach(([x, y]) => { woods += tree(r, x, y, between(r, 0.8, 1.25)); });
  for (let i = 0; i < 130; i++) {
    const x = between(r, 30, 960), y = between(r, 640, 1380);
    tufts += `<path d="M${n(x)} ${n(y)} l-3 -7 M${n(x + 4)} ${n(y)} l0 -9 M${n(x + 8)} ${n(y)} l3 -7"/>`;
  }
  for (let i = 0; i < 40; i++) waves += `<path d="M${n(between(r, -20, 200))} ${n(between(r, 1210, 1390))} q8 -6 16 0 t16 0"/>`;
  const edge = (x, y) => `<path d="${blob(r, x, y, between(r, 110, 190), between(r, 70, 120), 9, 0.3)}" fill="#fbf6e2"/>`;
  for (let x = -40; x <= 1040; x += 90) fog += edge(x, between(r, 0, 70)) + edge(x, between(r, 1400, 1440));
  for (let y = 100; y <= 1400; y += 110) fog += edge(between(r, 1040, 1080), y);
  fog += edge(60, 190) + edge(930, 170);
  const smoke = `<g fill="none" stroke="${ink}" stroke-width="2.4"><ellipse cx="500" cy="262" rx="78" ry="13" fill="#e8dca8"/><path d="M436 262 q10 -9 20 0 t20 0 t20 0 t20 0 t20 0 t20 0"/></g>`;
  const volcano = `<g stroke="${ink}" stroke-width="3" stroke-linejoin="round"><path d="M340 520 C400 440 430 360 452 290 L548 290 C572 360 610 440 680 520 Z" fill="#a8873f"/><path d="M452 290 Q500 306 548 290 Q500 276 452 290 Z" fill="#c0442a"/><path d="M500 300 C520 380 560 440 680 520 H560 C520 460 506 390 500 300 Z" fill="#5a4a22" opacity="0.5" stroke="none"/><g stroke-width="1.6" fill="none"><path d="M470 320 l-22 70 M486 330 l-10 90 M440 400 l-40 80 M530 330 l14 60 M560 400 l40 70"/></g><path d="M455 520 C455 470 480 452 510 452 C540 452 565 470 565 520 Z" fill="#3a2e14"/><path d="M470 520 V486 H550 V520" fill="none" stroke="#c9b06a" stroke-width="3"/></g>`;
  const cave = `<g stroke="${ink}" stroke-width="3"><path d="M210 520 C210 470 240 452 276 452 C312 452 342 470 342 520 Z" fill="#3a2e14"/><path d="M232 520 l8 -18 l10 18 M262 520 l8 -22 l10 22 M294 520 l8 -18 l10 18" fill="#e8dca8" stroke-width="2"/><circle cx="252" cy="476" r="7" fill="#e8dca8"/><circle cx="300" cy="476" r="7" fill="#e8dca8"/></g>`;
  const hold = `<g stroke="${ink}" stroke-width="2.6"><ellipse cx="590" cy="640" rx="96" ry="44" fill="#9a8444"/><ellipse cx="590" cy="634" rx="70" ry="28" fill="#7a6632"/>${[[550, 640], [590, 652], [632, 640]].map(([x, y]) => `<path d="M${x - 14} ${y} C${x - 14} ${y - 22} ${x + 14} ${y - 22} ${x + 14} ${y} Z" fill="#c9a050"/>`).join('')}</g>`;
  const ruins = `<g stroke="${ink}" stroke-width="2.4" fill="#b8a66a">${[0, 1, 2, 3].map((i) => `<path d="M${800 + i * 30} 640 V${590 - (i % 2) * 14} H${816 + i * 30} V640 Z"/>`).join('')}<path d="M792 596 H924 V584 H792 Z"/><path d="M836 640 C836 618 880 618 880 640 Z" fill="#3a2e14"/></g>`;
  const graves = `<g stroke="${ink}" stroke-width="2" fill="#c9bb8a">${Array.from({ length: 9 }, (_, i) => `<path d="M${716 + (i % 5) * 22} ${760 + Math.floor(i / 5) * 24} v-12 q6 -8 12 0 v12 Z"/>`).join('')}</g>`;
  const village = `${house(430, 838)}${house(476, 850, 1.1, '#8a4a2a')}${house(524, 838)}${house(498, 880, 0.9)}<g stroke="${ink}" stroke-width="2.4"><path d="M452 800 L440 760 H464 Z" fill="#cdbb84"/><g transform="translate(452 760)"><path d="M0 0 L-30 -22 M0 0 L30 22 M0 0 L22 -30 M0 0 L-22 30" stroke-width="4"/><circle r="5" fill="#8a4a2a"/></g></g>`;
  const castle = `${tower(20, 700, 34, 70)}${tower(70, 690, 44, 110, '#8a3a2a')}${tower(120, 700, 34, 60)}<path d="M-10 700 H150 V740 H-10 Z" fill="#cdbb84" stroke="${ink}" stroke-width="2.4"/><path d="M52 740 C52 716 88 716 88 740 Z" fill="#3a2e14" stroke="${ink}" stroke-width="2.4"/>${house(30, 850)}${house(76, 866, 1.1, '#8a4a2a')}${house(124, 846)}${house(60, 900, 0.9)}`;
  const oak = `<g stroke="${ink}" stroke-width="3"><path d="M612 1300 C624 1260 622 1230 616 1200 H668 C660 1232 660 1262 674 1300 Z" fill="#7a6632"/><path d="${blob(r, 640, 1170, 110, 62, 12, 0.18)}" fill="#7f8a3a"/><path d="M580 1166 q20 -16 40 0 M640 1150 q20 -16 40 0 M610 1196 q22 -12 44 0" fill="none" stroke-width="1.8"/><circle cx="630" cy="1262" r="4" fill="${ink}"/><circle cx="652" cy="1262" r="4" fill="${ink}"/></g>`;
  const grove = `<g stroke="${ink}" stroke-width="2.4"><path d="${blob(r, 850, 1090, 62, 40, 10, 0.2)}" fill="#8f9440"/><path d="M820 1120 h60 v20 h-60 Z M838 1140 v-34 h24 v34" fill="#cdbb84"/></g><g stroke="${ink}" stroke-width="2.4"><path d="${blob(r, 462, 1102, 60, 36, 10, 0.2)}" fill="#8a8f3a"/></g>${house(440, 1122, 0.9, '#6a7a3a')}${house(482, 1128, 0.9, '#6a7a3a')}<g stroke="${ink}" stroke-width="2.4" fill="#9aa04a"><path d="${blob(r, 660, 1046, 52, 26, 10, 0.2)}"/></g>`;
  const deep = `<g stroke="${ink}" stroke-width="2.4"><path d="${blob(r, 650, 920, 110, 50, 12, 0.15)}" fill="#3f7a78"/><path d="M590 920 q14 -30 40 -30 q26 0 40 30" fill="#cdbb84"/><path d="M700 900 c20 -20 40 -10 44 10" fill="none"/></g><g stroke="${ink}" stroke-width="2.4"><path d="${blob(r, 870, 860, 80, 46, 11, 0.16)}" fill="#3f7a78"/><path d="M820 850 C830 800 900 796 924 846 C900 872 846 876 820 850 Z" fill="#9a9a5a"/><circle cx="894" cy="836" r="6" fill="${ink}"/><path d="M824 858 q20 14 46 8" fill="none"/></g>`;
  return svg(w, h, `
    <linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d2b050"/><stop offset="0.45" stop-color="#c2ac4e"/><stop offset="1" stop-color="#a09a46"/></linearGradient>
    <rect width="${w}" height="${h}" fill="url(#land)"/>
    <rect width="${w}" height="${h}" filter="url(#mottle)" opacity="0.7"/>
    <g filter="url(#rough)">
      <path d="${blob(r, 60, 1310, 190, 130, 12, 0.14)}" fill="#3a6a66" stroke="${ink}" stroke-width="3"/>
      <g stroke="#1c3a38" stroke-width="2" fill="none">${waves}</g>
      <path d="M690 700 C640 760 600 800 580 870 C560 940 480 960 400 980 C320 1000 250 1060 180 1200" fill="none" stroke="${ink}" stroke-width="26" stroke-linecap="round"/>
      <path d="M690 700 C640 760 600 800 580 870 C560 940 480 960 400 980 C320 1000 250 1060 180 1200" fill="none" stroke="#4a8280" stroke-width="20" stroke-linecap="round"/>
      <path d="M150 760 C240 820 330 800 420 850 M150 780 C200 900 240 1000 250 1100 C260 1200 330 1260 420 1300 M300 1120 C360 1100 400 1110 440 1130" fill="none" stroke="#dcc878" stroke-width="16" stroke-linecap="round" opacity="0.9"/>
      <path d="M150 760 C240 820 330 800 420 850 M150 780 C200 900 240 1000 250 1100 C260 1200 330 1260 420 1300" fill="none" stroke="${ink}" stroke-width="1.6" stroke-dasharray="8 9" opacity="0.6"/>
    </g>
    <g filter="url(#fine)">
      <g stroke="${ink}" stroke-width="1.6" fill="none" opacity="0.55">${tufts}</g>
      ${peaks}${volcano}${smoke}${cave}${hold}${ruins}${graves}
      <path d="M352 968 h64 M352 988 h64" stroke="${ink}" stroke-width="3"/><path d="M356 966 q28 -22 56 0" fill="none" stroke="${ink}" stroke-width="3"/>
      ${castle}${village}${deep}${woods}${grove}${oak}
    </g>
    <g filter="url(#softer)" opacity="0.96">${fog}</g>
    <rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.4"/>`);
};
