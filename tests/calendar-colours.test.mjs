import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarBlockAppearance} from '../src/lib/calendar.ts';
test('automatic time colours and explicit outcome overrides',()=>{
 const entry={end:1000};
 assert.equal(calendarBlockAppearance(entry,999),'upcoming');
 assert.equal(calendarBlockAppearance(entry,1000),'elapsed');
 assert.equal(calendarBlockAppearance({...entry,status:'pending'},1001),'elapsed');
 assert.equal(calendarBlockAppearance({...entry,status:'could_not_complete'},999),'could_not_complete');
 assert.equal(calendarBlockAppearance({...entry,status:'completed'},1001),'completed');
 assert.equal(calendarBlockAppearance({...entry,done:true},1001),'completed');
 assert.equal(calendarBlockAppearance({...entry,status:'partial'},999),'partial');
});
