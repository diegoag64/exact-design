import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,readdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startDiscoveryServer} from '../tools/discovery-server';
import {stopElementBridges} from '../tools/element-bridge';
import {suiteBrowser} from '../.exact-sdk/scripts/agent-launch.mjs';

// Two real Exact apps and a private helper keep this regression independent
// of the running editor, its project connection, and the user's saved data.
test('offscreen layer selections pan the camera without scrolling or resizing the canvas',async()=>{
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
    const frame=await(await page.locator('iframe[title="Live app preview"]').last().elementHandle()).contentFrame();await frame.waitForFunction(()=>document.getElementById('exact-inspect'),undefined,{polling:50});
    // Inspected app documents relay their context menu and middle drag to the studio.
    const title=frame.locator('#exact-root').getByText('Room for your thoughts.',{exact:true});
    // Pointer and tree hover share one source/instance across responsive copies.
    const previewFrames=await Promise.all((await page.locator('iframe[title="Live app preview"]').elementHandles()).map(async handle=>await handle.contentFrame()));
    for(const preview of previewFrames)await preview.waitForFunction(()=>document.getElementById('exact-inspect'),undefined,{polling:50});
    await page.getByRole('button',{name:'Fit all screens',exact:true}).click();
    // Previews drop backdrop blurs only below 15% zoom, and restore them above 18%.
    const probe=(expected:string)=>Promise.all(previewFrames.map(preview=>preview.waitForFunction(expected=>{
      let el=document.getElementById('detail-probe');
      if(!el){el=document.createElement('div');el.id='detail-probe';el.style.backdropFilter='blur(4px)';document.body.append(el);}
      return getComputedStyle(el).backdropFilter===expected;
    },expected,{polling:50,timeout:3000})));
    const frameScale=()=>page.evaluate(()=>parseFloat(document.querySelector('#canvas-stage > [data-testid^="frame-"]').style.scale));
    const zoomBy=(factor:number)=>page.locator('[aria-label="Design canvas"]').dispatchEvent('wheel',{ctrlKey:true,deltaY:(1-factor)/0.005});
    await probe('blur(4px)');
    while(await frameScale()>=0.16)await zoomBy(0.9);
    await probe('blur(4px)');
    while(await frameScale()>=0.15)await zoomBy(0.9);
    await probe('none');
    while(await frameScale()<=0.17)await zoomBy(1.05);
    await probe('none');
    await page.getByRole('button',{name:'Fit all screens',exact:true}).click();await probe('blur(4px)');
    for(const preview of previewFrames)await preview.evaluate(()=>document.getElementById('detail-probe')?.remove());
    const assertHover=async(text:string)=>{
      for(const preview of previewFrames){
        await preview.waitForFunction(text=>{
          const box=document.querySelector('[data-ed-hover]');
          const target=[...document.querySelectorAll('#exact-root [data-site]')].find(el=>!el.querySelector('[data-site]')&&el.textContent.trim()===text);
          if(!box||!target)return false;
          const a=box.getBoundingClientRect(),b=target.getBoundingClientRect();return Math.abs(a.left-b.left)<1&&Math.abs(a.top-b.top)<1&&Math.abs(a.width-b.width)<1;
        },text,{polling:50,timeout:5000});
      }
    };
    await title.hover({force:true});await assertHover('Room for your thoughts.');
    await frame.locator('#exact-root').getByText('Something worth making',{exact:true}).hover({force:true});await assertHover('Something worth making');
    const firstTitle=previewFrames[0].locator('#exact-root').getByText('Room for your thoughts.',{exact:true});
    await firstTitle.hover({force:true});await assertHover('Room for your thoughts.');
    await page.mouse.move(5,5);
    for(const preview of previewFrames)await preview.waitForFunction(()=>!document.querySelector('[data-ed-hover]'),undefined,{polling:50,timeout:3000});
    // A click also clears Exact's separate native hover box when the mouse leaves.
    await title.click({force:true});await page.mouse.move(5,5);
    for(const preview of previewFrames)expect(await preview.evaluate(()=>[...document.querySelectorAll('div[popover]')].filter(el=>el.style.outline.includes('solid')&&el.style.pointerEvents==='none'&&el.style.display!=='none').length)).toBe(0);
    await page.locator('button[title="Room for your thoughts."]').last().hover();await assertHover('Room for your thoughts.');
    await page.mouse.move(5,5);
    for(const preview of previewFrames)await preview.waitForFunction(()=>!document.querySelector('[data-ed-hover]'),undefined,{polling:50,timeout:3000});

    // Exact's inspection shield intentionally receives the physical pointer.
    await title.click({button:'right',force:true});
    const menu=page.getByRole('menu',{name:'Canvas actions'});await menu.waitFor();
    expect(await menu.getByRole('menuitem',{name:'Finish editing',exact:true}).isVisible()).toBe(true);
    expect(await menu.getByRole('menuitem',{name:'Delete',exact:true}).count()).toBe(0);
    await page.keyboard.press('Escape');expect(await menu.isVisible()).toBe(false);
    const camera=()=>page.evaluate(()=>Object.fromEntries(exact.state[0].filter(s=>['px','py'].includes(s.n.devName)).map(s=>[s.n.devName,s()])));
    const beforeDrag=await camera(),titleBox=await title.boundingBox();
    await page.mouse.move(titleBox.x+10,titleBox.y+10);await page.mouse.down({button:'middle'});await page.mouse.move(titleBox.x+30,titleBox.y+30,{steps:4});await page.mouse.up({button:'middle'});
    await page.waitForFunction(x=>Math.abs(exact.state[0].find(s=>s.n.devName==='px')()-x-20)<0.5,beforeDrag.px,{polling:50,timeout:5000});
    const afterDrag=await camera();expect(afterDrag.px-beforeDrag.px).toBeCloseTo(20,0);expect(afterDrag.py-beforeDrag.py).toBeCloseTo(20,0);
    await page.screenshot({path:resolve(root,'.exact/studio-design-system.png')});
    for(let i=0;i<6;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click();
    const snapshot=()=>page.evaluate(()=>{
      const stage=document.getElementById('canvas-stage'),canvas=document.querySelector('[aria-label="Design canvas"]'),pan=document.querySelector('button[aria-label="Pan"]');
      return {camera:Object.fromEntries(exact.state[0].filter(s=>['px','py','zoom'].includes(s.n.devName)).map(s=>[s.n.devName,s()])),scroll:[stage.scrollLeft,stage.scrollTop],stage:stage.getBoundingClientRect().toJSON(),canvas:canvas.getBoundingClientRect().toJSON(),tool:pan.getBoundingClientRect().toJSON(),frames:[...document.querySelectorAll('iframe[title="Live app preview"]')].map(f=>f.getBoundingClientRect().toJSON())};
    });
    const before=await snapshot();
    await page.locator('button[title="The beginning of an idea"]').last().click();
    await page.waitForFunction(y=>exact.state[0].find(s=>s.n.devName==='py')()!==y,before.camera.py,{polling:50});
    const after=await snapshot();expect(after.scroll).toEqual([0,0]);expect(after.canvas).toEqual(after.stage);expect(after.stage).toEqual(before.stage);expect(after.tool).toEqual(before.tool);expect(after.camera.zoom).toBe(before.camera.zoom);
    const dx=after.camera.px-before.camera.px,dy=after.camera.py-before.camera.py;
    for(let i=0;i<before.frames.length;i++){
      expect(after.frames[i].x-before.frames[i].x).toBeCloseTo(dx,0);expect(after.frames[i].y-before.frames[i].y).toBeCloseTo(dy,0);
      expect(after.frames[i].width).toBeCloseTo(before.frames[i].width,3);expect(after.frames[i].height).toBeCloseTo(before.frames[i].height,3);
    }
    const local=await frame.locator('#exact-root').getByText('The beginning of an idea',{exact:true}).last().evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};});
    const selectedFrame=after.frames.at(-1),scale=selectedFrame.height/local.height;
    expect(selectedFrame.top+local.top*scale).toBeGreaterThan(after.stage.top);expect(selectedFrame.top+local.bottom*scale).toBeLessThan(after.stage.bottom);
    // Clicking an already visible layer keeps the camera still.
    await page.locator('button[title="The beginning of an idea"]').last().click();await page.waitForTimeout(200);expect((await snapshot()).camera).toEqual(after.camera);
    // Inspector visibility must not determine whether the canvas can reveal a selection.
    await page.getByRole('button',{name:'Hide inspector',exact:true}).click();
    await page.locator('button[title="Screen"]').first().click();
    await page.waitForFunction(y=>exact.state[0].find(s=>s.n.devName==='py')()!==y,after.camera.py,{polling:50});
    const top=await snapshot();expect(top.scroll).toEqual([0,0]);expect(top.canvas).toEqual(top.stage);
    await page.getByRole('button',{name:'Fit all screens',exact:true}).click();
    const appFrames=()=>page.locator('#canvas-stage iframe').elementHandles();
    const panEveryScreen=async()=>{
      for(const iframe of await appFrames()){
        const bounds=await iframe.boundingBox(),before=await camera();
        await page.mouse.move(bounds.x+20,bounds.y+20);await page.mouse.wheel(0,30);
        await page.waitForFunction(y=>Math.abs(exact.state[0].find(s=>s.n.devName==='py')()-y+30)<0.5,before.py,{polling:50,timeout:3000});
      }
    };
    await panEveryScreen();
    // Exact can close its native inspector without ending the studio session.
    // This used to turn a screen into a wheel/Space dead zone.
    await frame.evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true})));
    expect(await frame.evaluate(()=>!!document.getElementById('exact-inspect'))).toBe(false);
    await panEveryScreen();
    // Start Space-drag with focus inside the now uninspected app frame.
    const box=await page.locator('#canvas-stage iframe').last().boundingBox();
    await page.mouse.click(box.x+20,box.y+20);await page.keyboard.down('Space');
    await page.waitForFunction(()=>document.querySelector('button[aria-label="Pan"]').getAttribute('aria-pressed')==='true',undefined,{polling:50,timeout:3000});
    const beforeSpace=await camera();
    await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+60,box.y+40,{steps:4});await page.mouse.up();await page.keyboard.up('Space');
    await page.waitForFunction(x=>Math.abs(exact.state[0].find(s=>s.n.devName==='px')()-x-40)<0.5,beforeSpace.px,{polling:50,timeout:3000});
    await page.waitForFunction(()=>document.querySelector('button[aria-label="Select"]').getAttribute('aria-pressed')==='true',undefined,{polling:50,timeout:3000});
    // Screen placement mode uses the same canvas behavior.
    await page.getByRole('button',{name:'Show inspector',exact:true}).click();
    const finish=page.getByRole('button',{name:'Finish editing app',exact:true});if(await finish.count())await finish.click();
    await page.getByRole('button',{name:'Fit all screens',exact:true}).click();await panEveryScreen();
    expect(errors).toEqual([]);
  }finally{
    await page?.context().close();await suite?.browser.close();helper.stop(true);stopElementBridges();
    for(const child of children)child.kill('SIGTERM');await Promise.all(children.map(c=>c.exited));await rm(temp,{recursive:true,force:true});
  }
},90000);
