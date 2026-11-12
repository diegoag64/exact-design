import {propertyName,propertyGroup,compoundFields,compoundValue} from './inspector-fields';
import {readFile} from 'node:fs/promises';
import { projectUrl } from '../studio/project';
import {relative,isAbsolute,resolve} from 'node:path';
import {layoutProperties,layoutOptions,layoutValue,sourceLiteral,digest,type LayoutSite} from './layout-source';
import {ElementBridge,bridgeFor,type ElementNode} from './element-bridge';
import {spacingProperties,spacingRows} from '../studio/spacing';
import {emptySpacing} from '../studio/spacing';
import {PreviewChannel} from './preview-channel';
import {DesignDraft,applyDesignDraft,bindingTargets,bindingKey,previewValue,type DesignBinding,type DesignPatch} from './design-drafts';

const properties=new Set(['color','background-color','font-size','font-weight','line-height','letter-spacing','border-radius','opacity','font-family','text-content']);
type Row={name:string;editable?:any};
export function editableRows(selection:any) {
  if(!selection || selection.readOnly) return [];
  const seen=new Set<string>();
  return (selection.rows??[]).filter((r:Row)=>{
    const e=r.editable,key=JSON.stringify([e?.file,e?.at,e?.style,e?.row]);
    const layout=e?.rung==='layout' && (layoutProperties.has(e.row)||properties.has(e.row));
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
export function spacingOperation(rows:Row[],property:string,value:string){
  if(!spacingProperties.includes(property)||value.trim().split(/\s+/).length!==1)throw new Error('Enter one spacing value.');
  layoutValue(property,value);
  let index=rows.findIndex(r=>r.editable.row===property);
  if(index<0)index=rows.findIndex(r=>r.editable.row===(property.startsWith('padding-')?'padding':'gap'));
  if(index<0)throw new Error('This spacing is computed. Edit it in source.');
  if(rows[index].editable.row==='padding'){
    const parts=rows[index].editable.text.trim().split(/\s+/);
    const sides=[parts[0],parts[1]??parts[0],parts[2]??parts[0],parts[3]??parts[1]??parts[0]];
    sides[spacingProperties.indexOf(property)]=value.trim();value=sides.join(' ');
  }
  if(rows[index].editable.row==='gap'){
    const parts=rows[index].editable.text.trim().split(/\s+/),axes=[parts[0],parts[1]??parts[0]];
    axes[property==='row-gap'?0:1]=value.trim();value=axes.join(' ');
  }
  return {index,value};
}
export class DesignSession {
  client=`exact-design:${crypto.randomUUID()}`;
  cursor=0; epoch=''; files:any={}; selection:any=null; version=0;
  selectionRevision=0;
  preview=new PreviewChannel();
  drafts=new DesignDraft();
  draftError='';
  sourceMap:any=null;
  handoff:DesignPatch[]=[];
  receivePreview=(frame:any,packet:any)=>{
    if(packet.kind==='pick'){
      this.pick(frame.frame,packet.id);
      this.preview.publish(true,emptySpacing(frame.frame));
    }else if(packet.kind==='ready'){this.syncDrafts();this.preview.publish(true);}
    else if(packet.kind==='spacing'&&frame.frame===this.picked?.frame&&packet.id===this.picked.node.id)this.preview.publish(false,{frame:frame.frame,id:packet.id,plan:packet.plan,boxes:packet.boxes});
    else if(packet.kind==='draft-status'&&packet.revision===this.drafts.revision&&packet.error!==this.draftError){this.draftError=packet.error;this.preview.publish(true);}
  };
  applied=false; busy=false;
  app='';
  bridge:ElementBridge|null=null;
  preferredFrame='';
  hoveredFrame='';
  ended=false;
  picked:{frame:string;node:ElementNode}|null=null;
  pendingSelection:{frame:string;path:string;until:number}|null=null;
  restoring:{frame:string;path:string;file:string;line:number;col:number;sha:string;before:string;plan:string;sent:string;since:number;allowSamePlan?:boolean}|null=null;
  builds=new Set<string>();
  inspectedPages=new Map<string,string>();
  deferredSelections:{event:any;until:number;plan:string}[]=[];
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
    this.bridge?.feedback?.add(this.receivePreview);
    await this.poll();
    if(!this.bridge){
      const inspecting=await this.call({method:'inspect',client:this.client,on:true});
      this.builds=new Set(inspecting.builds??[]);
    }
    this.selection=null;this.version++;
    return this.view();
  }
  async poll() {
    if(this.bridge)for(const frame of this.bridge.frames.values())if(frame.build&&this.inspectedPages.get(frame.build)!==(frame.page||frame.build)){
      try{await this.call({method:'inspect',client:this.client,build:frame.build,on:true});this.builds.add(frame.build);this.inspectedPages.set(frame.build,frame.page||frame.build);}catch{/* The page can report its ID before registration completes. */}
    }
    const r=await this.call({client:this.client,after:this.cursor,...(this.epoch?{epoch:this.epoch}:{}),wait:false},'/__tamber/events');
    if(this.epoch && this.epoch!==r.epoch) throw new Error('The app server restarted. Finish editing and reconnect.');
    this.epoch=r.epoch; this.cursor=r.seq;
    if(r.missed || JSON.stringify(this.files)!==JSON.stringify(r.files)) {this.selection=null;this.version++;}
    this.files=r.files;
    if(this.pendingSelection&&Date.now()>this.pendingSelection.until)this.pendingSelection=null;
    const selections=[...this.deferredSelections,...(r.events??[]).map((event:any)=>({event,until:Date.now()+1500,plan:''}))];
    this.deferredSelections=[];
    for(const report of selections) {
      const event=report.event;
      if(event.event==='selection' && this.builds.has(String(event.build))) {
        const frame=this.bridge&&[...this.bridge.frames.values()].find(f=>f.build===String(event.build));
        const node=frame?.nodes.find(n=>n.site===event.site&&JSON.stringify(n.instance)===JSON.stringify(event.instance??[]));
        // Exact learns instance paths when its inspector table first loads. Its
        // selection report can arrive before the preview's next hierarchy snapshot.
        if(this.bridge&&(!frame||!node)){
          if(Date.now()<report.until&&(!report.plan||report.plan===frame?.plan)&&this.deferredSelections.length<8)this.deferredSelections.push({...report,plan:frame?.plan??''});
          continue;
        }
        if(this.pendingSelection&&(!frame||frame.frame!==this.pendingSelection.frame||node?.path!==this.pendingSelection.path))continue;
        if(this.restoring && (!frame || frame.frame!==this.restoring.frame || !node || node.path!==this.restoring.path))continue;
        if(this.restoring && ((!this.restoring.allowSamePlan&&frame!.plan===this.restoring.plan) || event.readOnly || this.files[this.restoring.file]!==this.restoring.sha))continue;
        if(this.restoring&&(event.source?.file!==this.restoring.file||event.source?.line!==this.restoring.line||event.source?.col!==this.restoring.col)){this.restoring=null;this.selection=null;this.version++;continue;}
        if(!this.pendingSelection&&!this.restoring)this.selectionRevision++;
        if(frame&&node)this.picked={frame:frame.frame,node};
        this.selection=await this.withLayout(event);this.version++;this.applied=false;this.restoring=null;this.pendingSelection=null;
      }
      if(event.event==='selected' && event.selected===null && this.builds.has(String(event.build))) {this.selection=null;this.version++;this.ended=true;}
    }
    if(this.selection&&this.bridge){
      const frame=[...this.bridge.frames.values()].find(f=>f.build===String(this.selection.build));
      const node=frame?.nodes.find(n=>n.site===this.selection.site&&JSON.stringify(n.instance)===JSON.stringify(this.selection.instance??[]));
      if(frame&&node)this.picked={frame:frame.frame,node};
    }
    if(this.restoring&&this.bridge){
      const pending=this.restoring,frame=this.bridge.frames.get(pending.frame);
      if(Date.now()-pending.since>15000 || (this.files[pending.file]!==pending.sha&&this.files[pending.file]!==pending.before)){this.restoring=null;}
      else if(frame?.inspecting&&(pending.allowSamePlan||frame.plan!==pending.plan)&&pending.sent!==(frame.page||frame.build)+':'+frame.plan){
        const matches=frame.nodes.filter(n=>n.path===pending.path);
        if(matches.length===1){this.bridge.select(frame.frame,matches[0].id);pending.sent=(frame.page||frame.build)+':'+frame.plan;}
      }
    }
    return this.view();
  }
  async withLayout(event:any) {
    if(!this.app || event.readOnly) return event;
    const rows=await Promise.all((event.rows??[]).map(async(r:any)=>{
      if(!r.at?.sha256 || r.state || r.source!=='authored' || !(r.origin==='own'||/^class:[\w-]+$/.test(r.origin??'')) || !(layoutProperties.has(r.attr)||properties.has(r.attr))) return r;
      const file=relative(this.app,resolve(this.app,r.at.file));
      if(this.files[file]!==r.at.sha256)return r;
      const site:LayoutSite={file,line:r.at.line,col:r.at.col,sha256:r.at.sha256,attr:r.attr,shared:r.origin!=='own'};
      try {
        const literal=await sourceLiteral(this.app,site);
        return literal?{...r,editable:{rung:'layout',row:r.attr,file,at:{line:site.line,col:site.col},sha256:site.sha256,text:literal.value,site}}:r;
      } catch {return r;}
    }));
    const at=event.source;
    if(at?.file&&this.picked?.node.kind==='text'){
      const file=relative(this.app,resolve(this.app,at.file)),sha256=this.files[file];
      if(sha256){
        const site:LayoutSite={file,line:at.line,col:at.col,sha256,attr:'text-content',shared:false};
        try{const literal=await sourceLiteral(this.app,site);
          if(literal)rows.unshift({name:'text-content',source:'authored',editable:{rung:'layout',row:'text-content',file,at:{line:site.line,col:site.col},sha256,text:literal.value,site}});
          else rows.unshift({name:'text-content',attr:'text-content',source:'dynamic',value:this.picked.node.label,editable:{rung:null,reason:'Text comes from app data or an expression. Edit its data source.'}});
        }catch{/* No local literal: do not invent a writable binding. */}
      }
    }
    return {...event,rows};
  }
  binding(row:Row):DesignBinding {
    const e=row.editable,at=e.site??e.at??(row as any).at;
    const file=e.site?.file??e.file??at?.file;
    if(!file||!at?.line||!at?.col)throw new Error('This property has no writable source binding.');
    const name=this.app?relative(this.app,resolve(this.app,file)):file;
    return {file:name,line:at.line,col:at.col,sha256:e.sha256??at.sha256??this.files[name],property:e.row,shared:e.rung==='style'||e.site?.shared===true};
  }
  currentRows(){return editableRows(this.selection).map(row=>{
    let patch;try{patch=this.drafts.patches.get(bindingKey(this.binding(row)));}catch{}
    return patch?{...row,editable:{...row.editable,text:patch.value}}:row;
  });}
  syncDrafts(){this.bridge?.preview?.([...this.handoff,...this.drafts.snapshot()].map(p=>p.preview),this.drafts.revision);}
  view() {
    const s=this.selection, rows=this.currentRows();this.syncDrafts();
    const frame=this.bridge&&(this.picked?this.bridge.frames.get(this.picked.frame):this.bridge.frames.get(this.preferredFrame)??[...this.bridge.frames.values()][0]);
    const selected=this.picked?.node.id??'';
    const tree=frame?.nodes.map(n=>{
      const ancestors:string[]=[];let at=frame.nodes.find(p=>p.id===n.parent);
      while(at&&ancestors.length<100){ancestors.push(at.id);at=frame.nodes.find(p=>p.id===at!.parent);}
      return {id:n.id,label:n.label,depth:n.depth,kind:n.kind??n.tag,ancestors,hasChildren:frame.nodes.some(p=>p.parent===n.id),selected:n.id===selected};
    })??[];
    const crumbs:typeof tree=[];let at=frame?.nodes.find(n=>n.id===selected);
    while(at&&crumbs.length<30){const entry=tree.find(n=>n.id===at!.id);if(entry)crumbs.unshift(entry);at=frame?.nodes.find(n=>n.id===at!.parent);}
    const spacingId=s&&!this.pendingSelection&&!this.restoring?selected:'',spacingPlan=frame?.plan??'';
    if(frame)this.bridge?.measure?.(frame.frame,spacingId);
    return {source:s?.source?`${s.source.file}:${s.source.line}`:'',component:s?.source?.component??'',version:this.version,selectionRevision:this.selectionRevision,
      spacingId,spacingPlan,spacingFrame:frame?.frame??'',
      spacingInputs:spacingRows(rows.map((r,i)=>({id:String(i),property:r.editable.row,value:r.editable.text,shared:r.editable.rung==='style'||r.editable.site?.shared===true}))),
      draftCount:this.drafts.count,draftState:this.drafts.serialize(),draftError:this.draftError||(this.drafts.conflict(this.files)?'The source changed. Discard this draft before editing the new source.':''),canApply:this.drafts.count>0&&!this.drafts.conflict(this.files)&&!this.draftError,
      instances:frame&&this.picked?frame.nodes.filter(n=>n.site===this.picked!.node.site).length:1,bridgeOrigin:this.bridge?.origin??'',tree,crumbs,selectedLabel:this.picked?.node.label??'',restoring:!!this.restoring,selecting:!!this.pendingSelection,
      message:this.pendingSelection?'Selecting element…':this.restoring?'Updating selection…':s?.readOnly || (s && !rows.length?'No editable properties.':'Select an element in a screen.'),
      rows:this.inspectorRows(rows),canUndo:this.drafts.past.length>0,applied:this.applied};
  }
  inspectorRows(rows:Row[]){
    const result=rows.map((r:Row,i:number)=>{
      const e=r.editable,property=e.row,binding=this.binding(r),fields=compoundFields(property,e.text);
      return {id:String(i),property,name:propertyName[property]??property.replaceAll('-',' '),value:e.text,shared:binding.shared,group:propertyGroup(property),binding:`${binding.file}:${binding.line}:${binding.col}`,reason:'',readonly:false,fields,linked:fields.length>0&&fields.every(f=>f.value===fields[0].value),options:layoutOptions(property).map(value=>({value,label:optionLabels[value]??value}))};
    });
    const seen=new Set(result.map(r=>r.property));
    for(const r of this.selection?.rows??[]){
      const property=r.attr??String(r.name).replaceAll('_','-');
      if(seen.has(property)||!(layoutProperties.has(property)||properties.has(property))||r.source==='initial'||r.source==='inherited')continue;
      seen.add(property);
      result.push({id:'readonly-'+property,property,name:propertyName[property]??property.replaceAll('-',' '),value:String(r.token?.text??r.value??''),shared:false,group:propertyGroup(property),binding:r.at?`${r.at.file}:${r.at.line}:${r.at.col}`:'',reason:r.source==='dynamic'?(property==='text-content'?'Bound to app data · edit its source':'Responsive or data-driven expression'):r.origin==='tag'?'Defined by the element type':r.editable?.reason??'Controlled in source',readonly:true,fields:[],linked:false,options:[]});
    }
    return result;
  }
  async editField(version:number,address:string,value:string){
    const [index,part]=address.split(':');
    const row=this.currentRows()[Number(index)];
    if(!row)throw new Error('Select the element again.');
    return this.edit(version,Number(index),compoundValue(row.editable.row,row.editable.text,part,value));
  }
  async edit(version:number,index:number,value:string) {
    if(this.busy) throw new Error('A change is still being applied.');
    this.busy=true;
    try {
      await this.poll();
      if(version!==this.version || !this.selection) throw new Error('The source or selection changed. Select the element again.');
      const row=editableRows(this.selection)[index];
      if(!row) throw new Error('This property is no longer editable.');
      const binding=this.binding(row),key=bindingKey(binding),next=previewValue(binding.property,value);
      const frame=this.picked&&this.bridge?.frames.get(this.picked.frame);
      let targets;
      if(this.app&&frame){
        if(this.sourceMap?.digest!==frame.plan){try{this.sourceMap=JSON.parse(await readFile(resolve(this.app,'target/web-dist/app.plan.map.json'),'utf8'));}catch{this.sourceMap=null;}}
        if(this.sourceMap?.digest===frame.plan)targets=bindingTargets(this.sourceMap,this.app,binding);
        if(!targets?.length)throw new Error('This build has no matching preview source map. Reconnect after it rebuilds.');
      }else if(binding.shared)throw new Error('Shared style drafts require a local Exact source map.');
      this.drafts.stage({key,binding,original:row.editable.text,value:next.author,preview:{key,site:this.picked?.node.site??0,plan:frame?.plan??'',property:binding.property,value:next.css,scope:binding.shared?'style':'site',targets},operation:this.app||row.editable.rung==='layout'?null:rowOperation(row,next.author)},this.files);
      this.draftError='';this.version++;this.applied=false;
      return this.view();
    } finally {this.busy=false;}
  }
  async apply(){
    if(this.busy||!this.drafts.count)throw new Error('There is no design draft to apply.');
    this.busy=true;
    try{
      await this.poll();
      if(this.drafts.conflict(this.files))throw new Error('The source changed. The draft was not applied.');
      if(this.draftError)throw new Error(this.draftError);
      const patches=this.drafts.snapshot();let expected:any;
      if(this.app){const inverse=await applyDesignDraft(this.app,patches);expected={...this.files,...Object.fromEntries(inverse.map(i=>[i.file,digest(i.after)]))};}
      else{
        const result=await this.call({method:'transaction',client:this.client,files:this.files,ops:patches.map(p=>{if(!p.operation)throw new Error('Layout drafts require a local Exact project.');return p.operation;})});
        expected=result.files;
      }
      this.armRestore(expected);this.handoff=patches;this.drafts.clear();this.selection=null;this.version++;this.applied=true;
      return this.view();
    }finally{this.busy=false;}
  }
  undo(){if(this.busy)throw new Error('A change is still being applied.');this.drafts.undo();this.draftError='';this.version++;return this.view();}
  discard(){if(this.busy)throw new Error('A change is still being applied.');this.drafts.clear();this.draftError='';this.version++;return this.view();}
  async editSpacing(version:number,property:string,value:string){
    await this.poll();
    if(version!==this.version||!this.selection)throw new Error('The source or selection changed. Select the element again.');
    const operation=spacingOperation(this.currentRows(),property,value);
    return this.edit(version,operation.index,operation.value);
  }
  armRestore(files:any){
    const frame=this.picked&&this.bridge?.frames.get(this.picked.frame),previous=this.restoring,source=this.selection?.source??previous;
    const allowSamePlan=!this.selection&&!!previous&&frame?.plan===previous.plan&&files?.[previous.file]===previous.before;
    if(frame&&this.picked&&source?.file&&files?.[source.file])this.restoring={frame:frame.frame,path:this.picked.node.path,file:source.file,line:source.line,col:source.col,sha:files[source.file],before:this.files[source.file],plan:frame.plan,sent:'',since:Date.now(),allowSamePlan};
  }
  navigate(id:string){
    const frame=this.bridge&&(this.picked?this.bridge.frames.get(this.picked.frame):this.bridge.frames.get(this.preferredFrame)??[...this.bridge.frames.values()][0]);
    const node=frame?.nodes.find(n=>n.id===id);
    if(!frame||!node)throw new Error('This element is no longer on the screen.');
    this.pick(frame.frame,id);this.bridge!.select(frame.frame,id);
    return this.view();
  }
  pick(frameId:string,id:string){
    const frame=this.bridge?.frames.get(frameId),node=frame?.nodes.find(n=>n.id===id);
    if(!frame||!node)return;
    this.picked={frame:frame.frame,node};this.selection=null;this.version++;this.selectionRevision++;
    this.pendingSelection={frame:frame.frame,path:node.path,until:Date.now()+1000};this.restoring=null;
  }
  hover(id:string){
    const frame=this.bridge&&(this.picked?this.bridge.frames.get(this.picked.frame):this.bridge.frames.get(this.preferredFrame)??[...this.bridge.frames.values()][0]);
    const next=frame&&id&&frame.nodes.some(n=>n.id===id)?frame.frame:'';
    if(this.hoveredFrame&&this.hoveredFrame!==next)this.bridge?.hover(this.hoveredFrame,'');
    if(next)this.bridge!.hover(next,id);
    this.hoveredFrame=next;
  }
  async close() {this.hover('');this.bridge?.feedback?.delete(this.receivePreview);this.preview.close();await this.call({method:'inspect',client:this.client,on:false});}
}
const sessions=new Map<string,{session:DesignSession;seen:number}>();
export function designEvents(id:string,request:Request){
  const entry=sessions.get(id);
  if(!entry)return new Response('The editing session ended.',{status:404});
  entry.seen=Date.now();return entry.session.preview.subscribe(request);
}
const optionLabels:Record<string,string>={row:'Row',column:'Column','row-reverse':'Row reversed','column-reverse':'Column reversed',stretch:'Stretch','flex-start':'Start',center:'Center','flex-end':'End',baseline:'Baseline','space-between':'Space between','space-around':'Space around','space-evenly':'Space evenly',nowrap:'No wrap',wrap:'Wrap','wrap-reverse':'Wrap reversed'};
export async function designRequest(body:any) {
  for(const [id,entry] of sessions) if(Date.now()-entry.seen>120000) {sessions.delete(id);void entry.session.close().catch(()=>{});}
  if(body.op==='open') {
    const origin=projectUrl(body.url),u=new URL(origin);
    if(u.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(u.hostname)) throw new Error('Source editing currently supports Exact dev servers on this computer.');
    const r=await fetch(origin+'/__tamber/token',{redirect:'error',signal:AbortSignal.timeout(4000)});
    if(!r.ok) throw new Error('This app does not expose Exact’s development editing API.');
    const {token}=await r.json().catch(()=>({}));
    if(typeof token!=='string'||!token) throw new Error('No local editing session is available.');
    const session=new DesignSession(origin,token);session.bridge=bridgeFor(origin);session.preferredFrame=typeof body.row==='string'?body.row:'';
    await session.start();
    try{if(typeof body.draftState==='string'&&body.draftState)session.drafts.restore(body.draftState);}
    catch(error){await session.close();throw error;}
    const id=crypto.randomUUID();
    sessions.set(id,{session,seen:Date.now()});
    return {session:id,...session.view()};
  }
  const entry=sessions.get(body.session);
  if(!entry) throw new Error('The editing session ended. Connect again.');
  entry.seen=Date.now();const s=entry.session;
  if(body.op==='hover'){s.hover(String(body.row??''));return {};}
  if(body.op==='close') {await s.close();sessions.delete(body.session);return {};}
  if(body.op==='poll') {
    const view=s.busy?s.view():await s.poll();
    if(s.ended){await s.close();sessions.delete(body.session);return {...view,session:''};}
    return view;
  }
  if(body.op==='field')return s.editField(Number(body.version),String(body.row),String(body.value));
  if(body.op==='edit') return s.edit(Number(body.version),Number(body.row),body.value);
  if(body.op==='apply')return s.apply();
  if(body.op==='discard')return s.discard();
  if(body.op==='spacing')return s.editSpacing(Number(body.version),String(body.row),String(body.value));
  if(body.op==='undo') return s.undo();
  if(body.op==='parent') {
    if(!s.selection) throw new Error('Select an element first.');
    await s.call({method:'inspect',client:s.client,build:s.selection.build,select:{up:1}});
    return s.view();
  }
  if(body.op==='select')return s.navigate(String(body.row));
  throw new Error('Unknown design action.');
}
