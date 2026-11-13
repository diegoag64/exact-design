import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,readdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {suiteBrowser} from '../.exact-sdk/scripts/agent-launch.mjs';

test('studio icons, context menus and canvas gestures share the desktop interaction model',async()=>{
  const root=resolve(import.meta.dir,'..');await mkdir(resolve(root,'.exact'),{recursive:true});
  const temp=await mkdtemp(resolve(root,'.exact/studio-ui-'));
  for(const e of await readdir(resolve(root,'studio'),{withFileTypes:true}))if(e.isFile()&&!e.name.includes('.test.')&&!e.name.endsWith('.d.ts')&&/\.(ts|contract|json|tamber)$/.test(e.name))await cp(resolve(root,'studio',e.name),resolve(temp,e.name));
  for(const name of ['assets','modules'])await cp(resolve(root,'studio',name),resolve(temp,name),{recursive:true});
  const manifest=JSON.parse(await readFile(resolve(temp,'app.json'),'utf8'));delete manifest.commands;delete manifest.server;await writeFile(resolve(temp,'app.json'),JSON.stringify(manifest));
  const probe=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response()});const port=probe.port;probe.stop(true);
  await writeFile(resolve(temp,'launch.mjs'),`import {run} from ${JSON.stringify(resolve(root,'.exact-sdk/scripts/app-cli.mjs'))};process.exit(await run({dir:${JSON.stringify(temp)},name:'studio-ui',exact2:${JSON.stringify(resolve(root,'.exact-sdk'))},args:['web','--port','${port}']}));`);
  const child=Bun.spawn([process.execPath,resolve(temp,'launch.mjs')],{cwd:root,env:{...process.env,PATH:resolve(homedir(),'.cargo/bin')+':'+process.env.PATH,EXACT_FEEDBACK:'0'},stdout:Bun.file(resolve(temp,'server.log')),stderr:Bun.file(resolve(temp,'errors.log'))});
  let suite:any,page:any;const errors:string[]=[];
  try{
    const end=Date.now()+25000;for(;;){try{if((await fetch('http://127.0.0.1:'+port)).ok)break;}catch{}if(Date.now()>end)throw Error(await Bun.file(resolve(temp,'errors.log')).text());await new Promise(r=>setTimeout(r,100));}
    suite=await suiteBrowser();page=await suite.newPage({viewport:{width:1440,height:1000},colorScheme:'dark'});page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+port,{waitUntil:'load'});
    const pan=page.getByRole('button',{name:'Pan',exact:true});await pan.waitFor();
    const camera=()=>page.evaluate(()=>Object.fromEntries(exact.state[0].filter(s=>['px','py','zoom'].includes(s.n.devName)).map(s=>[s.n.devName,s()])));
    for(const colorScheme of ['dark','light'] as const){
      await page.emulateMedia({colorScheme});
      const icons=await page.locator('button[aria-label="Pan"],button[aria-label="Select"],button[aria-label="Save"]').evaluateAll(buttons=>buttons.map(button=>{
        const svg=button.querySelector('svg'),path=svg.querySelector('path'),s=svg.getBoundingClientRect(),b=button.getBoundingClientRect();
        return {color:getComputedStyle(button).color,stroke:getComputedStyle(path).stroke,d:path.getAttribute('d'),dx:s.x+s.width/2-b.x-b.width/2,dy:s.y+s.height/2-b.y-b.height/2};
      }));
      expect(icons.length).toBe(3);for(const icon of icons){expect(icon.stroke).toBe(icon.color);expect(icon.stroke).not.toBe('rgb(0, 0, 0)');expect(icon.d.length).toBeGreaterThan(10);expect(icon.dx).toBeCloseTo(0,1);expect(icon.dy).toBeCloseTo(0,1);}
    }
    // Icon buttons show the studio tooltip (name, shortcut chip, details) instead of a native title.
    const tooltip=page.locator('#studio-tooltip');
    await pan.hover();await page.waitForSelector('#studio-tooltip:popover-open');
    expect(await tooltip.locator('.name').innerText()).toMatch(/^Pan\s+H$/);
    expect(await tooltip.locator('kbd').innerText()).toBe('H');
    expect(await tooltip.locator('.detail').count()).toBeGreaterThan(0);
    expect(await page.locator('button[title]').count()).toBe(0);
    await page.getByRole('button',{name:'Reduce preview effects',exact:true}).hover();await page.waitForFunction(()=>document.getElementById('studio-tooltip').innerText.startsWith('Reduce preview effects'));
    await page.mouse.down();expect(await tooltip.evaluate(el=>el.matches(':popover-open'))).toBe(false);await page.mouse.up();
    await page.getByRole('button',{name:'Reduce preview effects',exact:true}).click();
    // Focus restoration can enter another control while a popover is opening.
    // Keep the tooltip warm and reproduce that synchronous re-entry explicitly.
    await pan.hover();await page.waitForSelector('#studio-tooltip:popover-open');
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
      const tip=document.getElementById('studio-tooltip');
      const pan=document.querySelector('button[aria-label="Pan"]');
      const reduce=document.querySelector('button[aria-label="Reduce preview effects"]');
      tip.addEventListener('beforetoggle',()=>reduce.dispatchEvent(new PointerEvent('pointerover',{bubbles:true})),{once:true});
      pan.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));
    });
    await page.waitForFunction(()=>document.getElementById('studio-tooltip').matches(':popover-open')&&document.querySelector('#studio-tooltip .name').textContent==='Reduce preview effects');
    await page.keyboard.press('Escape');
    await page.mouse.move(800,700);
    const before=await camera();await page.keyboard.down('Space');await page.waitForFunction(()=>document.querySelector('button[aria-label="Pan"]').getAttribute('aria-pressed')==='true');
    await page.mouse.move(800,700);await page.mouse.down();await page.mouse.move(900,740,{steps:4});await page.keyboard.up('Space');
    expect(await pan.getAttribute('aria-pressed')).toBe('true');await page.mouse.up();
    await page.waitForFunction(()=>document.querySelector('button[aria-label="Select"]').getAttribute('aria-pressed')==='true');
    const after=await camera();expect(after.px-before.px).toBe(100);expect(after.py-before.py).toBe(40);
    await page.mouse.move(800,700);await page.mouse.down({button:'middle'});await page.mouse.move(830,750,{steps:4});await page.mouse.up({button:'middle'});
    const middle=await camera();expect(middle.px-after.px).toBe(30);expect(middle.py-after.py).toBe(50);expect(middle.zoom).toBe(before.zoom);
    // Camera transforms must move the frame without changing its layout box.
    const frameBox=page.locator('[data-testid^="frame-"]').first();
    const originalBox=await frameBox.boundingBox();
    await page.locator('[aria-label="Design canvas"]').dispatchEvent('wheel',{deltaX:24,deltaY:16});
    const movedBox=await frameBox.boundingBox();
    expect(movedBox.x-originalBox.x).toBeCloseTo(-24,1);
    expect(movedBox.y-originalBox.y).toBeCloseTo(-16,1);
    expect(movedBox.width).toBe(originalBox.width);
    expect(movedBox.height).toBe(originalBox.height);
    const layout=await frameBox.evaluate(el=>({left:getComputedStyle(el).left,top:getComputedStyle(el).top,translate:getComputedStyle(el).translate,willChange:getComputedStyle(el).willChange}));
    expect(layout.left).toBe('0px');expect(layout.top).toBe('0px');expect(layout.translate).not.toBe('none');
    expect(layout.willChange).toContain('translate');expect(layout.willChange).toContain('scale');
    await page.locator('[aria-label="Design canvas"]').dispatchEvent('wheel',{deltaX:-24,deltaY:-16});
    // Zooming scales the frame about its top-left corner without scaling its translation.
    const canvasBox=await page.locator('[aria-label="Design canvas"]').boundingBox(),stageBox=await page.locator('#canvas-stage').boundingBox();
    const pivot={clientX:canvasBox.x+canvasBox.width/2,clientY:canvasBox.y+canvasBox.height/2};
    const unzoomed=await camera(),unzoomedBox=await frameBox.boundingBox();
    await page.locator('[aria-label="Design canvas"]').dispatchEvent('wheel',{...pivot,ctrlKey:true,deltaY:-20});
    const zoomed=await camera(),zoomedBox=await frameBox.boundingBox();
    expect(zoomed.zoom/unzoomed.zoom).toBeCloseTo(1.1,5);
    expect(zoomedBox.width/unzoomedBox.width).toBeCloseTo(1.1,3);
    expect((zoomedBox.x-stageBox.x-zoomed.px)/zoomed.zoom).toBeCloseTo((unzoomedBox.x-stageBox.x-unzoomed.px)/unzoomed.zoom,1);
    expect((zoomedBox.y-stageBox.y-zoomed.py)/zoomed.zoom).toBeCloseTo((unzoomedBox.y-stageBox.y-unzoomed.py)/unzoomed.zoom,1);
    await page.locator('[aria-label="Design canvas"]').dispatchEvent('wheel',{...pivot,ctrlKey:true,deltaY:200*(1-1/1.1)});
    expect((await camera()).zoom).toBeCloseTo(unzoomed.zoom,5);
    const heading=page.getByRole('button',{name:'Heading',exact:true});await heading.click({button:'right'});
    const menu=page.getByRole('menu',{name:'Canvas actions'});await menu.waitFor();
    // Right-click selection is a data-source mutation. The menu can open before
    // its layer actions replace the previous frame selection's disabled actions.
    await page.waitForFunction(()=>{const item=document.getElementById('menu-delete');return item?.checkVisibility()&&!item.disabled;});
    await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='menuitem');
    await page.keyboard.press('End');expect(await page.evaluate(()=>document.activeElement.id)).toBe('menu-inspector');
    await page.keyboard.press('Home');expect(await page.evaluate(()=>document.activeElement.id)).toBe('menu-delete');
    await page.keyboard.press('ArrowDown');expect(await page.evaluate(()=>document.activeElement.id)).toBe('menu-tidy');
    await page.keyboard.press('ArrowDown');expect(await page.evaluate(()=>document.activeElement.id)).toBe('menu-fit');
    await page.keyboard.press('Escape');expect(await menu.isVisible()).toBe(false);expect(await heading.evaluate(el=>el===document.activeElement)).toBe(true);
    // Menu actions address the right-clicked row, not the previous selection.
    await page.getByRole('button',{name:'Description',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'Delete',exact:true}).click();
    await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).some(b=>b.getAttribute('aria-label')==='Description'));
    await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('button',{name:'Description',exact:true}).waitFor();
    // The menu stays inside the window even at the canvas's bottom right.
    await page.mouse.click(1170,990,{button:'right'});await menu.waitFor();const rect=await menu.boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(1440);expect(rect.y+rect.height).toBeLessThanOrEqual(1000);
    await page.mouse.click(800,800);expect(await menu.isVisible()).toBe(false);
    await heading.click();const text=page.getByRole('textbox',{name:'Text content',exact:true});await text.focus();await page.keyboard.press('Space');expect(await pan.getAttribute('aria-pressed')).toBe('false');
    await text.press('Escape');await page.mouse.click(800,800);await page.keyboard.press('Shift+Digit1');expect((await camera()).zoom).not.toBe(before.zoom);
    // Global canvas shortcuts must leave Preview and project sheets alone.
    await page.getByRole('button',{name:'Preview',exact:true}).click();
    await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.down('Space');
    expect(await page.locator('button[aria-label="Pan"]').getAttribute('aria-pressed')).toBe('false');await page.keyboard.up('Space');
    await page.getByRole('button',{name:'Close preview',exact:true}).click();
    await page.getByRole('button',{name:'New screen',exact:true}).click();
    await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.down('Space');
    expect(await page.locator('button[aria-label="Pan"]').getAttribute('aria-pressed')).toBe('false');await page.keyboard.up('Space');
    await page.getByRole('button',{name:'Close',exact:true}).click();
    // Eye toggles appear on row hover, hide frames from the canvas, and stay visible while hidden.
    const viewEye=page.locator('[data-testid="visibility-view-1"]'),screenEye=page.locator('[data-testid="visibility-screen-1"]'),frame=page.locator('[data-testid="frame-view-1"]');
    const opacity=(l:any)=>l.evaluate((el:Element)=>getComputedStyle(el).opacity);
    await page.mouse.move(800,800);await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="visibility-view-1"]')).opacity==='0');
    await page.locator('[data-testid="view-view-1"]').hover();await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="visibility-view-1"]')).opacity==='1');
    expect(await viewEye.getAttribute('aria-label')).toBe('Hide viewport');
    await viewEye.click();await frame.waitFor({state:'detached'});
    expect(await viewEye.getAttribute('aria-label')).toBe('Show viewport');
    expect(await screenEye.getAttribute('aria-label')).toBe('Show screen');
    await page.mouse.move(800,800);expect(await opacity(viewEye)).toBe('1');expect(await opacity(screenEye)).toBe('1');
    await screenEye.click();await frame.waitFor();
    expect(await viewEye.getAttribute('aria-label')).toBe('Hide viewport');
    await screenEye.click();await frame.waitFor({state:'detached'});
    await page.getByRole('button',{name:'Undo',exact:true}).click();await frame.waitFor();
    expect(errors).toEqual([]);
  }finally{await page?.context().close();await suite?.browser.close();child.kill('SIGTERM');await child.exited;await rm(temp,{recursive:true,force:true});}
},60000);

test('the native drawer loads screenshots cross origin beside a live web frame in both themes',async()=>{
  const root=resolve(import.meta.dir,'..');await mkdir(resolve(root,'.exact'),{recursive:true});
  const temp=await mkdtemp(resolve(root,'.exact/studio-ui-'));
  for(const e of await readdir(resolve(root,'studio'),{withFileTypes:true}))if(e.isFile()&&!e.name.includes('.test.')&&!e.name.endsWith('.d.ts')&&/\.(ts|contract|json|tamber)$/.test(e.name))await cp(resolve(root,'studio',e.name),resolve(temp,e.name));
  for(const name of ['assets','modules'])await cp(resolve(root,'studio',name),resolve(temp,name),{recursive:true});
  const fixture=await import('../tools/native-fixture');
  let failureMode: 'frame'|'job'|undefined;
  const helper=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async request=>{const headers={'access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'POST, GET, OPTIONS'};if(request.method==='OPTIONS')return new Response(null,{headers});const respond=(response:Response)=>{for(const [k,v]of Object.entries(headers))response.headers.set(k,v);return response;};const url=new URL(request.url);if(url.pathname.startsWith('/native/shot/'))return fixture.nativeShot(url.pathname.slice('/native/shot/'.length));if(url.pathname==='/native'){
    const body=await request.json();
    if(failureMode&&body.run){
      const error='Fixture refresh failed.';
      const frames=body.frames.map((f:any)=>({id:f.id,state:failureMode==='frame'?'error':'ready',shot:`${url.origin}/native/shot/375/667.png`,width:375,height:667,capturedAt:1794540000000,error:failureMode==='frame'?error:''}));
      let closed=false;
      const stream=new ReadableStream({start(controller){
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({state:'error',phase:'',message:error,error:failureMode==='job'?error:'',done:1,total:1,frames})}\n\n`));
        request.signal.addEventListener('abort',()=>{if(!closed){closed=true;controller.close();}},{once:true});
      },cancel(){closed=true;}});
      return respond(new Response(stream,{headers:{'content-type':'text/event-stream'}}));
    }
    return respond(fixture.nativeScreens(body,request));
  }if(url.pathname==='/discover')return respond(Response.json({routes:[{name:'Home',route:'/',pattern:'/'}],error:''}));return Response.json({});}});
  const appPath=resolve(temp,'app.ts');await writeFile(appPath,(await readFile(appPath,'utf8')).replaceAll('http://127.0.0.1:5175','http://127.0.0.1:'+helper.port));
  const manifest=JSON.parse(await readFile(resolve(temp,'app.json'),'utf8'));delete manifest.commands;delete manifest.server;await writeFile(resolve(temp,'app.json'),JSON.stringify(manifest));
  const probe=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response()});const port=probe.port;probe.stop(true);
  await writeFile(resolve(temp,'launch.mjs'),`import {run} from ${JSON.stringify(resolve(root,'.exact-sdk/scripts/app-cli.mjs'))};process.exit(await run({dir:${JSON.stringify(temp)},name:'studio-ui',exact2:${JSON.stringify(resolve(root,'.exact-sdk'))},args:['web','--port','${port}']}));`);
  const child=Bun.spawn([process.execPath,resolve(temp,'launch.mjs')],{cwd:root,env:{...process.env,PATH:resolve(homedir(),'.cargo/bin')+':'+process.env.PATH,EXACT_FEEDBACK:'0'},stdout:Bun.file(resolve(temp,'server.log')),stderr:Bun.file(resolve(temp,'errors.log'))});
  let suite:any,page:any;const errors:string[]=[];
  try{
    const end=Date.now()+25000;for(;;){try{if((await fetch('http://127.0.0.1:'+port)).ok)break;}catch{}if(Date.now()>end)throw Error(await Bun.file(resolve(temp,'errors.log')).text());await new Promise(r=>setTimeout(r,100));}
    suite=await suiteBrowser();page=await suite.newPage({viewport:{width:1440,height:1000},colorScheme:'dark'});page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+port+'/?connect=http://127.0.0.1:5176&name=Native&viewports=Phone',{waitUntil:'load'});
    await page.locator('[data-testid="toggle-native"]:not([disabled])').click({timeout:10000});
    const refresh=page.locator('[data-testid="native-refresh"]');await refresh.waitFor({timeout:10000});
    // The canvas keeps its editable web frame while the drawer is open.
    expect(await page.locator('[data-testid="frame-view-2"] iframe').count()).toBe(1);
    expect(await page.locator('[data-testid="frame-width"]').isDisabled()).toBe(false);
    await refresh.click();
    const shot=page.locator('[data-testid="native-shot"]');await shot.waitFor();
    for(const colorScheme of ['light','dark'] as const){
      await page.emulateMedia({colorScheme});
      await page.waitForFunction(()=>{const image=document.querySelector('[data-testid="native-shot"]') as HTMLImageElement;return image?.complete&&image.naturalWidth>0;});
      const geometry=await shot.evaluate((image:HTMLImageElement)=>{const box=image.getBoundingClientRect(),frame=image.parentElement!.getBoundingClientRect();return {width:image.naturalWidth,height:image.naturalHeight,src:image.src,boxWidth:box.width,boxHeight:box.height,frameWidth:frame.width,frameHeight:frame.height};});
      expect(geometry.width).toBe(402);expect(geometry.height).toBe(874);expect(geometry.src).toContain('http://127.0.0.1:'+helper.port+'/native/shot/');
      // The device frame keeps the simulator's aspect ratio (iPhone 17, 402 × 874) and fits inside the drawer.
      expect(geometry.frameWidth/geometry.frameHeight).toBeCloseTo(402/874,1);expect(geometry.boxWidth).toBeLessThanOrEqual(geometry.frameWidth+0.5);
      const drawer=await page.locator('[data-testid="native-drawer"]').boundingBox();expect(drawer!.width).toBeLessThanOrEqual(321);
    }
    // The only frame is current, so refreshing all captures nothing and says so.
    await page.locator('[data-testid="native-refresh-all"]:not([disabled])').click();
    await page.locator('[data-testid="native-progress"]',{hasText:'Native previews are up to date.'}).waitFor({timeout:5000});
    for(const failure of ['frame','job'] as const){
      failureMode=failure;
      await refresh.click();
      await page.locator('[data-testid="native-error"]').waitFor();
      expect(await page.locator('[data-testid="native-state"]').count()).toBe(0);
      const detail=page.locator('[data-testid="native-frame-error-detail"]');
      expect(await detail.isVisible()).toBe(true);
      expect(await detail.textContent()).toBe('Fixture refresh failed.');
      // The error occupies a compact chip rather than a frame-sized opaque panel.
      const chip=await page.locator('[data-testid="native-error"]').evaluate((text:HTMLElement)=>{const panel=text.parentElement!,frame=panel.parentElement!;return {panel:panel.getBoundingClientRect().height,frame:frame.getBoundingClientRect().height};});
      expect(chip.panel).toBeLessThan(chip.frame/2);
      failureMode=undefined;
      await refresh.click();
      await page.locator('[data-testid="native-error"]').waitFor({state:'detached'});
      await page.locator('[data-testid="native-refresh"]:not([disabled])').waitFor();
    }
    expect(errors).toEqual([]);
  }finally{await page?.context().close();await suite?.browser.close();child.kill('SIGTERM');await child.exited;helper.stop(true);await rm(temp,{recursive:true,force:true});}
},60000);
