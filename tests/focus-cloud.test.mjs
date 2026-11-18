// Runs the real focus hook, route module, SDK and SQL fixture with deterministic
// hooks/clocks. No webcam, live account, browser credentials or hosted writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { routeHarness, ts } from './helpers/route-harness.mjs';
const alice = '11111111-1111-4111-8111-111111111111';
const key = `lifeos.focus.v1:${alice}`, prefix = `lifeos.focus.pending.v2:${alice}:`;
const wall = Date.parse('2026-11-02T03:30:00Z');
const data = new Map(); let quota = false;
const storage = { get length() { return data.size; }, key: index => [...data.keys()][index] ?? null, getItem: key => data.get(key) ?? null, setItem: (key, value) => { if (quota) throw new Error('Storage quota'); data.set(key, value); }, removeItem: key => data.delete(key) };
const source = readFileSync(new URL('../src/hooks/use-focus-sessions.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const fixture = routeHarness();
let offline = false, holdNextSave = false, releaseHeld, elapsed = 0, checks = 0;
const held = new Set();
const locks = { async request(name, options, callback) { if (held.has(name)) return callback(null); held.add(name); try { return await callback({ name }); } finally { held.delete(name); } } };
function mount() {
  const states = [], effects = [], timers = new Map();
  const exports = {};
  const react = { useRef: current => ({ current }), useCallback: value => value, useEffect: effect => effects.push(effect), useState: initial => { const index = states.length; states.push(typeof initial === 'function' ? initial() : initial); return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; } };
  const focus = fixture.load('@/app/api/focus/route');
  const eventTarget = { addEventListener() {}, removeEventListener() {} };
  vm.runInNewContext(code, {
    exports, require: name => name === 'react' ? react : fixture.load(name), Error, TypeError,
    Date: { now: () => wall }, performance: { now: () => elapsed },
    crypto: { randomUUID }, navigator: { locks }, localStorage: storage, AbortSignal, queueMicrotask,
    document: { ...eventTarget, hidden: false }, window: { ...eventTarget, setInterval: (callback, delay) => { const id = timers.size + 1; timers.set(id, { callback, delay }); return id; } }, clearInterval: id => timers.delete(id),
    fetch: async (url, options) => {
      if (offline) throw new Error('Offline: records kept locally');
      const request = new Request('http://127.0.0.1:3000' + url, { ...options, headers: { ...options.headers, Origin: 'http://127.0.0.1:3000' } });
      const save = options.body && JSON.parse(options.body).action === 'save';
      const response = await focus[options.method](request);
      if (save && holdNextSave) { holdNextSave = false; await new Promise(resolve => { releaseHeld = resolve; }); }
      return response;
    },
  });
  const hook = exports.useFocusSessions(alice), cleanup = effects.map(effect => effect()).filter(Boolean);
  return { hook, states, unmount() { cleanup.forEach(callback => callback()); } };
}
const settle = async predicate => { for (let index = 0; index < 400; index++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('Focus cloud check timed out'); };
const records = async () => {
  const response = await fixture.load('@/app/api/focus/route').GET(new Request('http://127.0.0.1:3000/api/focus', { headers: { 'X-LifeOS-Account': alice } }));
  assert.equal(response.status, 200); return (await response.json()).records;
};
const task = { id: 'task', title: 'English', note: 'Review examples', levels: [{ number: 2, title: 'Past tense' }] };
let current;
try {
  await fetch('http://127.0.0.1:54329/__test/reset', { method: 'POST' }); await fixture.login();
  const legacy = { id: 'legacy', tasks: [task], startedAt: wall - 7200000, endedAt: wall - 3600000, interrupted: false, segments: [{ state: 'focus', start: wall - 7200000, end: wall - 3600000 }] };
  storage.setItem(key, JSON.stringify([legacy])); current = mount();
  await settle(async () => current.states[6] && (await records()).some(record => record.id === 'legacy'));
  assert.equal(storage.getItem(`lifeos.focus.backup.v1:${alice}`), JSON.stringify([legacy])); checks++;
  await settle(() => storage.getItem(`lifeos.focus.imported.v2:${alice}`) === '1');
  holdNextSave = true;
  assert.equal(await current.hook.start([task], 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@2026-11-02'), true);
  const sessionId = current.states[1].id;
  await settle(() => !!releaseHeld);
  current.hook.observe(true); elapsed = 1000; current.hook.observe(true); elapsed = 2000; current.hook.stop();
  assert.ok([...data.keys()].some(item => item.startsWith(prefix))); releaseHeld();
  await settle(async () => (await records()).some(record => record.id === sessionId && !record.interrupted));
  await settle(() => ![...data.keys()].some(item => item.startsWith(prefix)));
  assert.equal((await records()).find(record => record.id === sessionId).plannedOccurrenceId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@2026-11-02'); checks++;
  elapsed = 3000; assert.equal(await current.hook.start([task]), true); const offlineId = current.states[1].id;
  current.hook.observe(true); elapsed = 4000; current.hook.observe(true);
  await settle(() => ![...data.keys()].some(item => item.startsWith(prefix)));
  offline = true; elapsed = 10000; current.hook.observe(true); current.hook.stop();
  await settle(() => current.states[3].includes('Offline')).catch(error => { console.error(JSON.stringify({ stage: 'offline', storageError: current.states[2], syncError: current.states[3], pending: current.states[4], held: [...held] })); throw error; });
  assert.ok([...data.keys()].some(item => item.startsWith(prefix))); checks++;
  current.unmount(); offline = false; current = mount();
  await settle(async () => (await records()).some(record => record.id === offlineId && !record.interrupted));
  await settle(() => ![...data.keys()].some(item => item.startsWith(prefix))); checks++;
  const latest = (await records()).find(record => record.id === offlineId); assert.equal(latest.endedAt, wall + 10000); assert.equal(latest.tasks[0].note, task.note); checks++;
  elapsed = 11000; quota = true; assert.equal(await current.hook.start([task]), true); const unsavedId = current.states[1].id;
  current.hook.observe(true); elapsed = 12000; current.hook.observe(true); current.hook.stop();
  await new Promise(resolve => setImmediate(resolve)); // Next user action, after the recording lock is released.
  elapsed = 13000; assert.equal(await current.hook.start([task]), true);
  assert.ok(current.states[0].some(record => record.id === unsavedId && !record.interrupted)); checks++;
  quota = false; current.hook.stop(); await current.hook.refresh();
  await settle(async () => (await records()).some(record => record.id === unsavedId && !record.interrupted)); checks++;
  assert.equal(storage.getItem(`lifeos.focus.backup.v1:${alice}`), JSON.stringify([legacy])); checks++;
  console.log(JSON.stringify({ passed: true, checks, coverage: ['automatic legacy import and retained backup', 'checkpoint acknowledgment racing Stop', 'immediate final upload drain', 'planned reference retained', 'offline journal and reload recovery', 'cloud metadata preserved', 'quota failure does not erase in-memory history', 'quota recovery and retry'] }));
} finally { current?.unmount(); await fixture.close(); }
