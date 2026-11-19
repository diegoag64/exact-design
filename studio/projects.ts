import type {FileSystem} from './app.contract.d.ts';
import {WorkspaceEditor,createWorkspace,loadWorkspace} from './workspace';
import {WorkspacePersistence,WORKSPACE_FILE} from './persistence';
import {DraftStorage,LEGACY_DRAFTS_FILE,draftBucket} from './draft-storage';
import {DesignHistory,LEGACY_HISTORY_FILE,parseHistory,type HistoryEntry} from './design-history';
import {projectUrl,validIdentity} from './project';

/** Each project keeps its own workspace, drafts and timeline under `projects/<key>/`; `projects.json` lists them.
 *  A key names a workspace, not an app: apps are matched by their verified identity, and an address only says where an
 *  app runs now. Keys reach file paths, so they are checked before every use. */
export const REGISTRY_FILE='app:/data/projects.json';
export const PROJECTS_DIR='app:/data/projects';
/** The workspace migrated from the single `design.json` of earlier releases. */
export const LEGACY_KEY='p-legacy';
export const validKey=(value:unknown):value is string=>typeof value==='string'&&/^p-[a-z\d-]{1,48}$/.test(value);
export function projectFiles(key:string){
  if(!validKey(key))throw new Error('Unknown project.');
  const dir=`${PROJECTS_DIR}/${key}`;
  return {dir,workspace:`${dir}/workspace.json`,drafts:`${dir}/drafts.json`,history:`${dir}/history.json`};
}
export type ProjectRecord={key:string;name:string;url:string;identity:string};
/** What the helper found at an address (`tools/project-identity.ts`). */
export type LiveApp={state:'verified'|'unverified'|'offline';identity:string;name:string};

/** One project's editor and storage, held per page: switching away and back keeps its undo history. */
export class ProjectWorkspace {
  readonly editor=new WorkspaceEditor();
  readonly persistence:WorkspacePersistence;
  readonly drafts:DraftStorage;
  readonly history:DesignHistory;
  constructor(readonly key:string){
    const files=projectFiles(key);
    this.persistence=new WorkspacePersistence(this.editor,files.workspace);
    this.drafts=new DraftStorage(files.drafts);
    this.history=new DesignHistory(files.history);
  }
  get record():ProjectRecord{
    const d=this.editor.document,p=d.project;
    return {key:this.key,name:(p.name||d.name||'Untitled').slice(0,120),url:p.url,identity:p.identity??''};
  }
  load(fs:FileSystem){return this.persistence.load(fs);}
}

/** How a connection request maps onto workspaces.
 *  `open`: the app's own workspace. `here`: connect the current workspace (unconnected, untouched, or the person is editing
 *  this project's own address). `new`: a separate workspace. `choose`: existing work may or may not be this app, so the
 *  person decides (`adopt` it or start `new`) before anything is associated. */
export type Resolution={kind:'open';key:string;adopt:boolean}|{kind:'here';adopt:boolean}|{kind:'new'}|{kind:'choose';key:string;message:string};
export type Intent='setup'|'connect'|'new';

export function resolveConnection(records:ProjectRecord[],current:ProjectRecord|null,pristine:boolean,url:string,live:LiveApp,intent:Intent,decision:''|'adopt'|'new'):Resolution{
  const address=projectUrl(url);
  if(decision==='new')return {kind:'new'};
  const at=(r:ProjectRecord)=>r.url===address;
  const label=(r:ProjectRecord)=>`“${r.name}”`;
  if(live.state==='verified'){
    const own=records.find(r=>r.identity===live.identity);
    if(own)return {kind:'open',key:own.key,adopt:false};
    if(intent==='connect'&&current){
      if(!current.url)return {kind:'here',adopt:false};
      if(current.identity)return {kind:'new'};
      if(decision==='adopt')return {kind:'here',adopt:true};
      return {kind:'choose',key:current.key,message:`Exact Design can’t tell whether ${label(current)} was made with ${live.name||'this app'}. Its screens and drafts stay as they are until you choose.`};
    }
    // Work saved before identities were checked, at this address: it may be this app, or one that used the port before.
    const earlier=records.find(r=>at(r)&&!r.identity);
    if(earlier){
      if(decision==='adopt')return {kind:'open',key:earlier.key,adopt:true};
      return {kind:'choose',key:earlier.key,message:`Exact Design can’t tell whether ${label(earlier)} was made with ${live.name||'this app'}. Its screens and drafts stay as they are until you choose.`};
    }
    return pristine&&current&&!current.url?{kind:'here',adopt:false}:{kind:'new'};
  }
  // Nothing at the address says which app it is.
  if(intent==='connect'&&current){
    if(!current.url||!current.identity)return {kind:'here',adopt:false};
    if(decision==='adopt')return {kind:'here',adopt:false};
    return {kind:'choose',key:current.key,message:`Exact Design can’t confirm that the app at ${address} is ${label(current)}. Start it with its editing server, or choose how to continue.`};
  }
  const unverified=records.find(r=>at(r)&&!r.identity);
  if(unverified)return {kind:'open',key:unverified.key,adopt:false};
  const verified=records.find(at);
  if(verified){
    if(decision==='adopt')return {kind:'open',key:verified.key,adopt:false};
    return {kind:'choose',key:verified.key,message:`Exact Design can’t confirm that the app at ${address} is ${label(verified)}. Start it with its editing server, or choose how to continue.`};
  }
  return pristine&&current&&!current.url?{kind:'here',adopt:false}:{kind:'new'};
}

async function readText(fs:FileSystem,path:string){
  try{return new TextDecoder().decode(await fs.readFile(path));}
  catch(e){if((e as {code?:string}).code==='ENOENT')return undefined;throw e;}
}
function parseRegistry(text:string):{projects:ProjectRecord[];last:string}{
  const data=JSON.parse(text);
  if(data?.version!==1||!Array.isArray(data.projects))throw new Error('Could not read the project list.');
  const seen=new Set<string>();
  const projects=data.projects.filter((r:any)=>{
    if(!r||!validKey(r.key)||seen.has(r.key)||typeof r.name!=='string'||typeof r.url!=='string'||!validIdentity(r.identity))return false;
    if(r.url){try{if(projectUrl(r.url)!==r.url)return false;}catch{return false;}}
    seen.add(r.key);return true;
  }).map((r:any)=>({key:r.key,name:r.name.slice(0,120),url:r.url,identity:r.identity}));
  return {projects,last:validKey(data.last)?data.last:''};
}
/** A key for drafts or a timeline saved for an origin other than the migrated workspace's. */
const originKey=(origin:string)=>`${LEGACY_KEY}-${origin.replace(/^https?:\/\//,'').replace(/[^a-z\d]+/g,'-').replace(/^-|-$/g,'')}`.slice(0,50);

/** The project list and every workspace this page has opened. Other tabs may add projects at any time, so the list is
 *  read again before each write and merged by key; nothing is ever removed from it here. */
export class ProjectStore {
  records:ProjectRecord[]=[];
  last='';
  /** Set when an earlier release's file could not be migrated; that file is left unchanged. */
  error='';
  readonly workspaces=new Map<string,ProjectWorkspace>();
  private loading?:Promise<void>;
  private writes:Promise<unknown>=Promise.resolve();
  constructor(private readonly makeKey:()=>string=()=>`p-${crypto.randomUUID().slice(0,8)}`){}
  load(fs:FileSystem){return this.loading??=this.restore(fs).catch(e=>{this.loading=undefined;throw e;});}
  private async restore(fs:FileSystem){
    const text=await readText(fs,REGISTRY_FILE);
    if(text===undefined)await this.migrate(fs);
    if(await this.collect(fs))await this.writeList(fs);
  }
  /** Picks up projects other tabs added since this page last read the list. */
  async sync(fs:FileSystem){
    await this.load(fs);
    if(await this.collect(fs))await this.writeList(fs);
  }
  /** The list file is an index: a project's folder is what makes it exist, and its workspace file says its name, address
   *  and identity. Two tabs that add or change projects at the same moment can each write the list without the other's
   *  change, so the list is rebuilt from the folders, with the list's order. Returns whether the list on disk lacks a
   *  project, so the caller writes it again. */
  private async collect(fs:FileSystem){
    let listed:ProjectRecord[]=[],last='';
    const text=await readText(fs,REGISTRY_FILE).catch(e=>{if((e as {code?:string}).code==='bake')throw e;return undefined;});
    if(text!==undefined){try{const registry=parseRegistry(text);listed=registry.projects;last=registry.last;}catch{/* Rebuilt from the folders below. */}}
    let folders:string[]|undefined;
    try{folders=(await fs.readdir(PROJECTS_DIR)).filter(validKey).sort();}catch(e){if((e as {code?:string}).code==='bake')throw e;}
    const known=folders??listed.map(r=>r.key);
    const keys=[...new Set([...listed.map(r=>r.key).filter(k=>known.includes(k)),...known,...this.workspaces.keys()])];
    const records:ProjectRecord[]=[];
    for(const key of keys){
      const record=this.workspaces.get(key)?.record??await this.folderRecord(fs,key)??listed.find(r=>r.key===key);
      if(record)records.push(record);
    }
    this.records=records;
    if(last&&this.find(last))this.last=last;
    return records.some(r=>!listed.some(l=>l.key===r.key));
  }
  private stamps=new Map<string,{stamp:string;record:ProjectRecord|undefined}>();
  private async folderRecord(fs:FileSystem,key:string):Promise<ProjectRecord|undefined>{
    const path=projectFiles(key).workspace;
    let stamp='';
    try{const st:any=await fs.stat(path);stamp=`${st.modifiedMs??st.mtimeMs??''}:${st.size??''}`;}catch{/* Read it below. */}
    const cached=this.stamps.get(key);
    if(stamp&&cached?.stamp===stamp)return cached.record;
    let record:ProjectRecord|undefined;
    try{
      const text=await readText(fs,path);
      if(text!==undefined){
        const value=JSON.parse(text),d=loadWorkspace(value?.workspace!==undefined?value.workspace:value);
        record={key,name:(d.project.name||d.name||'Untitled').slice(0,120),url:d.project.url,identity:d.project.identity??''};
      }
    }catch{/* An unreadable workspace keeps the list's entry. */}
    if(stamp)this.stamps.set(key,{stamp,record});
    return record;
  }
  private writeList(fs:FileSystem){
    const write=this.writes.catch(()=>{}).then(()=>fs.atomicWriteFile(REGISTRY_FILE,new TextEncoder().encode(JSON.stringify({version:1,projects:this.records,last:this.last}))));
    this.writes=write;return write;
  }
  find(key:string){return this.records.find(r=>r.key===key);}
  /** The workspace a page shows for `key`: that project when it exists, else the last opened one, else a starter. */
  async current(fs:FileSystem,key:string):Promise<ProjectWorkspace>{
    await this.load(fs);
    if(validKey(key)&&!this.find(key)&&!this.workspaces.has(key))await this.sync(fs);
    const chosen=validKey(key)&&(this.find(key)||this.workspaces.has(key))?key:this.find(this.last)?this.last:this.records[0]?.key;
    if(chosen)return this.open(fs,chosen);
    // Requests a page sends at once (its document, scene and a setup link) share one starter.
    return this.starting??=this.create(fs).finally(()=>{this.starting=undefined;});
  }
  private starting?:Promise<ProjectWorkspace>;
  async open(fs:FileSystem,key:string):Promise<ProjectWorkspace>{
    await this.load(fs);
    let ws=this.workspaces.get(key);
    if(!ws){
      if(!this.find(key))throw new Error('That project is no longer saved in this browser.');
      ws=new ProjectWorkspace(key);this.workspaces.set(key,ws);
    }
    await ws.load(fs);
    return ws;
  }
  /** A new workspace, saved and listed before it is returned. */
  async create(fs:FileSystem,key=this.makeKey(),setup?:(editor:WorkspaceEditor)=>void):Promise<ProjectWorkspace>{
    await this.load(fs);
    while(this.find(key)||this.workspaces.has(key))key=this.makeKey();
    if(!validKey(key))throw new Error('Unknown project.');
    const ws=new ProjectWorkspace(key);this.workspaces.set(key,ws);
    await ws.load(fs);
    if(setup){setup(ws.editor);ws.editor.past=[];ws.editor.future=[];}
    await fs.mkdir(projectFiles(key).dir);
    if(!await ws.persistence.save(fs,true))throw new Error(ws.persistence.error);
    await this.register(fs,ws);
    return ws;
  }
  /** Lists `ws` as it now is (name, address, identity) and, with `opened`, as the last project opened in this browser. */
  register(fs:FileSystem,ws:ProjectWorkspace,opened=false){
    const record=ws.record,previous=this.find(ws.key);
    const changed=JSON.stringify(previous)!==JSON.stringify(record)||(opened&&this.last!==ws.key);
    if(previous)this.records=this.records.map(r=>r.key===ws.key?record:r);else this.records=[...this.records,record];
    if(opened)this.last=ws.key;
    if(!changed)return this.writes;
    const write=this.writes.catch(()=>{}).then(async()=>{
      // Another tab may have listed projects since this page read the list: keep them, and this page's change.
      await this.collect(fs);
      if(opened)this.last=ws.key;
      await fs.atomicWriteFile(REGISTRY_FILE,new TextEncoder().encode(JSON.stringify({version:1,projects:this.records,last:this.last})));
    });
    this.writes=write;return write;
  }
  /** Moves the single workspace, drafts and timeline of earlier releases into projects. Every input is read first and
   *  every output is a pure function of them, so two tabs migrating at once write the same files. The list is written
   *  last, so a failed migration runs again next time. The original files are never changed. */
  private async migrate(fs:FileSystem){
    const files=new Map<string,string>(),records=new Map<string,ProjectRecord>(),drafts=new Map<string,Record<string,string>>(),history=new Map<string,HistoryEntry[]>();
    const problems:string[]=[];
    const workspaceText=await readText(fs,WORKSPACE_FILE).catch(e=>{if((e as {code?:string}).code==='bake')throw e;problems.push('design.json');return undefined;});
    const draftsText=await readText(fs,LEGACY_DRAFTS_FILE).catch(e=>{if((e as {code?:string}).code==='bake')throw e;problems.push('design-drafts.json');return undefined;});
    const historyText=await readText(fs,LEGACY_HISTORY_FILE).catch(e=>{if((e as {code?:string}).code==='bake')throw e;problems.push('design-history.json');return undefined;});
    let legacyUrl='';
    const ensure=(key:string,name:string,url:string)=>{
      if(records.has(key))return;
      const workspace=createWorkspace();workspace.project={name,url,identity:''};
      records.set(key,{key,name,url,identity:''});
      files.set(projectFiles(key).workspace,JSON.stringify({version:1,workspace,active:workspace.views[0].id,selected:''}));
    };
    if(workspaceText!==undefined){
      let name='Saved workspace';
      try{
        const value=JSON.parse(workspaceText),workspace=loadWorkspace(value?.workspace!==undefined?value.workspace:value);
        name=(workspace.project.name||workspace.name||name).slice(0,120);legacyUrl=workspace.project.url;
      }catch{/* Copied as it is: opening it reports that it cannot be read and pauses saving, as before. */}
      records.set(LEGACY_KEY,{key:LEGACY_KEY,name,url:legacyUrl,identity:''});
      files.set(projectFiles(LEGACY_KEY).workspace,workspaceText);
    }
    const owner=(origin:string)=>{
      if(origin===''||origin===legacyUrl){ensure(LEGACY_KEY,'Untitled','');return LEGACY_KEY;}
      let url='';try{url=projectUrl(origin);}catch{return '';}
      const key=originKey(url);
      if(!validKey(key))return '';
      ensure(key,url.replace(/^https?:\/\//,''),url);return key;
    };
    if(draftsText!==undefined){
      try{
        const data=JSON.parse(draftsText);
        if(data.version!==1||!data.drafts||typeof data.drafts!=='object')throw new Error('drafts');
        for(const [origin,state] of Object.entries(data.drafts)){
          if(typeof state!=='string'||!state)continue;
          const key=owner(origin);if(!key){problems.push('design-drafts.json');continue;}
          // Unverified: these drafts return only to an app that cannot say which it is at this origin, or after the person
          // confirms which app made them.
          drafts.set(key,{...drafts.get(key),[draftBucket('',new URL(origin).origin)]:state});
        }
      }catch{problems.push('design-drafts.json');}
    }
    if(historyText!==undefined){
      try{
        for(const entry of parseHistory(historyText)){
          const key=owner(entry.project??'');if(!key){problems.push('design-history.json');continue;}
          history.set(key,[...history.get(key)??[],entry]);
        }
      }catch{problems.push('design-history.json');}
    }
    for(const [key,values] of drafts)files.set(projectFiles(key).drafts,JSON.stringify({version:2,drafts:values}));
    for(const [key,entries] of history)files.set(projectFiles(key).history,JSON.stringify({version:1,entries}));
    for(const key of records.keys())await fs.mkdir(projectFiles(key).dir);
    for(const [path,text] of files)await fs.atomicWriteFile(path,new TextEncoder().encode(text));
    this.records=[...records.values()];
    this.last=records.has(LEGACY_KEY)?LEGACY_KEY:this.records[0]?.key??'';
    await fs.atomicWriteFile(REGISTRY_FILE,new TextEncoder().encode(JSON.stringify({version:1,projects:this.records,last:this.last})));
    if(problems.length)this.error=`Some saved data from an earlier version could not be moved (${[...new Set(problems)].join(', ')}). It was left unchanged.`;
  }
}
