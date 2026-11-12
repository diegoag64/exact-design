/** Draft CSS targets source bindings, leaving Exact's application state intact. */
export function designPreview(){
  const sheet=document.createElement('style');sheet.dataset.exactDesignDraft='';document.head.append(sheet);
  let patches=[],sequence=0,table=null,tablePlan='',last='';
  async function cssValue(property,value){
    if(CSS.supports(property,value))return value;
    const plan=globalThis.exact?.plan;
    if(tablePlan!==plan){table=await(await fetch('dev-inspect.json',{cache:'no-store'})).json();tablePlan=table.plan;}
    const token=Object.entries(table?.props??{}).find(([,name])=>name===value)?.[0];
    if(token&&/^--[\w-]+$/.test(token))return `var(${token})`;
    throw new Error(`Cannot preview ${property}: ${value}`);
  }
  const texts=new Map();
  function renderText(){
    const active=new Map();
    for(const patch of patches){
      if(patch.property!=='text-content'||patch.plan!==globalThis.exact?.plan)continue;
      for(const target of patch.targets??[{site:patch.site}])for(const el of document.querySelectorAll(`#exact-root [data-site="${target.site}"]`)){
        // Literal text sites must be leaves; never replace a container's children.
        if(el.children.length)continue;
        active.set(el,patch.value);
      }
    }
    for(const [el,record]of texts){
      if(!el.isConnected){texts.delete(el);continue;}
      if(el.textContent!==record.applied)record.original=el.textContent;
      if(!active.has(el)){el.textContent=record.original;texts.delete(el);}
    }
    for(const [el,value]of active){
      let record=texts.get(el);if(!record){record={original:el.textContent,applied:value};texts.set(el,record);}
      if(el.textContent!==value)el.textContent=value;record.applied=value;
    }
  }
  const observer=new MutationObserver(()=>renderText());
  observer.observe(document.getElementById('exact-root')||document.body,{subtree:true,childList:true,characterData:true});
  async function render(){
    renderText();
    const at=++sequence,rules=[];
    for(const patch of patches){
      if(patch.property==='text-content')continue;
      if(patch.plan!==globalThis.exact?.plan)continue;
      const value=await cssValue(patch.property,patch.value);
      const declaration=document.createElement('div').style;declaration.setProperty(patch.property,value);
      for(const target of patch.targets??[{site:patch.site,properties:[patch.property]}]){
        const declarations=target.properties.map(property=>`${property}:${declaration.getPropertyValue(property)||value}!important`).join(';');
        rules.push(`#exact-root [data-site="${target.site}"]{${declarations}}`);
      }
    }
    if(at!==sequence)return;
    const text=rules.join('\n');if(text!==last){sheet.textContent=text;last=text;}
  }
  let plan=globalThis.exact?.plan;
  const timer=setInterval(()=>{if(plan!==globalThis.exact?.plan){plan=globalThis.exact?.plan;void render().catch(()=>{});}},100);
  addEventListener('pagehide',()=>{clearInterval(timer);observer.disconnect();});
  return {apply:values=>{patches=values;return render();}};
}
