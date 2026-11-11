import { projectUrl } from '../studio/project';
import {relative,isAbsolute,resolve} from 'node:path';
import {layoutProperties,layoutOptions,sourceLiteral,writeLayout,undoLayout,type SourceInverse,type LayoutSite} from './layout-source';

const properties=new Set(['color','background-color','font-size','font-weight','line-height','letter-spacing','border-radius','opacity']);
type Row={name:string;editable?:any};
export function editableRows(selection:any) {
  if(!selection || selection.readOnly) return [];
  const seen=new Set<string>();
  return (selection.rows??[]).filter((r:Row)=>{
    const e=r.editable,key=JSON.stringify([e?.file,e?.at,e?.style,e?.row]);
    const layout=e?.rung==='layout' && layoutProperties.has(e.row);
    if((!layout && (!properties.has(String(e?.row??r.name).replaceAll('_','-')) || !['template','style'].includes(e?.rung))) || e.state || typeof e.text!=='string' || seen.has(key)) return false;
    seen.add(key);return true;
  });
}
export function rowOperation(row:Row,value:string) {
  const e=row.editable;
  if(!editableRows({rows:[row]}).length) throw new Error('This property is read-only.');
  if(e.rung==='layout') throw new Error('Layout edits require staged source validation.');
  if(!value.trim() || value.length>256) throw new Error('Enter a property value.');
  const normalized=e.row.replaceAll('_','-');
  const numeric=['font-size','font-weight','line-height','letter-spacing','border-radius','opacity'].includes(normalized);
  if(numeric && !Number.isFinite(Number(value))) throw new Error('Enter a number.');
  if(normalized==='opacity' && (Number(value)<0||Number(value)>1)) throw new Error('Opacity must be between 0 and 1.');
  const address=e.rung==='style'?{style:e.style,file:e.file}:{file:e.file,at:e.at,sha256:e.sha256};
  return {op:'set-row',...address,row:e.row,value:numeric?Number(value):value.trim()};
}
export class DesignSession {
  client=`exact-design:${crypto.randomUUID()}`;
  cursor=0; epoch=''; files:any={}; selection:any=null; version=0;
  inverses:(string|SourceInverse)[]=[]; applied=false; busy=false;
  app='';
  builds=new Set<string>();
  constructor(readonly origin:string,private token:string,private request:typeof fetch=fetch) {}
  async call(body:any,path='/__tamber') {
    const r=await this.request(this.origin+path,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-exact-tamber-token':this.token},body:JSON.stringify(body)});
    const data=await r.json();
    if(!r.ok || data.error) throw new Error(data.error?.message??'The design server refused this change. Select the element again.');
    return data.ok??data;
  }
  async start() {
    const hello=await this.call({method:'hello'});
    if(!hello.protocol?.startsWith('tamber/1.')) throw new Error('This Exact editing protocol is not supported.');
    this.files=hello.files;
    this.app=hello.local===true && typeof hello.app==='string' && isAbsolute(hello.app)?hello.app:'';
    await this.poll();
    const inspecting=await this.call({method:'inspect',client:this.client,on:true});
    this.builds=new Set(inspecting.builds??[]);this.selection=null;this.version++;
    return this.view();
  }
  async poll() {
    const r=await this.call({client:this.client,after:this.cursor,...(this.epoch?{epoch:this.epoch}:{}),wait:false},'/__tamber/events');
    if(this.epoch && this.epoch!==r.epoch) throw new Error('The app server restarted. Finish editing and reconnect.');
    this.epoch=r.epoch; this.cursor=r.seq;
    if(r.missed || JSON.stringify(this.files)!==JSON.stringify(r.files)) {this.selection=null;this.version++;}
    this.files=r.files;
    for(const event of r.events??[]) {
      if(event.event==='selection' && this.builds.has(String(event.build))) {this.selection=await this.withLayout(event);this.version++;this.applied=false;}
      if(event.event==='selected' && event.selected===null && this.builds.has(String(event.build))) {this.selection=null;this.version++;}
    }
    return this.view();
  }
  async withLayout(event:any) {
    if(!this.app || event.readOnly) return event;
    const rows=await Promise.all((event.rows??[]).map(async(r:any)=>{
      if(!r.layout || !r.at?.sha256 || r.state || r.source!=='authored' || !(r.origin==='own'||/^class:[\w-]+$/.test(r.origin??'')) || !layoutProperties.has(r.attr)) return r;
      const file=relative(this.app,resolve(this.app,r.at.file));
      if(this.files[file]!==r.at.sha256)return r;
      const site:LayoutSite={file,line:r.at.line,col:r.at.col,sha256:r.at.sha256,attr:r.attr,shared:r.origin!=='own'};
      try {
        const literal=await sourceLiteral(this.app,site);
        return literal?{...r,editable:{rung:'layout',row:r.attr,file,at:{line:site.line,col:site.col},sha256:site.sha256,text:literal.value,site}}:r;
      } catch {return r;}
    }));
    return {...event,rows};
  }
  view() {
    const s=this.selection, rows=editableRows(s);
    return {source:s?.source?`${s.source.file}:${s.source.line}`:'',component:s?.source?.component??'',version:this.version,
      message:s?.readOnly || (s && !rows.length?'This element has no editable visual properties yet.':'Select an element in a screen.'),
      rows:rows.map((r:Row,i:number)=>({id:String(i),name:labels[r.editable.row]??r.editable.row,value:r.editable.text,shared:r.editable.rung==='style'||r.editable.site?.shared===true,group:r.editable.rung==='layout'?(r.editable.row.startsWith('padding')||r.editable.row.startsWith('margin')||r.editable.row.includes('gap')?'Spacing':'Layout'):'Appearance',options:layoutOptions(r.editable.row).map(value=>({value,label:optionLabels[value]??value}))})),canUndo:this.inverses.length>0,applied:this.applied};
  }
  async edit(version:number,index:number,value:string) {
    if(this.busy) throw new Error('A change is still being applied.');
    this.busy=true;
    try {
      await this.poll();
      if(version!==this.version || !this.selection) throw new Error('The source or selection changed. Select the element again.');
      const row=editableRows(this.selection)[index];
      if(!row) throw new Error('This property is no longer editable.');
      if(row.editable.rung==='layout') this.inverses.push(await writeLayout(this.app,row.editable.site,value));
      else {
        const r=await this.call({method:'transaction',client:this.client,files:this.files,ops:[rowOperation(row,value)]});
        if(r.inverse)this.inverses.push(r.inverse);
      }
      if(this.inverses.length>100)this.inverses.shift();
      this.selection=null;this.version++;this.applied=true;
      return this.view();
    } finally {this.busy=false;}
  }
  async undo() {
    if(this.busy || !this.inverses.length) throw new Error('There is no app change to undo.');
    this.busy=true;
    try {
      const inverse=this.inverses.at(-1)!;
      if(typeof inverse==='string') {
        const r=await this.call({method:'undo',client:this.client,inverse});this.files=r.files;
      } else await undoLayout(this.app,inverse);
      this.inverses.pop();this.selection=null;this.version++;this.applied=false;
      return this.view();
    } finally {this.busy=false;}
  }
  async close() {await this.call({method:'inspect',client:this.client,on:false});}
}
const sessions=new Map<string,{session:DesignSession;seen:number}>();
const optionLabels:Record<string,string>={row:'Row',column:'Column','row-reverse':'Row reversed','column-reverse':'Column reversed',stretch:'Stretch','flex-start':'Start',center:'Center','flex-end':'End',baseline:'Baseline','space-between':'Space between','space-around':'Space around','space-evenly':'Space evenly',nowrap:'No wrap',wrap:'Wrap','wrap-reverse':'Wrap reversed'};
const labels:Record<string,string>={'background-color':'Fill',color:'Text color','font-size':'Font size','font-weight':'Weight','line-height':'Line height','letter-spacing':'Letter spacing','border-radius':'Corner radius',opacity:'Opacity'};
Object.assign(labels,{'flex-direction':'Direction','align-items':'Align items','justify-content':'Distribute','flex-wrap':'Wrap',width:'Width',height:'Height','min-width':'Min width','max-width':'Max width','min-height':'Min height','max-height':'Max height',gap:'Gap','row-gap':'Row gap','column-gap':'Column gap',padding:'Padding','padding-top':'Padding top','padding-right':'Padding right','padding-bottom':'Padding bottom','padding-left':'Padding left',margin:'Margin','margin-top':'Margin top','margin-right':'Margin right','margin-bottom':'Margin bottom','margin-left':'Margin left'});
export async function designRequest(body:any) {
  for(const [id,entry] of sessions) if(Date.now()-entry.seen>120000) {sessions.delete(id);void entry.session.close().catch(()=>{});}
  if(body.op==='open') {
    const origin=projectUrl(body.url),u=new URL(origin);
    if(u.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(u.hostname)) throw new Error('Source editing currently supports Exact dev servers on this computer.');
    const r=await fetch(origin+'/__tamber/token',{redirect:'error',signal:AbortSignal.timeout(4000)});
    if(!r.ok) throw new Error('This app does not expose Exact’s development editing API.');
    const {token}=await r.json().catch(()=>({}));
    if(typeof token!=='string'||!token) throw new Error('No local editing session is available.');
    const session=new DesignSession(origin,token),view=await session.start(),id=crypto.randomUUID();
    sessions.set(id,{session,seen:Date.now()});
    return {session:id,...view};
  }
  const entry=sessions.get(body.session);
  if(!entry) throw new Error('The editing session ended. Connect again.');
  entry.seen=Date.now();const s=entry.session;
  if(body.op==='close') {await s.close();sessions.delete(body.session);return {};}
  if(body.op==='poll') return s.busy?s.view():await s.poll();
  if(body.op==='edit') return s.edit(Number(body.version),Number(body.row),body.value);
  if(body.op==='undo') return s.undo();
  if(body.op==='parent') {
    if(!s.selection) throw new Error('Select an element first.');
    await s.call({method:'inspect',client:s.client,build:s.selection.build,select:{up:1}});
    return s.view();
  }
  throw new Error('Unknown design action.');
}
