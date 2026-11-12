import {test,expect} from 'bun:test';
import {eventMessages} from '../tools/event-stream';
import {ElementBridge} from '../tools/element-bridge';

test('SSE decoding preserves chunked UTF-8, CRLF, event names, multiline data, and IDs',async()=>{
  const bytes=new TextEncoder().encode(': keepalive\r\nid: 7\r\nevent: changed\r\ndata: héllo\r\ndata: world\r\n\r\ndata: next\n\r');
  const body=new ReadableStream<Uint8Array>({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}});
  const events=[];for await(const event of eventMessages(body))events.push(event);
  expect(events).toEqual([{type:'changed',data:'héllo\nworld',lastEventId:'7'},{type:'message',data:'next',lastEventId:'7'}]);
});
test('oversized multiline events are refused and release their reader',async()=>{
  let canceled=false;
  const body=new ReadableStream<Uint8Array>({start(c){for(let i=0;i<3;i++)c.enqueue(new TextEncoder().encode('data: '+'x'.repeat(800000)+'\n'));},cancel(){canceled=true;}});
  await expect((async()=>{for await(const _event of eventMessages(body)){} })()).rejects.toThrow('too large');expect(canceled).toBe(true);
});
test('WebSocket control streams preserve upstream IDs and close their subscriptions',async()=>{
  const paths:string[]=[],headers:string[]=[];
  const app=Bun.serve({hostname:'127.0.0.1',port:0,fetch:req=>{
    paths.push(new URL(req.url).pathname);headers.push(req.headers.get('last-event-id')??'');
    return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('id: 9\ndata: {"nonce":"run"}\n\n'));req.signal.addEventListener('abort',()=>{try{c.close();}catch{}});}}),{headers:{'content-type':'text/event-stream'}});
  }}),bridge=new ElementBridge(app.url.origin);
  const socket=new WebSocket(bridge.origin.replace('http:','ws:')+'/__exact_design/live',{headers:{origin:bridge.origin}});
  const messages:any[]=[],next:((packet:any)=>void)[]=[];
  socket.onmessage=e=>{const packet=JSON.parse(String(e.data));const resolve=next.shift();if(resolve)resolve(packet);else messages.push(packet);};
  const read=()=>messages.length?Promise.resolve(messages.shift()):new Promise<any>(resolve=>next.push(resolve));
  try{
    await new Promise<void>((resolve,reject)=>{socket.onopen=()=>resolve();socket.onerror=reject;});
    expect((await fetch(bridge.origin+'/__exact_design/live',{headers:{origin:'https://foreign.invalid'}})).status).toBe(403);
    socket.send(JSON.stringify({op:'open',id:'native',path:'/__dev/events',lastEventId:'8'}));
    expect(await read()).toMatchObject({id:'native',kind:'open'});
    expect(await read()).toEqual({id:'native',kind:'event',type:'message',data:'{"nonce":"run"}',lastEventId:'9'});
    expect(paths).toEqual(['/__dev/events']);expect(headers).toEqual(['8']);
    // The pinned SDK's per-page live-reload stream shares the socket too; a native EventSource per frame starves HTTP/1.
    socket.send(JSON.stringify({op:'open',id:'page',path:'/__dev/page'}));
    expect(await read()).toMatchObject({id:'page',kind:'open'});
    expect(await read()).toMatchObject({id:'page',kind:'event',data:'{"nonce":"run"}'});
    expect(paths).toEqual(['/__dev/events','/__dev/page']);paths.length=1;
    socket.send(JSON.stringify({op:'open',id:'editor',path:'/__exact_design/events?frame=phone'}));
    expect(await read()).toMatchObject({id:'editor',kind:'open'});
    bridge.select('phone','target');expect(await read()).toMatchObject({id:'editor',kind:'event',lastEventId:'1'});
    socket.send(JSON.stringify({op:'close',id:'editor'}));
    await new Promise(resolve=>setTimeout(resolve,10));expect(bridge.listeners.size).toBe(0);
    socket.send(JSON.stringify({op:'open',id:'bad',path:'http://foreign.invalid/__dev/events'}));
    socket.send(JSON.stringify({op:'open',id:'bad',path:'/__tamber/token'}));
    await new Promise(resolve=>setTimeout(resolve,10));expect(paths).toEqual(['/__dev/events']);
  }finally{socket.close();bridge.server.stop(true);app.stop(true);}
});
test('the preview proxy forwards large native reload checkpoints',async()=>{
  const app=Bun.serve({hostname:'127.0.0.1',port:0,maxRequestBodySize:16*1024*1024,fetch:async req=>new Response(String((await req.text()).length))}),bridge=new ElementBridge(app.url.origin);
  try{
    const body=JSON.stringify({answers:['x'.repeat(700000)]});
    const response=await fetch(bridge.origin+'/__dev/checkpoint?id=test',{method:'POST',body});
    expect(response.ok).toBe(true);expect(await response.text()).toBe(String(body.length));
  }finally{bridge.server.stop(true);app.stop(true);}
});
