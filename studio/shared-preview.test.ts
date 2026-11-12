import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ElementBridge} from '../tools/element-bridge';
import {suiteBrowser} from '../.exact-sdk/scripts/agent-launch.mjs';

test('real Exact previews share controls and data while routes, widths, and scroll stay local',async()=>{
  const root=resolve(import.meta.dir,'..');await mkdir(resolve(root,'.exact'),{recursive:true});
  const dir=await mkdtemp(resolve(root,'.exact/shared-preview-'));
  for(const name of ['app.contract','app.test.contract','app.ts','app.tamber','app.json','assets'])await cp(resolve(root,'examples/responsive',name),resolve(dir,name),{recursive:true});
  const launcher=resolve(dir,'run.mjs');
  const probe=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response()});const port=probe.port;probe.stop(true);
  let bridge:ElementBridge|undefined,suite:any,page:any;
  const host=Bun.serve({hostname:'127.0.0.1',port:0,fetch:req=>{
    if(['/canvas-navigation.js','/menus.js'].includes(new URL(req.url).pathname))return new Response(Bun.file(resolve(root,'studio/modules/web'+new URL(req.url).pathname)),{headers:{'content-type':'text/javascript'}});
    if(new URL(req.url).pathname==='/preview-host.js')return new Response(Bun.file(resolve(root,'studio/modules/web/index.js')),{headers:{'content-type':'text/javascript'}});
    return new Response('<!doctype html><style>iframe:not([hidden]){width:390px;height:844px}</style><body>'+[390,768,1440].map((width,i)=>`<iframe name="view-${i}" style="width:${width}px" src="${bridge!.origin}/?__ed_frame=view-${i}&__ed_events=project-v2&__ed_full=0&__ed_height=844"></iframe>`).join('')+`<script type="module">import {element} from '/preview-host.js';element({hatch:'preview-engines',element:document.body});</script>`,{headers:{'content-type':'text/html'}});
  }});
  await writeFile(launcher,`import {run} from ${JSON.stringify(resolve(root,'.exact-sdk/scripts/app-cli.mjs'))};process.exit(await run({dir:${JSON.stringify(dir)},name:'shared-preview',exact2:${JSON.stringify(resolve(root,'.exact-sdk'))},args:['web','--port','${port}']}));`);
  const child=Bun.spawn([process.execPath,launcher],{cwd:root,env:{...process.env,PATH:'/Users/diegoarias/.cargo/bin:'+process.env.PATH,EXACT_FEEDBACK:'0',EXACT_TOOL_PORT:String(host.port)},stdout:Bun.file(resolve(dir,'server.log')),stderr:Bun.file(resolve(dir,'server-errors.log'))});
  const errors:string[]=[];
  try{
    const end=Date.now()+20000;
    for(;;){try{if((await fetch('http://127.0.0.1:'+port)).ok)break;}catch{}if(Date.now()>end)throw new Error('Exact fixture did not start.');await new Promise(r=>setTimeout(r,100));}
    bridge=new ElementBridge('http://127.0.0.1:'+port);suite=await suiteBrowser();page=await suite.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.goto(host.url.href,{waitUntil:'load'});
    let frames=[0,1,2].map(i=>page.frame({name:'view-'+i}));
    const count=async(n:number,targets=frames)=>Promise.all(targets.map(f=>f.waitForFunction(n=>Number(document.body.innerText.match(/(?:^|\n)(\d+) notes?(?:\n|$)/)?.[1])===n,n,{polling:50,timeout:10000})));
    await count(6);expect(bridge.connections.size).toBe(1);expect(await page.locator('iframe[title="Project data runtime"]').count()).toBe(1);
    const documents=await Promise.all(frames.map(f=>f.evaluate(()=>window.sharedDocument=crypto.randomUUID())));
    await frames[1].getByRole('textbox',{name:'Search notes'}).fill('Sunday');await count(1);
    expect(await Promise.all(frames.map(f=>f.getByRole('textbox',{name:'Search notes'}).inputValue()))).toEqual(['Sunday','Sunday','Sunday']);
    await frames[0].getByRole('textbox',{name:'Search notes'}).fill('');await count(6);
    await frames[2].getByRole('button',{name:'The art of paying attention',exact:true}).click();
    await frames[2].getByRole('textbox',{name:'Note title'}).fill('Shared note');
    expect(new URL(frames[0].url()).pathname).toBe('/');expect(new URL(frames[1].url()).pathname).toBe('/');
    await Promise.all(frames.slice(0,2).map(f=>f.waitForFunction(()=>exact.state[0].find(s=>s.n.devName==='title')()==='Shared note',undefined,{polling:50})));
    await frames[2].getByRole('button',{name:'Save',exact:true}).click();await count(6);
    await Promise.all(frames.map(f=>f.getByRole('button',{name:'Shared note',exact:true}).waitFor()));
    const create=async(frame:any,title:string)=>{
      await frame.getByRole('button',{name:'New note',exact:true}).click();
      await frame.getByRole('textbox',{name:'Note title'}).fill(title);
      await frame.getByRole('button',{name:'Save',exact:true}).click();
    };
    await create(frames[1],'Across viewports');await count(7);
    expect(await Promise.all(frames.map(f=>f.evaluate(()=>window.sharedDocument)))).toEqual(documents);
    // A second source caller must preserve the earlier edit and create once.
    await Promise.all(frames.map(f=>f.getByRole('button',{name:'Shared note',exact:true}).waitFor()));
    await frames[0].getByRole('button',{name:'Add to favorites',exact:true}).first().click();
    await Promise.all(frames.map(f=>f.waitForFunction(()=>document.querySelectorAll('button[aria-label=\"Remove from favorites\"]').length===3,undefined,{polling:50})));
    await frames[2].getByRole('textbox',{name:'Search notes'}).fill('Across');await count(1);
    const added=page.waitForEvent('framenavigated',{predicate:(frame:any)=>frame.name()==='late'});
    await page.evaluate(src=>{const frame=document.createElement('iframe');frame.name='late';frame.src=src;document.body.append(frame);},bridge.origin+'/?__ed_frame=late&__ed_full=0&__ed_height=844');
    await page.waitForFunction(()=>document.querySelector('iframe[name="late"]')?.getAttribute('src'));
    const late=await added;
    await late.waitForLoadState('load');frames.push(late);await count(1);
    expect(await late.getByRole('textbox',{name:'Search notes'}).inputValue()).toBe('Across');
    // Reloading a view retains shared controls without restarting the source runtime.
    await Promise.all([frames[1].waitForNavigation({waitUntil:'load'}),frames[1].evaluate(()=>location.reload())]);await count(1);
    await frames[2].getByRole('textbox',{name:'Search notes'}).fill('');await count(7);
    const widths=await Promise.all(frames.slice(0,3).map(f=>f.evaluate(()=>innerWidth)));expect(widths).toEqual([390,768,1440]);
    const scroller=await frames[0].evaluate(()=>{const el=[...document.querySelectorAll('*')].find(el=>el.scrollHeight>el.clientHeight+100&&getComputedStyle(el).overflowY==='auto');if(!el)return false;el.scrollTop=100;return el.scrollTop>0;});
    expect(scroller).toBe(true);expect(await frames[1].evaluate(()=>[...document.querySelectorAll('*')].every(el=>el.scrollTop===0))).toBe(true);
    await page.locator('iframe[name="view-0"]').evaluate(el=>el.remove());frames=frames.slice(1);
    await create(frames[1],'Still connected');await count(8);
    const reloads=frames.map(f=>f.waitForNavigation({waitUntil:'load'}));
    const contract=resolve(dir,'app.contract');await writeFile(contract,(await readFile(contract,'utf8')).replace('border-radius=10','border-radius=11'));
    await Promise.all(reloads);await count(8);
    // The new engine must hydrate stored data even if Exact carried resource
    // answers from its checkpoint and did not ask the initial read again.
    await create(frames[0],'After rebuild');await count(9);
    await Promise.all(frames.map(f=>f.getByRole('button',{name:'Shared note',exact:true}).waitFor()));
    expect(bridge.connections.size).toBe(1);expect(errors).toEqual([]);
  }finally{
    await page?.context().close();await suite?.browser.close();bridge?.server.stop(true);host.stop(true);child.kill('SIGTERM');await child.exited;await rm(dir,{recursive:true,force:true});
  }
},60000);
