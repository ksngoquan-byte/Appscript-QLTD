const QLTD_USERS_SHEET_NAME = 'Users';
const QLTD_USERS_HEADERS = [
  'Email',
  'DisplayName',
  'Role',
  'Status',
  'DeptCode',
  'DeptName',
  'LastLoginAt',
  'Note',
  'EmpCode'
];
const QLTD_USERS_VALID_ROLES = ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER'];
const QLTD_USERS_VALID_STATUSES = ['ACTIVE', 'INACTIVE'];
const QLTD_USERS_INITIAL_ADMIN = {
  email: 'ksngoquan@gmail.com',
  displayName: 'Ngô Quân',
  role: 'ADMIN',
  status: 'ACTIVE',
  deptCode: 'ADMIN',
  deptName: 'Quản trị hệ thống',
  lastLoginAt: '',
  note: 'Initial DEV admin',
  empCode: ''
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
    sheet.getRange(1, 1, 1, QLTD_USERS_HEADERS.length).setValues([QLTD_USERS_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  qltdUsersEnsureHeaders_(sheet);
  return sheet;
}

function qltdUsersEnsureHeaders_(sheet) {
  const headerMap = qltdUsersHeaderMap_(sheet);
  const missingHeaders = QLTD_USERS_HEADERS.filter(function(header) {
    return headerMap[header] === undefined;
  });
  if (missingHeaders.length) {
    throw new Error('USERS_SCHEMA_INVALID: ' + missingHeaders.join(', '));
  }
  return headerMap;
}

function qltdUsersHeaderMap_(sheet) {
  const lastColumn = Math.max(Number(sheet.getLastColumn() || 0), QLTD_USERS_HEADERS.length);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  const headerMap = {};
  headers.forEach(function(header, index) {
    if (header && headerMap[header] === undefined) headerMap[header] = index;
  });
  return headerMap;
}

function qltdUsersBuildRow_(sheet, valuesByHeader) {
  const headerMap = qltdUsersEnsureHeaders_(sheet);
  const width = Math.max(Number(sheet.getLastColumn() || 0), QLTD_USERS_HEADERS.length);
  const row = new Array(width).fill('');
  Object.keys(valuesByHeader || {}).forEach(function(header) {
    if (headerMap[header] !== undefined) row[headerMap[header]] = valuesByHeader[header];
  });
  return row;
}

function qltdUsersSeedAdminIfMissing_() {
  const existing = qltdUsersGetByEmail_(QLTD_USERS_INITIAL_ADMIN.email);
  if (existing) return false;

  const sheet = qltdUsersEnsureSheet_();
  sheet.appendRow(qltdUsersBuildRow_(sheet, {
    Email: QLTD_USERS_INITIAL_ADMIN.email,
    DisplayName: QLTD_USERS_INITIAL_ADMIN.displayName,
    Role: QLTD_USERS_INITIAL_ADMIN.role,
    Status: QLTD_USERS_INITIAL_ADMIN.status,
    DeptCode: QLTD_USERS_INITIAL_ADMIN.deptCode,
    DeptName: QLTD_USERS_INITIAL_ADMIN.deptName,
    LastLoginAt: QLTD_USERS_INITIAL_ADMIN.lastLoginAt,
    Note: QLTD_USERS_INITIAL_ADMIN.note,
    EmpCode: QLTD_USERS_INITIAL_ADMIN.empCode
  }));

  return true;
}

function qltdUsersGetByEmail_(email) {
  const normalizedEmail = qltdUsersNormalizeEmail_(email);
  if (!normalizedEmail) return null;

  const sheet = qltdUsersEnsureSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return null;

  const headerMap = qltdUsersEnsureHeaders_(sheet);
  const width = Math.max(Number(sheet.getLastColumn() || 0), QLTD_USERS_HEADERS.length);
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();

  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    const rowEmail = qltdUsersNormalizeEmail_(row[headerMap.Email]);

    if (rowEmail === normalizedEmail) {
      return {
        rowIndex: index + 2,
        email: rowEmail,
        displayName: String(row[headerMap.DisplayName] || '').trim(),
        role: qltdUsersNormalizeRole_(row[headerMap.Role]),
        status: qltdUsersNormalizeStatus_(row[headerMap.Status]),
        deptCode: String(row[headerMap.DeptCode] || '').trim(),
        deptName: String(row[headerMap.DeptName] || '').trim(),
        lastLoginAt: row[headerMap.LastLoginAt] || '',
        note: String(row[headerMap.Note] || '').trim(),
        empCode: String(row[headerMap.EmpCode] || '').trim()
      };
    }
  }

  return null;
}

function qltdUsersLookupEmployees_(payload) {
  const identity = qltdFirebaseResolveIdentity_(payload, true);
  if (!identity.success) return identity;

  const existing = qltdUsersGetByEmail_(identity.email);
  if (existing) {
    if (existing.status !== 'ACTIVE') {
      return qltdUsersBuildAuthError_('USER_INACTIVE', 'Tài khoản của bạn đang bị khóa.');
    }
    return qltdUsersBuildAuthError_('USER_ALREADY_EXISTS', 'Tài khoản đã được đăng ký.', {
      profile: qltdUsersRegistrationSuccess_(existing, false, true)
    });
  }

  const fullName = String(payload && payload.fullName || '').trim();
  if (!fullName) {
    return qltdUsersBuildAuthError_('FULL_NAME_REQUIRED', 'Vui lòng nhập họ và tên.');
  }
  return qltdEmployeesLookupByName_(fullName);
}

function qltdUsersRegister_(payload) {
  const identity = qltdFirebaseResolveIdentity_(payload, true);
  if (!identity.success) return identity;

  const email = qltdUsersNormalizeEmail_(identity.email);
  const empCode = qltdEmployeesNormalizeCode_(payload && payload.empCode);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return qltdUsersBuildAuthError_('EMAIL_INVALID', 'Email Google không hợp lệ.');
  }
  if (!empCode) {
    return qltdUsersBuildAuthError_('EMPLOYEE_CODE_REQUIRED', 'Vui lòng chọn đúng hồ sơ nhân sự.');
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(10000);
    locked = true;

    const existing = qltdUsersGetByEmail_(email);
    if (existing) {
      if (existing.status !== 'ACTIVE') {
        return qltdUsersBuildAuthError_('USER_INACTIVE', 'Tài khoản của bạn đang bị khóa.');
      }
      if (!qltdUsersIsValidRole_(existing.role)) {
        return qltdUsersBuildAuthError_('INVALID_ROLE', 'Vai trò tài khoản không hợp lệ.');
      }

      qltdUsersTouchLastLogin_(existing.rowIndex);
      return qltdUsersRegistrationSuccess_(existing, false, true);
    }

    const linkedUser = qltdUsersFindByEmpCode_(empCode);
    if (linkedUser && linkedUser.email !== email) {
      return qltdUsersBuildAuthError_(
        'EMPLOYEE_ALREADY_LINKED',
        'Hồ sơ nhân sự này đã được liên kết với tài khoản Google khác.'
      );
    }

    const employeeResult = qltdEmployeesReadByCodeFresh_(empCode);
    if (!employeeResult.success) return employeeResult;
    const employee = employeeResult.employee;
    const role = qltdEmployeesRoleFor_(employee);
    if (role === 'ADMIN' || role === 'VIEWER' || !qltdUsersIsValidRole_(role)) {
      return qltdUsersBuildAuthError_('ROLE_MAPPING_INVALID', 'Không thể xác định quyền người dùng an toàn.');
    }

    const now = new Date();
    const note = [
      'EMPLOYEE_REGISTRATION_V1',
      'EmpCode=' + employee.empCode,
      'AuthMode=' + String(identity.authMode || ''),
      'RegisteredAt=' + qltdUsersFormatIsoLocal_(now)
    ].join(' | ');

    const sheet = qltdUsersEnsureSheet_();
    sheet.appendRow(qltdUsersBuildRow_(sheet, {
      Email: email,
      DisplayName: employee.fullName,
      Role: role,
      Status: 'ACTIVE',
      DeptCode: employee.deptCode,
      DeptName: employee.deptName,
      LastLoginAt: now,
      Note: note,
      EmpCode: employee.empCode
    }));
    SpreadsheetApp.flush();

    const created = qltdUsersGetByEmail_(email);
    if (!created || created.empCode !== employee.empCode) {
      return qltdUsersBuildAuthError_('REGISTRATION_WRITE_FAILED', 'Không xác nhận được dữ liệu đăng ký vừa tạo.');
    }

    return qltdUsersRegistrationSuccess_(created, true, false);
  } catch (error) {
    console.error('EMPLOYEE_REGISTRATION_FAILED', String(error && error.message || error));
    return {
      success: false,
      message: 'REGISTRATION_WRITE_FAILED',
      error: String(error && error.message || error),
      apiStatus: 'CONNECTED',
      source: 'employee_registration_v1'
    };
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdUsersFindByEmpCode_(empCode) {
  const normalizedEmpCode = qltdEmployeesNormalizeCode_(empCode);
  if (!normalizedEmpCode) return null;
  const sheet = qltdUsersEnsureSheet_();
  const headerMap = qltdUsersEnsureHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const width = Math.max(Number(sheet.getLastColumn() || 0), QLTD_USERS_HEADERS.length);
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    if (qltdEmployeesNormalizeCode_(row[headerMap.EmpCode]) === normalizedEmpCode) {
      return {
        rowIndex: index + 2,
        email: qltdUsersNormalizeEmail_(row[headerMap.Email]),
        empCode: normalizedEmpCode
      };
    }
  }
  return null;
}

function qltdUsersBuildAuthError_(code, message, extra) {
  const response = {
    success: false,
    message: code,
    errorCode: code,
    errorMessage: message,
    apiStatus: 'CONNECTED',
    source: 'employee_registration_v1'
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
    empCode: user.empCode || '',
    permissions: qltdPermissionsForRole_(user.role),
    apiStatus: 'CONNECTED',
    source: 'employee_registration_v1'
  };
}

function qltdUsersTouchLastLogin_(rowIndex) {
  const row = Number(rowIndex || 0);
  if (row < 2) return false;

  try {
    const sheet = qltdUsersEnsureSheet_();
    const headerMap = qltdUsersEnsureHeaders_(sheet);
    sheet.getRange(row, headerMap.LastLoginAt + 1).setValue(new Date());
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
