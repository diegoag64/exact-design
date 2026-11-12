import { resolve } from 'node:path';
import { homedir } from 'node:os';
const root = resolve(import.meta.dir, '..');
process.env.PATH = `${resolve(homedir(), '.cargo/bin')}:${process.env.PATH}`;
process.env.EXACT_FEEDBACK = '0';
process.env.EXACT_TOOL_PORT ??= '5173';
const { run } = await import(resolve(root, '.exact-sdk/scripts/app-cli.mjs'));
const args = process.argv.slice(2);
if ((args[0] ?? 'web') === 'web') {
  const port = args[args.indexOf('--port') + 1] && args.includes('--port') ? args[args.indexOf('--port') + 1] : '5174';
  const app = `http://127.0.0.1:${port}`;
  console.log(`Ember in the studio: http://127.0.0.1:${process.env.EXACT_TOOL_PORT}/?connect=${app}&name=Ember&viewports=Core&show=Today,Welcome,Onboarding%20Goal`);
}
process.exit(await run({ dir: resolve(root, 'examples/ember'), name: 'ember', exact2: resolve(root, '.exact-sdk'), args: args.length ? args : ['web', '--port', '5174'] }));
