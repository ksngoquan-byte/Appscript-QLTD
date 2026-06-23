const QLTD_WORK_TASK_SOURCE = 'work_task_mvp_v1';
const QLTD_WEEKLY_REPORT_SOURCE = 'weekly_report_mvp_v1';
const QLTD_WORK_WRITE_LOCK_TIMEOUT_MS = 10000;

function qltdWorkResponse_(source, success, action, data, warnings, errors, meta) {
  return {
    success: !!success,
    apiStatus: success ? 'OK' : 'ERROR',
    source: source || QLTD_WORK_TASK_SOURCE,
    data: success ? (data || {}) : (data === undefined ? null : data),
    warnings: warnings || [],
    errors: errors || [],
    meta: Object.assign({
      action: action || '',
      generatedAt: qltdWorkNowIso_()
    }, meta || {})
  };
}

function qltdWorkOk_(source, action, data, warnings, meta) {
  return qltdWorkResponse_(source, true, action, data || {}, warnings || [], [], meta || {});
}

function qltdWorkError_(source, action, code, message, meta, warnings, extra) {
  return qltdWorkResponse_(source, false, action, null, warnings || [], [Object.assign({
    code: code,
    message: message || code
  }, extra || {})], meta || {});
}

function qltdWorkWarning_(code, message, extra) {
  return Object.assign({
    code: code,
    message: message || code
  }, extra || {});
}

function qltdWorkNowIso_() {
  return new Date().toISOString();
}

function qltdWorkNormalizeCode_(value) {
  return qltdBudgetNormalizeCode_(value);
}

function qltdWorkNormalizeEmail_(value) {
  return qltdUsersNormalizeEmail_(value);
}

function qltdWorkNormalizeRole_(value) {
  return qltdUsersNormalizeRole_(value);
}

function qltdWorkBuildTaskKey_(projectCode, deptCode, masterTaskCode) {
  return [
    qltdWorkNormalizeCode_(projectCode),
    qltdWorkNormalizeCode_(deptCode),
    String(masterTaskCode || '').trim()
  ].join('|');
}

function qltdWorkAuthUser_(emailValue, action, source, meta) {
  const email = qltdWorkNormalizeEmail_(emailValue);
  const nextMeta = Object.assign({}, meta || {}, {
    email: email || 'anonymous'
  });

  if (!email) {
    return {
      user: null,
      email: '',
      error: qltdWorkError_(source, action, 'EMAIL_REQUIRED', 'email is required.', nextMeta)
    };
  }

  const user = qltdUsersGetByEmail_(email);
  if (!user) {
    return {
      user: null,
      email: email,
      error: qltdWorkError_(source, action, 'USER_NOT_FOUND', 'User not found.', nextMeta)
    };
  }

  if (!qltdUsersIsValidStatus_(user.status) || user.status !== 'ACTIVE') {
    return {
      user: null,
      email: email,
      error: qltdWorkError_(source, action, 'USER_INACTIVE', 'User is not active.', nextMeta)
    };
  }

  if (!qltdUsersIsValidRole_(user.role)) {
    return {
      user: null,
      email: email,
      error: qltdWorkError_(source, action, 'INVALID_ROLE', 'User role is invalid.', nextMeta)
    };
  }

  return {
    user: user,
    email: email,
    error: null
  };
}

function qltdWorkIsAdminScope_(user) {
  return ['ADMIN', 'PMO'].indexOf(qltdWorkNormalizeRole_(user && user.role)) !== -1;
}

function qltdWorkIsEditorScope_(user) {
  return qltdWorkNormalizeRole_(user && user.role) === 'EDITOR';
}

function qltdWorkSameDept_(user, deptCode, dept) {
  if (!user) return false;
  const userMasterDeptCode = qltdMasterDeptCanonicalCode_(user.deptCode);
  const targetMasterDeptCode = dept
    ? qltdMasterDeptCanonicalCode_(dept.masterDeptCode || dept.deptCode || dept.projectUnitCode)
    : qltdMasterDeptCanonicalCode_(deptCode);
  if (userMasterDeptCode && targetMasterDeptCode) return userMasterDeptCode === targetMasterDeptCode;
  return qltdWorkNormalizeCode_(user.deptCode) === qltdWorkNormalizeCode_(deptCode);
}

function qltdWorkCanManageDept_(user, deptCode, dept) {
  if (qltdWorkIsAdminScope_(user)) return true;
  return qltdWorkIsEditorScope_(user) && qltdWorkSameDept_(user, deptCode, dept);
}

function qltdWorkCanReadDept_(user, deptCode, dept) {
  const role = qltdWorkNormalizeRole_(user && user.role);
  if (qltdWorkIsAdminScope_(user)) return true;
  if (role === 'EDITOR' || role === 'REPORTER' || role === 'VIEWER') {
    return qltdWorkSameDept_(user, deptCode, dept);
  }
  return false;
}

function qltdWorkCanWriteTask_(user, deptCode, dept) {
  return qltdWorkCanManageDept_(user, deptCode, dept);
}

function qltdWorkCanReviewWeekly_(user, deptCode, dept) {
  if (qltdWorkIsAdminScope_(user)) return true;
  return qltdWorkIsEditorScope_(user) && qltdWorkSameDept_(user, deptCode, dept);
}

function qltdWorkResolveProjectDept_(action, params, source, options) {
  const opts = options || {};
  const projectValidation = qltdBudgetValidateProjectCode_(action, params && params.projectCode);
  if (projectValidation.error) {
    return {
      error: qltdWorkError_(source, action, 'PROJECT_CODE_REQUIRED', 'projectCode is required.', opts.meta || {})
    };
  }

  const deptValidation = qltdBudgetValidateDeptCode_(action, params && params.deptCode, {
    projectCode: projectValidation.value
  });
  if (deptValidation.error) {
    return {
      error: qltdWorkError_(source, action, 'DEPT_CODE_REQUIRED', 'deptCode is required.', {
        projectCode: projectValidation.value
      })
    };
  }

  const projectCode = projectValidation.value;
  const requestedDeptCode = deptValidation.value;
  const meta = Object.assign({}, opts.meta || {}, {
    projectCode: projectCode,
    deptCode: requestedDeptCode
  });

  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) {
    return {
      error: qltdWorkError_(source, action, 'PROJECTS_UNAVAILABLE', 'Cannot read Projects.', meta, projectsResult.warnings, {
        upstreamErrors: projectsResult.error.errors || []
      })
    };
  }

  const project = qltdBudgetFindProjectByCode_(projectsResult.projects, projectCode);
  if (!project || project.status !== 'ACTIVE') {
    return {
      error: qltdWorkError_(source, action, 'PROJECT_NOT_FOUND', 'Project not found or inactive.', meta, projectsResult.warnings)
    };
  }

  if (opts.requireDeptSpreadsheet && !project.deptSpreadsheetId) {
    return {
      error: qltdWorkError_(source, action, 'DEPT_SPREADSHEET_ID_MISSING', 'Project has no DeptSpreadsheetId.', meta, projectsResult.warnings)
    };
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) {
    return {
      error: qltdWorkError_(source, action, 'PROJECT_DEPTS_UNAVAILABLE', 'Cannot read Project_Depts.', meta, projectsResult.warnings.concat(deptsResult.warnings || []), {
        upstreamErrors: deptsResult.error.errors || []
      })
    };
  }

  const projectDepts = deptsResult.departments.filter(function(dept) {
    return dept.projectCode === projectCode && dept.status === 'ACTIVE';
  });
  let dept = qltdBudgetFindProjectDept_(projectDepts, requestedDeptCode);
  if (!dept && opts.actorUser && !qltdWorkIsAdminScope_(opts.actorUser)) {
    const actorMasterDeptCode = qltdMasterDeptCanonicalCode_(opts.actorUser.deptCode);
    const requestedMasterDeptCode = qltdMasterDeptCanonicalCode_(requestedDeptCode);
    if (actorMasterDeptCode && (!requestedMasterDeptCode || requestedMasterDeptCode === actorMasterDeptCode)) {
      dept = qltdBudgetFindProjectDeptByMasterDeptCode_(projectDepts, actorMasterDeptCode);
    }
  }
  if (!dept) {
    return {
      error: qltdWorkError_(source, action, 'PROJECT_DEPT_NOT_ASSIGNED', 'Phong/ban cua ban chua duoc phan cong tham gia du an nay.', meta, projectsResult.warnings.concat(deptsResult.warnings || []))
    };
  }

  return {
    project: project,
    dept: dept,
    projectCode: projectCode,
    deptCode: qltdWorkNormalizeCode_(dept.deptCode || requestedDeptCode),
    requestedDeptCode: requestedDeptCode,
    warnings: projectsResult.warnings.concat(deptsResult.warnings || []),
    error: null
  };
}

function qltdWorkListActiveProjectDepts_(projectCode) {
  const normalizedProjectCode = qltdWorkNormalizeCode_(projectCode);
  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) {
    return {
      departments: [],
      warnings: deptsResult.warnings || [],
      error: deptsResult.error
    };
  }
  return {
    departments: deptsResult.departments.filter(function(dept) {
      return dept.projectCode === normalizedProjectCode && dept.status === 'ACTIVE';
    }),
    warnings: deptsResult.warnings || [],
    error: null
  };
}

function qltdWorkExtractEmails_(value) {
  const text = String(value || '');
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
  const seen = {};
  return matches.map(function(email) {
    return qltdWorkNormalizeEmail_(email);
  }).filter(function(email) {
    if (!email || seen[email]) return false;
    seen[email] = true;
    return true;
  });
}

function qltdWorkSplitAssigneeNames_(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  return text.split(/[;,\n\r|]+/).map(function(item) {
    return String(item || '').replace(/[<>]/g, '').trim();
  }).filter(function(item) {
    return !!item;
  });
}

function qltdWorkListUsers_() {
  const sheet = qltdUsersEnsureSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, QLTD_USERS_HEADERS.length).getValues();
  return values.map(function(row, index) {
    return {
      rowIndex: index + 2,
      email: qltdWorkNormalizeEmail_(row[0]),
      displayName: String(row[1] || '').trim(),
      role: qltdWorkNormalizeRole_(row[2]),
      status: qltdUsersNormalizeStatus_(row[3]),
      deptCode: String(row[4] || '').trim(),
      deptName: String(row[5] || '').trim()
    };
  }).filter(function(user) {
    return !!user.email;
  });
}

function qltdWorkUserSummary_(user) {
  if (!user) return null;
  return {
    email: qltdWorkNormalizeEmail_(user.email),
    displayName: String(user.displayName || '').trim(),
    deptCode: String(user.deptCode || '').trim(),
    deptName: String(user.deptName || '').trim(),
    role: qltdWorkNormalizeRole_(user.role)
  };
}

function qltdWorkAssigneeDisplay_(user) {
  if (!user) return '';
  const email = qltdWorkNormalizeEmail_(user.email);
  const name = String(user.displayName || '').trim();
  return name ? name + ' <' + email + '>' : email;
}

function qltdWorkFindActiveUserByEmail_(email) {
  const user = qltdUsersGetByEmail_(email);
  if (!user || user.status !== 'ACTIVE') return null;
  return user;
}

function qltdWorkFindActiveUsersByDisplayNameDept_(displayName, deptCode) {
  const targetName = String(displayName || '').trim();
  const normalizedDeptCode = qltdMasterDeptCanonicalCode_(deptCode);
  if (!targetName || !normalizedDeptCode) return [];

  return qltdWorkListUsers_().filter(function(user) {
    return (
      user.displayName === targetName &&
      user.status === 'ACTIVE' &&
      qltdMasterDeptCanonicalCode_(user.deptCode) === normalizedDeptCode
    );
  });
}

function qltdWorkResolveAssignees_(value, deptCode) {
  const raw = String(value || '').trim();
  if (!raw) {
    return {
      raw: raw,
      users: [],
      unresolved: [],
      canonicalText: '',
      ok: true
    };
  }

  const users = [];
  const unresolved = [];
  const seenEmails = {};
  const emails = qltdWorkExtractEmails_(raw);

  if (emails.length) {
    emails.forEach(function(email) {
      const user = qltdWorkFindActiveUserByEmail_(email);
      if (!user) {
        unresolved.push(email);
        return;
      }
      if (!seenEmails[user.email]) {
        seenEmails[user.email] = true;
        users.push(user);
      }
    });
  } else {
    qltdWorkSplitAssigneeNames_(raw).forEach(function(name) {
      const matches = qltdWorkFindActiveUsersByDisplayNameDept_(name, deptCode);
      if (matches.length !== 1) {
        unresolved.push(name);
        return;
      }
      const user = matches[0];
      if (!seenEmails[user.email]) {
        seenEmails[user.email] = true;
        users.push(user);
      }
    });
  }

  return {
    raw: raw,
    users: users,
    unresolved: unresolved,
    canonicalText: users.map(qltdWorkAssigneeDisplay_).join('; '),
    ok: unresolved.length === 0
  };
}

function qltdWorkAssigneeResolutionError_(source, action, fieldName, resolution, meta, warnings) {
  return qltdWorkError_(source, action, 'ASSIGNEE_UNRESOLVED', 'Cannot resolve assignee.', meta, warnings || [], {
    field: fieldName,
    unresolved: resolution && resolution.unresolved || [],
    raw: resolution && resolution.raw || ''
  });
}

function qltdWorkFindAssigneeDeptMismatches_(resolution, deptCode) {
  const normalizedDeptCode = qltdMasterDeptCanonicalCode_(deptCode);
  return (resolution && resolution.users || []).filter(function(user) {
    return qltdMasterDeptCanonicalCode_(user.deptCode) !== normalizedDeptCode;
  });
}

function qltdWorkAssigneeDeptMismatchError_(source, action, fieldName, resolution, deptCode, meta, warnings) {
  const mismatches = qltdWorkFindAssigneeDeptMismatches_(resolution, deptCode);
  return qltdWorkError_(source, action, 'ASSIGNEE_DEPT_MISMATCH', 'Assignee DeptCode does not match task DeptCode.', meta, warnings || [], {
    field: fieldName,
    deptCode: qltdWorkNormalizeCode_(deptCode),
    assignees: mismatches.map(qltdWorkUserSummary_),
    raw: resolution && resolution.raw || ''
  });
}

function qltdWorkUserMatchesAssignees_(email, resolution) {
  const normalizedEmail = qltdWorkNormalizeEmail_(email);
  return (resolution && resolution.users || []).some(function(user) {
    return qltdWorkNormalizeEmail_(user.email) === normalizedEmail;
  });
}

function qltdWorkNormalizeTaskCode_(value) {
  return String(value || '').trim();
}

function qltdWorkNormalizeWeekCode_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdWorkNormalizeReportStatus_(value) {
  return String(value || '').trim().toUpperCase();
}
