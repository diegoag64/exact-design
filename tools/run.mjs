import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
const root = resolve(import.meta.dir, '..');
const result = spawnSync(process.execPath, [resolve(root, 'studio/exact.mjs'), ...process.argv.slice(2)], {
  cwd: resolve(root, 'studio'), stdio: 'inherit',
  env: { ...process.env, PATH: `${resolve(homedir(), '.cargo/bin')}:${process.env.PATH}`, EXACT_FEEDBACK: '0' },
});
process.exit(result.status ?? 1);
