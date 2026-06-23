const QLTD_USERS_SHEET_NAME = 'Users';
const QLTD_USERS_HEADERS = [
  'Email',
  'DisplayName',
  'Role',
  'Status',
  'DeptCode',
  'DeptName',
  'LastLoginAt',
  'Note'
];
const QLTD_USERS_VALID_ROLES = ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER'];
const QLTD_USERS_VALID_STATUSES = ['ACTIVE', 'INACTIVE'];
const QLTD_USERS_REGISTRATION_GROUPS = {
  BAN_LANH_DAO: 'PMO',
  DEPT_MANAGER: 'EDITOR',
  EMPLOYEE: 'REPORTER'
};
const QLTD_USERS_EXECUTIVE_DEPT = {
  deptCode: 'BLD',
  deptName: 'Ban lãnh đạo'
};
const QLTD_USERS_INITIAL_ADMIN = {
  email: 'ksngoquan@gmail.com',
  displayName: 'Ngô Quân',
  role: 'ADMIN',
  status: 'ACTIVE',
  deptCode: 'ADMIN',
  deptName: 'Quản trị hệ thống',
  lastLoginAt: '',
  note: 'Initial DEV admin'
};

function qltdSetupUsersSheet() {
  const sheet = qltdUsersEnsureSheet_();
  qltdUsersSeedAdminIfMissing_();

  return {
    success: true,
    sheetName: sheet.getName(),
    headers: QLTD_USERS_HEADERS
  };
}

function qltdUsersEnsureSheet_() {
  const ss = getCurrentSpreadsheet_();
  let sheet = ss.getSheetByName(QLTD_USERS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(QLTD_USERS_SHEET_NAME);
  }

  qltdUsersEnsureHeaders_(sheet);
  return sheet;
}

function qltdUsersEnsureHeaders_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, QLTD_USERS_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0].map(value => String(value || '').trim());
  const hasMissingHeader = QLTD_USERS_HEADERS.some((header, index) => currentHeaders[index] !== header);

  if (hasMissingHeader) {
    headerRange.setValues([QLTD_USERS_HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function qltdUsersSeedAdminIfMissing_() {
  const existing = qltdUsersGetByEmail_(QLTD_USERS_INITIAL_ADMIN.email);
  if (existing) return false;

  const sheet = qltdUsersEnsureSheet_();
  sheet.appendRow([
    QLTD_USERS_INITIAL_ADMIN.email,
    QLTD_USERS_INITIAL_ADMIN.displayName,
    QLTD_USERS_INITIAL_ADMIN.role,
    QLTD_USERS_INITIAL_ADMIN.status,
    QLTD_USERS_INITIAL_ADMIN.deptCode,
    QLTD_USERS_INITIAL_ADMIN.deptName,
    QLTD_USERS_INITIAL_ADMIN.lastLoginAt,
    QLTD_USERS_INITIAL_ADMIN.note
  ]);

  return true;
}

function qltdUsersGetByEmail_(email) {
  const normalizedEmail = qltdUsersNormalizeEmail_(email);
  if (!normalizedEmail) return null;

  const sheet = qltdUsersEnsureSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return null;

  const values = sheet
    .getRange(2, 1, lastRow - 1, QLTD_USERS_HEADERS.length)
    .getValues();

  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    const rowEmail = qltdUsersNormalizeEmail_(row[0]);

    if (rowEmail === normalizedEmail) {
      return {
        rowIndex: index + 2,
        email: rowEmail,
        displayName: String(row[1] || '').trim(),
        role: qltdUsersNormalizeRole_(row[2]),
        status: qltdUsersNormalizeStatus_(row[3]),
        deptCode: String(row[4] || '').trim(),
        deptName: String(row[5] || '').trim(),
        lastLoginAt: row[6] || '',
        note: String(row[7] || '').trim()
      };
    }
  }

  return null;
}

function qltdUsersGetRegistrationOptions_(params) {
  const identity = qltdFirebaseResolveIdentity_(params, true);
  if (!identity.success) return identity;

  return {
    success: true,
    groups: [
      { code: 'BAN_LANH_DAO', name: 'Ban lãnh đạo' },
      { code: 'DEPT_MANAGER', name: 'Trưởng/Phó phòng, ban' },
      { code: 'EMPLOYEE', name: 'Nhân viên' }
    ],
    departments: qltdUsersCollectRegistrationDepartments_(),
    apiStatus: 'CONNECTED',
    source: 'users_registration_v2'
  };
}

function qltdUsersCollectRegistrationDepartments_() {
  const byCode = {};

  function addDepartment(codeValue, nameValue, sortOrderValue) {
    const code = qltdUsersNormalizeDeptCode_(codeValue);
    const name = String(nameValue || '').trim();
    if (!code || code === 'ADMIN' || code === 'TEST') return;

    if (!byCode[code]) {
      byCode[code] = {
        deptCode: code,
        deptName: name || code,
        sortOrder: Number(sortOrderValue || 9999)
      };
      return;
    }

    if ((!byCode[code].deptName || byCode[code].deptName === code) && name) {
      byCode[code].deptName = name;
    }
    byCode[code].sortOrder = Math.min(byCode[code].sortOrder, Number(sortOrderValue || 9999));
  }

  try {
    if (typeof qltdProjectDeptsListActive_ === 'function') {
      qltdProjectDeptsListActive_().forEach(function(row) {
        addDepartment(row.deptCode, row.deptName, row.sortOrder);
      });
    }
  } catch (error) {
    console.warn('Cannot load Project_Depts for user registration', error);
  }

  const sheet = qltdUsersEnsureSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, QLTD_USERS_HEADERS.length).getValues().forEach(function(row) {
      addDepartment(row[4], row[5], 9999);
    });
  }

  return Object.keys(byCode)
    .map(function(code) { return byCode[code]; })
    .sort(function(a, b) {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return String(a.deptName || '').localeCompare(String(b.deptName || ''), 'vi');
    });
}

function qltdUsersFindRegistrationDepartment_(deptCode) {
  const targetCode = qltdUsersNormalizeDeptCode_(deptCode);
  if (!targetCode) return null;

  return qltdUsersCollectRegistrationDepartments_().find(function(item) {
    return qltdUsersNormalizeDeptCode_(item.deptCode) === targetCode;
  }) || null;
}

function qltdUsersRegister_(payload) {
  const identity = qltdFirebaseResolveIdentity_(payload, true);
  if (!identity.success) return identity;

  const email = qltdUsersNormalizeEmail_(identity.email);
  const displayName = String(payload && payload.displayName || identity.displayName || '').trim();
  const title = qltdUsersSanitizeNotePart_(payload && payload.title);
  const userGroup = String(payload && payload.userGroup || '').trim().toUpperCase();
  const role = QLTD_USERS_REGISTRATION_GROUPS[userGroup] || '';
  const requiresDepartment = userGroup === 'DEPT_MANAGER' || userGroup === 'EMPLOYEE';
  const selectedDepartment = requiresDepartment ? qltdUsersFindRegistrationDepartment_(payload && payload.deptCode) : null;
  const deptCode = requiresDepartment ? qltdUsersNormalizeDeptCode_(selectedDepartment && selectedDepartment.deptCode) : QLTD_USERS_EXECUTIVE_DEPT.deptCode;
  const deptName = requiresDepartment ? String(selectedDepartment && selectedDepartment.deptName || '').trim() : QLTD_USERS_EXECUTIVE_DEPT.deptName;

  const validationErrors = [];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) validationErrors.push('EMAIL_INVALID');
  if (displayName.length < 2) validationErrors.push('DISPLAY_NAME_REQUIRED');
  if (!role) validationErrors.push('USER_GROUP_INVALID');
  if (!title) validationErrors.push('TITLE_REQUIRED');
  if (requiresDepartment && (!deptCode || !deptName)) validationErrors.push('DEPARTMENT_REQUIRED');

  if (validationErrors.length) {
    return {
      success: false,
      message: 'REGISTRATION_VALIDATION_FAILED',
      errors: validationErrors,
      apiStatus: 'CONNECTED',
      source: 'users_registration_v2'
    };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const existing = qltdUsersGetByEmail_(email);
    if (existing) {
      if (existing.status !== 'ACTIVE') {
        return {
          success: false,
          message: 'USER_INACTIVE',
          apiStatus: 'CONNECTED',
          source: 'users_registration_v2'
        };
      }
      if (!qltdUsersIsValidRole_(existing.role)) {
        return {
          success: false,
          message: 'INVALID_ROLE',
          apiStatus: 'CONNECTED',
          source: 'users_registration_v2'
        };
      }

      qltdUsersTouchLastLogin_(existing.rowIndex);
      return qltdUsersRegistrationSuccess_(existing, false, true);
    }

    const now = new Date();
    const note = [
      'SELF_REGISTRATION_V2',
      'Group=' + userGroup,
      'Title=' + title,
      'AuthMode=' + String(identity.authMode || ''),
      'RegisteredAt=' + qltdUsersFormatIsoLocal_(now)
    ].join(' | ');

    const sheet = qltdUsersEnsureSheet_();
    sheet.appendRow([
      email,
      displayName,
      role,
      'ACTIVE',
      deptCode,
      deptName,
      now,
      note
    ]);
    SpreadsheetApp.flush();

    const created = qltdUsersGetByEmail_(email);
    console.log(JSON.stringify({
      action: 'USER_SELF_REGISTER',
      email: email,
      role: role,
      deptCode: deptCode,
      created: true
    }));

    return qltdUsersRegistrationSuccess_(created, true, false);
  } catch (error) {
    console.error('USER_SELF_REGISTER_FAILED', error);
    return {
      success: false,
      message: 'REGISTRATION_WRITE_FAILED',
      error: String(error && error.message || error),
      apiStatus: 'CONNECTED',
      source: 'users_registration_v2'
    };
  } finally {
    try {
      lock.releaseLock();
    } catch (releaseError) {
      // Lock may not have been acquired; no follow-up action is required.
    }
  }
}

function qltdUsersBuildAuthError_(code, message, extra) {
  const response = {
    success: false,
    message: code,
    errorCode: code,
    errorMessage: message,
    apiStatus: 'CONNECTED',
    source: 'users_registration_v2'
  };

  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(function(key) {
      response[key] = extra[key];
    });
  }

  return response;
}

function qltdUsersRegistrationSuccess_(user, created, alreadyExists) {
  return {
    success: true,
    created: !!created,
    alreadyExists: !!alreadyExists,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    deptCode: user.deptCode,
    deptName: user.deptName,
    permissions: qltdPermissionsForRole_(user.role),
    apiStatus: 'CONNECTED',
    source: 'users_registration_v2'
  };
}

function qltdUsersTouchLastLogin_(rowIndex) {
  const row = Number(rowIndex || 0);
  if (row < 2) return false;

  try {
    qltdUsersEnsureSheet_().getRange(row, 7).setValue(new Date());
    return true;
  } catch (error) {
    console.warn('Cannot update Users.LastLoginAt', error);
    return false;
  }
}

function qltdUsersNormalizeDeptCode_(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
}

function qltdUsersSanitizeNotePart_(value) {
  return String(value || '').trim().replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ');
}

function qltdUsersFormatIsoLocal_(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const timezone = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
  return Utilities.formatDate(date, timezone, "yyyy-MM-dd'T'HH:mm:ss");
}

function qltdUsersNormalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function qltdUsersNormalizeRole_(role) {
  return String(role || '').trim().toUpperCase();
}

function qltdUsersNormalizeStatus_(status) {
  return String(status || '').trim().toUpperCase();
}

function qltdUsersIsValidRole_(role) {
  return QLTD_USERS_VALID_ROLES.indexOf(qltdUsersNormalizeRole_(role)) !== -1;
}

function qltdUsersIsValidStatus_(status) {
  return QLTD_USERS_VALID_STATUSES.indexOf(qltdUsersNormalizeStatus_(status)) !== -1;
}
