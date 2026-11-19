import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Text and icons keep their contrast over every interaction fill (WCAG 2.2: 4.5:1 for text,
// 3:1 for icons). Hover keeps surface.hover-wash over a control while it is pressed.
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

// Fill, ink, minimum ratio, and whether the hover wash covers the fill in that state. Selected
// rows and buttons draw every glyph in ink.selected. Rows and tool buttons keep the wash while
// pressed; a nested row button's own press fill covers its row's wash, and menu rows highlight
// without one.
const cases: [fill: string, ink: string, minimum: number, washed: boolean][] = [
  ['surface.selected', 'ink.selected', 4.5, true],
  ['surface.selected-pressed', 'ink.selected', 4.5, true],
  ['surface.selected-pressed', 'ink.selected', 4.5, false],
  ['surface.action', 'ink.on-action', 3, true],
  ['surface.action-pressed', 'ink.on-action', 3, true],
  ['surface.field', 'ink.primary', 4.5, true],
  ['surface.field', 'ink.secondary', 4.5, true],
  ['surface.field', 'ink.muted', 3, true], // icons only; text on a pressable row uses ink.secondary
  ['surface.field', 'ink.muted', 4.5, false],
  ['surface.pressed', 'ink.primary', 4.5, true],
  // Menu rows: hover and keyboard focus, then pressed, with labels, shortcuts and destructive text.
  ['surface.selected', 'ink.primary', 4.5, false],
  ['surface.selected', 'ink.secondary', 4.5, false],
  ['surface.selected', 'ink.danger', 4.5, false],
  ['surface.selected-pressed', 'ink.primary', 4.5, false],
  ['surface.selected-pressed', 'ink.secondary', 4.5, false],
  ['surface.selected-pressed', 'ink.danger', 4.5, false],
];

for (const scheme of ['light', 'dark'] as const) {
  test(`interaction fills keep text and icon contrast in ${scheme}`, () => {
    const wash = token('surface.hover-wash', scheme);
    for (const [fill, ink, minimum, washed] of cases) {
      const base = token(fill, scheme), paint = washed ? over(wash, base) : base.slice(0, 3);
      const ratio = Math.round(contrast(paint, token(ink, scheme)) * 100) / 100;
      expect({fill, ink, washed, ratio, passes: ratio >= minimum}).toEqual({fill, ink, washed, ratio, passes: true});
    }
    // Hover and pressed stay distinguishable from the rest fill and from each other.
    const selected = token('surface.selected', scheme), pressed = token('surface.selected-pressed', scheme);
    expect(contrast(selected, over(wash, selected))).toBeGreaterThan(1.05);
    expect(contrast(over(wash, selected), over(wash, pressed))).toBeGreaterThan(1.05);
  });
}
