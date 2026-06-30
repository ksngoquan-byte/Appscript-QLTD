import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function isIdentifierChar(char) {
  return !!char && /[A-Za-z0-9_$]/.test(char);
}

function skipQuotedString(source, start, quote) {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') index += 1;
    else if (source[index] === quote) return index + 1;
  }
  throw new Error(`Unclosed ${quote} string at ${start}`);
}

function skipLineComment(source, start) {
  const end = source.indexOf('\n', start + 2);
  return end < 0 ? source.length : end + 1;
}

function skipBlockComment(source, start) {
  const end = source.indexOf('*/', start + 2);
  if (end < 0) throw new Error(`Unclosed block comment at ${start}`);
  return end + 2;
}

function skipTemplateExpression(source, start) {
  let depth = 1;
  for (let index = start; index < source.length;) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  throw new Error(`Unclosed template expression at ${start - 2}`);
}

function skipTemplateLiteral(source, start) {
  for (let index = start + 1; index < source.length;) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === '`') return index + 1;
    if (source[index] === '$' && source[index + 1] === '{') {
      index = skipTemplateExpression(source, index + 2);
      continue;
    }
    index += 1;
  }
  throw new Error(`Unclosed template literal at ${start}`);
}

function skipNonCode(source, index) {
  if (source[index] === "'" || source[index] === '"') {
    return skipQuotedString(source, index, source[index]);
  }
  if (source[index] === '`') return skipTemplateLiteral(source, index);
  if (source[index] === '/' && source[index + 1] === '/') return skipLineComment(source, index);
  if (source[index] === '/' && source[index + 1] === '*') return skipBlockComment(source, index);
  return index;
}

function skipTrivia(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
      continue;
    }
    const skipped = skipNonCode(source, index);
    if (skipped === index) return index;
    index = skipped;
  }
  return index;
}

function findMatchingDelimiter(source, start, open, close) {
  assert.equal(source[start], open, `Expected ${open} at ${start}`);
  let depth = 0;
  for (let index = start; index < source.length;) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }
    if (source[index] === open) depth += 1;
    else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  throw new Error(`Unclosed ${open} at ${start}`);
}

function findFunctionDeclaration(source, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declarationPattern = new RegExp(`^(async\\s+)?function\\s+${escapedName}\\s*\\(`, 'gm');
  const matches = Array.from(source.matchAll(declarationPattern));
  assert.equal(matches.length, 1, `Expected one top-level function ${name}, found ${matches.length}`);
  const start = matches[0].index;
  const functionStart = source.indexOf('function', start);
  const nameStart = source.indexOf(name, functionStart + 'function'.length);
  assert.equal(isIdentifierChar(source[nameStart + name.length]), false, `Invalid function name boundary for ${name}`);
  return { start, functionStart, nameEnd: nameStart + name.length };
}

function extractFunction(source, name) {
  const declaration = findFunctionDeclaration(source, name);
  const parametersStart = skipTrivia(source, declaration.nameEnd);
  assert.equal(source[parametersStart], '(', `Missing parameters for ${name}`);
  const parametersEnd = findMatchingDelimiter(source, parametersStart, '(', ')');
  const bodyStart = skipTrivia(source, parametersEnd + 1);
  assert.equal(source[bodyStart], '{', `Missing body for ${name}`);
  const bodyEnd = findMatchingDelimiter(source, bodyStart, '{', '}');
  return source.slice(declaration.start, bodyEnd + 1);
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
assert.doesNotThrow(() => new vm.Script(helpersSource));
vm.runInContext(`${helpersSource}\nthis.api = { qltdWeb07GetOrCreateGanttRequest, qltdWeb07FetchGanttPayload };`, context);

test('extractor handles async defaults and ignores comment/string lookalikes', () => {
  const fixture = [
    '// function target(options = {}) { return "comment"; }',
    'const stringCopy = "function target(options = {}) { return string; }";',
    'const templateCopy = `function target(options = {}) { return template; }`;',
    'async function target(options = { nested: true }) {',
    '  const value = `nested ${{ key: "value" }.key}`;',
    '  return options.nested ? value : "}";',
    '}'
  ].join('\n');
  const extracted = extractFunction(fixture, 'target');
  assert.match(extracted, /^async function target\(options = \{ nested: true \}\)/);
  assert.doesNotMatch(extracted, /comment|stringCopy|templateCopy/);
  assert.doesNotThrow(() => new vm.Script(extracted));
});

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
