import {scopePreviewIdentity} from '../tools/preview-identity';
import {test,expect} from 'bun:test';
import {selectionPan} from './modules/web/canvas-navigation.js';
import {ElementBridge,bridgeFor,stopElementBridges} from '../tools/element-bridge';
import {DesignSession} from '../tools/design-session';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('layer names describe layout spans without repeating their descendants text',()=>{
  const script=readFileSync(new URL('../tools/element-bridge-client.js',import.meta.url),'utf8');
  const present=runInNewContext(script.slice(script.indexOf('function presentElement('),script.indexOf('function snapshot('))+'\npresentElement;');
  const element=(tag:string,text:string,children=false,label='')=>({tagName:tag,textContent:text,dataset:{},getAttribute:(name:string)=>name==='aria-label'?label:null,querySelector:()=>children?{}:null});
  const title='The art of paying attention',column={display:'flex',flexDirection:'column',overflowY:'visible'};
  expect(present(element('SPAN',title+' An excerpt',true),column)).toEqual({kind:'column',label:'Column'});
  expect(present(element('SPAN',title),{display:'block'})).toEqual({kind:'text',label:title});
  expect(present(element('BUTTON',title+' An excerpt',true,title),column)).toEqual({kind:'button',label:title});
  expect(present(element('DIV',title,true),{...column,overflowY:'auto'})).toEqual({kind:'scroll',label:'Scroll'});
  expect(present(element('BUTTON','',false,'A'.repeat(200)),column).label).toHaveLength(120);
});

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
    expect(html).toContain('/__exact_design/canvas-input-client.js');
    expect(html.indexOf('/__exact_design/canvas-input-client.js')).toBeLessThan(html.indexOf('original()'));
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
  const context:any={URL,crypto:{randomUUID:()=> 'test-page'},window:{},location:{href:'http://localhost/?__ed_frame=phone'},exact:{plan:'plan-1'},innerWidth:400,innerHeight:800,
    requestAnimationFrame:(fn:Function)=>{animations.set(++next,fn);return next;},cancelAnimationFrame:(id:number)=>animations.delete(id),
    addEventListener(){},setInterval(){},fetch:()=>new Promise(()=>{}),EventSource:class{},PointerEvent:class{constructor(public type:string){}},
    getComputedStyle:()=>({display:'block'}),gate:(event:any)=>picked.push(event.type),
    document:{head:{append(){}},body:{append:(el:any)=>{el.isConnected=true;overlays.push(el);}},
      getElementById:()=>inspecting?{}:null,querySelectorAll:()=>[element],
      createElement:()=>({dataset:{},style:{},isConnected:false,setAttribute(){},remove(){this.isConnected=false;}})},
  };
  const script=readFileSync(new URL('../tools/element-bridge-client.js',import.meta.url),'utf8');
  // Stub Exact's native inspector module; execute the production command and overlay code.
  runInNewContext(script.replaceAll("import('/__dev/inspect.js')",'Promise.resolve({gate})')+'\nglobalThis.testClient={deliver,snapshot};',context);
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
  const frame={frame:'phone',page:'generation-1',build:'page',plan:'old-plan',inspecting:true,nodes:[node],seen:Date.now()};
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
  s.bridge={frames:new Map([['phone',frame]]),origin:'http://localhost:9999',select:(...args:any[])=>commands.push(args),linkedHover:(frame:string,id:string)=>hovers.push([frame,id])} as any;
  await s.start();
  const source={file:'app.contract',line:10,col:5};
  events=[{event:'selection',build:'page',site:2,instance:[],source,rows:[{name:'background_color',editable:{rung:'template',file:'app.contract',at:{line:10,col:10},sha256:'before',row:'background-color',text:'#fff'}}]}];
  const picked=await s.poll();expect(picked.crumbs[0].label).toBe('Save');
  expect(picked.selectionRevision).toBe(1);expect((await s.poll()).selectionRevision).toBe(1);
  s.hover('old');s.hover('');
  expect(hovers).toEqual([['phone','old'],['phone','']]);expect(s.view()).toEqual(picked);
  s.hover('old');s.hover('removed');expect(hovers.at(-1)).toEqual(['phone','']);expect(s.view()).toEqual(picked);
  await s.edit(picked.version,0,'#000');await s.apply();expect(s.view().restoring).toBe(true);
  await s.poll();expect(commands.length).toBe(0);
  // A literal source edit can renumber every plan site without moving the element.
  frame.plan='new-plan';frame.nodes=[{...node,id:'new',identity:'[40,[]]',site:40}];
  await s.poll();expect(commands).toEqual([['phone','new']]);
  // A page may keep Exact's build ID across a reload. Reattach and reselect it.
  frame.page='generation-2';await s.poll();expect(commands).toEqual([['phone','new'],['phone','new']]);
  events=[{event:'selection',build:'page',site:40,instance:[],source,rows:[]}];
  await s.poll();expect(s.view().restoring).toBe(false);expect(s.view().selectedLabel).toBe('Save');
  expect(s.view().selectionRevision).toBe(1);
  const immediate=s.navigate('new');expect(immediate.selecting).toBe(true);expect(immediate.tree[0].selected).toBe(true);expect(immediate.rows).toEqual([]);
  expect(immediate.selectionRevision).toBe(2);
  events=[{event:'selection',build:'page',site:2,instance:[],source,rows:[]}];
  await s.poll();expect(s.view().selecting).toBe(true);
  events=[{event:'selection',build:'page',site:40,instance:[],source,rows:[]}];
  await s.poll();expect(s.view().selecting).toBe(false);
  expect(s.view().selectionRevision).toBe(2);
  events=[{event:'selection',build:'page',site:40,instance:[],source,rows:[]}];
  expect((await s.poll()).selectionRevision).toBe(3);
  s.restoring={frame:'phone',path:node.path,file:'app.contract',line:10,col:5,sha:'after',before:'after',plan:'new-plan',sent:'',since:Date.now()};
  frame.plan='third-plan';events=[{event:'selection',build:'page',site:40,instance:[],source:{...source,line:99},rows:[]}];
  await s.poll();expect(s.view().restoring).toBe(false);expect(s.view().source).toBe('');
  events=[{event:'selected',build:'page',selected:null}];await s.poll();expect(s.ended).toBe(true);
});
test('the first selection waits for instance paths in the next hierarchy snapshot',async()=>{
  let events:any[]=[];
  const request=(async(url:string,init:any)=>{
    const body=JSON.parse(init.body);
    if(url.endsWith('/events')){const reply={files:{},events,seq:1,epoch:'run'};events=[];return Response.json(reply);}
    return Response.json({ok:body.method==='hello'?{protocol:'tamber/1.18',files:{}}:{builds:['page']}});
  }) as typeof fetch;
  const node={id:'node',identity:'[12,[]]',path:'root/0:div',parent:'',depth:0,label:'Row',tag:'div',site:12,instance:[] as unknown[]};
  const frame={frame:'phone',build:'page',plan:'plan',inspecting:true,nodes:[node],seen:Date.now()};
  const s=new DesignSession('http://localhost:5174','fixture',request);
  s.bridge={frames:new Map([['phone',frame]]),origin:'http://localhost:9999',select(){}} as any;await s.start();s.navigate('node');
  events=[{event:'selection',build:'page',site:12,instance:[{region:1,key:'home'}],source:{file:'app.contract',line:3},rows:[]}];
  expect((await s.poll()).selecting).toBe(true);expect(s.view().spacingId).toBe('');
  node.instance=[{region:1,key:'home'}];
  const confirmed=await s.poll();expect(confirmed.selecting).toBe(false);expect(confirmed.source).toBe('app.contract:3');expect(confirmed.spacingId).toBe('node');
});
test('undo before a rebuild retains the source location and restores on the original plan',async()=>{
  let events:any[]=[];const commands:any[]=[];
  const request=(async(url:string)=>url.endsWith('/events')?Response.json({files:{'app.contract':'before'},events:events.splice(0),seq:1,epoch:'run'}):Response.json({ok:{protocol:'tamber/1.18',files:{'app.contract':'before'},builds:['page']}})) as typeof fetch;
  const node={id:'node',identity:'[2,[]]',path:'root/0:button',parent:'',depth:0,label:'Save',tag:'button',site:2,instance:[]};
  const frame={frame:'phone',page:'generation',build:'page',plan:'original-plan',inspecting:true,nodes:[node],seen:Date.now()};
  const s=new DesignSession('http://localhost:5174','fixture',request);
  s.bridge={frames:new Map([['phone',frame]]),origin:'http://localhost:9999',select:(...args:any[])=>commands.push(args)} as any;
  await s.start();s.picked={frame:'phone',node};
  s.restoring={frame:'phone',path:node.path,file:'app.contract',line:3,col:1,sha:'after',before:'before',plan:'original-plan',sent:'',since:Date.now()};
  s.armRestore({'app.contract':'before'});expect(s.restoring!.sha).toBe('before');expect(s.restoring!.allowSamePlan).toBe(true);
  await s.poll();expect(commands).toEqual([['phone','node']]);
  events=[{event:'selection',build:'page',site:2,instance:[],source:{file:'app.contract',line:3,col:1},rows:[]}];
  expect((await s.poll()).restoring).toBe(false);expect(s.view().source).toBe('app.contract:3');
});

test('canvas picks are pushed to the tree without waiting for the inspection poll; old pages cannot select',async()=>{
  const bridge=new ElementBridge('http://127.0.0.1:1');
  const node={id:'node',identity:'[2,[]]',path:'root/0:button',parent:'',depth:0,label:'Save',tag:'button',site:2,instance:[]};
  const post=(path:string,body:any)=>fetch(bridge.origin+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try{
    await post('/__exact_design/tree',{frame:'phone',page:'current',build:'build',plan:'plan',inspecting:true,nodes:[node]});
    const session=new DesignSession('http://localhost:1','fixture');session.bridge=bridge;
    bridge.feedback.add(session.receivePreview);
    const stream=session.preview.subscribe(new Request('http://localhost/events')).body!.getReader();await stream.read();
    expect((await post('/__exact_design/feedback',{kind:'pick',frame:'phone',page:'old',plan:'plan',id:'node'})).status).toBe(409);
    expect(session.picked).toBe(null);
    expect((await post('/__exact_design/feedback',{kind:'pick',frame:'phone',page:'current',plan:'plan',id:'node'})).ok).toBe(true);
    expect(session.view().tree[0].selected).toBe(true);expect(session.view().selecting).toBe(true);
    expect(new TextDecoder().decode((await stream.read()).value)).toContain('"updateRevision":1');
    await stream.cancel();session.preview.close();
  }finally{bridge.server.stop(true);}
});

test('canvas frames relay gestures independently of inspection while Preview input stays local',()=>{
  const script=readFileSync(new URL('../tools/canvas-input-client.js',import.meta.url),'utf8');
  const handlers:Record<string,Function>={},packets:any[]=[],frameWindow={};let inspecting=true;
  runInNewContext(script,{URL,location:{href:'http://localhost/?__ed_canvas=1'},window:frameWindow,parent:{postMessage:(packet:any)=>packets.push(packet)},document:{getElementById:()=>inspecting?{}:null},addEventListener:(name:string,fn:Function)=>{handlers[name]=fn;}});
  const event=(extra:any={})=>({code:'Space',target:{closest:()=>null},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
  let wheel=event({clientX:12,clientY:34,deltaX:5,deltaY:20,deltaMode:0,ctrlKey:true});handlers.wheel(wheel);
  expect(wheel.prevented).toBe(true);expect(packets.at(-1)).toMatchObject({kind:'exact-design:canvas',op:'wheel',x:12,y:34,dx:5,dy:20,mode:0,ctrl:true});
  handlers.keydown(event());const blur=event({target:frameWindow});handlers.blur(blur);expect(blur.stopped).toBe(true);handlers.keydown(event());handlers.keyup(event());
  expect(packets.filter(p=>p.op==='space').map(p=>p.down)).toEqual([true,true,false]);
  handlers.keydown(event({code:'KeyH'}));handlers.keydown(event({code:'KeyV'}));
  expect(packets.slice(-2).map(p=>p.tool)).toEqual(['Pan','Select']);
  const before=packets.length,typing=event({target:{closest:()=>({})}});handlers.keydown(typing);expect(typing.prevented).toBeUndefined();
  expect(packets.length).toBe(before);
  // Native inspection may stop or not be ready yet. Canvas navigation still owns input.
  inspecting=false;wheel=event({deltaY:20});handlers.wheel(wheel);
  expect(wheel.prevented).toBe(true);expect(packets.at(-1).op).toBe('wheel');
  handlers.keyup(event());expect(packets.at(-1)).toMatchObject({op:'space',down:false});
  // A normal Preview page keeps wheel, context menu and keyboard input local.
  const preview:Record<string,Function>={};const count=packets.length;
  runInNewContext(script,{URL,location:{href:'http://localhost/?__ed_canvas=0'},window:frameWindow,parent:{postMessage:(p:any)=>packets.push(p)},document:{getElementById:()=>({})},addEventListener:(name:string,fn:Function)=>{preview[name]=fn;}});
  wheel=event({deltaY:20});preview.wheel(wheel);preview.keydown(event());preview.keyup(event());preview.contextmenu(event());
  expect(wheel.prevented).toBeUndefined();expect(packets.length).toBe(count);
});

test('revealing a selected layer scrolls only ancestors inside its preview document',()=>{
  const script=readFileSync(new URL('../tools/element-bridge-client.js',import.meta.url),'utf8'),calls:any[]=[];
  const root:any={parentElement:null,clientLeft:0,clientTop:0,clientWidth:500,clientHeight:500,offsetWidth:500,offsetHeight:500,scrollWidth:500,scrollHeight:500,scrollLeft:0,scrollTop:0,css:{},getBoundingClientRect:()=>({left:0,top:0,width:500,height:500}),scrollTo(v:any){calls.push(['root',v]);Object.assign(this,{scrollLeft:v.left,scrollTop:v.top});}};
  const scroll:any={...root,parentElement:root,clientWidth:100,clientHeight:100,offsetWidth:100,offsetHeight:100,scrollWidth:400,scrollHeight:700,css:{overflowX:'auto',overflowY:'auto'},getBoundingClientRect:()=>({left:0,top:10,width:100,height:100}),scrollTo(v:any){calls.push(['inner',v]);Object.assign(this,{scrollLeft:v.left,scrollTop:v.top});}};
  const el={parentElement:scroll,getBoundingClientRect:()=>({left:200-scroll.scrollLeft,right:220-scroll.scrollLeft,top:350-scroll.scrollTop,bottom:370-scroll.scrollTop}),scrollIntoView(){throw new Error('Must not scroll embedding ancestors');}};
  const reveal=runInNewContext(script.slice(script.indexOf('function revealWithinFrame('),script.indexOf('async function select('))+';revealWithinFrame;',{document:{scrollingElement:root},getComputedStyle:(node:any)=>node.css,innerWidth:500,innerHeight:500});
  reveal(el);expect(calls).toEqual([['inner',{left:120,top:260,behavior:'instant'}]]);
  calls.length=0;reveal(el);expect(calls).toEqual([]);
  root.scrollHeight=1200;
  reveal({parentElement:root,getBoundingClientRect:()=>({left:20,right:40,top:800-root.scrollTop,bottom:820-root.scrollTop})});
  expect(calls).toEqual([['root',{left:0,top:320,behavior:'instant'}]]);
});

test('offscreen selections use the smallest camera pan and large selections align to their top',()=>{
  const view={left:200,top:50,width:1000,height:900};
  expect(selectionPan(view,{left:300,top:100,width:100,height:40})).toEqual({x:0,y:0});
  expect(selectionPan(view,{left:300,top:900,width:100,height:18.1})).toEqual({x:0,y:0});
  expect(selectionPan(view,{left:300,top:1000,width:100,height:50})).toEqual({x:0,y:132});
  expect(selectionPan(view,{left:100,top:100,width:40,height:40})).toEqual({x:-132,y:0});
  expect(selectionPan(view,{left:300,top:-100,width:100,height:1500})).toEqual({x:0,y:-182});
});


test('hover links matching instances on the same route and clears on leave or reload',async()=>{
  const bridge=new ElementBridge('http://127.0.0.1:1');
  const node=(id:string,instance:unknown[]=[])=>({id,identity:JSON.stringify([2,instance]),path:id,parent:'',depth:0,label:'Card',tag:'button',site:2,instance});
  const post=async(frame:string,url:string,nodes:any[],page='page',plan='plan',routeUrl=url)=>{
    const response=await fetch(bridge.origin+'/__exact_design/tree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({frame,page,plan,build:'build',inspecting:true,nodes,after:0,url,routeUrl,width:400,viewportHeight:800,contentHeight:1000,fullHeight:true})});
    expect(response.ok).toBe(true);
  };
  const hovered=(frame:string)=>bridge.commands.get(frame)?.find(c=>c.op==='hover')?.id??'';
  try{
    await post('phone','/notes?filter=all&__ed_frame=phone',[node('phone-first',['one']),node('phone-second',['two'])]);
    await post('tablet','/notes?__ed_frame=tablet&filter=all',[node('tablet-first',['one']),node('tablet-second',['two'])]);
    await post('other','/notes?filter=favorites',[node('other',['two'])]);
    await post('branch','/notes?filter=all',[node('missing',['one'])]);
    await post('old-build','/notes?filter=all',[node('old',['two'])],'page','old-plan');
    bridge.linkedHover('phone','phone-second');
    expect(['phone','tablet','other','branch','old-build'].map(hovered)).toEqual(['phone-second','tablet-second','','','']);
    // A leave from the previous screen must not erase a newer screen's hover.
    bridge.linkedHover('tablet','tablet-first');bridge.linkedHover('phone','');
    expect(hovered('phone')).toBe('phone-first');expect(hovered('tablet')).toBe('tablet-first');
    bridge.linkedHover('tablet','');expect(hovered('phone')).toBe('');expect(hovered('tablet')).toBe('');
    bridge.linkedHover('phone','phone-second','tree');
    await post('late','/notes?filter=all',[node('late-second',['two'])]);expect(hovered('late')).toBe('late-second');
    // Source page replacement invalidates all copies, even with the same plan.
    await post('phone','/notes?filter=all',[node('phone-second',['two'])],'reloaded');
    expect(hovered('tablet')).toBe('');expect(hovered('late')).toBe('');
    let hoverTime=0;
    const feedback=async(page:string,id:string,time=++hoverTime)=>fetch(bridge.origin+'/__exact_design/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'hover',frame:'phone',page,plan:'plan',id,time})});
    expect((await feedback('page','phone-second')).status).toBe(409);
    expect((await feedback('reloaded','missing')).status).toBe(400);
    expect((await feedback('reloaded','phone-second')).ok).toBe(true);expect(hovered('tablet')).toBe('tablet-second');
    expect((await feedback('reloaded','')).ok).toBe(true);expect(hovered('tablet')).toBe('');
    expect((await feedback('reloaded','phone-second',1)).ok).toBe(true);expect(hovered('tablet')).toBe('');
    // In-app navigation changes hover grouping, not the URL used for size updates.
    await post('tablet','/notes?filter=all',[node('tablet-second',['two'])],'page','plan','/different');
    bridge.linkedHover('phone','phone-second');expect(hovered('tablet')).toBe('');
    expect(bridge.frames.get('tablet')?.url).toBe('/notes?filter=all');
  }finally{bridge.server.stop(true);}
});

test('each viewport scopes its stored build and inspector identity before Exact boots',()=>{
  const html=`<script>const ch={nonce:null,registered:null},cp=false,bk=cp?'exact.dev.build:'+window.name:'exact.dev.build',bid=read(bk);const channel=new BroadcastChannel('exact.dev.build');sessionStorage.getItem('exact.dev.inspect');sessionStorage.getItem('exact.dev.inspect.left');m.install({fetch,report:rep,status});</script><script>app()</script>`;
  const phone=scopePreviewIdentity(html,'phone'),tablet=scopePreviewIdentity(html,'tablet');
  expect(phone).toContain(`bk=(cp?'exact.dev.build:'+window.name:'exact.dev.build')+":studio:phone",bid=`);
  expect(phone).toContain('sessionStorage.getItem("exact.dev.inspect:studio:phone")');
  expect(phone).toContain('sessionStorage.getItem("exact.dev.inspect:studio:phone.left")');
  expect(phone).toContain('m.install({key:"exact.dev.inspect:studio:phone",fetch,report:rep,');
  expect(phone).toContain("new BroadcastChannel('exact.dev.build')");
  expect(tablet).toContain(':studio:tablet');expect(tablet).not.toContain(':studio:phone');
  expect(scopePreviewIdentity(html,'')).toBe(html);
  expect(scopePreviewIdentity('<script>app()</script>','phone')).toBe('<script>app()</script>');
});

test('a full frame table evicts frames left by closed pages, but never live ones',async()=>{
  const bridge=new ElementBridge('http://127.0.0.1:1');
  const post=(frame:string)=>fetch(bridge.origin+'/__exact_design/tree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({frame,page:'page',plan:'plan',build:'build',inspecting:false,nodes:[],after:0,url:'/',routeUrl:'/',width:400,viewportHeight:800,contentHeight:800,fullHeight:false})});
  const fill=(seen:number)=>{bridge.frames.clear();for(let i=0;i<200;i++){const frame=`old~view-${i}`;bridge.frames.set(frame,{frame,page:'page',build:'build',plan:'plan',inspecting:false,nodes:[],seen:Date.now()-seen});bridge.commands.set(frame,[]);}};
  try{
    fill(10000);
    expect((await post('new~view-1')).status).toBe(200);
    expect(bridge.frames.size).toBe(200);expect(bridge.frames.has('new~view-1')).toBe(true);expect(bridge.commands.size).toBe(199);
    fill(1000);
    expect((await post('new~view-2')).status).toBe(429);
  }finally{bridge.server.stop(true);}
});
