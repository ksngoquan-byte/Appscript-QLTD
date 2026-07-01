const QLTD_FIREBASE_WEB_API_KEY_PROPERTY = 'QLTD_FIREBASE_WEB_API_KEY';
const QLTD_DEPT_SCOPE_ACTION_RULES = {
  work_assigntask: ['ADMIN', 'PMO', 'EDITOR'],
  work_updatetask: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  work_createdetailtask: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  work_updatedetailtask: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_taskupdates_save: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_masterapproval_review: ['ADMIN', 'PMO', 'EDITOR'],
  weekly_pbdetailapproval_review: ['EDITOR'],
  weekly_savedraft: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_submit: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_review: ['ADMIN', 'PMO', 'EDITOR']
};

function qltdFirebaseGetWebApiKey_() {
  return String(PropertiesService.getScriptProperties().getProperty(QLTD_FIREBASE_WEB_API_KEY_PROPERTY) || '').trim();
}

function qltdFirebaseResolveIdentity_(payload, tokenRequired) {
  const rawPayload = payload && typeof payload === 'object' ? payload : {};
  const idToken = String(rawPayload.idToken || '').trim();
  const requestedEmail = qltdUsersNormalizeEmail_(rawPayload.email);

  if (!idToken) {
    return tokenRequired
      ? qltdUsersBuildAuthError_('ID_TOKEN_REQUIRED', 'Khong xac minh duoc phien dang nhap Google. Vui long dang nhap lai.')
      : {
        success: true,
        email: requestedEmail,
        authMode: 'LEGACY_EMAIL'
      };
  }

  const firebaseApiKey = qltdFirebaseGetWebApiKey_();
  if (!firebaseApiKey) {
    return qltdUsersBuildAuthError_('FIREBASE_API_KEY_MISSING', 'Apps Script chua duoc cau hinh khoa xac minh Firebase.');
  }

  try {
    const response = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(firebaseApiKey),
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ idToken: idToken }),
        muteHttpExceptions: true
      }
    );
    const statusCode = response.getResponseCode();
    const data = JSON.parse(response.getContentText() || '{}');
    const firebaseUser = data && data.users && data.users[0];
    const verifiedEmail = qltdUsersNormalizeEmail_(firebaseUser && firebaseUser.email);
    const localId = String(firebaseUser && firebaseUser.localId || '').trim();
    const firebaseError = String(data && data.error && data.error.message || '').trim().toUpperCase();

    if (statusCode < 200 || statusCode >= 300 || !verifiedEmail || !localId) {
      const errorCode = firebaseError === 'TOKEN_EXPIRED' ? 'ID_TOKEN_EXPIRED' : 'ID_TOKEN_INVALID';
      return qltdUsersBuildAuthError_(errorCode, 'Phien dang nhap Google khong hop le hoac da het han.');
    }
    if (firebaseUser.emailVerified !== true) {
      return qltdUsersBuildAuthError_('EMAIL_NOT_VERIFIED', 'Email Google chua duoc xac minh.');
    }
    if (requestedEmail && requestedEmail !== verifiedEmail) {
      return qltdUsersBuildAuthError_('EMAIL_MISMATCH', 'Email khai bao khong khop tai khoan Google dang dang nhap.');
    }

    return {
      success: true,
      email: verifiedEmail,
      displayName: String(firebaseUser.displayName || '').trim(),
      localId: localId,
      authMode: 'FIREBASE_ID_TOKEN'
    };
  } catch (error) {
    return qltdUsersBuildAuthError_('IDENTITY_VERIFY_ERROR', 'Khong the xac minh phien dang nhap Google.', {
      detail: String(error && error.message || error)
    });
  }
}

function qltdDeptScopeAuthorizeWrite_(payload, actionValue) {
  const action = String(actionValue || '').trim().toLowerCase();
  const allowedRoles = QLTD_DEPT_SCOPE_ACTION_RULES[action];

  if (!allowedRoles) {
    return { allowed: true, response: null };
  }

  const identity = qltdFirebaseResolveIdentity_(payload, true);
  if (!identity.success) {
    return { allowed: false, response: identity };
  }

  const user = qltdUsersGetByEmail_(identity.email);
  if (!user) {
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_('USER_NOT_FOUND', 'Tai khoan chua duoc dang ky tren he thong.')
    };
  }
  if (user.status !== 'ACTIVE') {
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_('USER_INACTIVE', 'Tai khoan dang bi khoa.')
    };
  }

  const role = qltdUsersNormalizeRole_(user.role);
  if (allowedRoles.indexOf(role) === -1) {
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_('ROLE_SCOPE_DENIED', 'Vai tro hien tai khong duoc phep thuc hien thao tac nay.', {
        action: action,
        role: role
      })
    };
  }

  payload.email = user.email;
  payload.actorEmail = user.email;

  if (role === 'ADMIN' || role === 'PMO') {
    return { allowed: true, response: null, user: user };
  }

  const actorMasterDeptCode = qltdMasterDeptCanonicalCode_(user.deptCode);
  const targetDept = qltdDeptScopeFindPayloadDept_(payload);

  if (!actorMasterDeptCode) {
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_('USER_DEPT_MISSING', 'Tai khoan chua duoc gan phong/ban. Vui long lien he quan tri.')
    };
  }

  const routeResult = qltdDeptScopeResolveProjectDeptForActor_(payload, actorMasterDeptCode);
  if (!routeResult.success) {
    return {
      allowed: false,
      response: routeResult.response
    };
  }

  const projectDept = routeResult.dept;
  const targetMasterDept = qltdMasterDeptCanonicalCode_(targetDept);
  const targetRoutingDept = qltdDeptScopeNormalizeCode_(targetDept);
  if (
    targetDept &&
    targetMasterDept !== actorMasterDeptCode &&
    targetRoutingDept !== qltdDeptScopeNormalizeCode_(projectDept.deptCode) &&
    targetRoutingDept !== qltdDeptScopeNormalizeCode_(projectDept.projectUnitCode)
  ) {
    return {
      allowed: false,
      response: qltdUsersBuildAuthError_('DEPT_SCOPE_DENIED', 'Ban chi duoc lap va cap nhat du lieu thuoc phong/ban cua minh.', {
        action: action,
        userDeptCode: user.deptCode,
        actorMasterDeptCode: actorMasterDeptCode,
        requestedDeptCode: qltdDeptScopeReadRawPayloadDept_(payload)
      })
    };
  }

  payload.actorMasterDeptCode = actorMasterDeptCode;
  payload.targetProjectDeptCode = projectDept.deptCode;
  qltdDeptScopeForcePayloadDept_(payload, projectDept.deptCode, projectDept.deptName);
  return { allowed: true, response: null, user: user };
}

function qltdDeptScopeResolveProjectDeptForActor_(payload, actorMasterDeptCode) {
  const projectCode = qltdBudgetNormalizeCode_(qltdDeptScopeReadRawPayloadProject_(payload));
  if (!projectCode) {
    return {
      success: false,
      response: qltdUsersBuildAuthError_('PROJECT_CODE_REQUIRED', 'Thieu ma du an.')
    };
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) {
    return {
      success: false,
      response: qltdUsersBuildAuthError_('PROJECT_DEPTS_UNAVAILABLE', 'Khong doc duoc Project_Depts.', {
        upstreamErrors: deptsResult.error.errors || []
      })
    };
  }

  const projectDepts = deptsResult.departments.filter(function(dept) {
    return dept.projectCode === projectCode && dept.status === 'ACTIVE';
  });
  const dept = qltdBudgetFindProjectDeptByMasterDeptCode_(projectDepts, actorMasterDeptCode);
  if (!dept) {
    return {
      success: false,
      response: qltdUsersBuildAuthError_('PROJECT_DEPT_NOT_ASSIGNED', 'Phong/ban cua ban chua duoc phan cong tham gia du an nay.', {
        projectCode: projectCode,
        actorMasterDeptCode: actorMasterDeptCode
      })
    };
  }

  return {
    success: true,
    dept: dept
  };
}

function qltdDeptScopeFindPayloadDept_(payload) {
  return qltdDeptScopeNormalizeCode_(qltdDeptScopeReadRawPayloadDept_(payload));
}

function qltdDeptScopeReadRawPayloadDept_(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const directKeys = ['deptCode', 'departmentCode', 'ownerDeptCode', 'reportDeptCode'];
  for (let index = 0; index < directKeys.length; index += 1) {
    const value = payload[directKeys[index]];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }

  const nestedKeys = ['task', 'detailTask', 'item', 'report', 'data', 'payload'];
  for (let index = 0; index < nestedKeys.length; index += 1) {
    const nested = payload[nestedKeys[index]];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
    for (let keyIndex = 0; keyIndex < directKeys.length; keyIndex += 1) {
      const value = nested[directKeys[keyIndex]];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
  }

  return '';
}

function qltdDeptScopeReadRawPayloadProject_(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const directKeys = ['projectCode', 'projectId'];
  for (let index = 0; index < directKeys.length; index += 1) {
    const value = payload[directKeys[index]];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }

  const nestedKeys = ['task', 'detailTask', 'item', 'report', 'data', 'payload'];
  for (let index = 0; index < nestedKeys.length; index += 1) {
    const nested = payload[nestedKeys[index]];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
    for (let keyIndex = 0; keyIndex < directKeys.length; keyIndex += 1) {
      const value = nested[directKeys[keyIndex]];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
  }

  return '';
}

function qltdDeptScopeForcePayloadDept_(payload, deptCode, deptName) {
  payload.deptCode = deptCode;
  payload.deptName = deptName;

  ['task', 'detailTask', 'item', 'report', 'data', 'payload'].forEach(function(key) {
    const nested = payload[key];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return;
    if (Object.prototype.hasOwnProperty.call(nested, 'deptCode')) nested.deptCode = deptCode;
    if (Object.prototype.hasOwnProperty.call(nested, 'departmentCode')) nested.departmentCode = deptCode;
    if (Object.prototype.hasOwnProperty.call(nested, 'deptName')) nested.deptName = deptName;
  });
}

function qltdDeptScopeNormalizeCode_(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}
