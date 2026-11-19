import type {FileSystem} from './app.contract.d.ts';
import {WorkspaceEditor,loadWorkspace} from './workspace';

/** The single workspace file of earlier releases. Projects now keep their own (see `projects.ts`); this one is read once,
 *  to migrate it, and then left in place unchanged. */
export const WORKSPACE_FILE='app:/data/design.json';
/** Where the canvas camera was when the person last left a project. Not part of undo or the timeline. */
export type Camera={x:number;y:number;zoom:number};
export function validCamera(value:unknown):value is Camera{
  const c=value as Camera;
  return !!c&&typeof c==='object'&&[c.x,c.y,c.zoom].every(Number.isFinite)&&Math.abs(c.x)<=1e7&&Math.abs(c.y)<=1e7&&c.zoom>=0.01&&c.zoom<=3;
}

/** Local workspace storage, shared by document edits and screen-library actions. */
export class WorkspacePersistence {
  error='';
  camera:Camera|null=null;
  private loading?:Promise<void>;
  private writes:Promise<unknown>=Promise.resolve();
  private saved='';
  private unreadable=false;
  constructor(readonly editor:WorkspaceEditor,readonly file=WORKSPACE_FILE){}
  load(fs:FileSystem){
    return this.loading??=this.restore(fs).catch(e=>{this.loading=undefined;throw e;});
  }
  private encode(){
    return JSON.stringify({version:1,workspace:this.editor.document,active:this.editor.active,selected:this.editor.selected,...(this.camera?{camera:this.camera}:{})});
  }
  private async restore(fs:FileSystem){
    try{
      const value=JSON.parse(new TextDecoder().decode(await fs.readFile(this.file)));
      // Earlier releases saved the workspace directly, without selection metadata.
      const wrapped=value?.workspace!==undefined;
      if(wrapped&&value.version!==1)throw new Error('Unknown saved workspace version');
      const workspace=loadWorkspace(wrapped?value.workspace:value);
      this.editor.document=workspace;
      this.editor.active=wrapped&&typeof value.active==='string'?value.active:workspace.views[0].id;
      this.editor.selected=wrapped&&typeof value.selected==='string'?value.selected:'';
      this.camera=wrapped&&validCamera(value.camera)?{x:value.camera.x,y:value.camera.y,zoom:value.camera.zoom}:null;
      this.editor.reconcile();
      this.saved=this.encode();
    }catch(e){
      const code=(e as {code?:string}).code;
      if(code==='bake')throw e;
      if(code!=='ENOENT'){
        this.unreadable=true;
        this.error='Could not open the saved workspace. Automatic saving is paused.';
      }
    }
  }
  /** Whether another tab saved this workspace since this page last loaded or saved it. */
  async changedElsewhere(fs:FileSystem){
    await this.writes.catch(()=>{});
    try{return new TextDecoder().decode(await fs.readFile(this.file))!==this.saved;}
    catch(e){if((e as {code?:string}).code==='bake')throw e;return (e as {code?:string}).code==='ENOENT'?this.saved!=='':true;}
  }
  save(fs:FileSystem,force=false):Promise<boolean>{
    // Capture now, then write in order. A slower earlier write cannot replace a newer edit.
    const text=this.encode();
    const write=this.writes.catch(()=>{}).then(async()=>{
      if(this.unreadable&&!force)return false;
      if(!force&&text===this.saved){this.error='';return true;}
      try{
        await fs.atomicWriteFile(this.file,new TextEncoder().encode(text));
        this.saved=text;this.unreadable=false;this.error='';return true;
      }catch(e){
        if((e as {code?:string}).code==='bake')throw e;
        this.error='Could not save the workspace. Press Save to retry.';return false;
      }
    });
    this.writes=write;
    return write;
  }
}
