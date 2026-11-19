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
  // The data fetch can finish before EventSource connects. Wait for both before
  // checking the shared connection or testing reload and restart recovery.
  const waitLoaded=async()=>{const frames=page.frames().filter(f=>f!==page.mainFrame());await Promise.all(frames.map(f=>f.waitForFunction(()=>document.querySelectorAll('.note').length===6&&window.eventsSeen>0,undefined,{timeout:10000})));return frames;};
  try{
    await page.goto(host.url.href,{waitUntil:'domcontentloaded'});let frames=await waitLoaded();expect(frames.length).toBe(8);expect(bridge.connections.size).toBe(1);
    await page.evaluate(src=>{const frame=document.createElement('iframe');frame.src=src;document.body.append(frame);},bridge.origin+'/?__ed_frame=added&__ed_height=240&__ed_full=1');
    frames=await waitLoaded();expect(frames.length).toBe(9);expect(bridge.connections.size).toBe(1);
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
    expect(bridge.connections.size).toBe(1);expect(errors).toEqual([]);
  }finally{await page.context().close();await suite.browser.close();bridge.server.stop(true);app.stop(true);host.stop(true);}
},30000);

test('canvas list samples bound late rows and pagination without removing source nodes; Preview stays scrollable',async()=>{
  const source=await Bun.file(new URL('../tools/full-page-client.js',import.meta.url)).text();
  const app=Bun.serve({hostname:'127.0.0.1',port:0,fetch:req=>new URL(req.url).pathname==='/full.js'?new Response(source,{headers:{'content-type':'text/javascript'}}):new Response(`<!doctype html><style>
    html,body,#exact-root{height:100%;margin:0}main{height:100%;display:flex;flex-direction:column}header{height:60px;flex-shrink:0}.list{flex:1;min-height:0;overflow-y:auto}.rows{display:flex;flex-direction:column}.song{height:80px;flex-shrink:0}.tail{height:40px;flex-shrink:0}
    </style><div id="exact-root"><main><header>Feed</header><div class="list" data-exact-list><section><div class="rows" data-site="1">${Array.from({length:20},(_,i)=>`<a class="song" data-site="2" data-key="${i}">Song ${i}</a>`).join('')}<div class="tail" data-site="3">More</div></div></section></div></main></div>
    <script type="module">import {fullPage} from '/full.js';window.sizes=[];window.scrolls=0;window.intersections=0;window.first=document.querySelector('.song');fullPage(p=>{window.sizes.push(p);return true});
    document.querySelector('.list').addEventListener('scroll',()=>window.scrolls++);
    const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting))window.intersections++});io.observe(document.querySelector('.tail'));
    window.appendRows=()=>{for(let i=20;i<40;i++){const el=document.createElement('a');el.className='song';el.dataset.site='2';el.dataset.key=i;el.textContent='Song '+i;document.querySelector('.rows').insertBefore(el,document.querySelector('.tail'));}};
    </script>`,{headers:{'content-type':'text/html'}})});
  const suite=await suiteBrowser(),page=await suite.newPage({viewport:{width:390,height:500}});
  try{
    await page.goto(app.url+'?__ed_canvas=1&__ed_full=1&__ed_height=500&__ed_rows=5');
    await page.waitForFunction(()=>document.querySelector('[data-ed-list-sample]')?.clientHeight===400);
    expect(await page.evaluate(()=>window.sizes.at(-1).height)).toBe(500);
    await page.evaluate(()=>{window.appendRows();document.querySelector('.list').dispatchEvent(new Event('scroll'));});
    await page.waitForFunction(()=>document.querySelectorAll('.song').length===40&&document.querySelector('[data-ed-list-sample]')?.clientHeight===400);
    expect(await page.evaluate(()=>({count:document.querySelectorAll('.song').length,same:window.first===document.querySelector('.song'),scrolls:window.scrolls,intersections:window.intersections}))).toEqual({count:40,same:true,scrolls:0,intersections:0});
    // A late row resize must update the sample, not expose the next row.
    await page.evaluate(()=>document.querySelector('.song').style.height='120px');
    await page.waitForFunction(()=>document.querySelector('[data-ed-list-sample]')?.clientHeight===440);
    await page.goto(app.url+'?__ed_canvas=1&__ed_full=1&__ed_height=500&__ed_rows=10');
    await page.waitForFunction(()=>document.querySelector('[data-ed-list-sample]')?.clientHeight===800);
    await page.goto(app.url+'?__ed_canvas=1&__ed_full=1&__ed_height=500&__ed_rows=0');
    await page.waitForFunction(()=>window.sizes?.at(-1)?.height===1700);
    expect(await page.locator('[data-ed-list-sample]').count()).toBe(0);
    // Bottom padding must not expose a sliver of the next row when it exceeds the row gap.
    await page.goto(app.url+'?__ed_canvas=1&__ed_full=1&__ed_height=500&__ed_rows=5');
    await page.evaluate(()=>{const rows=document.querySelector('.rows');rows.style.paddingBottom='24px';rows.style.gap='8px';});
    await page.waitForFunction(()=>document.querySelector('[data-ed-list-sample]')?.clientHeight===432);
    expect(await page.evaluate(()=>document.querySelector('[data-ed-list-sample]').getBoundingClientRect().bottom<=document.querySelectorAll('.song')[5].getBoundingClientRect().top)).toBe(true);
    await page.goto(app.url+'?__ed_canvas=0&__ed_full=0&__ed_height=500&__ed_rows=5');
    await page.waitForFunction(()=>window.sizes?.length>0);
    expect(await page.locator('[data-ed-list-sample]').count()).toBe(0);
    await page.evaluate(()=>{document.querySelector('.list').scrollTop=100;});
    await page.waitForFunction(()=>window.scrolls>0);
    expect(await page.evaluate(()=>document.querySelector('.list').scrollTop)).toBe(100);
  }finally{await page.context().close();await suite.browser.close();app.stop(true);}
},30000);
