// Run against a local production server. Playwright may be provided through
// LIFEOS_PLAYWRIGHT_MODULE (file URL to playwright/index.mjs), or installed locally.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.LIFEOS_PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.LIFEOS_TEST_URL || 'http://localhost:3001';
const output = process.env.LIFEOS_QA_OUTPUT || join(tmpdir(), 'lifeos-neon-qa');
await mkdir(output, {recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true});
const errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1024},timezoneId:'Asia/Colombo'});
await context.addInitScript(() => {
  if(localStorage.getItem('lifeos.tasks.v1')) return;
  const now=new Date(); const due=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const base={workspace:'University 01',due,start:due,priority:'Medium',done:false,focus:'',repeat:'None'};
  localStorage.setItem('lifeos.tasks.v1',JSON.stringify([
    {...base,id:'videos',title:'SolidWorks videos',progress:{total:50,completed:20,unit:'videos'}},
    {...base,id:'plain',title:'Submit assignment'},
    {...base,id:'big',title:'Long course',progress:{total:101,completed:0,unit:'lessons'}},
    {...base,id:'finish',title:'Finish practice',progress:{total:10,completed:9,unit:'steps'}}
  ]));
});
const page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const dialog=()=>page.getByRole('dialog');
const close=async()=>{await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));};
const account=process.env.LIFEOS_TEST_ACCOUNT || '11111111-1111-4111-8111-111111111111';
const saved=()=>page.evaluate(async account=>{const response=await fetch('/api/workspace',{headers:{'X-LifeOS-Account':account}});return (await response.json()).tasks;},account);
const poll=async(check)=>{for(let i=0;i<60;i++){if(await check())return;await page.waitForTimeout(50);}throw new Error('Expected state did not settle');};
const settle=async()=>page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
try {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email',{exact:true}).fill(process.env.LIFEOS_TEST_EMAIL || 'alice@example.test');
  await page.getByLabel('Password',{exact:true}).fill(process.env.LIFEOS_TEST_PASSWORD || 'correct-password');
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await page.waitForURL(`${baseURL}/`);
  await page.getByRole('button',{name:'Import 4 tasks',exact:true}).click();
  await page.getByRole('button',{name:'Open SolidWorks videos',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(9, 9, 14)');
  await noOverflow();
  assert.equal(await page.getByRole('status').count(),0,'no level-up celebration on migration');
  await settle();
  await page.screenshot({path:join(output,'desktop.png'),fullPage:true});

  // A card opens playable details, not editing. Existing counts become 1–20.
  await page.getByRole('button',{name:'Open SolidWorks videos',exact:true}).click();
  await dialog().getByRole('heading',{name:'SolidWorks videos',exact:true}).waitFor();
  assert.equal(await dialog().locator('.task-form').count(),0);
  assert.equal(await dialog().getByRole('button',{pressed:true}).count(),20);
  assert.equal(await dialog().getByRole('progressbar').getAttribute('aria-valuenow'),'20');
  await dialog().getByRole('button',{name:'Complete Video 40',exact:true}).click();
  await poll(async()=> (await saved()).find(t=>t.id==='videos').progress.completed===21);
  assert.equal(await dialog().getByRole('button',{name:'Undo Video 40',exact:true}).getAttribute('aria-pressed'),'true');
  await dialog().getByRole('button',{name:'Undo Video 2',exact:true}).click();
  await poll(async()=> (await saved()).find(t=>t.id==='videos').progress.completed===20);
  assert.equal(await dialog().locator('.detail-score strong').first().innerText(),'40%');

  await dialog().getByRole('button',{name:'Rename Video 40',exact:true}).click();
  await dialog().getByLabel('Level 40 name',{exact:true}).fill('Advanced assembly');
  await dialog().getByRole('button',{name:'Save level name',exact:true}).click();
  await dialog().getByRole('button',{name:'Undo Advanced assembly',exact:true}).waitFor();
  await dialog().evaluate(e=>e.scrollTop=0);
  await settle();
  await page.screenshot({path:join(output,'desktop-levels.png'),fullPage:true});
  // Native dialog keeps keyboard focus inside, including wraparound.
  await dialog().getByRole('button',{name:'Close dialog',exact:true}).focus();
  for(let i=0;i<130;i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('dialog[open]')),true); }
  await close();
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Open SolidWorks videos');
  await page.reload();
  await page.getByRole('button',{name:'Open SolidWorks videos',exact:true}).click();
  await dialog().getByRole('button',{name:'Undo Advanced assembly',exact:true}).waitFor();
  assert.equal(await dialog().getByRole('button',{name:'Complete Video 2',exact:true}).getAttribute('aria-pressed'),'false');
  await close();

  // Separate edit icon never opens the level grid. Bulk update retains chosen levels.
  await page.locator('.quest-card').filter({hasText:'SolidWorks videos'}).getByRole('button',{name:'Edit SolidWorks videos',exact:true}).click();
  await dialog().getByRole('heading',{name:'Edit task',exact:true}).waitFor();
  assert.equal(await dialog().locator('.level-grid').count(),0);
  await dialog().getByLabel('Completed',{exact:true}).fill('22');
  await dialog().getByRole('button',{name:'Save',exact:true}).click();
  await poll(async()=> (await saved()).find(t=>t.id==='videos').progress.completed===22);
  assert.equal(await page.getByRole('dialog').count(),0);

  // Paginated courses render just 50 tiles, with an accessible page jump.
  await page.getByRole('button',{name:'Open Long course',exact:true}).click();
  assert.equal(await dialog().locator('.level-tile').count(),50);
  await dialog().getByRole('button',{name:'Next levels',exact:true}).click();
  await dialog().getByRole('button',{name:'Complete Lesson 51',exact:true}).click();
  await dialog().getByLabel('Level page',{exact:true}).fill('3');
  assert.equal(await dialog().locator('.level-tile').count(),1);
  await dialog().getByRole('button',{name:'Complete Lesson 101',exact:true}).click();
  await close();

  // Ordinary tasks and completed view stay usable, with detail popup retained.
  await page.getByRole('button',{name:'Open Submit assignment',exact:true}).click();
  await dialog().getByRole('button',{name:'Complete quest',exact:true}).click();
  await dialog().getByRole('button',{name:'Reopen',exact:true}).waitFor();
  assert.equal(await dialog().isVisible(),true);
  await close();
  await page.locator('.sidebar').getByRole('button',{name:/Completed/}).click();
  await page.getByRole('button',{name:'Open Submit assignment',exact:true}).click();
  await dialog().getByRole('button',{name:'Reopen',exact:true}).click();
  await dialog().getByRole('button',{name:'Complete quest',exact:true}).waitFor();
  await close();
  await page.locator('.sidebar').getByRole('button',{name:'Dashboard',exact:true}).click();

  // Calendar and reminder entries open details, with no edit form.
  await page.locator('.sidebar').getByRole('button',{name:'Calendar',exact:true}).click();
  await page.locator('.calendar-day').getByRole('button',{name:'SolidWorks videos',exact:true}).click();
  assert.equal(await dialog().locator('.level-grid').count(),1);
  assert.equal(await dialog().locator('.task-form').count(),0);
  await close();
  await page.getByRole('button',{name:'Open reminders',exact:true}).click();
  await dialog().getByRole('button',{name:/SolidWorks videos/}).click();
  await dialog().getByRole('heading',{name:'SolidWorks videos',exact:true}).waitFor();
  await close();

  // Reset test fixtures for a precise 290 -> 300 XP crossing and level-up.
  await page.evaluate(async account=>{
    const response=await fetch('/api/workspace',{headers:{'X-LifeOS-Account':account}});const snapshot=await response.json();
    for(const t of snapshot.tasks){if(t.id==='videos')t.progress={total:50,completed:20,unit:'videos'};if(t.id==='big')t.progress={total:101,completed:0,unit:'lessons'};t.done=false;delete t.completedAt;
      const r=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json','X-LifeOS-Account':account},body:JSON.stringify({type:'save',task:t,expectedVersion:snapshot.versions[t.id],today:'2026-10-25',nextId:crypto.randomUUID()})});if(!r.ok)throw new Error('Fixture update failed');
    }
  },account);
  await page.reload();
  await page.locator('.sidebar').getByRole('button',{name:'Dashboard',exact:true}).click();
  await page.getByRole('button',{name:'Open Finish practice',exact:true}).click();
  await dialog().getByRole('button',{name:'Complete Step 10',exact:true}).click();
  await dialog().getByText('Quest cleared',{exact:true}).waitFor();
  assert.equal(await dialog().getByText('LEVEL 4',{exact:true}).isVisible(),true);
  assert.equal(await dialog().locator('.particles>i').count(),14);
  assert.equal(await dialog().getByRole('button',{name:'Undo Step 10',exact:true}).getAttribute('aria-pressed'),'true');
  await settle();
  await page.screenshot({path:join(output,'completion.png'),fullPage:true});
  await close();

  // Mobile navigation, levels, and editing do not overflow the viewport.
  await page.setViewportSize({width:390,height:844});
  await noOverflow();
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.locator('.sidebar').getByRole('button',{name:/University 01/}).click();
  await page.getByRole('button',{name:'Open SolidWorks videos',exact:true}).click();
  await noOverflow();
  assert.equal(await dialog().evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  await settle();
  await page.screenshot({path:join(output,'mobile-levels.png'),fullPage:true});
  await dialog().getByRole('button',{name:'Edit SolidWorks videos',exact:true}).click();
  await dialog().getByRole('heading',{name:'Edit task',exact:true}).waitFor();
  assert.equal(await dialog().evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  await page.keyboard.press('Escape'); // Returns from editor to details.
  await dialog().getByRole('heading',{name:'SolidWorks videos',exact:true}).waitFor();
  await close();
  await settle();
  await page.screenshot({path:join(output,'mobile.png'),fullPage:true});

  // Reduced motion disables animation, including the XP pop and dialogs.
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Open SolidWorks videos',exact:true}).click();
  assert.equal(await dialog().evaluate(e=>getComputedStyle(e).animationName),'none');
  assert.equal(await page.locator('.xp-number').evaluate(e=>getComputedStyle(e).animationName),'none');
  await close();
  // Add a new leveled task through the editor and preserve it across reload.
  await page.getByRole('button',{name:'Add task',exact:true}).click();
  await dialog().getByLabel('Task',{exact:true}).fill('Learn CAD');
  await dialog().getByLabel('Enable levels',{exact:true}).check();
  await dialog().getByLabel('Total',{exact:true}).fill('5');
  await dialog().getByLabel('Completed',{exact:true}).fill('2');
  await dialog().getByLabel('Unit',{exact:true}).fill('lessons');
  await dialog().getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'Open Learn CAD',exact:true}).click();
  assert.equal(await dialog().locator('.level-tile').count(),5);
  assert.equal(await dialog().getByRole('progressbar').getAttribute('aria-valuenow'),'2');
  await close();
  await page.reload();
  await page.getByRole('button',{name:'Open Learn CAD',exact:true}).waitFor();
  assert.deepEqual(errors,[],'no browser errors');
  console.log(JSON.stringify({passed:true,checks:['migration','20/50=40%','out-of-order levels','rename + reload','focus trap + restore','separate edit','bulk progress','pagination','completion + reopen','calendar + reminders','XP level-up + particles','mobile','reduced motion','new task + reload'],screenshots:output},null,2));
} finally { await browser.close(); }
