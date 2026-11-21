import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('progress status, notes, account isolation, retries, legacy completion and history', async () => {
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
 await user(a);await save(block);
 const progress=(status,notes,expectedVersion=null,expectedSeriesVersion=1)=>rpc('lifeos_calendar_progress_save',[{action:'progress',seriesId:block.id,date:'2026-11-20',status,notes,expectedVersion,expectedSeriesVersion}]);
 let result=await progress('partial','Read paper https://example.com');
 assert.equal(result.progressReady,true);assert.equal(result.completions[0].status,'partial');assert.equal(result.completions[0].done,false);
 assert.equal((await progress('partial','Read paper https://example.com')).completions[0].version,1);
 await assert.rejects(()=>progress('completed','stale',null),e=>e.code==='40001');
 await assert.rejects(()=>progress('partial','x'.repeat(10001),1),e=>e.code==='22023');
 await user(b);await assert.rejects(()=>progress('completed','cross account'),e=>e.code==='22023');assert.equal((await rpc('lifeos_calendar_load')).completions.length,0);await user(a);
 result=await progress('could_not_complete','Blocked by missing data',1);assert.equal(result.completions[0].status,'could_not_complete');
 result=await progress('completed','Finished https://example.com/result',2);assert.equal(result.completions[0].done,true);
 result=await progress('completed','Updated link https://example.com/final',3);assert.equal(result.completions[0].notes,'Updated link https://example.com/final');
 // Legacy completion controls keep the new status and notes consistent.
 result=await rpc('lifeos_calendar_mutate',[{action:'complete',seriesId:block.id,date:'2026-11-20',done:false,expectedVersion:4}]);
 assert.equal(result.completions[0].status,'pending');assert.equal(result.completions[0].notes,'Updated link https://example.com/final');
 await progress('partial','Continue tomorrow',5);
 await db.exec('reset role');await db.exec(setup);await user(a);
 result=await rpc('lifeos_calendar_load');assert.equal(result.completions[0].status,'partial');assert.equal(result.completions[0].notes,'Continue tomorrow');
 await save({...block,end:block.end+3600000},1);
 await assert.rejects(()=>progress('completed','stale schedule',6,1),e=>e.code==='40001');
 result=await progress('completed','Done',6,2);assert.equal(result.completions[0].occurrence.end,block.end+3600000);
 await rpc('lifeos_calendar_delete_scoped',[{action:'delete-scoped',id:block.id,date:'2026-11-20',scope:'series',expectedVersion:2}]);
 result=await progress('completed','History retained',7,2);assert.equal(result.completions[0].notes,'History retained');assert.equal((await rpc('lifeos_load')).tasks.length,0);
 await user(null);await assert.rejects(()=>progress('completed','Anonymous'),e=>e.code==='42501');
 }finally{await db.close();}
});
