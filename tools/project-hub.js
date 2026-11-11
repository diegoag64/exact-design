// One worker and one socket per project origin. Frames retain independent
// native dev subscriptions (their registration nonces must never be shared).
importScripts('/__exact_design/project-state-hub.js');
const clients=new Map(),streams=new Map();
let socket=null,retry=0,serial=0;
const post=(client,packet)=>{try{client.port.postMessage(packet);}catch{leave(client);}};
const project=createProjectState(clients,post);
const send=packet=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(packet));};
function connect(){
  if(socket||!streams.size)return;
  clearTimeout(retry);
  const url=new URL('/__exact_design/live',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const current=socket=new WebSocket(url);
  current.onopen=()=>{if(socket===current)for(const stream of streams.values())send({...stream.request,id:stream.id});};
  current.onmessage=e=>{
    if(socket!==current)return;
    let packet;try{packet=JSON.parse(e.data);}catch{return;}
    const stream=streams.get(packet.id);if(!stream)return;
    if(packet.kind==='event')stream.request.lastEventId=packet.lastEventId??stream.request.lastEventId;
    post(stream.client,{...packet,id:stream.localId});
  };
  current.onerror=()=>{};
  current.onclose=()=>{
    if(socket!==current)return;socket=null;
    for(const stream of streams.values())post(stream.client,{id:stream.localId,kind:'error',retry:false});
    if(streams.size)retry=setTimeout(connect,1000);
  };
}
function leave(client){
  if(!clients.delete(client.id))return;
  for(const id of client.streams.values()){send({op:'close',id});streams.delete(id);}
  client.streams.clear();project.leave(client);client.port.close();
  if(!streams.size){clearTimeout(retry);const current=socket;socket=null;current?.close();}
}
onconnect=event=>{
  const port=event.ports[0],client={port,id:String(++serial),streams:new Map(),seen:Date.now()};clients.set(client.id,client);
  port.onmessage=event=>{
    const packet=event.data;client.seen=Date.now();
    if(!packet||typeof packet!=='object')return;
    if(packet.op==='leave'){leave(client);return;}
    if(project.receive(client,packet))return;
    if(typeof packet.id!=='string'||packet.id.length>64)return;
    if(packet.op==='close'){
      const id=client.streams.get(packet.id);if(id){send({op:'close',id});streams.delete(id);client.streams.delete(packet.id);}return;
    }
    if(packet.op!=='open'||client.streams.size>=4&&!client.streams.has(packet.id)||streams.size>=800||typeof packet.path!=='string')return;
    const id=client.id+':'+packet.id;client.streams.set(packet.id,id);
    streams.set(id,{id,localId:packet.id,client,request:packet});connect();send({...packet,id});
  };
  port.start();
};
// pagehide normally releases ports immediately. This also bounds abandoned
// ports after a renderer crash; hidden tabs get two minutes to renew.
setInterval(()=>{for(const client of clients.values())if(Date.now()-client.seen>120000)leave(client);},30000);
