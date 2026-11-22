import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {exampleTree} from '../src/lib/tree.ts';
test('tree migration reruns, account isolation, stale writes, retries and invalid documents',async()=>{
 const {PGlite}=await import(process.env.LIFEOS_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 const user=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(id?{sub:id}:{})]);await db.exec('set role authenticated');};
 const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as data`,args)).rows[0].data;
 try{
 await db.exec(`create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub')::uuid$$;grant usage on schema auth to authenticated,anon;insert into auth.users values('${a}'),('${b}');`);
 const sql=await readFile(new URL('../supabase/migrations/202611220001_tree_canvas.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 await user(a);assert.equal((await rpc('lifeos_tree_load')).version,0);const doc=exampleTree(),id=crypto.randomUUID();
 assert.equal((await rpc('lifeos_tree_save',[doc,0,id])).version,1);
 assert.equal((await rpc('lifeos_tree_save',[doc,0,id])).version,1);
 await assert.rejects(()=>rpc('lifeos_tree_save',[doc,0,crypto.randomUUID()]),e=>e.code==='40001');
 const broken=structuredClone(doc);broken.nodes[0].children.push(doc.rootId);await assert.rejects(()=>rpc('lifeos_tree_save',[broken,1,crypto.randomUUID()]),e=>e.code==='22023');
 assert.equal((await rpc('lifeos_tree_load')).version,1);
 await user(b);assert.equal((await rpc('lifeos_tree_load')).document,null);assert.equal((await db.query('select * from public.lifeos_trees')).rows.length,0);
 await assert.rejects(()=>db.query('update public.lifeos_trees set version=5'),e=>e.code==='42501');
 await user(null);await assert.rejects(()=>rpc('lifeos_tree_load'),e=>e.code==='42501');
 await user(a);doc.nodes[0].notes='Persisted note';assert.equal((await rpc('lifeos_tree_save',[doc,1,crypto.randomUUID()])).version,2);
 assert.equal((await rpc('lifeos_tree_load')).document.nodes[0].notes,'Persisted note');
 }finally{await db.close();}
});
