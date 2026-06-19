const QLTD_WEEKLY_REPORT_SHEET_NAME = 'WEEKLY_REPORTS';
const QLTD_WEEKLY_REPORT_HEADERS = [
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
const QLTD_WEEKLY_VALID_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED'];

function qltdWeeklySaveDraft_(payload) {
  const action = 'weekly_saveDraft';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WEEKLY_REPORT_SOURCE);
  if (auth.error) return auth.error;

  const scope = qltdWeeklyValidateWriteScope_(action, payload || {}, auth, false);
  if (scope.error) return scope.error;

  return qltdWeeklyUpsertWithLock_(action, payload || {}, auth, scope, 'DRAFT');
}

function qltdWeeklySubmit_(payload) {
  const action = 'weekly_submit';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WEEKLY_REPORT_SOURCE);
  if (auth.error) return auth.error;

  const scope = qltdWeeklyValidateWriteScope_(action, payload || {}, auth, false);
  if (scope.error) return scope.error;

  return qltdWeeklyUpsertWithLock_(action, payload || {}, auth, scope, 'SUBMITTED');
}

function qltdWeeklyReview_(payload) {
  const action = 'weekly_review';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WEEKLY_REPORT_SOURCE);
  if (auth.error) return auth.error;

  const projectCode = qltdWorkNormalizeCode_(payload && payload.projectCode);
  const deptCode = qltdWorkNormalizeCode_(payload && payload.deptCode);
  const userEmail = qltdWorkNormalizeEmail_(payload && payload.userEmail);
  const weekCode = qltdWorkNormalizeWeekCode_(payload && payload.weekCode);
  const nextStatus = qltdWorkNormalizeReportStatus_((payload && (payload.status || payload.reviewStatus)) || '');
  const meta = {
    email: auth.email,
    projectCode: projectCode,
    deptCode: deptCode,
    userEmail: userEmail,
    weekCode: weekCode
  };

  if (!projectCode || !deptCode || !userEmail || !weekCode) {
    return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'REPORT_KEY_REQUIRED', 'projectCode, deptCode, userEmail and weekCode are required.', meta);
  }
  if (['APPROVED', 'RETURNED'].indexOf(nextStatus) === -1) {
    return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'REVIEW_STATUS_INVALID', 'Review status must be APPROVED or RETURNED.', meta);
  }

  const contextResult = qltdWorkResolveProjectDept_(action, payload || {}, QLTD_WEEKLY_REPORT_SOURCE, {
    requireDeptSpreadsheet: false,
    meta: meta
  });
  if (contextResult.error) return contextResult.error;

  const resolvedDeptCode = contextResult.deptCode;
  meta.deptCode = resolvedDeptCode;
  if (!qltdWorkCanReviewWeekly_(auth.user, resolvedDeptCode)) {
    return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'ACCESS_DENIED', 'User cannot review weekly reports for this department.', Object.assign({
      role: auth.user.role
    }, meta), contextResult.warnings || []);
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'WRITE_LOCK_TIMEOUT', 'Cannot acquire weekly report write lock.', meta);
    }

    const readResult = qltdWeeklyReadReports_();
    const existing = qltdWeeklyFindReportByKey_(readResult.reports, projectCode, resolvedDeptCode, userEmail, weekCode);
    if (!existing) {
      return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'REPORT_NOT_FOUND', 'Weekly report not found.', meta, readResult.warnings.concat(contextResult.warnings || []));
    }
    if (existing.status !== 'SUBMITTED') {
      return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'INVALID_STATUS_TRANSITION', 'Only SUBMITTED reports can be reviewed.', Object.assign({
        currentStatus: existing.status
      }, meta), readResult.warnings.concat(contextResult.warnings || []));
    }

    const now = qltdWorkNowIso_();
    const rowObject = Object.assign({}, existing.rawObject, {
      Status: nextStatus,
      ReviewedBy: auth.email,
      ReviewedAt: now,
      ReviewNote: String(payload.reviewNote || payload.note || '').trim(),
      UpdatedAt: now
    });

    qltdWeeklyWriteReportRow_(readResult.sheet, existing.rowNumber, rowObject);
    return qltdWorkOk_(QLTD_WEEKLY_REPORT_SOURCE, action, {
      report: qltdWeeklyNormalizeReportObject_(rowObject),
      duplicatePrevented: true
    }, readResult.warnings.concat(contextResult.warnings || []), meta);
  } catch (error) {
    return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'WRITE_ERROR', qltdBudgetSafeErrorMessage_(error), meta);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdWeeklyGetMyReports_(params) {
  const action = 'weekly_getMyReports';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WEEKLY_REPORT_SOURCE);
  if (auth.error) return auth.error;

  const readResult = qltdWeeklyReadReports_();
  const filters = qltdWeeklyBuildReportFilters_(params || {});
  const reports = readResult.reports.filter(function(report) {
    if (report.userEmail !== auth.email) return false;
    return qltdWeeklyReportMatchesFilters_(report, filters);
  });

  return qltdWorkOk_(QLTD_WEEKLY_REPORT_SOURCE, action, {
    reports: reports.map(qltdWeeklyPublicReport_),
    count: reports.length
  }, readResult.warnings, {
    email: auth.email
  });
}

function qltdWeeklyGetDeptReports_(params) {
  const action = 'weekly_getDeptReports';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WEEKLY_REPORT_SOURCE);
  if (auth.error) return auth.error;

  const role = qltdWorkNormalizeRole_(auth.user.role);
  const filters = qltdWeeklyBuildReportFilters_(params || {});
  if (!filters.deptCode && !qltdWorkIsAdminScope_(auth.user)) {
    filters.deptCode = qltdWorkNormalizeCode_(auth.user.deptCode);
  }

  if (filters.deptCode && !qltdWorkCanReadDept_(auth.user, filters.deptCode)) {
    return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'ACCESS_DENIED', 'User cannot read this department reports.', {
      email: auth.email,
      role: role,
      deptCode: filters.deptCode
    });
  }

  const readResult = qltdWeeklyReadReports_();
  const reports = readResult.reports.filter(function(report) {
    if (!qltdWeeklyReportMatchesFilters_(report, filters)) return false;
    if (role === 'REPORTER') return report.userEmail === auth.email;
    return true;
  });

  return qltdWorkOk_(QLTD_WEEKLY_REPORT_SOURCE, action, {
    reports: reports.map(qltdWeeklyPublicReport_),
    count: reports.length
  }, readResult.warnings, {
    email: auth.email,
    role: role,
    projectCode: filters.projectCode,
    deptCode: filters.deptCode
  });
}

function qltdWeeklyValidateWriteScope_(action, payload, auth, allowViewer) {
  const role = qltdWorkNormalizeRole_(auth.user.role);
  if (!allowViewer && role === 'VIEWER') {
    return {
      error: qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'ACCESS_DENIED', 'Viewer cannot write weekly reports.', {
        email: auth.email,
        role: role
      })
    };
  }

  const weekCode = qltdWorkNormalizeWeekCode_(payload.weekCode);
  if (!weekCode) {
    return {
      error: qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'WEEK_CODE_REQUIRED', 'weekCode is required.', {
        email: auth.email
      })
    };
  }

  const contextResult = qltdWorkResolveProjectDept_(action, payload, QLTD_WEEKLY_REPORT_SOURCE, {
    requireDeptSpreadsheet: false,
    meta: {
      email: auth.email,
      weekCode: weekCode
    }
  });
  if (contextResult.error) return contextResult;

  const targetEmail = qltdWorkNormalizeEmail_(payload.userEmail || auth.email);
  const targetUser = qltdWorkFindActiveUserByEmail_(targetEmail);
  const meta = {
    email: auth.email,
    targetEmail: targetEmail,
    projectCode: contextResult.projectCode,
    deptCode: contextResult.deptCode,
    weekCode: weekCode,
    role: role
  };
  if (!targetUser) {
    return {
      error: qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'USER_NOT_FOUND', 'Report user not found or inactive.', meta, contextResult.warnings)
    };
  }
  if (targetEmail !== auth.email && !qltdWorkIsAdminScope_(auth.user)) {
    return {
      error: qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'ACCESS_DENIED', 'User can only write own weekly reports.', meta, contextResult.warnings)
    };
  }
  if (!qltdWorkIsAdminScope_(auth.user) && !qltdWorkSameDept_(auth.user, contextResult.deptCode)) {
    return {
      error: qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'ACCESS_DENIED', 'User can only write weekly reports for own department.', meta, contextResult.warnings)
    };
  }
  if (qltdWorkNormalizeCode_(targetUser.deptCode) !== qltdWorkNormalizeCode_(contextResult.deptCode)) {
    return {
      error: qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'USER_DEPT_MISMATCH', 'Report user DeptCode does not match report DeptCode.', meta, contextResult.warnings)
    };
  }

  return {
    project: contextResult.project,
    dept: contextResult.dept,
    projectCode: contextResult.projectCode,
    deptCode: contextResult.deptCode,
    userEmail: targetEmail,
    user: targetUser,
    weekCode: weekCode,
    warnings: contextResult.warnings || [],
    error: null
  };
}

function qltdWeeklyUpsertWithLock_(action, payload, auth, scope, targetStatus) {
  const meta = {
    email: auth.email,
    projectCode: scope.projectCode,
    deptCode: scope.deptCode,
    userEmail: scope.userEmail,
    weekCode: scope.weekCode
  };
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'WRITE_LOCK_TIMEOUT', 'Cannot acquire weekly report write lock.', meta, scope.warnings);
    }

    const readResult = qltdWeeklyReadReports_();
    const existing = qltdWeeklyFindReportByKey_(readResult.reports, scope.projectCode, scope.deptCode, scope.userEmail, scope.weekCode);
    const currentStatus = existing ? existing.status : '';
    if (targetStatus === 'DRAFT' && ['SUBMITTED', 'APPROVED'].indexOf(currentStatus) !== -1) {
      return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'INVALID_STATUS_TRANSITION', 'Cannot save draft over submitted or approved report.', Object.assign({
        currentStatus: currentStatus
      }, meta), readResult.warnings);
    }
    if (targetStatus === 'SUBMITTED' && currentStatus === 'APPROVED') {
      return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'INVALID_STATUS_TRANSITION', 'Cannot submit an approved report.', Object.assign({
        currentStatus: currentStatus
      }, meta), readResult.warnings);
    }

    const now = qltdWorkNowIso_();
    const base = existing ? Object.assign({}, existing.rawObject) : {};
    const rowObject = qltdWeeklyBuildReportRowObject_(payload, scope, base, targetStatus, now);
    const rowNumber = existing ? existing.rowNumber : Math.max(readResult.sheet.getLastRow() + 1, 2);
    qltdWeeklyWriteReportRow_(readResult.sheet, rowNumber, rowObject);

    return qltdWorkOk_(QLTD_WEEKLY_REPORT_SOURCE, action, {
      report: qltdWeeklyNormalizeReportObject_(rowObject),
      upsertKey: qltdWeeklyBuildReportKey_(scope.projectCode, scope.deptCode, scope.userEmail, scope.weekCode),
      inserted: !existing,
      duplicatePrevented: !!existing
    }, readResult.warnings.concat(scope.warnings || []), meta);
  } catch (error) {
    return qltdWorkError_(QLTD_WEEKLY_REPORT_SOURCE, action, 'WRITE_ERROR', qltdBudgetSafeErrorMessage_(error), meta, scope.warnings);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdWeeklyBuildReportRowObject_(payload, scope, base, status, now) {
  const reportId = String(base.ReportId || '').trim() || qltdWeeklyGenerateReportId_(scope.projectCode, scope.deptCode, scope.userEmail, scope.weekCode);
  const rowObject = Object.assign({}, base, {
    ReportId: reportId,
    ProjectCode: scope.projectCode,
    DeptCode: scope.deptCode,
    UserEmail: scope.userEmail,
    WeekCode: scope.weekCode,
    ThisWeekResult: qltdWeeklyPickPayload_(payload, 'thisWeekResult', base.ThisWeekResult),
    NextWeekPlan: qltdWeeklyPickPayload_(payload, 'nextWeekPlan', base.NextWeekPlan),
    Issue: qltdWeeklyPickPayload_(payload, 'issue', base.Issue),
    Recommendation: qltdWeeklyPickPayload_(payload, 'recommendation', base.Recommendation),
    TaskCodes: qltdWeeklyNormalizeTaskCodes_(qltdWeeklyPickPayload_(payload, 'taskCodes', base.TaskCodes)),
    Status: status,
    UpdatedAt: now,
    CreatedAt: String(base.CreatedAt || '').trim() || now
  });

  if (status === 'SUBMITTED') {
    rowObject.SubmittedAt = now;
    rowObject.ReviewedBy = '';
    rowObject.ReviewedAt = '';
    rowObject.ReviewNote = '';
  } else if (status === 'DRAFT') {
    rowObject.SubmittedAt = '';
  }

  return rowObject;
}

function qltdWeeklyPickPayload_(payload, key, fallback) {
  if (Object.prototype.hasOwnProperty.call(payload || {}, key)) return payload[key];
  return fallback || '';
}

function qltdWeeklyNormalizeTaskCodes_(value) {
  if (Object.prototype.toString.call(value) === '[object Array]') {
    return value.map(function(item) {
      return String(item || '').trim();
    }).filter(function(item) {
      return !!item;
    }).join('; ');
  }
  return String(value || '').trim();
}

function qltdWeeklyEnsureSheet_() {
  const ss = getCurrentSpreadsheet_();
  let sheet = ss.getSheetByName(QLTD_WEEKLY_REPORT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(QLTD_WEEKLY_REPORT_SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, QLTD_WEEKLY_REPORT_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  const mismatch = QLTD_WEEKLY_REPORT_HEADERS.some(function(header, index) {
    return currentHeaders[index] !== header;
  });
  if (mismatch) {
    headerRange.setValues([QLTD_WEEKLY_REPORT_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function qltdWeeklyReadReports_() {
  const sheet = qltdWeeklyEnsureSheet_();
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, 1);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_WEEKLY_REPORT_HEADERS);
  const warnings = [];
  if (missingHeaders.length) {
    warnings.push(qltdWorkWarning_('REQUIRED_HEADER_MISSING', 'WEEKLY_REPORTS is missing required headers.', {
      missingHeaders: missingHeaders
    }));
  }
  return {
    sheet: sheet,
    parsed: parsed,
    reports: parsed.rows.map(function(item) {
      return qltdWeeklyRowToReport_(item, parsed.headerMap);
    }).filter(function(report) {
      return !!report.projectCode && !!report.deptCode && !!report.userEmail && !!report.weekCode;
    }),
    warnings: warnings
  };
}

function qltdWeeklyRowToReport_(item, headerMap) {
  const row = item.raw;
  const rawObject = {};
  QLTD_WEEKLY_REPORT_HEADERS.forEach(function(header) {
    rawObject[header] = qltdWeeklyCellText_(qltdBudgetGetCell_(row, headerMap, header, ''));
  });

  return Object.assign(qltdWeeklyNormalizeReportObject_(rawObject), {
    rowNumber: item.rowNumber,
    rawObject: rawObject
  });
}

function qltdWeeklyNormalizeReportObject_(object) {
  return {
    reportId: String(object.ReportId || '').trim(),
    projectCode: qltdWorkNormalizeCode_(object.ProjectCode),
    deptCode: qltdWorkNormalizeCode_(object.DeptCode),
    userEmail: qltdWorkNormalizeEmail_(object.UserEmail),
    weekCode: qltdWorkNormalizeWeekCode_(object.WeekCode),
    thisWeekResult: String(object.ThisWeekResult || ''),
    nextWeekPlan: String(object.NextWeekPlan || ''),
    issue: String(object.Issue || ''),
    recommendation: String(object.Recommendation || ''),
    taskCodes: String(object.TaskCodes || ''),
    status: qltdWorkNormalizeReportStatus_(object.Status || 'DRAFT'),
    submittedAt: String(object.SubmittedAt || ''),
    reviewedBy: qltdWorkNormalizeEmail_(object.ReviewedBy),
    reviewedAt: String(object.ReviewedAt || ''),
    reviewNote: String(object.ReviewNote || ''),
    updatedAt: String(object.UpdatedAt || ''),
    createdAt: String(object.CreatedAt || '')
  };
}

function qltdWeeklyPublicReport_(report) {
  return {
    reportId: report.reportId,
    projectCode: report.projectCode,
    deptCode: report.deptCode,
    userEmail: report.userEmail,
    weekCode: report.weekCode,
    thisWeekResult: report.thisWeekResult,
    nextWeekPlan: report.nextWeekPlan,
    issue: report.issue,
    recommendation: report.recommendation,
    taskCodes: report.taskCodes,
    status: report.status,
    submittedAt: report.submittedAt,
    reviewedBy: report.reviewedBy,
    reviewedAt: report.reviewedAt,
    reviewNote: report.reviewNote,
    updatedAt: report.updatedAt,
    createdAt: report.createdAt
  };
}

function qltdWeeklyWriteReportRow_(sheet, rowNumber, rowObject) {
  const values = QLTD_WEEKLY_REPORT_HEADERS.map(function(header) {
    return Object.prototype.hasOwnProperty.call(rowObject || {}, header) ? rowObject[header] : '';
  });
  sheet.getRange(rowNumber, 1, 1, QLTD_WEEKLY_REPORT_HEADERS.length).setValues([values]);
}

function qltdWeeklyFindReportByKey_(reports, projectCode, deptCode, userEmail, weekCode) {
  const key = qltdWeeklyBuildReportKey_(projectCode, deptCode, userEmail, weekCode);
  for (let index = 0; index < (reports || []).length; index += 1) {
    if (qltdWeeklyBuildReportKey_(reports[index].projectCode, reports[index].deptCode, reports[index].userEmail, reports[index].weekCode) === key) {
      return reports[index];
    }
  }
  return null;
}

function qltdWeeklyBuildReportKey_(projectCode, deptCode, userEmail, weekCode) {
  return [
    qltdWorkNormalizeCode_(projectCode),
    qltdWorkNormalizeCode_(deptCode),
    qltdWorkNormalizeEmail_(userEmail),
    qltdWorkNormalizeWeekCode_(weekCode)
  ].join('|');
}

function qltdWeeklyBuildReportFilters_(params) {
  return {
    projectCode: qltdWorkNormalizeCode_(params.projectCode),
    deptCode: qltdWorkNormalizeCode_(params.deptCode),
    userEmail: qltdWorkNormalizeEmail_(params.userEmail),
    weekCode: qltdWorkNormalizeWeekCode_(params.weekCode),
    status: qltdWorkNormalizeReportStatus_(params.status)
  };
}

function qltdWeeklyReportMatchesFilters_(report, filters) {
  if (filters.projectCode && report.projectCode !== filters.projectCode) return false;
  if (filters.deptCode && report.deptCode !== filters.deptCode) return false;
  if (filters.userEmail && report.userEmail !== filters.userEmail) return false;
  if (filters.weekCode && report.weekCode !== filters.weekCode) return false;
  if (filters.status && report.status !== filters.status) return false;
  return true;
}

function qltdWeeklyGenerateReportId_(projectCode, deptCode, userEmail, weekCode) {
  const base = [projectCode, deptCode, userEmail, weekCode].join('_').replace(/[^A-Za-z0-9_-]/g, '_');
  return 'WEEKLY_' + base + '_' + Utilities.getUuid();
}

function qltdWeeklyCellText_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value);
}
