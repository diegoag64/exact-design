import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {layoutProperties,layoutValue,literalAt,ownFile,checkLayout,replaceSource,digest,type LayoutSite,type SourceInverse} from './layout-source';

export type DesignBinding={file:string;line:number;col:number;sha256:string;property:string;shared:boolean};
export type PreviewPatch={key:string;site:number;plan:string;property:string;value:string;scope:'site'|'style';targets?:{site:number;properties:string[]}[]};
export type DesignPatch={key:string;binding:DesignBinding;original:string;value:string;preview:PreviewPatch;operation:any};
const numeric=new Set(['font-size','font-weight','line-height','letter-spacing','border-radius','opacity']);
const paint=new Set(['background-color','color','font-family','text-content',...numeric]);
export const bindingKey=(binding:DesignBinding)=>JSON.stringify([binding.file,binding.line,binding.col,binding.property]);
export function designLiteral(property:string,value:string){
  if(property==='text-content'){if(value.length>4096)throw new Error('Text must be at most 4096 characters.');return JSON.stringify(value);}
  if(layoutProperties.has(property))return layoutValue(property,value);
  if(!paint.has(property)||!value.trim()||value.length>256)throw new Error('This design value is not supported.');
  if(numeric.has(property)){
    const n=Number(value);if(!Number.isFinite(n))throw new Error('Enter a number.');
    if(property==='opacity'&&(n<0||n>1))throw new Error('Opacity must be between 0 and 1.');
    return String(n);
  }
  return JSON.stringify(value.trim());
}
export function previewValue(property:string,value:string){
  const literal=designLiteral(property,value),author=literal.startsWith('"')?JSON.parse(literal):literal;
  const unitless=['font-weight','opacity','line-height'].includes(property);
  return {author:String(author),css:property==='text-content'?String(author):!unitless&&/^-?\d+(?:\.\d+)?$/.test(String(author))?author+'px':String(author)};
}

/** Resolve compiled sites by source provenance, never by deduplicated CSS classes. */
export function bindingTargets(map:any,app:string,binding:DesignBinding){
  const css=(row:string)=>row==='text_color'?'color':row.replace(/^border_radius_(top|bottom)_(left|right)$/, 'border-$1-$2-radius').replaceAll('_','-');
  return (map.nodes??[]).flatMap((node:any,site:number)=>{
    if(binding.property==='text-content')return resolve(app,node.file??'')===resolve(app,binding.file)&&node.line===binding.line&&node.col===binding.col?[{site,properties:['text-content']}]:[];
    const properties=[...new Set<string>((node.bindings??[]).filter((row:any)=>!row.state&&row.at&&resolve(app,row.at.file)===resolve(app,binding.file)&&row.at.line===binding.line&&row.at.col===binding.col&&row.attr===binding.property).map((row:any)=>css(row.row)))];
    return properties.length?[{site,properties}]:[];
  });
}

/** A design draft owns edits and undo; source is touched only by its adapter. */
export class DesignDraft {
  patches=new Map<string,DesignPatch>();
  past:DesignPatch[][]=[];
  files:Record<string,string>={};
  revision=0;
  get count(){return this.patches.size;}
  snapshot(){return [...this.patches.values()];}
  conflict(files:Record<string,string>){return this.count>0&&Object.keys({...this.files,...files}).some(key=>this.files[key]!==files[key]);}
  stage(patch:DesignPatch,files:Record<string,string>){
    if(this.conflict(files))throw new Error('The source changed. Discard this draft before editing the new source.');
    if(!this.count){
      if(Object.keys({...this.files,...files}).some(key=>this.files[key]!==files[key]))this.past=[];
      this.files={...files};
    }
    const current=this.patches.get(patch.key);
    patch={...patch,original:current?.original??patch.original};
    if(current?.value===patch.value||(!current&&patch.value===patch.original))return;
    if(!current&&this.count>=64)throw new Error('Apply or discard this draft before adding more changes.');
    this.past.push(this.snapshot());if(this.past.length>100)this.past.shift();
    if(patch.value===patch.original)this.patches.delete(patch.key);else this.patches.set(patch.key,patch);
    this.revision++;
  }
  undo(){const previous=this.past.pop();if(!previous)throw new Error('There is no draft change to undo.');this.patches=new Map(previous.map(p=>[p.key,p]));this.revision++;}
  clear(){this.patches.clear();this.past=[];this.files={};this.revision++;}
  serialize(){return JSON.stringify({version:1,files:this.files,patches:this.snapshot()});}
  restore(text:string){
    if(!text)return;
    const state=JSON.parse(text);
    if(state.version!==1||!state.files||typeof state.files!=='object'||!Array.isArray(state.patches)||state.patches.length>64)throw new Error('The saved design draft is invalid.');
    for(const patch of state.patches){
      const b=patch?.binding;
      if(!b||typeof b.file!=='string'||b.file.length>2048||!Number.isSafeInteger(b.line)||b.line<1||!Number.isSafeInteger(b.col)||b.col<1||typeof b.sha256!=='string'||b.sha256.length>100||typeof patch.original!=='string'||patch.original.length>4096||typeof patch.value!=='string'||patch.value.length>4096||patch.key!==bindingKey(b)||patch.preview?.key!==patch.key||!Number.isSafeInteger(patch.preview.site)||typeof patch.preview.plan!=='string'||patch.preview.plan.length>100)throw new Error('The saved design draft is invalid.');
      const value=previewValue(b.property,patch.value);
      const operation=patch.operation;
      if(operation!==null&&(!operation||operation.op!=='set-row'||operation.file!==b.file||operation.row!==b.property||!['string','number'].includes(typeof operation.value)))throw new Error('The saved design operation is invalid.');
      if(operation?.style&&!/^[\w.-]+$/.test(operation.style))throw new Error('The saved design style is invalid.');
      const safeOperation=operation===null?null:{op:'set-row',file:b.file,row:b.property,value:numeric.has(b.property)?Number(value.author):value.author,...(b.shared?{style:operation.style}:{at:{line:b.line,col:b.col},sha256:b.sha256})};
      const targets=patch.preview.targets;
      if(targets!==undefined&&(!Array.isArray(targets)||targets.length>10000||targets.some((t:any)=>!Number.isSafeInteger(t.site)||t.site<0||!Array.isArray(t.properties)||t.properties.length>8||t.properties.some((p:any)=>typeof p!=='string'||!/^[a-z-]+$/.test(p)))))throw new Error('The saved preview bindings are invalid.');
      this.patches.set(patch.key,{key:patch.key,binding:b,original:patch.original,operation:safeOperation,value:value.author,preview:{key:patch.key,site:patch.preview.site,plan:patch.preview.plan,property:b.property,value:value.css,scope:b.shared?'style':'site',targets}});
    }
    this.files=state.files;this.past=this.count?[[]]:[];this.revision++;
  }
}

/** Translate stable source bindings into one checked set of Contract writes. */
export async function applyDesignDraft(app:string,patches:DesignPatch[],check=checkLayout):Promise<SourceInverse[]>{
  const files=new Map<string,{path:string;before:string;after:string;edits:{start:number;end:number;text:string}[]}>();
  for(const patch of patches){
    const b=patch.binding,{path,rel}=await ownFile(app,b.file);
    let file=files.get(rel);
    if(!file){const before=await readFile(path,'utf8');file={path,before,after:before,edits:[]};files.set(rel,file);}
    if(digest(file.before)!==b.sha256)throw new Error('The source changed. The draft was not applied.');
    const site:LayoutSite={...b,attr:b.property},at=literalAt(file.before,site);
    if(!at)throw new Error('A design property moved or became an expression. The draft was not applied.');
    file.edits.push({start:at.start,end:at.end,text:designLiteral(b.property,patch.value)});
  }
  for(const file of files.values()){
    let last=file.before.length;
    for(const edit of file.edits.sort((a,b)=>b.start-a.start)){
      if(edit.end>last)throw new Error('Two design changes overlap in source.');
      file.after=file.after.slice(0,edit.start)+edit.text+file.after.slice(edit.end);last=edit.start;
    }
  }
  const changed=[...files].filter(([,file])=>file.before!==file.after);
  if(!changed.length)return [];
  await check(app,changed[0][0],changed[0][1].after,Object.fromEntries(changed.map(([name,file])=>[name,file.after])));
  for(const file of files.values())if(await readFile(file.path,'utf8')!==file.before)throw new Error('The source changed while validating. The draft was not applied.');
  const written:typeof changed=[];
  try{
    for(const item of changed){const [,file]=item;await replaceSource(file.path,file.before,file.after);written.push(item);}
  }catch(error){
    for(const [,file]of written.reverse())if(await readFile(file.path,'utf8')===file.after)await replaceSource(file.path,file.after,file.before);
    throw error;
  }
  return changed.map(([file,change])=>({file,before:change.before,after:change.after}));
}
