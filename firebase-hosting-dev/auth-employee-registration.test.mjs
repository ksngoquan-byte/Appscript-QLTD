import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  buildRegistrationDepartments,
  buildRegistrationPositions,
  getRegistrationErrorMessage
} from './registration-gate.js';

const usersSource = fs.readFileSync(new URL('../apps-script-dev-api/29_USERS_SERVICE.js', import.meta.url), 'utf8');
const employeeSource = fs.readFileSync(new URL('../apps-script-dev-api/71_EMPLOYEE_REGISTRATION_SERVICE.js', import.meta.url), 'utf8');
const identitySource = fs.readFileSync(new URL('../apps-script-dev-api/37_SELF_REGISTRATION_SCOPE.js', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');
const bootstrapSource = fs.readFileSync(new URL('../apps-script-dev-api/56_Performance_Bootstrap_Service.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

class MockRange {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }
  getValues() {
    return Array.from({ length: this.rowCount }, (_, rowOffset) =>
      Array.from({ length: this.columnCount }, (_, columnOffset) =>
        this.sheet.getCell(this.row + rowOffset, this.column + columnOffset)
      )
    );
  }
  getDisplayValues() {
    return this.getValues().map((row) => row.map((value) => String(value ?? '')));
  }
  setValues(values) {
    values.forEach((row, rowOffset) => row.forEach((value, columnOffset) => {
      this.sheet.setCell(this.row + rowOffset, this.column + columnOffset, value);
    }));
    return this;
  }
  setValue(value) {
    this.sheet.setCell(this.row, this.column, value);
    return this;
  }
}

class MockSheet {
  constructor(name, rows) {
    this.name = name;
    this.rows = rows.map((row) => row.slice());
  }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((width, row) => Math.max(width, row.length), 0); }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new MockRange(this, row, column, rowCount, columnCount);
  }
  getCell(row, column) { return this.rows[row - 1]?.[column - 1] ?? ''; }
  setCell(row, column, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < column) this.rows[row - 1].push('');
    this.rows[row - 1][column - 1] = value;
  }
  appendRow(row) { this.rows.push(row.slice()); }
  setFrozenRows() {}
}

const userHeaders = ['Email', 'DisplayName', 'Role', 'Status', 'DeptCode', 'DeptName', 'LastLoginAt', 'Note', 'EmpCode'];
const usersSheet = new MockSheet('Users', [
  userHeaders,
  ['ksngoquan@gmail.com', 'Admin', 'ADMIN', 'ACTIVE', 'ADMIN', 'Admin', '', 'existing', '']
]);
const employeeSheet = new MockSheet('USERS_SOFTWARE', [
  ['EMP_CODE', 'FULL_NAME', 'DEPT_SOURCE', 'POSITION_SOURCE', 'DEPT_CODE', 'ROLE_CODE', 'ACTIVE_STATUS'],
  ['P1', 'Nguyễn Văn A', 'Ban lãnh đạo', 'Thành viên', 'BLD', 'Nhân viên', 'Đang làm việc'],
  ['E2', 'Nguyễn Văn A', 'Kinh doanh', 'Trưởng phòng', 'KINHDOANH', 'Trưởng phòng', 'Đang làm việc'],
  ['E3', 'Lê Văn B', 'Kinh doanh', 'Chuyên viên', 'KINHDOANH', 'Chuyên viên', 'Đang làm việc'],
  ['E4', 'Người Nghỉ Việc', 'Kinh doanh', 'Chuyên viên', 'KINHDOANH', 'Chuyên viên', 'Đã nghỉ việc'],
  ['E5', 'Thiếu Phòng Ban', '', 'Chuyên viên', '', 'Chuyên viên', 'Đang làm việc'],
  ['E2510050', 'Phan Duy Hậu', 'Kinh doanh', 'Chuyên viên', 'KINHDOANH', 'Chuyên viên', 'Đang làm việc']
]);
const cache = new Map();
let identityEmail = 'new@example.com';
let lockCount = 0;

const context = {
  Array,
  Date,
  Error,
  JSON,
  Math,
  Number,
  Object,
  RegExp,
  String,
  console: { error() {}, warn() {} },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (content) => ({
      content,
      setMimeType() { return this; }
    })
  },
  getCurrentSpreadsheet_: () => ({
    getSheetByName: (name) => name === 'Users' ? usersSheet : null,
    insertSheet: () => { throw new Error('unexpected insert'); }
  }),
  SpreadsheetApp: {
    openById: () => ({ getSheetByName: (name) => name === 'USERS_SOFTWARE' ? employeeSheet : null }),
    flush() {}
  },
  CacheService: {
    getScriptCache: () => ({
      get: (key) => cache.has(key) ? cache.get(key) : null,
      put: (key, value) => cache.set(key, value)
    })
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (_algorithm, value) => Array.from(Buffer.from(String(value))),
    base64EncodeWebSafe: (value) => Buffer.from(value).toString('base64url'),
    formatDate: (date) => date.toISOString().slice(0, 19)
  },
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
  LockService: {
    getScriptLock: () => ({
      waitLock() { lockCount += 1; },
      releaseLock() {}
    })
  },
  qltdFirebaseResolveIdentity_: () => ({
    success: true,
    email: identityEmail,
    localId: `uid:${identityEmail}`,
    authMode: 'FIREBASE_ID_TOKEN'
  }),
  qltdPermissionsForRole_: (role) => ({ role }),
  qltdProjectsEnsureSheet_() {},
  qltdProjectsSeedDefaultIfMissing_() {},
  qltdProjectsListForUser_: () => []
};
vm.createContext(context);
vm.runInContext(`${employeeSource}\n${usersSource}\n${apiSource}\n${bootstrapSource}`, context);

assert.equal(context.qltdEmployeesNormalizeName_('  NGUYỄN   VĂN A  '), 'nguyễn văn a');
const lookup = context.qltdUsersLookupEmployees_({ fullName: ' NGUYỄN   VĂN A ' });
assert.equal(lookup.success, true);
assert.equal(lookup.profiles.length, 2);
assert.deepEqual(Object.keys(lookup.profiles[0]).sort(), ['deptCode', 'deptName', 'empCode', 'fullName', 'position']);
assert.equal(context.qltdUsersLookupEmployees_({ fullName: 'Nguyễn Văn' }).errorCode, 'NAME_NOT_FOUND');
assert.equal(context.qltdUsersLookupEmployees_({ fullName: 'Người Nghỉ Việc' }).errorCode, 'NAME_NOT_FOUND');
assert.equal(context.qltdUsersLookupEmployees_({ fullName: 'Thiếu Phòng Ban' }).errorCode, 'NAME_NOT_FOUND');

const roleCases = [
  [{ deptCode: 'BLD' }, 'PMO'],
  [{ deptCode: 'KEHOACH' }, 'PMO'],
  [{ deptCode: 'PHAPCHE' }, 'EDITOR'],
  [{ deptCode: 'KYTHUAT', roleCode: 'Trưởng Bộ phận Xây dựng' }, 'EDITOR'],
  [{ roleCode: 'Trưởng phòng' }, 'EDITOR'],
  [{ roleCode: 'Trưởng phòng kiêm Quản lý dự án' }, 'EDITOR'],
  [{ roleCode: 'Phó phòng' }, 'EDITOR'],
  [{ roleCode: 'Chánh Văn phòng' }, 'EDITOR'],
  [{ roleCode: 'Trưởng ban QLDA' }, 'EDITOR'],
  [{ roleCode: 'Phụ trách phòng Kinh doanh' }, 'EDITOR'],
  [{ roleCode: 'Giám đốc Marketing' }, 'EDITOR'],
  [{ empCode: 'E2510050', roleCode: 'Chuyên viên' }, 'EDITOR'],
  [{ deptCode: 'KINHDOANH', roleCode: 'Chuyên viên' }, 'REPORTER']
];
roleCases.forEach(([employee, expected]) => assert.equal(context.qltdEmployeesRoleFor_(employee), expected));

const admin = context.qltdUsersGetByEmail_('ksngoquan@gmail.com');
assert.equal(admin.role, 'ADMIN');
assert.equal(admin.empCode, '');
context.qltdUsersTouchLastLogin_(admin.rowIndex);
assert.equal(usersSheet.getCell(2, 9), '');
assert.ok(usersSheet.getCell(2, 7) instanceof Date);

let result = context.qltdUsersRegister_({ empCode: 'P1', role: 'ADMIN', deptCode: 'FAKE' });
assert.equal(result.success, true);
assert.equal(result.role, 'PMO');
assert.equal(result.empCode, 'P1');
const rowCountAfterCreate = usersSheet.rows.length;
result = context.qltdUsersRegister_({ empCode: 'P1' });
assert.equal(result.success, true);
assert.equal(result.alreadyExists, true);
assert.equal(usersSheet.rows.length, rowCountAfterCreate);
assert.ok(lockCount >= 2);

usersSheet.appendRow(['linked@example.com', 'Linked', 'EDITOR', 'ACTIVE', 'KINHDOANH', 'Kinh doanh', '', '', 'E2']);
identityEmail = 'another@example.com';
result = context.qltdUsersRegister_({ empCode: 'E2' });
assert.equal(result.errorCode, 'EMPLOYEE_ALREADY_LINKED');

usersSheet.appendRow(['inactive-linked@example.com', 'Inactive linked', 'EDITOR', 'INACTIVE', 'KINHDOANH', 'Kinh doanh', '', '', 'E2510050']);
identityEmail = 'different@example.com';
result = context.qltdUsersRegister_({ empCode: 'E2510050' });
assert.equal(result.errorCode, 'EMPLOYEE_ALREADY_LINKED');

identityEmail = 'reporter@example.com';
result = context.qltdUsersRegister_({ empCode: 'E3', role: 'ADMIN', deptCode: 'BLD' });
assert.equal(result.success, true);
assert.equal(result.role, 'REPORTER');
assert.equal(result.deptCode, 'KINHDOANH');
identityEmail = 'inactive@example.com';
assert.equal(context.qltdUsersRegister_({ empCode: 'E4' }).errorCode, 'EMPLOYEE_INACTIVE');
identityEmail = 'invalid-dept@example.com';
assert.equal(context.qltdUsersRegister_({ empCode: 'E5' }).errorCode, 'EMPLOYEE_DEPT_INVALID');

identityEmail = 'ksngoquan@gmail.com';
let profile = JSON.parse(context.qltdDevApiProfile_({ idToken: 'valid-token' }).content);
assert.equal(profile.success, true);
assert.equal(profile.role, 'ADMIN');
assert.equal(profile.empCode, '');
const bootstrap = context.qltdDevApiBootstrap_({ idToken: 'valid-token' });
assert.equal(bootstrap.success, true);
assert.equal(bootstrap.profile.role, 'ADMIN');
usersSheet.appendRow(['inactive@example.com', 'Inactive', 'REPORTER', 'INACTIVE', 'KINHDOANH', 'Kinh doanh', '', '', '']);
identityEmail = 'inactive@example.com';
profile = JSON.parse(context.qltdDevApiProfile_({ idToken: 'valid-token' }).content);
assert.equal(profile.message, 'USER_INACTIVE');

const identityContext = {
  String,
  JSON,
  encodeURIComponent,
  qltdUsersNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdUsersBuildAuthError_: (code, message) => ({ success: false, errorCode: code, message: code, errorMessage: message }),
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'firebase-api-key' }) },
  UrlFetchApp: {
    fetch: (_url, request) => {
      assert.equal(JSON.parse(request.payload).idToken, 'valid-token');
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          users: [{ email: 'verified@example.com', emailVerified: true, localId: 'uid-1', displayName: 'Verified' }]
        })
      };
    }
  }
};
vm.createContext(identityContext);
vm.runInContext(identitySource, identityContext);
assert.equal(identityContext.qltdFirebaseResolveIdentity_({ idToken: 'valid-token' }, true).email, 'verified@example.com');
assert.equal(identityContext.qltdFirebaseResolveIdentity_({ idToken: 'valid-token', email: 'other@example.com' }, true).errorCode, 'EMAIL_MISMATCH');
identityContext.UrlFetchApp.fetch = () => ({
  getResponseCode: () => 200,
  getContentText: () => JSON.stringify({ users: [{ email: 'unverified@example.com', emailVerified: false, localId: 'uid-2' }] })
});
assert.equal(identityContext.qltdFirebaseResolveIdentity_({ idToken: 'valid-token' }, true).errorCode, 'EMAIL_NOT_VERIFIED');

const profiles = [
  { empCode: 'A1', deptCode: 'D1', deptName: 'Phòng 1', position: 'Chuyên viên' },
  { empCode: 'A2', deptCode: 'D1', deptName: 'Phòng 1', position: 'Chuyên viên' },
  { empCode: 'B1', deptCode: 'D2', deptName: 'Phòng 2', position: 'Trưởng phòng' }
];
assert.equal(buildRegistrationDepartments(profiles).length, 2);
assert.deepEqual(buildRegistrationPositions(profiles, 'D1').map((item) => item.empCode), ['A1', 'A2']);
assert.match(buildRegistrationPositions(profiles, 'D1')[0].label, /A1/);
assert.match(getRegistrationErrorMessage({ errorCode: 'EMPLOYEE_ALREADY_LINKED' }), /tài khoản Google khác/i);

assert.match(apiSource, /action === 'user_lookupemployees'/);
assert.match(apiSource, /action === 'user_register'/);
assert.doesNotMatch(apiSource, /user_getregistrationoptions/);
assert.match(bootstrapSource, /qltdFirebaseResolveIdentity_\(params, true\)/);
assert.match(appSource, /postBackendJson\(\{ action: 'user_register', empCode \}\)/);
assert.doesNotMatch(appSource, /GUEST_VIEWER/);
assert.doesNotMatch(appSource, /userGroup|BAN_LANH_DAO|DEPT_MANAGER/);

console.log('auth employee registration: PASS');
