import {test,expect} from 'bun:test';
import {ElementBridge,bridgeFor,stopElementBridges} from '../tools/element-bridge';
import {DesignSession} from '../tools/design-session';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

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
    bridge.hover('phone','node');bridge.hover('phone','');
    expect((await(await post('phone')).json()).commands).toMatchObject([
      {op:'select',id:'node'}, {op:'hover',id:'',plan:'plan-1'},
    ]);
  }finally{bridge.server.stop(true);}
});
test('selection commands are pushed without another tree poll',async()=>{
  const bridge=new ElementBridge('http://127.0.0.1:1'),abort=new AbortController();
  try{
    const response=await fetch(bridge.origin+'/__exact_design/events?frame=phone',{signal:abort.signal});
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const reader=response.body!.getReader(),decoder=new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toContain(': connected');
    bridge.select('tablet','other');bridge.select('phone','target');
    const pushed=decoder.decode((await reader.read()).value);
    expect(pushed).toContain('"id":"target"');expect(pushed).not.toContain('"id":"other"');
    bridge.hover('phone','hovered');
    expect(decoder.decode((await reader.read()).value)).toContain('"op":"hover","id":"hovered"');
    bridge.hover('phone','');
    expect(decoder.decode((await reader.read()).value)).toContain('"op":"hover","id":""');
    await reader.cancel();
  }finally{abort.abort();bridge.server.stop(true);}
});
test('shutdown releases cached preview ports so a restart can reuse them',()=>{
  const target='http://127.0.0.1:51991';
  try{
    const first=bridgeFor(target),origin=first.origin;
    stopElementBridges();
    const restarted=bridgeFor(target);
    expect(restarted).not.toBe(first);expect(restarted.origin).toBe(origin);
  }finally{stopElementBridges();}
});
test('hover follows element bounds, clears safely, and does not cancel an in-flight selection',async()=>{
  const animations=new Map<number,Function>();let next=0,inspecting=true,rect={left:10,top:20,width:100,height:40};
  const picked:string[]=[],overlays:any[]=[];
  const element:any={isConnected:true,dataset:{site:'2'},tagName:'BUTTON',textContent:'Save',parentElement:null,
    closest:()=>null,checkVisibility:()=>true,getBoundingClientRect:()=>rect,getAttribute:()=>null,
    setAttribute(){},removeAttribute(){},scrollIntoView(){}};
  const context:any={URL,window:{},location:{href:'http://localhost/?__ed_frame=phone'},exact:{plan:'plan-1'},innerWidth:400,innerHeight:800,
    requestAnimationFrame:(fn:Function)=>{animations.set(++next,fn);return next;},cancelAnimationFrame:(id:number)=>animations.delete(id),
    addEventListener(){},setInterval(){},fetch:()=>new Promise(()=>{}),EventSource:class{},PointerEvent:class{constructor(public type:string){}},
    getComputedStyle:()=>({display:'block'}),gate:(event:any)=>picked.push(event.type),
    document:{head:{append(){}},body:{append:(el:any)=>{el.isConnected=true;overlays.push(el);}},
      getElementById:()=>inspecting?{}:null,querySelectorAll:()=>[element],
      createElement:()=>({dataset:{},style:{},isConnected:false,setAttribute(){},remove(){this.isConnected=false;}})},
  };
  const script=readFileSync(new URL('../tools/element-bridge-client.js',import.meta.url),'utf8');
  // Stub Exact's native inspector module; execute the production command and overlay code.
  runInNewContext(script.replace("import('/__dev/inspect.js')",'Promise.resolve({gate})')+'\nglobalThis.testClient={deliver,snapshot};',context);
  context.testClient.snapshot();const id='root/0:button';
  const selection=context.testClient.deliver({seq:1,op:'select',id,plan:'plan-1'});
  await context.testClient.deliver({seq:2,op:'hover',id,plan:'plan-1'});
  const outline=overlays.at(-1);expect(outline.style.width).toBe('100px');expect(outline.style.cssText).toContain('pointer-events:none');
  const step=()=>{const callbacks=[...animations.values()];animations.clear();for(const fn of callbacks)fn();};
  rect={...rect,left:25,width:160};step();await selection;
  expect(outline.style.left).toBe('25px');expect(outline.style.width).toBe('160px');expect(picked).toEqual(['pointerdown','pointerup']);
  await context.testClient.deliver({seq:3,op:'hover',id:'',plan:'plan-1'});expect(outline.isConnected).toBe(false);
  await context.testClient.deliver({seq:4,op:'hover',id,plan:'old-plan'});expect(outline.isConnected).toBe(false);
  await context.testClient.deliver({seq:2,op:'hover',id,plan:'plan-1'});expect(outline.isConnected).toBe(false);
  await context.testClient.deliver({seq:5,op:'hover',id,plan:'plan-1'});context.exact.plan='plan-2';step();expect(outline.isConnected).toBe(false);
  await context.testClient.deliver({seq:6,op:'hover',id,plan:'plan-2'});inspecting=false;step();expect(outline.isConnected).toBe(false);
  inspecting=true;await context.testClient.deliver({seq:7,op:'hover',id,plan:'plan-2'});element.isConnected=false;step();expect(outline.isConnected).toBe(false);
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
  const hovers:any[]=[];
  s.bridge={frames:new Map([['phone',frame]]),origin:'http://localhost:9999',select:(...args:any[])=>commands.push(args),hover:(...args:any[])=>hovers.push(args)} as any;
  await s.start();
  const source={file:'app.contract',line:10,col:5};
  events=[{event:'selection',build:'page',site:2,instance:[],source,rows:[{name:'background_color',editable:{rung:'template',file:'app.contract',at:{line:10,col:10},sha256:'before',row:'background-color',text:'#fff'}}]}];
  const picked=await s.poll();expect(picked.crumbs[0].label).toBe('Save');
  s.hover('old');s.hover('');
  expect(hovers).toEqual([['phone','old'],['phone','']]);expect(s.view()).toEqual(picked);
  s.hover('old');s.hover('removed');expect(hovers.at(-1)).toEqual(['phone','']);expect(s.view()).toEqual(picked);
  await s.edit(picked.version,0,'#000');expect(s.view().restoring).toBe(true);
  await s.poll();expect(commands.length).toBe(0);
  // A literal source edit can renumber every plan site without moving the element.
  frame.plan='new-plan';frame.nodes=[{...node,id:'new',identity:'[40,[]]',site:40}];
  await s.poll();expect(commands).toEqual([['phone','new']]);
  events=[{event:'selection',build:'page',site:40,instance:[],source,rows:[]}];
  await s.poll();expect(s.view().restoring).toBe(false);expect(s.view().selectedLabel).toBe('Save');
  const immediate=s.navigate('new');expect(immediate.selecting).toBe(true);expect(immediate.tree[0].selected).toBe(true);expect(immediate.rows).toEqual([]);
  events=[{event:'selection',build:'page',site:2,instance:[],source,rows:[]}];
  await s.poll();expect(s.view().selecting).toBe(true);
  events=[{event:'selection',build:'page',site:40,instance:[],source,rows:[]}];
  await s.poll();expect(s.view().selecting).toBe(false);
  s.restoring={frame:'phone',path:node.path,file:'app.contract',line:10,col:5,sha:'after',before:'after',plan:'new-plan',sent:'',since:Date.now()};
  frame.plan='third-plan';events=[{event:'selection',build:'page',site:40,instance:[],source:{...source,line:99},rows:[]}];
  await s.poll();expect(s.view().restoring).toBe(false);expect(s.view().source).toBe('');
  events=[{event:'selected',build:'page',selected:null}];await s.poll();expect(s.ended).toBe(true);
});
