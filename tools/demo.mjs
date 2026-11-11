import { resolve } from 'node:path';
import { homedir } from 'node:os';
const root = resolve(import.meta.dir, '..');
process.env.PATH = `${resolve(homedir(), '.cargo/bin')}:${process.env.PATH}`;
process.env.EXACT_FEEDBACK = '0';
process.env.EXACT_TOOL_PORT ??= '5173';
const { run } = await import(resolve(root, '.exact-sdk/scripts/app-cli.mjs'));
const args = process.argv.slice(2);
process.exit(await run({ dir: resolve(root, 'examples/responsive'), name: 'responsive', exact2: resolve(root, '.exact-sdk'), args: args.length ? args : ['web', '--port', '5174'] }));
