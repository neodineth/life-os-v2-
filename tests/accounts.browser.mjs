import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium }=await import(process.env.LIFEOS_PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.LIFEOS_TEST_URL||'http://localhost:3001';
const fixture='http://127.0.0.1:54329';
const aliceId='11111111-1111-4111-8111-111111111111',bobId='22222222-2222-4222-8222-222222222222';
const output=process.env.LIFEOS_QA_OUTPUT||join(tmpdir(),'lifeos-accounts-qa');await mkdir(output,{recursive:true});
await fetch(`${fixture}/__test/reset`,{method:'POST'});
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];let checks=0;
const context=await browser.newContext({viewport:{width:1440,height:960},timezoneId:'Asia/Colombo'});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const login=async(p,email='alice@example.test',password='correct-password')=>{await p.goto(`${origin}/login`);await p.getByLabel('Email',{exact:true}).fill(email);await p.getByLabel('Password',{exact:true}).fill(password);await p.getByRole('button',{name:'Log in',exact:true}).click();await p.waitForURL(`${origin}/`);await p.locator('.player-card strong').waitFor();await p.waitForFunction(()=>!document.querySelector('.sync-status'));};
const request=async(p,body,id=aliceId)=>p.evaluate(async({body,id})=>{const r=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json','X-LifeOS-Account':id},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};},{body,id});
const read=async(p,id=aliceId)=>p.evaluate(async id=>{const r=await fetch('/api/workspace',{headers:{'X-LifeOS-Account':id}});return {status:r.status,body:await r.json()};},id);
const settle=()=>page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
try{
 await page.goto(origin);await page.waitForURL('**/login');checks++;
 await page.getByLabel('Email',{exact:true}).fill('alice@example.test');await page.getByLabel('Password',{exact:true}).fill('wrong');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('alert').filter({hasText:'incorrect'}).waitFor();checks++;
 await page.screenshot({path:join(output,'login.png'),fullPage:true});
 await page.goto(`${origin}/signup`);await page.getByLabel(/Player name/).fill('New player');await page.getByLabel('Email',{exact:true}).fill('new@example.test');await page.getByLabel('Password',{exact:true}).fill('correct-password');await page.getByLabel('Confirm password',{exact:true}).fill('not-matching');await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByRole('alert').filter({hasText:'do not match'}).waitFor();checks++;
 await page.getByLabel('Confirm password',{exact:true}).fill('correct-password');await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByRole('status').filter({hasText:'Check your email'}).waitFor();checks++;
 await page.goto(`${origin}/login`);await page.getByLabel('Email',{exact:true}).fill('new@example.test');await page.getByLabel('Password',{exact:true}).fill('correct-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('alert').filter({hasText:'Confirm your email'}).waitFor();checks++;
 await page.goto(`${origin}/auth/confirm?token_hash=valid-signup&type=email&next=https://evil.example`);await page.waitForURL(`${origin}/`);await page.locator('.player-card strong').filter({hasText:'New player'}).waitFor();assert.equal((await read(page,'33333333-3333-4333-8333-333333333333')).body.tasks.length,0);checks++;
 await page.getByRole('button',{name:'Logout',exact:true}).click();await page.waitForURL('**/login');checks++;
 await page.goto(`${origin}/auth/confirm?token_hash=expired&type=email`);await page.waitForURL('**/login?error=link_expired');await page.getByRole('alert').filter({hasText:'expired'}).waitFor();checks++;
 await page.goto(`${origin}/forgot-password`);await page.getByLabel('Email',{exact:true}).fill('alice@example.test');await page.getByRole('button',{name:'Send reset link',exact:true}).click();await page.getByRole('status').waitFor();checks++;
 await page.goto(`${origin}/auth/confirm?token_hash=valid-recovery&type=recovery`);await page.waitForURL('**/reset-password');await page.getByLabel('Password',{exact:true}).fill('updated-password');await page.getByLabel('Confirm password',{exact:true}).fill('updated-password');await page.getByRole('button',{name:'Save password',exact:true}).click();await page.waitForURL(`${origin}/`);checks++;
 await page.getByRole('button',{name:'Logout',exact:true}).click();await page.waitForURL('**/login');await login(page,'alice@example.test','updated-password');checks++;
 // An expired signed cookie must refresh through Proxy and keep the user logged in.
 const expired=await (await fetch(`${fixture}/__test/expired-session`)).json();
 const cookies=await context.cookies();const authCookie=cookies.find(c=>/^sb-.*-auth-token$/.test(c.name));assert.ok(authCookie);
 const expiredValue=`base64-${Buffer.from(JSON.stringify(expired)).toString('base64url')}`;
 await context.addCookies([{name:authCookie.name,value:expiredValue,url:origin,sameSite:'Lax'}]);
 await page.reload();await page.locator('.player-card strong').filter({hasText:'Alice'}).waitFor();
 assert.notEqual((await context.cookies()).find(c=>c.name===authCookie.name)?.value,expiredValue);checks++;
 const raw=JSON.stringify([{id:'old-sample',title:'Legacy CAD',workspace:'University 01',due:'',start:'',focus:'',priority:'Medium',repeat:'None',done:false,progress:{total:50,completed:20,unit:'videos',names:{'40':'Assembly'}}}]);
 await page.evaluate(raw=>localStorage.setItem('lifeos.tasks.v1',raw),raw);await page.reload();await page.getByRole('button',{name:'Import 1 tasks',exact:true}).click();await page.getByRole('button',{name:'Open Legacy CAD',exact:true}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('lifeos.tasks.v1')),raw);checks++;
 await page.reload();await page.getByRole('button',{name:'Open Legacy CAD',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Import 1 tasks',exact:true}).count(),0);checks++;
 const second=await browser.newContext();const secondPage=await second.newPage();await login(secondPage,'alice@example.test','updated-password');assert.equal((await read(secondPage)).body.tasks[0].progress.completed,20);checks++;
 await page.getByRole('button',{name:'Open Legacy CAD',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Complete Assembly',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Undo Assembly',exact:true}).waitFor();
 // Another browser's old version must not overwrite the new result.
 const stale=(await read(secondPage)).body; // Current is version 2; deliberately submit version 1.
 const result=await request(secondPage,{type:'save',task:{...stale.tasks[0],title:'Stale overwrite'},expectedVersion:1,today:'2026-10-25',nextId:crypto.randomUUID()});assert.equal(result.status,409);checks++;
 await fetch(`${fixture}/__test/fail-next-save`,{method:'POST'});await page.getByRole('dialog').getByRole('button',{name:'Complete Video 22',exact:true}).click();await page.getByRole('dialog').getByRole('alert').waitFor();assert.equal(await page.getByRole('dialog').getByRole('button',{name:'Complete Video 22',exact:true}).getAttribute('aria-pressed'),'false');checks++;
 await page.getByRole('dialog').getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Undo Video 22',exact:true}).waitFor();checks++;
 await page.keyboard.press('Escape');await settle();await page.screenshot({path:join(output,'cloud-workspace.png'),fullPage:true});
 const bobContext=await browser.newContext();const bobPage=await bobContext.newPage();await login(bobPage,'bob@example.test');assert.equal((await read(bobPage,bobId)).body.tasks.length,0);checks++;
 const denied=await request(bobPage,{type:'delete',id:'old-sample',expectedVersion:1},aliceId);assert.equal(denied.status,401);assert.equal((await read(page)).body.tasks.length,1);checks++;
 await page.getByRole('button',{name:'Logout',exact:true}).click();await page.waitForURL('**/login');assert.equal(await page.getByText('Legacy CAD',{exact:true}).count(),0);checks++;
 await login(page,'bob@example.test');assert.equal(await page.getByRole('button',{name:'Import 1 tasks',exact:true}).count(),0);checks++;
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Logout',exact:true}).click();await page.waitForURL('**/login');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(output,'mobile-login.png'),fullPage:true});checks++;
 await page.goto(`${origin}/signup`);await page.getByLabel('Email',{exact:true}).fill('limited@example.test');await page.getByLabel('Password',{exact:true}).fill('correct-password');await page.getByLabel('Confirm password',{exact:true}).fill('correct-password');await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByRole('alert').filter({hasText:'Too many attempts'}).waitFor();checks++;
 assert.deepEqual(errors,[]);await second.close();await bobContext.close();
 console.log(JSON.stringify({passed:true,checks,coverage:['protected routes','login + invalid password','signup + confirmation','password recovery + reset','expired links','safe redirects','logout','session refresh','empty accounts','legacy import + owner marker','cross-browser persistence','stale saves','failed saves + retry','cross-account isolation','mobile auth','rate limits'],screenshots:output},null,2));
}finally{await browser.close();await fetch(`${fixture}/__test/reset`,{method:'POST'});}
