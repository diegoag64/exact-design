// Only the browser test launcher starts this app-shaped fixture.
export function startDiscoveryFixture() {
  let mode='normal';
  return Bun.serve({hostname:'127.0.0.1',port:5176,fetch:async req=>{
    const url=new URL(req.url);
    if(url.pathname==='/mode' && req.method==='POST') {mode=(await req.json()).mode;return Response.json({ok:true});}
    if(url.pathname==='/routes.json') {
      if(mode==='invalid') return new Response('<html>not a manifest</html>');
      if(mode==='empty') return Response.json({routes:[]});
      return Response.json({routes:[{name:'library',pattern:'/'},{name:'noteDetail',pattern:'/note/:id'},{name:'settings',pattern:'/settings'},...(mode==='updated'?[{name:'profile',pattern:'/profile'}]:[]),{name:'notfound',pattern:'',notfound:true}]});
    }
    return new Response('<!doctype html><title>Discovery fixture</title><p>Screen preview</p>',{headers:{'content-type':'text/html'}});
  }});
}
