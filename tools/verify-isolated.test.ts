import {test, expect} from 'bun:test';
import {mkdtemp, mkdir, readFile, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {copySources, configureCopy} from './verify-isolated.mjs';

async function git(cwd:string, ...args:string[]) {
  const child=Bun.spawn(['git', ...args], {cwd, stdout:'pipe', stderr:'pipe'});
  if (await child.exited) throw new Error(await new Response(child.stderr).text());
}

test('verification snapshots current source without copying ignored build output or changing the checkout', async()=>{
  const temp=await mkdtemp(resolve(tmpdir(), 'exact-verification-test-'));
  try {
    const source=resolve(temp, 'source'), copy=resolve(temp, 'copy');
    await mkdir(resolve(source, 'studio/.exact'), {recursive:true});
    await mkdir(resolve(source, 'tools'), {recursive:true});
    await writeFile(resolve(source, '.gitignore'), '.exact/\n');
    await writeFile(resolve(source, 'studio/app.ts'), "export const API='http://127.0.0.1:5175';");
    await writeFile(resolve(source, 'studio/app.test.contract'), 'request GET "http://127.0.0.1:5176/mode"\nfail fetch "http://127.0.0.1:5175"');
    await writeFile(resolve(source, 'studio/app.json'), JSON.stringify({commands:{server:['bun','server.ts'],other:['bun','other.ts']},server:{database:false}}));
    await writeFile(resolve(source, 'studio/deleted.ts'), 'old');
    await git(source, 'init', '-q'); await git(source, 'add', '.');
    await rm(resolve(source, 'studio/deleted.ts'));
    await writeFile(resolve(source, 'studio/new.ts'), 'untracked');
    await writeFile(resolve(source, 'studio/.exact/build'), 'private build');
    await copySources(source, copy);
    await configureCopy(copy, 'http://127.0.0.1:25175', 'http://127.0.0.1:25176');
    expect(await readFile(resolve(copy,'studio/app.ts'),'utf8')).toContain(':25175');
    expect(await readFile(resolve(copy,'studio/app.test.contract'),'utf8')).toContain(':25176/mode');
    expect(await readFile(resolve(copy,'studio/app.test.contract'),'utf8')).not.toContain(':5175');
    expect(await readFile(resolve(source,'studio/app.ts'),'utf8')).toContain(':5175');
    expect(await readFile(resolve(copy,'studio/new.ts'),'utf8')).toBe('untracked');
    expect(JSON.parse(await readFile(resolve(copy,'studio/app.json'),'utf8')).commands).toEqual({other:['bun','other.ts']});
    await expect(access(resolve(copy,'studio/.exact/build'))).rejects.toThrow();
    await expect(access(resolve(copy,'studio/deleted.ts'))).rejects.toThrow();
  } finally { await rm(temp,{recursive:true,force:true}); }
});

// A tiny SDK stand-in tests exit propagation and process ownership without compiling the studio.
for (const interrupt of [false, true]) test(`verification cleans up after ${interrupt ? 'SIGTERM' : 'a failing child'}`, async()=>{
  const source=await mkdtemp(resolve(tmpdir(), 'exact-verification-lifecycle-'));
  let child:ReturnType<typeof Bun.spawn>|undefined;
  try {
    for(const dir of ['studio','tools','.exact-sdk/scripts']) await mkdir(resolve(source,dir),{recursive:true});
    await writeFile(resolve(source,'studio/app.ts'), "export const API='http://127.0.0.1:5175';");
    await writeFile(resolve(source,'studio/app.test.contract'), 'http://127.0.0.1:5176');
    await writeFile(resolve(source,'studio/app.json'), '{}');
    await writeFile(resolve(source,'tools/discovery-server.ts'), "export const startDiscoveryServer=port=>Bun.serve({hostname:'127.0.0.1',port,fetch:()=>new Response('helper')});");
    await writeFile(resolve(source,'tools/discovery-fixture.ts'), "export const startDiscoveryFixture=port=>Bun.serve({hostname:'127.0.0.1',port,fetch:()=>new Response('fixture')});");
    await writeFile(resolve(source,'tools/element-bridge.ts'), 'export const stopElementBridges=()=>{};');
    await writeFile(resolve(source,'.exact-sdk/scripts/app-cli.mjs'), `
      import {mkdir,writeFile} from 'node:fs/promises';
      export async function run({dir}) {
        await mkdir(dir+'/.exact/verify',{recursive:true});
        await writeFile(dir+'/.exact/verify/web-findings.txt','retained finding');
        console.log('sdk output retained');
        ${interrupt ? `await writeFile(${JSON.stringify(resolve(source,'ready'))},'ready');await new Promise(()=>{});` : 'return 7;'}
      }
    `);
    await git(source,'init','-q'); await git(source,'add','.');
    await git(source,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture');
    const launcher=resolve(source,'runner.mjs');
    await writeFile(launcher,`import {runIsolated} from ${JSON.stringify(resolve(import.meta.dir,'verify-isolated.mjs'))};process.exitCode=await runIsolated(['test','web'],${JSON.stringify(source)});`);
    child=Bun.spawn([process.execPath,launcher],{stdout:'pipe',stderr:'pipe'});
    const stdout=new Response(child.stdout).text(),stderr=new Response(child.stderr).text();
    if(interrupt){
      const deadline=Date.now()+10000;
      while(!(await Bun.file(resolve(source,'ready')).exists())){
        if(child.exitCode!==null || Date.now()>deadline)throw Error('SDK stand-in did not start');
        await Bun.sleep(20);
      }
      child.kill('SIGTERM');
    }
    const code=await child.exited, output=await stdout, errors=await stderr;
    expect(errors).toBe(''); expect(code).toBe(interrupt?143:7);
    const artifact=output.match(/Verification artifacts: (.+)/)![1];
    const result=JSON.parse(await readFile(resolve(artifact,'result.json'),'utf8'));
    expect(result.status).toBe(interrupt?'interrupted':'failed');
    expect(await readFile(resolve(artifact,'output.log'),'utf8')).toContain('sdk output retained');
    expect(await readFile(resolve(artifact,'shots/web-findings.txt'),'utf8')).toBe('retained finding');
    await expect(access(resolve(artifact,'workspace'))).rejects.toThrow();
    for(const origin of [result.helper,result.fixture])await expect(fetch(origin)).rejects.toThrow();
  } finally {
    child?.kill(); if(child)await child.exited;
    await rm(source,{recursive:true,force:true});
  }
},15000);
