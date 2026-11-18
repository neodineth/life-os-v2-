import test from 'node:test';
import assert from 'node:assert/strict';
import { authSchema, commandSchema, legacyTasks, safeNext } from '../src/lib/cloud-model.ts';
import { readLegacyBackup, markLegacyImported, LEGACY_KEY, IMPORT_OWNER_KEY } from '../src/lib/import-backup.ts';
import { isSameOriginRequest, requestOrigin } from '../src/lib/request-origin.ts';
const task={id:'sample-1',title:'SolidWorks',workspace:'University 01',due:'',start:'',focus:'',priority:'Medium',repeat:'None',done:false,progress:{total:50,completed:20,unit:'videos'}};
const storage=()=>{const map=new Map([[LEGACY_KEY,JSON.stringify([task])]]);return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
test('account forms validate email, password, and matching confirmation',()=>{
 assert.equal(authSchema.safeParse({action:'signup',email:'p@example.com',password:'12345678',confirmation:'12345678'}).success,true);
 assert.equal(authSchema.safeParse({action:'signup',email:'p@example.com',password:'short',confirmation:'short'}).success,false);
 assert.equal(authSchema.safeParse({action:'reset',password:'12345678',confirmation:'different'}).success,false);
 assert.equal(authSchema.safeParse({action:'recover',email:'invalid'}).success,false);
});
test('redirects never accept external, protocol-relative, or unknown destinations',()=>{
 for(const value of ['https://evil.example','//evil.example','/admin','/\\evil.example',null])assert.equal(safeNext(value),'/');
 assert.equal(safeNext('/reset-password'),'/reset-password');
});
test('authentication accepts the actual browser host when Next uses an internal hostname', () => {
 const request = new Request('http://localhost:3000/api/auth', { headers: { Host: '127.0.0.1:3000', Origin: 'http://127.0.0.1:3000' } });
 assert.equal(requestOrigin(request), 'http://127.0.0.1:3000');
 assert.equal(isSameOriginRequest(request), true);
 assert.equal(isSameOriginRequest(new Request('https://app.example/api/auth', { headers: { Host: 'app.example', Origin: 'https://app.example' } })), true);
});
test('authentication rejects foreign, missing, spoofed-forwarded, and wrong-protocol origins', () => {
 for (const origin of ['https://example.invalid', 'http://localhost:3000', 'https://127.0.0.1:3000', 'null', null]) {
  const headers = new Headers({ Host: '127.0.0.1:3000', 'X-Forwarded-Host': 'example.invalid' });
  if (origin !== null) headers.set('Origin', origin);
  assert.equal(isSameOriginRequest(new Request('http://localhost:3000/api/auth', { headers })), false);
 }
});
test('cloud inputs normalize old level counts and reject invalid dates or levels',()=>{
 const parsed=legacyTasks(JSON.stringify([task]))[0];assert.deepEqual(parsed.progress.completedRanges,[[1,20]]);
 assert.throws(()=>legacyTasks(JSON.stringify([{...task,due:'2026-02-30'}])));
 assert.throws(()=>legacyTasks(JSON.stringify([{...task,progress:{...task.progress,completedRanges:[[40,51]]}}])));
 assert.equal(commandSchema.safeParse({type:'delete',id:'sample-1',expectedVersion:0}).success,false);
 assert.equal(commandSchema.safeParse({type:'import',tasks:[]}).success,false);
});
test('import is offered once per snapshot, retains the original backup, and hides it from other accounts',async()=>{
 const store=storage();const original=store.getItem(LEGACY_KEY);
 const backup=await readLegacyBackup(store,'alice');assert.equal(backup.tasks.length,1);
 markLegacyImported(store,'alice',backup.fingerprint);
 assert.equal(store.getItem(LEGACY_KEY),original);assert.equal(store.getItem(IMPORT_OWNER_KEY),'alice');
 assert.equal((await readLegacyBackup(store,'alice')).tasks.length,0);
 assert.equal((await readLegacyBackup(store,'bob')).tasks.length,0);
 assert.throws(()=>markLegacyImported(store,'bob',backup.fingerprint));
 store.setItem(LEGACY_KEY,JSON.stringify([task,{...task,id:'later'}]));
 assert.equal((await readLegacyBackup(store,'alice')).tasks.length,2);
});
test('failed/invalid import does not mark ownership or destroy data',async()=>{
 const store=storage();store.setItem(LEGACY_KEY,'invalid json');await assert.rejects(()=>readLegacyBackup(store,'alice'));
 assert.equal(store.getItem(IMPORT_OWNER_KEY),null);assert.equal(store.getItem(LEGACY_KEY),'invalid json');
});
