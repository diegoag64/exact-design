// Painted scenes: the forest behind the app, the hero, the day's captures and quest pictures.
import { rng, n, between, pick, svg, texture, blob, spiral } from './kit.mjs';

const leaf = (x, y, len, angle, fill) => `<path d="M0 0 Q${n(len * 0.3)} ${n(-len * 0.28)} ${len} 0 Q${n(len * 0.3)} ${n(len * 0.28)} 0 0 Z" fill="${fill}" transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})"/>`;

const foliage = (r, cx, cy, spread, count, greens, size = 34) => {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = between(r, 0, Math.PI * 2), d = Math.sqrt(r()) * spread;
    out += leaf(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, between(r, size * 0.6, size * 1.3), between(r, 0, 360), pick(r, greens));
  }
  return out;
};

const trunk = (r, x, base, top, width, fill, lean = 0) => {
  const w2 = width * 0.62;
  return `<path d="M${n(x - width / 2)} ${base} C${n(x - width / 2 + lean * 0.3)} ${n(base - (base - top) * 0.5)} ${n(x - w2 / 2 + lean)} ${n(top + 80)} ${n(x - w2 / 2 + lean)} ${top} H${n(x + w2 / 2 + lean)} C${n(x + w2 / 2 + lean)} ${n(top + 80)} ${n(x + width / 2 + lean * 0.3)} ${n(base - (base - top) * 0.5)} ${n(x + width / 2 + between(r, 0, 14))} ${base} Z" fill="${fill}"/>`;
};

export const forest = (dim = false) => {
  const w = 800, h = 1300, r = rng(5);
  let far = '', mid = '', canopy = '', shafts = '', near = '', stones = '', flies = '';
  for (let i = 0; i < 9; i++) far += trunk(r, between(r, 0, w), 900, -20, between(r, 40, 90), pick(r, ['#3f5446', '#46594a', '#36493f']), between(r, -30, 30));
  for (let i = 0; i < 5; i++) mid += trunk(r, [60, 250, 520, 700, 790][i] + between(r, -20, 20), 1040, -20, between(r, 90, 170), pick(r, ['#2a3229', '#30382b', '#262d26']), between(r, -40, 40));
  for (let i = 0; i < 22; i++) canopy += `<path d="${blob(r, between(r, -40, w + 40), between(r, -40, 210), between(r, 90, 190), between(r, 60, 120), 9, 0.3)}" fill="${pick(r, ['#1c2a1c', '#223322', '#2b3d25', '#1a251b'])}"/>`;
  for (let i = 0; i < 6; i++) {
    const x = between(r, 80, 700), spread = between(r, 50, 120);
    shafts += `<path d="M${n(x)} -20 L${n(x + spread)} -20 L${n(x + spread - 260)} 1000 L${n(x - 320)} 1000 Z" fill="#f0e6a8" opacity="${n(between(r, 0.05, 0.12))}"/>`;
  }
  for (let i = 0; i < 16; i++) stones += `<path d="${blob(r, 400 + between(r, -150, 150) + (i - 8) * 6, 900 + i * 26, between(r, 40, 80), between(r, 16, 28), 8, 0.2)}" fill="${pick(r, ['#7d7a66', '#8a8672', '#6f6c5c'])}" opacity="0.85"/>`;
  near += foliage(r, 60, 1210, 190, 150, ['#2f5a24', '#3f7a2c', '#4f9434', '#274a20', '#62a83e'], 54);
  near += foliage(r, 760, 1160, 200, 170, ['#2f5a24', '#3f7a2c', '#4f9434', '#274a20', '#62a83e'], 54);
  near += foliage(r, 720, 760, 110, 60, ['#2c4f25', '#3a6a2a', '#28431f'], 38);
  near += foliage(r, 70, 640, 100, 50, ['#2c4f25', '#3a6a2a', '#28431f'], 36);
  for (let i = 0; i < 46; i++) {
    const x = between(r, 20, w - 20), y = between(r, 200, 1200), s = between(r, 1.5, 4);
    flies += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(s * 3)}" fill="#f6e27a" opacity="0.28" filter="url(#glow)"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(s)}" fill="#fff6c0" opacity="0.9"/>`;
  }
  const ladder = `<g stroke="#5a4326" stroke-width="5" opacity="0.9"><path d="M520 470 V780 M560 470 V780"/>${Array.from({ length: 11 }, (_, i) => `<path d="M520 ${490 + i * 27} H560"/>`).join('')}</g><path d="M430 430 H660 L640 480 H450 Z" fill="#4a3620"/><path d="M430 430 Q545 380 660 430" fill="#5a6a3a"/>`;
  const body = `
    <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3a2c"/><stop offset="0.45" stop-color="#55664a"/><stop offset="0.75" stop-color="#5c6148"/><stop offset="1" stop-color="#3a3f30"/></linearGradient>
    <rect width="${w}" height="${h}" fill="url(#fg)"/>
    <g filter="url(#soft)" opacity="0.9">${far}</g>
    <ellipse cx="400" cy="560" rx="330" ry="300" fill="#c9d39a" opacity="0.22" filter="url(#softer)"/>
    <g filter="url(#rough2)">${mid}${ladder}</g>
    <g filter="url(#rough2)"><path d="M150 1300 C240 1050 330 900 400 820 C470 900 560 1050 650 1300 Z" fill="#6a6854"/>${stones}</g>
    <g filter="url(#soft)">${shafts}</g>
    <g filter="url(#rough)">${canopy}</g>
    <g filter="url(#rough)">${near}</g>
    ${flies}${texture(w, h, 'grain', 0.35)}`;
  if (!dim) return svg(w, h, body);
  return svg(w, h, `<g filter="url(#dimblur)">${body}</g><rect width="${w}" height="${h}" fill="#0d0b08" opacity="0.6"/>`, '<filter id="dimblur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="22"/></filter>');
};

// The hero: a lantern-bearer in a russet hood. Drawn in a 200-point square.
export const heroBust = () => {
  const r = rng(12);
  let bokeh = '';
  for (let i = 0; i < 16; i++) bokeh += `<circle cx="${n(between(r, 0, 200))}" cy="${n(between(r, 0, 150))}" r="${n(between(r, 8, 26))}" fill="${pick(r, ['#9fd08a', '#d8e8a0', '#6fae6a', '#f2f0b8'])}" opacity="${n(between(r, 0.2, 0.5))}"/>`;
  return `
    <rect width="200" height="200" fill="#3d6a48"/><rect width="200" height="110" fill="#8fbfae" opacity="0.6"/>
    <g filter="url(#soft)">${bokeh}</g>
    <g filter="url(#fine)">
      <path d="M22 200 C26 150 56 132 100 130 C144 132 174 150 178 200 Z" fill="#8a3a1e"/>
      <path d="M22 200 C26 160 50 140 74 134 C70 160 74 182 80 200 Z" fill="#6e2c16"/>
      <path d="M48 96 C40 40 74 14 104 14 C138 14 166 44 154 104 C148 136 126 150 100 150 C74 150 54 132 48 96 Z" fill="#a8482a"/>
      <path d="M104 14 C92 20 86 30 84 42 C96 30 118 26 140 34 C130 20 118 14 104 14 Z" fill="#c05c36"/>
      <path d="M66 96 C62 62 80 44 102 44 C126 44 142 62 138 96 C134 124 118 138 102 138 C84 138 70 124 66 96 Z" fill="#c98a5c"/>
      <path d="M66 86 C64 60 82 44 102 44 C124 44 140 58 138 84 C130 66 116 60 102 62 C88 60 74 68 66 86 Z" fill="#2c1a12"/>
      <path d="M102 62 C96 70 88 72 80 70" fill="none" stroke="#2c1a12" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="88" cy="96" rx="4.2" ry="5.4" fill="#2a1c14"/><ellipse cx="118" cy="96" rx="4.2" ry="5.4" fill="#2a1c14"/>
      <circle cx="89.4" cy="94" r="1.4" fill="#fff"/><circle cx="119.4" cy="94" r="1.4" fill="#fff"/>
      <path d="M80 86 Q88 81 95 85 M111 85 Q118 81 126 86" fill="none" stroke="#2a1c14" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M94 118 Q103 125 112 118" fill="none" stroke="#7a3c24" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M100 100 Q104 108 100 110" fill="none" stroke="#a86a44" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M58 140 C74 152 126 152 144 140 C150 152 146 164 138 170 C116 160 84 160 62 170 C54 162 52 150 58 140 Z" fill="#2f8a86"/>
      <path d="M62 170 C84 160 116 160 138 170" fill="none" stroke="#1f5e5c" stroke-width="3"/>
    </g>
    <circle cx="164" cy="150" r="22" fill="#ffe9a0" opacity="0.45" filter="url(#glow)"/>
    <g filter="url(#fine)"><rect x="155" y="138" width="18" height="26" rx="4" fill="#ffd866" stroke="#4a3210" stroke-width="2.5"/><path d="M158 138 Q164 124 170 138" fill="none" stroke="#4a3210" stroke-width="2.5"/></g>`;
};

export const hero = () => svg(400, 400, `<g transform="scale(2)">${heroBust()}</g>${texture(400, 400, 'grain', 0.25)}`);

// One village path, three times of day.
export const village = (mood) => {
  const w = 640, h = 360, r = rng(31);
  const sky = { day: ['#e0c9a0', '#b9825a'], dusk: ['#c9905a', '#7a4a3a'], night: ['#27405a', '#16263a'] }[mood];
  const wash = { day: ['#ff9a4a', 0.1], dusk: ['#b84a1e', 0.28], night: ['#0c2a52', 0.62] }[mood];
  let grass = '', flags = '', blooms = '';
  for (let i = 0; i < 260; i++) {
    const x = between(r, 0, w), y = between(r, 205, h);
    grass += `<path d="M${n(x)} ${n(y)} q${n(between(r, -4, 4))} ${n(-between(r, 8, 20))} ${n(between(r, -6, 6))} ${n(-between(r, 12, 26))}" stroke="${pick(r, ['#5a7a2c', '#6f8f34', '#4a6626', '#86a03c'])}" stroke-width="${n(between(r, 1.5, 3))}" fill="none"/>`;
  }
  for (let i = 0; i < 9; i++) {
    const x = 96 + i * 34, y = 64 + Math.sin(i / 8 * Math.PI) * 26;
    flags += `<path d="M${x} ${n(y)} l22 4 l-6 26 l-9 -7 l-10 3 Z" fill="${['#c9d0d8', '#b8483a', '#d8a04a', '#8a9ab0'][i % 4]}"/>`;
  }
  for (let i = 0; i < 26; i++) blooms += `<circle cx="${n(between(r, 60, 330))}" cy="${n(between(r, 215, 300))}" r="${n(between(r, 2, 4))}" fill="${pick(r, ['#b890d8', '#e8d8f0', '#9a7ac8'])}"/>`;
  return svg(w, h, `
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
    <rect width="${w}" height="${h}" fill="url(#sky)"/>
    <g filter="url(#rough2)">
      <path d="M260 0 H640 V190 C560 170 500 150 430 160 C360 170 300 120 260 0 Z" fill="#9a5a36"/>
      <path d="M330 60 C420 90 520 80 640 110 V190 C540 160 430 190 330 60 Z" fill="#7e4628" opacity="0.8"/>
      <path d="M0 0 H250 C262 90 250 180 268 252 H0 Z" fill="#6a3a22"/>
      <path d="M60 0 C70 90 60 170 76 250 M150 0 C166 80 156 170 170 252" stroke="#4a2616" stroke-width="12" fill="none" opacity="0.7"/>
      <path d="M0 210 C120 196 300 214 470 200 C540 196 600 204 640 200 V360 H0 Z" fill="#6a7a34"/>
      <path d="M250 360 C300 300 380 250 520 214 C560 208 600 210 640 214 V250 C540 250 430 300 400 360 Z" fill="#9a6a44"/>
    </g>
    <g filter="url(#fine)">
      <path d="M96 60 Q232 118 372 62" fill="none" stroke="#3a2416" stroke-width="2.5"/>${flags}
      <path d="M372 30 V250" stroke="#3a2416" stroke-width="6"/>
      <path d="M486 150 H640 V360 H520 Z" fill="#8a3422"/>
      <path d="M486 150 L520 360" stroke="#5a2014" stroke-width="5"/>
      <g stroke="#5a2014" stroke-width="3">${Array.from({ length: 7 }, (_, i) => `<path d="M${520 + i * 20} ${150 + i * 2} V360"/>`).join('')}</g>
      <path d="M452 118 L640 76 V150 L486 166 Z" fill="#4f8a82"/>
      <path d="M452 118 L640 76 V92 L462 132 Z" fill="#7ab8a8"/>
      <g stroke="#2f5e5a" stroke-width="2.5">${Array.from({ length: 9 }, (_, i) => `<path d="M${470 + i * 20} ${116 - i * 4} L${488 + i * 18} ${164 - i * 2}"/>`).join('')}</g>
      <path d="M560 20 H640 V76 L560 96 Z" fill="#b89a6a" opacity="0.85"/>
    </g>
    <g filter="url(#fine)">${grass}${blooms}</g>
    <g filter="url(#fine)" transform="translate(326 232)">
      <ellipse cx="0" cy="58" rx="26" ry="7" fill="#1c1408" opacity="0.4"/>
      <path d="M-16 56 C-20 26 -12 6 0 4 C12 6 20 26 16 56 Z" fill="#8a3a1e"/>
      <path d="M-11 6 C-13 -12 -6 -22 1 -22 C9 -22 14 -12 11 6 Z" fill="#a8482a"/>
      <circle cx="-14" cy="34" r="12" fill="#3a5a9a" stroke="#1c2e5a" stroke-width="2.5"/><circle cx="-14" cy="34" r="5" fill="#d8b04a"/>
      <path d="M12 12 L22 -18" stroke="#c9ccd4" stroke-width="3" stroke-linecap="round"/>
    </g>
    <circle cx="282" cy="214" r="18" fill="#cfe8ff" opacity="0.5" filter="url(#glow)"/><circle cx="282" cy="214" r="5" fill="#fff"/>
    <path d="M276 208 q-8 -8 -4 -14 q6 4 6 12 M288 208 q8 -8 4 -14 q-6 4 -6 12" fill="#eaf6ff" opacity="0.9"/>
    <rect width="${w}" height="${h}" fill="${wash[0]}" opacity="${wash[1]}" style="mix-blend-mode:multiply"/>
    ${mood === 'night' ? `<circle cx="282" cy="214" r="46" fill="#bfe0ff" opacity="0.35" filter="url(#softer)"/><circle cx="282" cy="214" r="5" fill="#fff"/>` : ''}
    ${texture(w, h, 'grain', 0.3)}`);
};

const runeStone = (cx, cy, s, mark) => {
  const marks = [
    `<path d="${spiral(0, 0, 20, 1.6, 1, 0)}" fill="none" stroke="#b83a2a" stroke-width="5" stroke-linecap="round"/><path d="M-30 -6 L-24 0 L-30 6 M30 -6 L24 0 L30 6" fill="none" stroke="#b83a2a" stroke-width="4"/>`,
    `<circle r="11" fill="none" stroke="#b83a2a" stroke-width="5"/>${Array.from({ length: 8 }, (_, i) => `<path d="M0 -17 V-27" stroke="#b83a2a" stroke-width="5" stroke-linecap="round" transform="rotate(${i * 45})"/>`).join('')}`,
    `<path d="M-22 14 L0 -22 L22 14 Z M-10 6 H10" fill="none" stroke="#b83a2a" stroke-width="5" stroke-linejoin="round"/><circle cy="-2" r="3.5" fill="#b83a2a"/>`,
  ];
  return `<g transform="translate(${cx} ${cy}) scale(${s})"><ellipse cx="0" cy="34" rx="50" ry="12" fill="#10140a" opacity="0.5"/><path d="M-40 26 C-48 -8 -28 -40 0 -42 C30 -40 48 -10 40 26 C30 36 -30 36 -40 26 Z" fill="#b8b4a4" stroke="#55523f" stroke-width="3"/><path d="M-40 26 C-30 36 30 36 40 26 C40 12 20 20 0 20 C-20 20 -40 12 -40 26 Z" fill="#8a8674"/><g transform="rotate(-6)">${marks[mark]}</g></g>`;
};

// Eight quest pictures over one mossy ground; `kind` picks what stands on it.
export const quest = (kind) => {
  const w = 420, h = 236, r = rng(40 + kind);
  const palette = [['#3a3220', '#57512c'], ['#2a2016', '#4a3420'], ['#32402a', '#566a34'], ['#4a5a2c', '#7e9440'], ['#2c2416', '#4a4022'], ['#5a6e4a', '#86a06a'], ['#2e3a30', '#4a5e44'], ['#4a4028', '#7a6c3a']][kind];
  let ground = '', moss = '';
  for (let i = 0; i < 9; i++) ground += `<path d="${blob(r, between(r, 0, w), between(r, 120, h), between(r, 60, 130), between(r, 26, 54), 9, 0.3)}" fill="${pick(r, ['#4a5a26', '#5e7030', '#3c4a20', '#6f8236'])}" opacity="0.85"/>`;
  for (let i = 0; i < 90; i++) {
    const x = between(r, 0, w), y = between(r, 130, h);
    moss += `<path d="M${n(x)} ${n(y)} q${n(between(r, -5, 5))} ${n(-between(r, 6, 14))} ${n(between(r, -5, 5))} ${n(-between(r, 10, 20))}" stroke="${pick(r, ['#86a03c', '#a8c04a', '#5a7a2c'])}" stroke-width="2" fill="none"/>`;
  }
  const subjects = [
    `<g transform="translate(210 112) rotate(-8)"><path d="M-110 -52 H96 L112 -36 V44 L92 56 H-104 L-118 30 Z" fill="#d8c078" stroke="#6a5226" stroke-width="4"/><path d="M-110 -30 H104 M-112 12 H108" stroke="#b89a54" stroke-width="2"/>${[['#4aa85a', -70], ['#3a78d8', -24], ['#d84a4a', 22], ['#b04ad8', 66]].map(([c, x]) => `<g transform="translate(${x} 0)" fill="none" stroke="${c}" stroke-width="4"><path d="M0 -24 L16 -8 L10 14 L-10 14 L-16 -8 Z"/><path d="M0 -12 L8 2 L-8 2 Z"/></g>`).join('')}</g><g stroke-linecap="round" stroke-width="13"><path d="M96 198 l36 10" stroke="#3a78d8"/><path d="M92 214 l40 6" stroke="#4aa85a"/><path d="M150 184 l22 8" stroke="#d84a4a"/><path d="M236 214 l20 14" stroke="#f0ead8"/><path d="M290 196 l6 26" stroke="#b04ad8"/></g>`,
    `<g transform="translate(210 0)"><path d="M0 30 V230" stroke="#6a4a26" stroke-width="12"/><path d="M-80 78 L80 62" stroke="#6a4a26" stroke-width="10" stroke-linecap="round"/><path d="M-70 16 H70 V48 H-70 Z" fill="#a8603a" stroke="#5a2e16" stroke-width="3"/><g stroke="#e0b860" stroke-width="5" stroke-linecap="round">${Array.from({ length: 22 }, (_, i) => `<path d="M0 108 L${n(Math.cos(i / 22 * Math.PI * 2) * 62)} ${n(108 + Math.sin(i / 22 * Math.PI * 2) * 62)}"/>`).join('')}</g><circle cy="108" r="44" fill="#e8c878" stroke="#8a6a2c" stroke-width="3"/><circle cy="108" r="30" fill="none" stroke="#b8482c" stroke-width="7"/><circle cy="108" r="11" fill="#b8482c"/><path d="M-22 150 H22 L30 214 H-30 Z" fill="#c9a04a" stroke="#8a6a2c" stroke-width="3"/><path d="M-26 172 H26" stroke="#8a3a22" stroke-width="5"/></g>`,
    runeStone(190, 132, 1.25, 0),
    runeStone(226, 126, 1.35, 1),
    `<path d="M70 236 C70 90 150 44 210 44 C270 44 350 90 350 236 Z" fill="#1c140c"/><path d="M110 150 C150 124 270 124 310 150 C300 166 120 166 110 150 Z" fill="#b8482c"/><path d="M108 164 H312 V190 H108 Z" fill="#5a7a2c"/><path d="M128 190 V230 M292 190 V230" stroke="#3a2a16" stroke-width="16"/>${[60, 360].map((x) => `<g transform="translate(${x} 120)"><circle r="30" fill="#ffe08a" opacity="0.4" filter="url(#glow)"/><rect x="-12" y="-18" width="24" height="38" rx="5" fill="#ffd866" stroke="#3a2a10" stroke-width="3"/><path d="M-12 -18 Q0 -34 12 -18" fill="none" stroke="#3a2a10" stroke-width="3"/><rect x="-18" y="30" width="36" height="74" fill="#8a6a44" stroke="#3a2a16" stroke-width="3"/></g>`).join('')}`,
    `${runeStone(250, 132, 1.3, 2)}${Array.from({ length: 3 }, (_, i) => `<g transform="translate(${70 + i * 150} ${90 + (i % 2) * 40})">${Array.from({ length: 7 }, (_, j) => `<path d="M0 60 Q${-40 + j * 13} ${-10} ${-70 + j * 24} ${-30 + Math.abs(j - 3) * 10}" stroke="#3f7a2c" stroke-width="7" fill="none" stroke-linecap="round"/>`).join('')}</g>`).join('')}`,
    `<g transform="translate(210 150)"><ellipse cy="50" rx="110" ry="18" fill="#10140a" opacity="0.45"/><path d="M-84 50 V-10 H84 V50 Z" fill="#9a9684" stroke="#55523f" stroke-width="3"/><g stroke="#55523f" stroke-width="2.5"><path d="M-84 10 H84 M-84 30 H84 M-40 -10 V10 M10 -10 V10 M50 -10 V10 M-60 10 V30 M-10 10 V30 M34 10 V30 M-34 30 V50 M16 30 V50"/></g><ellipse cy="-10" rx="84" ry="16" fill="#1c241c" stroke="#55523f" stroke-width="3"/><path d="M-70 -10 V-96 H70 V-10" fill="none" stroke="#6a4a26" stroke-width="9"/><path d="M-86 -96 L0 -128 L86 -96 Z" fill="#8a3a22" stroke="#5a2014" stroke-width="3"/><path d="M0 -96 V-34" stroke="#c9b48a" stroke-width="3"/><rect x="-12" y="-40" width="24" height="22" fill="#7a5226" stroke="#3a2410" stroke-width="2.5"/></g>`,
    `<g transform="translate(210 0)"><path d="M0 60 V236" stroke="#6a4a26" stroke-width="13"/><path d="M-100 62 H70 L100 86 L70 110 H-100 Z" fill="#c9a060" stroke="#5a3a16" stroke-width="4"/><path d="M100 126 H-66 L-98 148 L-66 170 H100 Z" fill="#b08a4c" stroke="#5a3a16" stroke-width="4"/><g stroke="#5a3a16" stroke-width="5" stroke-linecap="round"><path d="M-70 86 H40 M-40 148 H70"/></g><circle cx="0" cy="40" r="18" fill="#ffe08a" opacity="0.5" filter="url(#glow)"/><circle cx="0" cy="40" r="7" fill="#fff6c0"/></g>`,
  ];
  return svg(w, h, `
    <linearGradient id="qg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient>
    <rect width="${w}" height="${h}" fill="url(#qg)"/>
    <ellipse cx="${n(between(r, 120, 300))}" cy="70" rx="200" ry="90" fill="#e8e0a0" opacity="0.14" filter="url(#softer)"/>
    <g filter="url(#rough2)">${ground}</g>
    <g filter="url(#rough)">${subjects[kind]}</g>
    <g filter="url(#fine)">${moss}</g>
    <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
    <rect width="${w}" height="${h}" fill="url(#vig)"/>${texture(w, h, 'grain', 0.35)}`);
};

// Wide strips behind the Global Play Data cards.
export const banner = (kind) => {
  const w = 720, h = 170, r = rng(70 + kind);
  const tone = [['#2a2416', '#6a5a2c'], ['#12403c', '#3a8a74'], ['#2a3020', '#5a6a3a'], ['#3a4a2a', '#8a9a4a']][kind];
  let bits = '';
  for (let i = 0; i < 12; i++) bits += `<path d="${blob(r, between(r, 0, w), between(r, 20, h), between(r, 50, 140), between(r, 20, 60), 9, 0.3)}" fill="${pick(r, [tone[0], tone[1], '#1c1a10'])}" opacity="0.6"/>`;
  const subject = [
    `<g transform="translate(330 80)">${Array.from({ length: 12 }, (_, i) => `<path d="M0 0 L${n(Math.cos(i / 12 * 6.283) * 150)} ${n(Math.sin(i / 12 * 6.283) * 110)}" stroke="#c9b060" stroke-width="2" opacity="0.6"/>`).join('')}${[40, 80, 118].map((q) => `<ellipse rx="${q * 1.3}" ry="${q}" fill="none" stroke="#c9b060" stroke-width="2" opacity="0.5"/>`).join('')}<path d="M-34 4 C-40 -30 -16 -46 0 -46 C16 -46 40 -30 34 4 C30 28 14 40 0 44 C-14 40 -30 28 -34 4 Z" fill="#b89a5a" stroke="#3a2a10" stroke-width="3"/><g stroke="#3a2a10" stroke-width="6" fill="none" stroke-linecap="round"><path d="M-30 -10 L-74 -40 L-96 -10 M-32 10 L-80 16 L-100 50 M30 -10 L74 -40 L96 -10 M32 10 L80 16 L100 50"/></g><g fill="#3a1a10"><ellipse cx="-12" cy="-8" rx="7" ry="9"/><ellipse cx="12" cy="-8" rx="7" ry="9"/></g><path d="M-10 20 H10" stroke="#3a1a10" stroke-width="4"/></g>`,
    `<g transform="translate(350 86)"><circle r="70" fill="#f8e060" opacity="0.35" filter="url(#softer)"/><circle r="34" fill="#f4d23c" stroke="#7a6a10" stroke-width="4"/><circle r="15" fill="#5a4a10"/><g stroke="#2a6a5a" stroke-width="9" fill="none" stroke-linecap="round"><path d="M-40 -10 C-110 -50 -170 -30 -220 -60 M40 -10 C110 -50 170 -30 220 -60 M-36 20 C-90 40 -150 30 -190 60 M36 20 C90 40 150 30 190 60"/></g></g>`,
    `<g transform="translate(300 96)"><path d="M-150 40 H170 V64 H-150 Z" fill="#6a4a26"/><path d="M-60 34 C-70 0 -30 -20 10 -14 C60 -8 96 8 100 34 Z" fill="#4a7a3a" stroke="#1c3414" stroke-width="3"/><circle cx="-66" cy="10" r="20" fill="#5a8a44" stroke="#1c3414" stroke-width="3"/><path d="M70 -66 q-10 -18 -2 -30 q10 8 8 28 M82 -62 q12 -16 24 -14 q-2 14 -20 22" fill="#f4f0e0" stroke="#8a8670" stroke-width="2"/><circle cx="78" cy="-58" r="9" fill="#f4f0e0"/></g>`,
    `<g transform="translate(360 50)"><path d="M-300 30 H300" stroke="#6a4a26" stroke-width="5"/>${Array.from({ length: 30 }, (_, i) => `<circle cx="${n(-34 + (i % 6) * 14 + (Math.floor(i / 6) % 2) * 7)}" cy="${n(-34 + Math.floor(i / 6) * 13)}" r="8" fill="${i % 3 ? '#e8a02c' : '#f4c24a'}" stroke="#8a5a10" stroke-width="1.5"/>`).join('')}${Array.from({ length: 9 }, (_, i) => `<path d="M${-300 + i * 30} 30 V110" stroke="#8a7a4a" stroke-width="5"/>`).join('')}</g>`,
  ][kind];
  return svg(w, h, `
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${tone[0]}"/><stop offset="1" stop-color="${tone[1]}"/></linearGradient>
    <rect width="${w}" height="${h}" fill="url(#bg)"/><g filter="url(#rough2)">${bits}</g><g filter="url(#rough)">${subject}</g>
    <rect width="${w}" height="${h}" fill="#6a4a1e" opacity="0.25"/>${texture(w, h, 'grain', 0.4)}`);
};
