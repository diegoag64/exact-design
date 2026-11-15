// Convert new PNG/JPEG artwork once. Existing WebP files are never re-encoded.
import { execFileSync } from 'node:child_process';
import { readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export function requireEncoder() {
  try {
    execFileSync('cwebp', ['-version'], { stdio: 'pipe' });
  } catch {
    throw new Error('Install cwebp before optimizing art (macOS: brew install webp).');
  }
}

export function optimizeArt(directory) {
  requireEncoder();
  for (const name of readdirSync(directory).sort()) {
    if (!/\.(png|jpe?g)$/i.test(name)) continue;
    const source = resolve(directory, name);
    const target = source.replace(/\.(png|jpe?g)$/i, '.webp');
    const temporary = `${target}.tmp`;
    // Keep every pixel of the code-drawn transparent ornaments. Painted tiles use
    // lossy colour with lossless alpha; nothing is resized.
    const lossless = name.endsWith('.png') && !name.startsWith('tile-');
    const settings = lossless ? ['-lossless'] : ['-q', '85', '-sharp_yuv', '-alpha_q', '100'];
    try {
      execFileSync('cwebp', ['-quiet', '-m', '6', '-exact', ...settings, source, '-o', temporary], { stdio: 'pipe' });
      const before = statSync(source).size;
      const after = statSync(temporary).size;
      renameSync(temporary, target);
      rmSync(source);
      console.log(`${name} → ${target.split('/').pop()}: ${before} → ${after} bytes`);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
}

if (import.meta.main) optimizeArt(resolve(import.meta.dir, '../../assets/art'));
