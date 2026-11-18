import test from 'node:test';
import assert from 'node:assert/strict';
import { taskSchema, commandSchema } from '../src/lib/cloud-model.ts';
import { saveTask, playerStats } from '../src/lib/tasks.ts';
import { expandCalendar, occurrenceOn, plannedBlockSchema } from '../src/lib/calendar.ts';
const task = { id: 'english', title: 'English practice', workspace: 'University 01', priority: 'Medium', repeat: 'None', done: false, due: '', start: '', focus: '', completionMode: 'occurrence' };
const block = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', task: { id: task.id, title: task.title }, workspace: task.workspace, start: Date.parse('2026-11-02T03:30Z'), end: Date.parse('2026-11-02T04:30Z'), timeZone: 'Asia/Colombo', origin: 'task', repeat: { frequency: 'weekly', weekdays: [1, 3], until: null } };
const range = [Date.parse('2026-11-01T00:00Z'), Date.parse('2026-11-15T00:00Z')];
const calendar = (blocks = [block], completions = []) => ({ timeZone: block.timeZone, blocks, exceptions: [], versions: { [block.id]: 1 }, completions });

test('deadline and availability dates remain independently optional, including export/import round trips', () => {
  for (const dates of [{ due: '', start: '' }, { due: '2026-12-01', start: '' }, { due: '', start: '2026-11-01' }, { due: '2026-12-01', start: '2026-11-01' }]) {
    const parsed = taskSchema.parse(JSON.parse(JSON.stringify({ ...task, ...dates })));
    assert.equal(parsed.due, dates.due); assert.equal(parsed.start, dates.start);
  }
});
test('scheduled tasks keep full shared levels without closing or spawning successors', () => {
  const full = taskSchema.parse({ ...task, progress: { total: 2, completed: 2, unit: 'lessons' } });
  assert.equal(full.done, false);
  const saved = saveTask([], full, '2026-11-03', 'successor'); assert.equal(saved.length, 1); assert.equal(saved[0].done, false);
  const ended = saveTask(saved, { ...full, done: true }, '2026-11-03', 'successor'); assert.equal(ended.length, 1); assert.equal(ended[0].progress.completed, 2);
  assert.equal(playerStats(saved).xp, playerStats(ended).xp);
  assert.equal(taskSchema.parse({ ...full, completionMode: 'task' }).done, true);
  assert.equal(taskSchema.safeParse({ ...task, repeat: 'Weekly' }).success, false);
});
test('multiple fixed time slots repeat independently without needing a deadline', () => {
  const second = { ...block, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', start: Date.parse('2026-11-04T08:30Z'), end: Date.parse('2026-11-04T09:30Z'), repeat: { ...block.repeat, weekdays: [3] } };
  assert.equal(expandCalendar(calendar([block, second]), ...range).length, 6);
  const command = { type: 'save-scheduled', task, expectedVersion: null, operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', blocks: [block, second], scheduleVersions: {} };
  assert.equal(commandSchema.safeParse(command).success, true);
  assert.equal(plannedBlockSchema.safeParse({ ...block, repeat: { ...block.repeat, weekdays: [] } }).success, false);
});
test('completion snapshots survive series edits, exceptions, retirement and removal without affecting other weeks', () => {
  const occurrence = occurrenceOn(block, '2026-11-02', 1), completed = { seriesId: block.id, date: occurrence.date, version: 1, done: true, occurrence };
  const changed = { ...block, start: block.start + 3600000, end: block.end + 3600000, repeat: { ...block.repeat, weekdays: [3] } };
  const expanded = expandCalendar(calendar([changed], [completed]), ...range);
  assert.equal(expanded.find(item => item.done).start, block.start);
  assert.ok(expanded.some(item => item.date === '2026-11-11' && !item.done));
  assert.equal(expandCalendar(calendar([], [completed]), ...range).length, 1);
  assert.equal(expandCalendar(calendar([{ ...block, retiredAt: block.start }], [completed]), ...range).length, 1);
  const undone = expandCalendar(calendar([block], [{ ...completed, done: false, version: 2 }]), ...range);
  assert.equal(undone.find(item => item.date === occurrence.date).completionVersion, 2);
  assert.equal(undone.filter(item => item.done).length, 0);
});
test('retirement uses moved occurrence time, and completed snapshots do not duplicate intervals', () => {
  const occurrence = occurrenceOn(block, '2026-11-02', 1), snapshot = calendar([{ ...block, retiredAt: block.start + 1800000 }]);
  snapshot.exceptions = [{ seriesId: block.id, date: occurrence.date, cancelled: false, override: { task: block.task, workspace: block.workspace, start: block.start + 3600000, end: block.end + 3600000 } }];
  assert.equal(expandCalendar(snapshot, ...range).length, 0);
  const completed = { seriesId: block.id, date: occurrence.date, version: 1, done: true, occurrence };
  const result = expandCalendar(calendar([block], [completed]), ...range);
  assert.equal(result.filter(item => item.id === occurrence.id).length, 1);
});
