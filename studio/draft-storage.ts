import type {FileSystem} from './app.contract.d.ts';
/** The shared drafts file of earlier releases, keyed by app origin. Read once to migrate it, then left unchanged. */
export const LEGACY_DRAFTS_FILE='app:/data/design-drafts.json';
/** Drafts survive editor reloads, separately from both source and workspace. Each project keeps its own file, and inside
 *  it each draft belongs to the app it was made against: its verified identity, or `origin:<address>` for an app that
 *  cannot say which it is. A different app that later answers at the project's address never receives another's drafts. */
export const draftBucket=(identity:string,origin:string)=>identity||`origin:${origin}`;
export class DraftStorage {
  private values:Record<string,string>={};
  private loading?:Promise<void>;
  private writes:Promise<unknown>=Promise.resolve();
  constructor(readonly file:string){}
  load(fs:FileSystem){return this.loading??=this.read(fs).then(values=>{this.values=values;}).catch(error=>{this.loading=undefined;throw error;});}
  private async read(fs:FileSystem):Promise<Record<string,string>>{
    try{
      const data=JSON.parse(new TextDecoder().decode(await fs.readFile(this.file)));
      if(data.version!==2||!data.drafts||typeof data.drafts!=='object')throw new Error('Could not open saved design drafts.');
      return Object.fromEntries(Object.entries(data.drafts).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
    }catch(error){if((error as {code?:string}).code!=='ENOENT')throw error;return {};}
  }
  get(bucket:string){return this.values[bucket]??'';}
  /** Re-read before each write, so another tab's drafts for another identity in this project survive. */
  private update(fs:FileSystem,work:(values:Record<string,string>)=>Record<string,string>|null){
    const write=this.writes.catch(()=>{}).then(async()=>{
      const values=work(await this.read(fs));
      if(!values)return;
      await fs.atomicWriteFile(this.file,new TextEncoder().encode(JSON.stringify({version:2,drafts:values})));this.values=values;
    });
    this.writes=write;return write;
  }
  save(fs:FileSystem,bucket:string,state:string){
    return this.update(fs,values=>values[bucket]===state||(!values[bucket]&&!state)?(this.values=values,null):{...values,[bucket]:state});
  }
  /** The person confirmed that the app now verified as `identity` made the drafts saved for it while unverified. */
  adopt(fs:FileSystem,from:string,identity:string){
    return this.update(fs,values=>{
      if(!values[from]||values[identity]||from===identity)return (this.values=values,null);
      const {[from]:state,...rest}=values;return {...rest,[identity]:state};
    });
  }
}
