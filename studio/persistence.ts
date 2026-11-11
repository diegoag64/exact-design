import type {FileSystem} from './app.contract.d.ts';
import {WorkspaceEditor,loadWorkspace} from './workspace';

export const WORKSPACE_FILE='app:/data/design.json';

/** Local workspace storage, shared by document edits and screen-library actions. */
export class WorkspacePersistence {
  error='';
  private loading?:Promise<void>;
  private writes:Promise<unknown>=Promise.resolve();
  private saved='';
  private unreadable=false;
  constructor(readonly editor:WorkspaceEditor){}
  load(fs:FileSystem){
    return this.loading??=this.restore(fs).catch(e=>{this.loading=undefined;throw e;});
  }
  private encode(){
    return JSON.stringify({version:1,workspace:this.editor.document,active:this.editor.active,selected:this.editor.selected});
  }
  private async restore(fs:FileSystem){
    try{
      const value=JSON.parse(new TextDecoder().decode(await fs.readFile(WORKSPACE_FILE)));
      // Earlier releases saved the workspace directly, without selection metadata.
      const wrapped=value?.workspace!==undefined;
      if(wrapped&&value.version!==1)throw new Error('Unknown saved workspace version');
      const workspace=loadWorkspace(wrapped?value.workspace:value);
      this.editor.document=workspace;
      this.editor.active=wrapped&&typeof value.active==='string'?value.active:workspace.views[0].id;
      this.editor.selected=wrapped&&typeof value.selected==='string'?value.selected:'';
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
  save(fs:FileSystem,force=false):Promise<boolean>{
    // Capture now, then write in order. A slower earlier write cannot replace a newer edit.
    const text=this.encode();
    const write=this.writes.catch(()=>{}).then(async()=>{
      if(this.unreadable&&!force)return false;
      if(!force&&text===this.saved){this.error='';return true;}
      try{
        await fs.atomicWriteFile(WORKSPACE_FILE,new TextEncoder().encode(text));
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
