import {historyIcon} from './history-icons';
import type {FileSystem} from './app.contract.d.ts';
export type HistoryChange={target:string;property:string;before:string;after:string};
export type HistoryEntry={id:string;parent:string;time:string;actor:'user'|'ai';kind:string;project:string;label:string;target:string;changes:HistoryChange[];beforeState:string;afterState:string};
const file='app:/data/design-history.json';
/** Append-only journal. UI summaries never replace the stored comparison evidence. */
export class DesignHistory {
  entries:HistoryEntry[]=[];
  private loading?:Promise<void>;
  private writes:Promise<unknown>=Promise.resolve();
  load(fs:FileSystem){return this.loading??=this.read(fs).catch(error=>{this.loading=undefined;throw error;});}
  private async read(fs:FileSystem){
    try{
      const data=JSON.parse(new TextDecoder().decode(await fs.readFile(file)));
      if(data.version!==1||!Array.isArray(data.entries)||data.entries.some((e:any)=>!e||typeof e.id!=='string'||typeof e.time!=='string'||!['user','ai'].includes(e.actor)||typeof e.beforeState!=='string'||typeof e.afterState!=='string'||!Array.isArray(e.changes)))throw new Error('Could not read the design timeline.');
      this.entries=data.entries;
    }catch(error){if((error as {code?:string}).code!=='ENOENT')throw error;}
  }
  append(fs:FileSystem,input:Omit<HistoryEntry,'id'|'parent'|'actor'>&{actor?:'user'|'ai'}){
    const write=this.writes.catch(()=>{}).then(async()=>{
      await this.load(fs);
      const entry:HistoryEntry={...input,id:crypto.randomUUID(),parent:this.entries.filter(e=>e.project===input.project).at(-1)?.id??'',actor:input.actor??'user'};
      const entries=[...this.entries,entry];
      await fs.atomicWriteFile(file,new TextEncoder().encode(JSON.stringify({version:1,entries})));
      this.entries=entries;
    });this.writes=write;return write;
  }
  view(project:string){return this.entries.filter(e=>e.project===project).map((e,index)=>({id:e.id,icon:historyIcon(e),number:index+1,label:e.label,target:e.target,actor:e.actor,kind:e.kind,time:e.time,timeLabel:new Date(e.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),changes:e.changes.map((c,i)=>({...c,id:String(i)}))}));}
}
export function draftChanges(beforeState:string,afterState:string,apply=false):HistoryChange[]{
  const parse=(text:string)=>{try{return JSON.parse(text).patches??[];}catch{return [];}};
  const before=new Map<string,any>(parse(beforeState).map((p:any)=>[p.key,p])),after=new Map<string,any>(parse(afterState).map((p:any)=>[p.key,p]));
  return [...new Set([...before.keys(),...after.keys()])].flatMap(key=>{
    const a=before.get(key),b=after.get(key),p=b??a;
    const old=apply?p.original:a?.value??b.original,next=apply?p.value:b?.value??a.original;
    return old===next?[]:[{target:`${p.binding.file}:${p.binding.line}:${p.binding.col}`,property:p.binding.property,before:old,after:next}];
  });
}
/** Structured paths keep workspace edits comparable without interpreting labels. */
export function workspaceChanges(before:any,after:any,path='workspace'):HistoryChange[]{
  if(JSON.stringify(before)===JSON.stringify(after))return [];
  if(before&&after&&typeof before==='object'&&typeof after==='object'){
    if(Array.isArray(before)&&Array.isArray(after)&&[...before,...after].every(x=>x&&typeof x.id==='string')){
      const a=new Map(before.map(x=>[x.id,x])),b=new Map(after.map(x=>[x.id,x]));
      return [...new Set([...a.keys(),...b.keys()])].flatMap(id=>workspaceChanges(a.get(id),b.get(id),`${path}/${id}`));
    }
    if(!Array.isArray(before)&&!Array.isArray(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>workspaceChanges(before[key],after[key],`${path}/${key}`));
  }
  const split=path.lastIndexOf('/');
  const value=(v:any)=>v===undefined?'∅':typeof v==='string'?v:JSON.stringify(v);
  return [{target:path.slice(0,split),property:path.slice(split+1),before:value(before),after:value(after)}];
}
