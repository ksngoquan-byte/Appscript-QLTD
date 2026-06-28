import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pb = fs.readFileSync(new URL('./pb-detail-ui.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function latestFunction(name, nextName) {
  const start = app.lastIndexOf(`function ${name}`);
  const end = app.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `Không tìm thấy hàm ${name}`);
  return app.slice(start, end);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `Không tìm thấy hàm ${name}`);
  const bodyStart = source.indexOf('{', start);
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the function declaration is complete.
    }
  }
  throw new Error(`Hàm ${name} chưa đóng`);
}

const selectedPlan = latestFunction('renderSelectedDeptPlan()', 'renderDeptPlanTab');
assert.match(selectedPlan, /KẾ HOẠCH PHÒNG\/BAN/);
assert.match(selectedPlan, /CẬP NHẬT TUẦN/);
assert.doesNotMatch(selectedPlan, /KPI|getMonthWeekPeriods|renderWeekPeriodsHtml/);

const planTab = latestFunction('renderDeptPlanTab', 'renderMasterDetailCount');
assert.match(planTab, /Bắt đầu KH/);
assert.match(planTab, /Kết thúc KH/);
assert.match(planTab, /Việc chi tiết/);
assert.match(planTab, /data-detail-popup/);
assert.match(planTab, /formatIsoDateVi\(master\.planStart/);
assert.match(planTab, /formatIsoDateVi\(master\.planFinish/);
assert.match(planTab, /Hiển thị \$\{masterList\.visible\.length\}\/\$\{masterList\.total\} mục tiêu/);
assert.match(planTab, /data-dept-master-list-toggle/);
assert.match(planTab, /masterList\.total > 5/);
assert.match(planTab, /dept-overdue-badge/);

const masterListContext = {
  normalizeSearchText: (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
};
vm.createContext(masterListContext);
vm.runInContext([
  extractFunction(app, 'getDeptObjectiveProgress'),
  extractFunction(app, 'getDeptObjectiveStatusClass'),
  extractFunction(app, 'qltdDeptPlanParseIsoDate'),
  extractFunction(app, 'qltdDeptPlanIsOverdue'),
  extractFunction(app, 'qltdDeptPlanSortForDisplay'),
  extractFunction(app, 'qltdDeptPlanBuildListView')
].join('\n'), masterListContext);
const masterItems = [
  { id: 'normal-1', planFinish: '2026-07-01', progress: 20, status: 'Đang thực hiện' },
  { id: 'overdue-recent', planFinish: '2026-06-20', progress: 20, status: 'Đang thực hiện' },
  { id: 'completed-old', planFinish: '2026-01-01', progress: 20, status: 'Hoàn thành' },
  { id: 'overdue-old', planFinish: '2026-01-01', progress: 20, status: 'Đang thực hiện' },
  { id: 'invalid-date', planFinish: '2026-02-30', progress: 20, status: 'Đang thực hiện' },
  { id: 'progress-100', planFinish: '2026-01-01', progress: 100, status: 'Đang thực hiện' },
  { id: 'normal-2', planFinish: '', progress: 0, status: 'Chưa bắt đầu' }
];
const originalMasterOrder = masterItems.map((item) => item.id);
const collapsedMasters = masterListContext.qltdDeptPlanBuildListView(masterItems, false, '2026-06-28');
assert.equal(collapsedMasters.visible.length, 5);
assert.equal(collapsedMasters.total, 7);
assert.equal(collapsedMasters.remaining, 2);
assert.deepEqual(Array.from(collapsedMasters.visible, (item) => item.id), ['overdue-old', 'overdue-recent', 'normal-1', 'completed-old', 'invalid-date']);
assert.deepEqual(masterItems.map((item) => item.id), originalMasterOrder);
const expandedMasters = masterListContext.qltdDeptPlanBuildListView(masterItems, true, '2026-06-28');
assert.equal(expandedMasters.visible.length, 7);
assert.equal(expandedMasters.remaining, 0);
assert.equal(masterListContext.qltdDeptPlanBuildListView(masterItems.slice(0, 5), false, '2026-06-28').total, 5);

const masterToggle = {};
const masterToggleContext = {
  document: {
    querySelectorAll: () => [],
    getElementById: () => null,
    querySelector: () => masterToggle
  },
  qltdReportSubTab: 'plan',
  qltdDeptMasterListExpanded: false,
  renderSelectedDeptPlan: () => { masterToggleContext.renderCount += 1; },
  dispatchDeptPlanRendered: () => {},
  renderCount: 0
};
vm.createContext(masterToggleContext);
vm.runInContext(extractFunction(app, 'bindReportSubTabControls'), masterToggleContext);
masterToggleContext.bindReportSubTabControls({}, {}, {}, {});
masterToggle.onclick();
assert.equal(masterToggleContext.qltdDeptMasterListExpanded, true);
masterToggle.onclick();
assert.equal(masterToggleContext.qltdDeptMasterListExpanded, false);
assert.equal(masterToggleContext.renderCount, 2);

const weeklyPanel = latestFunction('renderWeeklyTaskUpdatePanel', 'renderWeeklyTaskList');
assert.match(weeklyPanel, /single-week-toolbar/);
assert.match(weeklyPanel, /Thứ Hai – Chủ nhật/);
assert.match(weeklyPanel, /selected && canUpdate \? renderWeeklySelectedForm/);
assert.match(weeklyPanel, /renderStandaloneBudgetWeeklyBlock/);
assert.match(weeklyPanel, /weekly-split-view/);
assert.match(weeklyPanel, /data-weekly-workspace-tab="objectives"/);
assert.match(weeklyPanel, /data-weekly-workspace-tab="tasks"/);
assert.match(weeklyPanel, /weeklyWeekPicker/);
assert.match(weeklyPanel, /weekly-summary-grid/);
assert.match(weeklyPanel, /weekly-loading-state/);
assert.match(weeklyPanel, /data-weekly-retry/);
assert.match(weeklyPanel, /state\.capabilities\?\.canUpdate/);
assert.doesNotMatch(weeklyPanel, /renderWeekPeriodsHtml|renderWeeklyNextItems/);
assert.match(weeklyPanel, /findWeeklySavedUpdate/);
assert.match(weeklyPanel, /updateContext/);
assert.match(weeklyPanel, /weeklyExcelButton/);
assert.ok(weeklyPanel.includes('Xuất Excel'));
assert.ok(weeklyPanel.indexOf('renderWeeklySelectedForm') < weeklyPanel.indexOf('renderStandaloneBudgetWeeklyBlock'));
assert.ok(weeklyPanel.indexOf('renderStandaloneBudgetWeeklyBlock') < weeklyPanel.indexOf('renderWeeklySaveActions'));
assert.ok(weeklyPanel.indexOf('renderWeeklySaveActions') < weeklyPanel.indexOf('renderWeeklySavedUpdates'));
assert.equal((weeklyPanel.match(/renderWeeklySaveActions/g) || []).length, 1);

const weeklyStateSource = app.slice(app.indexOf('function normalizeWeeklyUpdateMatchValue'), app.indexOf('function renderWeeklyTaskUpdatePanel('));
const weeklyStateContext = {};
vm.createContext(weeklyStateContext);
vm.runInContext(`${weeklyStateSource}\nthis.findSaved = findWeeklySavedUpdate; this.effective = getWeeklyEffectiveTaskState;`, weeklyStateContext);
const weeklyItem = { itemType: 'PB_DETAIL', itemId: 'DT-1', progress: 0, status: 'Chưa bắt đầu', actualStart: '', actualFinish: '' };
const weeklySaved = { projectCode: 'P1', deptCode: 'KEHOACH', weekCode: 'WEEK-1', itemType: 'PB_DETAIL', itemId: 'DT-1', progressEnd: 1, taskStatus: 'Đang thực hiện', actualStart: '2026-06-21', actualFinish: '' };
assert.equal(weeklyStateContext.findSaved([weeklySaved], weeklyItem, { projectCode: 'p1', deptCode: 'kehoach', weekCode: 'week-1' }), weeklySaved);
assert.equal(weeklyStateContext.findSaved([weeklySaved], weeklyItem, { projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-1' }), null);
assert.deepEqual({ ...weeklyStateContext.effective(weeklyItem, weeklySaved) }, { progress: 1, status: 'Đang thực hiện', actualStart: '2026-06-21', actualFinish: '' });

const weekContext = { pad2: (value) => String(value).padStart(2, '0'), qltdSelectedWeekId: 'WEEK-2026-06-29', qltdSelectedWeeklyItemKey: 'PB_DETAIL:DT-1', qltdWeeklyForcedItem: {} };
vm.createContext(weekContext);
vm.runInContext([
  extractFunction(app, 'qltdWeekPeriodFromId'),
  extractFunction(app, 'qltdGetSelectedWeekPeriod'),
  extractFunction(app, 'qltdShiftSelectedWeek'),
  extractFunction(app, 'qltdWeekPeriodFromDateValue'),
  extractFunction(app, 'qltdWeeklyGetIsoWeekInfo')
].join('\n'), weekContext);
weekContext.qltdShiftSelectedWeek(-7);
assert.equal(weekContext.qltdSelectedWeekId, 'WEEK-2026-06-22');
weekContext.qltdShiftSelectedWeek(7);
assert.equal(weekContext.qltdSelectedWeekId, 'WEEK-2026-06-29');
assert.deepEqual({ ...weekContext.qltdWeekPeriodFromDateValue('2026-07-01') }, { weekId: 'WEEK-2026-06-29', weekStart: '2026-06-29', weekEnd: '2026-07-05' });
assert.deepEqual({ ...weekContext.qltdWeekPeriodFromDateValue('2027-01-01') }, { weekId: 'WEEK-2026-12-28', weekStart: '2026-12-28', weekEnd: '2027-01-03' });
assert.deepEqual({ ...weekContext.qltdWeeklyGetIsoWeekInfo({ weekStart: '2026-06-29' }) }, { weekNo: 27, year: 2026 });

const weeklyModelContext = { normalizeSearchText: (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd') };
vm.createContext(weeklyModelContext);
vm.runInContext([
  extractFunction(app, 'normalizeWeeklyUpdateMatchValue'),
  extractFunction(app, 'findWeeklySavedUpdate'),
  extractFunction(app, 'getWeeklyEffectiveTaskState'),
  extractFunction(app, 'normalizeWeeklyStatusKey'),
  extractFunction(app, 'isWeeklyCompletionValue'),
  extractFunction(app, 'qltdWeeklyPersonHasEmail'),
  extractFunction(app, 'qltdWeeklyIsOverdue'),
  extractFunction(app, 'qltdWeeklyIsDue'),
  extractFunction(app, 'qltdWeeklyTaskMatchesStatus'),
  extractFunction(app, 'qltdWeeklySortWorkItems'),
  extractFunction(app, 'qltdWeeklyFilterWorkItems'),
  extractFunction(app, 'qltdWeeklyBuildWorkspaceModel'),
  extractFunction(app, 'qltdWeeklyGetOverdueMetric')
].join('\n'), weeklyModelContext);
const modelContext = { projectCode: 'P1', deptCode: 'D1', weekCode: 'WEEK-2026-06-08' };
const modelWeek = { weekStart: '2026-06-08', weekEnd: '2026-06-14' };
const modelItems = [
  { itemType: 'MASTER', itemId: 'M1', taskName: 'Mục tiêu', planStart: '2026-06-01', planFinish: '2026-06-30', progress: 20 },
  { itemType: 'MASTER', itemId: 'M-OVERDUE', taskName: 'Mục tiêu quá hạn', planStart: '2026-05-01', planFinish: '2026-06-01', progress: 50 },
  { itemType: 'MASTER', itemId: 'M-COMPLETED', taskName: 'Mục tiêu hoàn thành', planStart: '2026-05-01', planFinish: '2026-06-01', progress: 100, status: 'Hoàn thành' },
  { itemType: 'PB_DETAIL', itemId: 'REJECTED', taskName: 'Bị trả lại', planFinish: '2026-07-01', progress: 20, owner: 'a@example.com', coordinator: 'user@example.com' },
  { itemType: 'PB_DETAIL', itemId: 'OVERDUE', taskName: 'Quá hạn', planFinish: '2026-06-01', progress: 20, owner: 'user@example.com', coordinator: '' },
  { itemType: 'PB_DETAIL', itemId: 'MISSING', taskName: 'Chưa cập nhật', planFinish: '2026-07-01', progress: 20, owner: 'user@example.com', coordinator: '' },
  { itemType: 'PB_DETAIL', itemId: 'DUE', taskName: 'Đến hạn', planFinish: '2026-06-12', progress: 20, owner: 'a@example.com', coordinator: 'user@example.com' },
  { itemType: 'PB_DETAIL', itemId: 'PENDING', taskName: 'Chờ duyệt', planFinish: '2026-07-01', progress: 20, owner: 'a@example.com', coordinator: '' },
  { itemType: 'PB_DETAIL', itemId: 'APPROVED', taskName: 'Đã duyệt', planFinish: '2026-07-01', progress: 20, owner: 'a@example.com', coordinator: '' },
  { itemType: 'PB_DETAIL', itemId: 'COMPLETED', taskName: 'Hoàn thành', planFinish: '2026-06-01', progress: 100, status: 'Hoàn thành', owner: 'a@example.com', coordinator: '' }
];
const modelUpdates = [
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'REJECTED', progressEnd: 20, taskStatus: 'Đang thực hiện', approvalStatus: 'REJECTED' },
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'OVERDUE', progressEnd: 20, taskStatus: 'Đang thực hiện', approvalStatus: 'APPROVED' },
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'DUE', progressEnd: 20, taskStatus: 'Đang thực hiện', approvalStatus: '' },
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'PENDING', progressEnd: 20, taskStatus: 'Đang thực hiện', approvalStatus: 'PENDING' },
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'APPROVED', progressEnd: 20, taskStatus: 'Đang thực hiện', approvalStatus: 'APPROVED' },
  { ...modelContext, itemType: 'PB_DETAIL', itemId: 'COMPLETED', progressEnd: 100, taskStatus: 'Hoàn thành', approvalStatus: 'APPROVED' }
];
const originalModelOrder = modelItems.map((item) => item.itemId);
const allModel = weeklyModelContext.qltdWeeklyBuildWorkspaceModel(modelItems, modelUpdates, modelContext, modelWeek, { search: '', ownership: 'ALL', statuses: [] }, 'user@example.com');
assert.deepEqual(Array.from(allModel.objectives, (item) => item.itemId), ['M1', 'M-OVERDUE', 'M-COMPLETED']);
assert.deepEqual(Array.from(allModel.visibleTasks, (item) => item.itemId), ['REJECTED', 'OVERDUE', 'MISSING', 'DUE', 'PENDING', 'APPROVED', 'COMPLETED']);
assert.equal(allModel.objectiveOverdue, 1);
assert.equal(allModel.taskOverdue, 1);
assert.deepEqual({ ...weeklyModelContext.qltdWeeklyGetOverdueMetric(allModel, 'objectives') }, { label: 'Mục tiêu quá hạn', count: 1 });
assert.deepEqual({ ...weeklyModelContext.qltdWeeklyGetOverdueMetric(allModel, 'tasks') }, { label: 'Công việc quá hạn', count: 1 });
assert.match(extractFunction(app, 'renderWeeklyWorkflowBadges'), /qltdWeeklyIsOverdue\(item, saved, week\)/);
assert.equal(allModel.notUpdated, 1);
assert.deepEqual(modelItems.map((item) => item.itemId), originalModelOrder);
const filterIds = (filters) => Array.from(weeklyModelContext.qltdWeeklyFilterWorkItems(modelItems, modelUpdates, modelContext, modelWeek, filters, 'user@example.com'), (item) => item.itemId);
assert.deepEqual(filterIds({ ownership: 'OWNED', statuses: [] }), ['OVERDUE', 'MISSING']);
assert.deepEqual(filterIds({ ownership: 'COORDINATED', statuses: [] }), ['REJECTED', 'DUE']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['NOT_UPDATED'] }), ['MISSING']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['OVERDUE'] }), ['OVERDUE']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['DUE'] }), ['DUE']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['PENDING'] }), ['PENDING']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['REJECTED'] }), ['REJECTED']);
assert.deepEqual(filterIds({ ownership: 'ALL', statuses: ['APPROVED'] }), ['OVERDUE', 'APPROVED', 'COMPLETED']);
assert.deepEqual(filterIds({ search: 'khong co', ownership: 'ALL', statuses: [] }), []);

const weeklyBindings = latestFunction('bindWeeklyTaskUpdateControls', 'qltdWeeklyResultExportRows');
assert.match(weeklyBindings, /data-week-nav/);
assert.match(weeklyBindings, /qltdCurrentWeekPeriod\(\)\.weekId/);
assert.match(weeklyBindings, /qltdWeekPeriodFromDateValue/);
assert.match(weeklyBindings, /qltdWeeklyResetTaskFilters/);
assert.match(weeklyBindings, /data-weekly-clear-filters/);
assert.match(weeklyBindings, /data-weekly-filter-status/);
assert.doesNotMatch(weeklyBindings, /loadWeeklyTaskDataForCurrent\(\{ search:/);
const weeklyTabBinding = weeklyBindings.slice(weeklyBindings.indexOf("document.querySelectorAll('[data-weekly-workspace-tab]')"), weeklyBindings.indexOf("document.querySelectorAll('[data-weekly-select]')"));
assert.match(weeklyTabBinding, /renderWeeklyTaskRegion\(\)/);
assert.doesNotMatch(weeklyTabBinding, /loadWeeklyTaskData|fetchBackendJson/);
assert.match(weeklyPanel, /qltdWeeklyGetOverdueMetric\(model, qltdWeeklyWorkspaceTab\)/);

const weeklyRow = latestFunction('renderWeeklyTaskRow', 'getWeeklyTaskBadgeClass');
assert.match(weeklyRow, /getWeeklyEffectiveTaskState\(item, saved\)/);
assert.match(weeklyRow, /effective\.progress/);
assert.match(weeklyRow, /effective\.status/);
assert.match(weeklyRow, /options\.canUpdate/);
assert.match(weeklyRow, /weekly-readonly-action/);
assert.match(weeklyRow, /item\.coordinator/);
assert.match(weeklyRow, /Mục tiêu cha/);
const weeklyList = latestFunction('renderWeeklyTaskList', 'renderWeeklyTaskRow');
assert.match(weeklyList, /Không có kết quả phù hợp với bộ lọc/);
assert.match(weeklyList, /Không có công việc liên quan đến tuần này/);
const objectiveRenderContext = {
  findWeeklySavedUpdate: () => null,
  getWeeklyEffectiveTaskState: (item) => ({ progress: item.progress || 0, status: item.status || 'Chưa bắt đầu' }),
  escapeHtml: (value) => String(value ?? ''),
  formatIsoDateVi: (value) => String(value || ''),
  renderWeeklyWorkflowBadges: () => '',
  qltdSelectedWeeklyItemKey: ''
};
vm.createContext(objectiveRenderContext);
vm.runInContext(extractFunction(app, 'renderWeeklyObjectiveList'), objectiveRenderContext);
const readonlyObjective = objectiveRenderContext.renderWeeklyObjectiveList([{ itemType: 'MASTER', itemId: 'M1', taskName: 'Mục tiêu', progress: 20 }], [], {}, {}, false);
assert.match(readonlyObjective, /Chỉ xem/);
assert.doesNotMatch(readonlyObjective, /data-weekly-select/);
const editableObjective = objectiveRenderContext.renderWeeklyObjectiveList([{ itemType: 'MASTER', itemId: 'M1', taskName: 'Mục tiêu', progress: 20 }], [], {}, {}, true);
assert.match(editableObjective, /data-weekly-select="MASTER:M1"/);

const savedUpdatesSource = app.slice(app.indexOf('function renderWeeklySavedUpdates'), app.indexOf('function renderWeeklyNextItems'));
const savedUpdatesContext = {
  escapeHtml: (value) => String(value ?? ''),
  formatApprovalStatus: (value) => String(value || ''),
  formatWeeklyDateTime: (value) => String(value || ''),
  formatWeeklyCurrency: (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`
};
vm.createContext(savedUpdatesContext);
vm.runInContext(`${savedUpdatesSource}\nthis.renderSavedUpdates = renderWeeklySavedUpdates;`, savedUpdatesContext);
const savedStandaloneHtml = savedUpdatesContext.renderSavedUpdates([
  { itemType: 'PB_DETAIL', itemId: 'DT-1', thisWeekResult: 'Done', progressEnd: 10, taskStatus: 'Doing', budgetThisWeek: 0, updatedBy: 'u', updatedAt: 't' }
], [{ itemType: 'PB_DETAIL', itemId: 'DT-1', taskName: 'Task', budgetType: '', budgetItemCode: '' }]);
assert.match(savedStandaloneHtml, /<td>—<\/td>/);
assert.doesNotMatch(savedStandaloneHtml, /0 đ/);
const savedTaskBudgetHtml = savedUpdatesContext.renderSavedUpdates([
  { itemType: 'PB_DETAIL', itemId: 'DT-2', thisWeekResult: 'Done', progressEnd: 10, taskStatus: 'Doing', budgetThisWeek: 500000, updatedBy: 'u', updatedAt: 't' }
], [{ itemType: 'PB_DETAIL', itemId: 'DT-2', taskName: 'Task', budgetType: 'TASK_LINKED', budgetItemCode: 'BI1' }]);
assert.match(savedTaskBudgetHtml, /500\.000 đ/);

const savedMultiTaskBudgetHtml = savedUpdatesContext.renderSavedUpdates([
  { itemType: 'MASTER', itemId: 'D5-036', thisWeekResult: 'Done', progressEnd: 10, taskStatus: 'Doing', updatedBy: 'u', updatedAt: 't' }
], [{ itemType: 'MASTER', itemId: 'D5-036', taskName: 'Task', taskLinkedBudgetItems: [{ actualThisWeek: 400000 }, { actualThisWeek: 600000 }] }]);
assert.match(savedMultiTaskBudgetHtml, /1\.000\.000/);

const weeklyExportStart = app.indexOf('function qltdWeeklyResultExportRows');
const weeklyExportEnd = app.indexOf('function qltdWeeklyStyleExportSheet', weeklyExportStart);
const weeklyExportSource = app.slice(weeklyExportStart, weeklyExportEnd);
const weeklyExportContext = {
  formatIsoDateVi: (value) => value ? value.split('-').reverse().join('/') : '',
  getWeeklySavedBudgetAmount: (update) => update.budgetThisWeek ?? null,
  formatApprovalStatus: (value) => value,
  formatWeeklyDateTime: (value) => value,
  getWeeklyPersonDisplay: (value) => value || '—'
};
vm.createContext(weeklyExportContext);
vm.runInContext(`${weeklyExportSource}\nthis.resultRows = qltdWeeklyResultExportRows; this.nextRows = qltdWeeklyNextPlanExportRows;`, weeklyExportContext);
const resultExportRows = weeklyExportContext.resultRows([
  { itemType: 'MASTER', itemId: 'CV-1', thisWeekResult: 'Hoàn thành hồ sơ', progressEnd: 75, taskStatus: 'Đang thực hiện', actualStart: '2026-06-01', actualFinish: '', budgetThisWeek: 500000, approvalStatus: '', updatedBy: 'user@example.com', updatedAt: '28/06/2026' }
], [{ itemType: 'MASTER', itemId: 'CV-1', wbs: '1.1', taskName: 'Hồ sơ' }]);
assert.equal(resultExportRows.length, 1);
assert.equal(resultExportRows[0][4], 'Hoàn thành hồ sơ');
assert.equal(resultExportRows[0][7], '01/06/2026');
assert.equal(resultExportRows[0][11], 500000);
const nextExportRows = weeklyExportContext.nextRows([
  { itemType: 'PB_DETAIL', itemId: 'DT-1', wbs: '1.1.1', taskName: 'Việc tuần tới', planStart: '2026-06-29', planFinish: '2026-07-03', owner: 'Nguyễn A', progress: 10, status: 'Đang thực hiện', eligibleReason: 'PLANNED', plannedBudget: 1000000 }
]);
assert.equal(nextExportRows.length, 1);
assert.equal(nextExportRows[0][4], '29/06/2026');
assert.equal(nextExportRows[0][9], 'Bắt đầu trong tuần');
assert.equal(nextExportRows[0][10], 1000000);

const weeklyExcel = latestFunction('exportWeeklyReportExcel()', 'getTodayIsoLocal');
assert.match(weeklyExcel, /work_listweeklyitems/);
assert.ok(weeklyExcel.includes("'Kết quả tuần'"));
assert.ok(weeklyExcel.includes("'Kế hoạch tuần tới'"));
assert.match(weeklyExcel, /Bao_cao_tuan_/);
assert.match(weeklyExcel, /qltdWeb07LoadExcelJs/);
assert.match(weeklyExcel, /qltdWeb07DownloadBlob/);

const weeklyForm = latestFunction('renderWeeklySelectedForm', 'bindWeeklyTaskUpdateControls');
assert.match(weeklyForm, /THÔNG TIN CÔNG VIỆC/);
assert.match(weeklyForm, /KẾT QUẢ THỰC HIỆN TRONG TUẦN/);
assert.match(weeklyForm, /TÌNH TRẠNG CÔNG VIỆC/);
assert.match(weeklyForm, /Mức hoàn thành đến hết tuần/);
assert.match(weeklyForm, /renderWeeklyActualDateLifecycle/);
assert.match(weeklyForm, /weekly-form-close/);
assert.match(weeklyForm, /Cong_viec/);
assert.equal((weeklyForm.match(/saveWeeklyTaskUpdateButton/g) || []).length, 1);

const taskBudget = latestFunction('renderWeeklyBudgetBlock', 'renderStandaloneBudgetWeeklyBlock');
assert.match(taskBudget, /data-task-budget-item-code/);
assert.match(taskBudget, /TASK_LINKED/);
assert.match(taskBudget, /getTaskLinkedBudgetItems/);

const standaloneBudget = latestFunction('renderStandaloneBudgetWeeklyBlock', 'normalizeWeeklyBudgetAmount');
assert.match(standaloneBudget, /data-weekly-budget-amount/);
assert.match(standaloneBudget, /data-weekly-budget-note/);
assert.match(standaloneBudget, /Chi thực hiện tuần này/);
assert.match(standaloneBudget, /Thu thực hiện tuần này/);

const budgetPayloadSource = app.slice(app.indexOf('function normalizeWeeklyBudgetAmount'), app.indexOf('function getWeeklySaveRequestId'));
const budgetPayloadContext = {
  qltdWeeklyTaskView: {
    standaloneBudgetItems: [{ budgetItemCode: 'NS-1', allocationCode: 'ALLOC-1', flowType: 'CHI' }],
    budgetDrafts: { 'NS-1': { amount: '500.000', note: 'Chi tuần', dirty: true } }
  },
  getBudgetFlowType: (item) => item.flowType
};
budgetPayloadContext.qltdWeeklyTaskView.budgetDrafts['TL-1'] = { amount: '1.000.000', note: 'Chi mong', dirty: true };
budgetPayloadContext.getTaskLinkedBudgetItems = (item) => item?.taskLinkedBudgetItems || [];
vm.createContext(budgetPayloadContext);
vm.runInContext(`${budgetPayloadSource}\nthis.normalizeAmount = normalizeWeeklyBudgetAmount; this.buildBudgetUpdates = buildWeeklyBudgetUpdates;`, budgetPayloadContext);
assert.equal(budgetPayloadContext.normalizeAmount('500.000').value, 500000);
assert.equal(budgetPayloadContext.normalizeAmount('-1').error, 'Số tiền ngân sách không được âm.');
const builtBudget = budgetPayloadContext.buildBudgetUpdates('P1', 'PTDA', 'WEEK-1');
assert.equal(builtBudget.updates.length, 1);
assert.deepEqual({ ...builtBudget.updates[0] }, { budgetItemCode: 'NS-1', allocationCode: 'ALLOC-1', budgetType: 'DEPT_STANDALONE', flowType: 'CHI', projectCode: 'P1', deptCode: 'PTDA', periodType: 'WEEK', periodCode: 'WEEK-1', actualAmount: 500000, note: 'Chi tuần', masterTaskCode: '', pbTaskCode: '' });
const builtTaskLinkedBudget = budgetPayloadContext.buildBudgetUpdates('P1', 'BQLDA', 'WEEK-1', {
  masterTaskCode: 'D5-036',
  taskLinkedBudgetItems: [{ budgetItemCode: 'TL-1', allocationCode: 'ALLOC-TL', budgetType: 'TASK_LINKED', flowType: 'CHI', masterTaskCode: 'D5-036', pbTaskCode: '' }]
});
assert.deepEqual({ ...builtTaskLinkedBudget.updates[0] }, { budgetItemCode: 'TL-1', allocationCode: 'ALLOC-TL', budgetType: 'TASK_LINKED', flowType: 'CHI', projectCode: 'P1', deptCode: 'BQLDA', periodType: 'WEEK', periodCode: 'WEEK-1', actualAmount: 1000000, note: 'Chi mong', masterTaskCode: 'D5-036', pbTaskCode: '' });
budgetPayloadContext.qltdWeeklyTaskView.budgetDrafts['NS-1'].dirty = false;
budgetPayloadContext.qltdWeeklyTaskView.budgetDrafts['TL-1'].dirty = false;
assert.equal(budgetPayloadContext.buildBudgetUpdates('P1', 'PTDA', 'WEEK-1').updates.length, 0);

const loader = latestFunction('loadWeeklyTaskData(', 'loadWeeklyTaskDataForCurrent');
assert.equal((loader.match(/fetchBackendJson\(/g) || []).length, 2);
assert.match(loader, /itemsResult\.data \|\| itemsResult/);
assert.match(loader, /updatesResult\.data \|\| updatesResult/);
assert.doesNotMatch(loader, /nextResult|getNextWeeklyPeriod/);
assert.match(loader, /qltdWeeklyTaskCache\.delete\(key\)/);
assert.doesNotMatch(loader, /qltdWeeklyTaskCache\.get/);
assert.equal((loader.match(/\{ auth: true \}/g) || []).length, 2);
assert.match(loader, /accessDenied/);

const weeklySave = latestFunction('saveWeeklyTaskUpdate()', 'showWeeklyToast');
assert.match(weeklySave, /verifyWeeklyTaskUpdateSaved\(body\)/);
assert.match(weeklySave, /Đã lưu cập nhật tuần, nhưng phản hồi kết nối bị gián đoạn\./);
assert.match(weeklySave, /error\.backendResult/);
assert.match(weeklySave, /button\?\.dataset\.saving === '1'/);
assert.match(weeklySave, /budgetUpdates: budgetPayload\.updates/);
const verifySource = app.slice(app.indexOf('function weeklySavedUpdateMatchesPayload'), app.indexOf('function getWeeklySyncWarning'));
assert.match(verifySource, /weekly_taskupdates_get/);
assert.match(verifySource, /weeklySavedUpdateMatchesPayload/);
const recoveryCalls = [];
const recoveryContext = {
  normalizeWeeklyUpdateMatchValue: (value) => String(value || '').trim().toUpperCase(),
  fetchBackendJson: async (action, params) => {
    recoveryCalls.push({ action, params });
    return { success: true, updates: [weeklySaved] };
  },
  console
};
vm.createContext(recoveryContext);
vm.runInContext(`${verifySource}\nthis.verifySaved = verifyWeeklyTaskUpdateSaved;`, recoveryContext);
const recovered = await recoveryContext.verifySaved({ ...weeklySaved, email: 'user@example.com', thisWeekResult: '' });
assert.equal(recovered.itemId, 'DT-1');
assert.deepEqual(recoveryCalls.map((call) => call.action), ['weekly_taskupdates_get']);
assert.equal(recoveryCalls[0].params.weekCode, 'WEEK-1');

const popup = latestFunction('openDetailStatusPopup', 'renderWeeklyTaskUpdatePanel');
assert.match(popup, /work_getdetailtasks/);
assert.match(popup, /qltdDetailPopupCache/);
assert.match(app, /Chi tiết công việc thuộc mục tiêu/);
assert.match(app, /Chọn để cập nhật/);
assert.match(app, /qltdReportSubTab = 'weekly'/);
assert.match(app, /itemType: 'PB_DETAIL'/);
const summarySource = app.slice(app.indexOf('function getDetailTaskVisualState'), app.indexOf('function renderDetailStatusPopup'));
const summaryContext = {};
vm.createContext(summaryContext);
vm.runInContext(`${summarySource}\nthis.buildSummary = buildDetailStatusSummary;`, summaryContext);
const summary = summaryContext.buildSummary([
  { progress: 100, status: 'Hoàn thành', budgetPlan: 100, budgetActual: 90 },
  { progress: 50, actualStart: '2026-06-01', budgetPlan: 200, budgetActual: 80 },
  { progress: 0, planFinish: '2020-01-01', budgetPlan: 50 },
  { progress: 0, status: 'Chưa bắt đầu' }
]);
assert.deepEqual({ total: summary.total, completed: summary.completed, inProgress: summary.inProgress, notStarted: summary.notStarted, overdue: summary.overdue, progress: summary.progress }, { total: 4, completed: 1, inProgress: 1, notStarted: 1, overdue: 1, progress: 38 });
assert.equal(summary.budgetPlan, 350);
assert.equal(summary.budgetActual, 170);

assert.match(styles, /\.report-subtabs/);
assert.match(styles, /\.detail-status-overlay/);
assert.match(styles, /\.detail-status-badge\.is-overdue/);
assert.match(styles, /\.weekly-task-row/);
assert.match(styles, /\.weekly-split-view/);
assert.match(styles, /\.weekly-actual-date-lifecycle/);
assert.match(styles, /\.weekly-toast/);
assert.match(styles, /\.admin-approval-card/);
assert.match(styles, /\.budget-flow-badge\.is-thu/);
assert.match(styles, /\.master-completion-warning/);
assert.match(styles, /body\.qltd-report-mode \.dept-plan-panel\.compact/);
assert.match(styles, /overflow-x: hidden/);

const contextHandler = pb.slice(pb.indexOf('function qltdPbDetailHandleDeptPlanRendered'), pb.indexOf('function qltdPbDetailBoot'));
assert.doesNotMatch(contextHandler, /qltdPbDetailLoadAssignees/);
assert.match(contextHandler, /qltdPbDetailState\.listExpanded = false/);
assert.match(pb, /qltdPbDetailAssigneeCache = new Map/);
assert.match(pb, /Hiển thị \$\{detailList\.visible\.length\}\/\$\{detailList\.total\} công việc/);
assert.match(pb, /detailList\.total > 5/);
assert.match(pb, /data-pb-detail-action="toggle-list"/);
assert.match(pb, /pb-detail-overdue-badge/);
assert.match(pb, /data-pb-detail-action="edit"/);
assert.match(pb, /\+ Thêm việc chi tiết/);

const detailListContext = {};
vm.createContext(detailListContext);
vm.runInContext([
  extractFunction(pb, 'qltdPbDetailNormalize'),
  extractFunction(pb, 'qltdPbDetailGetStatusClass'),
  extractFunction(pb, 'qltdPbDetailParseIsoDateParts'),
  extractFunction(pb, 'qltdPbDetailIsOverdue'),
  extractFunction(pb, 'qltdPbDetailSortForDisplay'),
  extractFunction(pb, 'qltdPbDetailBuildListView')
].join('\n'), detailListContext);
const detailItems = masterItems.map((item, index) => ({ ...item, detailTaskId: `DT-${index + 1}` }));
const originalDetailOrder = detailItems.map((item) => item.id);
const collapsedDetails = detailListContext.qltdPbDetailBuildListView(detailItems, false, '2026-06-28');
assert.equal(collapsedDetails.visible.length, 5);
assert.equal(collapsedDetails.remaining, 2);
assert.deepEqual(Array.from(collapsedDetails.visible, (item) => item.id), ['overdue-old', 'overdue-recent', 'normal-1', 'completed-old', 'invalid-date']);
assert.deepEqual(detailItems.map((item) => item.id), originalDetailOrder);
assert.equal(detailListContext.qltdPbDetailBuildListView(detailItems, true, '2026-06-28').visible.length, 7);
assert.equal(detailListContext.qltdPbDetailBuildListView(detailItems.slice(0, 5), false, '2026-06-28').total, 5);

const detailToggleContext = {
  qltdPbDetailState: { listExpanded: false },
  qltdPbDetailRender: () => { detailToggleContext.renderCount += 1; },
  renderCount: 0
};
vm.createContext(detailToggleContext);
vm.runInContext(extractFunction(pb, 'qltdPbDetailHandleClick'), detailToggleContext);
const detailToggleButton = { dataset: { pbDetailAction: 'toggle-list' } };
const detailToggleEvent = { target: { closest: () => detailToggleButton } };
detailToggleContext.qltdPbDetailHandleClick(detailToggleEvent);
assert.equal(detailToggleContext.qltdPbDetailState.listExpanded, true);
detailToggleContext.qltdPbDetailHandleClick(detailToggleEvent);
assert.equal(detailToggleContext.qltdPbDetailState.listExpanded, false);
assert.equal(detailToggleContext.renderCount, 2);

const detailResetContext = {
  qltdPbDetailState: { contextKey: 'old', listExpanded: true },
  qltdPbDetailGetContext: () => ({ projectCode: 'P1', deptCode: 'D1', masterTaskCode: 'M2', email: 'user@example.com', key: 'new' }),
  qltdPbDetailEnsurePanel: () => ({}),
  qltdPbDetailLoad: () => { detailResetContext.loaded = true; },
  loaded: false
};
vm.createContext(detailResetContext);
vm.runInContext(extractFunction(pb, 'qltdPbDetailHandleDeptPlanRendered'), detailResetContext);
detailResetContext.qltdPbDetailHandleDeptPlanRendered({ detail: { projectCode: 'P1', deptCode: 'D1', masterTaskCode: 'M2' } });
assert.equal(detailResetContext.qltdPbDetailState.listExpanded, false);
assert.equal(detailResetContext.loaded, true);

const resetDeptState = extractFunction(app, 'resetDeptScopedSelectionState');
assert.match(resetDeptState, /qltdDeptMasterListExpanded = false/);
assert.match(styles, /\.report-summary-section/);
assert.match(styles, /\.report-master-row\.is-overdue/);
assert.match(styles, /\.dept-plan-list-toggle/);

console.log('Report UX/request contract: PASS');
