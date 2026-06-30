import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const helpersSource = [
  'const qltdGanttDataRequests = new Map();',
  'const QLTD_GANTT_REQUEST_TIMEOUT_MS = 40000;',
  'const QLTD_GANTT_BUSY_RETRY_DELAY_MS = 1500;',
  extractFunction(appSource, 'qltdWeb07GetOrCreateGanttRequest'),
  extractFunction(appSource, 'qltdWeb07IsGanttBusyResponse'),
  extractFunction(appSource, 'qltdWeb07Delay'),
  extractFunction(appSource, 'qltdWeb07FetchGanttPayload')
].join('\n');

const context = {
  AbortController,
  Error,
  Map,
  Math,
  Number,
  Promise,
  String,
  window: { setTimeout, clearTimeout },
  fetchBackendJson: () => { throw new Error('A test fetcher is required'); }
};
vm.createContext(context);
vm.runInContext(`${helpersSource}\nthis.api = { qltdWeb07GetOrCreateGanttRequest, qltdWeb07FetchGanttPayload };`, context);

test('two calls for one project share a single physical request', async () => {
  let factoryCalls = 0;
  let resolveRequest;
  const factory = () => {
    factoryCalls += 1;
    return new Promise((resolve) => { resolveRequest = resolve; });
  };
  const first = context.api.qltdWeb07GetOrCreateGanttRequest('P1', factory);
  const second = context.api.qltdWeb07GetOrCreateGanttRequest('P1', factory);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(factoryCalls, 1);
  resolveRequest({ success: true });
  await first;

  const third = context.api.qltdWeb07GetOrCreateGanttRequest('P1', async () => {
    factoryCalls += 1;
    return { success: true };
  });
  await third;
  assert.equal(factoryCalls, 2);
});

test('Gantt request aborts with a controlled timeout', async () => {
  const fetcher = (action, params, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  await assert.rejects(
    context.api.qltdWeb07FetchGanttPayload('P1', { timeoutMs: 10, fetcher, delay: async () => {} }),
    (error) => error.code === 'GANTT_REQUEST_TIMEOUT' && /Quá thời gian tải Gantt/.test(error.message)
  );
});

test('GANTT_BUSY_RETRY waits once and then succeeds', async () => {
  let requestCount = 0;
  let delayCount = 0;
  const result = await context.api.qltdWeb07FetchGanttPayload('P1', {
    timeoutMs: 1000,
    fetcher: async () => {
      requestCount += 1;
      return requestCount === 1
        ? { success: false, error: 'GANTT_BUSY_RETRY', retryAfterMs: 1 }
        : { success: true, data: [{ id: '1' }] };
    },
    delay: async () => { delayCount += 1; }
  });
  assert.equal(result.success, true);
  assert.equal(requestCount, 2);
  assert.equal(delayCount, 1);
});

test('GANTT_BUSY_RETRY never loops beyond one retry', async () => {
  let requestCount = 0;
  await assert.rejects(
    context.api.qltdWeb07FetchGanttPayload('P1', {
      timeoutMs: 1000,
      fetcher: async () => {
        requestCount += 1;
        return { success: false, error: 'GANTT_BUSY_RETRY' };
      },
      delay: async () => {}
    }),
    (error) => error.code === 'GANTT_BUSY_RETRY'
  );
  assert.equal(requestCount, 2);
});

test('ganttData fetch passes AbortController signal and auto-load is view scoped', () => {
  const fetchSource = extractFunction(appSource, 'fetchBackendJson');
  assert.match(fetchSource, /signal: options\.signal/);
  const projectOptionsSource = extractFunction(appSource, 'renderProjectOptions');
  assert.match(projectOptionsSource, /qltdActiveView === 'dashboard' \|\| qltdActiveView === 'gantt'/);
});
