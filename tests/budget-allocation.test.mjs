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
  'apps-script-dev-api/67_Budget_Allocation_Service.js'
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

  setValues(values) {
    if (this.sheet.failSetValues) {
      const failure = this.sheet.failSetValues({
        row: this.row,
        column: this.column,
        numRows: this.numRows,
        numColumns: this.numColumns,
        values
      });
      if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
    }
    values.forEach((row, r) => {
      row.forEach((value, c) => this.sheet.setCell(this.row + r, this.column + c, value));
    });
    return this;
  }

  clearContent() {
    for (let r = 0; r < this.numRows; r += 1) {
      for (let c = 0; c < this.numColumns; c += 1) {
        this.sheet.setCell(this.row + r, this.column + c, '');
      }
    }
    return this;
  }

  getDataValidations() {
    return Array.from({ length: this.numRows }, () => Array.from({ length: this.numColumns }, () => null));
  }

  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getColumn() { return this.column; }
  getCell(row, column) { return new MockRange(this.sheet, this.row + row - 1, this.column + column - 1, 1, 1); }
  getA1Notation() { return `R${this.row}C${this.column}`; }
}

class MockSheet {
  constructor(name, rows = []) {
    this.name = name;
    this.rows = rows.map(row => row.slice());
    this.parent = null;
    this.failSetValues = null;
  }

  getName() { return this.name; }
  getParent() { return this.parent; }
  getLastRow() {
    for (let r = this.rows.length - 1; r >= 0; r -= 1) {
      if ((this.rows[r] || []).some(value => String(value ?? '').trim() !== '')) return r + 1;
    }
    return 1;
  }

  getLastColumn() {
    return this.rows.reduce((max, row) => Math.max(max, row.length), 1);
  }

  getMaxRows() { return Math.max(this.rows.length, this.getLastRow(), 1); }
  getMaxColumns() { return Math.max(this.getLastColumn(), 1); }
  getRange(row, column, numRows = 1, numColumns = 1) { return new MockRange(this, row, column, numRows, numColumns); }
  getDataRange() { return new MockRange(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  insertRowsAfter(row, count) {
    while (this.rows.length < row) this.rows.push([]);
    for (let i = 0; i < count; i += 1) this.rows.splice(row, 0, []);
  }

  getCell(row, column) {
    return (this.rows[row - 1] || [])[column - 1] ?? '';
  }

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

function rowsWithHeader(headerRow, headers, dataRows) {
  const rows = Array.from({ length: headerRow - 1 }, () => []);
  rows.push(headers);
  return rows.concat(dataRows || []);
}

function buildCentral(allocationRows = [], options = {}) {
  const projects = new MockSheet('Projects', [
    ['ProjectCode', 'ProjectName', 'MasterSpreadsheetId', 'DeptSpreadsheetId', 'DefaultTaskSheet', 'DefaultDeptSheet', 'Status', 'SortOrder', 'Note'],
    ['P1', 'Project 1', 'MASTER_1', '', 'Cong_viec', '*', 'ACTIVE', 1, '']
  ]);
  const depts = new MockSheet('Project_Depts', [
    ['ProjectCode', 'DeptCode', 'ProjectUnitCode', 'DeptName', 'Status', 'SortOrder', 'Note'],
    ['P1', 'D1', '', 'Dept One', 'ACTIVE', 1, '']
  ]);
  const allocations = new MockSheet('CENTRAL_NS_Allocations', rowsWithHeader(4, [
    'Ma phan bo',
    'Ma du an',
    'Loai nguon ngan sach',
    'Ma nguon ngan sach',
    'Ma phong/ban',
    'Ten phong/ban',
    'Huong dong tien',
    'Gia tri giao',
    'Trang thai',
    'Ghi chu'
  ], allocationRows));
  const syncLog = new MockSheet('SYS_Sync_Log', rowsWithHeader(4, [
    'Thoi diem',
    'Nguoi/He thong',
    'Hanh dong',
    'Ma du an',
    'File nguon',
    'Sheet nguon',
    'So dong xu ly',
    'Ket qua',
    'Loi/Ghi chu'
  ], options.syncLogRows || []));
  const items = new MockSheet('CENTRAL_NS_Items', rowsWithHeader(4, [
    'Ma khoan ngan sach', 'Ma du an', 'Ten du an', 'Ma phong/ban', 'Ten phong/ban',
    'Ten khoan ngan sach', 'Loai ngan sach', 'Ma cong viec Master', 'Nhom ngan sach',
    'Giai doan ngan sach', 'Ngan sach duoc duyet', 'Trang thai', 'Ghi chu',
    'Ma phan bo', 'Ma cong viec chi tiet PB', 'Huong dong tien'
  ], []));
  return new MockSpreadsheet('CENTRAL', [projects, depts, allocations, syncLog, items]);
}

function buildMaster(options = {}) {
  const task = new MockSheet('Cong_viec', rowsWithHeader(4, [
    'Ma cong viec Master',
    'Noi dung cong viec',
    'Tran chi phi truc tiep',
    'Du thu ke hoach',
    'Trang thai ngan sach'
  ], [
    ['TASK1', 'Task 1', 100, 200, 'Đã chốt'],
    ['TASK_DRAFT', 'Task draft', 100, 100, 'Nháp'],
    ['TASK_ZERO', 'Task zero', 0, 0, 'Đã chốt'],
    ['TASK_BLANK', 'Task blank', '', 100, 'Đã chốt'],
    ['TASK_TEXT', 'Task text', 'abc', 100, 'Đã chốt'],
    ['TASK_NEG', 'Task negative', -1, 100, 'Đã chốt']
  ]));
  const nonTask = new MockSheet('NS_Khong_Gan_CV', rowsWithHeader(4, [
    'Ma nguon ngan sach',
    'Ten nguon ngan sach',
    'Phong/Ban chu tri',
    'Huong dong tien',
    'Gia tri ke hoach',
    'Trang thai ngan sach'
  ], [
    ['NT1', 'Non task THU', 'Dept One', 'THU', 300, 'Đã chốt'],
    ['NT_DRAFT', 'Non task draft', 'Dept One', 'CHI', 50, 'Nháp']
  ]));
  if (options.mutateTask) options.mutateTask(task);
  if (options.mutateNonTask) options.mutateNonTask(nonTask);
  return new MockSpreadsheet('MASTER_1', [task, nonTask]);
}

function loadContext(allocationRows = [], options = {}) {
  const central = buildCentral(allocationRows, options);
  const master = buildMaster(options);
  const users = {
    'admin@example.com': { email: 'admin@example.com', status: 'ACTIVE', role: 'ADMIN' },
    'inactive@example.com': { email: 'inactive@example.com', status: 'INACTIVE', role: 'ADMIN' },
    'member@example.com': { email: 'member@example.com', status: 'ACTIVE', role: 'USER' }
  };
  const context = {
    console,
    getCurrentSpreadsheet_: () => central,
    qltdDevApiNormalizeEmail_: value => String(value || '').trim().toLowerCase(),
    qltdUsersGetByEmail_: email => users[email] || null,
    SpreadsheetApp: {
      openById: id => {
        if (id === 'MASTER_1') return master;
        if (id === 'CENTRAL') return central;
        throw new Error(`Spreadsheet not found: ${id}`);
      }
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {}
      })
    },
    Logger: { log: () => {} },
    Utilities: {
      formatDate: value => {
        if (value instanceof Date) return value.toISOString().slice(0, 10);
        return String(value || '');
      }
    },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }
  };
  vm.createContext(context);
  files.forEach(file => {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, file), 'utf8'), context, { filename: file });
  });
  return { context, central, master };
}

const draft60 = ['A_DRAFT_60', 'P1', 'TASK_DIRECT', 'TASK1', 'D1', 'Dept One', 'CHI', 60, 'Nháp', ''];
const confirmed40 = ['A_CONFIRMED_40', 'P1', 'TASK_DIRECT', 'TASK1', 'D1', 'Dept One', 'CHI', 40, 'Đã chốt', ''];
const cancelled10 = ['A_CANCELLED_10', 'P1', 'TASK_DIRECT', 'TASK1', 'D1', 'Dept One', 'CHI', 10, 'Hủy', ''];

{
  const { context } = loadContext([draft60]);
  const draft = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_DRAFT_60',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 60,
    status: 'DRAFT',
    email: 'admin@example.com'
  });
  assert.equal(draft.success, true);
  assert.equal(draft.data.capacity.availableAfter, 40);

  const confirm40 = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_CONFIRM_40_NEW',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 40,
    status: 'CONFIRMED',
    email: 'admin@example.com'
  });
  assert.equal(confirm40.success, true);
  assert.equal(confirm40.data.canConfirm, true);

  const exceed = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_EXCEED',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 41,
    status: 'DRAFT',
    email: 'admin@example.com'
  });
  assert.equal(exceed.success, false);
  assert.equal(exceed.errors[0].code, 'ALLOCATION_EXCEEDS_SOURCE');
}

{
  const { context } = loadContext([]);
  const thu = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_THU',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'THU',
    amount: 200,
    status: 'CONFIRMED',
    email: 'admin@example.com'
  });
  assert.equal(thu.success, true);
  assert.equal(thu.data.source.sourceAmount, 200);

  const flowMismatch = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_FLOW',
    projectCode: 'P1',
    sourceType: 'NON_TASK',
    sourceCode: 'NT1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 1,
    status: 'DRAFT',
    email: 'admin@example.com'
  });
  assert.equal(flowMismatch.success, false);
  assert.equal(flowMismatch.errors[0].code, 'ALLOCATION_FLOW_MISMATCH');
}

{
  const { context } = loadContext([]);
  const ok = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_NT',
    projectCode: 'P1',
    sourceType: 'NON_TASK',
    sourceCode: 'NT1',
    deptCode: 'D1',
    flowType: 'THU',
    amount: 300,
    status: 'CONFIRMED',
    email: 'admin@example.com'
  });
  assert.equal(ok.success, true);

  const missing = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_MISSING',
    projectCode: 'P1',
    sourceType: 'NON_TASK',
    sourceCode: 'NOPE',
    deptCode: 'D1',
    flowType: 'THU',
    amount: 1,
    status: 'DRAFT',
    email: 'admin@example.com'
  });
  assert.equal(missing.success, false);
  assert.equal(missing.errors[0].code, 'ALLOCATION_SOURCE_NOT_FOUND');

  const draftSource = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_DRAFT_SOURCE',
    projectCode: 'P1',
    sourceType: 'NON_TASK',
    sourceCode: 'NT_DRAFT',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 1,
    status: 'DRAFT',
    email: 'admin@example.com'
  });
  assert.equal(draftSource.success, false);
  assert.equal(draftSource.errors[0].code, 'ALLOCATION_SOURCE_NOT_READY');
}

{
  const { context } = loadContext([draft60, confirmed40, cancelled10]);
  const updateDraft = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_DRAFT_60',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 60,
    status: 'CONFIRMED',
    email: 'admin@example.com'
  });
  assert.equal(updateDraft.success, true);

  const changeConfirmed = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_CONFIRMED_40',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 45,
    status: 'CONFIRMED',
    email: 'admin@example.com'
  });
  assert.equal(changeConfirmed.success, false);
  assert.equal(changeConfirmed.errors[0].code, 'ALLOCATION_CONFIRMED_IMMUTABLE');

  const cancelConfirmed = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_CONFIRMED_40',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 40,
    status: 'CANCELLED',
    email: 'admin@example.com'
  });
  assert.equal(cancelConfirmed.success, true);

  const reviveCancelled = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_CANCELLED_10',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 10,
    status: 'DRAFT',
    email: 'admin@example.com'
  });
  assert.equal(reviveCancelled.success, false);
  assert.equal(reviveCancelled.errors[0].code, 'ALLOCATION_CANCELLED_IMMUTABLE');
}

{
  const { context, central } = loadContext([]);
  const allocationsSheet = central.getSheetByName('CENTRAL_NS_Allocations');
  const beforeRows = allocationsSheet.getLastRow();
  const dryRun = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_DRYRUN',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 10,
    status: 'DRAFT',
    email: 'admin@example.com'
  });
  assert.equal(dryRun.success, true);
  assert.equal(allocationsSheet.getLastRow(), beforeRows);

  const upsert = context.qltdBudgetUpsertAllocation_({
    requestId: 'REQ12345',
    confirm: 'YES_WRITE_BUDGET',
    email: 'admin@example.com',
    allocationCode: 'A_WRITE',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 10,
    status: 'DRAFT',
    note: 'write test'
  });
  assert.equal(upsert.success, true);
  assert.equal(allocationsSheet.getLastRow(), beforeRows + 1);

  const duplicate = context.qltdBudgetUpsertAllocation_({
    requestId: 'REQ12345',
    confirm: 'YES_WRITE_BUDGET',
    email: 'admin@example.com',
    allocationCode: 'A_WRITE_OTHER',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 10,
    status: 'DRAFT'
  });
  assert.equal(duplicate.success, true);
  assert.equal(duplicate.apiStatus, 'ALREADY_PROCESSED');
  assert.equal(allocationsSheet.getLastRow(), beforeRows + 1);
}

{
  const { context } = loadContext([]);
  const summaryRow = context.qltdBudgetSummaryToRow_({
    projectCode: 'P1',
    projectName: 'Project 1',
    periodType: 'WEEK',
    periodCode: 'W1',
    masterTaskCode: 'TASK1',
    wbs: '1',
    taskName: 'Task 1',
    deptName: 'Dept One',
    totalBudget: 100,
    plan: 10,
    actual: 5,
    cumulative: 5,
    remaining: 95,
    usageRate: 0.05,
    warning: '',
    updatedAt: '',
    budgetItemCode: 'BI1',
    budgetItemName: 'Budget item',
    budgetType: 'TASK_LINKED',
    budgetGroup: 'Group',
    budgetStage: 'Stage'
  });
  const dashboardRow = context.qltdBudgetDashboardToRow_({
    metricGroup: 'NGAN_SACH',
    metricName: 'Tong',
    projectCode: 'P1',
    projectName: 'Project 1',
    periodType: 'WEEK',
    periodCode: 'W1',
    value: 100,
    unit: 'VND',
    updatedAt: '',
    note: '',
    deptCode: 'D1',
    deptName: 'Dept One',
    budgetType: 'TASK_LINKED',
    budgetGroup: 'Group',
    budgetItemCode: 'BI1'
  });
  assert.equal(summaryRow.length, vm.runInContext('QLTD_BUDGET_CENTRAL_SUMMARY_HEADERS.length', context));
  assert.equal(summaryRow.length, 28);
  assert.equal(dashboardRow.length, vm.runInContext('QLTD_BUDGET_CENTRAL_DASHBOARD_HEADERS.length', context));
  assert.equal(dashboardRow.length, 19);
}

{
  const { context } = loadContext([draft60]);
  const anonymous = context.qltdBudgetGetAllocations_({});
  assert.equal(anonymous.success, false);
  assert.equal(anonymous.errors[0].code, 'EMAIL_REQUIRED');

  const inactive = context.qltdBudgetGetAllocations_({ email: 'inactive@example.com' });
  assert.equal(inactive.success, false);
  assert.equal(inactive.errors[0].code, 'FORBIDDEN');

  const member = context.qltdBudgetGetAllocations_({ email: 'member@example.com' });
  assert.equal(member.success, false);
  assert.equal(member.errors[0].code, 'FORBIDDEN');

  const admin = context.qltdBudgetGetAllocations_({ email: 'admin@example.com' });
  assert.equal(admin.success, true);
  assert.equal(admin.data.count, 1);

  const memberCheck = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_AUTH',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 1,
    status: 'DRAFT',
    email: 'member@example.com'
  });
  assert.equal(memberCheck.success, false);
  assert.equal(memberCheck.errors[0].code, 'FORBIDDEN');

  const memberWrite = context.qltdBudgetUpsertAllocation_({
    requestId: 'REQAUTH1',
    confirm: 'YES_WRITE_BUDGET',
    email: 'member@example.com',
    allocationCode: 'A_AUTH_WRITE',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 1,
    status: 'DRAFT'
  });
  assert.equal(memberWrite.success, false);
  assert.equal(memberWrite.errors[0].code, 'FORBIDDEN');
  assert.equal(memberWrite.source, vm.runInContext('QLTD_BUDGET_ALLOCATION_SOURCE', context));
}

{
  const { context } = loadContext([draft60]);
  for (const invalidFilter of [
    { sourceType: 'BAD_SOURCE' },
    { flowType: 'BAD_FLOW' },
    { status: 'BAD_STATUS' }
  ]) {
    const result = context.qltdBudgetGetAllocations_(Object.assign({ email: 'admin@example.com' }, invalidFilter));
    assert.equal(result.success, false);
    assert.equal(result.apiStatus, 'VALIDATION_ERROR');
    assert.equal(result.data, null);
  }
}

{
  const { context, central } = loadContext([], {
    syncLogRows: [
      ['2026-01-01T00:00:00.000Z', 'admin@example.com', 'BUDGET_ALLOCATION_UPSERT', 'P1', '', 'CENTRAL_NS_Allocations', 0, 'PENDING', 'requestId=REQPEND1; allocationCode=A_PENDING']
    ]
  });
  const allocationsSheet = central.getSheetByName('CENTRAL_NS_Allocations');
  const result = context.qltdBudgetUpsertAllocation_({
    requestId: 'REQPEND1',
    confirm: 'YES_WRITE_BUDGET',
    email: 'admin@example.com',
    allocationCode: 'A_PENDING_RETRY',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 1,
    status: 'DRAFT'
  });
  assert.equal(result.success, false);
  assert.equal(result.apiStatus, 'REQUEST_IN_PROGRESS');
  assert.equal(allocationsSheet.getLastRow(), 4);
}

{
  const { context, central } = loadContext([], {
    syncLogRows: [
      ['2026-01-01T00:00:00.000Z', 'admin@example.com', 'BUDGET_ALLOCATION_UPSERT', 'P1', '', 'CENTRAL_NS_Allocations', 0, 'ERROR', 'requestId=REQERR01; allocationCode=A_ERROR']
    ]
  });
  const result = context.qltdBudgetUpsertAllocation_({
    requestId: 'REQERR01',
    confirm: 'YES_WRITE_BUDGET',
    email: 'admin@example.com',
    allocationCode: 'A_ERROR_RETRY',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 1,
    status: 'DRAFT'
  });
  assert.equal(result.success, false);
  assert.equal(result.apiStatus, 'RETRY_BLOCKED');
  assert.equal(central.getSheetByName('CENTRAL_NS_Allocations').getLastRow(), 4);
}

{
  const { context, central } = loadContext([], {
    syncLogRows: [
      ['2026-01-01T00:00:00.000Z', 'admin@example.com', 'BUDGET_ALLOCATION_UPSERT', 'P1', '', 'CENTRAL_NS_Allocations', 1, 'SUCCESS', 'requestId=REQ123456; allocationCode=A_OLD']
    ]
  });
  const result = context.qltdBudgetUpsertAllocation_({
    requestId: 'REQ12345',
    confirm: 'YES_WRITE_BUDGET',
    email: 'admin@example.com',
    allocationCode: 'A_EXACT_MATCH',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 1,
    status: 'DRAFT'
  });
  assert.equal(result.success, true);
  assert.equal(central.getSheetByName('CENTRAL_NS_Allocations').getLastRow(), 5);
}

{
  const { context, central } = loadContext([]);
  const syncLog = central.getSheetByName('SYS_Sync_Log');
  const allocationsSheet = central.getSheetByName('CENTRAL_NS_Allocations');
  syncLog.failSetValues = ({ row }) => {
    if (row > 4) {
      const error = new Error('mock pending log write failed');
      error.code = 'MOCK_PENDING_LOG_FAILED';
      return error;
    }
    return null;
  };
  const result = context.qltdBudgetUpsertAllocation_({
    requestId: 'REQPFAIL',
    confirm: 'YES_WRITE_BUDGET',
    email: 'admin@example.com',
    allocationCode: 'A_PENDING_FAIL',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 1,
    status: 'DRAFT'
  });
  assert.equal(result.success, false);
  assert.equal(result.errors[0].code, 'IDEMPOTENCY_PENDING_FAILED');
  assert.equal(allocationsSheet.getLastRow(), 4);
}

{
  const { context, central } = loadContext([]);
  const allocationsSheet = central.getSheetByName('CENTRAL_NS_Allocations');
  allocationsSheet.failSetValues = ({ row }) => {
    if (row > 4) {
      const error = new Error('mock allocation write failed');
      error.code = 'MOCK_ALLOCATION_WRITE_FAILED';
      return error;
    }
    return null;
  };
  const result = context.qltdBudgetUpsertAllocation_({
    requestId: 'REQWFAIL',
    confirm: 'YES_WRITE_BUDGET',
    email: 'admin@example.com',
    allocationCode: 'A_WRITE_FAIL',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 1,
    status: 'DRAFT'
  });
  assert.equal(result.success, false);
  assert.equal(result.errors[0].code, 'MOCK_ALLOCATION_WRITE_FAILED');
  assert.equal(central.getSheetByName('SYS_Sync_Log').getCell(5, 8), 'ERROR');
}

{
  const { context, central } = loadContext([]);
  const syncLog = central.getSheetByName('SYS_Sync_Log');
  syncLog.failSetValues = ({ row, column }) => {
    if (row > 4 && column === 8) {
      const error = new Error('mock finalize failed');
      error.code = 'MOCK_FINALIZE_FAILED';
      return error;
    }
    return null;
  };
  const result = context.qltdBudgetUpsertAllocation_({
    requestId: 'REQFFAIL',
    confirm: 'YES_WRITE_BUDGET',
    email: 'admin@example.com',
    allocationCode: 'A_FINALIZE_FAIL',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 1,
    status: 'DRAFT'
  });
  assert.equal(result.success, false);
  assert.equal(result.errors[0].code, 'IDEMPOTENCY_FINALIZE_FAILED');
  assert.equal(result.data.allocationCode, 'A_FINALIZE_FAIL');
  assert.equal(central.getSheetByName('CENTRAL_NS_Allocations').getLastRow(), 5);
}

{
  const { context } = loadContext([]);
  for (const sourceCode of ['TASK_BLANK', 'TASK_TEXT', 'TASK_NEG']) {
    const result = context.qltdBudgetCheckAllocation_({
      allocationCode: `A_${sourceCode}`,
      projectCode: 'P1',
      sourceType: 'TASK_DIRECT',
      sourceCode,
      deptCode: 'D1',
      flowType: 'CHI',
      amount: 1,
      status: 'DRAFT',
      email: 'admin@example.com'
    });
    assert.equal(result.success, false);
    assert.equal(result.errors[0].code, 'ALLOCATION_SOURCE_AMOUNT_INVALID');
  }

  const zero = context.qltdBudgetCheckAllocation_({
    allocationCode: 'A_ZERO',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK_ZERO',
    deptCode: 'D1',
    flowType: 'CHI',
    amount: 1,
    status: 'DRAFT',
    email: 'admin@example.com'
  });
  assert.equal(zero.success, false);
  assert.equal(zero.errors[0].code, 'ALLOCATION_EXCEEDS_SOURCE');
}

console.log('budget-allocation tests passed');
