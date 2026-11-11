import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
const root = resolve(import.meta.dir, '..');
const sdk = resolve(root, '.exact-sdk');
const revision = '336a059fd1464bee7c61640afb7124ebf276d06d';
const env = {...process.env, PATH: `${resolve(homedir(), '.cargo/bin')}:${process.env.PATH}`, EXACT_FEEDBACK: '0'};
function run(command, args, cwd=root) {
  const result=spawnSync(command,args,{cwd,env,stdio:'inherit'});
  if(result.status !== 0) process.exit(result.status ?? 1);
}
if(!existsSync(sdk)) {
  run('git',['clone','--no-checkout','https://github.com/expo/exact.git',sdk]);
  run('git',['checkout','--detach',revision],sdk);
}
const current=spawnSync('git',['rev-parse','HEAD'],{cwd:sdk,encoding:'utf8'}).stdout?.trim();
if(current !== revision) throw new Error(`Exact checkout differs from ${revision}. Preserve any local changes and use that revision before setup.`);
run(process.execPath,['install','--frozen-lockfile'],sdk);
run(process.execPath,['scripts/exact.mjs','setup'],sdk);
