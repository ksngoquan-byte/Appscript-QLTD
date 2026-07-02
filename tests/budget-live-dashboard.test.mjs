import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = process.cwd();
const files = [
  'apps-script-dev-api/40_Central_Config.js',
  'apps-script-dev-api/55_Budget_Validation.js',
  'apps-script-dev-api/50_Budget_PB_Task_Service.js',
  'apps-script-dev-api/57_Budget_Schema_Service.js',
  'apps-script-dev-api/59_Budget_Aggregate_Service.js',
  'apps-script-dev-api/67_Budget_Allocation_Service.js',
  'apps-script-dev-api/30_PERMISSIONS_SERVICE.js',
  'apps-script-dev-api/54_Budget_Dashboard_Service.js'
];

class MockRange {
  constructor(sheet, row, column, numRows = 1, numColumns = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }

  getValues() {
    const values = [];
    for (let r = 0; r < this.numRows; r += 1) {
      const row = [];
      for (let c = 0; c < this.numColumns; c += 1) {
        row.push(this.sheet.getCell(this.row + r, this.column + c));
      }
      values.push(row);
    }
    return values;
  }

  getDisplayValues() {
    return this.getValues().map(row => row.map(value => String(value ?? '')));
  }
}

class MockSheet {
  constructor(name, rows = []) {
    this.name = name;
    this.rows = rows.map(row => row.slice());
    this.parent = null;
  }

  getName() { return this.name; }
  getParent() { return this.parent; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((max, row) => Math.max(max, row.length), 1); }
  getMaxRows() { return Math.max(this.rows.length, 1); }
  getMaxColumns() { return Math.max(this.getLastColumn(), 1); }
  getDataRange() { return new MockRange(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(row, column, numRows = 1, numColumns = 1) { return new MockRange(this, row, column, numRows, numColumns); }
  getCell(row, column) { return (this.rows[row - 1] || [])[column - 1] ?? ''; }
}

class MockSpreadsheet {
  constructor(sheets) {
    this.sheets = new Map();
    sheets.forEach(sheet => {
      sheet.parent = this;
      this.sheets.set(sheet.getName(), sheet);
    });
  }

  getId() { return 'CENTRAL'; }
  getSpreadsheetTimeZone() { return 'Asia/Ho_Chi_Minh'; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
}

function rowsWithHeader(headerRow, headers, dataRows) {
  const rows = Array.from({ length: headerRow - 1 }, () => []);
  rows.push(headers);
  return rows.concat(dataRows || []);
}

function rawRow(overrides = {}) {
  const row = {
    'Report ID': 'R1',
    'Ma du an': 'P1',
    'Ten du an': 'Project 1',
    'Phong/Ban': 'Dept One',
    'Loai ky': 'Tuan',
    'Ma ky': 'WEEK-2026-06-01',
    'Ma cong viec Master': '',
    'WBS/STT': '',
    'Noi dung cong viec': '',
    'Ke hoach ngan sach ky': 0,
    'Gia tri thuc hien ky nay': 0,
    'Trang thai xac nhan': 'Da xac nhan',
    'Can cu': '',
    'Vuong mac/Ghi chu': '',
    'Nguoi gui': 'user@example.com',
    'Thoi diem gui': '2026-06-01T00:00:00.000Z',
    'Nguon file PB': '',
    'Sync status': 'SYNCED',
    'Sync at': '2026-06-01T00:00:00.000Z',
    'Sync error': '',
    'Ma khoan ngan sach': 'ITEM-THU',
    'Ten khoan ngan sach': 'Thu 1',
    'Loai ngan sach': 'DEPT_STANDALONE',
    'Nhom ngan sach': '',
    'Giai doan ngan sach': '',
    'Yeu cau ma cong viec Master': 'FALSE',
    'Ma phan bo': 'A-THU',
    'Ma cong viec chi tiet PB': '',
    'Huong dong tien': 'THU',
    'Loai ban ghi': 'PERFORMANCE_ACTUAL',
    'Ma ky cha': '',
    'Gia tri thuc thu/chi ky nay': 300,
    'Nguoi xac nhan': 'admin@example.com',
    'Thoi diem xac nhan': '2026-06-01T00:00:00.000Z',
    ...overrides
  };
  return RAW_HEADERS.map(header => row[header] ?? '');
}

const RAW_HEADERS = [
  'Report ID', 'Ma du an', 'Ten du an', 'Phong/Ban', 'Loai ky', 'Ma ky',
  'Ma cong viec Master', 'WBS/STT', 'Noi dung cong viec', 'Ke hoach ngan sach ky',
  'Gia tri thuc hien ky nay', 'Trang thai xac nhan', 'Can cu', 'Vuong mac/Ghi chu',
  'Nguoi gui', 'Thoi diem gui', 'Nguon file PB', 'Sync status', 'Sync at', 'Sync error',
  'Ma khoan ngan sach', 'Ten khoan ngan sach', 'Loai ngan sach', 'Nhom ngan sach',
  'Giai doan ngan sach', 'Yeu cau ma cong viec Master', 'Ma phan bo',
  'Ma cong viec chi tiet PB', 'Huong dong tien', 'Loai ban ghi', 'Ma ky cha',
  'Gia tri thuc thu/chi ky nay', 'Nguoi xac nhan', 'Thoi diem xac nhan'
];

const ITEM_HEADERS = [
  'Ma khoan ngan sach', 'Ma du an', 'Ten du an', 'Ma phong/ban', 'Ten phong/ban',
  'Ten khoan ngan sach', 'Loai ngan sach', 'Ma cong viec Master', 'Nhom ngan sach',
  'Giai doan ngan sach', 'Ngan sach duoc duyet', 'Trang thai', 'Ghi chu',
  'Ma phan bo', 'Ma cong viec chi tiet PB', 'Huong dong tien'
];

const ALLOCATION_HEADERS = [
  'Ma phan bo', 'Ma du an', 'Loai nguon ngan sach', 'Ma nguon ngan sach',
  'Ma phong/ban', 'Ten phong/ban', 'Huong dong tien', 'Gia tri giao', 'Trang thai', 'Ghi chu'
];

function buildCentral() {
  return new MockSpreadsheet([
    new MockSheet('Projects', [
      ['ProjectCode', 'ProjectName', 'MasterSpreadsheetId', 'DeptSpreadsheetId', 'DefaultTaskSheet', 'DefaultDeptSheet', 'Status', 'SortOrder', 'Note'],
      ['P1', 'Project 1', '', '', 'Cong_viec', '*', 'ACTIVE', 1, '']
    ]),
    new MockSheet('Project_Depts', [
      ['ProjectCode', 'DeptCode', 'ProjectUnitCode', 'DeptName', 'Status', 'SortOrder', 'Note'],
      ['P1', 'D1', '', 'Dept One', 'ACTIVE', 1, '']
    ]),
    new MockSheet('CENTRAL_NS_Items', rowsWithHeader(4, ITEM_HEADERS, [
      ['ITEM-THU', 'P1', 'Project 1', 'D1', 'Dept One', 'Thu 1', 'DEPT_STANDALONE', '', '', '', 1000, 'ACTIVE', '', 'A-THU', '', 'THU'],
      ['ITEM-CHI', 'P1', 'Project 1', 'D1', 'Dept One', 'Chi 1', 'DEPT_STANDALONE', '', '', '', 500, 'ACTIVE', '', 'A-CHI', '', 'CHI'],
      ['ITEM-ZERO', 'P1', 'Project 1', 'D1', 'Dept One', 'Chi zero', 'DEPT_STANDALONE', '', '', '', 200, 'ACTIVE', '', 'A-ZERO', '', 'CHI'],
      ['ITEM-BAD', 'P1', 'Project 1', 'D1', 'Dept One', 'Missing allocation', 'DEPT_STANDALONE', '', '', '', 100, 'ACTIVE', '', 'A-MISSING', '', 'CHI'],
      ['ITEM-INACTIVE', 'P1', 'Project 1', 'D1', 'Dept One', 'Inactive', 'DEPT_STANDALONE', '', '', '', 999, 'INACTIVE', '', 'A-INACTIVE', '', 'CHI'],
      ['TL-CHI-037', 'P1', 'Project 1', 'D1', 'Dept One', 'Direct chi CV-037', 'TASK_LINKED', 'CV-037', '', '', 37084432112, 'ACTIVE', '', 'A-TL-CHI-037', '', 'CHI'],
      ['TL-CHI-037B', 'P1', 'Project 1', 'D1', 'Dept One', 'Direct chi CV-037 extra', 'TASK_LINKED', 'CV-037', '', '', 1888, 'ACTIVE', '', 'A-TL-CHI-037B', '', 'CHI'],
      ['TL-THU-092', 'P1', 'Project 1', 'D1', 'Dept One', 'Revenue CV-092', 'TASK_LINKED', 'CV-092', '', '', 11480000000, 'ACTIVE', '', 'A-TL-THU-092', '', 'THU'],
      ['TL-DRAFT', 'P1', 'Project 1', 'D1', 'Dept One', 'Draft allocation ignored', 'TASK_LINKED', 'CV-037', '', '', 0, 'ACTIVE', '', 'A-TL-DRAFT', '', 'CHI'],
      ['TL-BLANK', 'P1', 'Project 1', 'D1', 'Dept One', 'Blank master ignored', 'TASK_LINKED', '', '', '', 0, 'ACTIVE', '', 'A-TL-BLANK', '', 'CHI'],
      ['TL-INACTIVE', 'P1', 'Project 1', 'D1', 'Dept One', 'Inactive ignored', 'TASK_LINKED', 'CV-037', '', '', 0, 'INACTIVE', '', 'A-TL-INACTIVE', '', 'CHI'],
      ['DS-WITH-MASTER', 'P1', 'Project 1', 'D1', 'Dept One', 'Standalone ignored by task budget map', 'DEPT_STANDALONE', 'CV-037', '', '', 0, 'ACTIVE', '', 'A-DS-MASTER', '', 'CHI']
    ])),
    new MockSheet('CENTRAL_NS_Allocations', rowsWithHeader(4, ALLOCATION_HEADERS, [
      ['A-THU', 'P1', 'NON_TASK', 'SRC-THU', 'D1', 'Dept One', 'THU', 1000, 'Da chot', ''],
      ['A-CHI', 'P1', 'NON_TASK', 'SRC-CHI', 'D1', 'Dept One', 'CHI', 500, 'Da chot', ''],
      ['A-ZERO', 'P1', 'NON_TASK', 'SRC-ZERO', 'D1', 'Dept One', 'CHI', 200, 'Da chot', ''],
      ['A-INACTIVE', 'P1', 'NON_TASK', 'SRC-INACTIVE', 'D1', 'Dept One', 'CHI', 999, 'Da chot', ''],
      ['A-TL-CHI-037', 'P1', 'TASK_DIRECT', 'TL-CHI-037', 'D1', 'Dept One', 'CHI', 37084432112, 'Da chot', ''],
      ['A-TL-CHI-037B', 'P1', 'TASK_DIRECT', 'TL-CHI-037B', 'D1', 'Dept One', 'CHI', 1888, 'Da chot', ''],
      ['A-TL-THU-092', 'P1', 'TASK_DIRECT', 'TL-THU-092', 'D1', 'Dept One', 'THU', 11480000000, 'Da chot', ''],
      ['A-TL-DRAFT', 'P1', 'TASK_DIRECT', 'TL-DRAFT', 'D1', 'Dept One', 'CHI', 0, 'Nhap', ''],
      ['A-TL-BLANK', 'P1', 'TASK_DIRECT', 'TL-BLANK', 'D1', 'Dept One', 'CHI', 0, 'Da chot', ''],
      ['A-TL-INACTIVE', 'P1', 'TASK_DIRECT', 'TL-INACTIVE', 'D1', 'Dept One', 'CHI', 0, 'Da chot', ''],
      ['A-DS-MASTER', 'P1', 'NON_TASK', 'DS-WITH-MASTER', 'D1', 'Dept One', 'CHI', 0, 'Da chot', '']
    ])),
    new MockSheet('CENTRAL_NS_Raw', rowsWithHeader(4, RAW_HEADERS, [
      rawRow(),
      rawRow({ 'Report ID': 'R1', 'Gia tri thuc thu/chi ky nay': 999 }),
      rawRow({ 'Report ID': 'R2', 'Ma khoan ngan sach': 'ITEM-CHI', 'Ten khoan ngan sach': 'Chi 1', 'Ma phan bo': 'A-CHI', 'Huong dong tien': 'CHI', 'Gia tri thuc thu/chi ky nay': 450 }),
      rawRow({ 'Report ID': 'R3', 'Ma khoan ngan sach': 'ITEM-CHI', 'Ma phan bo': 'A-CHI', 'Huong dong tien': 'CHI', 'Gia tri thuc thu/chi ky nay': 10, 'Sync status': 'PENDING' }),
      rawRow({ 'Report ID': 'R4', 'Ma khoan ngan sach': 'ITEM-INACTIVE', 'Ma phan bo': 'A-INACTIVE', 'Huong dong tien': 'CHI', 'Gia tri thuc thu/chi ky nay': 50 }),
      rawRow({ 'Report ID': 'R5', 'Ma khoan ngan sach': 'ITEM-CHI', 'Ma phan bo': 'A-CHI', 'Huong dong tien': 'CHI', 'Loai ban ghi': 'PLAN_MONTH', 'Gia tri thuc thu/chi ky nay': 10000 })
    ])),
    new MockSheet('CENTRAL_NS_Tong_hop', rowsWithHeader(4, ['unused'], [['must not be read']])),
    new MockSheet('CENTRAL_NS_Dashboard', rowsWithHeader(4, ['unused'], []))
  ]);
}

function loadContext() {
  const central = buildCentral();
  const users = {
    'viewer@example.com': { email: 'viewer@example.com', status: 'ACTIVE', role: 'VIEWER' },
    'inactive@example.com': { email: 'inactive@example.com', status: 'INACTIVE', role: 'VIEWER' }
  };
  const context = {
    console,
    getCurrentSpreadsheet_: () => central,
    qltdDevApiNormalizeEmail_: value => String(value || '').trim().toLowerCase(),
    qltdUsersGetByEmail_: email => users[email] || null,
    SpreadsheetApp: { openById: () => central },
    Utilities: {
      formatDate: value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '')
    },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }
  };
  vm.createContext(context);
  files.forEach(file => {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, file), 'utf8'), context, { filename: file });
  });
  return context;
}

const context = loadContext();
assert.equal(context.qltdCanUseGeneralFeature_({ status: 'ACTIVE', role: 'VIEWER' }), true);
assert.equal(context.qltdCanUseAdminFeature_({ status: 'ACTIVE', role: 'VIEWER' }), false);
assert.equal(context.qltdCanUseAdminFeature_({ status: 'ACTIVE', role: 'ADMIN' }), true);
assert.equal(context.qltdCanUseGeneralFeature_({ status: 'INACTIVE', role: 'ADMIN' }), false);

const result = context.qltdBudgetGetLiveDashboard_({ email: 'viewer@example.com', projectCode: 'P1', deptCode: 'D1', view: 'department' });
assert.equal(result.success, true);
assert.equal(result.data.project.projectCode, 'P1');
assert.equal(result.data.department.deptCode, 'D1');
assert.equal(result.data.thu.planAmount, 11480001000);
assert.equal(result.data.thu.actualAmount, 300);
assert.equal(result.data.chi.planAmount, 37084434700);
assert.equal(result.data.chi.actualAmount, 450);
assert.equal(result.data.balance.plannedBalance, -25604433700);
assert.equal(result.data.balance.actualBalance, -150);
assert.equal(result.data.formulas.sourceRule.includes('CENTRAL_NS_Raw'), true);
assert.equal(result.data.formulas.sourceRule.includes('Report ID'), true);
assert.ok(result.data.sourceSheets.includes('CENTRAL_NS_Raw'));
assert.ok(!result.data.sourceSheets.includes('CENTRAL_NS_Tong_hop'));

const zeroItem = result.data.items.find(item => item.budgetItemCode === 'ITEM-ZERO');
assert.ok(zeroItem, 'active budget item with actual=0 must be visible');
assert.equal(zeroItem.actualAmount, 0);
assert.equal(zeroItem.statusLabel, 'Chua thuc hien');

const badItem = result.data.items.find(item => item.budgetItemCode === 'ITEM-BAD');
assert.equal(badItem.allocationValid, false);
assert.equal(badItem.plannedAmount, 100);
assert.equal(result.data.alerts.some(alert => alert.code === 'ALLOCATION_NOT_FOUND'), true);
assert.equal(result.data.alerts.some(alert => alert.code === 'RAW_REPORT_ID_DUPLICATE'), true);
assert.equal(result.data.alerts.some(alert => alert.code === 'RAW_NOT_SYNCED'), true);
assert.equal(result.data.alerts.some(alert => alert.code === 'RAW_WITHOUT_ACTIVE_ITEM'), true);
assert.equal(result.data.alertsSummary.data >= 4, true);
assert.equal(result.data.alertsSummary.business >= 2, true);

const taskBudget = context.qltdBudgetGetTaskBudgetMap_({ email: 'viewer@example.com', projectCode: 'P1' });
assert.equal(taskBudget.success, true);
assert.deepEqual(Object.keys(taskBudget.data.byMasterTaskCode).sort(), ['CV-037', 'CV-092']);
assert.equal(taskBudget.data.byMasterTaskCode['CV-037'].directChiPlan, 37084434000);
assert.equal(taskBudget.data.byMasterTaskCode['CV-037'].plannedRevenue, 0);
assert.equal(taskBudget.data.byMasterTaskCode['CV-037'].chiItemCount, 2);
assert.equal(taskBudget.data.byMasterTaskCode['CV-092'].plannedRevenue, 11480000000);
assert.equal(taskBudget.data.byMasterTaskCode['CV-092'].directChiPlan, 0);
assert.equal(taskBudget.data.byMasterTaskCode['CV-092'].thuItemCount, 1);
assert.equal(taskBudget.data.formulas.rollup, 'direct-only; no parent/child roll-up');
assert.ok(taskBudget.data.sourceSheets.includes('CENTRAL_NS_Items'));
assert.ok(taskBudget.data.sourceSheets.includes('CENTRAL_NS_Allocations'));
assert.ok(!taskBudget.data.sourceSheets.includes('CENTRAL_NS_Raw'));

const inactive = context.qltdBudgetGetLiveDashboard_({ email: 'inactive@example.com', projectCode: 'P1' });
assert.equal(inactive.success, false);
assert.equal(inactive.errors[0].code, 'ACCESS_DENIED');

console.log('Budget live dashboard: PASS');
