import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AppSession,easError,expoOpen,expoRequest,expoStatus,sessionStatus,type Eas} from '../tools/expo-sessions';

/** A session over a fake build and a fake EAS CLI that records each command and the token it ran with. */
async function harness(options:{whoami?:string;alive?:boolean;watchMs?:number}={}){
  const root=await mkdtemp(join(tmpdir(),'expo-sessions-')),appDir=join(root,'app'),cache=join(root,'cache'),bundle=join(root,'build','Ember.app');
  await mkdir(appDir,{recursive:true});await mkdir(bundle,{recursive:true});await mkdir(cache,{recursive:true});
  await writeFile(join(appDir,'app.json'),JSON.stringify({name:'Ember',app:{id:'dev.exactdesign.ember'},protocol_handlers:[{protocol:'web+ember',url:'/open?u=%s'}]}));
  await writeFile(join(bundle,'Info.plist'),'plist');
  const calls:string[][]=[],tokens:string[]=[];let signature='s1',builds=0,alive=options.alive??true,getFails=false;
  const run:Eas=async(args,{token})=>{calls.push(args);tokens.push(token);
    if(args[0]==='whoami'){if(options.whoami===undefined)return 'fixture-team (authenticated using EXPO_TOKEN)\nme@example.com\n';throw new Error(options.whoami);}
    if(args[0]==='init')return 'Creating…\n{"status":"created","projectId":"0657a9ef-78f2-4956-86be-071dc82383dc","owner":"fixture-team","slug":"exact-design-ember"}';
    if(args[0]==='simulator:start')return JSON.stringify({id:`session-${calls.filter(c=>c[0]==='simulator:start').length}`,deviceRunSessionUrl:'https://expo.dev/accounts/fixture-team/projects/exact-design-ember/simulator-sessions/x',remoteConfig:{webPreviewUrl:'https://expo.dev/accounts/fixture-team/projects/exact-design-ember/simulator-sessions/x/preview',agentDeviceRemoteSessionToken:'secret'}});
    if(args[0]==='simulator:get'){if(getFails)throw new Error('network down');return JSON.stringify({status:alive?'IN_PROGRESS':'STOPPED'});}
    return '';};
  const app={dir:cache,appDir,get signature(){return signature;},refresh:async()=>signature,subscribe:()=>()=>true,
    build:async(_app:unknown,sig:string,hooks:any)=>{builds++;hooks.step('done','Built in 1 s');expect(sig).toBe(signature);return bundle;}};
  const service={stopping:false,enqueue:(job:()=>Promise<void>)=>job(),target:{available:async()=>{}},checkRunning(){},now:()=>0};
  const session=new AppSession(app as any,service as any,run,options.watchMs??60000);
  return {session,calls,tokens,cache,setSignature:(s:string)=>{signature=s;},builds:()=>builds,setAlive:(a:boolean)=>{alive=a;},setGetFails:(f:boolean)=>{getFails=f;}};
}
const commands=(calls:string[][])=>calls.map(c=>c.slice(0,2).join(' '));

test('setup checks the token with Expo, links a project for the app, and keeps the token private',async()=>{
  const h=await harness();
  expect(await h.session.setup('  expo_token  ')).toEqual({ok:true,error:'',account:'fixture-team'});
  expect(commands(h.calls)).toEqual(['whoami','init --non-interactive']);
  expect(h.tokens).toEqual(['expo_token','expo_token']);
  expect(await readFile(join(h.cache,'expo','token'),'utf8')).toBe('expo_token');
  expect((await stat(join(h.cache,'expo','token'))).mode&0o777).toBe(0o600);
  expect(JSON.parse(await readFile(join(h.cache,'expo','project','app.json'),'utf8'))).toEqual({expo:{name:'Ember',slug:'exact-design-ember'}});
  const snapshot=h.session.snapshot();
  expect(snapshot.configured).toBe(true);expect(snapshot.account).toBe('fixture-team');
  expect(JSON.stringify(snapshot)).not.toContain('expo_token');
  expect(await h.session.setup('')).toEqual({ok:true,error:'',account:''});
  expect(existsSync(join(h.cache,'expo','token'))).toBe(false);
  expect(h.session.snapshot().configured).toBe(false);
});

test('setup refuses a token Expo rejects without saving it',async()=>{
  const h=await harness({whoami:'Unauthorized'});
  const reply=await h.session.setup('wrong');
  expect(reply.ok).toBe(false);expect(reply.error).toContain('Expo didn’t accept that token');
  expect(existsSync(join(h.cache,'expo','token'))).toBe(false);
  expect((await h.session.setup('has space')).ok).toBe(false);
});

test('testing starts one session, uploads the build once, and opens the screen through its deep link',async()=>{
  const h=await harness();await h.session.setup('expo_token');h.calls.length=0;
  await h.session.start('run-1','test','native-iphone-17','/diary/add');
  expect(h.session.snapshot()).toMatchObject({state:'idle',message:'Ready on a cloud iPhone 17.',running:true,device:'native-iphone-17',url:'https://expo.dev/accounts/fixture-team/projects/exact-design-ember/simulator-sessions/x/preview',stale:false,steps:[]});
  expect(commands(h.calls)).toEqual(['simulator:start --platform','simulator:control app.install','simulator:control app.approveUrlScheme','simulator:control app.openUrl','simulator:control app.openUrl']);
  const start=h.calls[0]!;
  expect(start.slice(start.indexOf('--device'),start.indexOf('--device')+2)).toEqual(['--device','iPhone 17']);
  expect(start).toContain('--max-idle-time-minutes');
  expect(h.calls[1]![2]).toEndWith('app.tar.gz');expect(existsSync(h.calls[1]![2]!)).toBe(true);
  expect(h.calls[2]!.slice(2,4)).toEqual(['dev.exactdesign.ember','web+ember']);
  expect(h.calls[3]![3]).toBe('web+ember://');expect(h.calls[4]![3]).toBe('web+ember://diary/add');
  expect(JSON.stringify(h.session.snapshot())).not.toContain('secret');

  // The same token never runs twice; a new one reuses the running session and the uploaded build.
  h.calls.length=0;await h.session.start('run-1','test','native-iphone-17','/');expect(h.calls).toEqual([]);
  await h.session.start('run-2','test','native-iphone-17','/');
  expect(commands(h.calls)).toEqual(['simulator:get --id','simulator:control app.openUrl']);
  expect(h.builds()).toBe(2);

  // Changed source is stale until the next test uploads it.
  h.setSignature('s2');expect(h.session.snapshot().stale).toBe(true);
  h.calls.length=0;await h.session.start('run-3','test','native-iphone-17','/');
  expect(commands(h.calls)).toEqual(['simulator:get --id','simulator:control app.install','simulator:control app.approveUrlScheme','simulator:control app.openUrl']);
  expect(h.session.snapshot().stale).toBe(false);
});

test('another device replaces the session, an expired one restarts, and stop ends it',async()=>{
  const h=await harness();await h.session.setup('expo_token');
  await h.session.start('a','test','native-iphone-17','/');h.calls.length=0;
  await h.session.start('b','test','native-ipad-pro-11','/');
  expect(commands(h.calls).slice(0,2)).toEqual(['simulator:stop --id','simulator:start --platform']);
  expect(h.calls[0]![2]).toBe('session-1');
  expect(h.session.snapshot()).toMatchObject({device:'native-ipad-pro-11',message:'Ready on a cloud iPad Pro 11.'});
  h.setAlive(false);h.calls.length=0;
  await h.session.start('c','test','native-ipad-pro-11','/');
  expect(commands(h.calls).slice(0,3)).toEqual(['simulator:get --id','simulator:start --platform','simulator:control app.install']);
  h.calls.length=0;await h.session.start('d','stop','native-ipad-pro-11','/');
  expect(commands(h.calls)).toEqual(['simulator:stop --id']);
  expect(h.session.snapshot()).toMatchObject({running:false,url:'',message:'Cloud iPhone stopped.'});
});

test('testing before setup asks for it and runs nothing',async()=>{
  const h=await harness();await h.session.start('a','test','native-iphone-17','/');
  expect(h.session.snapshot()).toMatchObject({state:'error',error:'Set up Expo Simulators for this project first.',running:false});
  expect(h.calls).toEqual([]);
});

test('EAS CLI errors keep the failing line and never the token',()=>{
  expect(easError('★ eas-cli@27.10.0 is now available.\n- Running app.install\n✖ Failed to run app.install on simulator session x\nThe simulator could not run app.install: Device .ipa builds are not supported.\n    Error: simulator:control command failed.')).toBe('The simulator could not run app.install: Device .ipa builds are not supported.');
  expect(easError('Error: request with token abc123 was rejected','abc123')).toBe('request with token … was rejected');
});

test('requests name a native device, a route and an action',()=>{
  expect(expoRequest({project:'http://127.0.0.1:5174',run:'1',device:'native-iphone-17',route:'/diary/add',action:'test'})).toEqual({project:'http://127.0.0.1:5174',run:'1',device:'native-iphone-17',route:'/diary/add',action:'test'});
  expect(expoRequest({project:'http://127.0.0.1:5174',run:'',device:'native-iphone-17',route:''}).action).toBe('test');
  for(const bad of [{project:'x',run:'',device:'phone',route:'/'},{project:'x',run:'',device:'native-iphone-17',route:'//evil'},{project:'x',run:'',device:'native-iphone-17',route:'/',action:'delete'}])expect(()=>expoRequest(bad)).toThrow();
});

test('the open tab needs the studio’s key, starts the test, and its status never carries the token',async()=>{
  const h=await harness();await h.session.setup('expo_token');
  const service={project:async()=>h.session} as any;
  const page=(key:string,route='/diary/add')=>new URL(`http://127.0.0.1:5175/expo/open?project=${encodeURIComponent('http://127.0.0.1:5174')}&key=${key}&device=native-iphone-17&route=${encodeURIComponent(route)}`);
  expect((await expoOpen(page('wrong'),service)).status).toBe(403);
  expect((await expoStatus(new URL('http://127.0.0.1:5175/expo/status?project=x&key=wrong'),service)).status).toBe(403);
  expect(h.calls.filter(c=>c[0]==='simulator:start')).toEqual([]);
  // The key reaches the studio only inside the origin-checked stream's `open` link.
  const {expoStream}=await import('../tools/expo-sessions');
  const stream=expoStream({project:'http://127.0.0.1:5174',run:'',device:'native-iphone-17',route:'/'},new Request('http://127.0.0.1:5175/expo',{method:'POST'}),service);
  const reader=stream.body!.getReader(),first=new TextDecoder().decode((await reader.read()).value);await reader.cancel();
  const open=new URL(JSON.parse(first.slice(first.indexOf('{'))).open);
  expect(open.pathname).toBe('/expo/open');expect(open.searchParams.get('project')).toBe('http://127.0.0.1:5174');
  const key=open.searchParams.get('key')!;
  const response=await expoOpen(page(key),service);
  expect(response.status).toBe(200);
  const html=await response.text();
  expect(html).toContain('/diary/add on a cloud iPhone 17');expect(html).not.toContain('expo_token');
  await Bun.sleep(50);
  expect(h.calls.some(c=>c[0]==='simulator:start')).toBe(true);
  const status=await (await expoStatus(new URL(`http://127.0.0.1:5175/expo/status?project=x&key=${key}`),service)).json();
  expect(status.running).toBe(true);expect(JSON.stringify(status)).not.toContain('expo_token');
  expect((await expoOpen(page(key,'//evil'),service)).status).toBe(400);
});

test('a session ended on expo.dev leaves the drawer; a failed check keeps it',async()=>{
  const h=await harness({watchMs:20});await h.session.setup('expo_token');
  await h.session.start('a','test','native-iphone-17','/');
  h.setGetFails(true);await Bun.sleep(80);
  expect(h.session.snapshot().running).toBe(true);
  h.setGetFails(false);h.setAlive(false);await Bun.sleep(80);
  expect(h.session.snapshot()).toMatchObject({running:false,url:'',state:'idle',message:'The cloud iPhone ended on expo.dev.'});
  // The watch stops with the session.
  const checks=h.calls.filter(c=>c[0]==='simulator:get').length;await Bun.sleep(80);
  expect(h.calls.filter(c=>c[0]==='simulator:get').length).toBe(checks);
  expect([sessionStatus('IN_PROGRESS'),sessionStatus('starting'),sessionStatus('STOPPED'),sessionStatus('errored'),sessionStatus(undefined)]).toEqual(['running','running','ended','ended','unknown']);
});
