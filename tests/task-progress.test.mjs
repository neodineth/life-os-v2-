import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProgress, progressPercent, saveTask, setCompletedCount, toggleLevel, isLevelComplete, renameLevel, levelLabel, playerStats } from '../src/lib/tasks.ts';

const task = { id:'t1', title:'SolidWorks videos', workspace:'University 01', due:'2026-10-30', start:'', priority:'Medium', done:false, focus:'', repeat:'None', progress:{ total:50, completed:20, unit:'videos' } };
const today='2026-10-25';

test('legacy 20/50 migrates to first twenty completed levels and 40%', () => {
  const loaded=JSON.parse(JSON.stringify(saveTask([task],task,today,'next')))[0];
  assert.equal(progressPercent(loaded.progress),40);
  assert.equal(loaded.done,false);
  assert.deepEqual(loaded.progress.completedRanges,[[1,20]]);
  assert.equal(isLevelComplete(loaded.progress,20),true);
  assert.equal(isLevelComplete(loaded.progress,21),false);
});
test('twenty out-of-order levels give 40% and survive save/reload', () => {
  let progress=normalizeProgress({...task.progress,completed:0});
  for(let i=2;i<=40;i+=2) progress=toggleLevel(progress,i);
  const saved=JSON.parse(JSON.stringify(saveTask([task],{...task,progress},today,'next')))[0];
  assert.equal(saved.progress.completed,20);
  assert.equal(progressPercent(saved.progress),40);
  assert.equal(isLevelComplete(saved.progress,1),false);
  assert.equal(isLevelComplete(saved.progress,40),true);
});
test('last level completes, undo reopens, and re-completing cannot farm XP', () => {
  const done=saveTask([task],{...task,progress:setCompletedCount(task.progress,50)},today,'next');
  assert.equal(done[0].done,true); assert.equal(done[0].completedAt,today);
  assert.equal(progressPercent(done[0].progress),100);
  const reopened=saveTask(done,{...done[0],progress:toggleLevel(done[0].progress,17)},today,'next');
  assert.equal(reopened[0].done,false); assert.equal(reopened[0].completedAt,undefined);
  assert.equal(playerStats(reopened).xp,490);
  const doneAgain=saveTask(reopened,{...reopened[0],progress:toggleLevel(reopened[0].progress,17)},today,'next');
  assert.equal(playerStats(doneAgain).xp,500);
});
test('ranges merge and split without losing individual completion', () => {
  let p=normalizeProgress({...task.progress,completedRanges:[[5,9],[1,4],[8,12],[20,20]]});
  assert.deepEqual(p.completedRanges,[[1,12],[20,20]]);
  p=toggleLevel(p,6);
  assert.deepEqual(p.completedRanges,[[1,5],[7,12],[20,20]]);
  assert.equal(p.completed,12);
  p=toggleLevel(p,6);
  assert.deepEqual(p.completedRanges,[[1,12],[20,20]]);
});
test('bulk increase fills lowest gaps; decrease removes highest completed levels', () => {
  const p=normalizeProgress({...task.progress,completedRanges:[[10,12],[40,40]]});
  const increased=setCompletedCount(p,8);
  assert.deepEqual(increased.completedRanges,[[1,4],[10,12],[40,40]]);
  const decreased=setCompletedCount(increased,5);
  assert.deepEqual(decreased.completedRanges,[[1,4],[10,10]]);
});
test('changing totals trims out-of-range levels and names, preserving remaining identities', () => {
  const p=normalizeProgress({...task.progress,completedRanges:[[5,7],[40,50]],names:{5:'Sketch basics',41:'Assembly',70:'Outside'}});
  const smaller=normalizeProgress({...p,total:25});
  assert.equal(smaller.completed,3); assert.deepEqual(smaller.completedRanges,[[5,7]]);
  assert.deepEqual(smaller.names,{'5':'Sketch basics'});
  const larger=normalizeProgress({...smaller,total:80});
  assert.equal(larger.completed,3); assert.equal(isLevelComplete(larger,40),false);
});
test('rename uses custom names, allows reset, and persists through export', () => {
  const p=renameLevel(task.progress,21,'  First assembly  ');
  const loaded=JSON.parse(JSON.stringify(p));
  assert.equal(levelLabel(loaded,21),'First assembly');
  assert.equal(levelLabel(loaded,22),'Video 22');
  assert.equal(levelLabel(renameLevel(loaded,21,''),21),'Video 21');
  assert.equal(renameLevel(p,0,'Invalid').names[0],undefined);
});
test('bounds, invalid totals, and large tasks use compact ranges', () => {
  assert.equal(normalizeProgress({...task.progress,completed:100}).completed,50);
  assert.equal(normalizeProgress({...task.progress,completed:-4}).completed,0);
  assert.equal(normalizeProgress({...task.progress,total:0}),undefined);
  assert.equal(normalizeProgress({...task.progress,total:2.5}),undefined);
  assert.equal(progressPercent({total:1000,completed:999,unit:'steps'}),99);
  const p=setCompletedCount({...task.progress,total:1000000},999999);
  assert.deepEqual(p.completedRanges,[[1,999999]]);
  assert.equal(JSON.stringify(p).length < 200,true);
  assert.deepEqual(toggleLevel(p,2000000),p);
});
test('ordinary tasks retain checkbox state and award fifty XP', () => {
  const plain={...task,progress:undefined,done:true};
  assert.equal(saveTask([plain],plain,today,'next')[0].done,true);
  assert.equal(normalizeProgress(undefined),undefined);
  assert.equal(playerStats([plain]).xp,50);
  assert.equal(playerStats([{...plain,done:false}]).xp,0);
});
test('recurrence retains names, resets levels, and deduplicates successor', () => {
  const recurring={...task,repeat:'Weekly',progress:renameLevel(task.progress,2,'Part modeling')};
  const done=saveTask([recurring],{...recurring,progress:setCompletedCount(recurring.progress,50)},today,'next');
  assert.equal(done.length,2); assert.equal(done[1].progress.completed,0);
  assert.deepEqual(done[1].progress.completedRanges,[]);
  assert.equal(done[1].progress.names[2],'Part modeling');
  assert.equal(done[1].done,false); assert.equal(done[1].due,'2026-11-06');
  const reopened=saveTask(done,{...done[0],progress:setCompletedCount(done[0].progress,49)},today,'unused');
  const completedAgain=saveTask(reopened,done[0],today,'another');
  assert.equal(completedAgain.length,2);
});
test('player levels, existing completed work, and deletions derive from current data', () => {
  const ordinary={...task,id:'ordinary',progress:undefined,done:true};
  assert.deepEqual(playerStats([]),{xp:0,level:1,levelXP:0});
  assert.deepEqual(playerStats([task,ordinary]),{xp:250,level:3,levelXP:50});
  assert.deepEqual(playerStats([ordinary]),{xp:50,level:1,levelXP:50});
  assert.deepEqual(playerStats([{...task,progress:setCompletedCount(task.progress,10)}]),{xp:100,level:2,levelXP:0});
});
test('random level and bulk operations agree with an independent set model', () => {
  let seed=412;
  const random=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n;};
  for(const total of [1,2,7,50,101]) {
    let p=normalizeProgress({total,completed:0,unit:'steps'});
    const complete=new Set();
    for(let i=0;i<200;i++) {
      if(random(3)) {
        const level=random(total)+1;
        if(complete.has(level))complete.delete(level);else complete.add(level);
        p=toggleLevel(p,level);
      } else {
        const count=random(total+1);
        for(let n=1;complete.size<count;n++)if(!complete.has(n))complete.add(n);
        for(let n=total;complete.size>count;n--)complete.delete(n);
        p=setCompletedCount(p,count);
      }
      assert.equal(p.completed,complete.size);
      for(let level=1;level<=total;level++)assert.equal(isLevelComplete(p,level),complete.has(level));
    }
  }
});
