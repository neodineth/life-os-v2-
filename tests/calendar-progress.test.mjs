import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarCommandSchema,expandCalendar,zonedInstant} from '../src/lib/calendar.ts';
import {timelineMinute,visibleTimelineSlice,calendarSelection} from '../src/lib/calendar-selection.ts';
import {progressLinks} from '../src/lib/progress-links.ts';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',zone='Asia/Colombo';
const start=zonedInstant('2026-11-21','05:00',zone),end=zonedInstant('2026-11-21','07:00',zone);
const block={id,task:{id:'entry',title:'Research'},workspace:'Calendar',origin:'calendar',timeZone:zone,start,end,repeat:{frequency:'daily',weekdays:[],until:null}};
const snapshot={timeZone:zone,blocks:[block],exceptions:[],versions:{[id]:1},completions:[]};
test('collapsed hours preserve coordinate mapping and overnight slices',()=>{
 assert.equal(timelineMinute(0,540,360),360);assert.equal(timelineMinute(540,540,360),1440);
 assert.deepEqual(calendarSelection(timelineMinute(0,540,360),timelineMinute(60,540,360)),{start:360,end:480});
 assert.equal(timelineMinute(0,540,0),0);assert.equal(timelineMinute(270,540,0),720);
 const six=zonedInstant('2026-11-21','06:00',zone);
 assert.equal(visibleTimelineSlice({start,end},six).start,six);
 assert.equal(visibleTimelineSlice({start,end:six},six),null);
 assert.equal(visibleTimelineSlice({start:six,end},six).start,six);
});
test('progress belongs to one occurrence and preserves notes',()=>{
 const occurrence=expandCalendar(snapshot,start,end)[0];
 const progress={seriesId:id,date:'2026-11-21',done:false,status:'partial',notes:'Read the paper https://example.com',version:1,occurrence};
 const events=expandCalendar({...snapshot,completions:[progress]},start,end+86400000);
 assert.equal(events[0].status,'partial');assert.equal(events[0].notes,progress.notes);assert.equal(events[1].status,undefined);
 assert.equal(expandCalendar({...snapshot,blocks:[],completions:[progress]},start,end)[0].notes,progress.notes);
 assert.equal(calendarCommandSchema.safeParse({action:'progress',seriesId:id,date:'2026-11-21',status:'partial',notes:'x'.repeat(10001),expectedVersion:null,expectedSeriesVersion:1}).success,false);
});
test('only HTTP and HTTPS links become clickable; markup stays plain text',()=>{
 const parts=progressLinks('Done <script>alert(1)</script> javascript:alert(1) https://example.com/work');
 assert.equal(parts.filter(p=>p.href).length,1);assert.equal(parts.find(p=>p.href).href,'https://example.com/work');
});
