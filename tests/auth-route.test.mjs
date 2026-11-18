import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function authRoute(error) {
  const modules = new Map();
  const auth = Object.fromEntries(['signInWithPassword', 'signUp', 'resetPasswordForEmail', 'updateUser', 'signOut'].map(name => [name, async () => ({ error, data: {} })]));
  function load(name) {
    if (name === 'server-only') return {};
    if (name === '@/lib/supabase/server') return { createClient: async () => ({ auth }) };
    if (!name.startsWith('@/')) return require(name);
    if (modules.has(name)) return modules.get(name);
    const filename = fileURLToPath(new URL('../src/' + name.slice(2).replace(/\.ts$/, '') + '.ts', import.meta.url));
    const exports = {};
    modules.set(name, exports);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = dependency => dependency.startsWith('.') ? load('@/' + path.relative(fileURLToPath(new URL('../src/', import.meta.url)), path.resolve(path.dirname(filename), dependency)).replaceAll('\\', '/')) : load(dependency);
    vm.runInNewContext(source, { exports, require: localRequire, process, Request, Response, Headers, URL, TextDecoder, Uint8Array, Error }, { filename });
    return exports;
  }
  return load('@/app/api/auth/route').POST;
}

async function submit(error, action = 'login') {
  const response = await authRoute(error)(new Request('http://127.0.0.1:3000/api/auth', {
    method: 'POST', headers: { Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, email: 'test@example.test', ...(action !== 'recover' ? { password: 'test-password' } : {}), ...(action === 'signup' ? { confirmation: 'test-password' } : {}) }),
  }));
  return { response, body: await response.json() };
}

test('network failures during login, signup, and recovery return service unavailable', async () => {
  for (const action of ['login', 'signup', 'recover']) {
    const { response, body } = await submit({ name: 'AuthRetryableFetchError', status: 0 }, action);
    assert.equal(response.status, 503);
    assert.equal(body.code, 'auth_unavailable');
    assert.match(body.error, /connection/);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
  }
});

test('temporary auth server failure does not blame account credentials', async () => {
  const { response, body } = await submit({ status: 502 });
  assert.equal(response.status, 503);
  assert.equal(body.code, 'auth_unavailable');
});

test('invalid credentials and rate limits retain their specific responses', async () => {
  for (const [error, status, code] of [[{ status: 400, code: 'invalid_credentials' }, 400, 'credentials'], [{ status: 429 }, 429, 'rate_limit'], [{ status: 400, code: 'email_not_confirmed' }, 400, 'email_not_confirmed']]) {
    const result = await submit(error);
    assert.equal(result.response.status, status);
    assert.equal(result.body.code, code);
  }
});

test('a successful login still completes normally', async () => {
  const { response, body } = await submit(null);
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
});
