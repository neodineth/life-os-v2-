// Local-only Supabase protocol fixture. No production auth bypass is built into the app.
import http from 'node:http';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.LIFEOS_PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();const port=54329;const origin=`http://127.0.0.1:${port}`;
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'lifeos-test',alg:'RS256',use:'sig'};
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const users=new Map();const refresh=new Map();let lastSignup=null,failNext=false;let queue=Promise.resolve();
const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
function jwt(user,expired=false){const now=Math.floor(Date.now()/1000);const claims={iss:`${origin}/auth/v1`,aud:'authenticated',sub:user.id,role:'authenticated',email:user.email,user_metadata:user.user_metadata,iat:now-10,exp:expired?now-1:now+3600};const payload=[{alg:'RS256',kid:jwk.kid,typ:'JWT'},claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return `${payload}.${sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url')}`;}
function session(user){const token=`refresh-${user.id}`;refresh.set(token,user);return {access_token:jwt(user),refresh_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};}
function claims(req){try{const token=(req.headers.authorization||'').replace(/^Bearer /,'');const [h,p,s]=token.split('.');if(!verify('RSA-SHA256',Buffer.from(`${h}.${p}`),publicKey,Buffer.from(s,'base64url')))return null;const value=JSON.parse(Buffer.from(p,'base64url').toString());return value.exp> Date.now()/1000?value:null;}catch{return null;}}
const user=(id,email,name)=>({id,email,aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),user_metadata:{player_name:name},app_metadata:{provider:'email',providers:['email']},identities:[],password:'correct-password'});
async function reset(){await db.exec('reset role; truncate public.lifeos_imports,public.lifeos_tasks,public.lifeos_workspaces,public.lifeos_profiles,auth.users cascade;');users.clear();refresh.clear();users.set('alice@example.test',user(alice,'alice@example.test','Alice'));users.set('bob@example.test',user(bob,'bob@example.test','Bob'));await db.query('insert into auth.users values($1),($2)',[alice,bob]);lastSignup=null;failNext=false;}
await db.exec(`create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema auth to authenticated,anon;`);
await db.exec(await readFile(new URL('../../supabase/migrations/202610250001_accounts.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/202611020001_calendar_focus.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/202611030001_task_schedules.sql',import.meta.url),'utf8'));await reset();
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,origin);const send=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Cache-Control':'no-store'});res.end(status===204?'':JSON.stringify(body));};
 if(req.method==='OPTIONS'){send({},204);return;}
 let body={};try{const chunks=[];for await(const c of req)chunks.push(c);if(chunks.length)body=JSON.parse(Buffer.concat(chunks));}catch{send({error:'Invalid JSON'},400);return;}
 try{
  if(url.pathname==='/__test/reset'){await serial(reset);send({ok:true});return;}
  if(url.pathname==='/__test/expired-session'){const u=users.get('alice@example.test');send({...session(u),access_token:jwt(u,true),expires_at:Math.floor(Date.now()/1000)-1});return;}
  if(url.pathname==='/__test/fail-next-save'){failNext=true;send({ok:true});return;}
  if(url.pathname==='/auth/v1/.well-known/jwks.json'){send({keys:[jwk]});return;}
  if(url.pathname==='/auth/v1/token'){
   if(url.searchParams.get('grant_type')==='refresh_token'){const u=refresh.get(body.refresh_token);send(u?session(u):{code:'refresh_token_not_found',msg:'Invalid refresh token'},u?200:400);return;}
   const u=users.get(body.email);if(!u||u.password!==body.password){send({code:'invalid_credentials',msg:'Invalid login credentials'},400);return;}
   if(!u.email_confirmed_at){send({code:'email_not_confirmed',msg:'Email not confirmed'},400);return;}send(session(u));return;
  }
  if(url.pathname==='/auth/v1/signup'){
   if(body.email==='limited@example.test'){send({code:'over_email_send_rate_limit',msg:'Rate limit exceeded'},429);return;}
   const id='33333333-3333-4333-8333-333333333333';const u={...user(id,body.email,body.data?.player_name||'Player one'),password:body.password,email_confirmed_at:null};users.set(body.email,u);lastSignup=u;await serial(()=>db.query('insert into auth.users values($1) on conflict do nothing',[id]));send({user:u});return;
  }
  if(url.pathname==='/auth/v1/recover'){send({});return;}
  if(url.pathname==='/auth/v1/verify'){
   if(body.token_hash==='valid-signup'&&lastSignup){lastSignup.email_confirmed_at=new Date().toISOString();send(session(lastSignup));return;}
   if(body.token_hash==='valid-recovery'){send(session(users.get('alice@example.test')));return;}
   send({code:'otp_expired',msg:'Token has expired or is invalid'},403);return;
  }
  if(url.pathname==='/auth/v1/logout'){send({},204);return;}
  if(url.pathname==='/auth/v1/user'){
   const c=claims(req),u=c&&[...users.values()].find(u=>u.id===c.sub);if(!u){send({code:'bad_jwt',msg:'Invalid JWT'},401);return;}
   if(req.method==='PUT'&&body.password)u.password=body.password;send(u);return;
  }
  if(url.pathname.startsWith('/rest/v1/rpc/')){
   const c=claims(req);if(!c){send({code:'PGRST301',message:'Authentication required'},401);return;}
   const name=url.pathname.split('/').at(-1);const fields={lifeos_load:[],lifeos_commit:['p_task','p_expected_version','p_successor'],lifeos_delete:['p_id','p_expected_version'],lifeos_import:['p_tasks'],lifeos_calendar_load:[],lifeos_calendar_mutate:['p_command'],lifeos_focus_load:[],lifeos_focus_save:['p_record','p_expected_version'],lifeos_focus_import:['p_records'],lifeos_task_schedule_save:['p_command'],lifeos_scheduled_task_update:['p_task','p_expected_version']}[name];
   if(!fields){send({code:'PGRST202'},404);return;}
   if(failNext&&!['lifeos_load','lifeos_calendar_load','lifeos_focus_load'].includes(name)){failNext=false;send({code:'XX000',message:'Injected failure'},503);return;}
   const result=await serial(async()=>{
    await db.exec('begin');try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(c)]);await db.exec('set local role authenticated');const r=await db.query(`select public.${name}(${fields.map((_,i)=>`$${i+1}`).join(',')}) as value`,fields.map(k=>body[k]??null));await db.exec('commit');return r.rows[0].value;}catch(e){await db.exec('rollback');throw e;}
   });send(result);return;
  }
  send({error:'Not found'},404);
 }catch(e){send({code:e.code||'XX000',message:'Fixture database error'},400);}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local auth/database fixture ready at ${origin}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>db.close().then(()=>process.exit(0))));
