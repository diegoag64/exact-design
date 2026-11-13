import {test,expect,afterEach} from 'bun:test';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NativePreviews,BuildProgress,nativeScreens,nativeShot,nativeRequest,frameKey,type NativeOptions} from '../tools/native-previews';
import {Simulators,selectRuntime,availableMemory,deviceParallelism,BOOT_MEMORY,type Runner} from '../tools/simulators';
import {NativeReadiness,parseBmp,pixelChange,identity,type Readiness,type Outcome,type Mark,type TouchSession} from '../tools/native-readiness';
import {readRoutes} from '../tools/discovery-server';
const type='com.apple.CoreSimulator.SimDeviceType.iPhone-17';
const runtimes=[{identifier:'com.apple.CoreSimulator.SimRuntime.iOS-27-1',version:'27.1',isAvailable:true,supportedDeviceTypes:[{identifier:'Duo'}]},{identifier:'com.apple.CoreSimulator.SimRuntime.iOS-27-0',version:'27.0',isAvailable:true,supportedDeviceTypes:[{identifier:type}]}];
const frames=[{id:'one',device:'native-iphone-17',route:'/'},{id:'two',device:'native-iphone-17',route:'/diary/add'}];
const temps:string[]=[];afterEach(async()=>{for(const p of temps.splice(0))await rm(p,{recursive:true,force:true});});
type Call={args:string[];env?:Record<string,string>};
/** Where `xcrun --find simctl` says simctl is: every simctl call runs it directly. */
const SIMCTL='/Applications/Xcode.app/Contents/Developer/usr/bin/simctl';
/** Readiness that answers from the last link opened since the mark; it logs `ready mark` and `ready wait` into the calls.
 *  `via` is what decided each wait: `ax` also confirmed the app in front. */
function fakeReadiness(calls:Call[],outcome:(url:string|undefined)=>Outcome=()=>'ready',via:'ax'|'pixel'='ax'):Readiness{
  return {prepare:()=>{calls.push({args:['ready','prepare']});},forget:()=>{},mark:async(udid,appId)=>{calls.push({args:['ready','mark']});return {udid,appId,at:calls.length,baseline:null,mode:via};},
    wait:async(mark:Mark,deadline?:number)=>{const url=calls.slice(mark.at).findLast(c=>c.args.includes('openurl'))?.args.at(-1);calls.push({args:['ready','wait',url??'',String(deadline??'')]});mark.via=via;return outcome(url);},close:async()=>{calls.push({args:['ready','close']});}};
}
async function fixture(options:{noXcode?:boolean;low?:boolean;buildFail?:boolean;quit?:boolean;handler?:boolean;rewrite?:boolean;outcome?:(url:string|undefined)=>Outcome;via?:'ax'|'pixel';service?:Partial<NativeOptions>}={}){
  const dir=await mkdtemp(join(tmpdir(),'native-test-'));temps.push(dir);const appDir=join(dir,'app'),bundle=join(dir,'Ember.app');await mkdir(appDir);await mkdir(bundle);
  const config={name:'Ember',app:{id:'dev.test.ember'},protocol_handlers:options.handler===false?[]:[{protocol:'web+ember',url:'/open?u=%s'}]};await writeFile(join(appDir,'app.json'),JSON.stringify(config));await writeFile(join(appDir,'app.contract'),'first');
  const calls:Call[]=[];const booted=new Set<string>();const sim={running:false,appearance:'light',reduceMotion:undefined as string|undefined};
  const runner:Runner=async(args,env,onOutput)=>{calls.push({args,env});const s=args.join(' '),sub=args[0]===SIMCTL?args.slice(1):[];
    if(s==='xcrun --find simctl'){if(options.noXcode)throw new Error('Xcode missing');return `${SIMCTL}\n`;}
    if(args[0]==='xcrun')throw new Error('simctl must run directly');
    if(sub[0]==='boot'){if(booted.has(sub[1]))throw new Error('Unable to boot device in current state: Booted');booted.add(sub[1]);}
    if(s.includes('native-build.mjs')){for(const chunk of ['   Compiling exact-core v0.1.0\n','host/apple: baked L=0; Swift embedded composition\n','[2 / 21] ExactCore\n[26 / 30] ExactIOS-product\nBuild complete! (6.43 sec)\n'])onOutput?.(chunk);if(options.buildFail)throw new Error('noise\nerror: compilation failed\nnoise');if(options.rewrite)await writeFile(join(appDir,'app.json'),JSON.stringify({...config,host:{ios:{}}}));return `host/apple: ${bundle} (cargo foo); built and signed`;}
    if(s.includes('list runtimes'))return JSON.stringify({runtimes});
    if(s.includes('list devices'))return JSON.stringify({devices:{[runtimes[1].identifier]:[{name:'Doom Exact iPhone',deviceTypeIdentifier:type,isAvailable:true,udid:'foreign',state:'Booted'},{name:'Exact Design iPhone 17',deviceTypeIdentifier:type,isAvailable:true,udid:'owned',state:booted.has('owned')?'Booted':'Shutdown'}]}});
    if(s.includes('screenshot')){const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(1206,16);png.writeUInt32BE(2622,20);await writeFile(args.at(-1)!,png);}
    if(s.includes('defaults read com.apple.Accessibility ReduceMotionEnabled')){if(sim.reduceMotion===undefined)throw new Error('does not exist');return sim.reduceMotion+'\n';}
    if(s.includes('defaults write com.apple.Accessibility ReduceMotionEnabled'))sim.reduceMotion=args.at(-1)==='true'?'1':'0';
    if(sub[0]==='ui'){if(sub.length===4)sim.appearance=sub[3];return sim.appearance+'\n';}
    if(sub[0]==='launch'){sim.running=true;return 'dev.test.ember: 123';}
    if(sub[0]==='terminate')sim.running=false;
    if(sub[0]==='install')sim.running=false;
    if(s.includes('launchctl'))return sim.running&&!options.quit?'123\t0\tUIKitApplication:dev.test.ember[1a2b][rb-legacy]\n':'';
    return 'ok';
  };
  // The service's clock: real time moved by `clock.offset`, so a test can step past the cold window.
  const clock={offset:0};
  const serviceOptions:NativeOptions={now:()=>Date.now()+clock.offset,memory:async()=>undefined,run:runner,target:new Simulators(runner,'darwin'),cache:join(dir,'cache'),apps:[appDir],readiness:fakeReadiness(calls,options.outcome,options.via),reduceMotion:true,free:async()=>options.low?5*1024**3:100*1024**3,fetch:(async()=>Response.json(config)) as typeof fetch,...options.service};
  const service=new NativePreviews(serviceOptions);
  return {service,app:await service.app(appDir),appDir,calls,runner,sim,booted,clock,serviceOptions};
}
/** A call's name: the simctl subcommand, a readiness step, or the program. */
const op=(c:Call)=>c.args[0]==='ready'?c.args[1]:c.args[0]===SIMCTL?c.args[1]:c.args[0];
const named=(calls:Call[],name:string)=>calls.filter(c=>c.args[0]===SIMCTL&&c.args[1]===name);
const opened=(calls:Call[])=>named(calls,'openurl').map(c=>c.args.at(-1));
const builds=(calls:Call[])=>calls.filter(c=>c.args.some(a=>a.endsWith('native-build.mjs')));
const shots=(calls:Call[])=>calls.filter(c=>c.args.includes('--type=png'));

test('runtime selection respects supported device types before version',()=>{expect(selectRuntime(runtimes,type)?.version).toBe('27.0');expect(selectRuntime(runtimes,'Duo')?.version).toBe('27.1');expect(selectRuntime(runtimes,'missing')).toBeUndefined();});
test('reuse exact managed device and never boot, change or stop foreign devices',async()=>{
  const f=await fixture();const sim=new Simulators(f.runner,'darwin');const id=await sim.destination('iPhone 17',type);expect(id).toBe('owned');await sim.boot(id);await sim.stop();
  expect(f.calls.some(c=>c.args.includes('create'))).toBe(false);expect(f.calls.some(c=>c.args.includes('foreign'))).toBe(false);
  for(const act of [()=>sim.boot('foreign'),()=>sim.open('foreign','web+ember://'),()=>sim.launch('foreign','dev.test.ember'),()=>sim.approve('foreign','web+ember','dev.test.ember'),()=>sim.reduceMotion('foreign',true),()=>sim.setAppearance('foreign','dark'),()=>sim.install('foreign','/x.app'),()=>sim.screenshot('foreign','/tmp/x.png')])await expect(act()).rejects.toThrow('unmanaged');
  expect(f.calls.some(c=>c.args.includes('foreign'))).toBe(false);
});
test('stop shuts down only simulators this helper booted',async()=>{const f=await fixture();const sim=new Simulators(f.runner,'darwin');await sim.destination('iPhone 17',type);await sim.boot('owned');await sim.boot('owned');await sim.stop();expect(named(f.calls,'shutdown').map(c=>c.args[2])).toEqual(['owned']);
  const again=new Simulators(f.runner,'darwin');await again.destination('iPhone 17',type);expect(await again.boot('owned')).toBe(false);await again.stop();expect(named(f.calls,'shutdown')).toHaveLength(1);});
test('scheme approval writes the launch services key and rejects bad schemes and bundle ids',async()=>{
  const f=await fixture();const sim=new Simulators(f.runner,'darwin');await sim.destination('iPhone 17',type);await sim.approve('owned','web+ember','dev.test.ember');
  expect(f.calls.at(-1)!.args).toEqual([SIMCTL,'spawn','owned','defaults','write','com.apple.launchservices.schemeapproval','com.apple.CoreSimulator.CoreSimulatorBridge-->web+ember','-string','dev.test.ember']);
  const count=f.calls.length;
  for(const scheme of ['','1ember','web ember','web+ember;rm','a/b','x"y'])await expect(sim.approve('owned',scheme,'dev.test.ember')).rejects.toThrow('not a URL scheme');
  for(const id of ['','ember','dev..ember','dev.ember;rm','dev.ember ','-x','.dev.ember','dev/ember'])await expect(sim.approve('owned','web+ember',id)).rejects.toThrow('not a bundle identifier');
  expect(f.calls.length).toBe(count);
});
test('warm loop launches once, opens links with a root reset between screens and never relaunches per screen',async()=>{
  const f=await fixture();const three=[...frames,{id:'three',device:'native-iphone-17',route:'/activity'}];
  await f.app.start('a',three);expect(f.app.snapshot(three).frames.map(f=>f.state)).toEqual(['ready','ready','ready']);expect(f.app.message).toBe('Native previews updated.');
  expect(f.calls.some(c=>c.args.includes('--terminate-running-process'))).toBe(false);expect(f.calls.some(c=>c.env&&Object.keys(c.env).some(k=>k.startsWith('SIMCTL_CHILD_')))).toBe(false);
  expect(named(f.calls,'launch').map(c=>c.args)).toEqual([[SIMCTL,'launch','owned','dev.test.ember']]);expect(named(f.calls,'terminate')).toHaveLength(0);
  // After the launch the app is at its root: `/` needs no link and the next screen no reset; later screens reset first.
  expect(opened(f.calls)).toEqual(['web+ember://diary/add','web+ember://','web+ember://activity']);
  expect(named(f.calls,'spawn').some(c=>c.args.includes('com.apple.launchservices.schemeapproval'))).toBe(true);
  expect(f.calls.find(c=>c.args.includes('ReduceMotionEnabled')&&c.args.includes('write'))!.args.slice(-2)).toEqual(['-bool','true']);
  // Every link and the launch wait for readiness, marked before the command.
  const order=f.calls.map(op).filter(a=>['mark','wait','launch','openurl','io'].includes(a));
  expect(order).toEqual(['mark','launch','wait','io','mark','openurl','wait','io','mark','openurl','wait','mark','openurl','wait','io']);
  // Forced again with the app running: no launch, and `/` is captured by its reset link alone.
  await f.app.start('b',three,['one','two']);expect(named(f.calls,'launch')).toHaveLength(1);expect(opened(f.calls).slice(3)).toEqual(['web+ember://','web+ember://diary/add']);expect(builds(f.calls)).toHaveLength(1);
});
test('install and a Reduce Motion change relaunch the app; otherwise it keeps running',async()=>{
  const f=await fixture();await f.app.start('a',frames);expect(named(f.calls,'install')).toHaveLength(1);
  f.sim.running=true;await writeFile(join(f.appDir,'app.contract'),'changed');await f.app.start('b',frames);
  expect(builds(f.calls)).toHaveLength(2);expect(named(f.calls,'install')).toHaveLength(2);expect(named(f.calls,'launch')).toHaveLength(2);
  // Unchanged settings and install: the running app is reused.
  await f.app.start('c',frames,['one']);expect(named(f.calls,'launch')).toHaveLength(2);expect(named(f.calls,'terminate')).toHaveLength(0);
  const off=new NativePreviews({...f.serviceOptions,reduceMotion:false});for(const [key,value] of f.service.installed)off.installed.set(key,value);const app=await off.app(f.appDir);await app.start('d',frames,['one']);
  expect(f.calls.filter(c=>c.args.includes('ReduceMotionEnabled')&&c.args.includes('write')).at(-1)!.args.at(-1)).toBe('false');
  expect(named(f.calls,'terminate')).toHaveLength(1);expect(named(f.calls,'launch')).toHaveLength(3);expect(named(f.calls,'install')).toHaveLength(2);
});
test('a booted device is prepared once per helper process; one shut down since is prepared again',async()=>{
  const f=await fixture();await f.app.start('a',frames);const first=f.calls.map(op);
  for(const name of ['boot','bootstatus','status_bar','install','launch'])expect(first.filter(n=>n===name)).toHaveLength(1);
  expect(f.calls.filter(c=>c.args.includes('com.apple.launchservices.schemeapproval'))).toHaveLength(1);expect(f.calls.filter(c=>c.args.includes('ReduceMotionEnabled'))).toHaveLength(2);// read, then write
  const before=f.calls.length;await f.app.start('b',frames,['one','two']);const second=f.calls.slice(before);
  // Only the job's device listing, the links, the readiness waits and the screenshots.
  expect([...new Set(second.map(op))].sort()).toEqual(['io','list','mark','openurl','prepare','wait']);expect(second.filter(c=>op(c)==='list').map(c=>c.args.slice(1))).toEqual([['list','devices','-j']]);
  expect(f.app.snapshot(frames).frames.map(f=>f.state)).toEqual(['ready','ready']);
  // Shut down behind the helper's back: boot, status bar, approval, Reduce Motion, appearance and launch again.
  f.booted.delete('owned');f.sim.running=false;const third=f.calls.length;await f.app.start('c',frames,['one']);const again=f.calls.slice(third);
  for(const name of ['boot','bootstatus','status_bar','launch'])expect(again.filter(c=>op(c)===name)).toHaveLength(1);expect(again.filter(c=>op(c)==='install')).toHaveLength(0);
  expect(again.some(c=>c.args.includes('com.apple.launchservices.schemeapproval'))).toBe(true);expect(again.some(c=>c.args.includes('ReduceMotionEnabled'))).toBe(true);expect(again.some(c=>op(c)==='ui'&&c.args.length===4)).toBe(true);
  expect(f.app.snapshot(frames).frames[0].state).toBe('ready');
});
test('a device that boots or launches in a job stays on pixels until the job ends; a warm one opens its runner at once',async()=>{
  const f=await fixture({via:'pixel'});await f.app.start('a',frames);const cold=f.calls.map(op);
  // Nothing opens a runner during the cold job: one prepare, after its last screenshot.
  expect(cold.filter(n=>n==='prepare')).toHaveLength(1);expect(cold.indexOf('prepare')).toBeGreaterThan(cold.lastIndexOf('io'));expect(f.app.snapshot(frames).frames.map(f=>f.state)).toEqual(['ready','ready']);
  // Known running from the last job: before the first link, and again at the job's end.
  const before=f.calls.length;await f.app.start('b',frames,['one']);const warm=f.calls.slice(before).map(op).filter(n=>['prepare','mark','launch','io'].includes(n));expect(warm.slice(0,2)).toEqual(['prepare','mark']);expect(warm.at(-1)).toBe('prepare');
  // A new helper cannot trust the installed bundle: reinstall and prepare after the capture.
  const next=new NativePreviews({...f.serviceOptions});const app=await next.app(f.appDir);const third=f.calls.length;await app.start('c',frames,['one']);
  const found=f.calls.slice(third),at=found.findIndex(c=>op(c)==='prepare');expect(at).toBeGreaterThan(found.findIndex(c=>op(c)==='io'));expect(found.some(c=>op(c)==='install')).toBe(true);expect(found.some(c=>op(c)==='launch')).toBe(true);
  // A relaunch (here after an install) makes the job cold again.
  await writeFile(join(f.appDir,'app.contract'),'changed');const fourth=f.calls.length;await f.app.start('d',frames,['one']);const relaunched=f.calls.slice(fourth).map(op);
  expect(relaunched).toContain('launch');expect(relaunched.indexOf('prepare')).toBeGreaterThan(relaunched.lastIndexOf('io'));
  // A job whose frames fail still opens runners at its end.
  const failing=await fixture({outcome:url=>url==='web+ember://diary/add'?'timeout':'ready'});await failing.app.start('a',frames);expect(failing.app.snapshot(frames).frames[1].state).toBe('error');expect(failing.calls.map(op).at(-1)).toBe('prepare');
});
test('runners have no memory gate by default; with one set, a device short of memory stays on pixels for that job',async()=>{
  expect(new NativePreviews({}).axMemory).toBe(0);
  const open=await fixture({service:{memory:async()=>0}});await open.app.start('a',frames);expect(open.calls.filter(c=>op(c)==='prepare')).toHaveLength(1);
  let memory=1024**3;const notes:string[]=[];const f=await fixture({service:{axMemory:1.5*1024**3,memory:async()=>memory,notice:(udid,reason)=>notes.push(`${udid}: ${reason}`)}});
  const prepares=()=>f.calls.filter(c=>op(c)==='prepare').length;
  await f.app.start('a',frames);expect(prepares()).toBe(0);expect(notes).toEqual(['owned: only 1.0 GB of memory is available and the accessibility runner needs 1.5 GB']);
  // Warm: tried at once, then not again in that job (nor at its end: one notice per device per job).
  await f.app.start('b',frames,['one','two']);expect(prepares()).toBe(0);expect(notes).toHaveLength(2);
  memory=2*1024**3;await f.app.start('c',frames,['one']);expect(prepares()).toBeGreaterThan(0);expect(notes).toHaveLength(2);
  const strict=await fixture({service:{memory:async()=>6*1024**3,axMemory:8*1024**3,notice:()=>{}}});await strict.app.start('a',frames);expect(strict.calls.some(c=>op(c)==='prepare')).toBe(false);
  expect(f.app.snapshot(frames).frames.map(f=>f.state)).toEqual(['ready','ready']);
});
test('EXACT_DESIGN_NATIVE_READINESS=pixel never opens a touch runner',()=>{
  const saved=process.env.EXACT_DESIGN_NATIVE_READINESS;
  try{
    delete process.env.EXACT_DESIGN_NATIVE_READINESS;const ax=new NativePreviews({}).readiness as NativeReadiness;expect(ax.usesPixels('u')).toBe(false);expect(ax.needsOpen('u','app')).toBe(true);
    process.env.EXACT_DESIGN_NATIVE_READINESS='pixel';const pixel=new NativePreviews({}).readiness as NativeReadiness;expect(pixel.usesPixels('u')).toBe(true);expect(pixel.needsOpen('u','app')).toBe(false);
    pixel.prepare('u','app');expect(pixel.axReady('u')).toBe(false);
  }finally{if(saved===undefined)delete process.env.EXACT_DESIGN_NATIVE_READINESS;else process.env.EXACT_DESIGN_NATIVE_READINESS=saved;}
});
test('at a job end each runner needs its own share of memory',async()=>{
  const prepared:string[]=[],notes:string[]=[];const readiness:Readiness={prepare:(udid)=>{prepared.push(udid);},needsOpen:(udid)=>udid!=='open',mark:async()=>{throw new Error('unused');},wait:async()=>'ready',close:async()=>{}};
  const service=new NativePreviews({readiness,axMemory:1.5*1024**3,memory:async()=>3.2*1024**3,notice:(udid,reason)=>notes.push(`${udid}: ${reason}`)});
  for(const id of ['a','b','open','c','gone'])if(id!=='gone')service.records.set(id,{});
  expect(await service.openRunners(['a','b','open','c','gone'],'app')).toBe(false);expect(prepared).toEqual(['a','b']);expect(notes).toEqual(['c: only 0.2 GB of memory is available and the accessibility runner needs 1.5 GB']);
});
test('a cold boot waits for memory while another device is still starting, up to 90 s, then boots anyway',async()=>{
  const f=await fixture();let t=0,memory=1024**3;const slept:number[]=[];let release=Infinity;
  const service=new NativePreviews({...f.serviceOptions,now:()=>t,memory:async()=>memory,sleep:async ms=>{t+=ms;slept.push(ms);if(slept.length>=release)service.starting.delete('other');}});
  // Another device finishes starting after two polls.
  release=2;service.starting.add('other');await service.bootGate('me');expect(slept).toEqual([3000,3000]);expect([...service.starting]).toEqual(['me']);
  // One that never finishes: boot anyway after 90 s.
  service.starting.clear();release=Infinity;slept.length=0;t=0;service.starting.add('other');await service.bootGate('me');expect(t).toBe(90000);expect(slept).toHaveLength(30);expect(service.starting.has('me')).toBe(true);
  // Enough memory, or nothing else starting: no wait.
  service.starting.clear();slept.length=0;service.starting.add('other');memory=4*1024**3;await service.bootGate('a');memory=1024**3;service.starting.clear();await service.bootGate('b');expect(slept).toHaveLength(0);
  // A job leaves nothing marked as starting.
  await f.app.start('a',frames);expect(f.service.starting.size).toBe(0);
});
test('waits soon after a boot or launch get twice the deadline, pixel waits one and a half times, the launch two and a half',async()=>{
  const deadlines=(calls:Call[])=>calls.filter(c=>c.args[0]==='ready'&&c.args[1]==='wait').map(c=>Number(c.args[3]));
  const ax=await fixture();await ax.app.start('a',frames);expect(deadlines(ax.calls)).toEqual([20000,16000]);// launch, then /diary/add (/ needed no link)
  ax.clock.offset=61000;await ax.app.start('b',frames,['one','two']);expect(deadlines(ax.calls).slice(2)).toEqual([8000,8000]);
  const pixel=await fixture({via:'pixel'});await pixel.app.start('a',frames);expect(deadlines(pixel.calls)).toEqual([20000,24000,24000]);
  pixel.clock.offset=61000;await pixel.app.start('b',frames,['two']);expect(deadlines(pixel.calls).slice(3)).toEqual([12000,12000]);
  // The frame error names the deadline its last attempt had.
  const slow=await fixture({outcome:url=>url==='web+ember://diary/add'?'timeout':'ready'});await slow.app.start('a',frames);expect(slow.app.snapshot(frames).frames[1].error).toBe('Ember did not settle on /diary/add within 16 s.');
});
test('simctl runs directly: xcrun only finds it, once per process, and runtimes are read once',async()=>{
  const f=await fixture();await f.app.start('a',frames);await f.app.start('b',frames,['one']);await f.app.start('c',frames);
  expect(f.calls.filter(c=>c.args[0]==='xcrun').map(c=>c.args)).toEqual([['xcrun','--find','simctl']]);
  expect(f.calls.filter(c=>c.args[0]===SIMCTL&&c.args[1]==='list'&&c.args[2]==='runtimes')).toHaveLength(1);
  expect(f.calls.filter(c=>c.args[0]===SIMCTL&&c.args[1]==='list'&&c.args[2]==='devices')).toHaveLength(2);// one per job that captures
  expect(f.calls.filter(c=>c.args[0]==='xcodebuild')).toHaveLength(1);
});
test('the running check after a screenshot is skipped when the tree confirmed the app, and kept on pixels',async()=>{
  for(const [via,checks] of [['ax',0],['pixel',2]] as const){
    const f=await fixture({via});await f.app.start('a',frames);const before=f.calls.length;await f.app.start('b',frames,['one','two']);
    expect(f.calls.slice(before).filter(c=>c.args.includes('launchctl'))).toHaveLength(checks);expect(f.app.snapshot(frames).frames.map(f=>f.state)).toEqual(['ready','ready']);
  }
});
test('refresh all skips current frames, a source change captures again, and capture ids force frames',async()=>{
  const f=await fixture();await f.app.start('a',frames);expect(shots(f.calls)).toHaveLength(2);
  await f.app.start('a',frames);await f.app.start('b',frames);
  expect(shots(f.calls)).toHaveLength(2);expect(f.app.snapshot(frames)).toMatchObject({state:'idle',message:'Native previews are up to date.',done:0,total:0});expect(f.app.snapshot(frames).frames.map(f=>f.state)).toEqual(['ready','ready']);
  expect(f.calls.some(c=>op(c)==='boot'&&f.calls.indexOf(c)>f.calls.indexOf(shots(f.calls)[1]))).toBe(false);
  await writeFile(join(f.appDir,'app.contract'),'changed');await f.app.refresh();expect(f.app.snapshot(frames).frames[0].state).toBe('stale');
  await f.app.start('c',frames);expect(builds(f.calls)).toHaveLength(2);expect(shots(f.calls)).toHaveLength(4);expect(f.app.snapshot(frames)).toMatchObject({done:2,total:2});
  await f.app.start('d',frames,['two']);expect(shots(f.calls)).toHaveLength(5);expect(f.app.snapshot(frames)).toMatchObject({done:1,total:1,message:'Native previews updated.'});expect(opened(f.calls).at(-1)).toBe('web+ember://diary/add');
  // A new frame on a current build captures only that frame.
  const more=[...frames,{id:'three',device:'native-iphone-17',route:'/activity'}];await f.app.start('e',more);expect(shots(f.calls)).toHaveLength(6);expect(f.app.total).toBe(1);
});
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
test('source changes during a build stay stale even when the status poll observes them',async()=>{
  const f=await fixture();let first=true;let app:Awaited<ReturnType<NativePreviews['app']>>;
  const run:Runner=async(args,env)=>{
    const result=await f.runner(args,env);
    if(first&&args.some(a=>a.endsWith('native-build.mjs'))){first=false;await writeFile(join(f.appDir,'app.contract'),'edited during build');await app.refresh();}
    return result;
  };
  const service=new NativePreviews({...f.serviceOptions,run});app=await service.app(f.appDir);
  await app.start('old',frames);expect(app.snapshot(frames).frames.map(f=>f.state)).toEqual(['stale','stale']);
  await app.start('new',frames);expect(builds(f.calls)).toHaveLength(2);expect(app.snapshot(frames).frames.map(f=>f.state)).toEqual(['ready','ready']);
});
test('SDK app manifest rewrites conservatively require one extra build',async()=>{
  const f=await fixture({rewrite:true});await f.app.start('first',frames);expect(f.app.snapshot(frames).frames[0].state).toBe('stale');
  await f.app.start('second',frames);expect(builds(f.calls)).toHaveLength(2);expect(f.app.snapshot(frames).frames[0].state).toBe('ready');
  await f.app.start('third',frames);expect(builds(f.calls)).toHaveLength(2);
});
test('failed Xcode versions from a status poll recover without restarting the helper',async()=>{
  const f=await fixture();let missing=true;
  const run:Runner=async(args,env)=>{if(args[0]==='xcodebuild'&&missing)throw new Error('Xcode not selected');return f.runner(args,env);};
  const service=new NativePreviews({...f.serviceOptions,run,target:new Simulators(run,'darwin')});const app=await service.app(f.appDir);
  await expect(app.refresh()).rejects.toThrow('Xcode not selected');missing=false;
  await app.start('retry',frames);expect(app.snapshot(frames).frames.map(f=>f.state)).toEqual(['ready','ready']);
});
test('shutdown during a build skips device work and queued jobs',async()=>{
  const f=await fixture(),entered=deferred(),release=deferred();
  const run:Runner=async(args,env)=>{if(args.some(a=>a.endsWith('native-build.mjs'))){entered.resolve();await release.promise;}return f.runner(args,env);};
  const service=new NativePreviews({...f.serviceOptions,run});const app=await service.app(f.appDir);
  const first=app.start('first',frames);await entered.promise;const queued=app.start('queued',frames);
  const stopping=service.stop();release.resolve();await Promise.all([first,queued,stopping]);await app.start('late',frames);
  expect(builds(f.calls)).toHaveLength(1);expect(named(f.calls,'boot')).toHaveLength(0);expect(shots(f.calls)).toHaveLength(0);
  expect(f.calls.filter(c=>op(c)==='prepare')).toHaveLength(0);expect(f.calls.filter(c=>op(c)==='close')).toHaveLength(1);
});
test('shutdown after an active readiness step skips the remaining frames and restores appearance',async()=>{
  const f=await fixture(),entered=deferred(),release=deferred();let waitCount=0;
  const readiness=fakeReadiness(f.calls);const wait=readiness.wait;
  readiness.wait=async(mark,deadline)=>{if(++waitCount===1){entered.resolve();await release.promise;}return wait(mark,deadline);};
  const service=new NativePreviews({...f.serviceOptions,readiness});const app=await service.app(f.appDir);
  const job=app.start('first',frames.map(f=>({...f,appearance:'dark'})));await entered.promise;const stopping=service.stop();release.resolve();await Promise.all([job,stopping]);
  expect(waitCount).toBe(1);expect(shots(f.calls)).toHaveLength(0);expect(f.sim.appearance).toBe('light');
  expect(named(f.calls,'shutdown')).toHaveLength(1);expect(f.calls.filter(c=>op(c)==='prepare')).toHaveLength(0);
});
test('different projects serialize all simulator work through one service',async()=>{
  const f=await fixture(),g=await fixture(),entered=deferred(),release=deferred();let first=true;
  const run:Runner=async(args,env)=>{if(first&&args.includes('--type=png')){first=false;entered.resolve();await release.promise;}return f.runner(args,env);};
  const service=new NativePreviews({...f.serviceOptions,run,target:new Simulators(run,'darwin')});
  const a=await service.app(f.appDir),b=await service.app(g.appDir);const firstJob=a.start('first',frames);await entered.promise;
  const count=f.calls.length,secondJob=b.start('second',frames);
  expect(b.snapshot(frames)).toMatchObject({state:'working',phase:'queued',message:'Waiting for native refresh…',error:'',done:0,total:0});
  await Bun.sleep(0);expect(f.calls).toHaveLength(count);
  release.resolve();await Promise.all([firstJob,secondJob]);expect(a.snapshot(frames).frames[0].state).toBe('ready');expect(b.snapshot(frames).frames[0].state).toBe('ready');
  const secondBuild=f.calls.findIndex(c=>c.args.includes(b.appDir)&&c.args.some(a=>a.endsWith('native-build.mjs')));
  expect(secondBuild).toBeGreaterThan(f.calls.indexOf(shots(f.calls)[1]));expect(shots(f.calls)).toHaveLength(4);
});
test('a queued refresh replaces a previous success message without hiding active progress',async()=>{
  const f=await fixture();await f.app.start('first',frames);
  const entered=deferred(),release=deferred();const blocker=f.service.enqueue(async()=>{entered.resolve();await release.promise;});await entered.promise;
  const next=f.app.start('next',frames,['one']);
  expect(f.app.snapshot(frames)).toMatchObject({state:'working',phase:'queued',message:'Waiting for native refresh…',done:0,total:0});
  release.resolve();await Promise.all([blocker,next]);expect(f.app.state).toBe('idle');
  const buildEntered=deferred(),buildRelease=deferred();let current:Awaited<ReturnType<NativePreviews['app']>>;
  const run:Runner=async(args,env)=>{if(args.some(a=>a.endsWith('native-build.mjs'))){buildEntered.resolve();await buildRelease.promise;}return f.runner(args,env);};
  const service=new NativePreviews({...f.serviceOptions,cache:join(f.appDir,'.other-cache'),run});current=await service.app(f.appDir);
  const active=current.start('active',frames);await buildEntered.promise;const queued=current.start('queued',frames);
  expect(current.snapshot(frames).phase).toBe('build');buildRelease.resolve();await Promise.all([active,queued]);await service.stop();
});
test('an interleaved queued refresh stays working after its earlier job completes',async()=>{
  const f=await fixture(),g=await fixture(),firstEntered=deferred(),firstRelease=deferred(),secondEntered=deferred(),secondRelease=deferred();let captures=0;
  const run:Runner=async(args,env)=>{
    if(args.includes('--type=png')){captures++;if(captures===1){firstEntered.resolve();await firstRelease.promise;}else if(captures===2){secondEntered.resolve();await secondRelease.promise;}}
    return f.runner(args,env);
  };
  const service=new NativePreviews({...f.serviceOptions,run,target:new Simulators(run,'darwin')}),a=await service.app(f.appDir),b=await service.app(g.appDir);
  const first=a.start('a-first',frames,['one']);await firstEntered.promise;const activePhase=a.snapshot(frames).phase;
  const middle=b.start('b',frames,['one']),last=a.start('a-last',frames,['one']);
  expect(a.snapshot(frames).phase).toBe(activePhase);firstRelease.resolve();await secondEntered.promise;
  expect(a.snapshot(frames)).toMatchObject({state:'working',phase:'queued',message:'Waiting for native refresh…',done:0,total:0});
  secondRelease.resolve();await Promise.all([first,middle,last]);expect(a.snapshot(frames)).toMatchObject({state:'idle',message:'Native previews updated.'});await service.stop();
});
test('projects sharing a bundle ID reinstall their own build when switching back',async()=>{
  const f=await fixture(),g=await fixture();await writeFile(join(g.appDir,'app.contract'),'different app');
  const config=JSON.parse(await readFile(join(g.appDir,'app.json'),'utf8'));config.name='Other';await writeFile(join(g.appDir,'app.json'),JSON.stringify(config));
  let installed='';const captured:string[]=[];
  const run:Runner=async(args,env)=>{
    if(args.some(a=>a.endsWith('native-build.mjs')))return (args.includes(b.appDir)?g.runner:f.runner)(args,env);
    if(args[0]===SIMCTL&&args[1]==='install')installed=args.at(-1)!;
    if(args.includes('--type=png'))captured.push(installed);
    return f.runner(args,env);
  };
  const service=new NativePreviews({...f.serviceOptions,run,target:new Simulators(run,'darwin')});
  const a=await service.app(f.appDir),b=await service.app(g.appDir);
  await a.start('a',frames,['one']);await b.start('b',frames,['one']);await a.start('a-again',frames,['one']);
  expect(named(f.calls,'install')).toHaveLength(3);expect(captured).toHaveLength(3);
  expect(captured[0]).not.toBe(captured[1]);expect(captured[2]).toBe(captured[0]);
  expect(a.snapshot(frames).frames[0].state).toBe('ready');await service.stop();
});
for(const action of ['retry','switch','shutdown'] as const)test(`failed accessibility session teardown finishes before ${action}`,async()=>{
  const entered=deferred(),finish=deferred();let opens=0,closes=0;
  const readiness=new NativeReadiness({open:async()=>{opens++;return {ask:async()=>({error:'runner disconnected'}),close:async()=>{closes++;entered.resolve();await finish.promise;}};},shoot:async()=>bmp()});
  readiness.prepare('device','first');await Bun.sleep(0);expect(readiness.axReady('device')).toBe(true);
  await readiness.mark('device','first');await entered.promise;
  let done=false;let pending:Promise<void>|undefined;
  if(action==='retry')readiness.prepare('device','first');
  else pending=(action==='switch'?readiness.releaseOtherApp('device','second'):readiness.close()).then(()=>{done=true;});
  await Bun.sleep(0);expect(opens).toBe(1);expect(done).toBe(false);
  finish.resolve();await pending;await Bun.sleep(0);
  if(action==='retry')expect(opens).toBe(2);else expect(done).toBe(true);
  await readiness.close();expect(closes).toBe(action==='retry'?2:1);
});
test('switching apps waits for the old accessibility session to close',async()=>{
  const opened=deferred(),closed=deferred();let closes=0;
  const readiness=new NativeReadiness({open:async()=>{await opened.promise;return {ask:async()=>({}),close:async()=>{closes++;await closed.promise;}};},shoot:async()=>{throw new Error('unused');}});
  readiness.prepare('device','first');let released=false;const release=readiness.releaseOtherApp('device','second').then(()=>{released=true;});
  opened.resolve();await Bun.sleep(0);expect(closes).toBe(1);expect(released).toBe(false);closed.resolve();await release;
  expect(readiness.needsOpen('device','second')).toBe(true);await readiness.close();expect(closes).toBe(1);
});
test('appearance groups frames, switches once each way and keys shots by appearance',async()=>{
  const f=await fixture();const both=[{id:'d1',device:'native-iphone-17',route:'/',appearance:'dark' as const},{id:'l1',device:'native-iphone-17',route:'/'},{id:'d2',device:'native-iphone-17',route:'/diary/add',appearance:'dark' as const},{id:'l2',device:'native-iphone-17',route:'/diary/add',appearance:'light' as const}];
  await f.app.start('a',both);const snapshot=f.app.snapshot(both);expect(snapshot.frames.map(f=>f.state)).toEqual(['ready','ready','ready','ready']);
  expect(named(f.calls,'ui').filter(c=>c.args.length===5).map(c=>c.args[4])).toEqual(['dark','light']);expect(f.sim.appearance).toBe('light');
  expect(new Set(snapshot.frames.map(f=>f.shot.split('?')[0])).size).toBe(4);expect(snapshot.frames[1].shot).toBe(f.app.snapshot([frames[0]]).frames[0].shot);
  // Light keeps the key shots had before appearances, so older state reads as light.
  expect(frameKey({id:'x',device:'native-iphone-17',route:'/'})).toBe(createHash('sha256').update('native-iphone-17\0/').digest('hex').slice(0,32));
  expect(frameKey({id:'x',device:'native-iphone-17',route:'/',appearance:'light'})).toBe(frameKey({id:'x',device:'native-iphone-17',route:'/'}));expect(frameKey({id:'x',device:'native-iphone-17',route:'/',appearance:'dark'})).not.toBe(frameKey({id:'x',device:'native-iphone-17',route:'/'}));
  // The device was light: light frames first, then one switch to dark, then back to light at the end.
  const sequence=f.calls.filter(c=>c.args.includes('--type=png')||(op(c)==='ui'&&c.args.length===5)).map(c=>op(c)==='ui'?c.args[4]:'shot');expect(sequence).toEqual(['shot','shot','dark','shot','shot','light']);
});
test('a screen that does not settle is retried once from the root, then fails and keeps its last screenshot',async()=>{
  let slow=false;const f=await fixture({outcome:url=>slow&&url==='web+ember://diary/add'?'timeout':'ready'});await f.app.start('a',frames);const before=f.app.snapshot(frames).frames[1];expect(before.state).toBe('ready');
  slow=true;f.clock.offset=61000;await f.app.start('b',frames,['two']);const after=f.app.snapshot(frames).frames[1];
  expect(after).toMatchObject({state:'error',error:'Ember did not settle on /diary/add within 8 s.',shot:before.shot});
  expect(opened(f.calls).slice(1)).toEqual(['web+ember://','web+ember://diary/add','web+ember://','web+ember://diary/add']);
  slow=false;await f.app.start('c',frames);expect(f.app.snapshot(frames).frames[1].state).toBe('ready');expect(opened(f.calls).at(-1)).toBe('web+ember://diary/add');
});
for(const [name,options,expected,state]of [ ['no Xcode',{noXcode:true},'need Xcode with the iOS Simulator','unavailable'],['low disk',{low:true},'5.0 GB free','error'],['build failure',{buildFail:true},'Full log:','error'],['missing protocol handler',{handler:false},'protocol_handlers','error']] as const)test(name,async()=>{const f=await fixture(options);await f.app.start('a',frames);expect(f.app.state).toBe(state);expect(f.app.error).toContain(expected);});
test('app exit marks capture error and relaunches for the next screen',async()=>{const f=await fixture({quit:true,via:'pixel'});await f.app.start('a',frames);expect(f.app.snapshot(frames).frames.map(f=>f.error)).toEqual(['Ember quit while opening /','Ember quit while opening /diary/add']);expect(named(f.calls,'launch')).toHaveLength(2);
  const g=await fixture({outcome:url=>url==='web+ember://diary/add'?'quit':'ready'});await g.app.start('a',frames);expect(g.app.snapshot(frames).frames.map(f=>f.state)).toEqual(['ready','error']);expect(g.app.snapshot(frames).frames[1].error).toBe('Ember quit while opening /diary/add');
  // A quit is retried once after making sure the app runs: reset, then the link again.
  expect(opened(g.calls)).toEqual(['web+ember://diary/add','web+ember://','web+ember://diary/add']);});
test('project registry resolves exact match and rejects unknown and remote projects',async()=>{const f=await fixture();expect(await f.service.project('http://localhost:1234')).toBe(f.app);await expect(f.service.project('https://example.com')).rejects.toThrow('local');const unknown=new NativePreviews({apps:[],fetch:(async()=>Response.json({name:'Other'})) as typeof fetch});await expect(unknown.project('http://localhost:1234')).rejects.toThrow('EXACT_DESIGN_NATIVE_APPS');});
test('shot paths reject traversal and missing files',()=>{for(const p of ['../state.json','a'.repeat(16)+'/../x.png','a'.repeat(16)+'/x.png','%2e%2e/foo'])expect(nativeShot(p).status).toBe(404);});
test('invalid requests return an error SSE snapshot without throwing',async()=>{const abort=new AbortController(),response=nativeScreens(null,new Request('http://127.0.0.1:5999/native',{signal:abort.signal}));expect(response.headers.get('content-type')).toBe('text/event-stream');const reader=response.body!.getReader(),{value}=await reader.read();const snapshot=JSON.parse(new TextDecoder().decode(value).slice(6));expect(snapshot).toEqual({state:'error',phase:'',message:'Invalid native preview request.',error:'Invalid native preview request.',done:0,total:0,steps:[],progress:-1,elapsed:0,estimate:0,frames:[]});abort.abort();});
test('requests carry capture ids and per-frame appearance',()=>{
  expect(nativeRequest({project:'http://127.0.0.1:5174',run:'',frames})).toEqual({project:'http://127.0.0.1:5174',run:'',capture:[],frames:frames.map(f=>({...f,appearance:'light'}))});
  expect(nativeRequest({project:'p',run:'r',capture:['two'],frames:[{...frames[1],appearance:'dark'}]}).frames[0].appearance).toBe('dark');
  for(const body of [{project:'p',run:'',capture:'two',frames},{project:'p',run:'',capture:[2],frames},{project:'p',run:'',frames:[{...frames[0],appearance:'sepia'}]}])expect(()=>nativeRequest(body)).toThrow('Invalid native preview');
});
test('discovery excludes protocol landing route only',async()=>{const result=await readRoutes('http://localhost:1234',(async(url:any)=>Response.json(String(url).endsWith('manifest.json')?{protocol_handlers:[{protocol:'web+ember',url:'/open?u=%s'}]}:{routes:[{name:'Open',pattern:'/open'},{name:'Today',pattern:'/'},{name:'Add',pattern:'/diary/add'}]})) as typeof fetch);expect(result.map(r=>r.route)).toEqual(['/','/diary/add']);});
test('missing runtime is unavailable and unsupported device errors only its frames',async()=>{
  const f=await fixture();const noRuntime:Runner=(args,env)=>args.join(' ').includes('list runtimes')?Promise.resolve('{"runtimes":[]}'):f.runner(args,env);
  const service=new NativePreviews({target:new Simulators(noRuntime,'darwin'),run:noRuntime,readiness:fakeReadiness(f.calls),cache:join(f.appDir,'.cache')});const app=await service.app(f.appDir);await app.start('none',frames);expect(app.state).toBe('unavailable');expect(app.error).toContain('No installed iOS Simulator runtime');
  const mixed=[{id:'ipad',device:'native-ipad-pro-11',route:'/'},frames[0]];await f.app.start('unsupported',mixed);const snapshot=f.app.snapshot(mixed);expect(snapshot.frames[0].error).toContain('No installed iOS Simulator runtime supports');expect(snapshot.frames[1].state).toBe('ready');expect(snapshot).toMatchObject({done:2,total:2});
});
test('new tokens queue behind the active job and restart retains shots but reinstalls before capture',async()=>{
  const f=await fixture();await Promise.all([f.app.start('one',frames),f.app.start('two',frames,['one','two']),f.app.start('two',frames)]);expect(shots(f.calls)).toHaveLength(4);expect(named(f.calls,'launch')).toHaveLength(1);expect(named(f.calls,'install')).toHaveLength(1);
  const next=new NativePreviews({...f.serviceOptions});const app=await next.app(f.appDir);await app.start('three',frames);expect(app.message).toBe('Native previews are up to date.');await app.start('four',frames,['one']);expect(builds(f.calls)).toHaveLength(1);expect(named(f.calls,'install')).toHaveLength(2);expect(shots(f.calls)).toHaveLength(5);
  await next.stop();expect(f.calls.at(-1)!.args).toEqual([SIMCTL,'shutdown','owned']);expect(f.calls.findLast(c=>c.args[0]==='ready')!.args).toEqual(['ready','close']);
});
test('device creation ignores names with wrong type or runtime',async()=>{
  const calls:string[][]=[];const run:Runner=async args=>{calls.push(args);if(args.join(' ')==='xcrun --find simctl')return SIMCTL;if(args.includes('runtimes'))return JSON.stringify({runtimes});if(args.includes('devices'))return JSON.stringify({devices:{[runtimes[0].identifier]:[{name:'Exact Design iPhone 17',deviceTypeIdentifier:type,isAvailable:true,udid:'wrong-runtime'}],[runtimes[1].identifier]:[{name:'Exact Design iPhone 17',deviceTypeIdentifier:'Duo',isAvailable:true,udid:'wrong-type'}]}});return 'new-owned';};
  expect(await new Simulators(run,'darwin').destination('iPhone 17',type)).toBe('new-owned');expect(calls.at(-1)).toEqual([SIMCTL,'create','Exact Design iPhone 17',type,runtimes[1].identifier]);
});
test('parallelism drives every device up to the cap and needs memory only for devices that are not booted',()=>{
  expect(deviceParallelism({devices:4,cold:0,cap:4})).toBe(4);expect(deviceParallelism({devices:6,cold:0,cap:4})).toBe(4);
  expect(deviceParallelism({devices:4,cold:4,cap:4,available:5*1024**3})).toBe(2);expect(deviceParallelism({devices:4,cold:2,cap:4,available:2.5*1024**3})).toBe(3);
  expect(deviceParallelism({devices:4,cold:4,cap:4,available:0})).toBe(1);expect(deviceParallelism({devices:3,cold:3,cap:4})).toBe(3);expect(deviceParallelism({devices:1,cold:1,cap:1,available:BOOT_MEMORY*8})).toBe(1);
  const vm='Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:                                     5499.\nPages active:                                 253176.\nPages inactive:                               251986.\nPages speculative:                               340.\n';
  expect(availableMemory(vm)).toBe((5499+251986+340)*16384);expect(availableMemory('nonsense')).toBeUndefined();
});
test('the service reads vm_stat only when a device needs booting',async()=>{
  const f=await fixture({service:{parallel:2,memory:undefined}});expect(await f.service.parallelism([{booted:true},{booted:true}])).toBe(2);expect(f.calls.some(c=>c.args[0]==='vm_stat')).toBe(false);
  expect(await f.service.parallelism([{booted:false},{booted:false}])).toBe(2);expect(f.calls.some(c=>c.args[0]==='vm_stat')).toBe(true);
  const tight=new NativePreviews({...f.serviceOptions,memory:async()=>1024**3});expect(await tight.parallelism([{booted:false},{booted:false},{booted:true}])).toBe(1);
});

// Readiness, on a virtual clock: sleeping moves time; the runner answers from a script of the time.
const element=(identifier:string|undefined,frame=[0,0,402,874],type='Other')=>({type,identifier,frame,enabled:true,selected:false});
const today=[element('exact-navigation-today'),element('add',[16,800,370,48],'Button'),{...element(undefined,[16,100,200,20],'StaticText'),label:'9:41'}];
const sheet=[element('exact-navigation-diary-add'),element('save',[16,40,80,44],'Button')];
const transient=[element(undefined),element(undefined,[0,0,402,80])];
function clocked(script:(t:number)=>any,foreground:(t:number)=>string=()=>'runningForeground',extra:Partial<ConstructorParameters<typeof NativeReadiness>[0]>={}){
  let t=0;const asks:string[]=[];
  const session:TouchSession={ask:async request=>{asks.push(String(request.op));return request.op==='foreground'?{state:foreground(t)}:script(t);},close:async()=>{asks.push('close');}};
  const readiness=new NativeReadiness({mode:'ax',open:async()=>session,shoot:async()=>{throw new Error('no pixels here');},now:()=>t,sleep:async ms=>{t+=ms;},poll:300,stable:600,unchanged:1500,deadline:8000,...extra});
  /** Marks once the session has opened in the background. */
  const mark=async()=>{readiness.prepare('u','app');for(let i=0;i<20&&!readiness.axReady('u');i++)await Bun.sleep(0);expect(readiness.axReady('u')).toBe(true);return readiness.mark('u','app');};
  return {readiness,asks,mark,at:()=>t,go:(ms:number)=>{t+=ms;}};
}
test('AX readiness waits for a route container and a stable window, not just two equal trees',async()=>{
  // Transition: a short tree with no route container that holds still for 900 ms, then the sheet.
  const c=clocked(t=>({elements:t<900?transient:sheet}));const mark=await c.mark();expect(mark.baseline).toBe(identity(transient));
  expect(await c.readiness.wait(mark)).toBe('ready');expect(c.at()).toBe(1500);// sheet first seen at 900, held 600 ms
  // Labels may tick without moving the identity.
  const d=clocked(t=>({elements:t<300?today:[...today.slice(0,2),{...today[2],label:`9:4${Math.floor(t/100)}`}]}));const before=await d.mark();
  expect(await d.readiness.wait(before)).toBe('ready');expect(d.at()).toBe(1500);// unchanged target: the unchanged window, not the label, decides
});
test('AX readiness: a changed screen is ready after its stable window; an unchanged one after 1500 ms',async()=>{
  const c=clocked(t=>({elements:t<200?today:sheet}));const mark=await c.mark();expect(await c.readiness.wait(mark)).toBe('ready');expect(c.at()).toBe(900);
  const same=clocked(()=>({elements:sheet}));const m=await same.mark();expect(await same.readiness.wait(m)).toBe('ready');expect(same.at()).toBe(1500);
  // An alert, or an app not in front, is never ready.
  const alert=clocked(t=>({elements:t<200?today:[...sheet,element(undefined,[40,300,320,200],'Alert')]}));expect(await alert.readiness.wait(await alert.mark())).toBe('timeout');expect(alert.at()).toBeGreaterThanOrEqual(8000);
  const behind=clocked(()=>({elements:sheet}),()=>'runningBackground');expect(await behind.readiness.wait(await behind.mark())).toBe('timeout');
});
test('AX readiness reports a quit and times out at the deadline',async()=>{
  const gone=clocked(t=>t<300?{elements:today}:{error:'the app is notRunning, not in the foreground'},()=>'notRunning');expect(await gone.readiness.wait(await gone.mark())).toBe('quit');
  const moving=clocked(t=>({elements:[element('exact-navigation-x',[0,Math.floor(t/300)*10,402,874])]}));const mark=await moving.mark();expect(await moving.readiness.wait(mark)).toBe('timeout');expect(moving.at()).toBe(8000);
  // A launch from nothing: the app was not in front before, so the first settled screen counts.
  const launch=clocked(t=>t<600?{error:'the app is runningBackground, not in the foreground'}:{elements:today},t=>t<600?'runningBackground':'runningForeground');const m=await launch.mark();expect(m.baseline).toBeNull();expect(await launch.readiness.wait(m)).toBe('ready');expect(launch.at()).toBe(1200);
});
// Synthetic BMPs: solid colour with an optional block, 24-bit bottom-up or 32-bit top-down with BI_BITFIELDS.
function bmp(o:{width?:number;height?:number;bpp?:24|32;topDown?:boolean;colour?:[number,number,number];block?:{x:number;y:number;w:number;h:number;colour:[number,number,number]}}={}){
  const width=o.width??40,height=o.height??80,bpp=o.bpp??24,stride=Math.ceil(width*bpp/32)*4,offset=bpp===32?138:54,b=Buffer.alloc(offset+stride*height);
  b.write('BM',0,'latin1');b.writeUInt32LE(b.length,2);b.writeUInt32LE(offset,10);b.writeUInt32LE(bpp===32?124:40,14);b.writeInt32LE(width,18);b.writeInt32LE(o.topDown?-height:height,22);b.writeUInt16LE(1,26);b.writeUInt16LE(bpp,28);b.writeUInt32LE(bpp===32?3:0,30);
  if(bpp===32){b.writeUInt32LE(0x00ff0000,54);b.writeUInt32LE(0x0000ff00,58);b.writeUInt32LE(0x000000ff,62);b.writeUInt32LE(0xff000000,66);}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const k=o.block&&x>=o.block.x&&x<o.block.x+o.block.w&&y>=o.block.y&&y<o.block.y+o.block.h?o.block.colour:(o.colour??[250,250,250]);const p=offset+(o.topDown?y:height-1-y)*stride+x*bpp/8;b[p]=k[2];b[p+1]=k[1];b[p+2]=k[0];if(bpp===32)b[p+3]=255;}
  return b;
}
test('BMP parsing reads bottom-up and top-down, 24 and 32 bits, the same way',()=>{
  const block={x:0,y:0,w:8,h:8,colour:[200,10,10] as [number,number,number]};const a=parseBmp(bmp({block})),b=parseBmp(bmp({bpp:32,topDown:true,block}));
  expect([a.width,a.height]).toEqual([40,80]);expect(Buffer.from(a.samples).equals(Buffer.from(b.samples))).toBe(true);expect([...a.samples.subarray(0,3)]).toEqual([200,10,10]);expect([...a.samples.subarray(-3)]).toEqual([250,250,250]);
  expect(pixelChange(a,parseBmp(bmp({bpp:32})))).toBeGreaterThan(0.005);expect(pixelChange(a,parseBmp(bmp({width:41})))).toBe(1);
  // Faint noise (a channel moved by 24 or less) is no change.
  expect(pixelChange(parseBmp(bmp()),parseBmp(bmp({colour:[230,240,226]})))).toBe(0);
  for(const bad of [Buffer.from('nope'),Buffer.concat([bmp().subarray(0,60)])])expect(()=>parseBmp(bad)).toThrow();
});
test('pixel fallback: ready when two frames match and differ from the screen before the link, or after 1500 ms',async()=>{
  let t=0,frame=bmp(),opens=0,shotsTaken=0;const notes:string[]=[];
  const readiness=new NativeReadiness({open:async()=>{opens++;throw new Error('xcodebuild exited 65');},notice:(udid,reason)=>notes.push(`${udid}: ${reason}`),shoot:async()=>{shotsTaken++;return frame;},now:()=>t,sleep:async ms=>{t+=ms;},pixelPoll:600,unchanged:1500,deadline:8000});
  readiness.prepare('u','app');const mark=await readiness.mark('u','app');expect(mark.mode).toBe('pixel');expect(shotsTaken).toBe(1);
  // A runner that fails to open is retried once in the background, then the device stays on pixels.
  // The second try waits for the caller's next prepare (after the app has settled), then the device stays on pixels.
  await Bun.sleep(0);expect(opens).toBe(1);expect(notes).toEqual([]);expect(readiness.needsOpen('u','app')).toBe(true);
  readiness.prepare('u','app');await Bun.sleep(0);expect(opens).toBe(2);expect(notes).toEqual(['u: the accessibility runner did not open (xcodebuild exited 65)']);expect(readiness.usesPixels('u')).toBe(true);expect(readiness.needsOpen('u','app')).toBe(false);
  frame=bmp({block:{x:0,y:0,w:40,h:40,colour:[10,10,10]}});expect(await readiness.wait(mark)).toBe('ready');expect(mark.via).toBe('pixel');expect(t).toBe(600);expect(shotsTaken).toBe(3);
  // The settled frame is the next baseline: marking costs no screenshot.
  const same=await readiness.mark('u','app');expect(shotsTaken).toBe(3);const start=t;expect(await readiness.wait(same)).toBe('ready');expect(t-start).toBe(1800);// first equal pair at 600, but unchanged until 1500
  expect(shotsTaken).toBe(7);readiness.forget('u');await readiness.mark('u','app');expect(shotsTaken).toBe(8);readiness.prepare('u','app');expect(opens).toBe(2);
  // A launch reads nothing before and waits out the unchanged window.
  const launch=await readiness.mark('u','app',true);expect(shotsTaken).toBe(8);expect(launch.baseline).toBeUndefined();expect(await readiness.wait(launch)).toBe('ready');expect(t-launch.at).toBe(1800);
  // A screen that keeps moving times out.
  let n=0;const moving=new NativeReadiness({mode:'pixel',shoot:async()=>bmp({block:{x:0,y:(n++%8)*10,w:40,h:10,colour:[0,0,0]}}),now:()=>t,sleep:async ms=>{t+=ms;},pixelPoll:600,deadline:8000});const m=await moving.mark('u','app');expect(await moving.wait(m)).toBe('timeout');expect(notes).toHaveLength(1);
});
test('the touch runner opens in the background: waits that start before it is ready use pixels, later ones the tree',async()=>{
  let t=0,shotsTaken=0,release=(_:TouchSession)=>{};const frame=bmp();
  const session:TouchSession={ask:async request=>request.op==='foreground'?{state:'runningForeground'}:{elements:t<200?today:sheet},close:async()=>{}};
  const readiness=new NativeReadiness({open:()=>new Promise<TouchSession>(resolve=>{release=resolve;}),shoot:async()=>{shotsTaken++;return frame;},now:()=>t,sleep:async ms=>{t+=ms;},poll:300,pixelPoll:600,stable:600,unchanged:1500,deadline:8000});
  readiness.prepare('u','app');const early=await readiness.mark('u','app');expect(early.mode).toBe('pixel');expect(shotsTaken).toBe(1);
  expect(await readiness.wait(early)).toBe('ready');expect(early.via).toBe('pixel');expect(readiness.axReady('u')).toBe(false);
  release(session);await Bun.sleep(0);expect(readiness.axReady('u')).toBe(true);
  const before=shotsTaken,late=await readiness.mark('u','app');expect(late.mode).toBe('ax');expect(await readiness.wait(late)).toBe('ready');expect(late.via).toBe('ax');expect(shotsTaken).toBe(before);
  await readiness.close();expect(readiness.axReady('u')).toBe(false);
});
test('AX readiness falls back to pixels when the runner breaks mid-wait, reopens once, and close ends sessions',async()=>{
  let t=0,closed=0,opens=0;const notes:string[]=[];const frame=bmp();
  const session:TouchSession={ask:async()=>t<300?{elements:today}:{error:'the touch runner hung up'},close:async()=>{closed++;}};
  const readiness=new NativeReadiness({open:async()=>{opens++;return session;},notice:(_u,reason)=>notes.push(reason),shoot:async()=>frame,now:()=>t,sleep:async ms=>{t+=ms;},poll:300,pixelPoll:600,unchanged:1500,deadline:8000});
  readiness.prepare('u','app');await Bun.sleep(0);const mark=await readiness.mark('u','app');expect(mark.mode).toBe('ax');
  expect(await readiness.wait(mark)).toBe('ready');expect(mark.via).toBe('pixel');expect(t).toBe(1500);expect(notes).toEqual([]);
  // The broken session was closed and opened once more; it breaks again, so the device stays on pixels.
  await Bun.sleep(0);expect(opens).toBe(1);expect(closed).toBe(1);expect(readiness.axReady('u')).toBe(false);readiness.prepare('u','app');await Bun.sleep(0);expect(opens).toBe(2);expect(readiness.axReady('u')).toBe(true);
  const again=await readiness.mark('u','app');expect(again.mode).toBe('pixel');expect(notes).toEqual(['the touch runner hung up']);expect(readiness.usesPixels('u')).toBe(true);await Bun.sleep(0);expect(closed).toBe(2);expect(opens).toBe(2);
  const other=new NativeReadiness({open:async()=>({ask:async()=>({elements:today}),close:async()=>{closed++;}}),shoot:async()=>frame});other.prepare('a','app');other.prepare('b','app');await other.close();expect(closed).toBe(4);
});
const e2e=process.env.EXACT_DESIGN_NATIVE_E2E==='1'&&process.platform==='darwin'&&Bun.spawnSync(['xcrun','--find','simctl']).exitCode===0;
test.skipIf(!e2e)('real Ember iPhone 17 captures',async()=>{
  const started=Date.now();const commands:{args:string[];at:number}[]=[];const {command}=await import('../tools/simulators');
  const run:Runner=async(args,env)=>{const t=Date.now();commands.push({args,at:t});try{return await command(args,env);}finally{console.log(`NATIVE TIMING +${t-started} ${args.join(' ').slice(0,160)}: ${Date.now()-t} ms`);}};
  const service=new NativePreviews({run});const readiness=service.readiness,mark=readiness.mark.bind(readiness),wait=readiness.wait.bind(readiness);
  Object.assign(readiness,{mark:async(udid:string,appId:string,blank?:boolean)=>{const t=Date.now();let m:Mark|undefined;try{return m=await mark(udid,appId,blank);}finally{console.log(`NATIVE TIMING +${t-started} readiness mark ${m?.mode}: ${Date.now()-t} ms`);}},
    wait:async(m:Mark,deadline?:number)=>{const t=Date.now();let outcome='';try{return outcome=await wait(m,deadline);}finally{console.log(`NATIVE TIMING +${t-started} readiness wait ${outcome} via ${m.via}: ${Date.now()-t} ms`);}}});
  const shotsOf=(snapshot:ReturnType<typeof app.snapshot>)=>Promise.all(snapshot.frames.map(async frame=>{expect(frame.state).toBe('ready');expect([frame.width,frame.height]).toEqual([1206,2622]);const file=frame.shot.split('/').at(-1)!.split('?')[0];expect((await readFile(join(app.dir,'shots',file))).subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');}));
  const app=await service.app(join(import.meta.dir,'../examples/ember'));
  try{
    // Forced, so a cache left by an earlier run still captures both screens.
    await app.start(`e2e-${Date.now()}`,frames,frames.map(f=>f.id));const snapshot=app.snapshot(frames);console.log('NATIVE E2E',JSON.stringify(snapshot),`total ${Date.now()-started} ms`,app.dir);
    expect(snapshot.state).toBe('idle');await shotsOf(snapshot);
    // A warm second job: the device is prepared and the app running, so it goes straight to its links.
    const warm=commands.length,warmAt=Date.now();await app.start(`e2e-warm-${Date.now()}`,frames,frames.map(f=>f.id));const ran=commands.slice(warm),first=ran.find(c=>c.args.includes('--type=png'));
    console.log(`NATIVE E2E warm job ${Date.now()-warmAt} ms, first capture after ${first!.at-warmAt} ms; commands: ${ran.map(c=>c.args[1]).join(' ')}`);
    expect(app.snapshot(frames).state).toBe('idle');await shotsOf(app.snapshot(frames));
    expect(ran.some(c=>['boot','bootstatus','status_bar','install','launch','ui'].includes(c.args[1])||c.args.includes('defaults')||c.args[0]==='xcrun')).toBe(false);
    const before=commands.length,again=Date.now();await app.start(`e2e-again-${Date.now()}`,frames);console.log(`NATIVE E2E up to date in ${Date.now()-again} ms`);
    expect(app.snapshot(frames)).toMatchObject({state:'idle',message:'Native previews are up to date.',done:0,total:0});expect(commands.slice(before).some(c=>c.args.includes('screenshot')||c.args.includes('openurl')||c.args.includes('launch'))).toBe(false);
  }finally{await service.stop();}
},600000);

test('build output names crates as they compile, then Swift and packaging',()=>{
  const p=new BuildProgress();expect(p.detail).toBe('Compiling the Contract…');
  expect(p.feed('warning: ember: app.contract:1:1 warning\n   Compiling exact-core v0.1.0 (/sdk)\n   Compiling ember-')).toBe(true);
  expect(p.detail).toBe('Compiling Rust · exact-core · 1 crate');
  // A line split across chunks is read once it is whole.
  expect(p.feed('apple v0.1.0\n')).toBe(true);expect(p.detail).toBe('Compiling Rust · ember-apple · 2 crates');
  expect(p.feed('host/apple: baked L=0; Swift embedded composition\n')).toBe(true);expect(p.detail).toBe('Compiling Swift…');
  // The SDK replays swift-build's counts in one batch after Swift finishes; they carry no live progress.
  expect(p.feed('[2 / 21] ExactCore\n[26 / 30] ExactIOS-product\n')).toBe(false);
  p.feed('Build complete! (6.43 sec)\n');expect(p.detail).toBe('Packaging the app…');
});
test('a capture job reports build, simulator and capture steps with real progress',async()=>{
  const f=await fixture();const seen:any[]=[];f.app.subscribe(()=>seen.push(structuredClone(f.app.snapshot(frames))));
  await f.app.start('a',frames);
  const building=seen.filter(s=>s.steps[0]?.state==='active');
  expect(building[0].message).toBe('Building Ember for iOS. The first build in this checkout takes several minutes.');
  expect(building.map(s=>s.steps[0].detail)).toEqual(expect.arrayContaining(['Compiling Rust · exact-core · 1 crate','Compiling Swift…','Packaging the app…']));
  expect(building.every(s=>s.progress===-1)).toBe(true);
  // One step is active at a time, even when a capture has to launch the app first.
  expect(seen.every(s=>s.steps.filter((x:any)=>x.state==='active').length<=1)).toBe(true);
  expect(seen.some(s=>s.steps[1]?.state==='active'&&s.steps[1].detail.startsWith('Starting iPhone 17'))).toBe(true);
  const capturing=seen.filter(s=>s.steps[2]?.state==='active');
  expect(capturing[0].steps[0]).toMatchObject({state:'done'});expect(capturing[0].steps[0].detail).toMatch(/^Built in \d+ s$/);
  expect(capturing.map(s=>s.steps[2].detail)).toEqual(expect.arrayContaining(['1 of 2','2 of 2']));expect(capturing.map(s=>s.progress)).toContain(0.5);
  expect(seen.at(-1).steps).toEqual([]);expect(seen.at(-1).message).toBe('Native previews updated.');
  // A source change rebuilds and says so; an unchanged app skips the build and the warm device needs no preparing.
  await writeFile(join(f.appDir,'app.contract'),'second');seen.length=0;await f.app.start('b',frames);
  expect(seen.find(s=>s.steps[0]?.state==='active').message).toBe('Rebuilding Ember with your changes…');
  seen.length=0;await f.app.start('c',frames,['one']);
  const steps=seen.find(s=>s.steps[2]?.state==='active').steps;
  expect(steps[0]).toMatchObject({state:'skipped',detail:'Up to date'});expect(steps[1]).toMatchObject({state:'skipped',detail:'Already running'});
});
test('a failed build marks its step failed',async()=>{
  const f=await fixture({buildFail:true});const seen:any[]=[];f.app.subscribe(()=>seen.push(structuredClone(f.app.snapshot(frames))));
  await f.app.start('a',frames);expect(seen.some(s=>s.steps[0]?.state==='failed')).toBe(true);expect(seen.at(-1).state).toBe('error');expect(seen.at(-1).steps).toEqual([]);
});
test('earlier iOS build output in the checkout makes a build warm: 10 GB is enough and it is not called a first build',async()=>{
  const cold=await fixture({service:{free:async()=>15*1024**3}});await cold.app.start('a',frames);
  expect(cold.app.snapshot(frames).error).toBe('Only 15.0 GB free. Native builds need 20 GB free.');
  const warm=await fixture({service:{free:async()=>15*1024**3}});await mkdir(join(warm.appDir,'target','aarch64-apple-ios-sim'),{recursive:true});
  const seen:string[]=[];warm.app.subscribe(()=>seen.push(warm.app.message));await warm.app.start('a',frames);
  expect(seen).toContain('Building Ember for iOS…');expect(seen.some(m=>m.includes('first build'))).toBe(false);expect(warm.app.snapshot(frames).state).toBe('idle');
});
