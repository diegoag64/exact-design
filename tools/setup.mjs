import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { requireSupportedHost } from './platform.mjs';
requireSupportedHost();
const root = resolve(import.meta.dir, '..');
const sdk = resolve(root, '.exact-sdk');
const revision = '114bb88f6f6fc0d9da8c1846c51d81fe23f63042';
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
// Layout validation runs the Contract compiler directly, so build it at the pinned toolchain in the SDK's own target.
const toolchain=Bun.TOML.parse(await Bun.file(resolve(sdk,'rust-toolchain.toml')).text()).toolchain.channel;
const {RUSTUP_TOOLCHAIN,CARGO_TARGET_DIR,...cargoEnv}=env;
const compiler=spawnSync('cargo',[`+${toolchain}`,'build','-q','--manifest-path',resolve(sdk,'Cargo.toml'),'-p','contract'],{cwd:sdk,env:cargoEnv,stdio:'inherit'});
if(compiler.status !== 0) process.exit(compiler.status ?? 1);
