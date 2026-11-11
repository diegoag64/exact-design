// Installed before Exact boots by the pinned-bundle adapter. App files stay
// untouched. Data operations run in the project's hidden runtime, once.
(()=>{
  const hub=window.__exactDesignHub;
  if(!hub?.available)return;
  const engine=location.pathname==='/__exact_design/engine';
  window.__exactDesignInstallRuntime=(runtime,data)=>{
    if(!data.ts||window.__exactDesignShared)return;
    const original=data.ts,version=new URL(document.baseURI).pathname;
    const pending=new Map(),baseline=new Map(),unacknowledged=new Map();
    let ready=false,receiving=false,serial=0,stateSequence=0,initial=[],joined=false,reloading=false;
    window.__exactDesignShared=true;
    const send=packet=>hub.send({...packet,op:'project:'+packet.op});
    // Use source and full declared slot shape as the compatibility boundary.
    // Routers, mutation results, device facts, and panel lifetimes stay local.
    const slots=()=>[...(globalThis.exact?.state?.[0]??[])].filter(slot=>{
      const n=slot.n,t=n?.devType;
      return n?.devName&&!n.m&&!n.devName.startsWith('#')&&!n.devName.includes('@')&&!(t&&typeof t==='object'&&!Array.isArray(t)&&'tabs'in t&&'next'in t);
    });
    function publish(){
      if(!ready||receiving||engine)return;
      const entries=[];
      for(const slot of slots()){
        const n=slot.n,type=JSON.stringify(n.devType),value=slot(),serialized=JSON.stringify(value);
        if(baseline.get(n.devName)!==serialized){baseline.set(n.devName,serialized);entries.push([n.devName,type,value]);}
      }
      if(entries.length){const seq=++stateSequence;for(const entry of entries)unacknowledged.set(entry[0],seq);send({op:'state',entries,seq});}
    }
    function apply(entries,ack){
      if(!ready){initial.push(...entries);return;}
      if(ack)for(const [name,seq]of unacknowledged)if(seq<=ack)unacknowledged.delete(name);
      const live=new Map(slots().map(slot=>[slot.n.devName,slot]));
      receiving=true;
      try{
        runtime.commit(()=>{
          for(const [name,type,value]of entries){
            const slot=live.get(name);
            if(!slot||unacknowledged.has(name)||type!==JSON.stringify(slot.n.devType)||!runtime.conforms(value,slot.n.t))continue;
            baseline.set(name,JSON.stringify(value));runtime.W(slot,value);
          }
        },'shared preview state');
      }finally{receiving=false;}
    }
    hub.listen(async packet=>{
      if(packet.event==='reload'&&engine){if(!reloading){reloading=true;location.reload();}return;}
      if(packet.event==='execute'&&engine){
        try{
          let answer;const stood=runtime.commit(()=>{answer=original(packet.source,packet.args,runtime.Store,packet.target,packet.mutation);},'shared data operation');
          if(stood===false)throw new Error(runtime.refused()?.message??'The data operation was refused.');
          if(!answer||answer.stream||answer.req){answer?.call?.abandon?.();throw new Error('Shared previews currently support TypeScript request/reply sources. Streaming and native sources need a preview adapter.');}
          const value=answer.promise?await answer.promise:answer.v;
          for(const effect of answer.effects??[])effect();
          send({op:'result',id:packet.id,value});
        }catch(error){send({op:'result',id:packet.id,error:String(error?.message??error)});}
        return;
      }
      if(engine)return;
      if(packet.event==='answer'){
        const request=pending.get(packet.id);if(!request)return;pending.delete(packet.id);
        packet.error?request.reject(new Error(packet.error)):request.resolve(packet.value);return;
      }
      if(packet.event==='authority'){
        window.__exactDesignAuthority=packet.value;
        if(ready&&packet.value)runtime.commit(()=>{},'shared preview authority');return;
      }
      if(packet.event==='state'){joined=true;apply(packet.entries,packet.ack);}
      if(packet.event==='invalidate'){
        if(!ready)return;
        runtime.commit(()=>{for(const resource of runtime.Resources)if(!data.reserved?.[resource.source])runtime.R(resource);},'shared preview data changed');
      }
    });
    if(engine){
      globalThis.exact=Object.assign(globalThis.exact??{},{data,runtime,ready:true,clock:runtime.clock,journal:runtime.journal});
      runtime.Store.load();send({op:'hello',role:'engine',version});
      // The engine loads the data module, not the app view. Its import wrapper
      // catches this sentinel so no extra app, route, or startup task is built.
      throw window.__exactDesignEngineReady;
    }
    data.answer=(source,args,_store,target,mutation)=>({promise:new Promise((resolve,reject)=>{
      const id=String(++serial);pending.set(id,{resolve,reject});send({op:'ask',id,source,args,target,mutation});
    })});
    send({op:'hello',role:'view',version});
    function mounted(){
      if(!globalThis.exact?.state||!joined){setTimeout(mounted,1);return;}
      for(const slot of slots())baseline.set(slot.n.devName,JSON.stringify(slot()));
      ready=true;apply(initial);initial=[];
      // Seed only slots absent from the shared state, retaining current filters
      // and form values when another viewport joins or reloads.
      const entries=slots().map(slot=>[slot.n.devName,JSON.stringify(slot.n.devType),slot()]);
      if(entries.length)send({op:'state',entries,seq:++stateSequence,seed:true});
      runtime.After.push(publish);
      if(window.__exactDesignAuthority)runtime.commit(()=>{},'shared preview mounted');
    }
    setTimeout(mounted,1);
    addEventListener('pagehide',()=>{for(const request of pending.values())request.reject(new Error('Preview closed.'));pending.clear();},{once:true});
  };
})();
