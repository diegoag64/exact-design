import {test,expect,afterEach,beforeAll,afterAll} from 'bun:test';
import {ProjectStore,resolveConnection,projectFiles,REGISTRY_FILE,LEGACY_KEY,type ProjectRecord,type LiveApp} from './projects';
import {WORKSPACE_FILE} from './persistence';
import {LEGACY_DRAFTS_FILE} from './draft-storage';
import {LEGACY_HISTORY_FILE} from './design-history';
import {createWorkspace,WorkspaceEditor} from './workspace';

// Two apps, each identified by its folder, never by its port.
const LUMEN='app-'+'a'.repeat(24),TIDE='app-'+'b'.repeat(24);
type App={identity:string;name:string;routes:{name:string;route:string}[]};
const lumen:App={identity:LUMEN,name:'Lumen',routes:[{name:'Home',route:'/'},{name:'Activity',route:'/activity'}]};
const tide:App={identity:TIDE,name:'Tide',routes:[{name:'Spending',route:'/spending'},{name:'Savings',route:'/savings'}]};

function disk(){
  const files=new Map<string,string>();
  const fs:any={
    readFile:async(p:string)=>{if(!files.has(p))throw {code:'ENOENT'};return new TextEncoder().encode(files.get(p));},
    atomicWriteFile:async(p:string,b:Uint8Array)=>{await Promise.resolve();files.set(p,new TextDecoder().decode(b));},
    mkdir:async()=>{},
    readdir:async(dir:string)=>[...new Set([...files.keys()].filter(p=>p.startsWith(dir+'/')).map(p=>p.slice(dir.length+1).split('/')[0]))].sort(),
  };
  return {files,fs,storage:{fs}};
}
/** A fake studio helper: apps answer at addresses, and design requests are recorded. */
const helper={apps:new Map<string,App>(),design:[] as any[]};
const original=globalThis.fetch;
const fake=(async(input:any,init:any)=>{
  const url=new URL(String(input)),body=init?.body?JSON.parse(init.body):{};
  if(url.pathname==='/identify'){const app=helper.apps.get(body.url);return Response.json(app?{state:app.identity?'verified':'unverified',identity:app.identity,name:app.name,error:''}:{state:'offline',identity:'',name:'',error:'Couldn’t reach the app.'});}
  if(url.pathname==='/discover'){const app=helper.apps.get(body.url);return Response.json(app?{routes:app.routes,error:''}:{routes:[],error:'Couldn’t reach the project.'});}
  if(url.pathname==='/design'){
    helper.design.push(body);
    const draft=(value:string)=>JSON.stringify({patches:[{key:'k',binding:{file:'app.contract',line:3,col:5,property:'gap'},original:'8',value}]});
    if(body.op==='open')return Response.json({ok:true,error:'',session:`s-${helper.design.length}`,version:1,draftState:body.draftState||JSON.stringify({patches:[]})});
    if(body.op==='edit')return Response.json({ok:true,error:'',session:body.session,version:2,draftState:draft(String(body.value))});
    return Response.json({ok:true,error:'',session:body.session,version:3,draftState:JSON.stringify({patches:[]})});
  }
  throw new Error(`Unexpected request ${url}`);
}) as typeof fetch;
beforeAll(()=>{globalThis.fetch=fake;});
afterAll(()=>{globalThis.fetch=original;});
afterEach(()=>{helper.apps.clear();helper.design=[];});

let tabs=0;
/** A studio tab: its own copy of the data module, sharing the browser's storage. */
async function tab(storage:any){
  const page=await import(`./app.ts?tab=${++tabs}`);
  return (source:string,args:unknown[]):Promise<any>=>Promise.resolve(page.answer(source as any,args as any,{} as any,storage,{} as any));
}
const read=(d:ReturnType<typeof disk>,path:string)=>JSON.parse(d.files.get(path)!);
const workspaceOf=(d:ReturnType<typeof disk>,key:string)=>read(d,projectFiles(key).workspace).workspace;
let clock=1;
const setup=(call:any,key:string,name:string,url:string,show='',decision='',op='setup')=>call('library',[key,op,name,url,'Phone',show,decision,clock++]);
const connect=(call:any,key:string,name:string,url:string,decision='',op='connect')=>call('library',[key,op,name,url,'','',decision,clock++]);

test('the issue’s steps keep each app in its own workspace and reopen the first exactly as it was',async()=>{
  const d=disk(),call=await tab(d.storage);
  helper.apps.set('http://127.0.0.1:5177',lumen);helper.apps.set('http://127.0.0.1:5194',tide);
  const a=await setup(call,'','Lumen','http://127.0.0.1:5177','Home,Activity');
  expect(a.ok).toBe(true);
  const lumenDoc=await call('document',[a.project,1]);
  expect(lumenDoc.groups.map((g:any)=>g.name)).toEqual(['Home','Activity']);
  await call('edit',[a.project,'select',lumenDoc.views[0].id,'',0,0,clock++]);
  await call('edit',[a.project,'property','x','240',0,0,clock++]);
  const lumenSaved=d.files.get(projectFiles(a.project).workspace);

  const b=await setup(call,a.project,'Tide','http://127.0.0.1:5194');
  expect(b.ok).toBe(true);expect(b.project).not.toBe(a.project);
  const tideDoc=await call('document',[b.project,1]);
  expect(tideDoc.groups.map((g:any)=>g.name)).toEqual(['Spending','Savings']);
  expect(tideDoc.projectUrl).toBe('http://127.0.0.1:5194');

  // Step 3: A's link again, both as a link this browser already applied and as a fresh one.
  for(const op of ['open','setup']){
    const again=await setup(call,b.project,'Lumen','http://127.0.0.1:5177','Home,Activity','',op);
    expect(again.ok).toBe(true);expect(again.project).toBe(a.project);
    expect(d.files.get(projectFiles(a.project).workspace)).toBe(lumenSaved);
  }
  const reopened=await call('document',[a.project,1]);
  expect(reopened.groups.map((g:any)=>g.route)).toEqual(['/','/activity']);
  expect(reopened.views[0].x).toBe(240);
  expect(workspaceOf(d,b.project).screens.map((s:any)=>s.route)).toEqual(['/spending','/savings']);
  expect(reopened.projects.map((p:any)=>p.name)).toEqual(['Lumen','Tide']);
  expect(reopened.projects.find((p:any)=>p.current).key).toBe(a.project);
});

test('a reused port opens a separate workspace, pauses the old one, and its drafts never reach the new app',async()=>{
  const d=disk(),call=await tab(d.storage),url='http://127.0.0.1:5174';
  helper.apps.set(url,lumen);
  const a=await setup(call,'','Lumen',url);
  const doc=await call('document',[a.project,1]);
  const opened=await call('design',['open','',url+'/',0,doc.views[0].id,a.project,clock++]);
  expect(opened.ok).toBe(true);expect(helper.design.at(-1).identity).toBe(LUMEN);
  await call('design',['edit',opened.session,'',1,'0','24',clock++]);
  await call('design',['close',opened.session,'',0,'','',clock++]);
  const drafts=read(d,projectFiles(a.project).drafts).drafts;
  expect(Object.keys(drafts)).toEqual([LUMEN]);

  // Another app now answers at the same address.
  helper.apps.set(url,tide);
  const linked=await call('connection',[a.project,url,1]);
  expect(linked.state).toBe('mismatch');expect(linked.liveName).toBe('Tide');
  const paused=await call('document',[a.project,1]);
  expect(paused.connectionState).toBe('mismatch');expect(JSON.parse(paused.previewRequests)).toEqual([]);
  expect(paused.views.every((v:any)=>v.source===''&&v.previewSource==='')).toBe(true);
  const sent=helper.design.length;
  const refused=await call('design',['open','',url+'/',0,doc.views[0].id,a.project,clock++]);
  expect(refused.ok).toBe(false);expect(refused.error).toContain('different app');expect(helper.design.length).toBe(sent);

  const lumenSaved=d.files.get(projectFiles(a.project).workspace);
  // The link names Tide, but Lumen's project was at this address: the switch waits for the person (#35).
  const asked=await setup(call,a.project,'Tide',url);
  expect(asked.ok).toBe(false);expect(asked.choice).toBe(a.project);expect(asked.options).toBe('new');expect(asked.error).toContain('where “Lumen” ran before');
  expect(d.files.get(projectFiles(a.project).workspace)).toBe(lumenSaved);
  const b=await setup(call,a.project,'Tide',url,'','new');
  expect(b.project).not.toBe(a.project);
  expect(workspaceOf(d,b.project).screens.map((s:any)=>s.route)).toEqual(['/spending','/savings']);
  expect(workspaceOf(d,b.project).project.identity).toBe(TIDE);
  expect(d.files.get(projectFiles(a.project).workspace)).toBe(lumenSaved);
  const tideDoc=await call('document',[b.project,1]);
  const tideSession=await call('design',['open','',url+'/',0,tideDoc.views[0].id,b.project,clock++]);
  expect(tideSession.ok).toBe(true);expect(helper.design.at(-1)).toMatchObject({op:'open',identity:TIDE,draftState:''});

  // Lumen restarts on another port: the same workspace follows it, with its drafts.
  helper.apps.set('http://127.0.0.1:5180',lumen);
  const moved=await setup(call,b.project,'Lumen','http://127.0.0.1:5180','','','open');
  expect(moved.project).toBe(a.project);
  const movedDoc=await call('document',[a.project,1]);
  expect(movedDoc.projectUrl).toBe('http://127.0.0.1:5180');expect(movedDoc.views[0].source).toBe('http://127.0.0.1:5180/');
  await call('design',['open','','http://127.0.0.1:5180/',0,movedDoc.views[0].id,a.project,clock++]);
  expect(helper.design.at(-1).draftState).toBe(drafts[LUMEN]);
});

test('manual connect opens another app in its own workspace, follows a moved app, and asks before tying unverified work',async()=>{
  const d=disk(),call=await tab(d.storage);
  helper.apps.set('http://127.0.0.1:5177',lumen);helper.apps.set('http://127.0.0.1:5194',tide);
  const a=await connect(call,'','Lumen','http://127.0.0.1:5177');
  expect(read(d,REGISTRY_FILE).projects.length).toBe(1);
  await call('library',[a.project,'add','Home','/','Phone','','',clock++]);
  const lumenSaved=d.files.get(projectFiles(a.project).workspace);

  // Lumen's settings, with Tide's address: the person confirms, and Tide opens in its own workspace.
  const asked=await connect(call,a.project,'Lumen','http://127.0.0.1:5194');
  expect(asked.ok).toBe(false);expect(asked.options).toBe('new');expect(asked.error).toContain('not “Lumen”');
  const b=await connect(call,a.project,'Lumen','http://127.0.0.1:5194','new');
  expect(b.ok).toBe(true);expect(b.project).not.toBe(a.project);
  expect(workspaceOf(d,b.project).project).toEqual({name:'Lumen',url:'http://127.0.0.1:5194',identity:TIDE});
  expect(d.files.get(projectFiles(a.project).workspace)).toBe(lumenSaved);
  // Tide's settings, with Lumen's address, open Lumen's workspace, which keeps its own name.
  const back=await connect(call,b.project,'Tide','http://127.0.0.1:5177');
  expect(back.project).toBe(a.project);expect(workspaceOf(d,a.project).project.name).toBe('Lumen');
  expect((await connect(call,a.project,'Lumen again','http://127.0.0.1:5177','','new')).project).toBe(a.project);

  // Lumen moves to a new port: the address changes, the workspace stays.
  helper.apps.set('http://127.0.0.1:5300',lumen);
  expect((await connect(call,a.project,'Lumen','http://127.0.0.1:5300')).project).toBe(a.project);
  expect(workspaceOf(d,a.project).screens[1]).toMatchObject({route:'/'});
  expect((await call('document',[a.project,1])).views.at(-1).source).toBe('http://127.0.0.1:5300/');

  // Renaming the shown project saves the new name.
  expect((await connect(call,a.project,'Lumen Pro','http://127.0.0.1:5300')).project).toBe(a.project);
  expect(workspaceOf(d,a.project).project).toEqual({name:'Lumen Pro',url:'http://127.0.0.1:5300',identity:LUMEN});
  // Nothing answers at the new address, so it cannot be confirmed as Tide: the person chooses.
  const unsure=await connect(call,b.project,'Tide','http://127.0.0.1:6000');
  expect(unsure.ok).toBe(false);expect(unsure.choice).toBe(b.project);expect(workspaceOf(d,b.project).project.url).toBe('http://127.0.0.1:5194');
  const kept=await connect(call,b.project,'Tide','http://127.0.0.1:6000','adopt');
  expect(kept.project).toBe(b.project);expect(workspaceOf(d,b.project).project).toEqual({name:'Tide',url:'http://127.0.0.1:6000',identity:TIDE});
  const fresh=await connect(call,b.project,'Elsewhere','http://127.0.0.1:6001','new');
  expect(fresh.project).not.toBe(b.project);expect(workspaceOf(d,fresh.project).project).toEqual({name:'Elsewhere',url:'http://127.0.0.1:6001',identity:''});
});

function legacyDisk(){
  const d=disk(),editor=new WorkspaceEditor();
  editor.connectProject('Ember','http://127.0.0.1:5174');
  editor.addScreen('Today','/','Phone',true);editor.addView('Desktop');editor.move(40,80);
  const legacy={version:1,workspace:editor.document,active:editor.active,selected:editor.selected};
  d.files.set(WORKSPACE_FILE,JSON.stringify(legacy));
  d.files.set(LEGACY_DRAFTS_FILE,JSON.stringify({version:1,drafts:{'http://127.0.0.1:5174':'ember-draft','http://127.0.0.1:5176':'other-draft'}}));
  const entry=(id:string,project:string)=>({id,parent:'',time:'2026-11-01T10:00:00.000Z',actor:'user',kind:'draft',project,label:'Edit gap',target:'Card',changes:[],beforeState:'',afterState:''});
  d.files.set(LEGACY_HISTORY_FILE,JSON.stringify({version:1,entries:[entry('1',''),entry('2','http://127.0.0.1:5174'),entry('3','http://127.0.0.1:5176')]}));
  return {d,legacy,originals:new Map(d.files)};
}

test('saved single-workspace data migrates into projects without losing screens, layout, drafts or timeline',async()=>{
  const {d,legacy,originals}=legacyDisk();
  // Two tabs open the upgraded studio at once.
  const [one,two]=[new ProjectStore(),new ProjectStore()];
  await Promise.all([one.load(d.fs),two.load(d.fs)]);
  expect(one.records).toEqual(two.records);
  const other=one.records[1].key;expect(other).toMatch(/^p-legacy-[a-f\d]{16}$/);
  expect(one.records).toEqual([{key:LEGACY_KEY,name:'Ember',url:'http://127.0.0.1:5174',identity:''},{key:other,name:'127.0.0.1:5176',url:'http://127.0.0.1:5176',identity:''}]);
  expect(read(d,REGISTRY_FILE).last).toBe(LEGACY_KEY);
  const ws=await one.open(d.fs,LEGACY_KEY);
  expect(ws.editor.document).toEqual({...legacy.workspace,project:{...legacy.workspace.project,identity:''}});
  expect(ws.editor.active).toBe(legacy.active);expect(ws.editor.selected).toBe(legacy.selected);
  expect(read(d,projectFiles(LEGACY_KEY).drafts).drafts).toEqual({'origin:http://127.0.0.1:5174':'ember-draft'});
  expect(read(d,projectFiles(other).drafts).drafts).toEqual({'origin:http://127.0.0.1:5176':'other-draft'});
  expect(read(d,projectFiles(LEGACY_KEY).history).entries.map((e:any)=>e.id)).toEqual(['1','2']);
  expect(read(d,projectFiles(other).history).entries.map((e:any)=>e.id)).toEqual(['3']);
  for(const [path,text] of originals)expect(d.files.get(path)).toBe(text);
  // The list exists now, so a later load reads it rather than migrating again.
  d.files.set(WORKSPACE_FILE,'{"changed":true}');
  const later=new ProjectStore();await later.load(d.fs);expect(later.records.length).toBe(2);
  expect((await later.open(d.fs,LEGACY_KEY)).editor.document.screens.length).toBe(legacy.workspace.screens.length);
});

test('an unreadable earlier save is copied unchanged and opens paused, as before',async()=>{
  const d=disk();d.files.set(WORKSPACE_FILE,'{incomplete');d.files.set(LEGACY_DRAFTS_FILE,'not json');
  const store=new ProjectStore();await store.load(d.fs);
  expect(store.error).toContain('design-drafts.json');
  const ws=await store.open(d.fs,LEGACY_KEY);
  expect(ws.persistence.error).toContain('Could not open');
  expect(d.files.get(projectFiles(LEGACY_KEY).workspace)).toBe('{incomplete');
  expect(await ws.persistence.save(d.fs)).toBe(false);expect(d.files.get(LEGACY_DRAFTS_FILE)).toBe('not json');
});

test('migrated work is tied to a verified app only by choice, and its drafts follow that choice',async()=>{
  for(const decision of ['adopt','new']){
    const {d}=legacyDisk(),call=await tab(d.storage),url='http://127.0.0.1:5174';
    helper.apps.set(url,{...lumen,name:'Ember'});
    const shown=await call('document',['',1]);expect(shown.projectKey).toBe(LEGACY_KEY);
    expect((await call('connection',[LEGACY_KEY,url,1])).state).toBe('confirm');
    expect((await call('design',['open','',url+'/',0,shown.views[0].id,LEGACY_KEY,clock++])).error).toContain('Confirm');
    const asked=await setup(call,LEGACY_KEY,'Ember',url);
    expect(asked.ok).toBe(false);expect(asked.choice).toBe(LEGACY_KEY);expect(asked.error).toContain('can’t tell');
    expect(workspaceOf(d,LEGACY_KEY).project.identity).toBe('');
    const chosen=await setup(call,LEGACY_KEY,'Ember',url,'',decision);
    expect(chosen.ok).toBe(true);
    if(decision==='adopt'){
      expect(chosen.project).toBe(LEGACY_KEY);expect(workspaceOf(d,LEGACY_KEY).project.identity).toBe(LUMEN);
      expect(read(d,projectFiles(LEGACY_KEY).drafts).drafts).toEqual({[LUMEN]:'ember-draft'});
      expect((await call('connection',[LEGACY_KEY,url,2])).state).toBe('ok');
    }else{
      expect(chosen.project).not.toBe(LEGACY_KEY);expect(workspaceOf(d,LEGACY_KEY).project.identity).toBe('');
      expect(read(d,projectFiles(LEGACY_KEY).drafts).drafts).toEqual({'origin:http://127.0.0.1:5174':'ember-draft'});
      expect(workspaceOf(d,chosen.project).project.identity).toBe(LUMEN);
    }
  }
  // Confirming from the project's own notice does the same.
  const {d}=legacyDisk(),call=await tab(d.storage),url='http://127.0.0.1:5174';
  helper.apps.set(url,lumen);
  await call('document',['',1]);await call('connection',[LEGACY_KEY,url,1]);
  expect((await call('library',[LEGACY_KEY,'adopt','','','','','',clock++])).ok).toBe(true);
  expect(workspaceOf(d,LEGACY_KEY).project.identity).toBe(LUMEN);
  // An app that cannot say which it is reopens migrated work at its address only when the person chooses to; its drafts
  // stay with that address.
  const plain=legacyDisk();const callPlain=await tab(plain.d.storage);
  helper.apps.set(url,{identity:'',name:'',routes:lumen.routes});
  const unsure=await setup(callPlain,'','Ember',url,'','','open');
  expect(unsure.ok).toBe(false);expect(unsure.choice).toBe(LEGACY_KEY);expect(unsure.error).toContain('can’t confirm');
  const reopened=await setup(callPlain,'','Ember',url,'','adopt','open');
  expect(reopened.project).toBe(LEGACY_KEY);
  const doc=await callPlain('document',[LEGACY_KEY,1]);
  await callPlain('design',['open','',url+'/',0,doc.views[0].id,LEGACY_KEY,clock++]);
  expect(helper.design.at(-1)).toMatchObject({identity:'',draftState:'ember-draft'});
});

test('two tabs on different projects never overwrite each other’s workspace, drafts, timeline or project list',async()=>{
  const d=disk(),[first,second]=[await tab(d.storage),await tab(d.storage)];
  helper.apps.set('http://127.0.0.1:5177',lumen);helper.apps.set('http://127.0.0.1:5194',tide);
  // Both tabs start before either has listed a project.
  const [a,b]=await Promise.all([setup(first,'','Lumen','http://127.0.0.1:5177'),setup(second,'','Tide','http://127.0.0.1:5194')]);
  expect(a.ok&&b.ok).toBe(true);
  // Each fresh tab set up its own app, in its own workspace.
  const keys=[a.project,b.project];expect(new Set(keys).size).toBe(2);
  const [lumenKey,tideKey]=keys;
  const docs=await Promise.all([first('document',[lumenKey,1]),second('document',[tideKey,1])]);
  const edits=[];
  for(let i=0;i<6;i++){
    edits.push(first('edit',[lumenKey,'select',docs[0].views[0].id,'',0,0,clock++]).then(()=>first('edit',[lumenKey,'property','x',String(100+i),0,0,clock++])));
    edits.push(second('edit',[tideKey,'select',docs[1].views[0].id,'',0,0,clock++]).then(()=>second('edit',[tideKey,'property','y',String(300+i),0,0,clock++])));
  }
  const [s1,s2]=await Promise.all([first('design',['open','','http://127.0.0.1:5177/',0,docs[0].views[0].id,lumenKey,clock++]),second('design',['open','','http://127.0.0.1:5194/',0,docs[1].views[0].id,tideKey,clock++])]);
  await Promise.all([...edits,first('design',['edit',s1.session,'',1,'0','16',clock++]),second('design',['edit',s2.session,'',1,'0','32',clock++])]);
  const third=await tab(d.storage);
  const [lumenDoc,tideDoc]=await Promise.all([third('document',[lumenKey,1]),third('document',[tideKey,1])]);
  expect(lumenDoc.views[0].x).toBe(105);expect(tideDoc.views[0].y).toBe(305);
  expect(lumenDoc.groups.map((g:any)=>g.route)).toEqual(['/','/activity']);expect(tideDoc.groups.map((g:any)=>g.route)).toEqual(['/spending','/savings']);
  expect(read(d,REGISTRY_FILE).projects.filter((p:ProjectRecord)=>p.url).map((p:ProjectRecord)=>p.name).sort()).toEqual(['Lumen','Tide']);
  // The starters the two fresh tabs opened stay untouched and out of the project menu.
  expect(lumenDoc.projects.map((p:any)=>p.name).sort()).toEqual(['Lumen','Tide']);
  expect(Object.keys(read(d,projectFiles(lumenKey).drafts).drafts)).toEqual([LUMEN]);expect(Object.keys(read(d,projectFiles(tideKey).drafts).drafts)).toEqual([TIDE]);
  expect(read(d,projectFiles(lumenKey).drafts).drafts[LUMEN]).toContain('"16"');expect(read(d,projectFiles(tideKey).drafts).drafts[TIDE]).toContain('"32"');
  const timeline=(key:string)=>read(d,projectFiles(key).history).entries.map((e:any)=>e.project);
  expect(timeline(lumenKey).length).toBeGreaterThan(6);expect(timeline(tideKey).length).toBeGreaterThan(6);
  expect(new Set(timeline(lumenKey))).toEqual(new Set(['http://127.0.0.1:5177']));expect(new Set(timeline(tideKey))).toEqual(new Set(['http://127.0.0.1:5194']));
  expect((await third('history',[lumenKey])).entries.length).toBe(read(d,projectFiles(lumenKey).history).entries.length);
});

test('a tab with a stale project list still lists projects another tab added',async()=>{
  const d=disk(),store=new ProjectStore(()=>'p-one'),other=new ProjectStore(()=>'p-two');
  await Promise.all([store.load(d.fs),other.load(d.fs)]);
  await store.create(d.fs,undefined,e=>e.connectProject('One','http://127.0.0.1:5001'));
  await other.create(d.fs,undefined,e=>e.connectProject('Two','http://127.0.0.1:5002'));
  expect(read(d,REGISTRY_FILE).projects.map((p:ProjectRecord)=>p.key)).toEqual(['p-one','p-two']);
  await store.sync(d.fs);expect(store.records.map(r=>r.key)).toEqual(['p-one','p-two']);
});

test('late replies land in the project they were sent for, never the one the tab shows now',async()=>{
  const d=disk(),call=await tab(d.storage);
  helper.apps.set('http://127.0.0.1:5177',lumen);helper.apps.set('http://127.0.0.1:5194',tide);
  const a=await setup(call,'','Lumen','http://127.0.0.1:5177'),b=await setup(call,a.project,'Tide','http://127.0.0.1:5194');
  const lumenDoc=await call('document',[a.project,1]);
  const session=await call('design',['open','','http://127.0.0.1:5177/',0,lumenDoc.views[0].id,a.project,clock++]);
  // The tab switches to Tide; edits and draft changes queued for Lumen arrive afterwards.
  const tideBefore=d.files.get(projectFiles(b.project).workspace);
  await call('document',[b.project,1]);
  await call('edit',[a.project,'select',lumenDoc.views[0].id,'',0,0,clock++]);
  const late=await call('edit',[a.project,'property','x','999',0,0,clock++]);
  expect(late.project).toBe(a.project);
  const drafted=await call('design',['edit',session.session,'',1,'0','40',clock++]);
  expect(drafted.project).toBe(a.project);
  expect(workspaceOf(d,a.project).views[0].x).toBe(999);
  expect(d.files.get(projectFiles(b.project).workspace)).toBe(tideBefore);
  expect(read(d,projectFiles(a.project).drafts).drafts[LUMEN]).toContain('"40"');
  expect(d.files.has(projectFiles(b.project).drafts)).toBe(false);
  // A project this browser no longer lists is refused, not redirected to another one.
  for(const reply of [await call('edit',['p-gone','property','x','5',0,0,clock++]),await call('library',['p-gone','add','X','/x','Phone','','',clock++])]){
    expect(reply.ok).toBe(false);
  }
  expect(workspaceOf(d,b.project).views[0].x).not.toBe(5);
});

test('screens whose routes the app no longer serves are listed for removal instead of loading a missing page',async()=>{
  const d=disk(),call=await tab(d.storage),url='http://127.0.0.1:5177';
  helper.apps.set(url,{...lumen,routes:[...lumen.routes,{name:'Note',route:'/note/:id'}]});
  const a=await setup(call,'','Lumen',url);
  await call('library',[a.project,'add','Note 7','/note/7?tab=a','Phone','','',clock++]);
  helper.apps.set(url,{...lumen,routes:[{name:'Home',route:'/'}]});
  const found=await call('discover',[url,['/','/activity','/note/7?tab=a',''],1]);
  expect(found.missing).toEqual(['/activity','/note/7?tab=a']);
  const removed=await call('library',[a.project,'remove-missing','',found.missing.join(' '),'','','',clock++]);
  expect(removed.ok).toBe(true);
  expect(workspaceOf(d,a.project).screens.map((s:any)=>s.route)).toEqual(['/']);
  expect((await call('edit',[a.project,'undo','','',0,0,clock++])).ok).toBe(true);
  expect(workspaceOf(d,a.project).screens.map((s:any)=>s.route)).toEqual(['/','/activity','/note/7?tab=a']);
});

test('switching projects keeps each camera, and a fresh tab opens the project last opened',async()=>{
  const d=disk(),call=await tab(d.storage);
  helper.apps.set('http://127.0.0.1:5177',lumen);helper.apps.set('http://127.0.0.1:5194',tide);
  const a=await setup(call,'','Lumen','http://127.0.0.1:5177'),b=await setup(call,a.project,'Tide','http://127.0.0.1:5194');
  await call('camera',[a.project,-120,40,0.5,b.project]);
  expect((await call('document',[a.project,1])).cameraZoom).toBe(0.5);
  expect((await call('document',[b.project,1])).cameraZoom).toBe(0);
  const fresh=await tab(d.storage);
  expect((await fresh('document',['',1])).projectKey).toBe(b.project);
  const back=await fresh('document',[a.project,1]);
  expect([back.cameraX,back.cameraY,back.cameraZoom]).toEqual([-120,40,0.5]);
  // Cameras are not edits: no undo step and no timeline entry.
  expect(back.canUndo).toBe(false);
  await call('camera',[a.project,1e9,0,0.5,'']);expect((await fresh('document',[a.project,1])).cameraX).toBe(-120);
});

test('connection requests resolve by app identity, never by address alone',()=>{
  const at=(state:LiveApp['state'],identity='',name='')=>({state,identity,name}) as LiveApp;
  const records:ProjectRecord[]=[{key:'p-a',name:'A',url:'http://127.0.0.1:5174',identity:LUMEN},{key:'p-old',name:'Old',url:'http://127.0.0.1:5176',identity:''}];
  const empty={key:'p-start',name:'Untitled',url:'',identity:''};
  // The same app on any port opens its workspace; another app at A's port does not.
  expect(resolveConnection(records,null,'http://127.0.0.1:9000',at('verified',LUMEN),'setup','')).toEqual({kind:'open',key:'p-a',adopt:false});
  expect(resolveConnection(records,null,'http://127.0.0.1:5174',at('verified',TIDE),'setup','new')).toEqual({kind:'new'});
  // A setup link never reuses the current workspace, not even an untouched starter.
  expect(resolveConnection(records,empty,'http://127.0.0.1:5199',at('verified',TIDE),'setup','',true)).toEqual({kind:'new'});
  expect(resolveConnection(records,empty,'http://127.0.0.1:7000',at('verified',TIDE),'connect','',true)).toEqual({kind:'here',adopt:false});
  // Unverified saved work at the address waits for a choice.
  expect(resolveConnection(records,null,'http://127.0.0.1:5176',at('verified',TIDE),'setup','').kind).toBe('choose');
  expect(resolveConnection(records,null,'http://127.0.0.1:5176',at('verified',TIDE),'setup','adopt')).toEqual({kind:'open',key:'p-old',adopt:true});
  expect(resolveConnection(records,null,'http://127.0.0.1:5176',at('verified',TIDE),'setup','new')).toEqual({kind:'new'});
  // Nothing says which app runs there: saved work at the address reopens only by choice.
  expect(resolveConnection(records,null,'http://127.0.0.1:5176',at('offline'),'setup','').kind).toBe('choose');
  expect(resolveConnection(records,null,'http://127.0.0.1:5176',at('offline'),'setup','adopt')).toEqual({kind:'open',key:'p-old',adopt:false});
  expect(resolveConnection(records,null,'http://127.0.0.1:5199',at('offline'),'setup','')).toEqual({kind:'new'});
  expect(resolveConnection(records,null,'http://127.0.0.1:5174',at('unverified'),'setup','').kind).toBe('choose');
  expect(resolveConnection(records,records[0],'http://127.0.0.1:6000',at('offline'),'connect','').kind).toBe('choose');
  expect(resolveConnection(records,records[0],'http://127.0.0.1:6000',at('offline'),'connect','')).toMatchObject({options:['adopt','new']});
  // Unverified saved work moves to an address that cannot be verified only by choice; renaming in place needs none.
  expect(resolveConnection(records,records[1],'http://127.0.0.1:6000',at('offline'),'connect','').kind).toBe('choose');
  expect(resolveConnection(records,records[1],'http://127.0.0.1:6000',at('offline'),'connect','adopt')).toEqual({kind:'here',adopt:false});
  expect(resolveConnection(records,records[1],'http://127.0.0.1:5176',at('offline'),'connect','')).toEqual({kind:'here',adopt:false});
  expect(resolveConnection(records,records[0],'http://127.0.0.1:5174',at('verified',LUMEN),'connect','')).toEqual({kind:'open',key:'p-a',adopt:false});
  expect(resolveConnection(records,records[1],'http://127.0.0.1:6000',at('verified',TIDE),'connect','').kind).toBe('choose');
  expect(resolveConnection(records,records[0],'http://127.0.0.1:6000',at('verified',TIDE),'connect','')).toMatchObject({kind:'choose',options:['new']});
  expect(resolveConnection(records,records[0],'http://127.0.0.1:6000',at('verified',TIDE),'connect','new')).toEqual({kind:'new'});
  // Another verified app at a verified project's address asks before switching, and never offers to adopt.
  expect(resolveConnection(records,null,'http://127.0.0.1:5174',at('verified',TIDE),'setup','')).toMatchObject({kind:'choose',key:'p-a',options:['new']});
  // A known app always opens its own project, even when a new workspace was asked for.
  expect(resolveConnection(records,null,'http://127.0.0.1:9000',at('verified',LUMEN),'setup','new')).toEqual({kind:'open',key:'p-a',adopt:false});
  // An unconnected workspace that holds work is connected only by choice; the untouched starter needs none.
  const local={key:'p-local',name:'Sketch',url:'',identity:''};
  expect(resolveConnection(records,local,'http://127.0.0.1:7000',at('verified',TIDE),'connect','').kind).toBe('choose');
  expect(resolveConnection(records,local,'http://127.0.0.1:7000',at('offline'),'connect','').kind).toBe('choose');
  expect(resolveConnection(records,local,'http://127.0.0.1:7000',at('offline'),'connect','',true)).toEqual({kind:'here',adopt:false});
  expect(()=>resolveConnection(records,null,'javascript:alert(1)',at('offline'),'setup','')).toThrow();
});

test('project keys from addresses cannot name other files',async()=>{
  for(const key of ['../design','p-../../x','P-UP','p-a/b',''])expect(()=>projectFiles(key)).toThrow();
  const d=disk(),store=new ProjectStore();
  d.files.set(REGISTRY_FILE,JSON.stringify({version:1,projects:[{key:'../evil',name:'x',url:'',identity:''},{key:'p-ok',name:'Ok',url:'http://127.0.0.1:5174',identity:'not-an-id'},{key:'p-good',name:'Good',url:'',identity:''}],last:'../evil'}));
  d.files.set(projectFiles('p-good').workspace,JSON.stringify({version:1,workspace:{...createWorkspace(),name:'Good'},active:'view-1',selected:''}));
  d.files.set('app:/data/projects/..%2Fevil/workspace.json','{}');
  await store.load(d.fs);expect(store.records.map(r=>r.key)).toEqual(['p-good']);expect(store.last).toBe('');
  expect((await store.current(d.fs,'../evil')).key).toBe('p-good');
  expect(createWorkspace().project.identity).toBe('');
});

test('requests a fresh page sends at once share one starter workspace',async()=>{
  const d=disk(),call=await tab(d.storage);
  const docs=await Promise.all([call('document',['',1]),call('scene',['','',[],1]),call('document',['',2]),call('history',['']),call('savedDrafts',['p-none'])]);
  expect(new Set([docs[0].projectKey,docs[1].projectKey,docs[2].projectKey]).size).toBe(1);
  expect(read(d,REGISTRY_FILE).projects.length).toBe(1);
});

test('migrated drafts follow their project when its app is confirmed at a new port, and distinct origins stay apart',async()=>{
  const {d}=legacyDisk(),call=await tab(d.storage);
  helper.apps.set('http://127.0.0.1:5180',lumen);
  await call('document',['',1]);
  const asked=await connect(call,LEGACY_KEY,'Ember','http://127.0.0.1:5180');
  expect(asked.choice).toBe(LEGACY_KEY);expect(workspaceOf(d,LEGACY_KEY).project.url).toBe('http://127.0.0.1:5174');
  const adopted=await connect(call,LEGACY_KEY,'Ember','http://127.0.0.1:5180','adopt');
  expect(adopted.project).toBe(LEGACY_KEY);
  expect(workspaceOf(d,LEGACY_KEY).project).toEqual({name:'Ember',url:'http://127.0.0.1:5180',identity:LUMEN});
  expect(read(d,projectFiles(LEGACY_KEY).drafts).drafts).toEqual({[LUMEN]:'ember-draft'});
  const doc=await call('document',[LEGACY_KEY,1]);
  await call('design',['open','','http://127.0.0.1:5180/',0,doc.views[0].id,LEGACY_KEY,clock++]);
  expect(helper.design.at(-1)).toMatchObject({identity:LUMEN,draftState:'ember-draft'});
  // Origins that differ only in punctuation migrate into separate projects.
  const two=disk();
  two.files.set(LEGACY_DRAFTS_FILE,JSON.stringify({version:1,drafts:{'http://my-app:5174':'one','http://my.app:5174':'two'}}));
  const store=new ProjectStore();await store.load(two.fs);
  expect(store.records.map(r=>r.url).sort()).toEqual(['http://my-app:5174','http://my.app:5174']);
  expect(new Set(store.records.map(r=>r.key)).size).toBe(2);
  for(const r of store.records)expect(Object.values(read(two,projectFiles(r.key).drafts).drafts)).toEqual([r.url==='http://my-app:5174'?'one':'two']);
});

test('reopening an app’s link keeps the person’s layout and visibility, and the route list cannot change a paused project',async()=>{
  const d=disk(),call=await tab(d.storage),url='http://127.0.0.1:5177';
  helper.apps.set(url,lumen);helper.apps.set('http://127.0.0.1:5194',tide);
  const a=await setup(call,'','Lumen',url,'Home');
  const doc=await call('document',[a.project,1]);
  await call('edit',[a.project,'select',doc.views[0].id,'',0,0,clock++]);
  await call('edit',[a.project,'property','x','777',0,0,clock++]);
  await call('edit',[a.project,'show',doc.groups[1].id,'',0,0,clock++]);
  const saved=d.files.get(projectFiles(a.project).workspace);
  await setup(call,a.project,'Tide','http://127.0.0.1:5194');
  const again=await setup(call,a.project,'Lumen',url,'Home');
  expect(again.project).toBe(a.project);expect(again.fit).toBe(false);
  expect(d.files.get(projectFiles(a.project).workspace)).toBe(saved);
  // Tide now answers at Lumen's address: its routes may neither add nor remove Lumen's screens.
  helper.apps.set(url,{...tide,routes:[{name:'Home',route:'/'},{name:'Spending',route:'/spending'}]});
  for(const op of ['add-all','remove-missing']){
    const refused=await call('library',[a.project,op,'',op==='remove-missing'?'/activity':'','Phone','','',clock++]);
    expect(refused.ok).toBe(false);expect(refused.error).toContain('isn’t confirmed');
  }
  expect(d.files.get(projectFiles(a.project).workspace)).toBe(saved);
});

test('a tab returning to a project another tab edited works from that edit, not its older copy',async()=>{
  const d=disk(),[first,second]=[await tab(d.storage),await tab(d.storage)];
  helper.apps.set('http://127.0.0.1:5177',lumen);helper.apps.set('http://127.0.0.1:5194',tide);
  const a=await setup(first,'','Lumen','http://127.0.0.1:5177'),b=await setup(first,a.project,'Tide','http://127.0.0.1:5194');
  // The first tab has Tide cached and moves to Lumen; the second tab resizes Tide.
  await first('document',[b.project,1]);await first('camera',[b.project,0,0,1,a.project]);await first('document',[a.project,1]);
  const tideDoc=await second('document',[b.project,1]);
  await second('edit',[b.project,'select',tideDoc.views[0].id,'',0,0,clock++]);
  await second('edit',[b.project,'property','width','640',0,0,clock++]);
  // Back in the first tab, a camera save and an edit keep the second tab's resize.
  const back=await first('document',[b.project,1]);
  expect(back.views[0].width).toBe(640);
  await first('camera',[b.project,-10,-20,0.5,'']);
  await first('edit',[b.project,'select',back.views[1].id,'',0,0,clock++]);
  expect(workspaceOf(d,b.project).views[0].width).toBe(640);
  expect(read(d,projectFiles(b.project).workspace).camera).toEqual({x:-10,y:-20,zoom:0.5});
});

test('routes match as the router does, and a migration finishing late never replaces newer work',async()=>{
  const {routeServed}=await import('./discovery');
  expect(routeServed('/activity','/activity')).toBe(true);expect(routeServed('/activity/','/activity')).toBe(false);
  expect(routeServed('/note/7?tab=a#x','/note/:id')).toBe(true);expect(routeServed('/note/','/note/:id')).toBe(false);
  expect(routeServed('/files/a/b','/files/*path')).toBe(true);expect(routeServed('/','/')).toBe(true);expect(routeServed('/x','/')).toBe(false);
  const {d}=legacyDisk(),fast=new ProjectStore();await fast.load(d.fs);
  const ws=await fast.open(d.fs,LEGACY_KEY);ws.editor.addView('Desktop');await ws.persistence.save(d.fs);
  const newer=d.files.get(projectFiles(LEGACY_KEY).workspace);
  // A slow tab still sees no list when it starts, then writes after the fast tab saved.
  const slow=new ProjectStore(),read0=d.fs.readFile;let hide=true;
  d.fs.readFile=async(path:string)=>{if(hide&&path===REGISTRY_FILE)throw {code:'ENOENT'};return read0(path);};
  const loading=slow.load(d.fs);hide=false;await loading;d.fs.readFile=read0;
  expect(d.files.get(projectFiles(LEGACY_KEY).workspace)).toBe(newer);
});
