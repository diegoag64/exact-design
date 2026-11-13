/** Adapt the pinned development bundle without changing the SDK checkout.
 * Fail closed if its runtime namespace or TypeScript install seam changes. */
export function sharedRuntime(source:string){
  const identifier='[\\w$]+';
  const namespace=source.match(new RegExp(`(?:var|let|const) (${identifier})=${identifier}\\(\\{After:\\(\\)=>[^;]+?\\}\\)`));
  const install=[...source.matchAll(new RegExp(`(${identifier})\\.ts=(${identifier})(?=,)`,'g'))];
  if(!namespace||install.length!==1||!['Store:','W:','commit:','conforms:','useSchedule:'].every(key=>namespace[0].includes(key)))return null;
  const scheduleName=namespace[0].match(/useSchedule:\(\)=>([\w$]+)/)?.[1];
  const schedule=scheduleName&&source.match(new RegExp(`${scheduleName}=(${identifier})=>\\{(${identifier})=\\1\\}`))?.[2];
  if(!schedule||!source.includes(`${schedule}?.gates()`))return null;
  const match=install[0];
  source=source.slice(0,match.index!)+match[0]+`,globalThis.__exactDesignInstallRuntime?.(${namespace[1]},${match[1]})`+source.slice(match.index!+match[0].length);
  // Only the elected view arms state-driven tasks. Replica commits still run
  // settlement, refreshes, and mutation callbacks, including local navigation.
  return source.replace(`${schedule}?.gates()`,`(!globalThis.__exactDesignShared||globalThis.__exactDesignAuthority===true)&&${schedule}?.gates()`);
}

// The pinned SDK splits the runtime and TypeScript installer into hashed chunks.
// Resolve their exported names from the bundle instead of depending on minifier names.
function runtimeChunk(source:string){
  const namespace=source.match(/(?:var|let|const) ([\w$]+)=[\w$]+\(\{((?:AGENT_ADMITTED|After):[^;]+?)\}\)/);
  if(!namespace||!['After:','Store:','W:','commit:','conforms:','useSchedule:'].every(key=>namespace[2].includes(key)))return null;
  const scheduleName=namespace[2].match(/useSchedule:\(\)=>([\w$]+)/)?.[1];
  const schedule=scheduleName&&source.match(new RegExp(`${scheduleName}=([\\w$]+)=>\\{([\\w$]+)=\\1\\}`))?.[2];
  const exported=source.match(/export\{([^}]+)\};?\s*$/)?.[1];
  const alias=exported?.split(',').map(s=>s.trim().split(/ as /)).find(parts=>parts[0]===namespace[1])?.[1];
  if(!schedule||!alias||!source.includes(`${schedule}?.gates()`))return null;
  return {alias,source:source.replace(`${schedule}?.gates()`,`(!globalThis.__exactDesignShared||globalThis.__exactDesignAuthority===true)&&${schedule}?.gates()`)};
}
export function sharedRuntimeChunk(source:string){return runtimeChunk(source)?.source??null;}

export async function sharedBundle(source:string,load:(path:string)=>Promise<string>){
  const legacy=sharedRuntime(source);if(legacy)return legacy;
  const runtime=source.match(/from["'](\.\/rt-[\w-]+\.js)["']/)?.[1];
  const installer=source.match(/import\{([^}]+)\}from["'](\.\/ts-data-[\w-]+\.js)["']/);
  const data=source.match(/,data:([\w$]+),state:/)?.[1];
  if(!runtime||!data||source.includes('__exactDesignRuntime'))return null;
  const chunk=runtimeChunk(await load(runtime));if(!chunk)return null;
  const prefix=`import{${chunk.alias} as __exactDesignRuntime}from${JSON.stringify(runtime)};\n`;
  const inline=[...source.matchAll(/([\w$]+)\.ts=[\w$]+(?=,)/g)];
  if(!installer){
    if(inline.length!==1)return null;
    const call=inline[0];
    return prefix+source.slice(0,call.index!)+call[0]+`,globalThis.__exactDesignInstallRuntime?.(__exactDesignRuntime,${call[1]})`+source.slice(call.index!+call[0].length);
  }
  if(inline.length)return null;
  const ts=await load(installer[2]);
  if([...ts.matchAll(/[\w$]+\.ts=[\w$]+(?=,)/g)].length!==1)return null;
  const names=installer[1].split(',').map(s=>s.trim().split(/ as /).at(-1));
  const calls=[...source.matchAll(new RegExp(`([\\w$]+)\\(${data},!1,\\(\\)=>import\\([\"'\x60]\\./native-[\\w-]+\\.js[\"'\x60]\\)\\)`,'g'))].filter(m=>names.includes(m[1]));
  if(calls.length!==1)return null;
  const call=calls[0];
  return prefix+source.slice(0,call.index!)+call[0]+`,globalThis.__exactDesignInstallRuntime?.(__exactDesignRuntime,${data})`+source.slice(call.index!+call[0].length);
}
