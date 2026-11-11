// Only the browser test launcher starts this app-shaped fixture.
export function startDiscoveryFixture() {
  let mode='normal';
  let inspecting=false,version=0,color='#ffffff',seq=0;let events:any[]=[];
  const files=()=>({'app.contract':'fixture-'+version});
  return Bun.serve({hostname:'127.0.0.1',port:5176,fetch:async req=>{
    const url=new URL(req.url);
    if(url.pathname==='/mode' && req.method==='POST') {mode=(await req.json()).mode;inspecting=false;version=0;color='#ffffff';seq=0;events=[];return Response.json({ok:true});}
    if(mode==='elements'){
      if(url.pathname==='/__tamber/token')return Response.json({token:'test-fixture-only'});
      if(url.pathname==='/__tamber/events'){const body=await req.json();return Response.json({files:files(),seq,epoch:'fixture',events:events.filter(e=>e.seq>body.after),missed:false});}
      if(url.pathname==='/__tamber'){
        const body=await req.json();
        if(body.method==='hello')return Response.json({ok:{protocol:'tamber/1.18',files:files(),local:false}});
        if(body.method==='inspect'){if('on'in body)inspecting=body.on;return Response.json({ok:{builds:['fixture-build']}});}
        if(body.method==='transaction'||body.method==='undo'){color=body.method==='undo'?'#ffffff':body.ops[0].value;version++;return Response.json({ok:{files:files(),inverse:'undo'}});}
        return Response.json({error:{message:'Unsupported fixture request'}},{status:400});
      }
      if(url.pathname==='/fixture/status')return Response.json({inspecting,version,color});
      if(url.pathname==='/fixture/select'){
        const {site}=await req.json(),button=site===2+version*40;
        events.push({event:'selection',seq:++seq,build:'fixture-build',site,instance:[],source:{file:'app.contract',line:button?5:3,col:1},rows:button?[{name:'background_color',editable:{rung:'template',file:'app.contract',at:{line:5,col:10},sha256:'fixture-'+version,row:'background-color',text:color}}]:[]});
        return Response.json({ok:true});
      }
      if(url.pathname==='/__dev/report')return Response.json({ok:true});
      if(url.pathname==='/__dev/inspect.js')return new Response(`export function gate(e){if(e.type!=='pointerup')return;const el=document.elementsFromPoint(e.clientX,e.clientY).find(n=>n.closest?.('[data-site]'))?.closest('[data-site]');if(el)fetch('/fixture/select',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({site:Number(el.dataset.site)})});}`,{headers:{'content-type':'text/javascript'}});
      return new Response(`<!doctype html><head><title>Element fixture</title></head><body><div id="exact-root"><main data-site="0"><section data-site="1" aria-label="Header"><button data-site="${2+version*40}" aria-label="Save" style="margin:40px;padding:20px"><span data-site="3">Save</span></button></section></main></div><script>window.exact={plan:'fixture-plan-${version}',instanceOf:()=>[]};fetch('/__dev/report',{method:'POST',body:JSON.stringify({kind:'register',id:'fixture-build'})});setInterval(async()=>{const s=await(await fetch('/fixture/status')).json();window.exact.plan='fixture-plan-'+s.version;document.querySelector('button[data-site]').dataset.site=String(2+s.version*40);document.querySelector('button[data-site]').style.background=s.color;let banner=document.getElementById('exact-inspect');if(s.inspecting&&!banner){banner=document.createElement('div');banner.id='exact-inspect';document.body.append(banner);}if(!s.inspecting)banner?.remove();},150);</script></body>`,{headers:{'content-type':'text/html'}});
    }
    if(url.pathname==='/routes.json') {
      if(mode==='invalid') return new Response('<html>not a manifest</html>');
      if(mode==='empty') return Response.json({routes:[]});
      return Response.json({routes:[{name:'library',pattern:'/'},{name:'noteDetail',pattern:'/note/:id'},{name:'settings',pattern:'/settings'},...(mode==='updated'?[{name:'profile',pattern:'/profile'}]:[]),{name:'notfound',pattern:'',notfound:true}]});
    }
    return new Response('<!doctype html><title>Discovery fixture</title><p>Screen preview</p>',{headers:{'content-type':'text/html'}});
  }});
}
