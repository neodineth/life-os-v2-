import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareTaskOrder,isTaskStarred,saveTask} from '../src/lib/tasks.ts';
const task=(id,extra={})=>({id,title:id,workspace:'University 01',due:'',start:'',focus:'',priority:'Medium',done:false,repeat:'None',...extra});
test('stars persist across dates and sort ahead of earlier deadlines',()=>{
 const starred=task('starred',{focus:'2026-11-01',due:'2026-12-10'}),urgent=task('urgent',{due:'2026-11-01'});
 assert.equal(isTaskStarred(starred),true);
 assert.deepEqual([urgent,starred].sort(compareTaskOrder).map(t=>t.id),['starred','urgent']);
 assert.equal(isTaskStarred({...starred,focus:''}),false);
 assert.ok(compareTaskOrder({...starred,focus:''},urgent)>0);
});
test('completion drops starred tasks below unfinished tasks and recurring successors are unstarred',()=>{
 const starred=task('starred',{focus:'2026-11-01',repeat:'Daily',due:'2026-11-25'});
 const saved=saveTask([starred],{...starred,done:true},'2026-11-25','next');
 assert.equal(isTaskStarred(saved.find(t=>t.id==='starred')),false);
 assert.equal(saved.find(t=>t.id==='next').focus,'');
 assert.deepEqual(saved.sort(compareTaskOrder).map(t=>t.id),['next','starred']);
});
test('deadline sorting remains within starred and unstarred groups',()=>{
 const items=[task('no date'),task('late',{focus:'2026-11-20',due:'2026-12-01'}),task('early',{focus:'2026-11-01',due:'2026-11-25'}),task('due',{due:'2026-11-10'})];
 assert.deepEqual(items.sort(compareTaskOrder).map(t=>t.id),['early','late','due','no date']);
});
