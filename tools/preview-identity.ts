/** Scope Exact's development identity to a viewport, not the whole browser tab.
 * Same-origin iframes share sessionStorage. On reload they otherwise all read
 * the last frame's build ID before BroadcastChannel can detect the collision. */
export function scopePreviewIdentity(html:string,frame:string){
  if(!frame||frame.length>100)return html;
  return html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi,(script,body:string)=>{
    if(!body.includes('const ch={nonce:null,registered:null')||!body.includes('m.install({fetch,report:rep,')||!/,bk=([^\n]+?),bid=/.test(body))return script;
    const literal=(value:string)=>JSON.stringify(value).replaceAll('<','\\u003c');
    const suffix=literal(':studio:'+frame),inspectKey=literal('exact.dev.inspect:studio:'+frame);
    const scoped=body.replace(/,bk=([^\n]+?),bid=/,(_match,key)=>`,bk=(${key})+${suffix},bid=`)
      .replace(/'exact\.dev\.inspect(\.left)?'/g,(_match,tail)=>literal('exact.dev.inspect:studio:'+frame+(tail??'')))
      .replace('m.install({fetch,report:rep,',()=>`m.install({key:${inspectKey},fetch,report:rep,`);
    return script.replace(body,()=>scoped);
  });
}
