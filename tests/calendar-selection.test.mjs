import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarSelection } from '../src/lib/calendar-selection.ts';
import { plannedBlockSchema, expandCalendar, zonedInstant } from '../src/lib/calendar.ts';
test('selection snaps half hours, supports reverse selection and midnight', () => {
 assert.deepEqual(calendarSelection(540, 540), {start:540,end:570});
 assert.deepEqual(calendarSelection(540, 630), {start:540,end:630});
 assert.deepEqual(calendarSelection(630, 540), {start:540,end:660});
 assert.deepEqual(calendarSelection(1439, 1500), {start:1410,end:1440});
 assert.deepEqual(calendarSelection(5, -30), {start:0,end:30});
});
test('calendar-only recurring entries expand without workspace tasks', () => {
 const block={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',task:{id:'entry',title:'Quick work'},workspace:'Calendar',origin:'calendar',timeZone:'Asia/Colombo',start:zonedInstant('2026-11-20','23:30','Asia/Colombo'),end:zonedInstant('2026-11-21','00:00','Asia/Colombo'),repeat:{frequency:'daily',weekdays:[],until:'2026-11-21'}};
 assert.equal(plannedBlockSchema.safeParse(block).success,true);
 assert.equal(plannedBlockSchema.safeParse({...block,origin:undefined}).success,false);
 assert.equal(plannedBlockSchema.safeParse({...block,workspace:'University 01'}).success,false);
 const occurrences=expandCalendar({timeZone:block.timeZone,blocks:[block],exceptions:[],versions:{[block.id]:1}},block.start,block.start+3*86400000);
 assert.equal(occurrences.length,2);assert.equal(occurrences[0].end-block.start,1800000);
});
