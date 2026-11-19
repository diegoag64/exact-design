import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,readdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {startDiscoveryServer} from '../tools/discovery-server';
import {stopElementBridges} from '../tools/element-bridge';
import {suiteBrowser} from '../.exact-sdk/scripts/agent-launch.mjs';

// Two copies of one app in two folders are two projects: identity follows the folder, not the port or the app's name.
// Two tabs of one browser share its storage, as two studio tabs do.
test('two tabs on two apps keep separate workspaces while both are edited, and each switches to the other intact',async()=>{
  const root=resolve(import.meta.dir,'..');await mkdir(resolve(root,'.exact'),{recursive:true});
  const temp=await mkdtemp(resolve(root,'.exact/project-tabs-')),editor=resolve(temp,'studio');
  await mkdir(editor);await cp(resolve(root,'tools'),resolve(temp,'tools'),{recursive:true});
  for(const entry of await readdir(resolve(root,'studio'),{withFileTypes:true}))if(entry.isFile()&&!entry.name.includes('.test.')&&!entry.name.endsWith('.d.ts')&&/\.(ts|contract|json|forma)$/.test(entry.name))await cp(resolve(root,'studio',entry.name),resolve(editor,entry.name));
  for(const name of ['assets','modules'])await cp(resolve(root,'studio',name),resolve(editor,name),{recursive:true});
  const apps=[resolve(temp,'alpha'),resolve(temp,'beta')];
  for(const app of apps){await mkdir(app);for(const name of ['app.contract','app.ts','app.forma','app.json','assets'])await cp(resolve(root,'fixtures/ember',name),resolve(app,name),{recursive:true});}
  const helper=startDiscoveryServer(0);
  await writeFile(resolve(editor,'app.ts'),(await readFile(resolve(editor,'app.ts'),'utf8')).replace("'http://127.0.0.1:5175'",JSON.stringify(helper.url.origin)));
  const manifest=JSON.parse(await readFile(resolve(editor,'app.json'),'utf8'));delete manifest.commands;delete manifest.server;await writeFile(resolve(editor,'app.json'),JSON.stringify(manifest));
  const freePort=()=>{const s=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response()});const p=s.port;s.stop(true);return p;};
  const editorPort=freePort(),ports=[freePort(),freePort()],children:any[]=[];
  const start=async(dir:string,name:string,port:number)=>{
    const launcher=resolve(temp,name+'.mjs');await writeFile(launcher,`import {run} from ${JSON.stringify(resolve(root,'.exact-sdk/scripts/app-cli.mjs'))};process.exit(await run({dir:${JSON.stringify(dir)},name:${JSON.stringify(name)},exact2:${JSON.stringify(resolve(root,'.exact-sdk'))},args:['web','--port','${port}']}));`);
    children.push(Bun.spawn([process.execPath,launcher],{cwd:root,env:{...process.env,PATH:resolve(homedir(),'.cargo/bin')+':'+process.env.PATH,EXACT_FEEDBACK:'0',EXACT_TOOL_PORT:String(editorPort)},stdout:Bun.file(resolve(temp,name+'.log')),stderr:Bun.file(resolve(temp,name+'-errors.log'))}));
    const end=Date.now()+40000;for(;;){try{if((await fetch('http://127.0.0.1:'+port)).ok)return;}catch{}if(Date.now()>end)throw new Error(name+' did not start: '+await Bun.file(resolve(temp,name+'-errors.log')).text());await new Promise(r=>setTimeout(r,100));}
  };
  let suite:any;const errors:string[]=[];
  try{
    await Promise.all([start(editor,'tabs-editor',editorPort),start(apps[0],'tabs-alpha',ports[0]),start(apps[1],'tabs-beta',ports[1])]);
    suite=await suiteBrowser();
    const context=await suite.newContext({viewport:{width:1440,height:1000}});
    const open=async(name:string,port:number)=>{
      const page=await context.newPage();
      page.on('pageerror',(e:Error)=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${editorPort}/?connect=http://127.0.0.1:${port}&name=${name}&viewports=Phone`,{waitUntil:'load'});
      await page.waitForFunction((n:string)=>document.querySelector('[data-testid="document-name"]')?.textContent===n&&new URL(location.href).searchParams.has('project'),name,{timeout:20000});
      return page;
    };
    const [alpha,beta]=[await open('Alpha',ports[0]),await open('Beta',ports[1])];
    const routes=(page:any)=>page.locator('[data-testid^="group-screen-"]').evaluateAll((rows:HTMLElement[])=>rows.map(r=>r.getAttribute('aria-label')));
    const alphaScreens=await routes(alpha);
    expect(alphaScreens.length).toBeGreaterThan(0);expect(await routes(beta)).toEqual(alphaScreens);
    expect(new URL(alpha.url()).searchParams.get('project')).not.toBe(new URL(beta.url()).searchParams.get('project'));
    // Both tabs resize their first frame at the same time.
    const resize=async(page:any,width:string)=>{
      await page.locator('[data-testid^="view-view-"]').first().click();
      const field=page.locator('[data-testid="frame-width"]');await field.fill(width);await field.press('Enter');
      // Saved once the sidebar row shows the new size: the field shows the typed value before the edit lands.
      await page.waitForFunction((w:string)=>document.querySelector('[data-testid^="view-view-"]')?.textContent?.includes(w+' ×'),width);
    };
    await Promise.all([resize(alpha,'512'),resize(beta,'640')]);
    await Promise.all([alpha.reload({waitUntil:'load'}),beta.reload({waitUntil:'load'})]);
    const shown=async(page:any)=>{
      await page.waitForFunction(()=>!!document.querySelector('[data-testid^="view-view-"]'));
      await page.locator('[data-testid^="view-view-"]').first().click();
      return {name:await page.locator('[data-testid="document-name"]').first().textContent(),width:await page.locator('[data-testid="frame-width"]').inputValue()};
    };
    expect(await shown(alpha)).toEqual({name:'Alpha',width:'512'});
    expect(await shown(beta)).toEqual({name:'Beta',width:'640'});
    // The Alpha tab switches to Beta from the project menu, sees the other tab's edit, and switches back to its own.
    const switchTo=async(page:any,name:string)=>{
      await page.getByRole('button',{name:'Projects',exact:true}).first().click();
      await page.getByRole('menuitemradio',{name:new RegExp('^'+name)}).click();
      await page.waitForFunction((n:string)=>document.querySelector('[data-testid="document-name"]')?.textContent===n,name);
    };
    await switchTo(alpha,'Beta');
    expect(await shown(alpha)).toEqual({name:'Beta',width:'640'});
    await switchTo(alpha,'Alpha');
    expect(await shown(alpha)).toEqual({name:'Alpha',width:'512'});
    expect(await alpha.locator('#project-menu [role="menuitemradio"]').count()).toBe(2);
    // The project menu follows the desktop menu keyboard model: it opens on the current project, and Escape returns
    // focus to the header that opened it.
    await alpha.getByRole('button',{name:'Projects',exact:true}).first().click();
    await alpha.waitForFunction(()=>document.activeElement?.getAttribute('aria-checked')==='true');
    expect(await alpha.evaluate(()=>document.activeElement?.textContent)).toContain('Alpha');
    await alpha.keyboard.press('ArrowDown');
    expect(await alpha.evaluate(()=>document.activeElement?.textContent)).toContain('Beta');
    await alpha.keyboard.press('Escape');
    await alpha.waitForFunction(()=>!document.querySelector('#project-menu:popover-open')&&document.activeElement?.getAttribute('aria-label')==='Projects');
    expect(errors).toEqual([]);
  }finally{await suite?.close();for(const child of children){child.kill('SIGTERM');await child.exited;}helper.stop(true);stopElementBridges();await rm(temp,{recursive:true,force:true});}
},180000);
