import {createHash} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {projectUrl} from '../studio/project';

/** What the helper learned about the app at a project address.
 *  `verified`: the dev server's editing API named the app's folder, so `identity` names that folder.
 *  `unverified`: something answers at the address, but it does not say which app it is.
 *  `offline`: nothing answers at the address. */
export type AppIdentity={state:'verified'|'unverified'|'offline';identity:string;name:string;error:string};

/** An address is a connection location, not an app. Exact's local editing API (`forma` hello) names the app's folder for
 *  local clients, so the identity is a digest of that folder: it survives port changes and differs between apps and
 *  checkouts, and Apply writes to that same folder. Never reads `exact.json`, which starts the dev loop's native producers. */
export async function identifyApp(value:string,request:typeof fetch=fetch,resolveDir:(dir:string)=>Promise<string>=realpath):Promise<AppIdentity>{
  const origin=projectUrl(value),u=new URL(origin);
  if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname))return {state:'unverified',identity:'',name:'',error:'Only apps on this computer can be identified.'};
  const name=await manifestName(origin,request);
  let token='';
  try{
    const r=await request(`${origin}/__forma/token`,{redirect:'error',signal:AbortSignal.timeout(3000)});
    if(r.ok)token=String((await r.json().catch(()=>({})))?.token??'');
  }catch{return name.reached?{state:'unverified',identity:'',name:name.value,error:'The app does not expose Exact’s editing API.'}:{state:'offline',identity:'',name:'',error:'Couldn’t reach the app.'};}
  if(!token)return {state:name.reached?'unverified':'offline',identity:'',name:name.value,error:name.reached?'The app does not expose Exact’s editing API.':'Couldn’t reach the app.'};
  try{
    const r=await request(`${origin}/__forma`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{'content-type':'application/json','x-exact-forma-token':token},body:JSON.stringify({method:'hello'})});
    const body=await r.json();const hello=body?.ok??body;
    if(!r.ok||!String(hello?.protocol??'').startsWith('forma/1.'))throw new Error('unsupported');
    if(hello.local!==true||typeof hello.app!=='string'||!isAbsolute(hello.app))return {state:'unverified',identity:'',name:name.value,error:'The app did not name its folder.'};
    return {state:'verified',identity:await folderIdentity(hello.app,resolveDir),name:name.value,error:''};
  }catch{return {state:'unverified',identity:'',name:name.value,error:'The app’s editing API did not answer.'};}
}
/** A stable, opaque identity for an app folder: the studio never stores or shows the path itself. */
export async function folderIdentity(dir:string,resolveDir:(dir:string)=>Promise<string>=realpath){
  const real=await resolveDir(dir).catch(()=>dir);
  return 'app-'+createHash('sha256').update(real).digest('hex').slice(0,24);
}
async function manifestName(origin:string,request:typeof fetch){
  try{
    const r=await request(`${origin}/manifest.json`,{redirect:'error',signal:AbortSignal.timeout(3000)});
    const text=r.ok?(await r.text()).slice(0,256*1024):'';
    let value='';try{const name=JSON.parse(text)?.name;if(typeof name==='string')value=name.trim().slice(0,120);}catch{}
    return {reached:true,value};
  }catch{return {reached:false,value:''};}
}
