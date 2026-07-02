import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = path.resolve(process.cwd());
const servicePath = path.join(repoRoot, 'apps-script-dev-api', '60_Budget_Master_Schema_Service.js');
const source = fs.readFileSync(servicePath, 'utf8');

class MockRule {
  constructor(values) {
    this.values = values.slice();
  }

  getCriteriaType() {
    return 'VALUE_IN_LIST';
  }

  getCriteriaValues() {
    return [this.values.slice()];
  }
}

class MockValidationBuilder {
  requireValueInList(values) {
    this.values = values.slice();
    return this;
  }

  setAllowInvalid() {
    return this;
  }

  build() {
    return new MockRule(this.values || []);
  }
}

class MockRange {
  constructor(sheet, row, column, numRows = 1, numColumns = 1) {
    if (column + numColumns - 1 > sheet.maxColumns) {
      throw new Error(`Range out of bounds: ${sheet.name}!R${row}C${column}:${numColumns}`);
    }
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }

  _matrix(store, fallback = '') {
    const values = [];
    for (let r = 0; r < this.numRows; r += 1) {
      const row = [];
      for (let c = 0; c < this.numColumns; c += 1) {
        row.push(this.sheet._get(store, this.row + r, this.column + c, fallback));
      }
      values.push(row);
    }
    return values;
  }

  _fill(store, value) {
    for (let r = 0; r < this.numRows; r += 1) {
      for (let c = 0; c < this.numColumns; c += 1) {
        this.sheet._set(store, this.row + r, this.column + c, value);
      }
    }
    return this;
  }

  getDisplayValues() {
    return this._matrix('values', '').map(row => row.map(value => String(value ?? '')));
  }

  getNumberFormats() {
    return this._matrix('formats', '');
  }

  getHorizontalAlignments() {
    return this._matrix('alignments', '');
  }

  getDataValidations() {
    return this._matrix('validations', null);
  }

  setValue(value) {
    this.sheet._set('values', this.row, this.column, value);
    return this;
  }

  setValues(values) {
    values.forEach((row, r) => {
      row.forEach((value, c) => this.sheet._set('values', this.row + r, this.column + c, value));
    });
    return this;
  }

  setNumberFormat(format) {
    return this._fill('formats', format);
  }

  setHorizontalAlignment(alignment) {
    return this._fill('alignments', alignment);
  }

  setDataValidation(rule) {
    return this._fill('validations', rule);
  }

  setFontWeight() { return this; }
  setFontSize() { return this; }
  setFontColor() { return this; }
  setBackground() { return this; }
  setVerticalAlignment() { return this; }
  setWrap() { return this; }
  setFontStyle() { return this; }
  breakApart() { return this; }
  mergeAcross() { return this; }
}

class MockSheet {
  constructor(name, maxRows = 20, maxColumns = 30) {
    this.name = name;
    this.maxRows = maxRows;
    this.maxColumns = maxColumns;
    this.values = new Map();
    this.formats = new Map();
    this.alignments = new Map();
    this.validations = new Map();
    this.widths = new Map();
    this.hidden = new Set();
    this.frozenRows = 0;
  }

  _key(row, column) {
    return `${row}:${column}`;
  }

  _get(store, row, column, fallback) {
    return this[store].has(this._key(row, column)) ? this[store].get(this._key(row, column)) : fallback;
  }

  _set(store, row, column, value) {
    this[store].set(this._key(row, column), value);
  }

  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxColumns; }
  getFrozenRows() { return this.frozenRows; }
  setFrozenRows(rows) { this.frozenRows = rows; return this; }
  getRange(row, column, numRows = 1, numColumns = 1) { return new MockRange(this, row, column, numRows, numColumns); }
  getColumnWidth(column) { return this.widths.get(column) || 100; }
  setColumnWidth(column, width) { this.widths.set(column, width); return this; }
  hideColumns(column) { this.hidden.add(column); return this; }
  isColumnHiddenByUser(column) { return this.hidden.has(column); }
  insertRowsAfter(row, count) { this.maxRows = Math.max(this.maxRows, row + count); return this; }

  insertColumnsAfter(afterColumn, count) {
    this.maxColumns += count;
    return this;
  }
}

class MockSpreadsheet {
  constructor(name, sheets) {
    this.name = name;
    this.sheets = new Map(sheets.map(sheet => [sheet.getName(), sheet]));
  }

  getName() { return this.name; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    const sheet = new MockSheet(name, 20, 26);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

function loadContext(spreadsheet) {
  const context = {
    console,
    SpreadsheetApp: {
      DataValidationCriteria: { VALUE_IN_LIST: 'VALUE_IN_LIST' },
      openById: () => spreadsheet,
      newDataValidation: () => new MockValidationBuilder(),
      flush: () => {}
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: servicePath });
  return context;
}

function setHeaders(sheet, headers) {
  sheet.getRange(4, 1, 1, headers.length).setValues([headers]);
}

function buildTaskSheet(name, overrides = {}) {
  const sheet = new MockSheet(name, 20, overrides.columns || 30);
  const headers = Array.from({ length: sheet.maxColumns }, (_, index) => `H${index + 1}`);
  if (sheet.maxColumns >= 26) headers[25] = 'WBS_LEVEL_SYS';
  if (sheet.maxColumns >= 27) headers[26] = '';
  if (sheet.maxColumns >= 28) headers[27] = Object.prototype.hasOwnProperty.call(overrides, 'abHeader') ? overrides.abHeader : 'Trần chi phí trực tiếp';
  if (sheet.maxColumns >= 29) headers[28] = 'Dự thu kế hoạch';
  if (sheet.maxColumns >= 30) headers[29] = 'Trạng thái ngân sách';
  setHeaders(sheet, headers);

  if (sheet.maxColumns >= 30) {
    sheet.hideColumns(26);
    sheet.getRange(5, 28, 16, 2).setNumberFormat('#,##0').setHorizontalAlignment('right');
    sheet.getRange(5, 30, 16, 1)
      .setDataValidation(new MockRule(['Nháp', 'Đã chốt', 'Khóa']))
      .setHorizontalAlignment('center');
    sheet.setColumnWidth(26, 120);
    sheet.setColumnWidth(27, 14);
    sheet.setColumnWidth(28, 150);
    sheet.setColumnWidth(29, 135);
    sheet.setColumnWidth(30, 145);
  }
  return sheet;
}

function buildNsSheet() {
  const sheet = new MockSheet('NS_Khong_Gan_CV', 20, 9);
  setHeaders(sheet, [
    'STT',
    'Mã nguồn ngân sách',
    'Tên nguồn ngân sách',
    'Nhóm ngân sách',
    'Phòng/Ban chủ trì',
    'Hướng dòng tiền',
    'Giá trị kế hoạch',
    'Trạng thái ngân sách',
    'Ghi chú'
  ]);
  sheet.getRange(5, 7, 16, 1).setNumberFormat('#,##0');
  sheet.getRange(5, 6, 16, 1).setDataValidation(new MockRule(['THU', 'CHI']));
  sheet.getRange(5, 8, 16, 1).setDataValidation(new MockRule(['Nháp', 'Đã chốt', 'Khóa']));
  sheet.setFrozenRows(4);
  [55, 145, 260, 150, 160, 125, 150, 145, 260].forEach((width, index) => {
    sheet.setColumnWidth(index + 1, width);
  });
  return sheet;
}

function buildSpreadsheet(options = {}) {
  const sheets = [
    buildTaskSheet('Cong_viec', options.task || {}),
    buildTaskSheet('_TEMPLATE_Cong_viec', options.template || {})
  ];
  if (options.includeNs !== false) {
    sheets.push(buildNsSheet());
  }
  return new MockSpreadsheet('Mock Master', sheets);
}

{
  const ctx = loadContext(buildSpreadsheet());
  const result = ctx.qltdBudgetMasterSchemaDryRun_('mock-id');
  assert.equal(result.success, true);
  assert.equal(result.status, 'NO_CHANGE');
  assert.equal(result.actions.length, 0);
}

{
  const spreadsheet = buildSpreadsheet({ includeNs: false });
  const ctx = loadContext(spreadsheet);
  const dryRun = ctx.qltdBudgetMasterSchemaDryRun_('mock-id');
  assert.equal(dryRun.status, 'CHANGE_REQUIRED');
  assert.equal(dryRun.actions.some(action => action.type === 'NS_CREATE_SHEET'), true);

  const ensured = ctx.qltdBudgetMasterSchemaEnsure_('mock-id');
  assert.equal(ensured.success, true);
  assert.equal(ensured.status, 'NO_CHANGE');
  assert.ok(spreadsheet.getSheetByName('NS_Khong_Gan_CV'));
}

{
  const ctx = loadContext(buildSpreadsheet({ task: { abHeader: '' } }));
  const result = ctx.qltdBudgetMasterSchemaDryRun_('mock-id');
  assert.equal(result.success, true);
  assert.equal(result.status, 'CHANGE_REQUIRED');
  assert.equal(result.actions.some(action => action.type === 'TASK_SET_HEADER' && action.column === 28), true);
}

{
  const ctx = loadContext(buildSpreadsheet({ task: { abHeader: 'Dự thu kế hoạch' } }));
  const result = ctx.qltdBudgetMasterSchemaDryRun_('mock-id');
  assert.equal(result.success, false);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.errors.some(error => error.code === 'DUPLICATE_HEADER' || error.code === 'TASK_BUDGET_HEADER_SHIFTED'), true);
}

{
  const spreadsheet = buildSpreadsheet({ task: { columns: 26 }, template: { columns: 26 }, includeNs: false });
  const ctx = loadContext(spreadsheet);
  const result = ctx.qltdBudgetMasterSchemaEnsure_('mock-id');
  assert.equal(result.success, true);
  assert.equal(result.status, 'NO_CHANGE');
  assert.equal(spreadsheet.getSheetByName('Cong_viec').getMaxColumns(), 30);
  assert.equal(spreadsheet.getSheetByName('_TEMPLATE_Cong_viec').getMaxColumns(), 30);
  assert.ok(spreadsheet.getSheetByName('NS_Khong_Gan_CV'));
}

console.log('budget-master-schema tests passed');
