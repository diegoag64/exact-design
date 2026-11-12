// Presentation changes belong to the preview, never to the application's source.
export function fullPage(report){
  const query=new URL(location.href).searchParams,url=location.pathname+location.search;
  const enabled=query.get('__ed_full')==='1',minimum=Math.max(100,Math.min(10000,Number(query.get('__ed_height'))||innerHeight));
  const sheet=document.createElement('style');sheet.dataset.edFullPage='';document.head.append(sheet);
  let height=minimum,ready=false,scheduled=0,last='',closed=false,observed=null;
  const rules=`html,body{height:auto!important;min-height:0!important;overflow:visible!important}#exact-root{height:auto!important;min-height:${minimum}px!important;overflow:visible!important}[data-ed-page-grow]{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}[data-ed-page-flex]{flex-basis:auto!important;flex-shrink:0!important}[data-ed-page-position]{position:relative!important;inset:auto!important}#exact-root>main>[data-ed-page-position]{min-height:${minimum}px!important}#exact-root>main{height:auto!important;min-height:${minimum}px!important;overflow:visible!important}`;
  function measure(){
    scheduled=0;if(closed)return;
    const root=document.getElementById('exact-root')||document.body;
    if(!root)return;
    if(observed!==root){observer.disconnect();observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden']});observed=root;}
    // A presented modal or full-screen route covers the device: expanding the page underneath
    // would stack the route below its parent screen, so it keeps the viewport height.
    const presented=[...root.querySelectorAll('[navigationpresentation]')].some(el=>el.getAttribute('navigationpresentation')!=='push'&&el.checkVisibility({visibilityProperty:true}));
    if(enabled&&presented){
      sheet.disabled=true;
      for(const name of ['edPageGrow','edPagePosition','edPageScroll','edPageFlex'])for(const el of root.querySelectorAll(`[data-${name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}]`))delete el.dataset[name];
      height=minimum;
    }else if(enabled){
      // Read the authored layout without our expansion. Re-evaluating at each
      // width also releases obsolete scroll regions after responsive changes.
      sheet.disabled=true;
      const scrolls=[...root.querySelectorAll('*')].filter(el=>{
        const css=getComputedStyle(el);
        return ['auto','scroll'].includes(css.overflowY)&&el.clientWidth>=innerWidth*0.45&&el.clientHeight>=minimum*0.3&&el.checkVisibility({visibilityProperty:true});
      });
      const grow=new Set(),position=new Set(),flex=new Set();
      for(const el of scrolls){
        el.dataset.edPageScroll='';
        for(let at=el;at&&at!==root;at=at.parentElement){
          grow.add(at);
          const parent=at.parentElement&&getComputedStyle(at.parentElement);
          if(parent?.display.includes('flex')&&parent.flexDirection.startsWith('column'))flex.add(at);
          const css=getComputedStyle(at);
          if(css.position==='absolute'&&css.top!=='auto'&&css.bottom!=='auto')position.add(at);
        }
      }
      for(const el of root.querySelectorAll('[data-ed-page-grow]'))if(!grow.has(el))delete el.dataset.edPageGrow;
      for(const el of root.querySelectorAll('[data-ed-page-position]'))if(!position.has(el))delete el.dataset.edPagePosition;
      for(const el of root.querySelectorAll('[data-ed-page-scroll]'))if(!scrolls.includes(el))delete el.dataset.edPageScroll;
      for(const el of root.querySelectorAll('[data-ed-page-flex]'))if(!flex.has(el))delete el.dataset.edPageFlex;
      for(const el of flex)el.dataset.edPageFlex='';
      for(const el of grow)el.dataset.edPageGrow='';
      for(const el of position)el.dataset.edPagePosition='';
      if(sheet.textContent!==rules)sheet.textContent=rules;
      sheet.disabled=false;
      // Root bounds can shrink, unlike document.scrollHeight, which is always
      // at least the iframe height and would otherwise keep the largest value.
      const rect=root.getBoundingClientRect();
      height=Math.max(minimum,Math.ceil(rect.bottom+(parseFloat(getComputedStyle(root).marginBottom)||0)));
      for(const el of root.children){const box=el.getBoundingClientRect();height=Math.max(height,Math.ceil(box.bottom));}
      height=Math.min(50000,height);
    }else height=minimum;
    ready=true;
    const packet={kind:'size',width:innerWidth,height,viewportHeight:minimum,fullHeight:enabled,url};
    const text=JSON.stringify(packet);
    if(text!==last)Promise.resolve(report(packet)).then(ok=>{if(ok)last=text;});
  }
  const schedule=()=>{if(!scheduled&&!closed)scheduled=requestAnimationFrame(measure);};
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{subtree:true,childList:true});
  const resize=new ResizeObserver(schedule);resize.observe(document.documentElement);
  addEventListener('resize',schedule);addEventListener('load',schedule,true);
  document.fonts?.ready.then(schedule);schedule();
  addEventListener('pagehide',()=>{closed=true;cancelAnimationFrame(scheduled);observer.disconnect();resize.disconnect();});
  return {snapshot:()=>ready?{contentHeight:height,viewportHeight:minimum,fullHeight:enabled,width:innerWidth,url}:{}};
}
