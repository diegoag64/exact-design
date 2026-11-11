/** Decode SSE independently of TCP chunk boundaries, retaining event IDs. */
export async function* eventMessages(body:ReadableStream<Uint8Array>){
  const reader=body.getReader(),decoder=new TextDecoder();let buffer='',data:string[]=[],type='message',id='',size=0;
  const line=(text:string)=>{
    if(!text){const event=data.length?{type,data:data.join('\n'),lastEventId:id}:null;data=[];size=0;type='message';return event;}
    if(text.startsWith(':'))return null;
    const at=text.indexOf(':'),field=at<0?text:text.slice(0,at),value=at<0?'':text.slice(at+1).replace(/^ /,'');
    if(field==='data'){size+=value.length;if(size>2*1024*1024)throw new Error('Preview event is too large.');data.push(value);}
    if(field==='event')type=value||'message';
    if(field==='id'&&!value.includes('\0'))id=value;
    return null;
  };
  try{
    for(;;){
      const {done,value}=await reader.read();
      buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
      if(buffer.length>2*1024*1024)throw new Error('Preview event is too large.');
      for(;;){const at=buffer.search(/[\r\n]/);if(at<0||!done&&buffer[at]==='\r'&&at===buffer.length-1)break;const text=buffer.slice(0,at);buffer=buffer.slice(at+(buffer[at]==='\r'&&buffer[at+1]==='\n'?2:1));const event=line(text);if(event)yield event;}
      if(done)break;
    }
  }finally{await reader.cancel().catch(()=>{});}
}
