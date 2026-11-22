import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('custom workspaces persist with tasks/schedules, remain account isolated, and retry idempotently',async()=>{
 const {PGlite}=await import(process.env.LIFEOS_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',workspace='custom:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as data`,args)).rows[0].data;
 const user=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(id?{sub:id}:{})]);await db.exec('set role authenticated');};
 const task={id:'research',title:'Read papers',workspace,due:'',start:'',focus:'',priority:'Medium',done:false,repeat:'None'};
 try{
 await db.exec(`create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema auth to authenticated,anon;insert into auth.users values('${a}'),('${b}');`);
 const setup=await readFile(new URL('../supabase/LifeOS-V2-Backend-Setup.sql',import.meta.url),'utf8');await db.exec(setup);
 const migration=await readFile(new URL('../supabase/migrations/202611220002_add_workspaces.sql',import.meta.url),'utf8');await db.exec(migration);
 await user(a);let result=await rpc('lifeos_workspace_create',[workspace,' Research ']);assert.equal(result.workspaceIds.length,6);assert.equal(result.workspaceLabels[workspace],'Research');assert.equal(result.workspaceCreateReady,true);
 assert.equal((await rpc('lifeos_workspace_create',[workspace,'Research'])).workspaceIds.length,6);
 await assert.rejects(()=>rpc('lifeos_workspace_create',['custom:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','research']),e=>e.code==='22023');
 await assert.rejects(()=>rpc('lifeos_workspace_create',[workspace,'']),e=>e.code==='22023');
 result=await rpc('lifeos_commit',[task,null,null]);assert.equal(result.tasks[0].workspace,workspace);
 result=await rpc('lifeos_workspace_rename',[workspace,'Projects',1]);assert.equal(result.workspaceLabels[workspace],'Projects');assert.equal(result.tasks[0].workspace,workspace);
 await assert.rejects(()=>rpc('lifeos_workspace_rename',[workspace,'Stale name',1]),e=>e.code==='40001');
 const block={id:crypto.randomUUID(),workspace,task:{id:task.id,title:task.title},origin:'task',start:Date.parse('2026-11-22T03:30Z'),end:Date.parse('2026-11-22T04:30Z'),timeZone:'Asia/Colombo',repeat:{frequency:'weekly',weekdays:[0],until:null}};
 await rpc('lifeos_task_schedule_save',[{type:'save-scheduled',task:{...task,completionMode:'occurrence'},expectedVersion:1,operationId:crypto.randomUUID(),blocks:[block],scheduleVersions:{}}]);
 assert.equal((await rpc('lifeos_calendar_load')).blocks[0].workspace,workspace);
 await user(b);assert.equal((await rpc('lifeos_load')).workspaceIds.length,5);assert.equal((await db.query('select * from public.lifeos_workspaces')).rows.length,5);
 await assert.rejects(()=>rpc('lifeos_commit',[task,null,null]),e=>e.code==='23503');
 await assert.rejects(()=>rpc('lifeos_workspace_rename',[workspace,'Steal',2]),e=>e.code==='22023');
 assert.equal((await rpc('lifeos_workspace_create',[workspace,'Research'])).workspaceLabels[workspace],'Research');
 await assert.rejects(()=>db.query('insert into public.lifeos_workspaces(user_id,name) values($1,$2)',[a,workspace]),e=>e.code==='42501');
 await user(null);await assert.rejects(()=>rpc('lifeos_workspace_create',[workspace,'Anonymous']),e=>e.code==='42501');
 await db.exec('reset role');await db.exec(setup);await db.exec(migration);await user(a);
 result=await rpc('lifeos_load');assert.equal(result.workspaceLabels[workspace],'Projects');assert.equal(result.workspaceIds.length,6);assert.equal(result.tasks[0].workspace,workspace);
 assert.equal((await rpc('lifeos_calendar_load')).blocks[0].workspace,workspace);
 }finally{await db.close();}
});
