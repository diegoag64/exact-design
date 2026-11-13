import {spawn} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {homedir} from 'node:os';
import {requireSupportedHost} from './platform.mjs';

const repositoryRoot = resolve(import.meta.dir, '..');

async function git(cwd, args) {
  const child = Bun.spawn(['git', ...args], {cwd, stdout:'pipe', stderr:'pipe'});
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code) throw new Error(err);
  return out;
}

// Copy current source, including untracked additions, but never cached builds or user data.
export async function copySources(source, destination) {
  const files = (await git(source, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'studio', 'tools'])).split('\0').filter(Boolean);
  for (const file of new Set(files)) {
    await mkdir(dirname(resolve(destination, file)), {recursive:true});
    await cp(resolve(source, file), resolve(destination, file)).catch(error => {
      if (error.code !== 'ENOENT') throw error; // A tracked file can be deleted in the working tree.
    });
  }
}

export async function configureCopy(directory, helperOrigin, fixtureOrigin) {
  for (const file of ['studio/app.ts', 'studio/app.test.contract']) {
    const path = resolve(directory, file);
    const text = await readFile(path, 'utf8');
    await writeFile(path, text.replaceAll('http://127.0.0.1:5175', helperOrigin).replaceAll('http://127.0.0.1:5176', fixtureOrigin));
  }
  const path = resolve(directory, 'studio/app.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  // The runner owns the helper and fixture for the entire audit, including concurrent tours.
  if (manifest.commands) delete manifest.commands.server;
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
}

export async function runIsolated(args, root = repositoryRoot) {
  requireSupportedHost();
  if (!['test', 'verify'].includes(args[0])) throw new Error('Use test web or verify with this runner.');
  await mkdir(resolve(root, '.exact/verification'), {recursive:true});
  const output = await mkdtemp(resolve(root, '.exact/verification/run-'));
  const workspace = resolve(output, 'workspace');
  let helper, fixture, bridges, child, interrupted;
  const signalGroup = signal => {
    if (child?.pid) try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  let killTimer;
  const stop = signal => {
    interrupted = signal;
    signalGroup('SIGTERM');
    killTimer ??= setTimeout(() => signalGroup('SIGKILL'), 3000);
    killTimer.unref();
  };
  const onInt = () => stop('SIGINT'), onTerm = () => stop('SIGTERM');
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
  const report = {args, startedAt:new Date().toISOString(), status:'running'};
  console.log(`Verification artifacts: ${output}`);
  try {
    report.head = (await git(root, ['rev-parse', 'HEAD'])).trim();
    report.sdkRevision = (await git(resolve(root, '.exact-sdk'), ['rev-parse', 'HEAD'])).trim();
    report.dirty = Boolean((await git(root, ['status', '--porcelain'])).trim());
    await copySources(root, workspace);
    await symlink(resolve(root, '.exact-sdk'), resolve(workspace, '.exact-sdk'), 'dir');
    const {startDiscoveryServer} = await import(resolve(workspace, 'tools/discovery-server.ts'));
    const {startDiscoveryFixture} = await import(resolve(workspace, 'tools/discovery-fixture.ts'));
    bridges = await import(resolve(workspace, 'tools/element-bridge.ts'));
    try {
      helper = startDiscoveryServer(0);
      fixture = startDiscoveryFixture(0);
    } catch (error) {
      throw new Error(`Cannot open isolated loopback servers. Check sandbox/network permissions. ${error.message}`, {cause:error});
    }
    report.helper = helper.url.origin; report.fixture = fixture.url.origin;
    await configureCopy(workspace, report.helper, report.fixture);
    const launcher = resolve(output, 'launch.mjs');
    await writeFile(launcher, `import {run} from ${JSON.stringify(resolve(root, '.exact-sdk/scripts/app-cli.mjs'))}; process.exit(await run({dir:${JSON.stringify(resolve(workspace, 'studio'))},name:'Exact Design',exact2:${JSON.stringify(resolve(root, '.exact-sdk'))},args:${JSON.stringify(args)}}));\n`);
    await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2));
    if (interrupted) throw new Error(`Interrupted by ${interrupted}`);
    child = spawn(process.execPath, [launcher], {
      cwd:resolve(workspace, 'studio'), detached:true, stdio:['ignore', 'pipe', 'pipe'],
      env:{...process.env, PATH:`${resolve(homedir(), '.cargo/bin')}:${process.env.PATH}`, EXACT_FEEDBACK:'0', EXACT_DESIGN_TEST:'1'},
    });
    const log = createWriteStream(resolve(output, 'output.log'));
    child.stdout.on('data', data => {process.stdout.write(data); log.write(data);});
    child.stderr.on('data', data => {process.stderr.write(data); log.write(data);});
    try {
      report.exitCode = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', () => signalGroup('SIGKILL'));
        child.once('close', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : 143)));
      });
    } finally {
      signalGroup('SIGKILL');
      await new Promise(resolve => log.end(resolve));
    }
    report.status = interrupted ? 'interrupted' : report.exitCode === 0 ? 'passed' : 'failed';
  } catch (error) {
    report.status = interrupted ? 'interrupted' : 'failed';
    report.error = error.stack;
    report.exitCode = 1;
    console.error(error.message);
  } finally {
    clearTimeout(killTimer);
    signalGroup('SIGKILL');
    helper?.stop(true); fixture?.stop(true); bridges?.stopElementBridges();
    process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
    // Preserve SDK reports and captures, then remove copied source and build output.
    const shots = resolve(workspace, 'studio/.exact/verify');
    try {
      await cp(shots, resolve(output, 'shots'), {recursive:true}).catch(error => {if (error.code !== 'ENOENT') throw error;});
    } catch (error) {
      report.artifactError = error.message;
      report.status = 'failed'; report.exitCode = 1;
    } finally {
      await rm(workspace, {recursive:true, force:true});
      await rm(resolve(output, 'launch.mjs'), {force:true});
    }
    report.finishedAt = new Date().toISOString();
    if (interrupted) report.exitCode = interrupted === 'SIGINT' ? 130 : 143;
    await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`Verification ${report.status}: ${output}`);
  }
  return report.exitCode;
}

if (import.meta.main) process.exitCode = await runIsolated(process.argv.slice(2));
