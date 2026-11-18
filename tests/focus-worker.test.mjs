import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/focus-worker.js', import.meta.url), 'utf8');
function setup({ failGPU = false, failBitmap = false } = {}) {
  const messages = [], timestamps = [], delegates = [];
  let time = 0, closedBitmaps = 0;
  const context = vm.createContext({
    Error,
    self: { postMessage: message => messages.push(message) },
    performance: { timeOrigin: 100000, now: () => time },
    importScripts() {},
    OffscreenCanvas: class {},
    createImageBitmap: async () => {
      if (failBitmap) throw new Error('Unsupported stream frame');
      return { close() { closedBitmaps++; } };
    },
    Vision: {
      FilesetResolver: { forVisionTasks: async () => ({}) },
      FaceLandmarker: { createFromOptions: async (_, options) => {
        delegates.push(options.baseOptions.delegate);
        if (failGPU && options.baseOptions.delegate === 'GPU') throw new Error('No GPU');
        return { detectForVideo: (_, timestamp) => {
          timestamps.push(timestamp); time += 30;
          return { faceLandmarks: [Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))], faceBlendshapes: [] };
        } };
      } },
    },
  });
  vm.runInContext(source, context);
  return {
    messages, timestamps, delegates,
    send: data => context.self.onmessage({ data }),
    tick: () => { time += 220; },
    closedBitmaps: () => closedBitmaps,
  };
}
async function until(predicate) {
  for (let i = 0; i < 30; i++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('Worker did not finish');
}
function cameraStream(engine, count) {
  const state = { closed: 0, cancelled: false, released: false };
  let remaining = count;
  return { state, readable: { getReader: () => ({
    async read() {
      engine.tick();
      return remaining-- > 0 ? { value: { close() { state.closed++; } }, done: false } : { done: true };
    },
    async cancel() { state.cancelled = true; },
    releaseLock() { state.released = true; },
  }) } };
}

test('direct camera stream analyzes frames without DOM timers and releases every frame when it ends', async () => {
  const engine = setup(); await engine.send({ type: 'init' });
  const stream = cameraStream(engine, 3);
  await engine.send({ type: 'stream', readable: stream.readable });
  await until(() => stream.state.released);
  const results = engine.messages.filter(message => message.type === 'result');
  assert.equal(results.length, 3);
  assert.ok(results.every(result => result.present && result.analysisMs === 30 && Number.isFinite(result.capturedAt)));
  assert.ok(engine.timestamps.every((value, i, values) => i === 0 || value > values[i - 1]));
  assert.equal(stream.state.closed, 3); assert.equal(engine.closedBitmaps(), 3);
  assert.equal(stream.state.cancelled, true);
  assert.ok(engine.messages.some(message => message.type === 'error' && message.message.includes('stream ended')));
});

test('stream failure releases the reader before preview fallback and accepts subsequent preview frames', async () => {
  const engine = setup({ failBitmap: true }); await engine.send({ type: 'init' });
  const stream = cameraStream(engine, 1);
  await engine.send({ type: 'stream', readable: stream.readable });
  await until(() => engine.messages.some(message => message.type === 'capture-fallback'));
  assert.equal(stream.state.released, true); assert.equal(stream.state.closed, 1);
  let closed = false;
  await engine.send({ type: 'frame', capturedAt: 100220, frame: { close() { closed = true; } } });
  assert.equal(closed, true);
  assert.ok(engine.messages.some(message => message.type === 'result' && message.present));
});

test('GPU initialization failure retries with CPU', async () => {
  const engine = setup({ failGPU: true }); await engine.send({ type: 'init' });
  assert.deepEqual(engine.delegates, ['GPU', 'CPU']);
  assert.equal(engine.messages.find(message => message.type === 'ready').delegate, 'CPU');
});
