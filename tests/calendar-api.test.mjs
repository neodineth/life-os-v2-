// Run tests/fixtures/supabase.mjs first. This exercises the actual route modules
// with the Supabase SDK and isolated SQL fixture, without hosted credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const { createServerClient } = require('@supabase/ssr');
const fixture = 'http://127.0.0.1:54329', origin = 'http://127.0.0.1:3001';
let jar = new Map(), checks = 0;
const clients = [], modules = new Map();
async function createClient() {
  const client = createServerClient(fixture, 'sb_publishable_test', { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name)) } });
  clients.push(client); return client;
}
function load(name) {
  if (name === '@/lib/supabase/server') return { createClient };
  if (name === 'server-only') return {};
  if (!name.startsWith('@/')) return require(name);
  if (modules.has(name)) return modules.get(name);
  const filename = path.join(root, 'src', name.slice(2) + '.ts'), exports = {};
  modules.set(name, exports);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = dependency => dependency.startsWith('.') ? load('@/' + path.relative(path.join(root, 'src'), path.resolve(path.dirname(filename), dependency)).replaceAll('\\', '/').replace(/\.ts$/, '')) : load(dependency);
  vm.runInNewContext(code, { exports, require: localRequire, process, Request, Response, Headers, URL, TextDecoder, Uint8Array }, { filename });
  return exports;
}
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function invoke(route, method, body, account = alice, extra = {}) {
  const request = new Request(origin + '/api/test?from=1793491200000&to=1794096000000', { method, headers: { Origin: origin, 'X-LifeOS-Account': account, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const response = await route[method](request);
  return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
}
async function status(promise, expected, code) {
  const response = await promise;
  assert.equal(response.status, expected, JSON.stringify(response.data));
  if (code) assert.equal(response.data.code, code);
  assert.match(response.cache, /no-store/); checks++; return response.data;
}
try {
  await fetch(fixture + '/__test/reset', { method: 'POST' });
  const auth = load('@/app/api/auth/route'), workspace = load('@/app/api/workspace/route'), calendar = load('@/app/api/calendar/route'), focus = load('@/app/api/focus/route');
  await status(invoke(calendar, 'GET'), 401, 'unauthenticated'); await status(invoke(focus, 'GET'), 401, 'unauthenticated');
  await status(invoke(auth, 'POST', { action: 'login', email: 'alice@example.test', password: 'correct-password' }), 200);
  const aliceJar = jar;
  const task = { id: 'calendar-task', title: 'English', workspace: 'University 01', priority: 'Medium', repeat: 'None', done: false, due: '2026-11-02', start: '', focus: '' };
  await status(invoke(workspace, 'POST', { type: 'save', task, expectedVersion: null, today: '2026-11-02', nextId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }), 200);
  const block = { id, task: { id: task.id, title: task.title, note: 'Read examples' }, workspace: task.workspace, start: Date.parse('2026-11-02T03:30Z'), end: Date.parse('2026-11-02T04:30Z'), timeZone: 'Asia/Colombo', repeat: { frequency: 'weekly', weekdays: [1, 3], until: '2026-11-30' } };
  await status(invoke(calendar, 'POST', { action: 'save', block, expectedVersion: null }, alice, { Origin: 'https://other.invalid' }), 403, 'origin');
  await status(invoke(calendar, 'POST', { action: 'save', block, expectedVersion: null }), 200);
  const loaded = await status(invoke(calendar, 'GET'), 200); assert.equal(loaded.occurrences.length, 2); assert.equal(loaded.timeZone, 'Asia/Colombo');
  const exception = { seriesId: id, date: '2026-11-04', cancelled: true };
  await status(invoke(calendar, 'POST', { action: 'exception', exception, expectedVersion: 1 }), 200);
  await status(invoke(calendar, 'POST', { action: 'save', block: { ...block, end: block.end + 1000 }, expectedVersion: 1 }), 409, 'conflict');
  await status(invoke(calendar, 'GET', undefined, bob), 401, 'account_changed');
  const record = { id: 'api-session', tasks: [block.task], startedAt: block.start, endedAt: block.end, segments: [{ state: 'focus', start: block.start, end: block.end }], interrupted: true, plannedOccurrenceId: `${id}@2026-11-02` };
  await status(invoke(focus, 'POST', { action: 'save', record, expectedVersion: null }), 200);
  const finalized = await status(invoke(focus, 'POST', { action: 'save', record: { ...record, interrupted: false }, expectedVersion: 1 }), 200);
  assert.equal(finalized.version, 2);
  const old = await status(invoke(focus, 'POST', { action: 'save', record, expectedVersion: 1 }), 200); assert.equal(old.record.interrupted, false);
  const imported = await status(invoke(focus, 'POST', { action: 'import', records: [record, { ...record, interrupted: false }] }), 200); assert.equal(imported.records.length, 1);
  jar = new Map(); await status(invoke(auth, 'POST', { action: 'login', email: 'bob@example.test', password: 'correct-password' }, bob), 200);
  assert.equal((await status(invoke(calendar, 'GET', undefined, bob), 200)).blocks.length, 0);
  assert.equal((await status(invoke(focus, 'GET', undefined, bob), 200)).records.length, 0);
  await status(invoke(calendar, 'POST', { action: 'save', block, expectedVersion: null }, bob), 400, 'validation');
  jar = aliceJar;
  await fetch(fixture + '/__test/fail-next-save', { method: 'POST' });
  await status(invoke(calendar, 'POST', { action: 'save', block: { ...block, end: block.end + 1000 }, expectedVersion: 2 }), 503);
  assert.equal((await status(invoke(calendar, 'GET'), 200)).versions[id], 2);
  await status(invoke(workspace, 'POST', { type: 'delete', id: task.id, expectedVersion: 1 }), 200);
  assert.equal((await status(invoke(calendar, 'GET'), 200)).blocks[0].task.title, task.title);
  assert.equal((await status(invoke(focus, 'GET'), 200)).records[0].tasks[0].note, 'Read examples');
  console.log(JSON.stringify({ passed: true, checks, isolatedFixture: true, coverage: ['actual route validation and SDK', 'authenticated calendar/focus writes', 'range expansion', 'origin rejection', 'account matching', 'stale writes', 'protected final records', 'idempotent import', 'cross-account isolation', 'failed save rollback', 'snapshots survive task deletion'] }));
} finally { await Promise.all(clients.map(client => client.auth.stopAutoRefresh())); }
