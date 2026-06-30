import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const servicePath = path.join(repoRoot, 'apps-script-dev-api', '35_GANTT_DATA_SERVICE.js');
const currentSource = fs.readFileSync(servicePath, 'utf8');

function createContext(source = currentSource) {
  const context = {
    console: { warn() {}, log() {}, error() {} },
    Utilities: {
      formatDate(value) {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
      }
    },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    CacheService: { getScriptCache: () => ({ get: () => null }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { openById() { throw new Error('Not used by this test'); } },
    qltdProjectsNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
    qltdProjectsGetByCode_: () => null,
    qltdTaskContextResolveDataset_: () => {},
    qltdTaskContextFilterLinks_: (links) => links,
    qltdTaskContextBuildPublicDataset_: (tasks) => tasks
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

function runGetDataScenario({ locked, cacheValues, buildResult, cachePutResult }) {
  const context = createContext();
  let buildCount = 0;
  let releaseCount = 0;
  const cacheQueue = cacheValues.slice();
  context.LockService = {
    getScriptLock: () => ({
      tryLock: () => locked,
      releaseLock: () => { releaseCount += 1; }
    })
  };
  context.qltdGanttCacheGet_ = () => cacheQueue.shift() || null;
  context.qltdGanttBuildDataForProject_ = () => {
    buildCount += 1;
    return buildResult || { success: true, data: [], links: [], warnings: [] };
  };
  context.qltdGanttCachePut_ = () => cachePutResult || ({ stored: true });
  const result = vm.runInContext('qltdGanttGetDataForProject_("P1")', context);
  return { result, buildCount, releaseCount };
}

test('lock acquired builds once and releases the lock', () => {
  const outcome = runGetDataScenario({ locked: true, cacheValues: [null, null] });
  assert.equal(outcome.result.success, true);
  assert.equal(outcome.buildCount, 1);
  assert.equal(outcome.releaseCount, 1);
});

test('lock unavailable uses the cache recheck without rebuilding', () => {
  const cached = {
    success: true,
    data: [{ id: '1' }],
    links: [],
    performance: { cacheHit: true, rowsRead: 10, taskCount: 1 }
  };
  const outcome = runGetDataScenario({ locked: false, cacheValues: [null, cached] });
  assert.equal(outcome.result.success, true);
  assert.equal(outcome.result.performance.cacheHit, true);
  assert.equal(outcome.result.performance.waitedForCache, true);
  assert.equal(outcome.buildCount, 0);
  assert.equal(outcome.releaseCount, 0);
});

test('lock unavailable and empty cache returns controlled busy response', () => {
  const outcome = runGetDataScenario({ locked: false, cacheValues: [null, null] });
  assert.equal(outcome.result.success, false);
  assert.equal(outcome.result.error, 'GANTT_BUSY_RETRY');
  assert.equal(outcome.result.retryAfterMs, 1500);
  assert.equal(outcome.buildCount, 0);
  assert.equal(outcome.releaseCount, 0);
  assert.equal(outcome.result.performance.cacheHit, false);
});

test('oversized CacheService payload falls back with a response warning', () => {
  const context = createContext();
  context.__payload = { success: true, data: 'x'.repeat(25000 * 61), warnings: [] };
  context.CacheService = {
    getScriptCache() {
      throw new Error('CacheService must not be called after the size guard');
    }
  };
  const result = vm.runInContext('qltdGanttCachePut_("P1", __payload)', context);
  assert.equal(result.stored, false);
  assert.equal(result.warning.type, 'GANTT_CACHE_PAYLOAD_TOO_LARGE');
  assert.ok(result.warning.chunkCount > result.warning.maxChunks);
});

test('cache fallback warning is returned without failing valid Gantt data', () => {
  const outcome = runGetDataScenario({
    locked: true,
    cacheValues: [null, null],
    buildResult: { success: true, data: [{ id: '1' }], links: [], warnings: [] },
    cachePutResult: { stored: false, warning: { type: 'GANTT_CACHE_PAYLOAD_TOO_LARGE' } }
  });
  assert.equal(outcome.result.success, true);
  assert.equal(outcome.result.warnings[0].type, 'GANTT_CACHE_PAYLOAD_TOO_LARGE');
});

test('performance payload keeps cache, duration, row and task metrics', () => {
  const context = createContext();
  const performance = vm.runInContext('qltdGanttPerformance_(Date.now() - 25, false, 141, 10, 140)', context);
  assert.equal(performance.cacheHit, false);
  assert.ok(performance.durationMs >= 0);
  assert.equal(performance.rowsRead, 141);
  assert.equal(performance.taskCount, 140);
});

test('sheet read stops at the last task row instead of reading the whole sheet', () => {
  const context = createContext();
  const headers = ['id', 'cong_viec', 'bat_dau_ke_hoach', 'ket_thuc_ke_hoach'];
  const dataRows = [
    ['1', 'Task 1', '2026-01-01', '2026-01-02'],
    ['2', 'Task 2', '2026-01-03', '2026-01-04'],
    ['3', 'Task 3', '2026-01-05', '2026-01-06'],
    ['4', 'Task 4', '2026-01-07', '2026-01-08']
  ];
  const calls = [];
  const sheet = {
    getName: () => 'Cong_viec',
    getMaxRows: () => 1000,
    getMaxColumns: () => 20,
    getLastColumn: () => 4,
    getLastRow: () => 5,
    getRange(row, column, rowCount, columnCount) {
      calls.push({ row, column, rowCount, columnCount });
      return {
        getValues() {
          if (row === 1 && rowCount === 12) {
            return [headers, ...dataRows, ...Array.from({ length: 7 }, () => ['', '', '', ''])];
          }
          return [headers, ...dataRows].slice(0, rowCount);
        },
        getDisplayValues() {
          return [...dataRows.map((item) => item.slice(0, columnCount)),
            ...Array.from({ length: rowCount - dataRows.length }, () => Array(columnCount).fill(''))];
        }
      };
    }
  };
  context.__sheet = sheet;
  context.__warnings = [];
  const result = vm.runInContext('qltdGanttReadSourceValues_(__sheet, __warnings)', context);
  assert.equal(result.rowsRead, 5);
  assert.equal(result.columnsRead, 4);
  assert.ok(calls.some((call) => call.row === 1 && call.rowCount === 5));
  assert.ok(calls.every((call) => call.rowCount <= 999));
});

function resolveGitExecutable() {
  const candidates = [
    process.env.GIT_EXE,
    'C:\\Users\\DELL\\AppData\\Local\\GitHubDesktop\\app-3.6.1\\resources\\app\\git\\cmd\\git.exe',
    'git'
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === 'git' || fs.existsSync(candidate));
}

function buildFixtureProjection(source) {
  const context = createContext(source);
  context.__values = [
    ['id', 'wbs', 'cong_viec', 'bat_dau_ke_hoach', 'ket_thuc_ke_hoach', 'predecessor', 'milestone', 'parent'],
    ['1', 'I', 'Nhóm LK 01', '2026-01-01', '2026-01-10', '', '', '0'],
    ['2', 'I.1', 'Thi công móng', '2026-01-02', '2026-01-05', '1FS', '', '0'],
    ['3', 'I.2', 'Mốc nghiệm thu', '2026-01-10', '2026-01-10', '2FS', 'TRUE', '0']
  ];
  return JSON.parse(vm.runInContext(`(() => {
    const warnings = [];
    const detected = qltdGanttDetectHeader_(__values);
    const tasks = qltdGanttBuildTasks_(__values, detected, warnings, 'Tien_do_tong_hop');
    qltdGanttApplyWbsParents_(tasks, warnings);
    const links = qltdGanttBuildLinks_(tasks, warnings);
    return JSON.stringify({
      taskCount: tasks.length,
      linkCount: links.length,
      milestoneCount: tasks.filter((task) => task.type === 'milestone').length,
      tasks: tasks.map((task) => ({ id: task.id, wbs: task.wbs, parent: task.parent, text: task.text, type: task.type })),
      links: links.map((link) => ({ source: link.source, target: link.target, relation: link.relation }))
    });
  })()`, context));
}

test('task, link, WBS, milestone and task names match commit 25e3c183', () => {
  const git = resolveGitExecutable();
  const baselineSource = execFileSync(git, [
    'show',
    '25e3c1833e7ee322a2027843987721206d67e830:apps-script-dev-api/35_GANTT_DATA_SERVICE.js'
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.deepEqual(buildFixtureProjection(currentSource), buildFixtureProjection(baselineSource));
});

test('Gantt Apps Script service does not declare duplicate named functions', () => {
  const names = Array.from(currentSource.matchAll(/^\s*function\s+([A-Za-z0-9_$]+)\s*\(/gm), (match) => match[1]);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  assert.deepEqual(duplicates, []);
});
