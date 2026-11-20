import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('standalone calendar storage, versions, isolation, completions and migration rerun', async () => {
 const {PGlite}=await import(process.env.LIFEOS_PGLITE_MODULE || '@electric-sql/pglite');
 const db=new PGlite();
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 const rpc=async(name, args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as data`,args)).rows[0].data;
 const user=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(id?{sub:id}:{})]);await db.exec('set role authenticated');};
 const block={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',task:{id:'entry',title:'Calendar only',note:'Notes'},origin:'calendar',workspace:'Calendar',start:Date.parse('2026-11-20T03:30Z'),end:Date.parse('2026-11-20T04:30Z'),timeZone:'Asia/Colombo',repeat:{frequency:'daily',weekdays:[],until:null}};
 const save=(block,expectedVersion=null)=>rpc('lifeos_calendar_mutate',[{action:'save',block,expectedVersion}]);
 try {
 await db.exec(`create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema auth to authenticated,anon;insert into auth.users values('${a}'),('${b}');`);
 const setup=await readFile(new URL('../supabase/LifeOS-V2-Backend-Setup.sql',import.meta.url),'utf8');await db.exec(setup);
 await user(a);let result=await save(block);assert.equal(result.standaloneReady,true);assert.equal(result.blocks.length,1);assert.equal((await rpc('lifeos_load')).tasks.length,0);
 assert.equal((await save(block)).versions[block.id],1);
 await assert.rejects(()=>save({...block,task:{...block.task,title:'Stale'}},99),e=>e.code==='40001');
 await assert.rejects(()=>save({...block,origin:undefined,workspace:'University 01'},1),e=>e.code==='22023');
 const ex={seriesId:block.id,date:'2026-11-21',cancelled:false,override:{task:block.task,workspace:'Calendar',start:block.start+86400000,end:block.end+86400000}};
 result=await rpc('lifeos_calendar_mutate',[{action:'exception',exception:ex,expectedVersion:1}]);assert.equal(result.versions[block.id],2);
 await assert.rejects(()=>rpc('lifeos_calendar_mutate',[{action:'exception',exception:{...ex,override:{...ex.override,workspace:'University 01'}},expectedVersion:2}]),e=>e.code==='22023');
 result=await rpc('lifeos_calendar_mutate',[{action:'complete',seriesId:block.id,date:'2026-11-21',done:true,expectedVersion:null}]);assert.equal(result.completions[0].done,true);
 await user(b);assert.equal((await rpc('lifeos_calendar_load')).blocks.length,0);await assert.rejects(()=>save({...block,task:{...block.task,title:'Bob'}},2),e=>e.code==='40001');
 await user(a);result=await save({...block,task:{...block.task,title:'Updated'}},2);assert.equal(result.exceptions.length,1);assert.equal(result.completions[0].occurrence.task.title,'Calendar only');
 await db.exec('reset role');await db.exec(setup);await user(a);assert.equal((await rpc('lifeos_calendar_load')).blocks[0].task.title,'Updated');
 result=await rpc('lifeos_calendar_mutate',[{action:'delete',id:block.id,expectedVersion:3}]);assert.equal(result.blocks.length,0);assert.equal(result.completions.length,1);
 assert.equal((await rpc('lifeos_load')).tasks.length,0);

 const scoped=(id,date,scope,expectedVersion)=>rpc('lifeos_calendar_delete_scoped',[{action:'delete-scoped',id,date,scope,expectedVersion}]);
 const recurring={...block,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
 await save(recurring);
 await scoped(recurring.id,'2026-11-21','occurrence',1);
 result=await scoped(recurring.id,'2026-11-21','occurrence',1);assert.equal(result.versions[recurring.id],2);
 assert.equal(result.exceptions.find(e=>e.seriesId===recurring.id).cancelled,true);
 await assert.rejects(()=>scoped(recurring.id,'2026-11-22','following',1),e=>e.code==='40001');
 await user(b);await scoped(recurring.id,'2026-11-22','series',2);await user(a);
 assert.ok((await rpc('lifeos_calendar_load')).blocks.some(i=>i.id===recurring.id));
 result=await scoped(recurring.id,'2026-11-22','following',2);
 assert.equal(result.blocks.find(i=>i.id===recurring.id).repeat.until,'2026-11-21');
 assert.equal((await scoped(recurring.id,'2026-11-22','following',2)).versions[recurring.id],3);
 result=await scoped(recurring.id,'2026-11-20','series',3);assert.ok(!result.blocks.some(i=>i.id===recurring.id));
 await save(recurring);result=await scoped(recurring.id,'2026-11-20','following',1);assert.ok(!result.blocks.some(i=>i.id===recurring.id));
 // Entire-series deletion removes past plans too, without deleting the workspace task.
 const parent={id:'parent',title:'Parent',workspace:'University 01',due:'',start:'',focus:'',priority:'Medium',repeat:'None',done:false};
 await rpc('lifeos_commit',[parent,null,null]);
 const linked={...recurring,origin:undefined,workspace:parent.workspace,task:{id:parent.id,title:parent.title}};
 await save(linked);result=await scoped(linked.id,'2026-11-21','series',1);
 assert.ok(!result.blocks.some(i=>i.id===linked.id));assert.equal((await rpc('lifeos_load')).tasks[0].id,parent.id);
 await user(null);await assert.rejects(()=>scoped(recurring.id,'2026-11-20','series',1),e=>e.code==='42501');
 await user(null);await assert.rejects(()=>save(block),e=>e.code==='42501');
 }finally{await db.close();}
});
