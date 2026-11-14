import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,readdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {startDiscoveryServer} from '../tools/discovery-server';
import {stopElementBridges} from '../tools/element-bridge';
import {suiteBrowser} from '../.exact-sdk/scripts/agent-launch.mjs';

// A private editor, helper and fixture app, as in design-editing.test.ts: number
// fields, Alt-hover distances, theme colours, the alignment grid and sizing modes.
test('precision editing: nudges, math, distances, theme colours, alignment and sizing',async()=>{
  const root=resolve(import.meta.dir,'..');await mkdir(resolve(root,'.exact'),{recursive:true});
  const temp=await mkdtemp(resolve(root,'.exact/precision-editing-')),editor=resolve(temp,'studio'),app=resolve(temp,'app');
  await mkdir(editor);await mkdir(app);await cp(resolve(root,'tools'),resolve(temp,'tools'),{recursive:true});
  for(const entry of await readdir(resolve(root,'studio'),{withFileTypes:true}))if(entry.isFile()&&!entry.name.includes('.test.')&&!entry.name.endsWith('.d.ts')&&/\.(ts|contract|json|tamber)$/.test(entry.name))await cp(resolve(root,'studio',entry.name),resolve(editor,entry.name));
  for(const name of ['assets','modules'])await cp(resolve(root,'studio',name),resolve(editor,name),{recursive:true});
  for(const name of ['app.contract','app.ts','app.tamber','app.json','assets'])await cp(resolve(root,'fixtures/ember',name),resolve(app,name),{recursive:true});
  // An AccentColor role: CSS also knows the name, as the system accent, so the preview must use the theme's value.
  await writeFile(resolve(app,'app.tamber'),(await readFile(resolve(app,'app.tamber'),'utf8')).replace('theme\n','theme\n  AccentColor = light-dark(#c8102e, #ff453a)\n'));
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
    await Promise.all([start(editor,'precision-editor',editorPort),start(app,'precision-app',appPort)]);
    suite=await suiteBrowser();page=await suite.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+editorPort,{waitUntil:'load'});
    await page.getByRole('button',{name:'Project connection',exact:true}).click();
    await page.getByRole('textbox',{name:'Project name',exact:true}).fill('Ember');await page.getByRole('textbox',{name:'Project URL',exact:true}).fill('http://127.0.0.1:'+appPort);await page.getByRole('button',{name:'Connect',exact:true}).click();
    await page.getByRole('button',{name:'Add screen',exact:true}).click();await page.getByRole('textbox',{name:'Screen name',exact:true}).fill('Library');await page.getByRole('textbox',{name:'Route',exact:true}).fill('/');await page.getByRole('button',{name:'Add screen',exact:true}).last().click();
    await page.getByRole('button',{name:'Edit app design',exact:true}).click();await page.getByRole('button',{name:'Finish editing app',exact:true}).waitFor();
    const frame=await(await page.locator('iframe[title="Live app preview"]').last().elementHandle()).contentFrame();await frame.waitForFunction(()=>document.getElementById('exact-inspect'),undefined,{polling:50});
    const wait=async(fn:any,arg?:any)=>page.waitForFunction(fn,arg,{polling:50,timeout:10000});
    const settled=()=>wait(()=>!exact.state[0].find((s:any)=>s.n.devName==='designWriting')());
    const drafts=async()=>{const text=await page.locator('[data-testid="draft-count"]').innerText().catch(()=>'0');return parseInt(text)||0;};
    const style=(text:string,property:string)=>frame.locator('#exact-root').getByText(text,{exact:true}).evaluate((el:Element,p:string)=>getComputedStyle(el).getPropertyValue(p),property);

    // Arrow keys step a length and keep its unit; the change applies once the keys go quiet.
    await frame.locator('#exact-root').getByText('Room for your thoughts.',{exact:true}).click({force:true});
    const spacing=page.getByRole('textbox',{name:'Letter spacing',exact:true});
    await spacing.waitFor();expect(await spacing.inputValue()).toBe('-1px');
    await spacing.focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');
    expect(await spacing.inputValue()).toBe('1px');
    await frame.waitForFunction(()=>getComputedStyle([...document.querySelectorAll('#exact-root *')].find(e=>e.textContent==='Room for your thoughts.')!).letterSpacing==='1px',undefined,{polling:50});
    await settled();expect(await drafts()).toBe(1);
    // The caret stays in the field after the draft update re-enables it.
    await wait(()=>document.activeElement?.getAttribute('aria-label')==='Letter spacing');
    await page.keyboard.press('Shift+ArrowDown');expect(await spacing.inputValue()).toBe('-9px');
    await frame.waitForFunction(()=>getComputedStyle([...document.querySelectorAll('#exact-root *')].find(e=>e.textContent==='Room for your thoughts.')!).letterSpacing==='-9px',undefined,{polling:50});
    await settled();
    // Prefix scrubbing preserves a negative letter spacing.
    const prefix=await spacing.locator('..').locator('[data-scrub]').boundingBox();
    await page.mouse.move(prefix!.x+prefix!.width/2,prefix!.y+prefix!.height/2);await page.mouse.down();
    await page.mouse.move(prefix!.x+prefix!.width/2-4,prefix!.y+prefix!.height/2,{steps:3});
    expect(await spacing.inputValue()).toBe('-11px');await page.mouse.up();
    await frame.waitForFunction(()=>getComputedStyle([...document.querySelectorAll('#exact-root *')].find(e=>e.textContent==='Room for your thoughts.')!).letterSpacing==='-11px',undefined,{polling:50});
    await settled();
    // Simple math evaluates on Enter.
    const lineHeight=page.getByRole('textbox',{name:'Line height',exact:true});
    expect(await lineHeight.getAttribute('data-nudge-min')).toBe('0');
    await lineHeight.fill('0');await lineHeight.press('ArrowDown');expect(await lineHeight.inputValue()).toBe('0');
    await lineHeight.fill('1+0.5');await lineHeight.press('Enter');
    await wait(()=>(document.querySelector('input[aria-label="Line height"]') as HTMLInputElement)?.value==='1.5');
    await settled();

    // Holding Alt over another element shows the distance to it instead of the spacing overlay.
    const subtitle=await frame.locator('#exact-root').getByText('Keep the things you don’t want to forget.',{exact:true}).boundingBox();
    const iframe=await page.locator('iframe[title="Live app preview"]').last().boundingBox();
    const scale=await page.locator('iframe[title="Live app preview"]').last().evaluate((el:HTMLIFrameElement)=>el.getBoundingClientRect().width/el.offsetWidth);
    const at={x:(subtitle!.x-iframe!.x)/scale+5,y:(subtitle!.y-iframe!.y)/scale+5};
    await frame.evaluate((p:{x:number;y:number})=>dispatchEvent(new PointerEvent('pointermove',{clientX:p.x,clientY:p.y,altKey:true,bubbles:true})),at);
    await page.locator('[data-testid="measure-target"]').waitFor({timeout:6000});
    const distance=await page.locator('[data-testid^="measure-measure-y"]').first().innerText();
    expect(distance).toBe('10');
    expect(await page.locator('[data-testid="spacing-box"]').count()).toBe(0);
    // Releasing Alt in the studio, without moving the pointer, clears the distances.
    await page.keyboard.down('Alt');await page.keyboard.up('Alt');
    await page.locator('[data-testid="measure-target"]').waitFor({state:'detached',timeout:6000});
    await page.locator('[data-testid="spacing-overlay"]').waitFor({state:'attached',timeout:6000});

    // Select the New note button: a flex container with a theme fill.
    await page.getByRole('button',{name:'Button: New note',exact:true}).click();
    await wait(()=>[...document.querySelectorAll('[aria-label="Fill"]')].some((e:any)=>e.value==='brand'));
    await page.locator('[data-testid="align-grid"]').waitFor({timeout:8000});
    await settled();
    const button=()=>frame.locator('[data-testid="create"]').evaluate((el:Element)=>{const s=getComputedStyle(el);return {justify:s.justifyContent,align:s.alignItems,background:s.backgroundColor,paddingLeft:s.paddingLeft,width:el.getBoundingClientRect().width};});
    const before=await button();
    // The grid follows the rendered row flow: centred vertically, packed at the start.
    await page.locator('[data-testid="align-1-0"][aria-pressed="true"]').waitFor({timeout:6000});
    // Flow reads the rendered direction when source leaves it unset.
    await page.locator('button[aria-label="Flow: Row"][aria-pressed="true"]').waitFor({timeout:6000});

    // One grid cell sets both axes as one draft change.
    const count=await drafts();
    await page.locator('[data-testid="align-2-2"]').click();
    await frame.waitForFunction(()=>{const s=getComputedStyle(document.querySelector('[data-testid="create"]')!);return s.justifyContent==='flex-end'&&s.alignItems==='flex-end';},undefined,{polling:50});
    await settled();expect(await drafts()).toBe(count+2);
    expect(await page.locator('[data-testid="align-2-2"]').getAttribute('aria-pressed')).toBe('true');
    await page.getByRole('button',{name:'Undo draft change',exact:true}).click();
    await frame.waitForFunction((b:any)=>{const s=getComputedStyle(document.querySelector('[data-testid="create"]')!);return s.justifyContent===b.justify&&s.alignItems===b.align;},before,{polling:50});
    await settled();expect(await drafts()).toBe(count);

    // Reversed flows mirror only the main axis, including the selected cell.
    for(const flow of ['row-reverse','column-reverse']){
      await frame.locator('[data-testid="create"]').evaluate((el:HTMLElement,f:string)=>el.style.flexDirection=f,flow);
      await page.locator(`button[aria-label="Flow: ${flow==='row-reverse'?'Row reversed':'Column reversed'}"][aria-pressed="true"]`).waitFor({timeout:6000});
      await page.locator('[data-testid="align-0-0"]').click();
      await frame.waitForFunction(()=>{const s=getComputedStyle(document.querySelector('[data-testid="create"]')!);return s.justifyContent==='flex-end'&&s.alignItems==='flex-start';},undefined,{polling:50});
      await settled();
      expect(await page.locator('[data-testid="align-0-0"]').getAttribute('aria-pressed')).toBe('true');
      await page.getByRole('button',{name:'Undo draft change',exact:true}).click();await settled();
    }
    await frame.locator('[data-testid="create"]').evaluate((el:HTMLElement)=>el.style.removeProperty('flex-direction'));

    // Theme colours: the fill shows its token's swatch and the picker lists the theme first.
    const swatch=page.locator('[data-testid="color-swatch-background-color"]');
    expect(await swatch.locator(':scope > *').first().evaluate((el:Element)=>getComputedStyle(el).backgroundColor)).toBe('rgb(41, 77, 158)');
    await swatch.click();
    await page.locator('[data-testid="color-picker"]').waitFor();
    expect(await page.locator('[data-testid="color-tokens"] button').count()).toBe(11);
    expect(await page.locator('[data-testid="color-token-brand"]').getAttribute('aria-pressed')).toBe('true');
    await page.locator('[data-testid="color-token-AccentColor"]').click();
    await frame.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="create"]')!).backgroundColor==='rgb(200, 16, 46)',undefined,{polling:50});
    await settled();
    await swatch.click();await page.locator('[data-testid="color-token-secondary"]').click();
    await frame.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="create"]')!).backgroundColor==='rgb(96, 106, 99)',undefined,{polling:50});
    await settled();
    expect(await page.locator('[data-testid="off-theme-background-color"]').count()).toBe(0);
    const fill=page.getByRole('textbox',{name:'Fill',exact:true});
    await fill.fill('#123456');await fill.press('Enter');await settled();
    await page.locator('[data-testid="off-theme-background-color"]').waitFor();

    // Sizing: the button hugs its content; Fixed starts from its measured width.
    const mode=page.locator('[data-testid="design-size-width"]');
    expect(await mode.inputValue()).toBe('hug');
    expect(parseFloat((await button()).paddingLeft)).toBeGreaterThan(0);
    expect(await frame.locator('[data-testid="create"]').evaluate((el:Element)=>getComputedStyle(el).boxSizing)).toBe('content-box');
    const widthBeforeFixed=(await button()).width;
    await mode.selectOption('fixed');await settled();
    await frame.waitForFunction((w:number)=>Math.abs(document.querySelector('[data-testid="create"]')!.getBoundingClientRect().width-w)<=1,widthBeforeFixed,{polling:50});
    expect(Math.abs((await button()).width-widthBeforeFixed)).toBeLessThanOrEqual(1);
    expect(await mode.inputValue()).toBe('fixed');

    // A ratio is not math: 16/9 stays as written.
    await page.getByRole('combobox',{name:'Add property',exact:true}).selectOption('aspect-ratio');await settled();
    const ratio=page.getByRole('textbox',{name:'Aspect ratio',exact:true});
    expect(await ratio.getAttribute('data-nudge')).toBe('off');
    await ratio.fill('16/9');await ratio.press('Enter');await settled();
    expect(await ratio.inputValue()).toBe('16/9');
    await frame.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="create"]')!).aspectRatio==='16 / 9',undefined,{polling:50});

    // Stretch and Baseline have no grid cell; they stay beside the grid.
    await page.locator('[data-testid="align-stretch"]').click();await settled();
    await frame.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="create"]')!).alignItems==='stretch',undefined,{polling:50});
    expect(await page.locator('[data-testid="align-stretch"]').getAttribute('aria-pressed')).toBe('true');

    // A drag whose release never reaches the studio (it lands over a preview) restores the field and stages nothing.
    const radius=page.getByRole('textbox',{name:'Border radius all',exact:true});
    await radius.evaluate((el:Element)=>el.scrollIntoView({block:'center'}));
    const radiusStart=await radius.inputValue(),draftsBefore=await drafts();
    const grip=(await radius.locator('xpath=preceding-sibling::*[1]').boundingBox())!;
    await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
    await page.mouse.move(grip.x+grip.width/2+20,grip.y+grip.height/2,{steps:4});
    expect(await radius.inputValue()).not.toBe(radiusStart);
    await page.evaluate(()=>dispatchEvent(new PointerEvent('pointermove',{pointerId:1,buttons:0,bubbles:true})));
    expect(await radius.inputValue()).toBe(radiusStart);
    await page.mouse.up();await page.waitForTimeout(600);await settled();
    expect(await radius.inputValue()).toBe(radiusStart);expect(await drafts()).toBe(draftsBefore);

    // Dragging a canvas spacing label adjusts it and applies on release.
    // Labels show once a segment is large enough on screen; zoom in to the selection.
    const label=page.locator('[data-testid="spacing-padding-left"]');
    for(let i=0;i<10&&!(await label.count());i++){await page.getByRole("button",{name:"Zoom in",exact:true}).click();await page.waitForTimeout(500);}
    await label.waitFor({timeout:6000});await label.scrollIntoViewIfNeeded();
    const box=(await label.boundingBox())!;
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+10,box.y+box.height/2,{steps:3});
    await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2,{steps:3});
    expect(await page.locator('[data-testid="spacing-value"]').inputValue()).toBe('24');
    await page.mouse.up();
    await frame.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="create"]')!).paddingLeft==='24px',undefined,{polling:50});
    await settled();
    await page.screenshot({path:resolve(root,'.exact/precision-editing.png')});
    expect(errors).toEqual([]);
  }catch(error){console.log('PAGE ERRORS',errors);if(page)await page.screenshot({path:resolve(root,'.exact/precision-editing-failure.png')}).catch(()=>{});throw error;}finally{
    if(page)await page.context().close();if(suite)await suite.browser.close();
    await stopElementBridges();helper.stop(true);
    for(const child of children)child.kill('SIGTERM');await Promise.all(children.map(c=>c.exited));
    await rm(temp,{recursive:true,force:true});
  }
},90000);
