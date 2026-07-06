import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const accessSource = fs.readFileSync(new URL('../apps-script-dev-api/71_User_Project_Dept_Access_Service.js', import.meta.url), 'utf8');
const weeklyReportSource = fs.readFileSync(new URL('../apps-script-dev-api/63_Weekly_Report_Service.js', import.meta.url), 'utf8');
const scopeSource = fs.readFileSync(new URL('../apps-script-dev-api/37_SELF_REGISTRATION_SCOPE.js', import.meta.url), 'utf8');
const taskSource = fs.readFileSync(new URL('../apps-script-dev-api/62_Work_Task_Service.js', import.meta.url), 'utf8');
const detailSource = fs.readFileSync(new URL('../apps-script-dev-api/64_PB_Detail_Task_Service.js', import.meta.url), 'utf8');
const weeklyTaskSource = fs.readFileSync(new URL('../apps-script-dev-api/66_Weekly_Task_Update_Service.js', import.meta.url), 'utf8');
const budgetDashboardSource = fs.readFileSync(new URL('../apps-script-dev-api/54_Budget_Dashboard_Service.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const matches = Array.from(source.matchAll(new RegExp(`(?:^|\\n)(?:async )?function ${name}\\(`, 'g')));
  const lastMatch = matches.at(-1);
  const start = lastMatch ? lastMatch.index + (lastMatch[0].startsWith('\n') ? 1 : 0) : -1;
  assert.ok(start >= 0, `Missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(start, index + 1);
    try { new vm.Script(candidate); return candidate; } catch { /* continue */ }
  }
  throw new Error(`Unclosed function ${name}`);
}

const headers = ['Email', 'ProjectCode', 'DeptCode', 'PermissionCode', 'Status', 'EffectiveFrom', 'EffectiveTo', 'GrantedBy', 'GrantedAt', 'Note'];
const thi = { email: 'thipt.entiz@gmail.com', displayName: 'Phạm Trường Thi', role: 'EDITOR', status: 'ACTIVE', deptCode: 'KYTHUAT' };
const bqlda = { projectCode: '37-5.HL1', deptCode: 'BQLDA', masterDeptCode: 'QLDA', projectUnitCode: 'BQLDA_HL1', status: 'ACTIVE' };
const kyThuat = { projectCode: '37-5.HL1', deptCode: 'KSXD', masterDeptCode: 'KYTHUAT', projectUnitCode: 'KYTHUAT_HL1', status: 'ACTIVE' };

function accessRow(overrides = {}) {
  const value = { email: thi.email, projectCode: '37-5.HL1', deptCode: 'BQLDA', permissionCode: 'UPDATE_PROGRESS', status: 'ACTIVE', effectiveFrom: '', effectiveTo: '', grantedBy: 'admin@entiz.vn', grantedAt: '2026-07-04T09:00:00+07:00', note: 'Delegated test', ...overrides };
  return [value.email, value.projectCode, value.deptCode, value.permissionCode, value.status, value.effectiveFrom, value.effectiveTo, value.grantedBy, value.grantedAt, value.note];
}

function fakeSheet(rows) {
  return {
    getName: () => 'User_Project_Dept_Access',
    getLastColumn: () => headers.length,
    getLastRow: () => rows.length + 1,
    getRange: (row, _column, rowCount) => ({ getValues: () => row === 1 ? [headers] : rows.slice(0, rowCount) })
  };
}

const context = vm.createContext({
  console: { log: () => {}, warn: () => {} },
  currentSpreadsheet: null,
  getCurrentSpreadsheet_: () => context.currentSpreadsheet,
  qltdUsersNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdUsersNormalizeRole_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkIsAdminScope_: (user) => ['ADMIN', 'PMO'].includes(String(user?.role || '').toUpperCase()),
  qltdWorkSameDept_: (user, deptCode, dept) => String(user?.deptCode || '').toUpperCase() === String(dept?.masterDeptCode || deptCode || '').toUpperCase(),
  qltdWorkCanReadDept_: (user, deptCode, dept) => String(user?.deptCode || '').toUpperCase() === String(dept?.masterDeptCode || deptCode || '').toUpperCase(),
  QLTD_DEPT_SCOPE_ACTION_RULES: {
    work_assigntask: ['ADMIN', 'PMO', 'EDITOR'],
    work_updatetask: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
    work_createdetailtask: ['ADMIN', 'PMO', 'EDITOR'],
    work_updatedetailtask: ['ADMIN', 'PMO', 'EDITOR'],
    weekly_taskupdates_save: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
    weekly_pbdetailapproval_review: ['EDITOR'],
    weekly_savedraft: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
    weekly_submit: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
    weekly_review: ['ADMIN', 'PMO', 'EDITOR']
  },
  Utilities: { getUuid: () => 'UUID-1' }
});
vm.runInContext(accessSource, context);

function setAccessRows(rows) {
  const sheet = rows === null ? null : fakeSheet(rows);
  context.currentSpreadsheet = { getId: () => '1ZAZwSjGOvKEp8iLCqLsEiJyJSFBR-jeru0RL25Q4xMM', getSheetByName: (name) => name === 'User_Project_Dept_Access' ? sheet : null };
}

setAccessRows([accessRow()]);
assert.equal(context.qltdUserProjectDeptAccessCheckSchema_().valid, true);
assert.equal(context.qltdUserProjectDeptAccessHasPermission_(thi.email, '37-5.hl1', 'bqlda', 'update_progress', new Date('2026-07-04T10:00:00+07:00')), true);
assert.equal(context.qltdUserProjectDeptAccessHasPermission_(thi.email, 'OTHER', 'BQLDA', 'UPDATE_PROGRESS'), false);
assert.equal(context.qltdUserProjectDeptAccessHasPermission_(thi.email, '37-5.HL1', 'PTDA', 'UPDATE_PROGRESS'), false);
assert.equal(context.qltdUserProjectDeptAccessHasPermission_('other@example.com', '37-5.HL1', 'BQLDA', 'UPDATE_PROGRESS'), false);

setAccessRows([accessRow({ status: 'INACTIVE' })]);
assert.equal(context.qltdUserProjectDeptAccessHasPermission_(thi.email, '37-5.HL1', 'BQLDA', 'UPDATE_PROGRESS'), false);
setAccessRows([accessRow({ effectiveTo: '2026-07-01' })]);
assert.equal(context.qltdUserProjectDeptAccessHasPermission_(thi.email, '37-5.HL1', 'BQLDA', 'UPDATE_PROGRESS', new Date('2026-07-04T10:00:00+07:00')), false);
setAccessRows([accessRow({ effectiveFrom: '2026-07-10' })]);
assert.equal(context.qltdUserProjectDeptAccessHasPermission_(thi.email, '37-5.HL1', 'BQLDA', 'UPDATE_PROGRESS', new Date('2026-07-04T10:00:00+07:00')), false);

setAccessRows(null);
assert.equal(context.qltdUserProjectDeptAccessCheckSchema_().exists, false);
assert.equal(context.qltdResolveDeptProgressPermission_(thi, '37-5.HL1', 'KSXD', kyThuat, 'work_updatetask').source, 'HOME_DEPT');
assert.equal(context.qltdResolveDeptProgressPermission_(thi, '37-5.HL1', 'BQLDA', bqlda, 'work_updatetask').allowed, false);

setAccessRows([accessRow()]);
const delegated = context.qltdResolveDeptProgressPermission_(thi, '37-5.HL1', 'BQLDA', bqlda, 'work_updatetask');
assert.equal(delegated.allowed, true);
assert.equal(delegated.source, 'DELEGATED_ACCESS');
assert.equal(context.qltdResolveDeptProgressPermission_(thi, 'OTHER', 'BQLDA', bqlda, 'work_updatetask').allowed, false);
for (const action of ['weekly_review', 'weekly_pbdetailapproval_review', 'weekly_masterapproval_review', 'work_createdetailtask', 'work_assigntask']) {
  assert.equal(context.qltdResolveDeptProgressPermission_(thi, '37-5.HL1', 'BQLDA', bqlda, action).allowed, false, action);
}

const validTaskPayload = { action: 'work_updatetask', email: thi.email, idToken: 'token', projectCode: '37-5.HL1', deptCode: 'BQLDA', masterTaskCode: 'TASK-1', status: 'Đang làm', progress: 40, actualStart: '2026-07-04', updateNote: 'Đang triển khai' };
assert.equal(context.qltdUserProjectDeptAccessValidateDelegatedPayload_('work_updatetask', validTaskPayload, delegated), null);
for (const field of ['taskName', 'planStart', 'planFinish', 'owner', 'coordinator', 'weight', 'budgetPlan', 'budgetActual', 'budgetThisWeek', 'budgetUpdates', 'baseline', 'predecessor']) {
  const error = context.qltdUserProjectDeptAccessValidateDelegatedPayload_('work_updatetask', { ...validTaskPayload, [field]: field === 'budgetUpdates' ? [] : 'forbidden' }, delegated);
  assert.equal(error.code, 'DELEGATED_PROGRESS_FIELDS_FORBIDDEN', field);
}
const validWeekly = { action: 'weekly_taskupdates_save', email: thi.email, idToken: 'token', projectCode: '37-5.HL1', deptCode: 'BQLDA', weekCode: 'WEEK-2026-06-29', itemType: 'MASTER', itemId: 'TASK-1', thisWeekResult: 'Đạt', progressEnd: 55, taskStatus: 'Đang làm', actualStart: '2026-07-01', actualFinish: '', issue: 'Vướng', recommendation: 'Kiến nghị', requestId: 'REQ-1' };
assert.equal(context.qltdUserProjectDeptAccessValidateDelegatedPayload_('weekly_taskupdates_save', validWeekly, { ...delegated, source: 'DELEGATED_ACCESS' }), null);
assert.equal(context.qltdUserProjectDeptAccessValidateDelegatedPayload_('weekly_taskupdates_save', { ...validWeekly, budgetUpdates: [] }, { ...delegated, source: 'DELEGATED_ACCESS' }).code, 'DELEGATED_PROGRESS_FIELDS_FORBIDDEN');

const delegatedManagerUser = { email: 'manager.delegate@example.com', displayName: 'Delegated manager', role: 'REPORTER', status: 'ACTIVE', deptCode: 'KINHDOANH' };
setAccessRows([accessRow({
  email: delegatedManagerUser.email,
  permissionCode: 'DEPT_MANAGER'
})]);
const directManager = context.qltdResolveDeptManagerPermission_(thi, '37-5.HL1', 'KSXD', kyThuat);
const delegatedManager = context.qltdResolveDeptManagerPermission_(delegatedManagerUser, '37-5.HL1', 'BQLDA', bqlda);
assert.equal(directManager.allowed, true);
assert.equal(directManager.source, 'HOME_DEPT');
assert.equal(delegatedManager.allowed, true);
assert.equal(delegatedManager.permissionCode, 'DEPT_MANAGER');
for (const action of ['work_assigntask', 'work_updatetask', 'work_createdetailtask', 'work_updatedetailtask', 'weekly_taskupdates_save', 'weekly_savedraft', 'weekly_submit', 'weekly_review', 'weekly_pbdetailapproval_review']) {
  const decision = context.qltdResolveDeptProgressPermission_(delegatedManagerUser, '37-5.HL1', 'BQLDA', bqlda, action);
  assert.equal(decision.allowed, true, action);
  assert.equal(decision.permissionCode, 'DEPT_MANAGER', action);
}
assert.equal(context.qltdResolveDeptProgressPermission_(delegatedManagerUser, 'OTHER', 'BQLDA', bqlda, 'weekly_taskupdates_save').allowed, false);
assert.equal(context.qltdResolveDeptProgressPermission_(delegatedManagerUser, '37-5.HL1', 'PTDA', { ...bqlda, deptCode: 'PTDA' }, 'weekly_taskupdates_save').allowed, false);
assert.equal(context.qltdResolveDeptReadPermission_(delegatedManagerUser, '37-5.HL1', 'BQLDA', bqlda).allowed, true);
assert.equal(context.qltdResolveDeptReadPermission_(delegatedManagerUser, '37-5.HL1', 'PTDA', { ...bqlda, deptCode: 'PTDA' }).allowed, false);
assert.equal(context.qltdUserProjectDeptAccessValidateDelegatedPayload_(
  'weekly_taskupdates_save',
  { ...validWeekly, budgetUpdates: [{ amount: 1 }], owner: 'new-owner@example.com' },
  delegatedManager
), null);

setAccessRows([accessRow()]);
assert.equal(context.qltdResolveDeptProgressPermission_(thi, '37-5.HL1', 'BQLDA', bqlda, 'weekly_review').allowed, false);
assert.equal(context.qltdUserProjectDeptAccessValidateDelegatedPayload_(
  'weekly_taskupdates_save',
  { ...validWeekly, budgetUpdates: [] },
  delegated
).code, 'DELEGATED_PROGRESS_FIELDS_FORBIDDEN');

Object.assign(context, {
  QLTD_WEEKLY_REPORT_SOURCE: 'weekly_report_mvp_v1',
  qltdWorkNormalizeRole_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkNormalizeWeekCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdWorkNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkNormalizeReportStatus_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkFindActiveUserByEmail_: (email) => email === thi.email ? thi : null,
  qltdWorkResolveProjectDept_: (_action, payload) => {
    const projectCode = String(payload.projectCode || '').toUpperCase();
    const deptCode = String(payload.deptCode || '').toUpperCase();
    const dept = deptCode === 'BQLDA' ? bqlda : deptCode === 'KSXD' ? kyThuat : { projectCode, deptCode, masterDeptCode: deptCode, status: 'ACTIVE' };
    return { project: { projectCode }, dept, projectCode, deptCode, warnings: [], error: null };
  },
  qltdWorkError_: (_source, _action, code, message, meta, warnings = []) => ({ success: false, errors: [{ code, message }], meta, warnings }),
  qltdWorkAuthUser_: () => ({ user: thi, email: thi.email, error: null })
});
for (const name of ['qltdWeeklyValidateWriteScope_', 'qltdWeeklySaveDraft_', 'qltdWeeklySubmit_', 'qltdWeeklyPickPayload_', 'qltdWeeklyNormalizeTaskCodes_', 'qltdWeeklyGenerateReportId_', 'qltdWeeklyBuildReportRowObject_', 'qltdWeeklyNormalizeReportObject_']) vm.runInContext(extractFunction(weeklyReportSource, name), context);
context.qltdWeeklyUpsertWithLock_ = (action, payload, auth, scope, status) => {
  const row = context.qltdWeeklyBuildReportRowObject_(payload, scope, {}, status, '2026-07-04T10:00:00.000Z');
  return { success: true, action, report: context.qltdWeeklyNormalizeReportObject_(row), authEmail: auth.email };
};

const reportPayload = { action: 'weekly_savedraft', email: thi.email, idToken: 'token', userEmail: thi.email, projectCode: '37-5.HL1', deptCode: 'BQLDA', weekCode: 'WEEK-2026-06-29', thisWeekResult: 'Hoàn thành hạng mục', issue: 'Chậm vật tư', recommendation: 'Bổ sung vật tư', taskCodes: 'TASK-1' };
const draft = context.qltdWeeklySaveDraft_(reportPayload);
assert.equal(draft.success, true);
assert.equal(draft.report.preparedBy, thi.email);
assert.equal(draft.report.actingForDept, 'BQLDA');
assert.equal(draft.report.permissionSource, 'DELEGATED_ACCESS');
const submitted = context.qltdWeeklySubmit_({ ...reportPayload, action: 'weekly_submit' });
assert.equal(submitted.success, true);
assert.equal(submitted.report.submittedBy, thi.email);
assert.equal(submitted.report.actingForDept, 'BQLDA');
assert.equal(submitted.report.permissionSource, 'DELEGATED_ACCESS');

assert.equal(context.qltdWeeklyValidateWriteScope_('weekly_submit', { ...reportPayload, projectCode: 'OTHER' }, { user: thi, email: thi.email }).error.errors[0].code, 'PROJECT_DEPT_UPDATE_FORBIDDEN');
assert.equal(context.qltdWeeklyValidateWriteScope_('weekly_submit', { ...reportPayload, deptCode: 'PTDA' }, { user: thi, email: thi.email }).error.errors[0].code, 'PROJECT_DEPT_UPDATE_FORBIDDEN');
assert.equal(context.qltdWeeklyValidateWriteScope_('weekly_submit', { ...reportPayload, userEmail: 'other@example.com' }, { user: thi, email: thi.email }).error.errors[0].code, 'USER_NOT_FOUND');
assert.equal(context.qltdWeeklyValidateWriteScope_('weekly_submit', { ...reportPayload, budgetThisWeek: 1 }, { user: thi, email: thi.email }).error.errors[0].code, 'DELEGATED_PROGRESS_FIELDS_FORBIDDEN');

setAccessRows([accessRow({ status: 'INACTIVE' })]);
assert.equal(context.qltdWeeklyValidateWriteScope_('weekly_submit', reportPayload, { user: thi, email: thi.email }).error.errors[0].code, 'PROJECT_DEPT_UPDATE_FORBIDDEN');
setAccessRows(null);
assert.equal(context.qltdWeeklyValidateWriteScope_('weekly_savedraft', reportPayload, { user: thi, email: thi.email }).error.errors[0].code, 'PROJECT_DEPT_UPDATE_FORBIDDEN');

assert.match(scopeSource, /qltdFirebaseResolveIdentity_\(payload, true\)/);
assert.match(scopeSource, /payload\.email = user\.email/);
assert.match(taskSource, /qltdUserProjectDeptAccessValidateDelegatedPayload_/);
assert.match(detailSource, /canDelegatedUpdate/);
assert.match(weeklyTaskSource, /canWriteBudget: !restrictedDelegatedUpdate/);
assert.match(weeklyTaskSource, /qltdUserProjectDeptAccessDecisionIsDeptManager_\(progressPermission\)/);
assert.doesNotMatch(accessSource, /insertSheet|appendRow|\.setValues|\.setValue/);

const budgetPermissionContext = vm.createContext({
  QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION: { DEPT_MANAGER: 'DEPT_MANAGER' },
  qltdBudgetNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdMasterDeptCanonicalCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdUserProjectDeptAccessResolveEffectiveScopes_: (_email, permissionCode) => permissionCode === 'DEPT_MANAGER'
    ? [{ projectCode: '37-5.HL', deptCode: 'KINHDOANH' }]
    : []
});
vm.runInContext([
  extractFunction(budgetDashboardSource, 'qltdBudgetReadDeptExists_'),
  extractFunction(budgetDashboardSource, 'qltdBudgetReadAllowedDeptCodes_')
].join('\n'), budgetPermissionContext);
const budgetDepartments = [
  { projectCode: '37-5.HL', deptCode: 'KINHDOANH', masterDeptCode: 'KINHDOANH' },
  { projectCode: '37-5.HL', deptCode: 'PTDA', masterDeptCode: 'PTDA' },
  { projectCode: '24-1.ĐB', deptCode: 'KINHDOANH', masterDeptCode: 'KINHDOANH' }
];
const budgetAllowed = budgetPermissionContext.qltdBudgetReadAllowedDeptCodes_(
  { ...delegatedManagerUser, deptCode: 'OTHER' },
  delegatedManagerUser.email,
  budgetDepartments,
  '37-5.HL'
);
assert.equal(budgetAllowed.KINHDOANH, true);
assert.equal(budgetAllowed.PTDA, undefined);

console.log('Delegated project/department UPDATE_PROGRESS tests: PASS');
