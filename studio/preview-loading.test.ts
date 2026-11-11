import {test,expect} from 'bun:test';
import {ElementBridge} from '../tools/element-bridge';
import {suiteBrowser} from '../.exact-sdk/scripts/agent-launch.mjs';

test('many cold previews load app data and recover through reloads and server restarts',async()=>{
  let sequence=0;
  const start=(port=0)=>Bun.serve({hostname:'127.0.0.1',port,fetch:req=>{
    const url=new URL(req.url);
    if(url.pathname==='/__dev/events')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(`id: ${++sequence}\ndata: {"nonce":${sequence}}\n\n`));req.signal.addEventListener('abort',()=>{try{c.close();}catch{}});}}),{headers:{'content-type':'text/event-stream'}});
    if(url.pathname==='/data.json')return Response.json({notes:['One','Two','Three','Four','Five','Six']});
    return new Response(`<!doctype html><head><title>Cold preview</title></head><body><div id="exact-root"><main data-site="0"><p id="count">0 notes</p><div id="notes"></div></main></div><script>window.exact={plan:'fixture',instanceOf:()=>[]};window.eventsSeen=0;const source=new EventSource('/__dev/events');source.onmessage=e=>{if(JSON.parse(e.data).nonce)window.eventsSeen++};setTimeout(async()=>{const data=await(await fetch('/data.json')).json();document.getElementById('notes').replaceChildren(...data.notes.map(title=>{const el=document.createElement('p');el.className='note';el.textContent=title;return el}));document.getElementById('count').textContent=data.notes.length+' notes';},75);</script></body>`,{headers:{'content-type':'text/html'}});
  }});
  let app=start(),bridge=new ElementBridge(app.url.origin);
  const host=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response('<!doctype html><style>body{display:grid;grid-template-columns:repeat(4,320px)}iframe{width:320px;height:240px}</style>'+Array.from({length:8},(_,i)=>`<iframe src="${bridge.origin}/?__ed_frame=frame-${i}&__ed_height=240&__ed_full=1"></iframe>`).join(''),{headers:{'content-type':'text/html'}})});
  const suite=await suiteBrowser(),page=await suite.newPage({viewport:{width:1440,height:900}});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const waitLoaded=async()=>{const frames=page.frames().filter(f=>f!==page.mainFrame());await Promise.all(frames.map(f=>f.waitForFunction(()=>document.querySelectorAll('.note').length===6,undefined,{timeout:10000})));return frames;};
  try{
    await page.goto(host.url.href,{waitUntil:'domcontentloaded'});let frames=await waitLoaded();expect(frames.length).toBe(8);
    await page.evaluate(src=>{const frame=document.createElement('iframe');frame.src=src;document.body.append(frame);},bridge.origin+'/?__ed_frame=added&__ed_height=240&__ed_full=1');
    frames=await waitLoaded();expect(frames.length).toBe(9);
    await frames[0].evaluate(()=>localStorage.setItem('preview-regression','kept'));
    await Promise.all(frames.map(async f=>{await Promise.all([f.waitForNavigation({waitUntil:'domcontentloaded'}),f.evaluate(()=>location.reload())]);}));frames=await waitLoaded();
    for(const frame of frames)expect(await frame.evaluate(()=>localStorage.getItem('preview-regression'))).toBe('kept');
    const prior=await Promise.all(frames.map(f=>f.evaluate(()=>window.eventsSeen)));
    const port=app.port;app.stop(true);app=start(port);
    await Promise.all(frames.map((f,i)=>f.waitForFunction(before=>window.eventsSeen>before,prior[i],{timeout:10000})));
    const bridgePort=bridge.server.port;bridge.server.stop(true);bridge=new ElementBridge(app.url.origin,bridgePort);
    const before=await Promise.all(frames.map(f=>f.evaluate(()=>window.eventsSeen)));
    await Promise.all(frames.map((f,i)=>f.waitForFunction(count=>window.eventsSeen>count,before[i],{timeout:10000})));
    await Promise.all(frames.map(async f=>{await Promise.all([f.waitForNavigation({waitUntil:'domcontentloaded'}),f.evaluate(()=>location.reload())]);}));await waitLoaded();
    expect(errors).toEqual([]);
  }finally{await page.context().close();await suite.browser.close();bridge.server.stop(true);app.stop(true);host.stop(true);}
},30000);
