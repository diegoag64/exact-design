import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { requireSupportedHost } from './platform.mjs';
requireSupportedHost();
const root = resolve(import.meta.dir, '..');
process.env.PATH = `${resolve(homedir(), '.cargo/bin')}:${process.env.PATH}`;
process.env.EXACT_FEEDBACK = '0';
process.env.EXACT_TOOL_PORT ??= '5173';
const { run } = await import(resolve(root, '.exact-sdk/scripts/app-cli.mjs'));
// Each showcase app has its own folder, default port and first screens. `--app <id>` picks one.
const apps = {
  ember: { name: 'Ember', port: '5174', show: 'Today,Welcome,Onboarding%20Goal' },
  waymark: { name: 'Waymark', port: '5176', show: 'Home,Map,My%20Play%20Data' },
};
const args = process.argv.slice(2);
const at = args.indexOf('--app');
const id = at < 0 ? 'ember' : args[at + 1];
if (at >= 0) args.splice(at, 2);
const chosen = apps[id];
if (!chosen) {
  console.error(`Unknown app "${id}". Choose one of: ${Object.keys(apps).join(', ')}.`);
  process.exit(1);
}
if ((args[0] ?? 'web') === 'web') {
  const port = args[args.indexOf('--port') + 1] && args.includes('--port') ? args[args.indexOf('--port') + 1] : chosen.port;
  const app = `http://127.0.0.1:${port}`;
  console.log(`${chosen.name} in the studio: http://127.0.0.1:${process.env.EXACT_TOOL_PORT}/?connect=${app}&name=${chosen.name}&viewports=Core&show=${chosen.show}`);
}
process.exit(await run({ dir: resolve(root, 'examples', id), name: id, exact2: resolve(root, '.exact-sdk'), args: args.length ? args : ['web', '--port', chosen.port] }));
