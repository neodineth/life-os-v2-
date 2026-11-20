import {test} from 'node:test';
import assert from 'node:assert/strict';
import {desktopReminders} from '../src/lib/desktop-reminders.ts';
import {zonedInstant} from '../src/lib/calendar.ts';
const zone='Asia/Colombo', at=(day,time)=>zonedInstant(day,time,zone);
const start=at('2026-11-20','10:00');
const block={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',task:{id:'entry',title:'Research'},workspace:'Calendar',origin:'calendar',start,end:start+3600000,timeZone:zone,repeat:{frequency:'daily',weekdays:[],until:null}};
const snapshot={timeZone:zone,blocks:[block],exceptions:[],versions:{[block.id]:1},completions:[]};
test('lead time, expired reminders and recurring dates',()=>{
 assert.equal(desktopReminders([],snapshot,start-11*60000,10).length,0);
 assert.equal(desktopReminders([],snapshot,start-10*60000,10).length,1);
 assert.equal(desktopReminders([],snapshot,start+60000,10).length,0);
 assert.notEqual(desktopReminders([],snapshot,start,10)[0].id,desktopReminders([],snapshot,start+86400000,10)[0].id);
});
test('cancelled, completed and unavailable linked tasks do not notify',()=>{
 assert.equal(desktopReminders([],{...snapshot,exceptions:[{seriesId:block.id,date:'2026-11-20',cancelled:true}]},start,10).length,0);
 assert.equal(desktopReminders([],{...snapshot,blocks:[{...block,workspace:'University 01',origin:undefined}]},start,10).length,0);
 const occurrence={...block,id:block.id+'@2026-11-20',seriesId:block.id,date:'2026-11-20',version:1,repeating:true};
 assert.equal(desktopReminders([],{...snapshot,completions:[{seriesId:block.id,date:'2026-11-20',done:true,version:1,occurrence}]},start,10).length,0);
});
test('deadline digest is time-zone aware, excludes finished and undated tasks',()=>{
 const tasks=[{id:'a',title:'Due today',due:'2026-11-20',done:false},{id:'b',title:'Done',due:'2026-11-19',done:true},{id:'c',title:'No deadline',due:'',done:false}];
 const empty={...snapshot,blocks:[]};
 assert.equal(desktopReminders(tasks,empty,at('2026-11-20','08:59'),10).length,0);
 const reminders=desktopReminders(tasks,empty,at('2026-11-20','09:00'),10);
 assert.equal(reminders.length,1);assert.equal(reminders[0].taskId,'a');assert.match(reminders[0].body,/due today/);
});
