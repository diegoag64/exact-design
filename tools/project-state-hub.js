// SharedWorker-owned state and source queue. Ports and values never cross
// project origins. A hidden runtime owns the application's data module.
function createProjectState(clients,post){
  const state=new Map(),reads=new Map(),history=new Map(),queue=[],retired=new Set();
  let version='',engine=null,warmed=null,active=null,serial=0,authority=null;
  const emit=(client,event)=>post(client,{kind:'project',...event});
  const views=()=>[...clients.values()].filter(c=>c.project?.role==='view'&&c.project.version===version);
  const broadcast=event=>{for(const client of views())emit(client,event);};
  function elect(){
    const next=views()[0]??null;if(next===authority)return;authority=next;
    for(const client of views())emit(client,{event:'authority',value:client===authority});
  }
  function chooseEngine(){
    if(!version)return;
    engine=[...clients.values()].find(c=>c.project?.role==='engine'&&c.project.version===version)??null;
    for(const client of clients.values())if(client.project?.role==='engine'&&client.project.version!==version)emit(client,{event:'reload'});
    if(engine&&engine!==warmed){
      warmed=engine;
      // Carried Exact checkpoints can skip initial reads after a rebuild.
      // Rehydrate module globals before the new engine accepts any writes.
      const warm=[];
      for(const [key,recipe]of history){
        let job=reads.get(key);
        if(job){const at=queue.indexOf(job);if(at>=0)queue.splice(at,1);}
        else {job={...recipe,key,id:String(++serial),mutation:false,requests:[]};reads.set(key,job);}
        warm.push(job);
      }
      queue.unshift(...warm);
    }
    pump();
  }
  function finish(result,resume=true){
    if(!active||result.id!==active.id||result.client!==engine)return;
    const job=active;active=null;if(!job.mutation){reads.delete(job.key);if(!result.error){history.set(job.key,{source:job.source,args:job.args,target:job.target});if(history.size>256)history.delete(history.keys().next().value);}}
    for(const request of job.requests)if(clients.has(request.client.id))emit(request.client,{event:'answer',id:request.id,...result.error?{error:result.error}:{value:result.value}});
    if(job.mutation)broadcast({event:'invalidate'});
    if(resume)pump();
  }
  function pump(){
    if(!engine||active||!queue.length)return;
    active=queue.shift();emit(engine,{event:'execute',id:active.id,source:active.source,args:active.args,target:active.target,mutation:active.mutation});
  }
  function leave(client){
    if(client===engine){
      if(active)finish({id:active.id,client,error:'The data runtime disconnected. Check the result before retrying this change.'},false);
      engine=null;chooseEngine();
    }
    for(const job of queue)job.requests=job.requests.filter(r=>r.client!==client);
    elect();
  }
  function receive(client,packet){
    if(typeof packet.op!=='string'||!packet.op.startsWith('project:'))return false;
    if(packet.op==='project:hello'){
      if(!['engine','view'].includes(packet.role)||typeof packet.version!=='string'||packet.version.length>1024)return true;
      client.project={role:packet.role,version:packet.version};
      if(packet.role==='view'&&packet.version!==version&&!retired.has(packet.version)){
        if(version)retired.add(version);version=packet.version;
        // Do not replay an operation that might already have written data.
        if(active)finish({id:active.id,client:engine,error:'The app rebuilt during this operation. Check the result before retrying.'},false);
        for(const job of queue.splice(0))for(const request of job.requests)emit(request.client,{event:'answer',id:request.id,error:'The app rebuilt before this operation ran.'});
        reads.clear();engine=null;
      }
      if(packet.role==='view')emit(client,{event:'state',entries:[...state.values()]});
      chooseEngine();elect();return true;
    }
    if(!client.project)return true;
    if(packet.op==='project:result'){finish({...packet,client});return true;}
    if(packet.op==='project:state'&&client.project.role==='view'&&client.project.version===version){
      if(!Array.isArray(packet.entries)||packet.entries.length>500)return true;
      const entries=packet.entries.filter(e=>Array.isArray(e)&&e.length===3&&typeof e[0]==='string'&&e[0].length<=512&&typeof e[1]==='string'&&e[1].length<=8192).filter(e=>!packet.seed||!state.has(e[0])||state.get(e[0])[1]!==e[1]);
      for(const entry of entries)state.set(entry[0],entry);
      while(state.size>500)state.delete(state.keys().next().value);
      for(const view of views())emit(view,{event:'state',entries,ack:view===client?packet.seq:undefined});
      return true;
    }
    if(packet.op==='project:ask'&&client.project.role==='view'){
      if(client.project.version!==version){emit(client,{event:'answer',id:packet.id,error:'This preview belongs to an older build.'});return true;}
      if(typeof packet.id!=='string'||typeof packet.source!=='string'||!Array.isArray(packet.args)||queue.length>=256){emit(client,{event:'answer',id:packet.id,error:'The shared data queue is full or the request is invalid.'});return true;}
      const key=JSON.stringify([packet.source,packet.args]),mutation=packet.mutation===true;
      let job=!mutation&&reads.get(key);
      if(!job){job={id:String(++serial),source:packet.source,args:packet.args,target:packet.target,mutation,key,requests:[]};queue.push(job);if(!mutation)reads.set(key,job);}
      job.requests.push({client,id:packet.id});pump();return true;
    }
    return true;
  }
  return {receive,leave};
}
