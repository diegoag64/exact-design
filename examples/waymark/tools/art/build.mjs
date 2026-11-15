// Draws Waymark's pictures and writes them to assets/art. Run from the repository root:
//   bun examples/waymark/tools/art/build.mjs [name-prefix]
// It renders each SVG in the SDK's headless Chromium, so textures bake into PNG and JPEG files.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chrome } from './chrome.mjs';
import { forest, hero, village, quest, banner } from './scenes.mjs';
import { map } from './map.mjs';

const root = resolve(import.meta.dir, '../../../..');
const out = resolve(import.meta.dir, '../../assets/art');
const { chromium } = await import(resolve(root, '.exact-sdk/node_modules/playwright-core/index.mjs'));

const pictures = [
  ...chrome(),
  { name: 'forest.jpg', art: forest(), scale: 1.5 },
  { name: 'forest-dim.jpg', art: forest(true), scale: 0.75, quality: 70 },
  { name: 'hero.jpg', art: hero(), scale: 1 },
  ...['day', 'dusk', 'night'].map((mood) => ({ name: `capture-${mood}.jpg`, art: village(mood) })),
  ...Array.from({ length: 8 }, (_, i) => ({ name: `quest-${i + 1}.jpg`, art: quest(i) })),
  ...Array.from({ length: 4 }, (_, i) => ({ name: `banner-${i + 1}.jpg`, art: banner(i) })),
  { name: 'map.jpg', art: map(), scale: 1.6, quality: 82 },
];

const only = process.argv[2];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const picture of pictures) {
  if (only && !picture.name.startsWith(only)) continue;
  const [, width, height] = picture.art.match(/width="(\d+)" height="(\d+)"/).map(Number);
  const jpeg = picture.name.endsWith('.jpg');
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: picture.scale ?? 2 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${picture.art}`);
  await page.screenshot({ path: resolve(out, picture.name), omitBackground: !jpeg, type: jpeg ? 'jpeg' : 'png', ...(jpeg ? { quality: picture.quality ?? 80 } : {}) });
  await page.close();
  console.log(picture.name);
}
await browser.close();
