import assert from 'node:assert/strict';
import { routeHarness } from './helpers/route-harness.mjs';
const origin = 'http://127.0.0.1:3001', alice = '11111111-1111-4111-8111-111111111111';
await fetch('http://127.0.0.1:54329/__test/reset', { method: 'POST' });
const h = routeHarness(); let checks = 0;
async function call(route, body, account = alice) {
  const method = body ? 'POST' : 'GET';
  const response = await h.load(`@/app/api/${route}/route`)[method](new Request(origin + `/api/${route}`, { method, headers: { Origin: origin, 'X-LifeOS-Account': account, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  return { status: response.status, data: await response.json() };
}
const task = { id: 'api-scheduled', title: 'Weekly English', workspace: 'University 01', priority: 'Medium', repeat: 'None', done: false, due: '', start: '', focus: '', completionMode: 'occurrence' };
const block = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', task: { id: task.id, title: task.title }, workspace: task.workspace, start: Date.parse('2026-11-02T03:30Z'), end: Date.parse('2026-11-02T04:30Z'), timeZone: 'Asia/Colombo', origin: 'task', repeat: { frequency: 'weekly', weekdays: [1, 3], until: null } };
const command = { type: 'save-scheduled', task, blocks: [block], scheduleVersions: {}, expectedVersion: null, operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
try {
  assert.equal((await call('workspace', command)).status, 401); checks++;
  await h.login();
  assert.equal((await call('workspace', command, '22222222-2222-4222-8222-222222222222')).status, 401); checks++;
  const invalid = { ...command, blocks: [{ ...block, workspace: 'University 02' }] };
  assert.equal((await call('workspace', invalid)).status, 400);
  assert.equal((await call('workspace')).data.tasks.length, 0); assert.equal((await call('calendar')).data.blocks.length, 0); checks++;
  let saved = await call('workspace', command); assert.equal(saved.status, 200); assert.equal(saved.data.tasks[0].due, ''); checks++;
  saved = await call('workspace', command); assert.equal(saved.status, 200); assert.equal(saved.data.versions[task.id], 1); checks++;
  let calendar = await call('calendar'); assert.equal(calendar.data.taskSchedulesReady, true); assert.equal(calendar.data.blocks.length, 1); checks++;
  let complete = await call('calendar', { action: 'complete', seriesId: block.id, date: '2026-11-02', done: true, expectedVersion: null });
  assert.equal(complete.status, 200); assert.equal(complete.data.completions[0].done, true); assert.equal((await call('workspace')).data.tasks[0].done, false); checks++;
  complete = await call('calendar', { action: 'complete', seriesId: block.id, date: '2026-11-02', done: false, expectedVersion: 1 }); assert.equal(complete.data.completions[0].done, false); checks++;
  assert.equal((await call('workspace', { ...command, operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expectedVersion: 1, scheduleVersions: {} })).status, 409); checks++;
  await fetch('http://127.0.0.1:54329/__test/fail-next-save', { method: 'POST' });
  const update = { ...command, task: { ...task, title: 'Updated weekly English' }, blocks: [{ ...block, task: { ...block.task, title: 'Updated weekly English' } }], expectedVersion: 1, scheduleVersions: { [block.id]: 1 }, operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
  assert.equal((await call('workspace', update)).status, 503); assert.equal((await call('workspace')).data.tasks[0].title, task.title); checks++;
  assert.equal((await call('workspace', update)).status, 200); checks++;
  const ended = await call('workspace', { type: 'save', task: { ...update.task, done: true }, expectedVersion: 2, today: '2026-11-03', nextId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' });
  assert.equal(ended.status, 200); calendar = await call('calendar'); assert.ok(calendar.data.blocks[0].retiredAt); checks++;
  console.log(JSON.stringify({ passed: true, checks, coverage: ['real route/SDK/SQL', 'auth and account checks', 'atomic rollback', 'idempotent retries', 'completion/undo', 'stale writes', 'failed-save retry', 'ending a task'] }));
} finally { await h.close(); }
