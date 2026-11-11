import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {sharedRuntime} from '../tools/shared-runtime';
const source=readFileSync(new URL('../tools/project-state-hub.js',import.meta.url),'utf8');
function fixture(){
  const clients=new Map(),messages:any[]=[];
  const hub=new Function('clients','post',source+';return createProjectState(clients,post);')(clients,(client:any,packet:any)=>messages.push({client:client.id,...packet}));
  const join=(id:string,role='view',version='v1')=>{const client={id};clients.set(id,client);hub.receive(client,{op:'project:hello',role,version});return client;};
  const send=(client:any,packet:any)=>hub.receive(client,{...packet,op:'project:'+packet.op});
  const leave=(client:any)=>{clients.delete(client.id);hub.leave(client);};
  const executions=()=>messages.filter(m=>m.event==='execute');
  const reply=(engine:any,value:any,error?:string)=>send(engine,{op:'result',id:executions().at(-1).id,value,error});
  return {clients,messages,hub,join,send,leave,executions,reply};
}
test('an engine can load before any visible screen without a reload loop',()=>{
  const f=fixture(),engine=f.join('engine','engine');expect(f.messages).toEqual([]);
  const view=f.join('phone');f.send(view,{op:'ask',id:'read',source:'notes',args:[]});
  expect(f.executions().at(-1).client).toBe(engine.id);
});
test('project data runs once, coalesces reads, serializes mutations, and refreshes every view',()=>{
  const f=fixture(),a=f.join('phone'),b=f.join('tablet'),engine=f.join('engine','engine');
  f.send(a,{op:'ask',id:'a',source:'notes',args:[]});f.send(b,{op:'ask',id:'b',source:'notes',args:[]});
  expect(f.executions()).toHaveLength(1);f.reply(engine,['initial']);
  expect(f.messages.filter(m=>m.event==='answer').map(m=>[m.client,m.value])).toEqual([['phone',['initial']],['tablet',['initial']]]);
  f.send(a,{op:'ask',id:'save-a',source:'edit',args:['one'],mutation:true});
  f.send(b,{op:'ask',id:'save-b',source:'edit',args:['two'],mutation:true});
  expect(f.executions().map(m=>m.args)).toEqual([[],['one']]);f.reply(engine,true);
  expect(f.executions().at(-1).args).toEqual(['two']);f.reply(engine,true);
  expect(f.messages.filter(m=>m.event==='invalidate').map(m=>m.client)).toEqual(['phone','tablet','phone','tablet']);
});
test('late view seeds cannot overwrite shared edits; slot shapes gate new defaults',()=>{
  const f=fixture(),a=f.join('phone');
  f.send(a,{op:'state',entries:[['query','"s"','Sunday']],seq:1});
  const b=f.join('desktop');expect(f.messages.filter(m=>m.client==='desktop'&&m.event==='state').at(-1).entries).toEqual([['query','"s"','Sunday']]);
  f.send(b,{op:'state',entries:[['query','"s"','']],seed:true,seq:1});
  const c=f.join('tablet');expect(f.messages.filter(m=>m.client==='tablet'&&m.event==='state').at(-1).entries[0][2]).toBe('Sunday');
  f.send(c,{op:'state',entries:[['query','"n"',2]],seed:true,seq:2});
  expect(f.messages.filter(m=>m.client==='phone'&&m.event==='state').at(-1).entries).toEqual([['query','"n"',2]]);
});
test('closing a visible screen keeps data authority; losing the engine never replays a mutation',()=>{
  const f=fixture(),a=f.join('phone'),b=f.join('tablet'),engine=f.join('engine','engine');
  f.send(a,{op:'ask',id:'change',source:'edit',args:[],mutation:true});f.leave(a);
  expect(f.executions()).toHaveLength(1);f.reply(engine,true);
  f.send(b,{op:'ask',id:'change-b',source:'edit',args:[],mutation:true});f.leave(engine);
  expect(f.messages.find(m=>m.id==='change-b'&&m.event==='answer').error).toContain('disconnected');
  f.join('new-engine','engine');expect(f.executions()).toHaveLength(2);
});
test('rebuilds reject outstanding writes, reload the engine, and refuse retired builds',()=>{
  const f=fixture(),a=f.join('phone'),engine=f.join('engine','engine');
  f.send(a,{op:'ask',id:'change',source:'edit',args:[],mutation:true});
  const b=f.join('tablet','view','v2');
  expect(f.messages.find(m=>m.id==='change'&&m.event==='answer').error).toContain('rebuilt');
  expect(f.messages.some(m=>m.client==='engine'&&m.event==='reload')).toBe(true);
  f.join('old-late','view','v1');f.send(a,{op:'ask',id:'old',source:'notes',args:[]});
  expect(f.messages.find(m=>m.id==='old'&&m.event==='answer').error).toContain('older build');
  const replacement=f.join('engine2','engine','v2');f.send(b,{op:'ask',id:'new',source:'notes',args:[]});
  expect(f.executions().at(-1).client).toBe('engine2');f.reply(replacement,[]);
});
test('unknown runtime bundles are left unchanged',()=>{expect(sharedRuntime('globalThis.exact={ready:true}')).toBeNull();});

test('a replacement engine hydrates prior reads before accepting queued writes',()=>{
  const f=fixture(),view=f.join('phone'),engine=f.join('engine','engine');
  f.send(view,{op:'ask',id:'read',source:'notes',args:[]});f.reply(engine,['saved']);f.leave(engine);
  f.send(view,{op:'ask',id:'write',source:'edit',args:[],mutation:true});const replacement=f.join('replacement','engine');
  expect(f.executions().at(-1).source).toBe('notes');f.reply(replacement,['saved']);
  expect(f.executions().at(-1).source).toBe('edit');f.reply(replacement,true);
});
