import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script-dev-api/66_Weekly_Task_Update_Service.js', import.meta.url), 'utf8');
const sheetRows = [];
const mockSheet = {
  getLastColumn: () => sheetRows[0]?.length || 0,
  getLastRow: () => sheetRows.length,
  getRange: (row, column, rowCount, columnCount) => ({
    getValues: () => Array.from({ length: rowCount }, (_, rowOffset) => Array.from({ length: columnCount }, (_, columnOffset) => sheetRows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? '')),
    setValues: (values) => { values.forEach((sourceRow, rowOffset) => { const target = sheetRows[row - 1 + rowOffset] || []; sourceRow.forEach((value, columnOffset) => { target[column - 1 + columnOffset] = value; }); sheetRows[row - 1 + rowOffset] = target; }); return mockSheet.getRange(row, column, rowCount, columnCount); },
    setFontWeight: () => mockSheet.getRange(row, column, rowCount, columnCount)
  }),
  setFrozenRows: () => {}
};
const context = {
  qltdWorkNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkNormalizeWeekCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdBudgetFormatDate_: (value) => String(value || '').slice(0, 10),
  qltdBudgetToNumber_: (value) => Number(value || 0),
  qltdWeeklyCellText_: (value) => String(value || ''),
  getCurrentSpreadsheet_: () => ({ getSheetByName: () => mockSheet }),
  qltdWorkAuthUser_: () => ({ email: 'user@example.com', user: { role: 'ADMIN' } }),
  qltdWorkResolveProjectDept_: () => ({ projectCode: 'P1', deptCode: 'PTDA', project: { projectCode: 'P1' }, dept: { deptCode: 'PTDA' }, requestedDeptCode: 'PTDA', warnings: [] }),
  qltdWorkCanReadDept_: () => true,
  qltdWorkNowIso_: () => '2026-06-20T00:00:00.000Z',
  qltdWorkOk_: (_source, _action, data, warnings) => ({ success: true, ...data, warnings }),
  qltdWorkError_: (_source, _action, code, message, _meta, _warnings, extra = {}) => ({ success: false, code, message, ...extra }),
  qltdWorkWarning_: (code, message) => ({ code, message }),
  qltdBudgetSafeErrorMessage_: (error) => error.message,
  qltdWorkBuildDeptContext_: () => ({}),
  qltdWorkReadTaskTarget_: () => ({ error: true }),
  qltdPbDetailBuildSheetContext_: () => ({ error: true }),
  qltdWorkUpdateTask_: () => ({ success: true }),
  qltdWorkUpdateDetailTask_: () => ({ success: true }),
  QLTD_WORK_WRITE_LOCK_TIMEOUT_MS: 1000,
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Utilities: { getUuid: (() => { let id = 0; return () => `UUID-${++id}`; })() },
  Logger: { log: () => {} },
  console
};
vm.createContext(context);
vm.runInContext(`${source}\nthis.api = { buildKey: qltdWeeklyTaskUpdatesBuildKey_, buildItem: qltdWeeklyTaskUpdatesBuildItem_, sortItems: qltdWeeklyTaskUpdatesSortItems_, date: qltdWeeklyTaskUpdatesDate_, inspect: qltdWeeklyTaskUpdatesInspectSheet_, save: qltdWeeklyTaskUpdatesSave_ };`, context);
const { buildKey, buildItem, sortItems, date, inspect, save } = context.api;

assert.equal(buildKey('p1', 'ptda', 'week-2026-06-01', 'master', 'CV-1'), 'P1|PTDA|WEEK-2026-06-01|MASTER|CV-1');
assert.equal(date('2026-06-01'), '2026-06-01');
assert.equal(date('2026-02-30'), null);

const base = { wbs: '1.1', taskName: 'Công việc', planStart: '2026-06-01', planFinish: '2026-06-30', progress: 20 };
assert.equal(buildItem('MASTER', 'CV-1', base, '2026-06-08', '2026-06-14', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, planFinish: '2026-06-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'OVERDUE');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, actualStart: '2026-05-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'IN_PROGRESS');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, progress: 100, actualFinish: '2026-06-10' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'COMPLETED_THIS_WEEK');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, planFinish: '' }, '2026-07-06', '2026-07-12', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, planFinish: '', progress: 100 }, '2026-07-06', '2026-07-12', '').eligible, false);
assert.equal(buildItem('MASTER', 'CV-1', { wbs: '1', taskName: 'Không lịch', progress: 0 }, '2026-06-08', '2026-06-14', '').eligible, false);
assert.equal(buildItem('MASTER', 'CV-1', { wbs: '1', taskName: 'Không lịch', progress: 0 }, '2026-06-08', '2026-06-14', 'không lịch').eligibleReason, 'UNSCHEDULED');
assert.equal(buildItem('MASTER', 'CV-1', base, '2026-06-08', '2026-06-14', 'không khớp').eligible, false);

const sorted = [
  { eligibleReason: 'PLANNED', planFinish: '2026-06-12', wbs: '2' },
  { eligibleReason: 'OVERDUE', planFinish: '2026-06-01', wbs: '1' },
  { eligibleReason: 'IN_PROGRESS', planFinish: '2026-06-20', wbs: '3' }
].sort(sortItems);
assert.deepEqual(sorted.map((item) => item.eligibleReason), ['OVERDUE', 'IN_PROGRESS', 'PLANNED']);

const headers = ['UpdateId', 'ProjectCode', 'DeptCode', 'WeekCode', 'ItemType', 'ItemId', 'ThisWeekResult', 'ProgressEnd', 'TaskStatus', 'ActualStart', 'ActualFinish', 'Issue', 'Recommendation', 'BudgetThisWeek', 'BudgetNote', 'UpdatedBy', 'UpdatedAt'];
const sheet = { getRange: () => ({ getValues: () => [headers] }), getLastColumn: () => 17 };
assert.equal(inspect(sheet).headerMatches, true);
const badSheet = { getRange: () => ({ getValues: () => [[...headers.slice(0, 16), 'Wrong']] }), getLastColumn: () => 17 };
assert.equal(inspect(badSheet).headerMatches, false);

sheetRows.push(headers.slice());
const saveBase = { email: 'user@example.com', projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-2026-06-01', itemType: 'MASTER', itemId: 'CV-1', progressEnd: 30, taskStatus: 'Đang thực hiện', thisWeekResult: 'Đã làm' };
assert.equal(save(saveBase).inserted, true);
assert.equal(sheetRows.length, 2);
assert.equal(save({ ...saveBase, progressEnd: 55 }).duplicatePrevented, true);
assert.equal(sheetRows.length, 2);
assert.equal(save({ ...saveBase, itemId: 'CV-2' }).inserted, true);
assert.equal(sheetRows.length, 3);
assert.equal(save({ ...saveBase, weekCode: 'WEEK-2026-06-08' }).inserted, true);
assert.equal(sheetRows.length, 4);

console.log('weekly-task-updates tests: PASS');
