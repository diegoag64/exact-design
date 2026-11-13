import {resolve, basename} from 'node:path';
const dir=resolve(process.argv[2]);
const exact2=resolve(import.meta.dir,'../.exact-sdk');
const {run}=await import(resolve(exact2,'scripts/app-cli.mjs'));
process.exit(await run({dir,name:basename(dir),exact2,args:process.argv.slice(3)}));
