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
