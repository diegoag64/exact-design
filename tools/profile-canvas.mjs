// Canvas navigation benchmark. Starts private copies of the studio, its helper,
// and Ember on free ports, so the running editor and its saved data are untouched.
// Each trial uses a fresh browser, and variants alternate (ABBA) to cancel drift.
//
//   bun tools/profile-canvas.mjs                              # the working tree, 5 trials
//   bun tools/profile-canvas.mjs --variant base=main --variant head=WORKTREE
//   options: --trials N  --frames N  --dpr N  --headed  --out FILE  --traces DIR  --categories LIST  --preview-css NAME=CSS  --events-per-frame N  --keep
import {mkdir,mkdtemp,cp,readdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {suiteBrowser} from '../.exact-sdk/scripts/agent-launch.mjs';

const root=resolve(import.meta.dir,'..');
const argv=process.argv.slice(2),flag=name=>argv.includes(name);
const option=(name,fallback)=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:fallback;};
const variants=argv.flatMap((a,i)=>a==='--variant'?[argv[i+1]]:[]).map(v=>{const [name,ref=name]=v.split('=');return {name,ref};});
if(!variants.length)variants.push({name:'worktree',ref:'WORKTREE'});
// Experiment knob: CSS injected into every preview of one variant, such as removing an effect.
const previewCss=Object.fromEntries(argv.flatMap((a,i)=>a==='--preview-css'?[argv[i+1]]:[]).map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));
const perFrame=Number(option('--events-per-frame',1)),trials=Number(option('--trials',5)),frames=Number(option('--frames',120)),dpr=Number(option('--dpr',2)),headed=flag('--headed');
const out=resolve(option('--out',resolve(root,'.exact/profile-canvas.json'))),traces=option('--traces');
const env={...process.env,PATH:`${resolve(homedir(),'.cargo/bin')}:${process.env.PATH}`,EXACT_FEEDBACK:'0'};
const children=[],helpers=[],bridges=[];
const freePort=()=>{const s=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response()});const p=s.port;s.stop(true);return p;};
const sh=async(cmd,cwd=root)=>{const p=Bun.spawn(cmd,{cwd,stdout:'pipe',stderr:'pipe'});const [o,e,c]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(c)throw new Error(`${cmd.join(' ')}: ${e}`);return o;};

/** Copies one app's tracked files at `ref`, or as they are on disk for WORKTREE. */
async function checkout(ref,path,dest){
  await mkdir(dest,{recursive:true});
  if(ref==='WORKTREE'){
    const files=(await sh(['git','ls-files','--cached','--others','--exclude-standard',path])).split('\n').filter(Boolean);
    for(const f of files)await cp(resolve(root,f),resolve(dest,f.slice(path.length+1)),{recursive:true}).catch(e=>{if(e.code!=='ENOENT')throw e;});
  }else{
    const tar=resolve(dest,'..',`${path.replace(/\W/g,'-')}.tar`);
    await sh(['git','archive','--format=tar','-o',tar,ref,path]);
    await sh(['tar','-xf',tar,'--strip-components',String(path.split('/').length),'-C',dest]);await rm(tar);
  }
}

async function serve(temp,dir,name,port,toolPort){
  const launcher=resolve(temp,name+'.mjs');
  await writeFile(launcher,`import {run} from ${JSON.stringify(resolve(root,'.exact-sdk/scripts/app-cli.mjs'))};process.exit(await run({dir:${JSON.stringify(dir)},name:${JSON.stringify(name)},exact2:${JSON.stringify(resolve(root,'.exact-sdk'))},args:['web','--port','${port}']}));`);
  children.push(Bun.spawn([process.execPath,launcher],{cwd:root,env:{...env,EXACT_TOOL_PORT:String(toolPort)},stdout:Bun.file(resolve(temp,name+'.log')),stderr:Bun.file(resolve(temp,name+'-errors.log'))}));
  for(const end=Date.now()+120000;;){
    try{if((await fetch(`http://127.0.0.1:${port}`)).ok)return `http://127.0.0.1:${port}`;}catch{}
    if(Date.now()>end)throw new Error(`${name} did not start: ${await Bun.file(resolve(temp,name+'-errors.log')).text()}`);
    await Bun.sleep(200);
  }
}

async function startVariant(temp,variant){
  const dir=resolve(temp,variant.name);
  await checkout(variant.ref,'studio',resolve(dir,'studio'));await checkout(variant.ref,'tools',resolve(dir,'tools'));
  for(const entry of await readdir(resolve(dir,'studio')))if(entry.includes('.test.')||entry.endsWith('.d.ts'))await rm(resolve(dir,'studio',entry),{recursive:true});
  const {startDiscoveryServer}=await import(resolve(dir,'tools/discovery-server.ts'));
  const helper=startDiscoveryServer(0);helpers.push(helper);
  bridges.push((await import(resolve(dir,'tools/element-bridge.ts'))).stopElementBridges);
  const app=resolve(dir,'studio/app.ts');
  await writeFile(app,(await readFile(app,'utf8')).replace("'http://127.0.0.1:5175'",JSON.stringify(helper.url.origin)));
  const manifest=JSON.parse(await readFile(resolve(dir,'studio/app.json'),'utf8'));delete manifest.commands;delete manifest.server;
  await writeFile(resolve(dir,'studio/app.json'),JSON.stringify(manifest));
  // Ember accepts framing only from the studio named by EXACT_TOOL_PORT, so each variant gets its own copy.
  const port=freePort(),emberPort=freePort();
  await checkout('WORKTREE','examples/ember',resolve(dir,'ember'));
  const [origin,ember]=await Promise.all([serve(temp,resolve(dir,'studio'),`studio-${variant.name}`,port,port),serve(temp,resolve(dir,'ember'),`ember-${variant.name}`,emberPort,port)]);
  return {...variant,url:`${origin}/?connect=${encodeURIComponent(ember)}&name=Ember&viewports=Core`,commit:variant.ref==='WORKTREE'?'WORKTREE':(await sh(['git','rev-parse','--short',variant.ref])).trim()};
}

// Synthetic wheel events each animation frame (one by default; a trackpad can
// deliver more). Pan and zoom move in one direction, then return, so the
// camera ends where it started. The total movement is the same for any count.
const DRIVER=`window.__drive=async(mode,n,k)=>{
  const canvas=document.querySelector('[aria-label="Design canvas"]'),b=canvas.getBoundingClientRect();
  const camera=()=>Object.fromEntries(exact.state[0].filter(s=>['px','py','zoom'].includes(s.n.devName)).map(s=>[s.n.devName,s()]));
  const start=camera(),step=Math.pow(1/start.zoom,1/(n/2)),each=Math.pow(step,1/k),times=[];
  for(let i=0;i<n;i++){
    times.push(await new Promise(requestAnimationFrame));
    const out=i>=n/2,init={bubbles:true,cancelable:true,clientX:b.left+b.width/2,clientY:b.top+b.height/2};
    for(let j=0;j<k;j++){
      if(mode==='pan')canvas.dispatchEvent(new WheelEvent('wheel',{...init,deltaX:(out?-6:6)/k}));
      if(mode==='zoom')canvas.dispatchEvent(new WheelEvent('wheel',{...init,ctrlKey:true,deltaY:out?(1-1/each)/0.005:-(each-1)/0.005}));
    }
  }
  times.push(await new Promise(requestAnimationFrame));
  const peak=start.zoom*Math.pow(step,n/2);
  return {times,start,end:camera(),peakZoom:Math.min(3,peak)};
};`;
const CATEGORIES=['devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,toplevel,benchmark,cc,viz,gpu',option('--categories')].filter(Boolean).join(',');

function summarizeTrace(events){
  const threads=new Map(events.filter(e=>e.ph==='M'&&e.name==='thread_name').map(e=>[`${e.pid}:${e.tid}`,e.args.name]));
  const thread=e=>threads.get(`${e.pid}:${e.tid}`)??'?';
  const ts=events.filter(e=>e.ph==='X').map(e=>e.ts),span=ts.length?(Math.max(...ts)-Math.min(...ts))/1000:0;
  // Busy time counts each thread's top-level tasks; top events show where it went.
  const busy={},top={};
  for(const e of events){
    if(e.ph!=='X'||e.dur===undefined)continue;
    const t=thread(e);
    if(e.name==='RunTask'){const s=busy[t]??={wall:0,cpu:0,tasks:0};s.wall+=e.dur/1000;s.cpu+=(e.tdur??0)/1000;s.tasks++;}
    else if(['CrGpuMain','CrRendererMain','VizCompositorThread','Compositor'].includes(t)&&!e.name.endsWith('RunTask')){const s=(top[t]??={})[e.name]??={ms:0,calls:0};s.ms+=e.dur/1000;s.calls++;}
  }
  for(const [t,names] of Object.entries(top))top[t]=Object.fromEntries(Object.entries(names).sort((a,b)=>b[1].ms-a[1].ms).slice(0,12));
  // The compositor's frame reporter says what reached the display for each frame.
  const frames={};
  for(const e of events)if(e.name==='PipelineReporter'&&e.ph==='b'){const s=(e.args?.frame_reporter??e.args?.chrome_frame_reporter)?.state??'unknown';frames[s]=(frames[s]??0)+1;}
  return {span,busy,top,frames};
}

const stats=xs=>{const s=xs.toSorted((a,b)=>a-b),at=p=>s[Math.min(s.length-1,Math.floor(s.length*p))];return {n:s.length,mean:s.reduce((a,b)=>a+b,0)/s.length,median:at(.5),p95:at(.95),max:s.at(-1),over20:s.filter(x=>x>20).length};};

async function trial(variant,index){
  const suite=await suiteBrowser('chromium',{needs:['perf'],headless:!headed,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
  const page=await suite.newPage({viewport:{width:1280,height:800},deviceScaleFactor:dpr});
  const errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(`${r.url()} ${r.failure()?.errorText}`));
  try{
    await page.goto(variant.url,{waitUntil:'load'});
    await page.waitForFunction(()=>document.querySelectorAll('#canvas-stage iframe').length===30,undefined,{timeout:120000});
    // Previews are cross-origin, so each one is checked in its own frame.
    const previews=()=>page.frames().filter(f=>f.url().includes('__ed_canvas=1'));
    for(const end=Date.now()+120000;previews().length<30;await page.waitForTimeout(250))if(Date.now()>end)throw new Error(`${previews().length} of 30 previews loaded\n${failed.slice(0,3).join('\n')}`);
    await Promise.all(previews().map(f=>f.waitForFunction(()=>document.readyState==='complete'&&globalThis.exact,undefined,{timeout:120000,polling:250})));
    if(previewCss[variant.name])await Promise.all(previews().map(f=>f.addStyleTag({content:previewCss[variant.name]})));
    await page.waitForTimeout(8000);
    await page.getByRole('button',{name:'Fit all screens',exact:true}).click();await page.waitForTimeout(1500);
    await page.evaluate(DRIVER);
    const cdp=await page.context().newCDPSession(page),scenarios={};
    for(const mode of ['idle','pan','zoom']){
      await cdp.send('Tracing.start',{categories:CATEGORIES,transferMode:'ReturnAsStream'});
      const run=await page.evaluate(([m,n,k])=>window.__drive(m,n,k),[mode,frames,perFrame]);
      const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');
      const {stream}=await done;let text='';for(;;){const r=await cdp.send('IO.read',{handle:stream});text+=r.base64Encoded?Buffer.from(r.data,'base64').toString():r.data;if(r.eof)break;}
      await cdp.send('IO.close',{handle:stream});
      if(traces){await mkdir(traces,{recursive:true});await writeFile(resolve(traces,`${variant.name}-${index}-${mode}.json`),text);}
      const parsed=JSON.parse(text),events=Array.isArray(parsed)?parsed:parsed.traceEvents;
      const intervals=run.times.slice(1).map((t,i)=>t-run.times[i]);
      scenarios[mode]={intervals:stats(intervals),camera:{start:run.start,end:run.end,peakZoom:run.peakZoom},trace:summarizeTrace(events)};
      await page.waitForTimeout(1000);
    }
    const visible=await page.evaluate(()=>{const b=document.querySelector('#canvas-stage').getBoundingClientRect();return [...document.querySelectorAll('#canvas-stage iframe')].filter(f=>{const r=f.getBoundingClientRect();return r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top;}).length;});
    return {variant:variant.name,trial:index,visible,errors,scenarios};
  }finally{await suite.browser.close();}
}

await mkdir(resolve(root,'.exact'),{recursive:true});
const temp=await mkdtemp(resolve(root,'.exact/profile-canvas-'));
const cleanup=async()=>{for(const c of children)c.kill();for(const h of helpers)h.stop(true);for(const stop of bridges)stop();if(!flag('--keep'))await rm(temp,{recursive:true,force:true});};
process.on('SIGINT',async()=>{await cleanup();process.exit(130);});
try{
  const started=[];for(const v of variants)started.push(await startVariant(temp,v));
  const results=[];
  for(let t=0;t<trials;t++){
    const order=t%2?started.toReversed():started;
    for(const v of order){const r=await trial(v,t);results.push(r);console.log(JSON.stringify({variant:r.variant,trial:t,visible:r.visible,errors:r.errors.length,...Object.fromEntries(Object.entries(r.scenarios).map(([m,s])=>[m,+s.intervals.mean.toFixed(2)]))}));}
  }
  // The headline per variant: medians across trials of each trial's mean and p95 interval, and their spread.
  const summary={};
  for(const v of started)for(const mode of ['idle','pan','zoom']){
    const rows=results.filter(r=>r.variant===v.name).map(r=>r.scenarios[mode]);
    const means=rows.map(r=>r.intervals.mean),p95s=rows.map(r=>r.intervals.p95);
    const gpuBusy=rows.map(r=>(r.trace.busy.CrGpuMain?.wall??0)/r.trace.span);
    const dropped=rows.map(r=>{const f=r.trace.frames,all=Object.values(f).reduce((a,b)=>a+b,0);return all?((f.STATE_DROPPED??0)+(f.STATE_PRESENTED_PARTIAL??0))/all:0;});
    const layerize=rows.map(r=>(r.trace.top.CrRendererMain?.Layerize?.ms??0)/r.intervals.n);
    (summary[v.name]??={})[mode]={meanInterval:stats(means).median,spread:Math.max(...means)-Math.min(...means),p95Interval:stats(p95s).median,
      gpuBusyPct:100*stats(gpuBusy).median,droppedPct:100*stats(dropped).median,layerizeMs:stats(layerize).median};
  }
  const report={date:new Date().toISOString(),options:{trials,frames,perFrame,dpr,headed,viewport:'1280x800'},variants:started.map(({name,ref,commit})=>({name,ref,commit,previewCss:previewCss[name]})),summary,results};
  await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2));
  console.table(Object.fromEntries(Object.entries(summary).flatMap(([v,modes])=>Object.entries(modes).map(([m,s])=>[`${v} ${m}`,Object.fromEntries(Object.entries(s).map(([k,x])=>[k,x===null?null:+x.toFixed(2)]))]))));
  console.log(`report: ${out}`);
}finally{await cleanup();}
process.exit(process.exitCode??0);
