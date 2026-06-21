import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script-dev-api/66_Weekly_Task_Update_Service.js', import.meta.url), 'utf8');
const sheetRows = [];
const detailSyncCalls = [];
const budgetReportIds = new Set();
const budgetWriteCalls = [];
let failBudgetItemCode = '';
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
  qltdGanttGetDataForProject_: () => ({ success: true, data: [] }),
  qltdBudgetReadBudgetItems_: () => ({ items: [], warnings: [] }),
  qltdWorkIsAdminScope_: () => true,
  qltdBudgetNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdBudgetNormalizeKey_: (value) => String(value || '').trim().toLowerCase(),
  qltdBudgetNormalizeAmount_: (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return { error: { code: 'AMOUNT_INVALID', message: 'Amount is invalid.' } };
    if (amount < 0) return { error: { code: 'AMOUNT_NEGATIVE', message: 'Amount must not be negative.' } };
    return { value: amount, error: null };
  },
  qltdBudgetNormalizePeriodType_: (value) => ({ value: String(value || '').trim().toUpperCase(), error: null }),
  qltdBudgetGetReadonlySheet_: () => null,
  QLTD_BUDGET_SHEET: { CENTRAL_RAW: 'CENTRAL_NS_Raw' },
  QLTD_BUDGET_WRITE_CONFIRM_TOKEN: 'CONFIRM',
  QLTD_BUDGET_TYPE: { TASK_LINKED: 'TASK_LINKED', DEPT_STANDALONE: 'DEPT_STANDALONE' },
  qltdBudgetPrepareWrite_: (payload) => {
    if (payload.allocationCode !== 'ALLOC-1') return { error: { code: 'ALLOCATION_CODE_MISMATCH', message: 'Wrong allocation.' } };
    if (payload.flowType !== 'CHI') return { error: { code: 'FLOW_TYPE_MISMATCH', message: 'Wrong flow.' } };
    if (payload.budgetType !== 'DEPT_STANDALONE') return { error: { code: 'BUDGET_TYPE_MISMATCH', message: 'Wrong budget type.' } };
    const approvedBudget = payload.budgetItemCode === 'NS-2' ? 1000000 : 2000000;
    return { value: {
      requestId: payload.requestId,
      reportId: `REPORT-${payload.requestId}`,
      allocationContext: {
        item: { projectCode: 'P1', budgetItemCode: payload.budgetItemCode, allocationCode: 'ALLOC-1', flowType: 'CHI', approvedBudget, hasApprovedBudget: true },
        allocation: { projectCode: 'P1', allocationCode: 'ALLOC-1', flowType: 'CHI', allocatedAmount: 3000000 }
      }
    } };
  },
  qltdBudgetExecutePreparedWriteNoLock_: (prepared) => {
    if (prepared.weeklyBudgetMeta.budgetItemCode === failBudgetItemCode) return { success: false, code: 'RAW_APPEND_FAILED', message: 'Raw append failed.' };
    const duplicate = budgetReportIds.has(prepared.reportId);
    if (!duplicate) {
      budgetReportIds.add(prepared.reportId);
      budgetWriteCalls.push(prepared.weeklyBudgetMeta.budgetItemCode);
    }
    return { success: true, data: { duplicate, syncStatus: 'SYNCED', centralRawRowNumber: budgetWriteCalls.length + 1 } };
  },
  qltdWorkUpdateTask_: () => ({ success: true }),
  qltdWorkUpdateDetailTask_: (payload) => { detailSyncCalls.push(payload); return { success: true }; },
  QLTD_WORK_WRITE_LOCK_TIMEOUT_MS: 1000,
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Utilities: { getUuid: (() => { let id = 0; return () => `UUID-${++id}`; })() },
  Logger: { log: () => {} },
  console
};
vm.createContext(context);
vm.runInContext(`${source}\nthis.api = { headers: QLTD_WEEKLY_TASK_UPDATE_HEADERS, baseHeaders: QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS, buildKey: qltdWeeklyTaskUpdatesBuildKey_, buildItem: qltdWeeklyTaskUpdatesBuildItem_, sortItems: qltdWeeklyTaskUpdatesSortItems_, date: qltdWeeklyTaskUpdatesDate_, inspect: qltdWeeklyTaskUpdatesInspectSheet_, save: qltdWeeklyTaskUpdatesSave_, review: qltdWeeklyMasterApprovalReview_, resolveActualDate: qltdWeeklyTaskUpdatesResolveActualDateLifecycle_, mapPbDetailStatus: qltdWeeklyTaskUpdatesMapPbDetailStatus_, syncTask: qltdWeeklyTaskUpdatesSyncTask_ };`, context);
const { headers, baseHeaders, buildKey, buildItem, sortItems, date, inspect, save, review, resolveActualDate, mapPbDetailStatus, syncTask } = context.api;

assert.equal(buildKey('p1', 'ptda', 'week-2026-06-01', 'master', 'CV-1'), 'P1|PTDA|WEEK-2026-06-01|MASTER|CV-1');
assert.equal(date('2026-06-01'), '2026-06-01');
assert.equal(date('2026-02-30'), null);

const lifecycleScope = { meta: {}, warnings: [] };
const lifecycleValidation = { progressEnd: 60, taskStatus: 'Đang thực hiện', actualStart: '', actualFinish: '' };
assert.equal(resolveActualDate({}, lifecycleValidation, { actualStart: '2026-06-01', actualFinish: '' }, lifecycleScope).error, null);
assert.equal(lifecycleValidation.actualStart, '2026-06-01');
assert.equal(lifecycleValidation.actualStartShouldWrite, false);
const lifecycleExistingFinish = { progressEnd: 60, taskStatus: 'Đang thực hiện', actualStart: '', actualFinish: '' };
assert.equal(resolveActualDate({}, lifecycleExistingFinish, { actualStart: '2026-06-01', actualFinish: '2026-06-20' }, lifecycleScope).error, null);
assert.equal(lifecycleExistingFinish.actualFinish, '2026-06-20');
assert.equal(lifecycleExistingFinish.actualFinishShouldWrite, false);
const lifecycleMissingStart = { progressEnd: 50, taskStatus: 'Đang thực hiện', actualStart: '', actualFinish: '' };
assert.equal(resolveActualDate({}, lifecycleMissingStart, {}, lifecycleScope).error.code, 'ACTUAL_START_REQUIRED');
const lifecycleMissingFinish = { progressEnd: 100, taskStatus: 'Hoàn thành', actualStart: '2026-06-01', actualFinish: '' };
assert.equal(resolveActualDate({}, lifecycleMissingFinish, {}, lifecycleScope).error.code, 'ACTUAL_FINISH_REQUIRED');
const lifecycleFinish = { progressEnd: 100, taskStatus: 'Hoàn thành', actualStart: '2026-06-01', actualFinish: '2026-06-20' };
assert.equal(resolveActualDate({}, lifecycleFinish, {}, lifecycleScope).error, null);
assert.equal(lifecycleFinish.actualFinishShouldWrite, true);

assert.equal(mapPbDetailStatus('Đang thực hiện'), 'Đang làm');
assert.equal(mapPbDetailStatus('Đang làm'), 'Đang làm');
assert.equal(mapPbDetailStatus('Tạm dừng'), 'Tạm dừng');
const pbSyncValidation = { itemType: 'PB_DETAIL', itemId: 'DT-1', progressEnd: 1, taskStatus: 'Đang thực hiện', actualStart: '2026-06-21', actualFinish: '', actualStartShouldWrite: true, actualFinishShouldWrite: false };
const pbSyncScope = { projectCode: 'P1', deptCode: 'PTDA', meta: {}, warnings: [] };
assert.equal(syncTask({}, pbSyncValidation, pbSyncScope, { email: 'user@example.com' }).result.success, true);
assert.equal(detailSyncCalls.at(-1).status, 'Đang làm');
assert.equal(detailSyncCalls.at(-1).progress, 1);
assert.equal(detailSyncCalls.at(-1).actualStart, '2026-06-21');
context.qltdWorkUpdateDetailTask_ = () => { throw new Error('validation rejected'); };
const partialSync = syncTask({}, pbSyncValidation, pbSyncScope, { email: 'user@example.com' });
assert.equal(partialSync.result.success, false);
assert.equal(partialSync.result.code, 'PB_DETAIL_SYNC_EXCEPTION');
assert.equal(partialSync.warning.code, 'TASK_SYNC_PARTIAL');
context.qltdWorkUpdateDetailTask_ = (payload) => { detailSyncCalls.push(payload); return { success: true }; };

const base = { wbs: '1.1', taskName: 'Công việc', planStart: '2026-06-01', planFinish: '2026-06-30', progress: 20 };
assert.equal(buildItem('MASTER', 'CV-1', base, '2026-06-08', '2026-06-14', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, planFinish: '2026-06-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'OVERDUE');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, actualStart: '2026-05-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'IN_PROGRESS');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, progress: 100, actualFinish: '2026-06-10' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'COMPLETED_THIS_WEEK');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, status: 'Hoàn thành', progress: 0, actualFinish: '' }, '2026-07-06', '2026-07-12', '').eligible, false);
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

const sheet = { getRange: () => ({ getValues: () => [headers] }), getLastColumn: () => 17 };
assert.equal(inspect(sheet).headerMatches, false);
assert.equal(inspect(sheet).canAppendApprovalColumns, false);
const readySheet = { getRange: () => ({ getValues: () => [headers] }), getLastColumn: () => 21 };
assert.equal(inspect(readySheet).headerMatches, true);
const oldSheet = { getRange: () => ({ getValues: () => [baseHeaders] }), getLastColumn: () => 17 };
assert.equal(inspect(oldSheet).canAppendApprovalColumns, true);
const badSheet = { getRange: () => ({ getValues: () => [[...headers.slice(0, 20), 'Wrong']] }), getLastColumn: () => 21 };
assert.equal(inspect(badSheet).headerMatches, false);

sheetRows.push(headers.slice());
const saveBase = { email: 'user@example.com', projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-2026-06-01', itemType: 'MASTER', itemId: 'CV-1', progressEnd: 30, taskStatus: 'Đang thực hiện', actualStart: '2026-06-01', thisWeekResult: 'Đã làm' };
assert.equal(save(saveBase).inserted, true);
assert.equal(sheetRows.length, 2);
assert.equal(save({ ...saveBase, progressEnd: 55 }).duplicatePrevented, true);
assert.equal(sheetRows.length, 2);
assert.equal(save({ ...saveBase, itemId: 'CV-2' }).inserted, true);
assert.equal(sheetRows.length, 3);
assert.equal(save({ ...saveBase, weekCode: 'WEEK-2026-06-08' }).inserted, true);
assert.equal(sheetRows.length, 4);

const standaloneBudget = { budgetItemCode: 'NS-1', allocationCode: 'ALLOC-1', budgetType: 'DEPT_STANDALONE', flowType: 'CHI', projectCode: 'P1', deptCode: 'PTDA', periodType: 'WEEK', periodCode: 'WEEK-2026-06-01', actualAmount: 500000, note: 'Chi tuần', masterTaskCode: '', pbTaskCode: '' };
const combinedBase = { ...saveBase, itemId: 'CV-BUDGET', requestId: 'weekly-request-001', budgetUpdates: [standaloneBudget] };
const beforeCombinedRows = sheetRows.length;
const combined = save(combinedBase);
assert.equal(combined.success, true);
assert.equal(combined.task.saved, true);
assert.equal(combined.budget.savedCount, 1);
assert.equal(combined.budget.results[0].metrics.cumulative, 500000);
assert.equal(sheetRows.length, beforeCombinedRows + 1);
assert.equal(budgetWriteCalls.length, 1);

const retry = save(combinedBase);
assert.equal(retry.success, true);
assert.equal(retry.budget.savedCount, 0);
assert.equal(retry.budget.duplicateCount, 1);
assert.equal(budgetWriteCalls.length, 1);

for (const [change, code] of [
  [{ allocationCode: 'WRONG' }, 'ALLOCATION_CODE_MISMATCH'],
  [{ deptCode: 'OTHER' }, 'ALLOCATION_DEPT_MISMATCH'],
  [{ flowType: 'THU' }, 'FLOW_TYPE_MISMATCH'],
  [{ actualAmount: 2000001 }, 'BUDGET_ITEM_LIMIT_EXCEEDED'],
  [{ actualAmount: -1 }, 'AMOUNT_NEGATIVE']
]) {
  const rowCount = sheetRows.length;
  const writeCount = budgetWriteCalls.length;
  const invalid = save({ ...saveBase, itemId: `CV-${code}`, requestId: `weekly-${code}-001`, budgetUpdates: [{ ...standaloneBudget, ...change }] });
  assert.equal(invalid.success, false);
  assert.equal(invalid.code, code);
  assert.equal(sheetRows.length, rowCount);
  assert.equal(budgetWriteCalls.length, writeCount);
}

failBudgetItemCode = 'NS-2';
const partialRowCount = sheetRows.length;
const partial = save({ ...saveBase, itemId: 'CV-PARTIAL', requestId: 'weekly-partial-001', budgetUpdates: [standaloneBudget, { ...standaloneBudget, budgetItemCode: 'NS-2', actualAmount: 250000 }] });
assert.equal(partial.success, false);
assert.equal(partial.code, 'PARTIAL_WRITE');
assert.equal(partial.stage, 'BUDGET_WRITE');
assert.equal(partial.budgetResults.length, 1);
assert.equal(sheetRows.length, partialRowCount);
failBudgetItemCode = '';

const beforePendingRows = sheetRows.length;
const pending = save({ ...saveBase, itemId: 'CV-100', progressEnd: 100, taskStatus: 'Hoàn thành', actualFinish: '2026-06-20' });
assert.equal(pending.update.approvalStatus, 'PENDING');
assert.equal(pending.taskSync.approvalRequired, true);
assert.equal(sheetRows.length, beforePendingRows + 1);
const reviewResult = review({ email: 'admin@example.com', updateId: pending.update.updateId, approvalStatus: 'APPROVED' });
assert.equal(reviewResult.approval.approvalStatus, 'APPROVED');
assert.equal(reviewResult.masterAutoUpdated, false);

console.log('weekly-task-updates tests: PASS');
