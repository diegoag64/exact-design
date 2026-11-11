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
