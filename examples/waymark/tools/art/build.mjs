// Draws Waymark's interface furniture and writes it to assets/art. Run from the repository root:
//   bun examples/waymark/tools/art/build.mjs [name-prefix]
// Each SVG renders in the SDK's headless Chromium, so its textures bake into PNG and JPEG files.
// Two pictures derive from the generated illustrations beside them: the dimmed backdrop from
// forest.jpg, and the profile tile from hero.jpg set into a generated tile's frame.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { chrome } from './chrome.mjs';

const root = resolve(import.meta.dir, '../../../..');
const out = resolve(import.meta.dir, '../../assets/art');
const { chromium } = await import(resolve(root, '.exact-sdk/node_modules/playwright-core/index.mjs'));

const page = (width, height, body) => `<style>html,body{margin:0;background:transparent}svg,img{display:block}</style><div style="position:relative;width:${width}px;height:${height}px;overflow:hidden">${body}</div>`;
const size = (art) => art.match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number);

const pictures = [
  ...chrome().map((p) => ({ ...p, width: size(p.art)[0], height: size(p.art)[1], html: page(...size(p.art), p.art) })),
  { name: 'forest-dim.jpg', width: 600, height: 900, scale: 1, quality: 72, html: page(600, 900, `<img src="forest.jpg" style="width:600px;height:900px;filter:blur(16px) brightness(0.42) saturate(0.85);transform:scale(1.08)">`) },
  { name: 'tile-me.png', width: 256, height: 256, html: page(256, 256, `<img src="tile-foes.png" style="width:256px;height:256px"><img src="hero.jpg" style="position:absolute;left:50px;top:50px;width:156px;height:156px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 4px #8a5a26, 0 0 0 7px #2a1808, 0 0 18px 16px #120c06">`) },
];

const only = process.argv[2];
mkdirSync(out, { recursive: true });
const stage = resolve(out, '.stage.html');
const browser = await chromium.launch();
for (const picture of pictures) {
  if (only && !picture.name.startsWith(only)) continue;
  const jpeg = picture.name.endsWith('.jpg');
  const tab = await browser.newPage({ viewport: { width: picture.width, height: picture.height }, deviceScaleFactor: picture.scale ?? 2 });
  writeFileSync(stage, picture.html);
  await tab.goto(`file://${stage}`);
  await tab.screenshot({ path: resolve(out, picture.name), omitBackground: !jpeg, type: jpeg ? 'jpeg' : 'png', ...(jpeg ? { quality: picture.quality ?? 80 } : {}) });
  await tab.close();
  console.log(picture.name);
}
await browser.close();
rmSync(stage, { force: true });
