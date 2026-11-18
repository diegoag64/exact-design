import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { requireSupportedHost } from './platform.mjs';

requireSupportedHost();
const root = resolve(import.meta.dir, '..');
const sdk = resolve(root, '.exact-sdk');
process.env.PATH = `${resolve(homedir(), '.cargo/bin')}:${process.env.PATH}`;
process.env.EXACT_FEEDBACK = '0';
process.env.EXACT_TOOL_PORT ??= '5173';
const { run } = await import(resolve(sdk, 'scripts/app-cli.mjs'));
const args = process.argv.slice(2);
if (!args.length) args.push('web', '--port', '5194');
if (args[0] === 'web' && args.includes('--port')) {
  const port = args[args.indexOf('--port') + 1];
  console.log(`Tide in Studio: http://127.0.0.1:${process.env.EXACT_TOOL_PORT}/?connect=http://127.0.0.1:${port}&name=Tide&viewports=Core`);
}
process.exit(await run({ dir: resolve(root, 'examples/tide'), name: 'tide', exact2: sdk, args }));
