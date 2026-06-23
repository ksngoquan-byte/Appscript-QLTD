import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = process.cwd();
const files = [
  'apps-script-dev-api/00_config.js',
  'apps-script-dev-api/40_Central_Config.js',
  'apps-script-dev-api/55_Budget_Validation.js',
  'apps-script-dev-api/50_Budget_PB_Task_Service.js',
  'apps-script-dev-api/69_Budget_Envelope_Schema_Service.js',
  'apps-script-dev-api/70_Budget_Envelope_Schema_Runner.js'
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
    values.forEach((row, r) => {
      row.forEach((value, c) => this.sheet.setCell(this.row + r, this.column + c, value));
    });
    return this;
  }
}

class MockSheet {
  constructor(name, maxColumns, headers, dataRows = [], headerRow = 4) {
    this.name = name;
    this.maxColumns = maxColumns;
    this.rows = Array.from({ length: Math.max(headerRow - 1, 0) }, () => []);
    this.rows.push(headers.slice());
    dataRows.forEach(row => this.rows.push(row.slice()));
  }

  getName() { return this.name; }
  getMaxColumns() { return this.maxColumns; }
  getLastColumn() {
    let max = 0;
    this.rows.forEach(row => {
      row.forEach((value, index) => {
        if (String(value ?? '').trim() !== '') {
          max = Math.max(max, index + 1);
        }
      });
    });
    return max || 1;
  }
  getLastRow() { return this.rows.length; }
  getRange(row, column, numRows = 1, numColumns = 1) { return new MockRange(this, row, column, numRows, numColumns); }
  getDataRange() { return new MockRange(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  insertColumnsAfter(afterColumn, count) { this.maxColumns += count; return this; }
  setCell(row, column, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < column) this.rows[row - 1].push('');
    this.rows[row - 1][column - 1] = value;
  }
  getCell(row, column) {
    return (this.rows[row - 1] || [])[column - 1] ?? '';
  }
}

class MockSpreadsheet {
  constructor(id, sheets) {
    this.id = id;
    this.sheets = new Map(sheets.map(sheet => [sheet.getName(), sheet]));
  }

  getId() { return this.id; }
  getName() { return this.id; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
}

function rowsWithHeader(headers, dataRows = []) {
  return [headers.slice()].concat(dataRows.map(row => row.slice()));
}

function buildContext({ missingDeptSheet = false } = {}) {
  const projectRows = rowsWithHeader([
    'ProjectCode',
    'ProjectName',
    'MasterSpreadsheetId',
    'DeptSpreadsheetId',
    'DefaultTaskSheet',
    'DefaultDeptSheet',
    'Status',
    'SortOrder',
    'Note'
  ], [
    ['24-1.ĐB', 'Coc Leu', 'MASTER_1', 'DEPT_1', 'Cong_viec', 'BQLDA', 'ACTIVE', 1, 'pilot']
  ]);

  const deptRows = rowsWithHeader([
    'ProjectCode',
    'DeptCode',
    'ProjectUnitCode',
    'DeptName',
    'Status',
    'SortOrder',
    'Note'
  ], [
    ['24-1.ĐB', 'BQLDA', 'BQLDA_DB', 'BQLDA Coc Leu', 'ACTIVE', 1, ''],
    ['24-1.ĐB', 'PTDA', 'PTDA_DB', 'PTDA Coc Leu', 'ACTIVE', 2, ''],
    ['24-1.ĐB', 'GPMB', 'GPMB_DB', 'GPMB Coc Leu', 'ACTIVE', 3, '']
  ]);

  const central = new MockSpreadsheet('CENTRAL', [
    new MockSheet('Projects', 9, projectRows[0], projectRows.slice(1), 1),
    new MockSheet('Project_Depts', 7, deptRows[0], deptRows.slice(1), 1),
    new MockSheet('CENTRAL_NS_Allocations', 10, [
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
    ]),
    new MockSheet('SYS_Sync_Log', 9, [
      'Thoi diem',
      'Nguoi/He thong',
      'Hanh dong',
      'Ma du an',
      'File nguon',
      'Sheet nguon',
      'So dong xu ly',
      'Ket qua',
      'Loi/Ghi chu'
    ])
  ]);

  const deptSheets = [
    new MockSheet('BQLDA', 30, Array.from({ length: 30 }, (_, index) => `H${index + 1}`)),
    new MockSheet('PTDA', 30, Array.from({ length: 30 }, (_, index) => `H${index + 1}`)),
    new MockSheet('GPMB', 30, Array.from({ length: 30 }, (_, index) => `H${index + 1}`))
  ];

  const dept = new MockSpreadsheet('DEPT_1', missingDeptSheet ? deptSheets.slice(1) : deptSheets);

  const context = {
    console,
    Logger: { log: () => {} },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => central,
      openById: id => {
        if (id === 'DEPT_1') return dept;
        if (id === 'CENTRAL') return central;
        throw new Error('Spreadsheet not found: ' + id);
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => '',
        setProperty: () => {}
      })
    }
  };

  vm.createContext(context);
  files.forEach(file => {
    vm.runInContext(fs.readFileSync(path.join(repoRoot, file), 'utf8'), context, { filename: file });
  });

  return { context, central, dept };
}

{
  const { context, central, dept } = buildContext();
  const dryRun = context.qltdBudgetEnvelopeSchemaDryRunPilotProject241DB();

  assert.equal(dryRun.success, true);
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.blocked, false);
  assert.equal(dryRun.plannedActions.length, 4);
  assert.deepEqual(Array.from(dryRun.central.missingHeaders), [
    'Ma cong viec Master',
    'Giai doan FS',
    'Phien ban',
    'Can cu',
    'Nguoi de xuat',
    'Nguoi duyet',
    'Thoi diem duyet',
    'Hieu luc'
  ]);
  assert.equal(dryRun.departments.length, 3);

  const applied = context.qltdBudgetEnvelopeSchemaApplyPilotProject241DB();
  assert.equal(applied.success, true);
  assert.equal(applied.applied, true);
  assert.equal(applied.blocked, false);
  assert.deepEqual(Array.from(applied.central.missingHeaders), []);
  assert.deepEqual(applied.departments.every(item => item.missingHeaders.length === 0), true);

  const appliedAgain = context.runBudgetEnvelopeApplyPilotProject241DB();
  assert.equal(appliedAgain.success, true);
  assert.equal(appliedAgain.applied, true);
  assert.equal(appliedAgain.central.missingHeaders.length, 0);
  assert.equal(central.getSheetByName('CENTRAL_NS_Allocations').getLastColumn(), 18);
  assert.equal(dept.getSheetByName('BQLDA').getLastColumn(), 35);
}

{
  const { context } = buildContext({ missingDeptSheet: true });
  const dryRun = context.qltdBudgetEnvelopeSchemaDryRunPilotProject241DB();
  assert.equal(dryRun.success, false);
  assert.equal(dryRun.blocked, true);
  assert.equal(dryRun.plannedActions.length, 0);
  assert.equal(dryRun.blockedSheets.length > 0, true);
}

console.log('budget-envelope-schema tests passed');
