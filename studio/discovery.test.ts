import {test,expect} from 'bun:test';
import {parseRoutes,hasRouteParameters} from './discovery';
import {readRoutes,startDiscoveryServer} from '../tools/discovery-server';

test('Exact routes preserve order, omit notfound, deduplicate, and identify parameters',()=>{
  expect(parseRoutes({routes:[{name:'home',pattern:'/'},{name:'noteDetail',pattern:'/note/:id'},{name:'files',pattern:'/files/*path'},{name:'alias',pattern:'/'},{name:'notfound',pattern:'',notfound:true}]})).toEqual([
    {name:'Home',route:'/',dynamic:false},{name:'Note Detail',route:'/note/:id',dynamic:true},{name:'Files',route:'/files/*path',dynamic:true}
  ]);
  expect(hasRouteParameters('/notes/7')).toBe(false);
  expect(parseRoutes({routes:[]})).toEqual([]);
  for(const value of [{}, {routes:[null]}, {routes:[{name:'bad',pattern:'//evil.com'}]}, {routes:[{name:'bad',pattern:''}]}]) expect(()=>parseRoutes(value)).toThrow();
});
test('reads a real manifest and reports missing, malformed and oversized responses',async()=>{
  const fixture=Bun.serve({port:0,hostname:'127.0.0.1',fetch:()=>Response.json({routes:[{name:'library',pattern:'/'}]})});
  try { expect(await readRoutes(fixture.url.origin)).toEqual([{name:'Library',route:'/',dynamic:false}]); }
  finally {fixture.stop(true);}
  for(const response of [new Response('missing',{status:404}),new Response('<html>app</html>'),new Response('x'.repeat(1024*1024+1))]) {
    await expect(readRoutes('http://localhost:5174', (async()=>response) as typeof fetch)).rejects.toThrow();
  }
});
test('helper admits local editor requests and refuses unrelated browser origins',async()=>{
  const server=startDiscoveryServer(0);
  const fixture=Bun.serve({port:0,hostname:'127.0.0.1',fetch:()=>Response.json({routes:[{name:'home',pattern:'/'}]})});
  const call=(origin:string)=>fetch(new URL('/discover',server.url),{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({url:fixture.url.origin})});
  try {
    const allowed=await call('http://127.0.0.1:5173');
    expect((await allowed.json()).routes[0].route).toBe('/');
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
    expect((await call('https://unrelated.example')).status).toBe(403);
    expect((await call('null')).status).toBe(403);
  } finally {server.stop(true);fixture.stop(true);}
});

test('setup re-discovers an app after another app used the same port',async()=>{
 const {answer}=await import('./app');
 const original=globalThis.fetch;
 let routes=[{name:'Onboarding Goal',route:'/onboarding/goal'}];
 const files=new Map<string,Uint8Array>();
 const storage:any={fs:{readFile:async(p:string)=>{if(!files.has(p))throw {code:'ENOENT'};return files.get(p);},atomicWriteFile:async(p:string,b:Uint8Array)=>{files.set(p,b);},mkdir:async()=>{}}};
 const call=(source:string,args:unknown[]):Promise<any>=>Promise.resolve((answer as any)(source,args,{},storage,{}));
 globalThis.fetch=(async()=>Response.json({routes,error:''})) as typeof fetch;
 try {
  await call('discover',['http://127.0.0.1:5174',[],0]);
  routes=[{name:'Discover',route:'/'},{name:'Library',route:'/library'}];
  const result=await call('library',['','setup','Beat Connect','http://127.0.0.1:5174','Phone','','',1]);
  expect(result.ok).toBe(true);
  const doc=await call('document',[result.project,1]);
  expect(doc.groups.map((g:any)=>g.name)).toEqual(['Discover','Library']);
 }finally{globalThis.fetch=original;}
});

test('the helper identifies an app by its folder, not its port, and never reads exact.json',async()=>{
  const {identifyApp}=await import('../tools/project-identity');
  const {mkdtemp,symlink,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const root=await mkdtemp(join(tmpdir(),'exact-design-identity-')),dir=join(root,'lumen'),other=join(root,'tide'),link=join(root,'lumen-link');
  await Bun.write(join(dir,'app.json'),'{}');await Bun.write(join(other,'app.json'),'{}');await symlink(dir,link);
  const paths:string[]=[];
  const app=(folder:unknown,local=true,token=true)=>(async(input:any)=>{
    const u=new URL(String(input));paths.push(u.pathname);
    if(u.pathname==='/manifest.json')return Response.json({name:'Lumen'});
    if(u.pathname==='/__forma/token')return token?Response.json({token:'t'}):new Response('missing',{status:404});
    if(u.pathname==='/__forma')return Response.json({ok:{protocol:'forma/1.18',local,app:folder}});
    return new Response('',{status:404});
  }) as typeof fetch;
  try{
    const lumen=await identifyApp('http://127.0.0.1:5177',app(dir));
    expect(lumen).toMatchObject({state:'verified',name:'Lumen'});expect(lumen.identity).toMatch(/^app-[a-f\d]{24}$/);
    expect((await identifyApp('http://127.0.0.1:6123/',app(link))).identity).toBe(lumen.identity);
    expect((await identifyApp('http://127.0.0.1:5177',app(other))).identity).not.toBe(lumen.identity);
    expect(await identifyApp('http://127.0.0.1:5177',app('lumen',false))).toMatchObject({state:'unverified',identity:''});
    expect(await identifyApp('http://127.0.0.1:5177',app(dir,true,false))).toMatchObject({state:'unverified',identity:'',name:'Lumen'});
    expect(await identifyApp('http://127.0.0.1:5177',(async()=>{throw new TypeError('refused');}) as unknown as typeof fetch)).toMatchObject({state:'offline',identity:''});
    const before=paths.length;
    expect(await identifyApp('https://example.com',app(dir))).toMatchObject({state:'unverified',identity:''});
    expect(paths.length).toBe(before);
    expect(paths).not.toContain('/exact.json');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('editing opens only on the app the project recorded, so a draft never reaches another app',async()=>{
  const {designRequest}=await import('../tools/design-session');
  const {folderIdentity}=await import('../tools/project-identity');
  const {stopElementBridges}=await import('../tools/element-bridge');
  let folder='/tmp/exact-design-lumen';
  const forma=Bun.serve({port:0,hostname:'127.0.0.1',fetch:async req=>{
    const url=new URL(req.url);
    if(url.pathname==='/__forma/token')return Response.json({token:'t'});
    if(url.pathname==='/__forma/events')return Response.json({files:{},seq:0,epoch:'e',events:[],missed:false});
    if(url.pathname==='/manifest.json')return Response.json({name:'Lumen'});
    if(url.pathname!=='/__forma')return new Response('',{status:404});
    const body=await req.json();
    if(body.method==='hello')return Response.json({ok:{protocol:'forma/1.18',files:{},local:true,app:folder}});
    if(body.method==='describe')return Response.json({ok:{ir:{tokens:[]}}});
    return Response.json({ok:{builds:[]}});
  }});
  const server=startDiscoveryServer(0);
  try{
    const origin=forma.url.origin,lumen=await folderIdentity(folder);
    await expect(designRequest({op:'open',url:origin,row:'view-1',draftState:'',identity:'app-'+'b'.repeat(24)})).rejects.toThrow('different app');
    await expect(designRequest({op:'open',url:origin,row:'view-1',draftState:''})).rejects.toThrow('different app');
    const opened=await designRequest({op:'open',url:origin,row:'view-1',draftState:'',identity:lumen});
    expect(typeof opened.session).toBe('string');
    await designRequest({op:'close',session:opened.session});
    // The helper's own endpoint answers the same identity for the studio.
    const identified=await (await fetch(new URL('/identify',server.url),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin})})).json();
    expect(identified).toMatchObject({state:'verified',identity:lumen});
    folder='/tmp/exact-design-tide';
    await expect(designRequest({op:'open',url:origin,row:'view-1',draftState:'',identity:lumen})).rejects.toThrow('different app');
  }finally{forma.stop(true);server.stop(true);stopElementBridges();}
});
