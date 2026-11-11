import {test,expect} from 'bun:test';
import {ElementBridge} from '../tools/element-bridge';
import {DesignSession} from '../tools/design-session';

test('preview proxy injects before bootstrap, forwards routes, and refuses token and foreign-origin requests',async()=>{
  const paths:string[]=[];
  const app=Bun.serve({hostname:'127.0.0.1',port:0,fetch:req=>{
    paths.push(new URL(req.url).pathname+new URL(req.url).search);
    return new Response('<!doctype html><head><script>original()</script></head><body>App</body>',{headers:{'content-type':'text/html'}});
  }}),bridge=new ElementBridge(app.url.origin);
  try{
    const html=await(await fetch(bridge.origin+'/note?record=7&__ed_frame=view-1')).text();
    expect(paths).toEqual(['/note?record=7']);
    expect(html.indexOf('window.fetch')).toBeLessThan(html.indexOf('original()'));
    expect(html).toContain('/__exact_design/client.js');
    expect((await fetch(bridge.origin+'/__tamber/token')).status).toBe(404);
    expect((await fetch(bridge.origin+'/note',{headers:{origin:'https://unrelated.example'}})).status).toBe(403);
    expect(paths.length).toBe(1);
  }finally{bridge.server.stop(true);app.stop(true);}
});
test('tree commands are scoped to a frame and the plan it reported',async()=>{
  const bridge=new ElementBridge('http://127.0.0.1:1');
  const node={id:'node',identity:'[2,[]]',path:'root/0:button',parent:'',depth:0,label:'Save',tag:'button',site:2,instance:[]};
  const post=(frame:string,after=0)=>fetch(bridge.origin+'/__exact_design/tree',{method:'POST',headers:{origin:bridge.origin,'content-type':'application/json'},body:JSON.stringify({frame,after,build:'page',plan:'plan-1',inspecting:true,nodes:[node]})});
  try{
    expect((await post('phone')).ok).toBe(true);bridge.select('phone','node');
    expect((await(await post('tablet')).json()).commands).toEqual([]);
    const tasks=(await(await post('phone')).json()).commands;
    expect(tasks[0]).toMatchObject({id:'node',plan:'plan-1',op:'select'});
    expect((await(await post('phone',tasks[0].seq)).json()).commands).toEqual([]);
  }finally{bridge.server.stop(true);}
});
test('selection restoration waits for the new plan and verifies the source location',async()=>{
  let files={'app.contract':'before'},events:any[]=[];
  const node={id:'old',identity:'[2,[]]',path:'root/0:button',parent:'',depth:0,label:'Save',tag:'button',site:2,instance:[]};
  const frame={frame:'phone',build:'page',plan:'old-plan',inspecting:true,nodes:[node],seen:Date.now()};
  const commands:any[]=[];
  const request=(async(url:string,init:any)=>{
    const body=JSON.parse(init.body);
    if(url.endsWith('/events')){const reply={files,events,seq:1,epoch:'run'};events=[];return Response.json(reply);}
    if(body.method==='hello')return Response.json({ok:{protocol:'tamber/1.18',files}});
    if(body.method==='inspect')return Response.json({ok:{builds:['page']}});
    if(body.method==='transaction'){files={'app.contract':'after'};return Response.json({ok:{files,inverse:'undo'}});}
    throw new Error('Unexpected request');
  }) as typeof fetch;
  const s=new DesignSession('http://localhost:5174','fixture',request);
  s.bridge={frames:new Map([['phone',frame]]),origin:'http://localhost:9999',select:(...args:any[])=>commands.push(args)} as any;
  await s.start();
  const source={file:'app.contract',line:10,col:5};
  events=[{event:'selection',build:'page',site:2,instance:[],source,rows:[{name:'background_color',editable:{rung:'template',file:'app.contract',at:{line:10,col:10},sha256:'before',row:'background-color',text:'#fff'}}]}];
  const picked=await s.poll();expect(picked.crumbs[0].label).toBe('Save');
  await s.edit(picked.version,0,'#000');expect(s.view().restoring).toBe(true);
  await s.poll();expect(commands.length).toBe(0);
  // A literal source edit can renumber every plan site without moving the element.
  frame.plan='new-plan';frame.nodes=[{...node,id:'new',identity:'[40,[]]',site:40}];
  await s.poll();expect(commands).toEqual([['phone','new']]);
  events=[{event:'selection',build:'page',site:40,instance:[],source,rows:[]}];
  await s.poll();expect(s.view().restoring).toBe(false);expect(s.view().selectedLabel).toBe('Save');
  s.restoring={frame:'phone',path:node.path,file:'app.contract',line:10,col:5,sha:'after',before:'after',plan:'new-plan',sent:'',since:Date.now()};
  frame.plan='third-plan';events=[{event:'selection',build:'page',site:40,instance:[],source:{...source,line:99},rows:[]}];
  await s.poll();expect(s.view().restoring).toBe(false);expect(s.view().source).toBe('');
});
