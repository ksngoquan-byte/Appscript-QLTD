import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script-dev-api/66_Weekly_Task_Update_Service.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const sheetRows = [];
const detailSyncCalls = [];
const masterApprovalSyncCalls = [];
const masterProgressWritebackCalls = [];
const budgetReportIds = new Set();
const budgetWriteCalls = [];
const aggregateCalls = [];
const rawBudgetRows = [];
let budgetItems = [];
let allocations = [];
let failBudgetItemCode = '';
let failAggregateBudgetItemCode = '';
const RAW_BUDGET_HEADERS = [
  'Report ID', 'Ma du an', 'Trang thai xac nhan', 'Sync status', 'Loai ban ghi',
  'Ma khoan ngan sach', 'Ma phan bo', 'Huong dong tien', 'Gia tri thuc hien ky nay',
  'Loai ky', 'Ma ky', 'Vuong mac/Ghi chu', 'Sync error'
];
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
  qltdBudgetReadBudgetItems_: () => ({ items: budgetItems, warnings: [] }),
  qltdBudgetReadAllocations_: () => ({ allocations, warnings: [] }),
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
  qltdBudgetGetReadonlySheet_: () => ({ getName: () => 'CENTRAL_NS_Raw' }),
  qltdBudgetGetSheetSchema_: () => ({ headerRow: 4 }),
  qltdBudgetBuildHeaderMap_: (headers) => headers.reduce((map, header, index) => { map[String(header).toLowerCase()] = index; return map; }, {}),
  qltdBudgetReadSheetAsObjects_: () => ({
    headers: RAW_BUDGET_HEADERS,
    headerMap: RAW_BUDGET_HEADERS.reduce((map, header, index) => { map[String(header).toLowerCase()] = index; return map; }, {}),
    rows: rawBudgetRows.map((raw, index) => ({ raw, rowNumber: index + 5 }))
  }),
  qltdBudgetGetCell_: (row, headerMap, header, fallback = '') => {
    const index = headerMap[String(header).toLowerCase()];
    return index === undefined ? fallback : row[index];
  },
  QLTD_BUDGET_SHEET: { CENTRAL_RAW: 'CENTRAL_NS_Raw' },
  QLTD_BUDGET_WRITE_CONFIRM_TOKEN: 'CONFIRM',
  QLTD_BUDGET_TYPE: { TASK_LINKED: 'TASK_LINKED', DEPT_STANDALONE: 'DEPT_STANDALONE' },
  qltdBudgetPrepareWrite_: (payload) => {
    if (payload.flowType !== 'CHI') return { error: { code: 'FLOW_TYPE_MISMATCH', message: 'Wrong flow.' } };
    if (payload.budgetType === 'TASK_LINKED') {
      if (payload.masterTaskCode !== 'D5-036') return { error: { code: 'TASK_LINKED_MASTER_MISMATCH', message: 'Wrong master.' } };
      if (payload.allocationCode !== 'ALLOC-TL') return { error: { code: 'ALLOCATION_CODE_MISMATCH', message: 'Wrong allocation.' } };
    } else {
      if (payload.allocationCode !== 'ALLOC-1') return { error: { code: 'ALLOCATION_CODE_MISMATCH', message: 'Wrong allocation.' } };
      if (payload.budgetType !== 'DEPT_STANDALONE') return { error: { code: 'BUDGET_TYPE_MISMATCH', message: 'Wrong budget type.' } };
    }
    const approvedBudget = payload.budgetType === 'TASK_LINKED' ? 12015541930 : payload.budgetItemCode === 'NS-2' ? 1000000 : 2000000;
    const allocationCode = payload.budgetType === 'TASK_LINKED' ? 'ALLOC-TL' : 'ALLOC-1';
    return { value: {
      requestId: payload.requestId,
      reportId: `REPORT-${payload.requestId}`,
      allocationContext: {
        item: { projectCode: 'P1', budgetItemCode: payload.budgetItemCode, allocationCode, flowType: 'CHI', approvedBudget, hasApprovedBudget: true },
        allocation: { projectCode: 'P1', allocationCode, flowType: 'CHI', allocatedAmount: payload.budgetType === 'TASK_LINKED' ? 12015541930 : 3000000 }
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
  qltdBudgetRefreshAggregateForWriteNoLock_: (prepared) => {
    aggregateCalls.push({
      budgetItemCode: prepared.weeklyBudgetMeta.budgetItemCode,
      reportId: prepared.reportId
    });
    if (prepared.weeklyBudgetMeta.budgetItemCode === failAggregateBudgetItemCode) {
      const error = new Error('Aggregate refresh failed.');
      error.code = 'AGGREGATE_REFRESH_FAILED';
      error.details = { budgetItemCode: prepared.weeklyBudgetMeta.budgetItemCode };
      throw error;
    }
    return { success: true, summaryRowsWritten: 1, dashboardRowsWritten: 7 };
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
vm.runInContext(`${source}\nthis.api = { headers: QLTD_WEEKLY_TASK_UPDATE_HEADERS, baseHeaders: QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS, buildKey: qltdWeeklyTaskUpdatesBuildKey_, buildItem: qltdWeeklyTaskUpdatesBuildItem_, sortItems: qltdWeeklyTaskUpdatesSortItems_, date: qltdWeeklyTaskUpdatesDate_, inspect: qltdWeeklyTaskUpdatesInspectSheet_, save: qltdWeeklyTaskUpdatesSave_, review: qltdWeeklyMasterApprovalReview_, resolveActualDate: qltdWeeklyTaskUpdatesResolveActualDateLifecycle_, mapPbDetailStatus: qltdWeeklyTaskUpdatesMapPbDetailStatus_, syncTask: qltdWeeklyTaskUpdatesSyncTask_, readBudgetActualIndex: qltdWeeklyTaskUpdatesReadBudgetActualIndex_, readBudgetContext: qltdWeeklyTaskUpdatesReadBudgetContext_ };`, context);
const { headers, baseHeaders, buildKey, buildItem, sortItems, date, inspect, save, review, resolveActualDate, mapPbDetailStatus, syncTask, readBudgetActualIndex, readBudgetContext } = context.api;
context.qltdWeeklyMasterApprovalApplyToMaster_ = (target, auth, dependencyDecision, recoveryPlan) => {
  masterApprovalSyncCalls.push({ target, auth, dependencyDecision, recoveryPlan });
  return {
    success: true,
    congViecUpdated: true,
    columnWUpdated: true,
    recalcTriggered: true,
    warnings: []
  };
};
context.qltdWeeklyMasterProgressWriteback_ = (update, auth, requestId) => {
  masterProgressWritebackCalls.push({ update, auth, requestId });
  return {
    success: true,
    applied: true,
    idempotent: true,
    duplicateNote: false,
    changes: []
  };
};

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
assert.equal(buildItem('PB_DETAIL', 'DT-START', { ...base, planStart: '2026-06-10', planFinish: '2026-07-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('PB_DETAIL', 'DT-FINISH', { ...base, planStart: '2026-06-01', planFinish: '2026-06-12' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('PB_DETAIL', 'DT-CROSS', { ...base, planStart: '2026-06-01', planFinish: '2026-07-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, planFinish: '2026-06-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'OVERDUE');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, actualStart: '2026-05-01' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'IN_PROGRESS');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, progress: 100, actualFinish: '2026-06-10' }, '2026-06-08', '2026-06-14', '').eligibleReason, 'COMPLETED_THIS_WEEK');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, status: 'Hoàn thành', progress: 0, actualFinish: '' }, '2026-07-06', '2026-07-12', '').eligible, false);
assert.equal(buildItem('MASTER', 'CV-1', { ...base, planFinish: '' }, '2026-07-06', '2026-07-12', '').eligibleReason, 'PLANNED');
assert.equal(buildItem('MASTER', 'CV-1', { ...base, planFinish: '', progress: 100 }, '2026-07-06', '2026-07-12', '').eligible, false);
assert.equal(buildItem('MASTER', 'CV-1', { wbs: '1', taskName: 'Không lịch', progress: 0 }, '2026-06-08', '2026-06-14', '').eligible, false);
assert.equal(buildItem('MASTER', 'CV-1', { wbs: '1', taskName: 'Không lịch', progress: 0 }, '2026-06-08', '2026-06-14', 'không lịch').eligibleReason, 'UNSCHEDULED');
assert.equal(buildItem('MASTER', 'CV-1', base, '2026-06-08', '2026-06-14', 'không khớp').eligible, false);
assert.equal(buildItem('PB_DETAIL', 'DT-COORD', { ...base, coordinatorText: 'user@example.com; other@example.com' }, '2026-06-08', '2026-06-14', '').coordinator, 'user@example.com; other@example.com');
assert.match(source, /capabilities:\s*\{/);
assert.match(source, /canUpdate:\s*qltdWorkCanWriteTask_/);
assert.match(source, /canReviewWeekly:\s*qltdWorkCanReviewWeekly_/);

const sorted = [
  { eligibleReason: 'PLANNED', planFinish: '2026-06-12', wbs: '2' },
  { eligibleReason: 'OVERDUE', planFinish: '2026-06-01', wbs: '1' },
  { eligibleReason: 'IN_PROGRESS', planFinish: '2026-06-20', wbs: '3' }
].sort(sortItems);
assert.deepEqual(sorted.map((item) => item.eligibleReason), ['OVERDUE', 'IN_PROGRESS', 'PLANNED']);

const sheet = { getRange: () => ({ getValues: () => [headers] }), getLastColumn: () => 17 };
assert.equal(inspect(sheet).headerMatches, false);
assert.equal(inspect(sheet).canAppendApprovalColumns, false);
const readySheet = { getRange: () => ({ getValues: () => [headers] }), getLastColumn: () => headers.length };
assert.equal(inspect(readySheet).headerMatches, true);
const oldSheet = { getRange: () => ({ getValues: () => [baseHeaders] }), getLastColumn: () => 17 };
assert.equal(inspect(oldSheet).canAppendApprovalColumns, true);
const legacyHeaders = headers.slice(0, 21);
const legacySheet = { getRange: () => ({ getValues: () => [legacyHeaders] }), getLastColumn: () => legacyHeaders.length };
assert.equal(inspect(legacySheet).canAppendApprovalColumns, true);
assert.deepEqual(Array.from(inspect(legacySheet).appendHeaders), ['DependencyDecision', 'RecoveryPlan']);
const badSheet = { getRange: () => ({ getValues: () => [[...headers.slice(0, headers.length - 1), 'Wrong']] }), getLastColumn: () => headers.length };
assert.equal(inspect(badSheet).headerMatches, false);

sheetRows.push(headers.slice());
const saveBase = { email: 'user@example.com', projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-2026-06-01', itemType: 'MASTER', itemId: 'CV-1', progressEnd: 30, taskStatus: 'Đang thực hiện', actualStart: '2026-06-01', thisWeekResult: 'Đã làm' };
const firstSave = save({ ...saveBase, requestId: 'weekly-progress-001' });
assert.equal(firstSave.inserted, true);
assert.equal(firstSave.masterWriteback.applied, true);
assert.equal(firstSave.ganttRefreshRequired, true);
assert.equal(masterProgressWritebackCalls.at(-1).requestId, 'weekly-progress-001');
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
assert.equal(combined.budget.results[0].aggregate.summaryRowsWritten, 1);
assert.equal(sheetRows.length, beforeCombinedRows + 1);
assert.equal(budgetWriteCalls.length, 1);
assert.equal(aggregateCalls.length, 1);

const retry = save(combinedBase);
assert.equal(retry.success, true);
assert.equal(retry.budget.savedCount, 0);
assert.equal(retry.budget.duplicateCount, 1);
assert.equal(budgetWriteCalls.length, 1);
assert.equal(aggregateCalls.length, 2);

budgetItems = [
  { status: 'ACTIVE', projectCode: 'P1', deptCode: 'PTDA', budgetType: 'TASK_LINKED', masterTaskCode: 'D5-036', budgetItemCode: 'TL-1', budgetItemName: 'Mong 1', approvedBudget: 12015541930, allocationCode: 'ALLOC-TL', flowType: 'CHI' },
  { status: 'ACTIVE', projectCode: 'P1', deptCode: 'PTDA', budgetType: 'TASK_LINKED', masterTaskCode: 'D5-036', budgetItemCode: 'TL-2', budgetItemName: 'Mong 2', approvedBudget: 1000000, allocationCode: 'ALLOC-TL', flowType: 'CHI' },
  { status: 'ACTIVE', projectCode: 'P1', deptCode: 'PTDA', budgetType: 'TASK_LINKED', masterTaskCode: 'OTHER', budgetItemCode: 'TL-OTHER', budgetItemName: 'Other', approvedBudget: 1000000, allocationCode: 'ALLOC-TL', flowType: 'CHI' },
  { status: 'ACTIVE', projectCode: 'P1', deptCode: 'PTDA', budgetType: 'DEPT_STANDALONE', masterTaskCode: '', budgetItemCode: 'NS-STANDALONE', budgetItemName: 'Standalone', approvedBudget: 2000000, allocationCode: 'ALLOC-1', flowType: 'CHI' }
];
allocations = [
  { allocationCode: 'ALLOC-TL', projectCode: 'P1', deptCode: 'PTDA', flowType: 'CHI', allocatedAmount: 12015541930, status: 'CONFIRMED' },
  { allocationCode: 'ALLOC-1', projectCode: 'P1', deptCode: 'PTDA', flowType: 'CHI', allocatedAmount: 3000000, status: 'CONFIRMED' }
];
rawBudgetRows.push(['RAW-TL', 'P1', 'daxacnhan', 'SYNCED', 'PERFORMANCE_ACTUAL', 'TL-1', 'ALLOC-TL', 'CHI', 1000000, 'WEEK', 'WEEK-2026-06-01', 'Chi mong', '']);
const budgetContext = readBudgetContext({ projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-2026-06-01' });
assert.equal(budgetContext.taskLinkedByMaster['D5-036'].length, 2);
assert.equal(budgetContext.taskLinkedByMaster['OTHER'].length, 1);
assert.equal(budgetContext.standaloneItems.length, 1);
assert.equal(budgetContext.taskLinkedByMaster['D5-036'][0].actualThisWeek, 1000000);
rawBudgetRows.length = 0;

const taskLinkedBudget = { budgetItemCode: 'TL-1', allocationCode: 'ALLOC-TL', budgetType: 'TASK_LINKED', flowType: 'CHI', projectCode: 'P1', deptCode: 'PTDA', periodType: 'WEEK', periodCode: 'WEEK-2026-06-01', actualAmount: 1000000, note: 'Chi mong', masterTaskCode: 'D5-036', pbTaskCode: '' };
const taskLinkedBase = { ...saveBase, itemId: 'D5-036', requestId: 'weekly-tasklinked-001', budgetUpdates: [taskLinkedBudget] };
const beforeTaskLinkedRows = sheetRows.length;
const taskLinked = save(taskLinkedBase);
assert.equal(taskLinked.success, true);
assert.equal(taskLinked.budget.savedCount, 1);
assert.equal(taskLinked.budget.results[0].metrics.cumulative, 1000000);
assert.equal(taskLinked.budget.results[0].metrics.remaining, 12014541930);
assert.equal(sheetRows.length, beforeTaskLinkedRows + 1);
const taskLinkedRetry = save(taskLinkedBase);
assert.equal(taskLinkedRetry.success, true);
assert.equal(taskLinkedRetry.budget.duplicateCount, 1);
assert.equal(budgetWriteCalls.filter((code) => code === 'TL-1').length, 1);
const wrongMaster = save({ ...saveBase, itemId: 'D5-036-WRONG', requestId: 'weekly-tasklinked-wrong-001', budgetUpdates: [{ ...taskLinkedBudget, masterTaskCode: 'OTHER' }] });
assert.equal(wrongMaster.success, false);
assert.equal(wrongMaster.code, 'TASK_LINKED_MASTER_MISMATCH');

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

failAggregateBudgetItemCode = 'NS-1';
const aggregatePartialRowCount = sheetRows.length;
const aggregatePartialWriteCount = budgetWriteCalls.length;
const aggregatePartial = save({ ...saveBase, itemId: 'CV-AGGREGATE-PARTIAL', requestId: 'weekly-aggregate-001', budgetUpdates: [standaloneBudget] });
assert.equal(aggregatePartial.success, false);
assert.equal(aggregatePartial.code, 'PARTIAL_WRITE');
assert.equal(aggregatePartial.stage, 'AGGREGATE');
assert.equal(aggregatePartial.budgetItemCode, 'NS-1');
assert.equal(aggregatePartial.budgetResults.length, 1);
assert.equal(budgetWriteCalls.length, aggregatePartialWriteCount + 1);
assert.equal(sheetRows.length, aggregatePartialRowCount);
failAggregateBudgetItemCode = '';

rawBudgetRows.push(
  ['RAW-MONTH', 'P1', 'daxacnhan', 'SYNCED', 'PERFORMANCE_ACTUAL', 'NS-1', 'ALLOC-1', 'CHI', 1200000, 'MONTH', '2026-06', 'Chi tháng', ''],
  ['RAW-WEEK', 'P1', 'daxacnhan', 'SYNCED', 'PERFORMANCE_ACTUAL', 'NS-1', 'ALLOC-1', 'CHI', 500000, 'WEEK', 'WEEK-2026-06-01', 'Chi tuần', '']
);
const weeklyActuals = readBudgetActualIndex({ projectCode: 'P1', weekCode: 'WEEK-2026-06-01' });
const weeklyActualKey = context.qltdWeeklyTaskUpdatesBudgetItemKey_('P1', 'NS-1', 'ALLOC-1', 'CHI');
assert.equal(weeklyActuals.byItem[weeklyActualKey], 500000);
assert.equal(weeklyActuals.byItemWeek[weeklyActualKey].amount, 500000);
rawBudgetRows.length = 0;

const beforePendingRows = sheetRows.length;
const beforePendingWritebacks = masterProgressWritebackCalls.length;
const pending = save({ ...saveBase, itemId: 'CV-100', progressEnd: 100, taskStatus: 'Hoàn thành', actualFinish: '2026-06-20' });
assert.equal(pending.update.approvalStatus, 'PENDING');
assert.equal(pending.taskSync.approvalRequired, true);
assert.equal(pending.masterWriteback.applied, false);
assert.equal(pending.masterWriteback.reason, 'APPROVAL_REQUIRED');
assert.equal(pending.ganttRefreshRequired, false);
assert.equal(masterProgressWritebackCalls.length, beforePendingWritebacks);
assert.equal(sheetRows.length, beforePendingRows + 1);
const missingDecision = review({ email: 'admin@example.com', updateId: pending.update.updateId, approvalStatus: 'APPROVED' });
assert.equal(missingDecision.code, 'DEPENDENCY_DECISION_REQUIRED');
const reviewResult = review({
  email: 'admin@example.com',
  updateId: pending.update.updateId,
  approvalStatus: 'APPROVED',
  dependencyDecision: 'KEEP_CURRENT',
  recoveryPlan: 'Bù tiến độ'
});
assert.equal(reviewResult.approval.approvalStatus, 'APPROVED');
assert.equal(reviewResult.masterAutoUpdated, true);
assert.equal(reviewResult.congViecUpdated, true);
assert.equal(reviewResult.columnWUpdated, true);
assert.equal(reviewResult.recalcTriggered, true);
assert.equal(masterApprovalSyncCalls.length, 1);
assert.equal(masterApprovalSyncCalls[0].dependencyDecision, 'KEEP_CURRENT');
assert.equal(masterApprovalSyncCalls[0].recoveryPlan, 'Bù tiến độ');

assert.match(source, /function qltdWeeklyMasterProgressWriteback_/);
assert.match(source, /if \(update\.actualStart\) changes\.push/);
assert.doesNotMatch(source.match(/function qltdWeeklyMasterProgressWriteback_[\s\S]*?function qltdWeeklyMasterApprovalApplyToMaster_/)[0], /planStart|planFinish|predecessor|baseline/);
assert.match(source, /ganttRefreshRequired:\s*!!\(sync\.masterWriteback && sync\.masterWriteback\.applied\)/);
assert.match(appSource, /requestId:\s*getWeeklySaveRequestId\(\)/);
assert.match(appSource, /\['TASK_SYNC_PARTIAL', 'MASTER_WRITEBACK_PARTIAL'\]\.includes\(warning\?\.code\)/);
assert.match(appSource, /if \(data\.ganttRefreshRequired && projectCode\) await loadGanttDataForSelectedProject\(projectCode\)/);

console.log('weekly-task-updates tests: PASS');
