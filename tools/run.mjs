import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
const root = resolve(import.meta.dir, '..');
const args=process.argv.slice(2);
const helper=['web','serve'].includes(args[0]) ? (await import('./discovery-server.ts')).startDiscoveryServer() : null;
const child = spawn(process.execPath, [resolve(root, 'studio/exact.mjs'), ...args], {
  cwd: resolve(root, 'studio'), stdio: 'inherit',
  env: { ...process.env, PATH: `${resolve(homedir(), '.cargo/bin')}:${process.env.PATH}`, EXACT_FEEDBACK: '0', EXACT_DESIGN_TEST: ['test','verify'].includes(args[0]) ? '1' : '0' },
});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
try {
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
  process.exitCode=code;
} finally {
  helper?.stop(true);
  if(helper){const {stopElementBridges}=await import('./element-bridge.ts');stopElementBridges();}
}
