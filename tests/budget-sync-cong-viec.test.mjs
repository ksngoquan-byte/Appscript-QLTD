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
  'apps-script-dev-api/58_Budget_Write_Service.js',
  'apps-script-dev-api/59_Budget_Aggregate_Service.js',
  'apps-script-dev-api/67_Budget_Allocation_Service.js',
  'apps-script-dev-api/68_Budget_Sync_Cong_Viec_Service.js'
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

class MockRange {
  constructor(sheet, row, column, numRows = 1, numColumns = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }
  getValues() {
    return Array.from({ length: this.numRows }, (_, r) =>
      Array.from({ length: this.numColumns }, (_, c) => this.sheet.getCell(this.row + r, this.column + c))
    );
  }
  getDisplayValues() { return this.getValues().map(row => row.map(value => String(value ?? ''))); }
  setValues(values) {
    values.forEach((row, r) => row.forEach((value, c) => this.sheet.setCell(this.row + r, this.column + c, value)));
    return this;
  }
  clearContent() { return this.setValues(Array.from({ length: this.numRows }, () => Array.from({ length: this.numColumns }, () => ''))); }
}

class MockSheet {
  constructor(name, rows = []) {
    this.name = name;
    this.rows = rows.map(row => row.slice());
    this.parent = null;
  }
  getName() { return this.name; }
  getParent() { return this.parent; }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      if ((this.rows[i] || []).some(value => String(value ?? '').trim() !== '')) return i + 1;
    }
    return 1;
  }
  getLastColumn() { return this.rows.reduce((max, row) => Math.max(max, row.length), 1); }
  getMaxRows() { return Math.max(this.rows.length, 1); }
  getMaxColumns() { return Math.max(this.getLastColumn(), 1); }
  getRange(row, column, numRows = 1, numColumns = 1) { return new MockRange(this, row, column, numRows, numColumns); }
  getDataRange() { return new MockRange(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  getCell(row, column) { return (this.rows[row - 1] || [])[column - 1] ?? ''; }
  setCell(row, column, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < column) this.rows[row - 1].push('');
    this.rows[row - 1][column - 1] = value;
  }
}

class MockSpreadsheet {
  constructor(id, sheets) {
    this.id = id;
    this.sheets = new Map();
    sheets.forEach(sheet => {
      sheet.parent = this;
      this.sheets.set(sheet.getName(), sheet);
    });
  }
  getId() { return this.id; }
  getSpreadsheetTimeZone() { return 'Asia/Ho_Chi_Minh'; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
}

function rowsWithHeader(headerRow, headers, dataRows = []) {
  return Array.from({ length: headerRow - 1 }, () => []).concat([headers], dataRows);
}

function taskRow(overrides = {}) {
  const row = {
    code: 'CV-037',
    wbs: 'I.1',
    task: 'Task 37',
    dept: 'Dept One',
    chi: 37084432112,
    thu: 0,
    status: 'Da chot',
    ...overrides
  };
  return [row.code, row.wbs, row.task, row.dept, row.chi, row.thu, row.status];
}

function itemRow(overrides = {}) {
  const row = {
    code: 'NSI-P1-D1-CV-OLD-CHI',
    projectCode: 'P1',
    projectName: 'Project 1',
    deptCode: 'D1',
    deptName: 'Dept One',
    itemName: 'Old',
    budgetType: 'TASK_LINKED',
    masterTaskCode: 'CV-OLD',
    approvedBudget: 100,
    status: 'ACTIVE',
    note: '',
    allocationCode: 'ALLOC-P1-D1-CV-OLD-CHI',
    flowType: 'CHI'
  };
  Object.assign(row, overrides);
  return [
    row.code, row.projectCode, row.projectName, row.deptCode, row.deptName,
    row.itemName, row.budgetType, row.masterTaskCode, '', '', row.approvedBudget,
    row.status, row.note, row.allocationCode, '', row.flowType
  ];
}

function allocationRow(overrides = {}) {
  const row = {
    code: 'ALLOC-P1-D1-CV-OLD-CHI',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'CV-OLD',
    deptCode: 'D1',
    deptName: 'Dept One',
    flowType: 'CHI',
    amount: 100,
    status: 'Da chot',
    note: ''
  };
  Object.assign(row, overrides);
  return [row.code, row.projectCode, row.sourceType, row.sourceCode, row.deptCode, row.deptName, row.flowType, row.amount, row.status, row.note];
}

function buildContext(options = {}) {
  const central = new MockSpreadsheet('CENTRAL', [
    new MockSheet('Projects', [
      ['ProjectCode', 'ProjectName', 'MasterSpreadsheetId', 'DeptSpreadsheetId', 'DefaultTaskSheet', 'DefaultDeptSheet', 'Status', 'SortOrder', 'Note'],
      ['P1', 'Project 1', 'MASTER_1', '', 'Cong_viec', '*', 'ACTIVE', 1, '']
    ]),
    new MockSheet('Project_Depts', [
      ['ProjectCode', 'DeptCode', 'ProjectUnitCode', 'DeptName', 'Status', 'SortOrder', 'Note'],
      ['P1', 'D1', 'UNIT1', 'Dept One', 'ACTIVE', 1, ''],
      ['P1', 'D2', 'UNIT2', 'Dept Two', 'ACTIVE', 2, '']
    ]),
    new MockSheet('CENTRAL_NS_Items', rowsWithHeader(4, ITEM_HEADERS, options.items || [])),
    new MockSheet('CENTRAL_NS_Allocations', rowsWithHeader(4, ALLOCATION_HEADERS, options.allocations || []))
  ]);
  const master = new MockSpreadsheet('MASTER_1', [
    new MockSheet('Cong_viec', rowsWithHeader(4, [
      'Ma cong viec', 'WBS', 'Cong viec', 'Chu tri',
      'Tran chi phi truc tiep', 'Du thu ke hoach', 'Trang thai ngan sach'
    ], options.tasks || [
      taskRow(),
      taskRow({ code: 'CV-092', wbs: 'I.2', task: 'Task 92', dept: 'D2', chi: 0, thu: 11480000000 })
    ]))
  ]);
  const users = {
    'viewer@example.com': { email: 'viewer@example.com', status: 'ACTIVE', role: 'VIEWER' },
    'inactive@example.com': { email: 'inactive@example.com', status: 'INACTIVE', role: 'VIEWER' }
  };
  const context = {
    console,
    getCurrentSpreadsheet_: () => central,
    qltdDevApiNormalizeEmail_: value => String(value || '').trim().toLowerCase(),
    qltdUsersGetByEmail_: email => users[email] || null,
    SpreadsheetApp: { openById: id => (id === 'MASTER_1' ? master : central) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { formatDate: value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '') },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }
  };
  vm.createContext(context);
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(repoRoot, file), 'utf8'), context, { filename: file }));
  return { context, central, master };
}

function rows(sheetName, spreadsheet) {
  return spreadsheet.getSheetByName(sheetName).rows;
}

{
  const { context, central } = buildContext();
  const preview = context.qltdBudgetSyncApprovedTaskBudgets_({ email: 'viewer@example.com', projectCode: 'P1', dryRun: '1' });
  assert.equal(preview.success, true);
  assert.equal(preview.status, 'PREVIEW');
  assert.equal(preview.data.createItems, 2);
  assert.equal(preview.data.createAllocations, 2);
  assert.equal(preview.data.sourceHeadersUsed.masterTaskCode, 'Ma cong viec');

  const sync = context.qltdBudgetSyncApprovedTaskBudgets_({ email: 'viewer@example.com', projectCode: 'P1', dryRun: '0' });
  assert.equal(sync.success, true);
  assert.equal(rows('CENTRAL_NS_Items', central).length, 6);
  assert.equal(rows('CENTRAL_NS_Allocations', central).length, 6);

  const again = context.qltdBudgetSyncApprovedTaskBudgets_({ email: 'viewer@example.com', projectCode: 'P1', dryRun: '0' });
  assert.equal(again.data.createItems, 0);
  assert.equal(again.data.createAllocations, 0);
  assert.equal(again.data.unchanged, 2);
  assert.equal(rows('CENTRAL_NS_Items', central).length, 6);
}

{
  const { context, central, master } = buildContext();
  context.qltdBudgetSyncApprovedTaskBudgets_({ email: 'viewer@example.com', projectCode: 'P1', dryRun: '0' });
  master.getSheetByName('Cong_viec').setCell(5, 5, 12345);
  const updated = context.qltdBudgetSyncApprovedTaskBudgets_({ email: 'viewer@example.com', projectCode: 'P1', dryRun: '0' });
  assert.equal(updated.data.updateItems, 1);
  assert.equal(updated.data.updateAllocations, 1);
  assert.equal(rows('CENTRAL_NS_Items', central)[4][10], 12345);
  assert.equal(rows('CENTRAL_NS_Allocations', central)[4][7], 12345);
}

{
  const { context, central, master } = buildContext();
  context.qltdBudgetSyncApprovedTaskBudgets_({ email: 'viewer@example.com', projectCode: 'P1', dryRun: '0' });
  master.getSheetByName('Cong_viec').setCell(5, 7, 'Nhap');
  const deactivated = context.qltdBudgetSyncApprovedTaskBudgets_({ email: 'viewer@example.com', projectCode: 'P1', dryRun: '0' });
  assert.equal(deactivated.data.deactivateItems, 1);
  assert.equal(deactivated.data.deactivateAllocations, 1);
  assert.equal(rows('CENTRAL_NS_Items', central)[4][11], 'INACTIVE');
}

{
  const { context, central } = buildContext({
    items: [itemRow(), itemRow({ code: 'DS1', budgetType: 'DEPT_STANDALONE', masterTaskCode: 'CV-037', allocationCode: 'ADS1' })],
    allocations: [allocationRow()]
  });
  const result = context.qltdBudgetSyncApprovedTaskBudgets_({ email: 'viewer@example.com', projectCode: 'P1', dryRun: '0' });
  assert.equal(result.success, true);
  const standalone = rows('CENTRAL_NS_Items', central).find(row => row[0] === 'DS1');
  assert.equal(standalone[6], 'DEPT_STANDALONE');
  assert.equal(standalone[11], 'ACTIVE');
}

{
  const { context } = buildContext({
    items: [itemRow({ code: 'DUP1', masterTaskCode: 'CV-037' }), itemRow({ code: 'DUP2', masterTaskCode: 'CV-037' })],
    allocations: []
  });
  const result = context.qltdBudgetSyncApprovedTaskBudgets_({ email: 'viewer@example.com', projectCode: 'P1', dryRun: '1' });
  assert.equal(result.data.conflicts.length, 1);
  assert.equal(result.data.conflicts[0].code, 'CENTRAL_BUSINESS_KEY_DUPLICATE');
}

{
  const { context } = buildContext({
    tasks: [
      taskRow({ code: '', chi: 100 }),
      taskRow({ code: 'CV-BAD-DEPT', dept: 'Unknown', chi: 100 }),
      taskRow({ code: 'CV-NEG', chi: -1 })
    ]
  });
  const result = context.qltdBudgetSyncApprovedTaskBudgets_({ email: 'viewer@example.com', projectCode: 'P1', dryRun: '1' });
  assert.equal(result.data.errors.length, 3);
  assert.ok(result.data.errors.some(error => error.errorCode === 'MASTER_TASK_CODE_MISSING'));
  assert.ok(result.data.errors.some(error => error.errorCode === 'DEPT_NOT_RESOLVED'));
  assert.ok(result.data.errors.some(error => error.errorCode === 'AMOUNT_NEGATIVE'));
}

{
  const { context } = buildContext();
  const inactive = context.qltdBudgetSyncApprovedTaskBudgets_({ email: 'inactive@example.com', projectCode: 'P1', dryRun: '1' });
  assert.equal(inactive.success, false);
  assert.equal(inactive.errors[0].code, 'ACCESS_DENIED');
}

console.log('Budget sync Cong_viec: PASS');
