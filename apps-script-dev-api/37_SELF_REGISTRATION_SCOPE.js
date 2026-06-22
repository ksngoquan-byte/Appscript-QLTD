const QLTD_SELF_REGISTRATION_SOURCE = 'SELF_REGISTRATION_V1';
const QLTD_FIREBASE_WEB_API_KEY_PROPERTY = 'QLTD_FIREBASE_WEB_API_KEY';
const QLTD_SELF_REGISTRATION_EXECUTIVE_DEPT_CODE = 'EXECUTIVE';
const QLTD_SELF_REGISTRATION_EXECUTIVE_DEPT_NAME = 'Ban lanh dao';

const QLTD_SELF_REGISTRATION_JOB_GROUPS = [
  {
    code: 'EXECUTIVE',
    label: 'Ban lanh dao',
    description: 'Toan quyen nghiep vu tren cac du an va phong/ban.',
    role: 'PMO',
    requiresDept: false
  },
  {
    code: 'DEPT_MANAGER',
    label: 'Truong/Pho phong, ban',
    description: 'Lap, cap nhat va ra soat du lieu trong phong/ban cua minh.',
    role: 'EDITOR',
    requiresDept: true
  },
  {
    code: 'SPECIALIST',
    label: 'Chuyen vien/Nhan vien',
    description: 'Lap cong viec chi tiet va bao cao tuan trong phong/ban cua minh.',
    role: 'REPORTER',
    requiresDept: true
  }
];

const QLTD_SELF_REGISTRATION_DEPT_FALLBACKS = [
  { code: 'TROLY', name: 'Tro ly - Thu ky' },
  { code: 'PTDA', name: 'Phat trien du an' },
  { code: 'GPMB', name: 'Giai phong mat bang' },
  { code: 'THIETKE', name: 'Quan ly thiet ke' },
  { code: 'TIEUCHUAN', name: 'Tieu chuan' },
  { code: 'BIM', name: 'BIM' },
  { code: 'KTXD', name: 'Ky thuat xay dung' },
  { code: 'BQLDA', name: 'Ban Quan ly du an' },
  { code: 'DAUTHAU', name: 'Dau thau' },
  { code: 'KEHOACH', name: 'Ke hoach' },
  { code: 'TAICHINH', name: 'Tai chinh' },
  { code: 'KETOAN', name: 'Ke toan' },
  { code: 'KINHDOANH', name: 'Kinh doanh' },
  { code: 'MKT', name: 'Marketing' },
  { code: 'PHAPCHE', name: 'Phap che' },
  { code: 'VANHANH', name: 'Van hanh' }
];

const QLTD_DEPT_SCOPE_ACTION_RULES = {
  work_assigntask: ['ADMIN', 'PMO', 'EDITOR'],
  work_updatetask: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  work_createdetailtask: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  work_updatedetailtask: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_taskupdates_save: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_masterapproval_review: ['ADMIN', 'PMO', 'EDITOR'],
  weekly_savedraft: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_submit: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_review: ['ADMIN', 'PMO', 'EDITOR']
};

function qltdSelfRegistrationGetOptions_() {
  return {
    success: true,
    jobGroups: QLTD_SELF_REGISTRATION_JOB_GROUPS.map(function(item) {
      return {
        code: item.code,
        label: item.label,
        description: item.description,
        requiresDept: item.requiresDept
      };
    }),
    departments: qltdSelfRegistrationListDepartments_(),
    source: QLTD_SELF_REGISTRATION_SOURCE
  };
}

function qltdSelfRegistrationRegister_(payload) {
  const identity = qltdFirebaseResolveIdentity_(payload, true);
  if (!identity.success) return identity;

  const displayName = qltdSelfRegistrationSanitizeText_(payload.displayName, 120);
  const jobGroupCode = String(payload.jobGroup || '').trim().toUpperCase();
  const jobTitle = qltdSelfRegistrationSanitizeText_(payload.jobTitle, 160);
  const jobGroup = QLTD_SELF_REGISTRATION_JOB_GROUPS.find(function(item) {
    return item.code === jobGroupCode;
  });

  if (!displayName) {
    return qltdSelfRegistrationError_('DISPLAY_NAME_REQUIRED', 'Vui long nhap ho va ten.');
  }
  if (!jobGroup) {
    return qltdSelfRegistrationError_('JOB_GROUP_INVALID', 'Nhom chuc vu khong hop le.');
  }
  if (!jobTitle) {
    return qltdSelfRegistrationError_('JOB_TITLE_REQUIRED', 'Vui long nhap chuc danh cu the.');
  }

  let deptCode = QLTD_SELF_REGISTRATION_EXECUTIVE_DEPT_CODE;
  let deptName = QLTD_SELF_REGISTRATION_EXECUTIVE_DEPT_NAME;

  if (jobGroup.requiresDept) {
    const department = qltdSelfRegistrationFindDepartment_(payload.deptCode);
    if (!department) {
      return qltdSelfRegistrationError_('DEPT_INVALID', 'Phong/ban khong hop le hoac chua duoc kich hoat.');
    }
    deptCode = department.code;
    deptName = department.name;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return qltdSelfRegistrationError_('REGISTRATION_BUSY', 'He thong dang xu ly dang ky khac. Vui long thu lai.');
  }

  try {
    qltdUsersEnsureSheet_();
    qltdUsersSeedAdminIfMissing_();

    const existing = qltdUsersGetByEmail_(identity.email);
    if (existing) {
      if (existing.status !== 'ACTIVE') {
        return qltdSelfRegistrationError_('USER_INACTIVE', 'Tai khoan da ton tai nhung dang bi khoa. Vui long lien he quan tri.');
      }
      return {
        success: true,
        message: 'ALREADY_REGISTERED',
        email: existing.email,
        displayName: existing.displayName,
        role: existing.role,
        status: existing.status,
        deptCode: existing.deptCode,
        deptName: existing.deptName,
        permissions: qltdPermissionsForRole_(existing.role),
        source: QLTD_SELF_REGISTRATION_SOURCE
      };
    }

    const sheet = qltdUsersEnsureSheet_();
    const registeredAt = new Date();
    const note = [
      QLTD_SELF_REGISTRATION_SOURCE,
      'Group=' + jobGroup.code,
      'Title=' + jobTitle,
      'RegisteredAt=' + Utilities.formatDate(registeredAt, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss")
    ].join(' | ');

    sheet.appendRow([
      identity.email,
      displayName,
      jobGroup.role,
      'ACTIVE',
      deptCode,
      deptName,
      registeredAt,
      note
    ]);

    return {
      success: true,
      message: 'REGISTERED',
      email: identity.email,
      displayName: displayName,
      role: jobGroup.role,
      status: 'ACTIVE',
      deptCode: deptCode,
      deptName: deptName,
      permissions: qltdPermissionsForRole_(jobGroup.role),
      source: QLTD_SELF_REGISTRATION_SOURCE
    };
  } finally {
    lock.releaseLock();
  }
}

function qltdSelfRegistrationTouchLastLogin_(user) {
  if (!user || !user.rowIndex) return;
  try {
    const sheet = qltdUsersEnsureSheet_();
    sheet.getRange(user.rowIndex, 7).setValue(new Date());
  } catch (error) {
    console.warn('Cannot update LastLoginAt', error);
  }
}

function qltdSelfRegistrationListDepartments_() {
  const fallbackByKey = {};
  QLTD_SELF_REGISTRATION_DEPT_FALLBACKS.forEach(function(item, index) {
    fallbackByKey[qltdDeptScopeNormalizeCode_(item.code)] = {
      code: item.code,
      name: item.name,
      sortOrder: (index + 1) * 10
    };
  });

  const resultByKey = {};
  Object.keys(fallbackByKey).forEach(function(key) {
    resultByKey[key] = fallbackByKey[key];
  });

  try {
    const ss = getCurrentSpreadsheet_();
    const sheet = ss.getSheetByName('Project_Depts');
    if (sheet && sheet.getLastRow() >= 2) {
      const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
      values.forEach(function(row) {
        const rawCode = String(row[1] || '').trim();
        const key = qltdDeptScopeNormalizeCode_(rawCode);
        const status = String(row[4] || '').trim().toUpperCase();
        if (!key || status !== 'ACTIVE') return;

        const fallback = fallbackByKey[key];
        const rawName = String(row[3] || '').trim();
        const current = resultByKey[key];
        const sortOrder = Number(row[5]) || (current && current.sortOrder) || 9999;

        resultByKey[key] = {
          code: rawCode,
          name: fallback ? fallback.name : (qltdSelfRegistrationCleanDeptName_(rawName) || rawCode),
          sortOrder: Math.min(sortOrder, current && current.sortOrder || 9999)
        };
      });
    }
  } catch (error) {
    console.warn('Cannot read Project_Depts for self registration', error);
  }

  return Object.keys(resultByKey)
    .map(function(key) { return resultByKey[key]; })
    .filter(function(item) { return item.code && item.name; })
    .sort(function(a, b) {
      return (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'vi');
    })
    .map(function(item) {
      return { code: item.code, name: item.name };
    });
}

function qltdSelfRegistrationFindDepartment_(deptCode) {
  const target = qltdDeptScopeNormalizeCode_(deptCode);
  if (!target) return null;
  return qltdSelfRegistrationListDepartments_().find(function(item) {
    return qltdDeptScopeNormalizeCode_(item.code) === target;
  }) || null;
}

function qltdSelfRegistrationCleanDeptName_(name) {
  return String(name || '')
    .replace(/\s+(Coc Lau|C1 Hung Loc|Hung Loc|Nam Cam)$/i, '')
    .trim();
}

function qltdSelfRegistrationSanitizeText_(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength || 200);
}

function qltdSelfRegistrationError_(code, message, extra) {
  const response = {
    success: false,
    message: code,
    errorCode: code,
    errorMessage: message,
    source: QLTD_SELF_REGISTRATION_SOURCE
  };
  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(function(key) { response[key] = extra[key]; });
  }
  return response;
}

function qltdFirebaseGetWebApiKey_() {
  return String(PropertiesService.getScriptProperties().getProperty(QLTD_FIREBASE_WEB_API_KEY_PROPERTY) || '').trim();
}

function qltdFirebaseResolveIdentity_(payload, tokenRequired) {
  const idToken = String(payload && payload.idToken || '').trim();
  const requestedEmail = qltdUsersNormalizeEmail_(payload && payload.email);

  if (!idToken) {
    if (tokenRequired) {
      return qltdSelfRegistrationError_('ID_TOKEN_REQUIRED', 'Khong xac minh duoc phien dang nhap Google. Vui long dang nhap lai.');
    }
    if (!requestedEmail) {
      return qltdSelfRegistrationError_('AUTH_REQUIRED', 'Thieu thong tin nguoi dung thuc hien thao tac.');
    }
    return {
      success: true,
      email: requestedEmail,
      authMode: 'LEGACY_EMAIL'
    };
  }

  const firebaseApiKey = qltdFirebaseGetWebApiKey_();
  if (!firebaseApiKey) {
    return qltdSelfRegistrationError_('FIREBASE_API_KEY_MISSING', 'Apps Script chua duoc cau hinh khoa xac minh Firebase.');
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

    if (statusCode < 200 || statusCode >= 300 || !verifiedEmail) {
      return qltdSelfRegistrationError_('ID_TOKEN_INVALID', 'Phien dang nhap Google khong hop le hoac da het han.');
    }
    if (requestedEmail && requestedEmail !== verifiedEmail) {
      return qltdSelfRegistrationError_('EMAIL_MISMATCH', 'Email khai bao khong khop tai khoan Google dang dang nhap.');
    }

    return {
      success: true,
      email: verifiedEmail,
      displayName: String(firebaseUser.displayName || '').trim(),
      localId: String(firebaseUser.localId || '').trim(),
      authMode: 'FIREBASE_ID_TOKEN'
    };
  } catch (error) {
    return qltdSelfRegistrationError_('IDENTITY_VERIFY_ERROR', 'Khong the xac minh phien dang nhap Google.', {
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
      response: qltdSelfRegistrationError_('USER_NOT_FOUND', 'Tai khoan chua duoc dang ky tren he thong.')
    };
  }
  if (user.status !== 'ACTIVE') {
    return {
      allowed: false,
      response: qltdSelfRegistrationError_('USER_INACTIVE', 'Tai khoan dang bi khoa.')
    };
  }

  const role = qltdUsersNormalizeRole_(user.role);
  if (allowedRoles.indexOf(role) === -1) {
    return {
      allowed: false,
      response: qltdSelfRegistrationError_('ROLE_SCOPE_DENIED', 'Vai tro hien tai khong duoc phep thuc hien thao tac nay.', {
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

  const userDept = qltdDeptScopeNormalizeCode_(user.deptCode);
  const targetDept = qltdDeptScopeFindPayloadDept_(payload);

  if (!userDept) {
    return {
      allowed: false,
      response: qltdSelfRegistrationError_('USER_DEPT_MISSING', 'Tai khoan chua duoc gan phong/ban. Vui long lien he quan tri.')
    };
  }

  if (targetDept && targetDept !== userDept) {
    return {
      allowed: false,
      response: qltdSelfRegistrationError_('DEPT_SCOPE_DENIED', 'Ban chi duoc lap va cap nhat du lieu thuoc phong/ban cua minh.', {
        action: action,
        userDeptCode: user.deptCode,
        requestedDeptCode: qltdDeptScopeReadRawPayloadDept_(payload)
      })
    };
  }

  qltdDeptScopeForcePayloadDept_(payload, user.deptCode, user.deptName);
  return { allowed: true, response: null, user: user };
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

function qltdDeptScopeForcePayloadDept_(payload, deptCode, deptName) {
  payload.deptCode = deptCode;
  payload.deptName = deptName;

  const nestedKeys = ['task', 'detailTask', 'item', 'report', 'data', 'payload'];
  nestedKeys.forEach(function(key) {
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
