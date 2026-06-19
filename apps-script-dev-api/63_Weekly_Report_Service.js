const QLTD_WEEKLY_SOURCE = 'weekly_report_mvp_v1';
const QLTD_WEEKLY_SHEET_NAME = 'WEEKLY_REPORTS';
const QLTD_WEEKLY_HEADERS = [
  'ReportId',
  'ProjectCode',
  'DeptCode',
  'UserEmail',
  'WeekCode',
  'ThisWeekResult',
  'NextWeekPlan',
  'Issue',
  'Recommendation',
  'TaskCodes',
  'Status',
  'SubmittedAt',
  'ReviewedBy',
  'ReviewedAt',
  'ReviewNote',
  'UpdatedAt',
  'CreatedAt'
];
const QLTD_WEEKLY_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED'];

function qltdWeeklySaveDraft_(payload) {
  const action = 'weekly_saveDraft';
  const auth = qltdWorkGetActiveUser_(payload && payload.email, action);
  if (auth.error) return auth.error;
  if (qltdWorkIsViewer_(auth.user)) return qltdWorkError_(action, 'PERMISSION_DENIED', 'VIEWER khong duoc lap bao cao tuan.', { email: auth.user.email });
  const normalized = qltdWeeklyNormalizePayload_(payload, auth.user, action);
  if (normalized.error) return normalized.error;
  if (normalized.userEmail !== auth.user.email && !qltdWorkCanManageDept_(auth.user, normalized.deptCode)) return qltdWorkError_(action, 'PERMISSION_DENIED', 'Khong duoc luu bao cao cua nguoi khac.', { email: auth.user.email, userEmail: normalized.userEmail });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return qltdWorkError_(action, 'LOCK_TIMEOUT', 'Khong lay duoc lock de luu bao cao tuan.', { email: auth.user.email });
  try {
    const sheet = qltdWeeklyEnsureSheet_();
    const parsed = qltdBudgetReadSheetAsObjects_(sheet, 1);
    const found = qltdWeeklyFindByKey_(parsed, normalized.projectCode, normalized.deptCode, normalized.userEmail, normalized.weekCode);
    const now = qltdBudgetNowIso_();
    if (found && ['SUBMITTED', 'APPROVED'].indexOf(String(qltdBudgetGetCell_(found.raw, parsed.headerMap, 'Status', '') || '').toUpperCase()) !== -1) {
      return qltdWorkError_(action, 'REPORT_LOCKED', 'Bao cao da gui/da duyet, khong duoc sua draft.', normalized);
    }
    const reportId = found ? qltdBudgetGetCell_(found.raw, parsed.headerMap, 'ReportId', '') : qltdWeeklyBuildReportId_(normalized);
    const rowObject = {
      ReportId: reportId,
      ProjectCode: normalized.projectCode,
      DeptCode: normalized.deptCode,
      UserEmail: normalized.userEmail,
      WeekCode: normalized.weekCode,
      ThisWeekResult: normalized.thisWeekResult,
      NextWeekPlan: normalized.nextWeekPlan,
      Issue: normalized.issue,
      Recommendation: normalized.recommendation,
      TaskCodes: normalized.taskCodes,
      Status: 'DRAFT',
      SubmittedAt: found ? qltdBudgetGetCell_(found.raw, parsed.headerMap, 'SubmittedAt', '') : '',
      ReviewedBy: found ? qltdBudgetGetCell_(found.raw, parsed.headerMap, 'ReviewedBy', '') : '',
      ReviewedAt: found ? qltdBudgetGetCell_(found.raw, parsed.headerMap, 'ReviewedAt', '') : '',
      ReviewNote: found ? qltdBudgetGetCell_(found.raw, parsed.headerMap, 'ReviewNote', '') : '',
      UpdatedAt: now,
      CreatedAt: found ? qltdBudgetGetCell_(found.raw, parsed.headerMap, 'CreatedAt', now) : now
    };
    qltdWeeklyWriteRow_(sheet, found ? found.rowNumber : null, rowObject);
    return qltdWorkOk_(action, { reportId: reportId, status: 'DRAFT', upsertMode: found ? 'UPDATE' : 'INSERT' }, [], { email: auth.user.email });
  } finally {
    lock.releaseLock();
  }
}

function qltdWeeklySubmit_(payload) {
  return qltdWeeklyTransitionOwn_(payload, 'weekly_submit', ['DRAFT', 'RETURNED'], 'SUBMITTED');
}

function qltdWeeklyReview_(payload) {
  const action = 'weekly_review';
  const auth = qltdWorkGetActiveUser_(payload && payload.email, action);
  if (auth.error) return auth.error;
  const reportId = qltdWorkNormalizeText_(payload && payload.reportId);
  const decision = qltdWorkNormalizeCode_(payload && payload.decision);
  if (!reportId || ['APPROVED', 'RETURNED'].indexOf(decision) === -1) return qltdWorkError_(action, 'REQUIRED_FIELD_MISSING', 'Thieu reportId hoac decision khong hop le.', { email: auth.user.email, decision: decision });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return qltdWorkError_(action, 'LOCK_TIMEOUT', 'Khong lay duoc lock de duyet bao cao.', { email: auth.user.email, reportId: reportId });
  try {
    const sheet = qltdWeeklyEnsureSheet_();
    const parsed = qltdBudgetReadSheetAsObjects_(sheet, 1);
    const item = qltdWeeklyFindByReportId_(parsed, reportId);
    if (!item) return qltdWorkError_(action, 'REPORT_NOT_FOUND', 'Khong tim thay bao cao.', { reportId: reportId });
    const deptCode = qltdBudgetGetCell_(item.raw, parsed.headerMap, 'DeptCode', '');
    if (!qltdWorkCanManageDept_(auth.user, deptCode)) return qltdWorkError_(action, 'PERMISSION_DENIED', 'Khong du quyen duyet bao cao phong/ban.', { email: auth.user.email, deptCode: deptCode });
    const status = qltdWorkNormalizeCode_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'Status', ''));
    if (status !== 'SUBMITTED') return qltdWorkError_(action, 'INVALID_STATUS_TRANSITION', 'Chi duyet/tra lai bao cao SUBMITTED.', { reportId: reportId, status: status });
    qltdWeeklyPatchRow_(sheet, parsed.headerMap, item.rowNumber, {
      Status: decision,
      ReviewedBy: auth.user.email,
      ReviewedAt: qltdBudgetNowIso_(),
      ReviewNote: qltdWorkNormalizeText_(payload && payload.reviewNote),
      UpdatedAt: qltdBudgetNowIso_()
    });
    return qltdWorkOk_(action, { reportId: reportId, status: decision }, [], { email: auth.user.email });
  } finally {
    lock.releaseLock();
  }
}

function qltdWeeklyGetMyReports_(params) {
  const action = 'weekly_getMyReports';
  const auth = qltdWorkGetActiveUser_(params && params.email, action);
  if (auth.error) return auth.error;
  const sheet = qltdWeeklyEnsureSheet_();
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, 1);
  const rows = qltdWeeklyFilterRows_(parsed, {
    projectCode: params && params.projectCode,
    deptCode: params && params.deptCode,
    userEmail: auth.user.email,
    weekCode: params && params.weekCode,
    status: params && params.status
  });
  return qltdWorkOk_(action, { reportCount: rows.length, reports: rows.map(function(item) { return qltdWeeklyRowToObject_(item.raw, parsed.headerMap); }), summary: qltdWeeklyBuildSummary_(rows, parsed.headerMap) }, [], { email: auth.user.email });
}

function qltdWeeklyGetDeptReports_(params) {
  const action = 'weekly_getDeptReports';
  const auth = qltdWorkGetActiveUser_(params && params.email, action);
  if (auth.error) return auth.error;
  const deptCode = qltdWorkNormalizeCode_((params && params.deptCode) || auth.user.deptCode);
  if (!deptCode) return qltdWorkError_(action, 'DEPT_CODE_REQUIRED', 'deptCode la bat buoc.', { email: auth.user.email });
  if (!qltdWorkCanManageDept_(auth.user, deptCode)) return qltdWorkError_(action, 'PERMISSION_DENIED', 'Khong du quyen doc bao cao phong/ban.', { email: auth.user.email, deptCode: deptCode });
  const sheet = qltdWeeklyEnsureSheet_();
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, 1);
  const rows = qltdWeeklyFilterRows_(parsed, {
    projectCode: params && params.projectCode,
    deptCode: deptCode,
    userEmail: params && params.userEmail,
    weekCode: params && params.weekCode,
    status: params && params.status
  });
  return qltdWorkOk_(action, { reportCount: rows.length, reports: rows.map(function(item) { return qltdWeeklyRowToObject_(item.raw, parsed.headerMap); }), summary: qltdWeeklyBuildSummary_(rows, parsed.headerMap) }, [], { email: auth.user.email, deptCode: deptCode });
}

function qltdWeeklyTransitionOwn_(payload, action, fromStatuses, toStatus) {
  const auth = qltdWorkGetActiveUser_(payload && payload.email, action);
  if (auth.error) return auth.error;
  const reportId = qltdWorkNormalizeText_(payload && payload.reportId);
  if (!reportId) return qltdWorkError_(action, 'REPORT_ID_REQUIRED', 'reportId la bat buoc.', { email: auth.user.email });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return qltdWorkError_(action, 'LOCK_TIMEOUT', 'Khong lay duoc lock de gui bao cao.', { email: auth.user.email, reportId: reportId });
  try {
    const sheet = qltdWeeklyEnsureSheet_();
    const parsed = qltdBudgetReadSheetAsObjects_(sheet, 1);
    const item = qltdWeeklyFindByReportId_(parsed, reportId);
    if (!item) return qltdWorkError_(action, 'REPORT_NOT_FOUND', 'Khong tim thay bao cao.', { reportId: reportId });
    const userEmail = qltdWorkNormalizeEmail_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'UserEmail', ''));
    if (userEmail !== auth.user.email) return qltdWorkError_(action, 'PERMISSION_DENIED', 'Khong duoc gui bao cao cua nguoi khac.', { email: auth.user.email, reportId: reportId });
    const current = qltdWorkNormalizeCode_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'Status', ''));
    if (fromStatuses.indexOf(current) === -1) return qltdWorkError_(action, 'INVALID_STATUS_TRANSITION', 'Trang thai hien tai khong hop le.', { reportId: reportId, status: current });
    const thisWeekResult = qltdWorkNormalizeText_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'ThisWeekResult', ''));
    const nextWeekPlan = qltdWorkNormalizeText_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'NextWeekPlan', ''));
    if (!thisWeekResult && !nextWeekPlan) return qltdWorkError_(action, 'REPORT_CONTENT_REQUIRED', 'Bao cao can co ket qua tuan nay hoac ke hoach tuan toi.', { reportId: reportId });
    qltdWeeklyPatchRow_(sheet, parsed.headerMap, item.rowNumber, { Status: toStatus, SubmittedAt: qltdBudgetNowIso_(), UpdatedAt: qltdBudgetNowIso_() });
    return qltdWorkOk_(action, { reportId: reportId, status: toStatus }, [], { email: auth.user.email });
  } finally {
    lock.releaseLock();
  }
}

function qltdWeeklyNormalizePayload_(payload, user, action) {
  const projectCode = qltdWorkNormalizeCode_(payload && payload.projectCode);
  const deptCode = qltdWorkNormalizeCode_((payload && payload.deptCode) || user.deptCode);
  const userEmail = qltdWorkNormalizeEmail_((payload && payload.userEmail) || user.email);
  const weekCode = qltdWeeklyNormalizeWeekCode_((payload && payload.weekCode) || '');
  if (!projectCode || !deptCode || !userEmail || !weekCode) return { error: qltdWorkError_(action, 'REQUIRED_FIELD_MISSING', 'Thieu projectCode/deptCode/userEmail/weekCode.', { email: user.email }) };
  if (QLTD_WEEKLY_STATUSES.indexOf('DRAFT') === -1) return { error: qltdWorkError_(action, 'WEEKLY_STATUS_CONFIG_INVALID', 'Cau hinh trang thai bao cao tuan khong hop le.', {}) };
  return {
    projectCode: projectCode,
    deptCode: deptCode,
    userEmail: userEmail,
    weekCode: weekCode,
    thisWeekResult: qltdWorkNormalizeText_(payload && payload.thisWeekResult),
    nextWeekPlan: qltdWorkNormalizeText_(payload && payload.nextWeekPlan),
    issue: qltdWorkNormalizeText_(payload && payload.issue),
    recommendation: qltdWorkNormalizeText_(payload && payload.recommendation),
    taskCodes: Array.isArray(payload && payload.taskCodes) ? payload.taskCodes.join(';') : qltdWorkNormalizeText_(payload && payload.taskCodes),
    error: null
  };
}

function qltdWeeklyNormalizeWeekCode_(value) {
  return qltdWorkNormalizeText_(value).toUpperCase();
}

function qltdWeeklyBuildReportId_(payload) {
  return [payload.projectCode, payload.deptCode, payload.userEmail, payload.weekCode].join('|');
}

function qltdWeeklyEnsureSheet_() {
  const ss = getCurrentSpreadsheet_();
  let sheet = ss.getSheetByName(QLTD_WEEKLY_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(QLTD_WEEKLY_SHEET_NAME);
  const range = sheet.getRange(1, 1, 1, QLTD_WEEKLY_HEADERS.length);
  const current = range.getValues()[0].map(function(value) { return qltdWorkNormalizeText_(value); });
  const mismatch = QLTD_WEEKLY_HEADERS.some(function(header, index) { return current[index] !== header; });
  if (mismatch) {
    range.setValues([QLTD_WEEKLY_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function qltdWeeklyFindByKey_(parsed, projectCode, deptCode, userEmail, weekCode) {
  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index];
    if (qltdWorkNormalizeCode_(qltdBudgetGetCell_(row.raw, parsed.headerMap, 'ProjectCode', '')) === projectCode &&
      qltdWorkNormalizeCode_(qltdBudgetGetCell_(row.raw, parsed.headerMap, 'DeptCode', '')) === deptCode &&
      qltdWorkNormalizeEmail_(qltdBudgetGetCell_(row.raw, parsed.headerMap, 'UserEmail', '')) === userEmail &&
      qltdWeeklyNormalizeWeekCode_(qltdBudgetGetCell_(row.raw, parsed.headerMap, 'WeekCode', '')) === weekCode) return row;
  }
  return null;
}

function qltdWeeklyFindByReportId_(parsed, reportId) {
  for (let index = 0; index < parsed.rows.length; index += 1) {
    if (qltdWorkNormalizeText_(qltdBudgetGetCell_(parsed.rows[index].raw, parsed.headerMap, 'ReportId', '')) === reportId) return parsed.rows[index];
  }
  return null;
}

function qltdWeeklyWriteRow_(sheet, rowNumber, object) {
  const values = QLTD_WEEKLY_HEADERS.map(function(header) { return object[header] === undefined ? '' : object[header]; });
  if (rowNumber) sheet.getRange(rowNumber, 1, 1, QLTD_WEEKLY_HEADERS.length).setValues([values]);
  else sheet.appendRow(values);
}

function qltdWeeklyPatchRow_(sheet, headerMap, rowNumber, patch) {
  Object.keys(patch || {}).forEach(function(header) {
    const col = qltdBudgetFindHeaderIndex_(headerMap, header) + 1;
    if (col > 0) sheet.getRange(rowNumber, col).setValue(patch[header]);
  });
}

function qltdWeeklyFilterRows_(parsed, filter) {
  return parsed.rows.filter(function(item) {
    if (filter.projectCode && qltdWorkNormalizeCode_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'ProjectCode', '')) !== qltdWorkNormalizeCode_(filter.projectCode)) return false;
    if (filter.deptCode && qltdWorkNormalizeCode_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'DeptCode', '')) !== qltdWorkNormalizeCode_(filter.deptCode)) return false;
    if (filter.userEmail && qltdWorkNormalizeEmail_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'UserEmail', '')) !== qltdWorkNormalizeEmail_(filter.userEmail)) return false;
    if (filter.weekCode && qltdWeeklyNormalizeWeekCode_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'WeekCode', '')) !== qltdWeeklyNormalizeWeekCode_(filter.weekCode)) return false;
    if (filter.status && qltdWorkNormalizeCode_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'Status', '')) !== qltdWorkNormalizeCode_(filter.status)) return false;
    return true;
  });
}

function qltdWeeklyRowToObject_(row, headerMap) {
  return {
    reportId: qltdBudgetGetCell_(row, headerMap, 'ReportId', ''),
    projectCode: qltdBudgetGetCell_(row, headerMap, 'ProjectCode', ''),
    deptCode: qltdBudgetGetCell_(row, headerMap, 'DeptCode', ''),
    userEmail: qltdBudgetGetCell_(row, headerMap, 'UserEmail', ''),
    weekCode: qltdBudgetGetCell_(row, headerMap, 'WeekCode', ''),
    thisWeekResult: qltdBudgetGetCell_(row, headerMap, 'ThisWeekResult', ''),
    nextWeekPlan: qltdBudgetGetCell_(row, headerMap, 'NextWeekPlan', ''),
    issue: qltdBudgetGetCell_(row, headerMap, 'Issue', ''),
    recommendation: qltdBudgetGetCell_(row, headerMap, 'Recommendation', ''),
    taskCodes: qltdBudgetGetCell_(row, headerMap, 'TaskCodes', ''),
    status: qltdBudgetGetCell_(row, headerMap, 'Status', ''),
    submittedAt: qltdBudgetGetCell_(row, headerMap, 'SubmittedAt', ''),
    reviewedBy: qltdBudgetGetCell_(row, headerMap, 'ReviewedBy', ''),
    reviewedAt: qltdBudgetGetCell_(row, headerMap, 'ReviewedAt', ''),
    reviewNote: qltdBudgetGetCell_(row, headerMap, 'ReviewNote', ''),
    updatedAt: qltdBudgetGetCell_(row, headerMap, 'UpdatedAt', ''),
    createdAt: qltdBudgetGetCell_(row, headerMap, 'CreatedAt', '')
  };
}

function qltdWeeklyBuildSummary_(rows, headerMap) {
  const summary = { byStatus: {}, byUser: {}, byDept: {}, byProject: {} };
  rows.forEach(function(item) {
    const status = qltdWorkNormalizeCode_(qltdBudgetGetCell_(item.raw, headerMap, 'Status', 'UNKNOWN')) || 'UNKNOWN';
    const user = qltdWorkNormalizeEmail_(qltdBudgetGetCell_(item.raw, headerMap, 'UserEmail', '')) || 'UNKNOWN';
    const dept = qltdWorkNormalizeCode_(qltdBudgetGetCell_(item.raw, headerMap, 'DeptCode', '')) || 'UNKNOWN';
    const project = qltdWorkNormalizeCode_(qltdBudgetGetCell_(item.raw, headerMap, 'ProjectCode', '')) || 'UNKNOWN';
    summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
    summary.byUser[user] = (summary.byUser[user] || 0) + 1;
    summary.byDept[dept] = (summary.byDept[dept] || 0) + 1;
    summary.byProject[project] = (summary.byProject[project] || 0) + 1;
  });
  return summary;
}
