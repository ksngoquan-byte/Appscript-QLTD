const QLTD_USER_PROJECT_DEPT_ACCESS_SHEET = 'User_Project_Dept_Access';
const QLTD_USER_PROJECT_DEPT_ACCESS_SPREADSHEET_ID = '1ZAZwSjGOvKEp8iLCqLsEiJyJSFBR-jeru0RL25Q4xMM';
const QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION = {
  UPDATE_PROGRESS: 'UPDATE_PROGRESS'
};
const QLTD_USER_PROJECT_DEPT_ACCESS_HEADERS = [
  'Email',
  'ProjectCode',
  'DeptCode',
  'PermissionCode',
  'Status',
  'EffectiveFrom',
  'EffectiveTo',
  'GrantedBy',
  'GrantedAt',
  'Note'
];
const QLTD_USER_PROJECT_DEPT_ACCESS_DELEGATED_ACTIONS = {
  work_updatetask: true,
  work_updatedetailtask: true,
  weekly_taskupdates_save: true,
  weekly_savedraft: true,
  weekly_submit: true
};
const QLTD_USER_PROJECT_DEPT_ACCESS_CACHE_SECONDS = 60;
const QLTD_USER_PROJECT_DEPT_ACCESS_CACHE_VERSION = 'v1';

function qltdUserProjectDeptAccessCheckSchema_() {
  const spreadsheet = getCurrentSpreadsheet_();
  const spreadsheetId = String(spreadsheet.getId() || '').trim();
  if (spreadsheetId !== QLTD_USER_PROJECT_DEPT_ACCESS_SPREADSHEET_ID) {
    return {
      success: false,
      exists: false,
      valid: false,
      sheetName: QLTD_USER_PROJECT_DEPT_ACCESS_SHEET,
      expectedSpreadsheetId: QLTD_USER_PROJECT_DEPT_ACCESS_SPREADSHEET_ID,
      actualSpreadsheetId: spreadsheetId,
      expectedHeaders: QLTD_USER_PROJECT_DEPT_ACCESS_HEADERS.slice(),
      actualHeaders: [],
      warnings: [{
        code: 'USER_PROJECT_DEPT_ACCESS_SPREADSHEET_MISMATCH',
        message: 'Delegated access is disabled because the current spreadsheet is not Central Data.'
      }]
    };
  }
  const sheet = spreadsheet.getSheetByName(QLTD_USER_PROJECT_DEPT_ACCESS_SHEET);
  if (!sheet) {
    return {
      success: true,
      exists: false,
      valid: false,
      sheetName: QLTD_USER_PROJECT_DEPT_ACCESS_SHEET,
      expectedHeaders: QLTD_USER_PROJECT_DEPT_ACCESS_HEADERS.slice(),
      actualHeaders: [],
      warnings: [{
        code: 'USER_PROJECT_DEPT_ACCESS_SHEET_MISSING',
        message: 'Delegated access is not configured; home-department permissions remain available.'
      }]
    };
  }

  const lastColumn = Math.max(sheet.getLastColumn(), QLTD_USER_PROJECT_DEPT_ACCESS_HEADERS.length);
  const actualHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  const mismatches = QLTD_USER_PROJECT_DEPT_ACCESS_HEADERS.reduce(function(items, expected, index) {
    if (actualHeaders[index] !== expected) {
      items.push({ column: index + 1, expected: expected, actual: actualHeaders[index] || '' });
    }
    return items;
  }, []);
  const extraHeaders = actualHeaders.slice(QLTD_USER_PROJECT_DEPT_ACCESS_HEADERS.length).filter(function(value) {
    return !!value;
  });

  return {
    success: true,
    exists: true,
    valid: !mismatches.length && !extraHeaders.length,
    sheetName: sheet.getName(),
    columnCount: QLTD_USER_PROJECT_DEPT_ACCESS_HEADERS.length,
    expectedHeaders: QLTD_USER_PROJECT_DEPT_ACCESS_HEADERS.slice(),
    actualHeaders: actualHeaders,
    mismatches: mismatches,
    extraHeaders: extraHeaders,
    warnings: !mismatches.length && !extraHeaders.length ? [] : [{
      code: 'USER_PROJECT_DEPT_ACCESS_HEADER_MISMATCH',
      message: 'Delegated access is disabled because the configuration header does not match.'
    }]
  };
}

function qltdUserProjectDeptAccessSetupDryRun_() {
  const schema = qltdUserProjectDeptAccessCheckSchema_();
  return {
    success: true,
    dryRun: true,
    applyRequired: !schema.exists || !schema.valid,
    liveApplied: false,
    spreadsheetId: getCurrentSpreadsheet_().getId(),
    sheetName: QLTD_USER_PROJECT_DEPT_ACCESS_SHEET,
    columnCount: QLTD_USER_PROJECT_DEPT_ACCESS_HEADERS.length,
    headers: QLTD_USER_PROJECT_DEPT_ACCESS_HEADERS.slice(),
    proposedRows: [[
      'thipt.entiz@gmail.com',
      '37-5.HL1',
      'BQLDA',
      QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION.UPDATE_PROGRESS,
      'ACTIVE',
      '',
      '',
      '<granted-by>',
      '<granted-at>',
      'Ủy quyền cập nhật tiến độ BQLDA dự án C1 Hưng Lộc'
    ]],
    missingSheetBehavior: {
      homeDepartmentAccess: 'UNCHANGED',
      delegatedAccess: 'DENY',
      failOpen: false
    },
    rollback: ['Set Status = INACTIVE', 'Delete the delegated access row'],
    schema: schema
  };
}

function qltdUserProjectDeptAccessNormalizePermission_(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION, normalized)
    ? normalized
    : '';
}

function qltdUserProjectDeptAccessNormalizeProjectCode_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdUserProjectDeptAccessNormalizeDeptCode_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdUserProjectDeptAccessNormalizeStatus_(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'ACTIVE' || normalized === 'INACTIVE' ? normalized : '';
}

function qltdUserProjectDeptAccessDateBoundary_(value, endOfDay) {
  if (value === '' || value === null || value === undefined) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const text = String(value || '').trim();
  if (!text) return null;
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function qltdUserProjectDeptAccessIsActive_(record, nowValue) {
  if (!record || qltdUserProjectDeptAccessNormalizeStatus_(record.status) !== 'ACTIVE') return false;
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || new Date());
  if (isNaN(now.getTime())) return false;
  const effectiveFrom = qltdUserProjectDeptAccessDateBoundary_(record.effectiveFrom, false);
  const effectiveTo = qltdUserProjectDeptAccessDateBoundary_(record.effectiveTo, true);
  if (record.effectiveFrom && !effectiveFrom) return false;
  if (record.effectiveTo && !effectiveTo) return false;
  if (effectiveFrom && now.getTime() < effectiveFrom.getTime()) return false;
  if (effectiveTo && now.getTime() > effectiveTo.getTime()) return false;
  return true;
}

function qltdUserProjectDeptAccessCacheKey_(email) {
  return [
    'QLTD_UPDA',
    QLTD_USER_PROJECT_DEPT_ACCESS_CACHE_VERSION,
    qltdUsersNormalizeEmail_(email)
  ].join(':');
}

function qltdUserProjectDeptAccessListByEmail_(email) {
  const normalizedEmail = qltdUsersNormalizeEmail_(email);
  if (!normalizedEmail) return { records: [], warnings: [], schemaAvailable: false };

  const schema = qltdUserProjectDeptAccessCheckSchema_();
  if (!schema.exists || !schema.valid) {
    console.warn(JSON.stringify({
      action: 'USER_PROJECT_DEPT_ACCESS_READ',
      email: normalizedEmail,
      code: schema.exists ? 'USER_PROJECT_DEPT_ACCESS_HEADER_MISMATCH' : 'USER_PROJECT_DEPT_ACCESS_SHEET_MISSING'
    }));
    return { records: [], warnings: schema.warnings || [], schemaAvailable: false };
  }

  const cache = typeof CacheService !== 'undefined' && CacheService.getScriptCache
    ? CacheService.getScriptCache()
    : null;
  const cacheKey = qltdUserProjectDeptAccessCacheKey_(normalizedEmail);
  if (cache) {
    try {
      const cached = cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (cacheReadError) {
      console.warn('USER_PROJECT_DEPT_ACCESS_CACHE_READ_FAILED', cacheReadError);
    }
  }

  const sheet = getCurrentSpreadsheet_().getSheetByName(QLTD_USER_PROJECT_DEPT_ACCESS_SHEET);
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, QLTD_USER_PROJECT_DEPT_ACCESS_HEADERS.length).getValues()
    : [];
  const records = rows.map(function(row, index) {
    return {
      rowNumber: index + 2,
      email: qltdUsersNormalizeEmail_(row[0]),
      projectCode: qltdUserProjectDeptAccessNormalizeProjectCode_(row[1]),
      deptCode: qltdUserProjectDeptAccessNormalizeDeptCode_(row[2]),
      permissionCode: qltdUserProjectDeptAccessNormalizePermission_(row[3]),
      status: qltdUserProjectDeptAccessNormalizeStatus_(row[4]),
      effectiveFrom: row[5] || '',
      effectiveTo: row[6] || '',
      grantedBy: qltdUsersNormalizeEmail_(row[7]),
      grantedAt: row[8] || '',
      note: String(row[9] || '').trim()
    };
  }).filter(function(record) {
    return record.email === normalizedEmail && !!record.projectCode && !!record.deptCode && !!record.permissionCode;
  });
  const result = { records: records, warnings: [], schemaAvailable: true };

  if (cache) {
    try {
      cache.put(cacheKey, JSON.stringify(result), QLTD_USER_PROJECT_DEPT_ACCESS_CACHE_SECONDS);
    } catch (cacheWriteError) {
      console.warn('USER_PROJECT_DEPT_ACCESS_CACHE_WRITE_FAILED', cacheWriteError);
    }
  }
  return result;
}

function qltdUserProjectDeptAccessHasPermission_(email, projectCode, deptCode, permissionCode, nowValue) {
  const normalizedEmail = qltdUsersNormalizeEmail_(email);
  const normalizedProject = qltdUserProjectDeptAccessNormalizeProjectCode_(projectCode);
  const normalizedDept = qltdUserProjectDeptAccessNormalizeDeptCode_(deptCode);
  const normalizedPermission = qltdUserProjectDeptAccessNormalizePermission_(permissionCode);
  if (!normalizedEmail || !normalizedProject || !normalizedDept || !normalizedPermission) return false;

  const result = qltdUserProjectDeptAccessListByEmail_(normalizedEmail);
  return result.records.some(function(record) {
    return record.projectCode === normalizedProject &&
      record.deptCode === normalizedDept &&
      record.permissionCode === normalizedPermission &&
      qltdUserProjectDeptAccessIsActive_(record, nowValue);
  });
}

function qltdUserProjectDeptAccessResolveEffectiveScopes_(email, permissionCode, nowValue) {
  const normalizedPermission = qltdUserProjectDeptAccessNormalizePermission_(permissionCode);
  if (!normalizedPermission) return [];
  return qltdUserProjectDeptAccessListByEmail_(email).records.filter(function(record) {
    return record.permissionCode === normalizedPermission && qltdUserProjectDeptAccessIsActive_(record, nowValue);
  }).map(function(record) {
    return {
      projectCode: record.projectCode,
      deptCode: record.deptCode,
      permissionCode: record.permissionCode,
      permissionSource: 'DELEGATED_ACCESS'
    };
  });
}

function qltdUserProjectDeptAccessActionAllowed_(action) {
  return !!QLTD_USER_PROJECT_DEPT_ACCESS_DELEGATED_ACTIONS[String(action || '').trim().toLowerCase()];
}

function qltdResolveDeptProgressPermission_(user, projectCode, deptCode, dept, action) {
  const normalizedProject = qltdUserProjectDeptAccessNormalizeProjectCode_(projectCode);
  const normalizedDept = qltdUserProjectDeptAccessNormalizeDeptCode_(dept && dept.deptCode || deptCode);
  const role = qltdUsersNormalizeRole_(user && user.role);
  if (!user || user.status !== 'ACTIVE' || !normalizedProject || !normalizedDept) {
    return { allowed: false, source: '', permissionCode: '', projectCode: normalizedProject, deptCode: normalizedDept };
  }
  if (role === 'ADMIN' || role === 'PMO') {
    return { allowed: true, source: 'ADMIN_SCOPE', permissionCode: '', projectCode: normalizedProject, deptCode: normalizedDept };
  }
  if (qltdWorkSameDept_(user, normalizedDept, dept)) {
    return { allowed: true, source: 'HOME_DEPT', permissionCode: '', projectCode: normalizedProject, deptCode: normalizedDept };
  }
  if (!qltdUserProjectDeptAccessActionAllowed_(action)) {
    return { allowed: false, source: '', permissionCode: '', projectCode: normalizedProject, deptCode: normalizedDept };
  }
  const allowed = qltdUserProjectDeptAccessHasPermission_(
    user.email,
    normalizedProject,
    normalizedDept,
    QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION.UPDATE_PROGRESS
  );
  return {
    allowed: allowed,
    source: allowed ? 'DELEGATED_ACCESS' : '',
    permissionCode: allowed ? QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION.UPDATE_PROGRESS : '',
    projectCode: normalizedProject,
    deptCode: normalizedDept
  };
}

function qltdCanUpdateDeptProgress_(user, projectCode, deptCode, dept, action) {
  return qltdResolveDeptProgressPermission_(user, projectCode, deptCode, dept, action).allowed;
}

function qltdCanReadProjectDept_(user, projectCode, deptCode, dept) {
  return qltdResolveDeptReadPermission_(user, projectCode, deptCode, dept).allowed;
}

function qltdResolveDeptReadPermission_(user, projectCode, deptCode, dept) {
  const normalizedProject = qltdUserProjectDeptAccessNormalizeProjectCode_(projectCode);
  const normalizedDept = qltdUserProjectDeptAccessNormalizeDeptCode_(dept && dept.deptCode || deptCode);
  if (qltdWorkCanReadDept_(user, normalizedDept, dept)) {
    return {
      allowed: true,
      source: qltdWorkIsAdminScope_(user) ? 'ADMIN_SCOPE' : 'HOME_DEPT',
      permissionCode: '',
      projectCode: normalizedProject,
      deptCode: normalizedDept
    };
  }
  const delegated = qltdUserProjectDeptAccessHasPermission_(
    user && user.email,
    normalizedProject,
    normalizedDept,
    QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION.UPDATE_PROGRESS
  );
  return {
    allowed: delegated,
    source: delegated ? 'DELEGATED_ACCESS' : '',
    permissionCode: delegated ? QLTD_USER_PROJECT_DEPT_ACCESS_PERMISSION.UPDATE_PROGRESS : '',
    projectCode: normalizedProject,
    deptCode: normalizedDept
  };
}

function qltdUserProjectDeptAccessValidateDelegatedPayload_(action, payload, decision) {
  if (!decision || decision.source !== 'DELEGATED_ACCESS') return null;
  const normalizedAction = String(action || '').trim().toLowerCase();
  const commonMeta = {
    action: true, email: true, actorEmail: true, idToken: true,
    projectCode: true, deptCode: true, requestId: true,
    _qltdPermissionSource: true, _qltdPermissionCode: true,
    _qltdActorHomeDeptCode: true, _qltdActorDisplayName: true
  };
  const allowedByAction = {
    work_updatetask: {
      masterTaskCode: true, updates: true, noteMode: true, replaceNote: true,
      confirm: true, status: true, progress: true, actualStart: true,
      actualFinish: true, updateNote: true, note: true
    },
    work_updatedetailtask: {
      detailTaskId: true, status: true, progress: true, actualStart: true,
      actualFinish: true, updateNote: true, note: true
    },
    weekly_taskupdates_save: {
      weekCode: true, periodCode: true, weekStart: true, weekEnd: true,
      itemType: true, itemId: true, taskId: true, uid: true,
      thisWeekResult: true, progressEnd: true, taskStatus: true,
      actualStart: true, actualFinish: true, actualStartEdit: true,
      actualFinishEdit: true, actualStartMode: true, actualFinishMode: true,
      issue: true, recommendation: true, confirmProgressDecrease: true,
      expectedApprovalStatus: true
    },
    weekly_savedraft: {
      userEmail: true, weekCode: true, periodCode: true, weekStart: true,
      weekEnd: true, thisWeekResult: true, issue: true, recommendation: true,
      taskCodes: true
    },
    weekly_submit: {
      userEmail: true, weekCode: true, periodCode: true, weekStart: true,
      weekEnd: true, thisWeekResult: true, issue: true, recommendation: true,
      taskCodes: true
    }
  };
  const allowed = Object.assign({}, commonMeta, allowedByAction[normalizedAction] || {});
  const forbiddenFields = Object.keys(payload || {}).filter(function(key) {
    return !allowed[key];
  });
  if (payload && payload.updates && normalizedAction === 'work_updatetask') {
    const nestedAllowed = { status: true, progress: true, actualStart: true, actualFinish: true, updateNote: true, note: true };
    forbiddenFields.push.apply(forbiddenFields, Object.keys(payload.updates).filter(function(key) {
      return !nestedAllowed[key];
    }).map(function(key) { return 'updates.' + key; }));
  }
  if (!forbiddenFields.length) {
    if (normalizedAction === 'work_updatedetailtask' && Object.prototype.hasOwnProperty.call(payload, 'updateNote')) {
      if (!Object.prototype.hasOwnProperty.call(payload, 'note')) payload.note = payload.updateNote;
      delete payload.updateNote;
    }
    return null;
  }
  return {
    code: 'DELEGATED_PROGRESS_FIELDS_FORBIDDEN',
    message: 'Delegated UPDATE_PROGRESS payload contains fields outside the allowlist.',
    forbiddenFields: forbiddenFields
  };
}

function qltdUserProjectDeptAccessLog_(details) {
  const data = details || {};
  const entry = {
    action: String(data.action || ''),
    email: qltdUsersNormalizeEmail_(data.email),
    displayName: String(data.displayName || ''),
    projectCode: qltdUserProjectDeptAccessNormalizeProjectCode_(data.projectCode),
    deptCode: qltdUserProjectDeptAccessNormalizeDeptCode_(data.deptCode),
    taskOrReportId: String(data.taskOrReportId || ''),
    periodCode: String(data.periodCode || ''),
    permissionCode: String(data.permissionCode || ''),
    permissionSource: String(data.permissionSource || ''),
    homeDeptCode: qltdUserProjectDeptAccessNormalizeDeptCode_(data.homeDeptCode),
    actingForDept: qltdUserProjectDeptAccessNormalizeDeptCode_(data.actingForDept || data.deptCode),
    timestamp: new Date().toISOString(),
    result: String(data.result || ''),
    error: String(data.error || '')
  };
  console.log(JSON.stringify(entry));
  return entry;
}
