import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = process.cwd();
const sourceFiles = [
  'apps-script-dev-api/40_Central_Config.js',
  'apps-script-dev-api/55_Budget_Validation.js',
  'apps-script-dev-api/50_Budget_PB_Task_Service.js',
  'apps-script-dev-api/57_Budget_Schema_Service.js',
  'apps-script-dev-api/51_Budget_Report_Service.js',
  'apps-script-dev-api/58_Budget_Write_Service.js',
  'apps-script-dev-api/59_Budget_Aggregate_Service.js',
  'apps-script-dev-api/67_Budget_Allocation_Service.js'
];

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
  'Ma phong/ban', 'Ten phong/ban', 'Huong dong tien', 'Gia tri giao',
  'Trang thai', 'Ghi chu'
];

const CONFIRMED_LABEL = '\u0110\u00e3 x\u00e1c nh\u1eadn';
const SUBMITTED_LABEL = '\u0110\u00e3 g\u1eedi';
const MONTH_LABEL = 'Th\u00e1ng';
const WEEK_LABEL = 'Tu\u1ea7n';

class MockRange {
  constructor(sheet, row, column, numRows = 1, numColumns = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }

  getValues() {
    return Array.from({ length: this.numRows }, (_, rowOffset) =>
      Array.from({ length: this.numColumns }, (_, columnOffset) =>
        this.sheet.getCell(this.row + rowOffset, this.column + columnOffset)
      )
    );
  }

  getDisplayValues() {
    return this.getValues().map(row => row.map(value => String(value ?? '')));
  }

  getValue() {
    return this.sheet.getCell(this.row, this.column);
  }

  setValue(value) {
    this.sheet.setCell(this.row, this.column, value);
    return this;
  }

  setValues(values) {
    values.forEach((row, rowOffset) => {
      row.forEach((value, columnOffset) => {
        this.sheet.setCell(this.row + rowOffset, this.column + columnOffset, value);
      });
    });
    return this;
  }

  clearContent() {
    for (let rowOffset = 0; rowOffset < this.numRows; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < this.numColumns; columnOffset += 1) {
        this.sheet.setCell(this.row + rowOffset, this.column + columnOffset, '');
      }
    }
    return this;
  }

  getDataValidations() {
    return Array.from({ length: this.numRows }, () =>
      Array.from({ length: this.numColumns }, () => null)
    );
  }

  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getColumn() { return this.column; }
  getCell(row, column) {
    return new MockRange(this.sheet, this.row + row - 1, this.column + column - 1);
  }
  getA1Notation() { return `R${this.row}C${this.column}`; }
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
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if ((this.rows[index] || []).some(value => String(value ?? '').trim() !== '')) return index + 1;
    }
    return 1;
  }
  getLastColumn() {
    return this.rows.reduce((max, row) => Math.max(max, row.length), 1);
  }
  getMaxRows() { return Math.max(this.rows.length, 1); }
  getMaxColumns() { return Math.max(this.getLastColumn(), 1); }
  getRange(row, column, numRows = 1, numColumns = 1) {
    return new MockRange(this, row, column, numRows, numColumns);
  }
  getDataRange() {
    return new MockRange(this, 1, 1, this.getLastRow(), this.getLastColumn());
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

function rowsWithHeader(headerRow, headers, dataRows = []) {
  return Array.from({ length: headerRow - 1 }, () => []).concat([headers], dataRows);
}

function itemRow(overrides = {}) {
  const value = {
    budgetItemCode: 'BI1',
    projectCode: 'P1',
    projectName: 'Project 1',
    deptCode: 'D1',
    deptName: 'Dept One',
    budgetItemName: 'Budget item 1',
    budgetType: 'TASK_LINKED',
    masterTaskCode: 'TASK1',
    budgetGroup: 'GROUP',
    budgetStage: 'MVP',
    approvedBudget: 60,
    status: 'ACTIVE',
    note: '',
    allocationCode: 'A1',
    pbTaskCode: 'PB1',
    flowType: 'CHI',
    ...overrides
  };
  return [
    value.budgetItemCode, value.projectCode, value.projectName, value.deptCode, value.deptName,
    value.budgetItemName, value.budgetType, value.masterTaskCode, value.budgetGroup,
    value.budgetStage, value.approvedBudget, value.status, value.note, value.allocationCode,
    value.pbTaskCode, value.flowType
  ];
}

function allocationRow(overrides = {}) {
  const value = {
    allocationCode: 'A1',
    projectCode: 'P1',
    sourceType: 'TASK_DIRECT',
    sourceCode: 'TASK1',
    deptCode: 'D1',
    deptName: 'Dept One',
    flowType: 'CHI',
    allocatedAmount: 100,
    status: 'CONFIRMED',
    note: '',
    ...overrides
  };
  return [
    value.allocationCode, value.projectCode, value.sourceType, value.sourceCode,
    value.deptCode, value.deptName, value.flowType, value.allocatedAmount,
    value.status, value.note
  ];
}

function buildContext(options = {}) {
  const projects = new MockSheet('Projects', [
    ['ProjectCode', 'ProjectName', 'MasterSpreadsheetId', 'DeptSpreadsheetId', 'DefaultTaskSheet', 'DefaultDeptSheet', 'Status', 'SortOrder', 'Note'],
    ['P1', 'Project 1', 'MASTER_1', 'DEPT_1', 'Cong_viec', '*', 'ACTIVE', 1, '']
  ]);
  const departments = new MockSheet('Project_Depts', [
    ['ProjectCode', 'DeptCode', 'ProjectUnitCode', 'DeptName', 'Status', 'SortOrder', 'Note'],
    ['P1', 'D1', '', 'Dept One', 'ACTIVE', 1, '']
  ]);
  const items = new MockSheet('CENTRAL_NS_Items', rowsWithHeader(4, ITEM_HEADERS, options.items || [itemRow()]));
  const allocations = new MockSheet('CENTRAL_NS_Allocations', rowsWithHeader(4, ALLOCATION_HEADERS, options.allocations || [allocationRow()]));
  const raw = new MockSheet('CENTRAL_NS_Raw', rowsWithHeader(4, RAW_HEADERS));
  const central = new MockSpreadsheet('CENTRAL', [projects, departments, items, allocations, raw]);

  const deptSheet = new MockSheet('D1', rowsWithHeader(4, [
    'STT', 'Noi dung cong viec', 'Ke hoach ngan sach', 'Ngan sach thuc te',
    'Ghi chu cap nhat', 'Ma cong viec Master', 'Loai dong'
  ], [['1', 'Task one', 0, 0, '', 'TASK1', 'TASK']]));
  const deptSpreadsheet = new MockSpreadsheet('DEPT_1', [deptSheet]);
  const users = {
    'admin@example.com': { email: 'admin@example.com', status: 'ACTIVE', role: 'ADMIN' }
  };

  const context = {
    console,
    getCurrentSpreadsheet_: () => central,
    qltdDevApiNormalizeEmail_: value => String(value || '').trim().toLowerCase(),
    qltdUsersGetByEmail_: email => users[email] || null,
    SpreadsheetApp: {
      openById: id => {
        if (id === 'DEPT_1') return deptSpreadsheet;
        if (id === 'CENTRAL') return central;
        throw new Error(`Spreadsheet not found: ${id}`);
      }
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
    },
    Logger: { log: () => {} },
    Utilities: {
      formatDate: value => new Date(value).toISOString().slice(0, 10)
    },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }
  };
  vm.createContext(context);
  sourceFiles.forEach(file => {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, file), 'utf8'), context, { filename: file });
  });
  return { context, central, deptSheet };
}

function basePayload(overrides = {}) {
  return {
    confirm: 'YES_WRITE_BUDGET',
    requestId: 'REQWRITE01',
    email: 'admin@example.com',
    projectCode: 'P1',
    deptCode: 'D1',
    budgetType: 'TASK_LINKED',
    budgetItemCode: 'BI1',
    masterTaskCode: 'TASK1',
    periodType: 'MONTH',
    periodCode: '2026-06',
    amount: 10,
    flowType: 'CHI',
    ...overrides
  };
}

function expectWriteError(options, code, payloadOverrides = {}) {
  const { context } = buildContext(options);
  const result = context.qltdBudgetSubmitPlan_(basePayload(payloadOverrides));
  assert.equal(result.success, false);
  assert.equal(result.errors[0].code, code);
}

{
  const { context, central, deptSheet } = buildContext();
  const result = context.qltdBudgetSubmitPlan_(basePayload());
  assert.equal(result.success, true);
  assert.equal(result.data.syncStatus, 'SYNCED');
  assert.equal(deptSheet.getCell(5, 3), 10);

  const raw = central.getSheetByName('CENTRAL_NS_Raw');
  const headerMap = context.qltdBudgetBuildHeaderMap_(RAW_HEADERS);
  const rawRow = raw.rows[4];
  assert.equal(context.qltdBudgetGetCell_(rawRow, headerMap, 'Ma khoan ngan sach', ''), 'BI1');
  assert.equal(context.qltdBudgetGetCell_(rawRow, headerMap, 'Ma phan bo', ''), 'A1');
  assert.equal(context.qltdBudgetGetCell_(rawRow, headerMap, 'Huong dong tien', ''), 'CHI');
  assert.equal(context.qltdBudgetGetCell_(rawRow, headerMap, 'Loai ban ghi', ''), 'PLAN_MONTH');
  assert.equal(context.qltdBudgetGetCell_(rawRow, headerMap, 'Trang thai xac nhan', ''), CONFIRMED_LABEL);
  assert.equal(context.qltdBudgetGetCell_(rawRow, headerMap, 'Nguoi xac nhan', ''), 'admin@example.com');
  assert.notEqual(context.qltdBudgetGetCell_(rawRow, headerMap, 'Thoi diem xac nhan', ''), '');
}

function submitAndReadRecordType(operation, payloadOverrides) {
  const { context, central } = buildContext();
  const payload = basePayload(payloadOverrides);
  const result = operation === 'ACTUAL'
    ? context.qltdBudgetSubmitActual_(payload)
    : context.qltdBudgetSubmitPlan_(payload);
  assert.equal(result.success, true);
  const raw = central.getSheetByName('CENTRAL_NS_Raw');
  const headerMap = context.qltdBudgetBuildHeaderMap_(RAW_HEADERS);
  return context.qltdBudgetGetCell_(raw.rows[4], headerMap, 'Loai ban ghi', '');
}

{
  const recordTypes = [
    submitAndReadRecordType('PLAN', { requestId: 'REQRECORD01', periodType: 'MONTH', periodCode: '2026-06' }),
    submitAndReadRecordType('PLAN', { requestId: 'REQRECORD02', periodType: 'WEEK', periodCode: '2026-W25' }),
    submitAndReadRecordType('ACTUAL', { requestId: 'REQRECORD03', periodType: 'MONTH', periodCode: '2026-06' }),
    submitAndReadRecordType('ACTUAL', { requestId: 'REQRECORD04', periodType: 'WEEK', periodCode: '2026-W25' })
  ];
  assert.deepEqual(recordTypes, ['PLAN_MONTH', 'PLAN_WEEK', 'PERFORMANCE_ACTUAL', 'PERFORMANCE_ACTUAL']);
  assert.equal(recordTypes.includes('PLAN'), false);
  assert.equal(recordTypes.includes('ACTUAL'), false);
}

{
  const { context, central, deptSheet } = buildContext();
  const result = context.qltdBudgetSubmitPlan_(basePayload({
    requestId: 'REQRECORD05',
    periodType: 'QUARTER',
    periodCode: '2026-Q2'
  }));
  assert.equal(result.success, false);
  assert.equal(result.errors[0].code, 'BUDGET_RECORD_TYPE_INVALID');
  assert.equal(central.getSheetByName('CENTRAL_NS_Raw').getLastRow(), 4);
  assert.equal(deptSheet.getCell(5, 3), 0);
}

expectWriteError({ allocations: [] }, 'ALLOCATION_NOT_FOUND');
expectWriteError({ allocations: [allocationRow({ status: 'DRAFT' })] }, 'ALLOCATION_NOT_CONFIRMED');
expectWriteError({ allocations: [allocationRow({ projectCode: 'P2' })] }, 'ALLOCATION_PROJECT_MISMATCH');
expectWriteError({ allocations: [allocationRow({ deptCode: 'D2' })] }, 'ALLOCATION_DEPT_MISMATCH');
expectWriteError({ allocations: [allocationRow({ flowType: 'THU' })] }, 'ALLOCATION_FLOW_MISMATCH');
expectWriteError({}, 'ALLOCATION_FLOW_MISMATCH', { flowType: 'THU' });
expectWriteError({}, 'BUDGET_ITEM_CODE_REQUIRED', { budgetItemCode: '' });
expectWriteError({ items: [] }, 'BUDGET_ITEM_NOT_FOUND');
expectWriteError({ items: [itemRow({ status: 'INACTIVE' })] }, 'BUDGET_ITEM_INACTIVE');
expectWriteError({ items: [itemRow({ allocationCode: '' })] }, 'ALLOCATION_CODE_REQUIRED');
expectWriteError({
  items: [
    itemRow({ budgetItemCode: 'BI1', approvedBudget: 70 }),
    itemRow({ budgetItemCode: 'BI2', approvedBudget: 40 })
  ]
}, 'ALLOCATION_LIMIT_EXCEEDED');

{
  const { context } = buildContext({
    items: [itemRow({ approvedBudget: 100 })],
    allocations: [allocationRow({ allocatedAmount: 100 })]
  });
  const result = context.qltdBudgetSubmitPlan_(basePayload({ requestId: 'REQWRITE02' }));
  assert.equal(result.success, true);
}

function rawObject(overrides = {}) {
  return {
    'Report ID': 'R1',
    'Ma du an': 'P1',
    'Ten du an': 'Project 1',
    'Phong/Ban': 'Dept One',
    'Loai ky': MONTH_LABEL,
    'Ma ky': '2026-06',
    'Ma cong viec Master': 'TASK1',
    'WBS/STT': '1',
    'Noi dung cong viec': 'Task one',
    'Ke hoach ngan sach ky': 10,
    'Gia tri thuc hien ky nay': 5,
    'Trang thai xac nhan': CONFIRMED_LABEL,
    'Nguoi gui': 'admin@example.com',
    'Thoi diem gui': '2026-06-20T00:00:00.000Z',
    'Sync status': 'SYNCED',
    'Sync at': '2026-06-20T00:01:00.000Z',
    'Ma khoan ngan sach': 'BI1',
    'Ten khoan ngan sach': 'Budget item 1',
    'Loai ngan sach': 'TASK_LINKED',
    'Nhom ngan sach': 'GROUP',
    'Giai doan ngan sach': 'MVP',
    'Yeu cau ma cong viec Master': 'TRUE',
    'Ma phan bo': 'A1',
    'Ma cong viec chi tiet PB': 'PB1',
    'Huong dong tien': 'CHI',
    ...overrides
  };
}

{
  const { context } = buildContext();
  const headerMap = context.qltdBudgetBuildHeaderMap_(RAW_HEADERS);
  const objects = [
    rawObject(),
    rawObject({ 'Report ID': 'R2', 'Ma khoan ngan sach': 'BI2', 'Ten khoan ngan sach': 'Budget item 2' }),
    rawObject({ 'Report ID': 'R3', 'Ma phan bo': 'A2', 'Huong dong tien': 'THU' }),
    rawObject({ 'Report ID': 'R4', 'Loai ky': WEEK_LABEL, 'Ma ky': '2026-W25' }),
    rawObject({ 'Report ID': 'R5', 'Trang thai xac nhan': SUBMITTED_LABEL }),
    rawObject({ 'Report ID': 'R6', 'Sync status': 'PENDING' }),
    rawObject({ 'Report ID': 'R7', 'Sync status': 'ERROR' }),
    rawObject({ 'Report ID': 'R8', 'Ma phan bo': '' })
  ];
  const rows = objects.map((object, index) => ({
    rowNumber: index + 5,
    raw: RAW_HEADERS.map(header => object[header] ?? '')
  }));
  const departments = [{ projectCode: 'P1', deptCode: 'D1', deptName: 'Dept One', status: 'ACTIVE' }];
  const aggregate = context.qltdBudgetBuildAggregateData_(rows, headerMap, [], departments, 'Asia/Ho_Chi_Minh');

  assert.equal(aggregate.validRows, 4);
  assert.equal(aggregate.summary.length, 4);
  assert.equal(aggregate.summary.filter(row => row.periodType === MONTH_LABEL).length, 3);
  assert.equal(aggregate.summary.filter(row => row.periodType === WEEK_LABEL).length, 1);
  assert.equal(new Set(aggregate.summary.map(row => row.budgetItemCode)).has('BI2'), true);
  assert.equal(new Set(aggregate.summary.map(row => row.flowType)).size, 2);
  assert.equal(aggregate.warnings.some(item => item.code === 'RAW_NOT_CONFIRMED'), true);
  assert.equal(aggregate.warnings.some(item => item.code === 'RAW_NOT_SYNCED'), true);
  assert.equal(aggregate.warnings.some(item => item.code === 'RAW_ALLOCATION_CONTEXT_INCOMPLETE'), true);
  assert.equal(context.qltdBudgetSummaryToRow_(aggregate.summary[0]).length, 28);
  assert.equal(context.qltdBudgetDashboardToRow_(aggregate.dashboard[0]).length, 19);
}

console.log('budget-write-allocation tests passed');
