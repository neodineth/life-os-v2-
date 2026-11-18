import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeOverlaps, calendarCommandSchema, dragOccurrence, expandCalendar, occurrenceOn, plannedBlockSchema, shiftDay, splitAtMidnights, zonedDay, zonedInstant, zonedTime } from '../src/lib/calendar.ts';
import { beginFocus, focusByDay, snapshotFocus } from '../src/lib/focus.ts';
import { mergeFocusRecords, pendingFocus, queueFocus } from '../src/lib/focus-sync.ts';

const zone = 'Asia/Colombo', id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const task = { id: 'task', title: 'English', levels: [{ number: 2, title: 'Grammar' }], note: 'Review examples' };
const block = (overrides = {}) => ({ id, task, workspace: 'University 01', start: zonedInstant('2026-11-02', '09:00', zone), end: zonedInstant('2026-11-02', '10:00', zone), timeZone: zone, repeat: { frequency: 'none', weekdays: [], until: null }, ...overrides });
const snapshot = (blocks, exceptions = []) => ({ blocks, exceptions, versions: { [id]: 1 }, timeZone: zone });
const range = (start, end) => [zonedInstant(start, '00:00', zone), zonedInstant(end, '00:00', zone)];

test('one-time blocks preserve exact times and midnight boundaries are half-open', () => {
  const source = block({ start: block().start + 1200, end: block().end + 1200 });
  assert.deepEqual(expandCalendar(snapshot([source]), ...range('2026-11-02', '2026-11-03')).map(item => [item.start, item.end]), [[source.start, source.end]]);
  assert.equal(expandCalendar(snapshot([source]), source.end, source.end + 1000).length, 0);
});
test('daily repetition includes the selected end date and stops after it', () => {
  const source = block({ repeat: { frequency: 'daily', weekdays: [], until: '2026-11-04' } });
  assert.deepEqual(expandCalendar(snapshot([source]), ...range('2026-11-01', '2026-11-08')).map(item => item.date), ['2026-11-02', '2026-11-03', '2026-11-04']);
});
test('weekly repeats honor selected weekdays and have stable occurrence IDs', () => {
  const source = block({ repeat: { frequency: 'weekly', weekdays: [1, 3], until: null } });
  const results = expandCalendar(snapshot([source]), ...range('2026-11-01', '2026-11-08'));
  assert.deepEqual(results.map(item => item.date), ['2026-11-02', '2026-11-04']);
  assert.equal(results[0].id, `${id}@2026-11-02`);
});
test('individual cancellation and moves preserve the series, including moves into another week', () => {
  const source = block({ repeat: { frequency: 'daily', weekdays: [], until: '2026-11-04' } });
  const moved = { seriesId: id, date: '2026-11-03', cancelled: false, override: { task, workspace: source.workspace, start: zonedInstant('2026-11-12', '11:00', zone), end: zonedInstant('2026-11-12', '12:00', zone) } };
  const data = snapshot([source], [{ seriesId: id, date: '2026-11-02', cancelled: true }, moved]);
  assert.deepEqual(expandCalendar(data, ...range('2026-11-01', '2026-11-08')).map(item => item.date), ['2026-11-04']);
  const later = expandCalendar(data, ...range('2026-11-08', '2026-11-15'));
  assert.equal(later.length, 1); assert.equal(later[0].id, `${id}@2026-11-03`); assert.equal(zonedDay(later[0].start, zone), '2026-11-12');
});
test('repeating wall times stay at 9am across DST changes', () => {
  const dst = 'America/New_York';
  const source = block({ start: zonedInstant('2026-03-07', '09:00', dst), end: zonedInstant('2026-03-07', '10:00', dst), timeZone: dst, repeat: { frequency: 'daily', weekdays: [], until: '2026-03-09' } });
  const results = expandCalendar(snapshot([source]), Date.parse('2026-03-07T00:00Z'), Date.parse('2026-03-10T00:00Z'));
  assert.ok(results.every(item => zonedTime(item.start, dst) === '09:00'));
  assert.equal(results[1].start - results[0].start, 23 * 3600000);
});
test('overnight plans and focus totals split at account-zone midnight', () => {
  const start = zonedInstant('2026-11-02', '23:30', zone), end = zonedInstant('2026-11-03', '00:30', zone);
  const pieces = splitAtMidnights(task, start, end, zone);
  assert.deepEqual(pieces.map(item => [item.day, item.end - item.start]), [['2026-11-02', 1800000], ['2026-11-03', 1800000]]);
  const records = [{ id: 'night', tasks: [task], startedAt: start, endedAt: end, segments: [{ state: 'focus', start, end }], interrupted: false }];
  const totals = focusByDay(records, zone);
  assert.equal(totals['2026-11-02'].focus, 1800000); assert.equal(totals['2026-11-03'].focus, 1800000);
});
test('overlap packing gives concurrent blocks separate columns and reuses free columns', () => {
  const results = arrangeOverlaps([{ id: 'a', start: 0, end: 100 }, { id: 'b', start: 20, end: 40 }, { id: 'c', start: 40, end: 80 }, { id: 'd', start: 100, end: 200 }]);
  assert.equal(results[0].columns, 2); assert.equal(results[1].column, results[2].column); assert.equal(results[3].columns, 1);
  for (let a = 0; a < results.length; a++) for (let b = a + 1; b < results.length; b++) if (results[a].start < results[b].end && results[b].start < results[a].end) assert.notEqual(results[a].column, results[b].column);
});
test('drag and resize preserve stable identity and enforce a positive snapped duration', () => {
  const original = occurrenceOn(block(), '2026-11-02', 1);
  const moved = dragOccurrence(original, 'move', 1455, zone);
  assert.equal(zonedDay(moved.start, zone), shiftDay('2026-11-02', 1)); assert.equal(zonedTime(moved.start, zone), '09:15');
  assert.equal(moved.id, original.id); assert.equal(moved.end - moved.start, original.end - original.start);
  assert.equal(dragOccurrence(original, 'end', -120, zone).end - original.start, 15 * 60000);
  assert.equal(original.start, block().start);
});
test('validation rejects invalid ranges, dates, empty weekly schedules, and foreign fields', () => {
  for (const change of [{ end: 0 }, { timeZone: 'invalid/zone' }, { timeZone: 'invalid/zone', repeat: { frequency: 'daily', weekdays: [], until: '2026-11-30' } }, { repeat: { frequency: 'weekly', weekdays: [], until: null } }, { repeat: { frequency: 'daily', weekdays: [], until: '2026-02-30' } }]) assert.equal(plannedBlockSchema.safeParse(block(change)).success, false);
  assert.equal(calendarCommandSchema.safeParse({ action: 'save', block: block(), expectedVersion: null, userId: 'other' }).success, false);
});
test('planned reference survives checkpoints and final records cannot regress to stale checkpoints', () => {
  const live = beginFocus('session', [task], 1000, `${id}@2026-11-02`);
  const checkpoint = snapshotFocus(live, 2000), complete = snapshotFocus(live, 3000, false);
  assert.equal(complete.plannedOccurrenceId, `${id}@2026-11-02`);
  assert.deepEqual(mergeFocusRecords([complete], [checkpoint]), [complete]);
  assert.deepEqual(mergeFocusRecords([checkpoint], [complete]), [complete]);
});
const storage = () => {
  const data = new Map();
  return { get length() { return data.size; }, key: index => [...data.keys()][index] ?? null, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
test('durable journal coalesces checkpoints, survives reload, and acknowledgments cannot delete newer records', () => {
  const store = storage(), live = beginFocus('session', [task], 0);
  const checkpoint = snapshotFocus(live, 1000), complete = snapshotFocus(live, 2000, false);
  queueFocus(store, 'alice:', 'one', checkpoint);
  const inFlight = pendingFocus(store, 'alice:')[0];
  queueFocus(store, 'alice:', 'two', complete);
  store.removeItem(inFlight.key);
  assert.deepEqual(pendingFocus(store, 'alice:').map(item => item.record), [complete]);
  assert.equal(pendingFocus(store, 'bob:').length, 0);
  queueFocus(store, 'alice:', 'three', checkpoint);
  assert.equal(pendingFocus(store, 'alice:')[0].record.interrupted, false);
});
