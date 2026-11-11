import type {FileSystem} from './app.contract.d.ts';
const file='app:/data/design-drafts.json';
/** Drafts survive editor reloads, separately from both source and workspace. */
export class DraftStorage {
  private values:Record<string,string>={};
  private loading?:Promise<void>;
  private writes:Promise<unknown>=Promise.resolve();
  load(fs:FileSystem){return this.loading??=this.read(fs).catch(error=>{this.loading=undefined;throw error;});}
  private async read(fs:FileSystem){
    try{
      const data=JSON.parse(new TextDecoder().decode(await fs.readFile(file)));
      if(data.version!==1||!data.drafts||typeof data.drafts!=='object')throw new Error('Could not open saved design drafts.');
      this.values=Object.fromEntries(Object.entries(data.drafts).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
    }catch(error){if((error as {code?:string}).code!=='ENOENT')throw error;}
  }
  get(origin:string){return this.values[origin]??'';}
  save(fs:FileSystem,origin:string,state:string){
    const write=this.writes.catch(()=>{}).then(async()=>{
      if(this.get(origin)===state)return;
      const values={...this.values,[origin]:state};
      await fs.atomicWriteFile(file,new TextEncoder().encode(JSON.stringify({version:1,drafts:values})));this.values=values;
    });
    this.writes=write;return write;
  }
}
