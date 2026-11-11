// Exact's dev events and editor commands share one project WebSocket through
// a SharedWorker. Older browsers fall back to a socket per frame.
// EventSource's HTTP/1 connections otherwise starve lazy app/data imports once
// several previews are open on the project's shared storage origin.
(()=>{
  const NativeEventSource=window.EventSource,streams=new Map(),listeners=new Set();
  let socket=null,retry=0,serial=0,leaving=false,hub=null;
  try{hub=new SharedWorker('/__exact_design/project-hub.js',{name:'exact-design-project-v2'}).port;hub.start();}catch{}
  const heartbeat=hub?setInterval(()=>hub.postMessage({op:'heartbeat'}),20000):0;
  const send=packet=>{if(hub)hub.postMessage(packet);else if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(packet));};
  const subscribe=source=>send({op:'open',id:source.id,path:source.path,lastEventId:source.lastEventId});
  function connect(){
    if(hub||leaving||socket||!streams.size)return;
    const url=new URL('/__exact_design/live',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
    const current=socket=new WebSocket(url);
    current.onopen=()=>{if(socket===current)for(const source of streams.values())subscribe(source);};
    current.onmessage=event=>{
      if(socket!==current)return;
      let packet;try{packet=JSON.parse(event.data);}catch{return;}deliver(packet);
    };
    current.onclose=()=>{
      if(socket!==current)return;socket=null;
      for(const source of streams.values()){clearTimeout(source.retry);source.readyState=0;source.emit('error');}
      if(!leaving&&streams.size)retry=setTimeout(connect,1000);
    };
    // close reports the failure and reconnects; suppress a duplicate error.
    current.onerror=()=>{};
  }
  window.__exactDesignHub={available:!!hub,send,listen:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}};
  function deliver(packet){
    if(packet.kind==='project'){for(const listener of listeners)listener(packet);return;}
      const source=streams.get(packet.id);if(!source)return;
      if(packet.kind==='open'){source.readyState=1;source.emit('open');}
      if(packet.kind==='event'){
        source.lastEventId=packet.lastEventId??source.lastEventId;
        source.emit(packet.type||'message',packet.data,source.lastEventId);
      }
      if(packet.kind==='error'){source.readyState=0;source.emit('error');clearTimeout(source.retry);if(packet.retry!==false)source.retry=setTimeout(()=>{if(streams.has(source.id))subscribe(source);},1000);}
  }
  if(hub)hub.onmessage=event=>deliver(event.data);
  class PreviewEvents extends EventTarget {
    static [Symbol.hasInstance](value){return PreviewEvents.prototype.isPrototypeOf(value)||value instanceof NativeEventSource;}
    static CONNECTING=0;static OPEN=1;static CLOSED=2;
    CONNECTING=0;OPEN=1;CLOSED=2;readyState=0;withCredentials=false;
    onopen=null;onmessage=null;onerror=null;lastEventId='';retry=0;
    constructor(value,options){
      super();const url=new URL(value,document.baseURI);
      if(url.origin!==location.origin||!['/__dev/events','/__exact_design/events'].includes(url.pathname))return new NativeEventSource(value,options);
      this.url=url.href;this.path=url.pathname+url.search;this.id=String(++serial);this.withCredentials=!!options?.withCredentials;
      streams.set(this.id,this);connect();subscribe(this);
    }
    emit(type,data,lastEventId=''){
      const event=data===undefined?new Event(type):new MessageEvent(type,{data,lastEventId,origin:location.origin});
      this.dispatchEvent(event);this['on'+type]?.call(this,event);
    }
    close(){
      if(this.readyState===2)return;this.readyState=2;clearTimeout(this.retry);streams.delete(this.id);send({op:'close',id:this.id});
      if(!streams.size){clearTimeout(retry);const current=socket;socket=null;current?.close();}
    }
  }
  window.EventSource=PreviewEvents;
  addEventListener('pagehide',()=>{leaving=true;clearInterval(heartbeat);clearTimeout(retry);for(const source of [...streams.values()])source.close();hub?.postMessage({op:'leave'});hub?.close();});
})();
