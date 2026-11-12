import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,readdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startDiscoveryServer} from '../tools/discovery-server';
import {stopElementBridges} from '../tools/element-bridge';
import {suiteBrowser} from '../.exact-sdk/scripts/agent-launch.mjs';

// Two real Exact apps and a private helper keep this regression independent
// of the running editor, its project connection, and the user's saved data.
test('design inspector edits text, linked spacing and corners as drafts, with persistent history',async()=>{
  const root=resolve(import.meta.dir,'..');await mkdir(resolve(root,'.exact'),{recursive:true});
  const temp=await mkdtemp(resolve(root,'.exact/selection-reveal-')),editor=resolve(temp,'studio'),app=resolve(temp,'app');
  await mkdir(editor);await mkdir(app);await cp(resolve(root,'tools'),resolve(temp,'tools'),{recursive:true});
  for(const entry of await readdir(resolve(root,'studio'),{withFileTypes:true}))if(entry.isFile()&&!entry.name.includes('.test.')&&!entry.name.endsWith('.d.ts')&&/\.(ts|contract|json|tamber)$/.test(entry.name))await cp(resolve(root,'studio',entry.name),resolve(editor,entry.name));
  for(const name of ['assets','modules'])await cp(resolve(root,'studio',name),resolve(editor,name),{recursive:true});
  for(const name of ['app.contract','app.ts','app.tamber','app.json','assets'])await cp(resolve(root,'examples/responsive',name),resolve(app,name),{recursive:true});
  const helper=startDiscoveryServer(0),helperOrigin=helper.url.origin;
  await writeFile(resolve(editor,'app.ts'),(await readFile(resolve(editor,'app.ts'),'utf8')).replace("'http://127.0.0.1:5175'",JSON.stringify(helperOrigin)));
  const manifest=JSON.parse(await readFile(resolve(editor,'app.json'),'utf8'));delete manifest.commands;delete manifest.server;await writeFile(resolve(editor,'app.json'),JSON.stringify(manifest));
  const freePort=()=>{const s=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response()});const p=s.port;s.stop(true);return p;};
  const editorPort=freePort(),appPort=freePort(),children:any[]=[];
  const start=async(dir:string,name:string,port:number)=>{
    const launcher=resolve(temp,name+'.mjs');await writeFile(launcher,`import {run} from ${JSON.stringify(resolve(root,'.exact-sdk/scripts/app-cli.mjs'))};process.exit(await run({dir:${JSON.stringify(dir)},name:${JSON.stringify(name)},exact2:${JSON.stringify(resolve(root,'.exact-sdk'))},args:['web','--port','${port}']}));`);
    children.push(Bun.spawn([process.execPath,launcher],{cwd:root,env:{...process.env,PATH:'/Users/diegoarias/.cargo/bin:'+process.env.PATH,EXACT_FEEDBACK:'0',EXACT_TOOL_PORT:String(editorPort)},stdout:Bun.file(resolve(temp,name+'.log')),stderr:Bun.file(resolve(temp,name+'-errors.log'))}));
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
    await page.getByRole('button',{name:'Undo draft change',exact:true}).click();
    await frame.getByText('Room for your thoughts.',{exact:true}).waitFor();
    await commit('Text content','A calmer place to think.');
    await frame.getByText('A calmer place to think.',{exact:true}).waitFor();
    expect(await readFile(resolve(app,'app.contract'),'utf8')).toContain('Room for your thoughts.');
    await page.getByRole('button',{name:'Finish editing app',exact:true}).click();
    await page.reload();await page.getByRole('button',{name:'Edit app design',exact:true}).click();
    await page.getByRole('button',{name:'Finish editing app',exact:true}).waitFor();
    frame=await(await page.locator('iframe[title="Live app preview"]').last().elementHandle()).contentFrame();
    await frame.getByText('A calmer place to think.',{exact:true}).waitFor();

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
    await page.locator('button[title="card-1"]').first().click();
    await page.getByRole('textbox',{name:'Corner radius all',exact:true}).waitFor({timeout:6000});
    await page.getByRole('button',{name:'Unlink Corner radius',exact:true}).click();
    await commit('Corner radius Top left','28');
    await frame.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="card-1"]')).borderTopLeftRadius==='28px',undefined,{polling:50});
    expect(await frame.locator('[data-testid="card-1"]').evaluate(e=>getComputedStyle(e).borderTopRightRadius)).toBe('16px');
    // Select the card's content container through the same native inspector gate.
    await frame.locator('[data-testid="card-1"] [data-site]').evaluateAll(async els=>{
      const el=els.find(e=>getComputedStyle(e).paddingTop==='20px'&&getComputedStyle(e).gap==='10px');
      const rect=el.getBoundingClientRect();
      const mask=document.createElement('style');el.id='test-content';mask.textContent='#test-content *{pointer-events:none!important}';document.head.append(mask);
      const inspector=await import('/__dev/inspect.js');
      for(const type of ['pointerdown','pointerup'])inspector.gate(new PointerEvent(type,{clientX:rect.left+rect.width/2,clientY:rect.top+10,button:0}));mask.remove();
    });
    await page.getByRole('textbox',{name:'Padding all',exact:true}).waitFor();
    await page.getByRole('button',{name:'Unlink Padding',exact:true}).click();await commit('Padding Left','32');
    await frame.waitForFunction(()=>getComputedStyle(document.getElementById('test-content')).paddingLeft==='32px',undefined,{polling:50});
    expect(await frame.locator('#test-content').evaluate(e=>getComputedStyle(e).paddingRight)).toBe('20px');
    await page.getByRole('button',{name:'Link Padding',exact:true}).click();await commit('Padding all','24');
    await frame.waitForFunction(()=>getComputedStyle(document.getElementById('test-content')).padding==='24px',undefined,{polling:50});
    await page.screenshot({path:resolve(root,'.exact/design-spacing-inspector.png')});
    await page.getByRole('button',{name:'Apply to code',exact:true}).click();
    await page.getByRole('button',{name:'Apply to code',exact:true}).waitFor({state:'hidden'});
    const applied=await readFile(resolve(app,'app.contract'),'utf8');
    expect(applied).toContain('A calmer place to think.');expect(applied).toContain('border-radius="28px 16px 16px 16px"');expect(applied).toContain('padding=24');
    await page.reload();await page.getByRole('button',{name:'Timeline',exact:true}).click();
    await page.getByRole('button',{name:/Change .*Apply to code/}).waitFor();
    await page.getByRole('button',{name:/Change .*Edit text-content/}).last().click();
    expect(await page.locator('[data-testid="timeline-detail"]').innerText()).toContain('A calmer place to think.');
    expect(errors).toEqual([]);
  }catch(error){console.log(await page.locator("body").innerText());console.log("PAGE ERRORS",errors);console.log("FRAMES",await Promise.all(page.frames().map(f=>f.evaluate(()=>({url:location.href,build:window.__exactDesignBuild,inspect:!!document.getElementById("exact-inspect")})))));throw error;}finally{
    if(page)await page.context().close();if(suite)await suite.browser.close();
    await stopElementBridges();helper.stop(true);
    for(const child of children)child.kill('SIGTERM');await Promise.all(children.map(c=>c.exited));
    await rm(temp,{recursive:true,force:true});
  }
},60000);
