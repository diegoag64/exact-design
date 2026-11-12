import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,readdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {startDiscoveryServer} from '../tools/discovery-server';
import {ElementBridge,stopElementBridges} from '../tools/element-bridge';
import {suiteBrowser} from '../.exact-sdk/scripts/agent-launch.mjs';

// Two real Exact apps and a private helper keep this regression independent
// of the running editor, its project connection, and the user's saved data.
test('design inspector edits text, linked spacing and corners as drafts, with persistent history',async()=>{
  const root=resolve(import.meta.dir,'..');await mkdir(resolve(root,'.exact'),{recursive:true});
  const temp=await mkdtemp(resolve(root,'.exact/selection-reveal-')),editor=resolve(temp,'studio'),app=resolve(temp,'app');
  await mkdir(editor);await mkdir(app);await cp(resolve(root,'tools'),resolve(temp,'tools'),{recursive:true});
  for(const entry of await readdir(resolve(root,'studio'),{withFileTypes:true}))if(entry.isFile()&&!entry.name.includes('.test.')&&!entry.name.endsWith('.d.ts')&&/\.(ts|contract|json|tamber)$/.test(entry.name))await cp(resolve(root,'studio',entry.name),resolve(editor,entry.name));
  for(const name of ['assets','modules'])await cp(resolve(root,'studio',name),resolve(editor,name),{recursive:true});
  for(const name of ['app.contract','app.ts','app.tamber','app.json','assets'])await cp(resolve(root,'fixtures/morrow',name),resolve(app,name),{recursive:true});
  const helper=startDiscoveryServer(0),helperOrigin=helper.url.origin;
  await writeFile(resolve(editor,'app.ts'),(await readFile(resolve(editor,'app.ts'),'utf8')).replace("'http://127.0.0.1:5175'",JSON.stringify(helperOrigin)));
  const manifest=JSON.parse(await readFile(resolve(editor,'app.json'),'utf8'));delete manifest.commands;delete manifest.server;await writeFile(resolve(editor,'app.json'),JSON.stringify(manifest));
  const freePort=()=>{const s=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response()});const p=s.port;s.stop(true);return p;};
  const editorPort=freePort(),appPort=freePort(),children:any[]=[];
  const start=async(dir:string,name:string,port:number)=>{
    const launcher=resolve(temp,name+'.mjs');await writeFile(launcher,`import {run} from ${JSON.stringify(resolve(root,'.exact-sdk/scripts/app-cli.mjs'))};process.exit(await run({dir:${JSON.stringify(dir)},name:${JSON.stringify(name)},exact2:${JSON.stringify(resolve(root,'.exact-sdk'))},args:['web','--port','${port}']}));`);
    children.push(Bun.spawn([process.execPath,launcher],{cwd:root,env:{...process.env,PATH:resolve(homedir(),'.cargo/bin')+':'+process.env.PATH,EXACT_FEEDBACK:'0',EXACT_TOOL_PORT:String(editorPort)},stdout:Bun.file(resolve(temp,name+'.log')),stderr:Bun.file(resolve(temp,name+'-errors.log'))}));
    const end=Date.now()+25000;for(;;){try{if((await fetch('http://127.0.0.1:'+port)).ok)return;}catch{}if(Date.now()>end)throw new Error(name+' did not start: '+await Bun.file(resolve(temp,name+'-errors.log')).text());await new Promise(r=>setTimeout(r,100));}
  };
  let suite:any,page:any;const errors:string[]=[];
  try{
    await Promise.all([start(editor,'selection-editor',editorPort),start(app,'selection-app',appPort)]);
    suite=await suiteBrowser();page=await suite.newPage({viewport:{width:1440,height:1000},colorScheme:'dark'});page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+editorPort,{waitUntil:'load'});
    await page.getByRole('button',{name:'Project connection',exact:true}).click();
    await page.getByRole('textbox',{name:'Project name',exact:true}).fill('Morrow');await page.getByRole('textbox',{name:'Project URL',exact:true}).fill('http://127.0.0.1:'+appPort);await page.getByRole('button',{name:'Connect',exact:true}).click();
    await page.getByRole('button',{name:'Add screen',exact:true}).click();await page.getByRole('textbox',{name:'Screen name',exact:true}).fill('Library');await page.getByRole('textbox',{name:'Route',exact:true}).fill('/');await page.getByRole('button',{name:'Add screen',exact:true}).last().click();
    await page.getByRole('button',{name:'Add viewport',exact:true}).click();await page.getByRole('button',{name:'Add Tablet viewport',exact:true}).click();
    await page.getByRole('button',{name:'Edit app design',exact:true}).click();await page.getByRole('button',{name:'Finish editing app',exact:true}).waitFor();
    let frame=await(await page.locator('iframe[title="Live app preview"]').last().elementHandle()).contentFrame();await frame.waitForFunction(()=>document.getElementById('exact-inspect'),undefined,{polling:50});
    let loads=0;page.on('framenavigated',()=>loads++);
    const wait=async(fn:any,arg?:any)=>page.waitForFunction(fn,arg,{polling:50,timeout:10000});
    const commit=async(name:string,value:string)=>{const field=page.getByRole('textbox',{name,exact:true});await field.fill(value);await field.press('Tab');await wait(()=>!exact.state[0].find(s=>s.n.devName==='designWriting')());};
    const title=frame.locator('#exact-root').getByText('Room for your thoughts.',{exact:true});
    await title.click({force:true});
    await page.getByRole('textbox',{name:'Text content',exact:true}).waitFor();
    expect(await page.getByRole('textbox',{name:'Letter spacing',exact:true}).inputValue()).toBe('-1px');
    expect(await page.getByRole('textbox',{name:'Size',exact:true}).getAttribute('readonly')).not.toBeNull();
    const beforeLoads=loads;
    await commit('Text content','A calmer place to think.');
    await frame.getByText('A calmer place to think.',{exact:true}).waitFor();
    expect(loads).toBe(beforeLoads);
    // Background inspection must not pulse buttons or replace the field being edited.
    await page.getByRole('textbox',{name:'Text content',exact:true}).focus();
    await page.evaluate(()=>{
      const button=document.querySelector('[data-testid="apply-design"]');
      window.inspectorCheck={button,field:document.activeElement,disabled:0};
      window.inspectorCheck.observer=new MutationObserver(records=>{window.inspectorCheck.disabled+=records.filter(r=>r.attributeName==='disabled').length;});
      window.inspectorCheck.observer.observe(button,{attributes:true});
    });
    await page.waitForTimeout(2300);
    expect(await page.evaluate(()=>{const c=window.inspectorCheck;c.observer.disconnect();return {disabled:c.disabled,sameButton:c.button===document.querySelector('[data-testid="apply-design"]'),sameField:c.field===document.activeElement,connected:c.field.isConnected};})).toEqual({disabled:0,sameButton:true,sameField:true,connected:true});

    await page.getByRole('button',{name:'Undo draft change',exact:true}).click();
    await frame.getByText('Room for your thoughts.',{exact:true}).waitFor();
    await commit('Text content','A calmer place to think.');
    await frame.getByText('A calmer place to think.',{exact:true}).waitFor();
    expect(await readFile(resolve(app,'app.contract'),'utf8')).toContain('Room for your thoughts.');
    const oldSession=await page.evaluate(()=>exact.state[0].find(s=>s.n.devName==='designSession')());
    const {token}=await(await fetch('http://127.0.0.1:'+appPort+'/__tamber/token')).json();
    const registered=async()=> (await(await fetch('http://127.0.0.1:'+appPort+'/__tamber',{method:'POST',headers:{'content-type':'application/json','x-exact-tamber-token':token},body:JSON.stringify({method:'hello'})})).json()).ok.builds;
    const oldOwner=(await registered()).find(b=>b.inspector)?.inspector;
    // Reload while editing, with a pending draft and an active selection.
    await page.reload();
    await page.getByRole('button',{name:'Fit all screens',exact:true}).waitFor();
    // Previews sit under the loading veil until every one has rendered.
    await page.locator('[data-testid="canvas-loading"]').waitFor({state:'detached'});
    const editAgain=page.getByRole('button',{name:'Edit app design',exact:true});
    await editAgain.waitFor();await editAgain.click();
    await page.getByRole('button',{name:'Finish editing app',exact:true}).waitFor();
    frame=await(await page.locator('iframe[title="Live app preview"]').last().elementHandle()).contentFrame();
    await frame.getByText('A calmer place to think.',{exact:true}).waitFor();
    await frame.waitForFunction(()=>document.getElementById('exact-inspect'),undefined,{polling:50});
    const previews=await Promise.all((await page.locator('iframe[title="Live app preview"]').elementHandles()).map(async el=>await el.contentFrame()));
    const builds=await Promise.all(previews.map(async preview=>await preview.evaluate(()=>window.__exactDesignBuild)));
    expect(builds.every(Boolean)).toBe(true);expect(new Set(builds).size).toBe(builds.length);
    const newSession=await page.evaluate(()=>exact.state[0].find(s=>s.n.devName==='designSession')());
    expect(newSession).not.toBe(oldSession);
    // Restored inspector chrome can appear before the new client claims it.
    const readyBy=Date.now()+10000;
    for(;;){
      const active=(await registered()).filter(b=>builds.includes(b.id));
      if(active.length===builds.length&&active.every(b=>b.inspector&&b.inspector!==oldOwner))break;
      if(Date.now()>readyBy)throw new Error('Reloaded previews did not acquire the new inspector session.');
      await page.waitForTimeout(100);
    }
    // The old session can expire after its replacement has claimed the frames.
    const closed=await(await fetch(helperOrigin+'/design',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'close',session:oldSession})})).json();
    expect(closed.ok).toBe(true);
    await frame.getByText('A calmer place to think.',{exact:true}).click({force:true});
    await page.getByRole('textbox',{name:'Text content',exact:true}).waitFor({timeout:6000});
    expect(await page.getByRole('textbox',{name:'Text content',exact:true}).inputValue()).toBe('A calmer place to think.');

    await page.getByRole('button',{name:'Timeline',exact:true}).click();
    await page.getByRole('button',{name:/Change .*Edit text-content/}).last().click();
    expect(await page.locator('[data-testid="timeline-detail"]').innerText()).toContain('A calmer place to think.');
    await page.screenshot({path:resolve(root,'.exact/design-text-timeline.png')});
    await page.emulateMedia({colorScheme:'light'});
    await page.setViewportSize({width:780,height:900});
    await page.screenshot({path:resolve(root,'.exact/design-timeline-light-narrow.png')});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('[data-testid="timeline-detail"]').isVisible()).toBe(true);
    await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({colorScheme:'dark'});

    await page.getByRole('button',{name:'Close timeline',exact:true}).click();
    await page.locator('button[data-tip="card-1"]').first().click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="design-source"]')?.textContent==='app.contract:150',undefined,{polling:50});
    await page.getByRole('textbox',{name:'Border radius all',exact:true}).waitFor({timeout:6000});
    await commit('Padding all','12');
    await frame.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="card-1"]')).padding==='12px',undefined,{polling:50});
    await page.getByRole('button',{name:'Override Width',exact:true}).click();
    await commit('Width','360');
    await frame.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="card-1"]')).width==='360px',undefined,{polling:50});

    await page.getByRole('button',{name:'Unlink Border radius',exact:true}).click();
    await commit('Border radius Top left','28');
    await frame.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="card-1"]')).borderTopLeftRadius==='28px',undefined,{polling:50});
    expect(await frame.locator('[data-testid="card-1"]').evaluate(e=>getComputedStyle(e).borderTopRightRadius)).toBe('16px');
    await page.locator('[data-testid="spacing-padding-top"]').waitFor({timeout:6000});
    // Select the card's content container through the same native inspector gate.
    await frame.locator('[data-testid="card-1"] [data-site]').evaluateAll(async els=>{
      const el=els.find(e=>getComputedStyle(e).paddingTop==='20px'&&getComputedStyle(e).gap==='10px');
      const rect=el.getBoundingClientRect();
      const mask=document.createElement('style');el.id='test-content';mask.textContent='#test-content *{pointer-events:none!important}';document.head.append(mask);
      const inspector=await import('/__dev/inspect.js');
      for(const type of ['pointerdown','pointerup'])inspector.gate(new PointerEvent(type,{clientX:rect.left+rect.width/2,clientY:rect.top+10,button:0}));mask.remove();
    });
    await wait(()=>document.querySelector('[data-testid="design-source"]')?.textContent==='app.contract:153');
    await page.getByRole('textbox',{name:'Padding all',exact:true}).waitFor();
    await page.getByRole('button',{name:'Unlink Padding',exact:true}).click();await commit('Padding Left','32');
    await frame.waitForFunction(()=>getComputedStyle(document.getElementById('test-content')).paddingLeft==='32px',undefined,{polling:50});
    expect(await frame.locator('#test-content').evaluate(e=>getComputedStyle(e).paddingRight)).toBe('20px');
    await page.getByRole('button',{name:'Link Padding',exact:true}).click();await commit('Padding all','24');
    await frame.waitForFunction(()=>getComputedStyle(document.getElementById('test-content')).padding==='24px',undefined,{polling:50});
    await page.getByRole('button',{name:'Flow: Row',exact:true}).click();
    await frame.waitForFunction(()=>getComputedStyle(document.getElementById('test-content')).flexDirection==='row',undefined,{polling:50});
    await page.getByRole('button',{name:'Flow: Column',exact:true}).click();
    await frame.waitForFunction(()=>getComputedStyle(document.getElementById('test-content')).flexDirection==='column',undefined,{polling:50});
    await commit('Opacity','75%');
    await frame.waitForFunction(()=>getComputedStyle(document.getElementById('test-content')).opacity==='0.75',undefined,{polling:50});
    await page.getByRole('combobox',{name:'Add property',exact:true}).selectOption('flex-grow');
    await commit('Grow','1');
    await frame.waitForFunction(()=>getComputedStyle(document.getElementById('test-content')).flexGrow==='1',undefined,{polling:50});

    await page.screenshot({path:resolve(root,'.exact/design-spacing-inspector.png')});
    await page.getByRole('button',{name:'Apply to code',exact:true}).click();
    await page.getByRole('button',{name:'Apply to code',exact:true}).waitFor({state:'hidden'});
    const applied=await readFile(resolve(app,'app.contract'),'utf8');
    expect(applied).toContain('flex-grow=1');expect(applied).toContain('opacity=0.75');
    expect(applied).toContain('width=360');expect(applied).toMatch(/ padding=12(?:\s|$)/);
    expect(applied).toContain('A calmer place to think.');expect(applied).toContain('border-radius="28px 16px 16px 16px"');expect(applied).toContain('padding=24');
    await page.reload();await page.getByRole('button',{name:'Timeline',exact:true}).click();
    await page.getByRole('button',{name:/Change .*Apply to code/}).waitFor();
    await page.getByRole('button',{name:/Change .*Edit text-content/}).last().click();
    expect(await page.locator('[data-testid="timeline-detail"]').innerText()).toContain('A calmer place to think.');
    const textIcon=await page.getByRole('button',{name:/Change .*Edit text-content/}).last().locator('svg path').getAttribute('d');
    const spacingIcon=await page.getByRole('button',{name:/Change .*Edit padding/}).last().locator('svg path').getAttribute('d');
    expect(textIcon).not.toBe(spacingIcon);expect(spacingIcon?.length).toBeGreaterThan(10);
    expect(errors).toEqual([]);
  }catch(error){console.log(await page.locator("body").innerText());console.log("PAGE ERRORS",errors);console.log("FRAMES",await Promise.all(page.frames().map(f=>f.evaluate(()=>({url:location.href,build:window.__exactDesignBuild,inspect:!!document.getElementById("exact-inspect")})))));throw error;}finally{
    if(page)await page.context().close();if(suite)await suite.browser.close();
    await stopElementBridges();helper.stop(true);
    for(const child of children)child.kill('SIGTERM');await Promise.all(children.map(c=>c.exited));
    await rm(temp,{recursive:true,force:true});
  }
},60000);


// Exercise the pinned inspector through the same proxy and draft channel as live apps.
test('draft padding and gap changes refresh every outline when applied and removed',async()=>{
  const inspector=await readFile(resolve(import.meta.dir,'../.exact-sdk/host/web-js/inspect-dev.js'),'utf8');
  const app=Bun.serve({hostname:'127.0.0.1',port:0,fetch:req=>{
    if(new URL(req.url).pathname==='/__dev/inspect.js')return new Response(inspector,{headers:{'content-type':'text/javascript'}});
    return new Response('<html><head></head><body><div id="exact-root"><div data-site="1" style="display:flex;flex-direction:column;gap:12px;width:200px"><div data-site="2" style="padding:12px;width:176px"><div style="height:40px">First</div></div><div data-site="2" style="padding:12px;width:176px"><div style="height:40px">Second</div></div></div></div></body></html>',{headers:{'content-type':'text/html'}});
  }}),bridge=new ElementBridge(app.url.origin);
  let suite:any,page:any;
  try{
    suite=await suiteBrowser();page=await suite.newPage();
    await page.goto(bridge.origin+'/?__ed_frame=outline-test');
    await page.evaluate(async()=>{
      globalThis.exact={plan:'outline-plan'};
      const inspector=await import('/__dev/inspect.js');
      inspector.install({report:()=>{},facts:()=>({plan:'outline-plan'})});
      await inspector.frame({on:true,seq:1});
      await inspector.frame({kind:'outline',plan:'outline-plan',sites:[2]});
    });
    const aligned=()=>[...document.querySelectorAll('[data-exact-outline]')].every((mark,i)=>{
      const box=mark.getBoundingClientRect(),target=document.querySelectorAll('[data-site="2"]')[i].getBoundingClientRect();
      return ['x','y','width','height'].every(key=>Math.abs(box[key]-target[key])<0.1);
    });
    await page.waitForFunction(aligned);
    const end=Date.now()+5000;
    while(!bridge.frames.has('outline-test')){if(Date.now()>end)throw new Error('Preview did not register');await new Promise(r=>setTimeout(r,50));}
    let revision=0;
    for(const property of ['padding','gap']){
      bridge.preview([{plan:'outline-plan',site:property==='padding'?2:1,property,value:'36px'}],++revision);
      await page.waitForFunction(({property})=>getComputedStyle(document.querySelector('[data-site="'+(property==='padding'?2:1)+'"]'))[property]==='36px',{property});
      await page.waitForFunction(aligned,undefined,{timeout:3000});
      // Undo, revert and discard all send the remaining patch list, including [].
      bridge.preview([],++revision);
      await page.waitForFunction(({property})=>getComputedStyle(document.querySelector('[data-site="'+(property==='padding'?2:1)+'"]'))[property]==='12px',{property});
      await page.waitForFunction(aligned,undefined,{timeout:3000});
    }
    expect(await page.locator('[data-exact-outline]').count()).toBe(2);
  }finally{
    if(page)await page.context().close();if(suite)await suite.browser.close();
    bridge.server.stop(true);app.stop(true);
  }
},15000);
