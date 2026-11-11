import {createHash,randomUUID} from 'node:crypto';
import {readFile,realpath,mkdir,cp,symlink,rename,rm,mkdtemp,readdir,lstat,stat,chmod} from 'node:fs/promises';
import {resolve,relative,sep,dirname} from 'node:path';

const enums:Record<string,string[]>={
  'flex-direction':['row','column','row-reverse','column-reverse'],
  'align-items':['stretch','flex-start','center','flex-end','baseline'],
  'justify-content':['flex-start','center','flex-end','space-between','space-around','space-evenly'],
  'flex-wrap':['nowrap','wrap','wrap-reverse'],
};
const lengths=new Set(['width','height','min-width','max-width','min-height','max-height','gap','row-gap','column-gap','padding','padding-top','padding-right','padding-bottom','padding-left','margin','margin-top','margin-right','margin-bottom','margin-left']);
export const layoutProperties=new Set([...lengths,...Object.keys(enums)]);
export const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
export type LayoutSite={file:string;line:number;col:number;sha256:string;attr:string;shared:boolean};
export function literalAt(source:string,site:LayoutSite) {
  const lines=source.split('\n'),line=lines[site.line-1];
  if(line===undefined || !Number.isSafeInteger(site.col) || site.col<1) return null;
  const prefix=Buffer.from(line).subarray(0,site.col-1).toString('utf8');
  if(Buffer.byteLength(prefix)!==site.col-1) return null;
  const tail=line.slice(prefix.length),escaped=site.attr.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp('^'+escaped+'\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?)(?=\\s|$)').exec(tail);
  if(!match) return null;
  const raw=match[1];let value:string;
  try {value=raw.startsWith('"')?JSON.parse(raw):raw;} catch {return null;}
  const start=lines.slice(0,site.line-1).reduce((n,l)=>n+l.length+1,0)+prefix.length+match[0].length-raw.length;
  return {value,start,end:start+raw.length};
}
export function layoutValue(attr:string,text:string):string {
  const value=text.trim();
  if(enums[attr]) {if(!enums[attr].includes(value)) throw new Error('Choose one of the available layout options.');return JSON.stringify(value);}
  if(!lengths.has(attr)) throw new Error('This layout property is not supported.');
  const parts=value.split(/\s+/),isShorthand=attr==='padding'||attr==='margin';
  if(!value || parts.length>(isShorthand?4:1)) throw new Error(isShorthand?'Use one to four spacing values.':'Enter one size.');
  for(const part of parts) {
    if(part==='auto' && (attr.includes('width')||attr.includes('height')||attr.startsWith('margin'))) continue;
    if(!/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vh|vw)?$/.test(part)) throw new Error('Use a number, CSS length, or percentage.');
    const n=parseFloat(part);if(Math.abs(n)>10000 || (n<0&&!attr.startsWith('margin'))) throw new Error('Use a non-negative value up to 10000.');
  }
  if(parts.length===1 && /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return String(Number(value));
  return JSON.stringify(parts.map(p=>parts.length>1 && /^-?[\d.]+$/.test(p)?p+'px':p).join(' '));
}
export function patchLayout(source:string,site:LayoutSite,value:string) {
  if(digest(source)!==site.sha256) throw new Error('The source changed. Select the element again.');
  const literal=literalAt(source,site);
  if(!literal) throw new Error('This value is an expression or has moved. Edit it in source.');
  return source.slice(0,literal.start)+layoutValue(site.attr,value)+source.slice(literal.end);
}
async function ownFile(app:string,file:string) {
  const root=await realpath(app),path=await realpath(resolve(root,file)),rel=relative(root,path);
  if(!rel || rel.startsWith('..'+sep)||rel==='..'||!path.endsWith('.contract')) throw new Error('Only this app’s Contract sources can be edited.');
  return {root,path,rel};
}
export async function sourceLiteral(app:string,site:LayoutSite) {
  const {path}=await ownFile(app,site.file),source=await readFile(path,'utf8');
  return digest(source)===site.sha256?literalAt(source,site):null;
}
export async function checkLayout(app:string,file:string,source:string) {
  const cache=resolve(app,'.exact');await mkdir(cache,{recursive:true});
  const stage=await mkdtemp(resolve(cache,'layout-check-'));
  try {
    let count=0;
    const filter=async(path:string)=>{
      const rel=relative(app,path),parts=rel.split(sep);
      if(parts.some(p=>['.exact','target','dist','.git','node_modules','assets'].includes(p)))return false;
      if(++count>3000)throw new Error('This project is too large for local layout validation.');
      return (await lstat(path)).isDirectory() || /\.(contract|tamber|json)$/.test(path);
    };
    for(const name of await readdir(app)) {
      const from=resolve(app,name);
      if(await filter(from)) await cp(from,resolve(stage,name),{recursive:true,filter});
    }
    for(const name of ['assets','node_modules']) {try {await symlink(await realpath(resolve(app,name)),resolve(stage,name),'dir');}catch{/* optional */}}
    const staged=resolve(stage,file);await mkdir(dirname(staged),{recursive:true});await Bun.write(staged,source);
    const compiler=resolve(import.meta.dir,'../.exact-sdk/target/debug/contract');
    const process=Bun.spawn([compiler,'build',resolve(stage,'app.contract'),'--json','--errors-only'],{cwd:stage,stdout:'pipe',stderr:'pipe'});
    const timer=setTimeout(()=>process.kill(),15000);
    try {
      const [out,err,code]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);
      if(code!==0) {
        let message='';try {const diagnostics=JSON.parse(out);message=diagnostics.find((d:any)=>d.message)?.message??'';}catch{}
        throw new Error(message||err.trim().slice(0,300)||'Exact refused this layout change.');
      }
    } finally {clearTimeout(timer);}
  } finally {await rm(stage,{recursive:true,force:true});}
}
export type SourceInverse={file:string;before:string;after:string};
async function replaceSource(path:string,before:string,after:string) {
  const temp=path+'.exact-design-'+randomUUID();
  try {
    const mode=(await stat(path)).mode;
    await Bun.write(temp,after);
    await chmod(temp,mode);
    if(await readFile(path,'utf8')!==before)throw new Error('The source changed while validating. Select it again.');
    await rename(temp,path);
  } finally {await rm(temp,{force:true});}
}
export async function writeLayout(app:string,site:LayoutSite,value:string,check=checkLayout):Promise<SourceInverse> {
  const {root,path,rel}=await ownFile(app,site.file),before=await readFile(path,'utf8'),after=patchLayout(before,site,value);
  await check(root,rel,after);
  await replaceSource(path,before,after);
  return {file:rel,before,after};
}
export async function undoLayout(app:string,inverse:SourceInverse,check=checkLayout) {
  const {root,path,rel}=await ownFile(app,inverse.file);
  if(await readFile(path,'utf8')!==inverse.after)throw new Error('The source changed since this edit. Undo would overwrite it.');
  await check(root,rel,inverse.before);
  await replaceSource(path,inverse.after,inverse.before);
}
export const layoutOptions=(attr:string)=>enums[attr]??[];
