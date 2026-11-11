import { projectUrl } from '../studio/project';
import { parseRoutes } from '../studio/discovery';
import { designRequest,designEvents } from './design-session';

const MAX_BYTES = 1024 * 1024;
function localOrigin(origin: string): boolean {
  try { const u=new URL(origin); return u.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname) && u.origin===origin; }
  catch { return false; }
}
export async function readRoutes(origin: string, request: typeof fetch = fetch) {
  const response = await request(`${projectUrl(origin)}/routes.json`, {redirect:'error', signal:AbortSignal.timeout(4000), headers:{accept:'application/json'}});
  if (!response.ok) throw new Error('No route manifest found. You can still enter a route manually.');
  const reader=response.body?.getReader();
  if (!reader) throw new Error('The route manifest is empty.');
  let size=0, text=''; const decoder=new TextDecoder();
  try {
    while (true) {
      const {done,value}=await reader.read(); if(done) break;
      size+=value.byteLength;
      if(size>MAX_BYTES) throw new Error('The route manifest is too large.');
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
  } finally { await reader.cancel().catch(()=>{}); }
  let body: unknown;
  try { body=JSON.parse(text); } catch { throw new Error('This server did not return an Exact route manifest.'); }
  return parseRoutes(body);
}
export function startDiscoveryServer(port=5175) {
  return Bun.serve({hostname:'127.0.0.1',port,maxRequestBodySize:524288,idleTimeout:255,
    async fetch(req) {
      const url=new URL(req.url), origin=req.headers.get('origin');
      if(url.hostname!=='127.0.0.1' || (origin && !localOrigin(origin))) return new Response('Forbidden',{status:403});
      const headers = { 'access-control-allow-origin':origin??'http://127.0.0.1:5173', 'access-control-allow-methods':'GET, POST, OPTIONS', 'access-control-allow-headers':'content-type', 'cache-control':'no-store', vary:'Origin' };
      if(url.pathname==='/health' && req.method==='GET') return Response.json({service:'exact-design-discovery'},{headers});
      if(url.pathname==='/design/events'&&req.method==='GET'){
        const response=designEvents(url.searchParams.get('session')??'',req);
        for(const [key,value]of Object.entries(headers))response.headers.set(key,value);
        return response;
      }
      if(!['/discover','/design'].includes(url.pathname)) return new Response(null,{status:404,headers});
      if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
      if(req.method!=='POST' || !req.headers.get('content-type')?.startsWith('application/json')) return new Response(null,{status:405,headers});
      try {
        const body=await req.json();
        if(url.pathname==='/design') {
          try {return Response.json({ok:true,error:'',...await designRequest(body)},{headers});}
          catch(e) {return Response.json({ok:false,error:e instanceof Error?e.message:'Could not update the app.'},{headers});}
        }
        if(typeof body?.url!=='string') throw new Error('Choose a project server first.');
        const routes=await readRoutes(body.url);
        return Response.json({routes,error:''},{headers});
      } catch(e) {
        const message=e instanceof Error ? e.message : '';
        const error=message.includes('manifest') || message.startsWith('Use a ') || message.startsWith('Choose a ') ? message : 'Couldn’t reach the project. Check that its dev server is running, then refresh.';
        return Response.json({routes:[],error},{headers});
      }
    }
  });
}
if(import.meta.main) {
  if(process.env.EXACT_DESIGN_TEST==='1') (await import('./discovery-fixture')).startDiscoveryFixture();
  const server=startDiscoveryServer(Number(process.env.PORT??5175));
  console.log(`Screen discovery: ${server.url}`);
}
