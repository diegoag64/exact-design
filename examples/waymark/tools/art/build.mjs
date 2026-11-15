// Draws Waymark's interface furniture and writes it to assets/art. Run from the repository root:
//   bun examples/waymark/tools/art/build.mjs [name-prefix]
// Each SVG renders in the SDK's headless Chromium, so its textures bake into PNG and JPEG files.
// Three kinds of picture derive from the generated illustrations beside them: the dimmed
// backdrop from forest.jpg, the profile tile from hero.jpg set into a generated tile's frame,
// and each generated tile itself, cut to its rounded corners at 320 pixels the first time.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { chrome } from './chrome.mjs';

const root = resolve(import.meta.dir, '../../../..');
const out = resolve(import.meta.dir, '../../assets/art');
const { chromium } = await import(resolve(root, '.exact-sdk/node_modules/playwright-core/index.mjs'));

const page = (width, height, body) => `<style>html,body{margin:0;background:transparent}svg,img{display:block}</style><div style="position:relative;width:${width}px;height:${height}px;overflow:hidden">${body}</div>`;
const size = (art) => art.match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number);

// A generated tile arrives 512 pixels square on black; a trimmed one is 320 and is left alone.
const pngWidth = (file) => readFileSync(file).readUInt32BE(16);
const rawTiles = readdirSync(out).filter((f) => /^tile-.*\.png$/.test(f) && f !== 'tile-me.png' && pngWidth(resolve(out, f)) !== 320);
const trimmed = (src) => `<img src="${src}" style="width:160px;height:160px;border-radius:21px">`;

const pictures = [
  ...rawTiles.map((name) => ({ name, width: 160, height: 160, html: page(160, 160, trimmed(name)) })),
  ...chrome().map((p) => ({ ...p, width: size(p.art)[0], height: size(p.art)[1], html: page(...size(p.art), p.art) })),
  { name: 'forest-dim.jpg', width: 600, height: 900, scale: 1, quality: 72, html: page(600, 900, `<img src="forest.jpg" style="width:600px;height:900px;filter:blur(16px) brightness(0.42) saturate(0.85);transform:scale(1.08)">`) },
  { name: 'tile-me.png', width: 160, height: 160, html: page(160, 160, `${trimmed('tile-loom.png')}<img src="hero.jpg" style="position:absolute;left:33px;top:33px;width:94px;height:94px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 3px #a8742e, 0 0 0 5px #2a1808, 0 0 10px 12px #100b07">`) },
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
