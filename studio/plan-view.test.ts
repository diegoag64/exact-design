import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,readdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {startDiscoveryServer} from '../tools/discovery-server';
import {stopElementBridges} from '../tools/element-bridge';
import {suiteBrowser} from '../.exact-sdk/scripts/agent-launch.mjs';

// A real Exact app and a private helper keep this regression independent
// of the running editor, its project connection, and the user's saved data.
test('plan view draws previews as line plans, regions measure from the canvas and while editing, and appearance pins both themes',async()=>{
  const root=resolve(import.meta.dir,'..');await mkdir(resolve(root,'.exact'),{recursive:true});
  const temp=await mkdtemp(resolve(root,'.exact/plan-view-')),editor=resolve(temp,'studio'),app=resolve(temp,'app');
  await mkdir(editor);await mkdir(app);await cp(resolve(root,'tools'),resolve(temp,'tools'),{recursive:true});
  for(const entry of await readdir(resolve(root,'studio'),{withFileTypes:true}))if(entry.isFile()&&!entry.name.includes('.test.')&&!entry.name.endsWith('.d.ts')&&/\.(ts|contract|json|tamber)$/.test(entry.name))await cp(resolve(root,'studio',entry.name),resolve(editor,entry.name));
  for(const name of ['assets','modules'])await cp(resolve(root,'studio',name),resolve(editor,name),{recursive:true});
  for(const name of ['app.contract','app.ts','app.tamber','app.json','assets'])await cp(resolve(root,'fixtures/ember',name),resolve(app,name),{recursive:true});
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
    await Promise.all([start(editor,'plan-editor',editorPort),start(app,'plan-app',appPort)]);
    suite=await suiteBrowser();page=await suite.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});page.on('pageerror',(e:Error)=>errors.push(e.stack || e.message));
    await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://127.0.0.1:'+editorPort});
    await page.goto('http://127.0.0.1:'+editorPort,{waitUntil:'load'});
    await page.getByRole('button',{name:'Project connection',exact:true}).click();
    await page.getByRole('textbox',{name:'Project name',exact:true}).fill('Ember');await page.getByRole('textbox',{name:'Project URL',exact:true}).fill('http://127.0.0.1:'+appPort);await page.getByRole('button',{name:'Connect',exact:true}).click();
    await page.getByRole('button',{name:'Add screen',exact:true}).click();await page.getByRole('textbox',{name:'Screen name',exact:true}).fill('Library');await page.getByRole('textbox',{name:'Route',exact:true}).fill('/');await page.getByRole('button',{name:'Add screen',exact:true}).last().click();
    const iframe=page.locator('iframe[title="Live app preview"]').last();await iframe.waitFor();
    const frame=await(await iframe.elementHandle()).contentFrame();
    await frame.locator('#exact-root').getByText('Room for your thoughts.',{exact:true}).waitFor();
    const planView=()=>page.evaluate(()=>exact.state[0].find((s:any)=>s.n.devName==='planView')());
    const copyButton=frame.locator('#ed-plan text',{hasText:/^Copy$/});

    // The toolbar toggle draws the plan: the app paints nothing and keeps its layout underneath.
    const toggle=page.getByTestId('toggle-plan');
    expect(await toggle.getAttribute('aria-pressed')).toBe('false');
    await toggle.click();
    expect(await planView()).toBe(true);expect(await toggle.getAttribute('aria-pressed')).toBe('true');
    await frame.waitForFunction(()=>getComputedStyle(document.getElementById('exact-root')!).opacity==='0'&&document.querySelectorAll('#ed-plan svg path, #ed-plan svg rect').length>3,undefined,{polling:50,timeout:10000});
    const text=await frame.locator('#exact-root').getByText('Room for your thoughts.',{exact:true}).boundingBox();
    expect(text!.width).toBeGreaterThan(20);

    // Source SVGs retain group transforms, including their order and each shape's own transform.
    await frame.evaluate(()=>{
      const root=document.getElementById('exact-root')!;
      const add=(id:string,url:string,x:number)=>{
        const node=document.createElement('div');node.id=id;
        node.style.cssText=`position:fixed;left:${x}px;top:40px;width:24px;height:24px;background:black;mask-image:url("${url}")`;
        root.append(node);
      };
      const source=(id:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><rect data-plan-excluded="" width="24" height="24"/></defs><g transform="translate(12 12)" stroke="red"><g transform="scale(2)"><rect data-plan-shape="${id}" transform="translate(1 1)" width="3" height="4" style="fill:red;stroke:none"/></g></g></svg>`;
      add('plan-group-base64','data:image/svg+xml;base64,'+btoa(source('base64')),40);
      add('plan-group-encoded','data:image/svg+xml,'+encodeURIComponent(source('encoded')),80);
    });
    await frame.locator('#ed-plan [data-plan-shape="encoded"]').waitFor();
    for(const id of ['base64','encoded']){
      const geometry=await frame.evaluate((id:string)=>{
        const mask=document.getElementById('plan-group-'+id)!.getBoundingClientRect();
        const shape=document.querySelector(`#ed-plan [data-plan-shape="${id}"]`)!;
        const box=shape.getBoundingClientRect();
        return {x:box.x-mask.x,y:box.y-mask.y,w:box.width,h:box.height,fill:shape.getAttribute('fill'),stroke:shape.getAttribute('stroke'),style:shape.getAttribute('style')};
      },id);
      expect(geometry.x).toBeCloseTo(14,1);expect(geometry.y).toBeCloseTo(14,1);
      expect(geometry.w).toBeCloseTo(6,1);expect(geometry.h).toBeCloseTo(8,1);
      expect(geometry.fill).toBe('none');expect(geometry.stroke).toBe('var(--ink)');expect(geometry.style).toBeNull();
    }
    expect(await frame.locator('#ed-plan [data-plan-excluded]').count()).toBe(0);
    // A failed decode draws a placeholder and still reaches media later in the paint order, on every redraw.
    await frame.evaluate(()=>{
      const root=document.getElementById('exact-root')!;
      for(const [id,url] of [['bad-percent','data:image/svg+xml,%'],['bad-base64','data:image/svg+xml;base64,%%%'],['after-bad','data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle data-plan-after="" cx="12" cy="12" r="5"/></svg>')]]){
        const node=document.createElement('div');node.id='plan-'+id;
        node.style.cssText=`position:fixed;left:120px;top:80px;width:24px;height:24px;background:black;mask-image:url("${url}")`;
        root.append(node);
      }
    });
    await frame.locator('#ed-plan [data-plan-after]').waitFor({timeout:5000});
    await frame.evaluate(()=>document.getElementById('plan-after-bad')!.style.left='160px');
    await frame.waitForFunction(()=>document.querySelector('#ed-plan [data-plan-after]')?.parentElement?.getAttribute('x')==='160',undefined,{polling:50,timeout:5000});
    expect(errors).toEqual([]);
    await frame.evaluate(()=>{for(const id of ['group-base64','group-encoded','bad-percent','bad-base64','after-bad'])document.getElementById('plan-'+id)!.remove();});

    // Plan view's options: layout boxes outline the wrappers, readable text draws the app's words on their lines.
    const count=(selector:string)=>frame.locator(selector).count();
    expect(await count('#ed-plan [data-layout-box]')).toBe(0);expect(await count('#ed-plan text[data-app]')).toBe(0);
    await page.getByTestId('plan-options').click();
    const boxes=page.getByTestId('plan-boxes'),words=page.getByTestId('plan-text');
    await boxes.click();await words.click();
    expect(await boxes.getAttribute('aria-checked')).toBe('true');expect(await words.getAttribute('aria-checked')).toBe('true');
    await frame.waitForFunction(()=>document.querySelectorAll('#ed-plan [data-layout-box]').length>0&&[...document.querySelectorAll('#ed-plan text[data-app]')].map(n=>n.textContent).join(' ').includes('Room for your thoughts.'),undefined,{polling:50,timeout:5000});
    // A drawn line keeps the width the app laid it out at.
    const [line,drawn]=await frame.evaluate(()=>{
      const walk=document.createTreeWalker(document.getElementById('exact-root')!,NodeFilter.SHOW_TEXT);let node=walk.nextNode();
      while(node&&node.textContent!.trim()!=='Room for your thoughts.')node=walk.nextNode();
      const range=document.createRange();range.selectNodeContents(node!);
      const copy=[...document.querySelectorAll('#ed-plan text[data-app]')].find(n=>n.textContent==='Room for your thoughts.')!;
      return [range.getClientRects()[0],copy.getBoundingClientRect()].map(r=>({x:r.x,y:r.y+r.height/2,width:r.width}));
    });
    expect(Math.abs(drawn.width-line.width)).toBeLessThan(2);expect(Math.abs(drawn.x-line.x)).toBeLessThan(2);expect(Math.abs(drawn.y-line.y)).toBeLessThan(3);
    // An opacity-zero parent hides its whole subtree; the plan's hidden root does not.
    await frame.evaluate(()=>{
      const hidden=document.createElement('div');hidden.id='plan-opacity';hidden.style.cssText='position:fixed;left:20px;top:20px;width:240px;opacity:0;color:black';hidden.textContent='Hidden plan text';
      const child=document.createElement('div');child.style.cssText='border:1px solid black;opacity:1';child.textContent='Hidden child text';hidden.append(child);
      const visible=document.createElement('div');visible.id='plan-visible';visible.style.cssText='position:fixed;left:20px;top:100px;width:240px;color:black';visible.textContent='Visible plan text';
      document.getElementById('exact-root')!.append(hidden,visible);
    });
    const hiddenText=frame.locator('#ed-plan text[data-app]',{hasText:/Hidden (plan|child) text/});
    await frame.locator('#ed-plan text[data-app]',{hasText:'Visible plan text'}).waitFor();
    expect(await hiddenText.count()).toBe(0);
    await frame.evaluate(()=>document.getElementById('plan-opacity')!.style.opacity='1');
    await frame.waitForFunction(()=>[...document.querySelectorAll('#ed-plan text[data-app]')].filter(n=>/Hidden (plan|child) text/.test(n.textContent!)).length===2,undefined,{polling:50,timeout:5000});
    await frame.evaluate(()=>document.getElementById('plan-opacity')!.style.opacity='0.5');
    await frame.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    expect(await hiddenText.count()).toBe(2);
    await frame.evaluate(()=>document.getElementById('plan-opacity')!.style.opacity='0');
    await frame.waitForFunction(()=>![...document.querySelectorAll('#ed-plan text[data-app]')].some(n=>/Hidden (plan|child) text/.test(n.textContent!)),undefined,{polling:50,timeout:5000});
    await frame.evaluate(()=>{document.getElementById('plan-opacity')!.remove();document.getElementById('plan-visible')!.remove();});
    // The shortcuts switch them off again while the plan shows.
    await page.keyboard.press('Escape');await page.getByTestId('canvas-stage').focus();
    await page.keyboard.press('Shift+KeyB');await page.keyboard.press('Shift+KeyT');
    await frame.waitForFunction(()=>!document.querySelector('#ed-plan [data-layout-box], #ed-plan text[data-app]'),undefined,{polling:50,timeout:5000});
    expect(await boxes.getAttribute('aria-checked')).toBe('false');expect(await words.getAttribute('aria-checked')).toBe('false');

    // Shift-drag over a frame that does not take the pointer: the studio relays it, and the frame stays put.
    // A new screen settles its size as the preview reports it; measure once it holds still.
    const settled=async()=>{let last='';for(let i=0;i<60;i++){const now=JSON.stringify(await iframe.boundingBox());if(now===last)return JSON.parse(now);last=now;await page.waitForTimeout(250);}throw new Error('The frame kept moving');};
    const before=await settled();
    await page.keyboard.down('Shift');await page.mouse.move(before.x+8,before.y+8);await page.mouse.down();
    await page.mouse.move(before.x+before.width/2,before.y+before.height/3,{steps:5});await page.mouse.move(before.x+before.width-8,before.y+before.height/2,{steps:5});
    await page.mouse.up();await page.keyboard.up('Shift');
    await copyButton.waitFor({timeout:5000});
    await page.mouse.move(before.x-40,before.y+40,{steps:4});
    expect(await iframe.boundingBox()).toEqual(before);
    // Copy belongs to the region: the studio writes the spec and the frame is not selected or moved.
    const copy=await copyButton.boundingBox();await page.mouse.click(copy.x+copy.width/2,copy.y+copy.height/2);
    await frame.locator('#ed-plan text',{hasText:/^Copied$/}).waitFor({timeout:3000});
    const spec=await page.evaluate(()=>navigator.clipboard.readText());
    expect(spec).toMatch(/^Region \d+ × \d+ at \d+, \d+\n  /);
    expect(await iframe.boundingBox()).toEqual(before);
    // Escape clears it; Alt+A measures the whole screen under the pointer and toggles off again.
    await page.keyboard.press('Escape');await copyButton.waitFor({state:'detached',timeout:3000});
    await page.mouse.move(before.x+before.width/2,before.y+before.height/2);
    await page.keyboard.press('Alt+KeyA');await copyButton.waitFor({timeout:5000});
    const screen=await frame.evaluate(()=>`${document.documentElement.clientWidth} × ${document.documentElement.clientHeight}`);
    await frame.locator('#ed-plan text',{hasText:screen}).first().waitFor();
    await page.keyboard.press('Alt+KeyA');await copyButton.waitFor({state:'detached',timeout:3000});

    // While editing, the preview takes the pointer itself; a region does not select the element under it.
    await page.getByRole('button',{name:'Edit app design',exact:true}).click();await page.getByRole('button',{name:'Finish editing app',exact:true}).waitFor();
    await frame.waitForFunction(()=>document.getElementById('exact-inspect'),undefined,{polling:50});
    const empty=page.getByText('Select an element in a screen.',{exact:true});await empty.waitFor();
    const box=await iframe.boundingBox();
    await page.keyboard.down('Shift');await page.mouse.move(box.x+12,box.y+12);await page.mouse.down();
    await page.mouse.move(box.x+box.width-12,box.y+box.height/2,{steps:6});await page.mouse.up();await page.keyboard.up('Shift');
    await copyButton.waitFor({timeout:5000});
    await page.waitForTimeout(500);expect(await empty.isVisible()).toBe(true);
    await page.keyboard.press('Escape');await copyButton.waitFor({state:'detached',timeout:3000});

    // Appearance pins the studio and the screens separately; plan view follows the screens.
    const scheme=(target:any)=>target.evaluate(()=>[getComputedStyle(document.documentElement).colorScheme,(globalThis as any).exact?.systemScheme??null]);
    await page.getByRole('button',{name:'Finish editing app',exact:true}).click();await page.getByRole('button',{name:'Edit app design',exact:true}).waitFor();
    await page.getByTestId('appearance').click();await page.getByTestId('theme-studio-dark').click();await page.getByTestId('theme-screens-light').click();
    await page.waitForFunction(()=>getComputedStyle(document.documentElement).colorScheme==='dark');
    expect(await scheme(page)).toEqual(['dark','dark']);
    await frame.waitForFunction(()=>getComputedStyle(document.documentElement).colorScheme==='light'&&document.getElementById('ed-plan')?.dataset.scheme==='light',undefined,{polling:50,timeout:5000});
    expect(await scheme(frame)).toEqual(['light','light']);
    await page.getByTestId('theme-screens-dark').click();
    await frame.waitForFunction(()=>getComputedStyle(document.documentElement).colorScheme==='dark'&&document.getElementById('ed-plan')?.dataset.scheme==='dark',undefined,{polling:50,timeout:5000});
    await page.getByTestId('theme-studio-system').click();await page.getByTestId('theme-screens-system').click();await page.keyboard.press('Escape');
    await frame.waitForFunction(()=>!document.getElementById('ed-scheme-pin')&&document.getElementById('ed-plan')?.dataset.scheme==='light',undefined,{polling:50,timeout:5000});
    expect((await scheme(page))[1]).toBeNull();expect((await scheme(frame))[1]).toBeNull();
    // Turning plan view off restores the app's own painting.
    await toggle.click();expect(await planView()).toBe(false);
    await frame.waitForFunction(()=>getComputedStyle(document.getElementById('exact-root')!).opacity==='1'&&!document.getElementById('ed-plan')?.isConnected,undefined,{polling:50,timeout:5000});
    // With plan view off, clearing must reach the studio even when no redraw is pending.
    // With no element selected, the next Escape should finish editing, not clear a stale region.
    for(const clear of ['escape','all','tiny']){
      await page.getByRole('button',{name:'Edit app design',exact:true}).click();
      await page.getByRole('button',{name:'Finish editing app',exact:true}).waitFor();await empty.waitFor();
      const bounds=await iframe.boundingBox();
      await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
      await page.getByTestId('canvas-stage').focus();await page.keyboard.press('Alt+KeyA');
      await copyButton.waitFor({timeout:5000});
      await frame.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      if(clear==='tiny'){
        await page.keyboard.down('Shift');await page.mouse.down();
        await frame.locator('#ed-plan text',{hasText:'0 × 0'}).waitFor();
        await frame.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
        await page.mouse.up();await page.keyboard.up('Shift');
      }else await page.keyboard.press(clear==='all'?'Alt+KeyA':'Escape');
      await frame.locator('#ed-plan').waitFor({state:'detached',timeout:3000});
      // The preview's report reaches the studio as a message from another process, so let it land first.
      await page.waitForTimeout(300);
      await page.getByTestId('canvas-stage').focus();await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'Edit app design',exact:true}).waitFor({timeout:3000});
    }
    expect(errors).toEqual([]);
  }finally{
    await page?.context().close();await suite?.browser.close();helper.stop(true);stopElementBridges();
    for(const child of children)child.kill('SIGTERM');await Promise.all(children.map(c=>c.exited));await rm(temp,{recursive:true,force:true});
  }
},120000);
