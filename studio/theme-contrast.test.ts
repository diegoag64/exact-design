import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Hover keeps surface.hover-wash over a control's fill while it is pressed, so text and icons
// must keep their contrast over every fill with the wash on top (WCAG 2.2: 4.5:1 text, 3:1 icons).
const theme = readFileSync(resolve(import.meta.dir, 'app.forma'), 'utf8');
function token(name: string, scheme: 'light' | 'dark'): number[] {
  const value = theme.match(new RegExp(`^\\s*${name.replace('.', '\\.')} = (.+)$`, 'm'))![1];
  const pair = value.match(/light-dark\((#[0-9a-f]+), (#[0-9a-f]+)\)/i);
  const hex = pair ? pair[scheme === 'light' ? 1 : 2] : value.match(/#[0-9a-f]+/i)![0];
  return [1, 3, 5, 7].map(i => i < hex.length ? parseInt(hex.slice(i, i + 2), 16) : 255);
}
const over = (top: number[], base: number[]) => base.slice(0, 3).map((v, i) => v + (top[i] - v) * top[3] / 255);
const luminance = (c: number[]) => {
  const [r, g, b] = c.map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const pairs: [fill: string, ink: string, minimum: number][] = [
  ['surface.selected', 'ink.selected', 4.5],
  ['surface.selected-pressed', 'ink.selected', 4.5],
  ['surface.action', 'ink.on-action', 3],
  ['surface.action-pressed', 'ink.on-action', 3],
  ['surface.pressed', 'ink.primary', 4.5],
];

for (const scheme of ['light', 'dark'] as const) {
  test(`selected fills keep contrast at rest, hovered and pressed in ${scheme}`, () => {
    const wash = token('surface.hover-wash', scheme);
    for (const [fill, ink, minimum] of pairs) {
      const base = token(fill, scheme), text = token(ink, scheme);
      expect({fill, ratio: contrast(base, text) >= minimum}).toEqual({fill, ratio: true});
      expect({fill, washed: contrast(over(wash, base), text) >= minimum}).toEqual({fill, washed: true});
    }
    // Hover and pressed stay distinguishable from the rest fill and from each other.
    const selected = token('surface.selected', scheme), pressed = token('surface.selected-pressed', scheme);
    expect(contrast(selected, over(wash, selected))).toBeGreaterThan(1.05);
    expect(contrast(over(wash, selected), over(wash, pressed))).toBeGreaterThan(1.05);
  });
}
