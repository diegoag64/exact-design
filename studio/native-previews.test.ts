import {test,expect,afterEach} from 'bun:test';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NativePreviews,nativeScreens,nativeShot} from '../tools/native-previews';
import {Simulators,selectRuntime,type Runner} from '../tools/simulators';
import {readRoutes} from '../tools/discovery-server';
const type='com.apple.CoreSimulator.SimDeviceType.iPhone-17';
const runtimes=[{identifier:'com.apple.CoreSimulator.SimRuntime.iOS-27-1',version:'27.1',isAvailable:true,supportedDeviceTypes:[{identifier:'Duo'}]},{identifier:'com.apple.CoreSimulator.SimRuntime.iOS-27-0',version:'27.0',isAvailable:true,supportedDeviceTypes:[{identifier:type}]}];
const frames=[{id:'one',device:'native-iphone-17',route:'/'},{id:'two',device:'native-iphone-17',route:'/diary/add'}];
const temps:string[]=[];afterEach(async()=>{for(const p of temps.splice(0))await rm(p,{recursive:true,force:true});});
async function fixture(options:{noXcode?:boolean;low?:boolean;buildFail?:boolean;quit?:boolean;handler?:boolean;rewrite?:boolean}={}){
  const dir=await mkdtemp(join(tmpdir(),'native-test-'));temps.push(dir);const appDir=join(dir,'app'),bundle=join(dir,'Ember.app');await mkdir(appDir);await mkdir(bundle);
  const config={name:'Ember',app:{id:'dev.test.ember'},protocol_handlers:options.handler===false?[]:[{protocol:'web+ember',url:'/open?u=%s'}]};await writeFile(join(appDir,'app.json'),JSON.stringify(config));await writeFile(join(appDir,'app.contract'),'first');
  const calls:{args:string[];env?:Record<string,string>}[]=[];
  const runner:Runner=async(args,env)=>{calls.push({args,env});const s=args.join(' ');
    if(s.includes('--find')&&options.noXcode)throw new Error('Xcode missing');
    if(s.includes('native-build.mjs')){if(options.buildFail)throw new Error('noise\nerror: compilation failed\nnoise');if(options.rewrite)await writeFile(join(appDir,'app.json'),JSON.stringify({...config,host:{ios:{}}}));return `host/apple: ${bundle} (cargo foo); built and signed`;}
    if(s.includes('list runtimes'))return JSON.stringify({runtimes});
    if(s.includes('list devices'))return JSON.stringify({devices:{[runtimes[1].identifier]:[{name:'Doom Exact iPhone',deviceTypeIdentifier:type,isAvailable:true,udid:'foreign'},{name:'Exact Design iPhone 17',deviceTypeIdentifier:type,isAvailable:true,udid:'owned'}]}});
    if(s.includes('screenshot')){const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(1206,16);png.writeUInt32BE(2622,20);await writeFile(args.at(-1)!,png);}
    if(s.includes('launchctl'))return options.quit?'':'UIKitApplication:dev.test.ember';return 'ok';
  };
  const service=new NativePreviews({run:runner,target:new Simulators(runner,'darwin'),cache:join(dir,'cache'),apps:[appDir],settle:0,firstSettle:0,free:async()=>options.low?5*1024**3:100*1024**3,fetch:(async()=>Response.json(config)) as typeof fetch});
  return {service,app:await service.app(appDir),appDir,calls,runner};
}
test('runtime selection respects supported device types before version',()=>{expect(selectRuntime(runtimes,type)?.version).toBe('27.0');expect(selectRuntime(runtimes,'Duo')?.version).toBe('27.1');expect(selectRuntime(runtimes,'missing')).toBeUndefined();});
test('reuse exact managed device and never boot or stop foreign devices',async()=>{const f=await fixture();const sim=new Simulators(f.runner,'darwin');const id=await sim.destination('iPhone 17',type);expect(id).toBe('owned');await sim.boot(id);await sim.stop();expect(f.calls.some(c=>c.args.includes('create'))).toBe(false);expect(f.calls.some(c=>c.args.includes('foreign'))).toBe(false);await expect(sim.boot('foreign')).rejects.toThrow('unmanaged');});
test('cache, post-build signature, staleness, repeat tokens and launch environment',async()=>{const f=await fixture({rewrite:true});await f.app.start('a',frames);expect(f.app.snapshot(frames).frames.map(f=>f.state)).toEqual(['ready','ready']);expect(f.calls.filter(c=>c.args.includes('launch')).map(c=>c.env?.SIMCTL_CHILD_EXACT_LAUNCH_URL)).toEqual(['web+ember://','web+ember://diary/add']);expect(f.calls.some(c=>c.args.includes('openurl'))).toBe(false);
  await f.app.start('a',frames);await f.app.start('b',frames);expect(f.calls.filter(c=>c.args.some(a=>a.endsWith('native-build.mjs')))).toHaveLength(1);await writeFile(join(f.appDir,'app.contract'),'changed');await f.app.refresh();expect(f.app.snapshot(frames).frames[0].state).toBe('stale');await f.app.start('c',frames);expect(f.calls.filter(c=>c.args.some(a=>a.endsWith('native-build.mjs')))).toHaveLength(2);
});
for(const [name,options,expected,state]of [ ['no Xcode',{noXcode:true},'need Xcode with the iOS Simulator','unavailable'],['low disk',{low:true},'5.0 GB free','error'],['build failure',{buildFail:true},'Full log:','error'],['missing protocol handler',{handler:false},'protocol_handlers','error']] as const)test(name,async()=>{const f=await fixture(options);await f.app.start('a',frames);expect(f.app.state).toBe(state);expect(f.app.error).toContain(expected);});
test('app exit marks capture error',async()=>{const f=await fixture({quit:true});await f.app.start('a',frames);expect(f.app.snapshot(frames).frames[1].error).toBe('Ember quit while opening /diary/add');});
test('project registry resolves exact match and rejects unknown and remote projects',async()=>{const f=await fixture();expect(await f.service.project('http://localhost:1234')).toBe(f.app);await expect(f.service.project('https://example.com')).rejects.toThrow('local');const unknown=new NativePreviews({apps:[],fetch:(async()=>Response.json({name:'Other'})) as typeof fetch});await expect(unknown.project('http://localhost:1234')).rejects.toThrow('EXACT_DESIGN_NATIVE_APPS');});
test('shot paths reject traversal and missing files',()=>{for(const p of ['../state.json','a'.repeat(16)+'/../x.png','a'.repeat(16)+'/x.png','%2e%2e/foo'])expect(nativeShot(p).status).toBe(404);});
test('invalid requests return an error SSE snapshot without throwing',async()=>{const abort=new AbortController(),response=nativeScreens(null,new Request('http://127.0.0.1:5999/native',{signal:abort.signal}));expect(response.headers.get('content-type')).toBe('text/event-stream');const reader=response.body!.getReader(),{value}=await reader.read();const snapshot=JSON.parse(new TextDecoder().decode(value).slice(6));expect(snapshot).toEqual({state:'error',phase:'',message:'Invalid native preview request.',error:'Invalid native preview request.',done:0,total:0,frames:[]});abort.abort();});
test('discovery excludes protocol landing route only',async()=>{const result=await readRoutes('http://localhost:1234',(async(url:any)=>Response.json(String(url).endsWith('manifest.json')?{protocol_handlers:[{protocol:'web+ember',url:'/open?u=%s'}]}:{routes:[{name:'Open',pattern:'/open'},{name:'Today',pattern:'/'},{name:'Add',pattern:'/diary/add'}]})) as typeof fetch);expect(result.map(r=>r.route)).toEqual(['/','/diary/add']);});
const e2e=process.env.EXACT_DESIGN_NATIVE_E2E==='1'&&process.platform==='darwin'&&Bun.spawnSync(['xcrun','--find','simctl']).exitCode===0;
test.skipIf(!e2e)('real Ember iPhone 17 captures',async()=>{
  const started=Date.now();const run:Runner=async(args,env)=>{const t=Date.now();const {command}=await import('../tools/simulators');try{return await command(args,env);}finally{console.log(`NATIVE TIMING ${args.join(' ')}: ${Date.now()-t} ms`);}};
  const service=new NativePreviews({run});try{const app=await service.app(join(import.meta.dir,'../examples/ember'));await app.start(`e2e-${Date.now()}`,frames);const snapshot=app.snapshot(frames);console.log('NATIVE E2E',JSON.stringify(snapshot),`total ${Date.now()-started} ms`,app.dir);expect(snapshot.state).toBe('idle');for(const frame of snapshot.frames){expect(frame.state).toBe('ready');expect([frame.width,frame.height]).toEqual([1206,2622]);const file=frame.shot.split('/').at(-1)!.split('?')[0];expect((await readFile(join(app.dir,'shots',file))).subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');}}finally{await service.stop();}
},600000);
test('missing runtime is unavailable and unsupported device errors only its frames',async()=>{
  const f=await fixture();const noRuntime:Runner=(args,env)=>args.join(' ').includes('list runtimes')?Promise.resolve('{"runtimes":[]}'):f.runner(args,env);
  const service=new NativePreviews({target:new Simulators(noRuntime,'darwin'),run:noRuntime,cache:join(f.appDir,'.cache')});const app=await service.app(f.appDir);await app.start('none',frames);expect(app.state).toBe('unavailable');expect(app.error).toContain('No installed iOS Simulator runtime');
  await f.app.start('unsupported',[{id:'ipad',device:'native-ipad-pro-11',route:'/'}]);expect(f.app.snapshot([{id:'ipad',device:'native-ipad-pro-11',route:'/'}]).frames[0].error).toContain('No installed iOS Simulator runtime supports');
});
test('new tokens queue behind the active job and cached installs survive service restart',async()=>{
  const f=await fixture();await Promise.all([f.app.start('one',frames),f.app.start('two',frames),f.app.start('two',frames)]);expect(f.calls.filter(c=>c.args.includes('launch'))).toHaveLength(4);expect(f.calls.filter(c=>c.args.includes('install'))).toHaveLength(1);
  const next=new NativePreviews({...f.service.options});const app=await next.app(f.appDir);await app.start('three',frames);expect(f.calls.filter(c=>c.args.some(a=>a.endsWith('native-build.mjs')))).toHaveLength(1);expect(f.calls.filter(c=>c.args.includes('install'))).toHaveLength(1);
});
test('device creation ignores names with wrong type or runtime',async()=>{
  const calls:string[][]=[];const run:Runner=async args=>{calls.push(args);if(args.includes('runtimes'))return JSON.stringify({runtimes});if(args.includes('devices'))return JSON.stringify({devices:{[runtimes[0].identifier]:[{name:'Exact Design iPhone 17',deviceTypeIdentifier:type,isAvailable:true,udid:'wrong-runtime'}],[runtimes[1].identifier]:[{name:'Exact Design iPhone 17',deviceTypeIdentifier:'Duo',isAvailable:true,udid:'wrong-type'}]}});return 'new-owned';};
  expect(await new Simulators(run,'darwin').destination('iPhone 17',type)).toBe('new-owned');expect(calls.at(-1)).toEqual(['xcrun','simctl','create','Exact Design iPhone 17',type,runtimes[1].identifier]);
});
