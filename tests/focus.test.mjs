import test from 'node:test';
import assert from 'node:assert/strict';
import { beginFocus, observeFocus, snapshotFocus, trackingGap, transitionFocus, focusByDay, breakLabel, focusHistorySchema, focusSampleFresh, focusTaskFromTask, TRACKING_GAP_MS } from '../src/lib/focus.ts';

const tasks = [{ id: 'one', title: 'Study English' }, { id: 'two', title: 'Practice CAD' }];
test('focus starts with empty optional fields for tasks with or without levels; legacy history still loads', () => {
  for (const task of [{ ...tasks[0] }, { ...tasks[0], progress: { total: 3, completed: 0, unit: 'lessons' } }]) {
    const chosen = focusTaskFromTask(task, [], '   ');
    assert.deepEqual(chosen, tasks[0]);
    const record = snapshotFocus(beginFocus('optional', [chosen], 0), 1000);
    assert.deepEqual(focusHistorySchema.parse([record]), [record]);
  }
});
test('focus level selections and notes survive storage without changing task completion', () => {
  const task = { ...tasks[0], progress: { total: 3, completed: 1, unit: 'lessons', completedRanges: [[1, 1]], names: { 2: 'Past tense' } } };
  const before = structuredClone(task);
  const chosen = focusTaskFromTask(task, [3, 2, 2, 0, 4, 1.5, NaN], '  Practice grammar\nThen review examples.  ');
  assert.deepEqual(chosen.levels, [{ number: 2, title: 'Past tense' }, { number: 3, title: 'Lesson 3' }]);
  assert.equal(chosen.note, 'Practice grammar\nThen review examples.');
  assert.deepEqual(task, before);
  const record = snapshotFocus(beginFocus('details', [chosen, tasks[1]], 0), 1000, false);
  assert.deepEqual(focusHistorySchema.parse(JSON.parse(JSON.stringify([record]))), [record]);
  assert.equal(focusTaskFromTask(task, [], 'x'.repeat(1100)).note.length, 1000);
  assert.equal(focusTaskFromTask(tasks[1], [1]).levels, undefined);
});
test('sample freshness rejects delayed and invalid results at the watchdog boundary', () => {
  assert.equal(focusSampleFresh(0), true);
  assert.equal(focusSampleFresh(TRACKING_GAP_MS), true);
  for (const age of [TRACKING_GAP_MS + 1, -1, NaN, Infinity]) assert.equal(focusSampleFresh(age), false);
});
test('continuous background samples retain focus without preview heartbeats; a stream gap stays untracked', () => {
  let session = beginFocus('background', tasks, 0);
  for (let at = 0; at <= 10000; at += 200) {
    session = observeFocus(session, true, at);
  }
  assert.equal(session.state, 'focus');
  assert.equal(snapshotFocus(session, 10000).segments.reduce((sum, segment) => sum + (segment.state === 'focus' ? segment.end - segment.start : 0), 0), 10000);
  const lost = trackingGap(session, 20000);
  assert.equal(lost.state, 'untracked');
  assert.equal(lost.since, 10000 + TRACKING_GAP_MS);
});
const sum = session => Object.values(focusByDay([session])).reduce((total, day) => total + day.focus, 0);
function samples(session, start, end, present) {
  for(let now = start; now <= end; now += 250) session = observeFocus(session, present, now);
  return session;
}
test('eyes need a stable second; eye loss under ten seconds never creates a break', () => {
  for (const duration of [500, 3000, 9000, 9999]) {
    let session = samples(beginFocus('session', tasks, 0), 0, 1000, true);
    assert.equal(session.state, 'focus');
    session = samples(session, 1250, 1250 + duration - 1, false);
    session = observeFocus(session, true, 1250 + duration);
    assert.equal(session.state, 'focus');
    const record = snapshotFocus(session, 1250 + duration, false);
    assert.equal(record.segments.filter(s => s.state === 'away').length, 0);
    assert.equal(sum(record), 1250 + duration);
  }
});
test('ten seconds of continuous eye loss starts an absence at its first sample; stable return resumes', () => {
  let session = samples(beginFocus('session', tasks, 0), 0, 1000, true);
  session = samples(session, 1250, 11000, false);
  session = observeFocus(session, false, 11249);
  assert.equal(session.state, 'focus');
  session = observeFocus(session, false, 11250);
  assert.equal(session.state, 'away'); assert.equal(session.since, 1250);
  session = samples(session, 11500, 12250, true);
  assert.equal(session.state, 'away');
  session = observeFocus(session, true, 12500);
  assert.equal(session.state, 'focus'); assert.equal(session.since, 11500);
  const record = snapshotFocus(session, 12750, false);
  assert.deepEqual(record.segments.find(s => s.state === 'away'), { state: 'away', start: 1250, end: 11500 });
  assert.equal(sum(record), 2500);
});
test('break threshold is inclusive at exactly five minutes', () => {
  assert.equal(breakLabel(299999), 'Short break');
  assert.equal(breakLabel(300000), 'Short break');
  assert.equal(breakLabel(300001), 'Long break');
});
test('lost frames and sleep cannot accumulate focus indefinitely', () => {
  let session = samples(beginFocus('session', tasks, 0), 0, 1000, true);
  session = trackingGap(session, 600000);
  assert.equal(session.state, 'untracked');
  const record = snapshotFocus(session, 600000);
  assert.equal(sum(record), 1000 + TRACKING_GAP_MS);
  assert.equal(record.interrupted, true);
  const hidden = transitionFocus(samples(beginFocus('hidden', tasks, 0), 0, 1000, true), 'untracked', 1000);
  assert.equal(sum(snapshotFocus(hidden, 600000)), 1000);
});
test('manual pause never auto-resumes when eyes reappear', () => {
  let session = samples(beginFocus('session', tasks, 0), 0, 1000, true);
  session = transitionFocus(session, 'paused', 1000);
  session = samples(session, 2000, 6000, true);
  assert.equal(session.state, 'paused');
  assert.equal(sum(snapshotFocus(session, 6000)), 1000);
  session = transitionFocus(session, 'untracked', 6000);
  session = samples(session, 6000, 7000, true);
  assert.equal(session.state, 'focus');
});
test('multiple selected tasks share one session total rather than multiplying time', () => {
  const session = samples(beginFocus('session', tasks, 0), 0, 1000, true);
  const record = snapshotFocus(session, 2000, false);
  assert.equal(record.tasks.length, 2); assert.equal(sum(record), 2000);
  assert.deepEqual(focusHistorySchema.parse(JSON.parse(JSON.stringify([record]))), [record]);
});
test('calendar splits focus and absence at local midnight', () => {
  const start = new Date(2026, 9, 30, 23, 59, 0).getTime();
  const record = { id:'midnight', tasks, startedAt:start, endedAt:start+240000, interrupted:false, segments:[
    { state:'focus', start, end:start+120000 }, { state:'away', start:start+120000, end:start+240000 }
  ] };
  const days = focusByDay([record]);
  assert.equal(days['2026-10-30'].focus, 60000);
  assert.equal(days['2026-10-31'].focus, 60000);
  assert.equal(days['2026-10-31'].away, 120000);
});
test('corrupt or overlapping stored segments are rejected instead of silently overwritten', () => {
  const record = snapshotFocus(beginFocus('session', tasks, 0), 1000);
  assert.equal(focusHistorySchema.safeParse([{ ...record, segments:[{ state:'focus', start:1000, end:0 }] }]).success, false);
  assert.equal(focusHistorySchema.safeParse([{ ...record, segments:[{ state:'focus', start:0, end:900 }, { state:'away', start:500, end:1000 }] }]).success, false);
});
