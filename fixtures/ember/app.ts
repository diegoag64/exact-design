import type { Answer, Sources } from './app.contract.d.ts';
type Note = { id: string; title: string; body: string; collection: string; cover: string; favorite: boolean };
const seed: Note[] = [
  {id:'1',title:'The art of paying attention',body:'Take the long way home. Notice the light on the buildings, the sound of a familiar street, the small things you usually walk past.\n\nThere is more here than we think.',collection:'Personal',cover:'blue',favorite:true},
  {id:'2',title:'Something worth making',body:'A few things I want to put into the world: a quieter place to work, a useful little tool, and a story that stays with someone.',collection:'Ideas',cover:'sage',favorite:false},
  {id:'3',title:'A slower kind of Sunday',body:'Coffee with the windows open. A book with no deadline. Time to cook something that takes a little longer.\n\nLeave some room for nothing in particular.',collection:'Personal',cover:'peach',favorite:false},
  {id:'4',title:'Less, but a little better',body:'Start with what matters. Give every detail a reason to be there. Make the useful things feel effortless.\n\nThe best version might be the simplest one.',collection:'Work',cover:'lilac',favorite:true},
  {id:'5',title:'Places to get lost',body:'A small bookshop in a new city. The path that follows the coast. A museum on a rainy afternoon.\n\nKeep a list of places that make you curious.',collection:'Personal',cover:'sage',favorite:false},
  {id:'6',title:'The beginning of an idea',body:'What if we made more space for unfinished thoughts?\n\nNot everything needs an answer yet. Some ideas just need somewhere to begin.',collection:'Ideas',cover:'blue',favorite:false},
];
let notes = structuredClone(seed), loaded = false, loadError = '';
export const grants = 'fs.read app:/data/notes.json\nfs.write app:/data/notes.json';
const valid = (items: unknown): items is Note[] => Array.isArray(items) && items.length <= 500 && new Set(items.map(n=>n?.id)).size === items.length && items.every(n=>n && ['id','title','body'].every(k=>typeof n[k]==='string') && ['Personal','Ideas','Work'].includes(n.collection) && ['blue','sage','peach','lilac'].includes(n.cover) && typeof n.favorite==='boolean');
const excerpt = (body: string) => { const first=body.split('\n')[0];return first.length > 125 ? first.slice(0,125).replace(/\s+\S*$/, '') + '…' : first; };
const sources: Sources = {
  notebook: async (_args,_store,storage) => {
    if(!loaded) {
      try { const saved=JSON.parse(new TextDecoder().decode(await storage.fs.readFile('app:/data/notes.json'))); if(!valid(saved)) throw new Error('Invalid notes');notes=saved;loaded=true; }
      catch(e) {const code=(e as {code?:string}).code;if(code!=='bake')loaded=true;if(code!=='bake' && code!=='ENOENT')loadError='Could not open your saved notes.';}
    }
    return {error:loadError,notes:notes.map(n=>({...n,excerpt:excerpt(n.body)}))};
  },
  edit: async ([op,id,title,body,collection],_store,storage) => {
    if(loadError)return {ok:false,error:loadError};
    const next=structuredClone(notes);
    if(op==='favorite') {const n=next.find(n=>n.id===id);if(n)n.favorite=!n.favorite;}
    if(op==='save') {
      if(!title.trim())return {ok:false,error:'Give your note a title.'};
      if(!['Personal','Ideas','Work'].includes(collection))return {ok:false,error:'Choose a collection.'};
      const n=next.find(n=>n.id===id);
      if(n) {n.title=title.trim().slice(0,200);n.body=body.slice(0,20000);n.collection=collection;}
      else {
        if(next.length>=500)return {ok:false,error:'Your notebook is full.'};
        let serial=1;while(next.some(n=>n.id===String(serial)))serial++;
        next.unshift({id:String(serial),title:title.trim().slice(0,200),body:body.slice(0,20000),collection,cover:'lilac',favorite:false});
      }
    }
    try {await storage.fs.atomicWriteFile('app:/data/notes.json',new TextEncoder().encode(JSON.stringify(next)));notes=next;return {ok:true,error:''};}
    catch {return {ok:false,error:'Could not save. Try again.'};}
  },
};
export const answer: Answer = (source,args,store,storage,native) => sources[source](args,store,storage,native);
