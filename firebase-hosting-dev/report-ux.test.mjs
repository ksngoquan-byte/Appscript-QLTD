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

const weeklyPanel = latestFunction('renderWeeklyTaskUpdatePanel', 'renderWeeklyTaskList');
assert.match(weeklyPanel, /single-week-toolbar/);
assert.match(weeklyPanel, /Thứ Hai – Chủ nhật/);
assert.match(weeklyPanel, /selected \? renderWeeklySelectedForm/);
assert.match(weeklyPanel, /renderStandaloneBudgetWeeklyBlock/);
assert.match(weeklyPanel, /weekly-split-view/);
assert.match(weeklyPanel, /DANH SÁCH CÔNG VIỆC/);
assert.doesNotMatch(weeklyPanel, /renderWeekPeriodsHtml|renderWeeklyNextItems/);
assert.match(weeklyPanel, /findWeeklySavedUpdate/);
assert.match(weeklyPanel, /updateContext/);

const weeklyStateSource = app.slice(app.indexOf('function normalizeWeeklyUpdateMatchValue'), app.indexOf('function renderWeeklyTaskUpdatePanel('));
const weeklyStateContext = {};
vm.createContext(weeklyStateContext);
vm.runInContext(`${weeklyStateSource}\nthis.findSaved = findWeeklySavedUpdate; this.effective = getWeeklyEffectiveTaskState;`, weeklyStateContext);
const weeklyItem = { itemType: 'PB_DETAIL', itemId: 'DT-1', progress: 0, status: 'Chưa bắt đầu', actualStart: '', actualFinish: '' };
const weeklySaved = { projectCode: 'P1', deptCode: 'KEHOACH', weekCode: 'WEEK-1', itemType: 'PB_DETAIL', itemId: 'DT-1', progressEnd: 1, taskStatus: 'Đang thực hiện', actualStart: '2026-06-21', actualFinish: '' };
assert.equal(weeklyStateContext.findSaved([weeklySaved], weeklyItem, { projectCode: 'p1', deptCode: 'kehoach', weekCode: 'week-1' }), weeklySaved);
assert.equal(weeklyStateContext.findSaved([weeklySaved], weeklyItem, { projectCode: 'P1', deptCode: 'PTDA', weekCode: 'WEEK-1' }), null);
assert.deepEqual({ ...weeklyStateContext.effective(weeklyItem, weeklySaved) }, { progress: 1, status: 'Đang thực hiện', actualStart: '2026-06-21', actualFinish: '' });

const weeklyRow = latestFunction('renderWeeklyTaskRow', 'getWeeklyTaskBadgeClass');
assert.match(weeklyRow, /getWeeklyEffectiveTaskState\(item, saved\)/);
assert.match(weeklyRow, /effective\.progress/);
assert.match(weeklyRow, /effective\.status/);

const weeklyForm = latestFunction('renderWeeklySelectedForm', 'bindWeeklyTaskUpdateControls');
assert.match(weeklyForm, /THÔNG TIN CÔNG VIỆC/);
assert.match(weeklyForm, /KẾT QUẢ THỰC HIỆN TRONG TUẦN/);
assert.match(weeklyForm, /TÌNH TRẠNG CÔNG VIỆC/);
assert.match(weeklyForm, /Mức hoàn thành đến hết tuần/);
assert.match(weeklyForm, /renderWeeklyActualDateLifecycle/);
assert.match(weeklyForm, /weekly-form-close/);
assert.match(weeklyForm, /Cong_viec/);

const loader = latestFunction('loadWeeklyTaskData(', 'loadWeeklyTaskDataForCurrent');
assert.equal((loader.match(/fetchBackendJson\(/g) || []).length, 2);
assert.match(loader, /itemsResult\.data \|\| itemsResult/);
assert.match(loader, /updatesResult\.data \|\| updatesResult/);
assert.doesNotMatch(loader, /nextResult|getNextWeeklyPeriod/);
assert.match(loader, /if \(filters\.force\) qltdWeeklyTaskCache\.delete\(key\)/);

const weeklySave = latestFunction('saveWeeklyTaskUpdate()', 'showWeeklyToast');
assert.match(weeklySave, /verifyWeeklyTaskUpdateSaved\(body\)/);
assert.match(weeklySave, /Đã lưu cập nhật tuần, nhưng phản hồi kết nối bị gián đoạn\./);
assert.doesNotMatch(weeklySave, /status\.textContent = error\.message/);
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
assert.match(pb, /qltdPbDetailAssigneeCache = new Map/);

console.log('Report UX/request contract: PASS');
