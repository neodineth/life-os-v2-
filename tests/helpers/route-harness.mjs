import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
export const requireProject = createRequire(new URL('../../package.json', import.meta.url));
export const ts = requireProject('typescript');
const { createServerClient } = requireProject('@supabase/ssr');

export function routeHarness() {
  const jar = new Map(), modules = new Map(), clients = [];
  async function createClient() {
    const client = createServerClient('http://127.0.0.1:54329', 'sb_publishable_test', { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name)) } });
    clients.push(client); return client;
  }
  function load(name) {
    if (name === '@/lib/supabase/server') return { createClient };
    if (name === 'server-only') return {};
    if (!name.startsWith('@/')) return requireProject(name);
    if (modules.has(name)) return modules.get(name);
    const filename = path.join(root, 'src', name.slice(2) + '.ts'), exports = {};
    modules.set(name, exports);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = dependency => dependency.startsWith('.') ? load('@/' + path.relative(path.join(root, 'src'), path.resolve(path.dirname(filename), dependency)).replaceAll('\\', '/').replace(/\.ts$/, '')) : load(dependency);
    vm.runInNewContext(code, { exports, require: localRequire, process, Request, Response, Headers, URL, TextDecoder, Uint8Array }, { filename }); return exports;
  }
  return { load, async login() { const { error } = await (await createClient()).auth.signInWithPassword({ email: 'alice@example.test', password: 'correct-password' }); if (error) throw error; }, async close() { await Promise.all(clients.map(client => client.auth.stopAutoRefresh())); } };
}
