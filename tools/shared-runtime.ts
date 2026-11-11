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
