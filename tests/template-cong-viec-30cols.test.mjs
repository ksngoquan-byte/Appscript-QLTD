import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const repoRoot = path.resolve(import.meta.dirname, '..');
const sourcePaths = [
  path.join(repoRoot, '13_Hoan_thien_Template_Goc.js'),
  path.join(repoRoot, 'apps-script-dev-api', '13_Hoan_thien_Template_Goc.js')
];

const expectedHeaders = [
  'Mã công việc mẫu', 'WBS', 'Zone', 'Loại công trình', 'Công trình',
  'Hạng mục/Tầng', 'ID', 'Công việc / Phạm vi', 'Chủ trì', 'Số ngày kế hoạch',
  'Công việc liên kết', 'Bắt đầu kế hoạch', 'Kết thúc kế hoạch', 'Ghi chú',
  'Mã công việc', 'Mã mốc hệ thống', 'Lỗi tiền nhiệm', 'Trạng thái thực hiện',
  'Bắt đầu thực tế', 'Hoàn thành thực tế', 'Ghi chú cập nhật', 'Ngày cập nhật',
  'Điều chỉnh liên kết?', '', '', 'WBS_LEVEL_SYS', '', 'Trần chi phí trực tiếp',
  'Dự thu kế hoạch', 'Trạng thái ngân sách'
];

function normalizedSource(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function makeHarness({
  scriptId = '1Tx-3JSUug5wvcosVfwjng9KaCJyKf_0s9YB6ZqJWdJQLVBMcEzql3fmI',
  spreadsheetId = '1EuIOvxEVT0IIzPq53AY_oBIgHxJI7qqOknkFrcyFwWU',
  sheetName = '_TEMPLATE_Cong_viec',
  maxColumns = 27
} = {}) {
  const formulas = { A5: '=FORMULA_A()', D5: '=FORMULA_D()', G5: '=FORMULA_G()' };
  const values = Array.from({ length: 10 }, () => Array(maxColumns).fill(''));
  values[3][22] = 'Cảnh báo tiến độ';
  values[3][25] = 'WBS_LEVEL_SYS';
  const validations = [];
  const formats = [];
  const alignments = [];
  const sheetLookups = [];
  const hiddenColumns = new Set();
  let clearContentCalls = 0;

  const sheet = {
    getName: () => sheetName,
    getMaxColumns: () => values[0].length,
    getMaxRows: () => values.length,
    insertColumnsAfter(_after, count) {
      for (const row of values) row.push(...Array(count).fill(''));
    },
    setColumnWidth() {},
    hideColumns(start, count = 1) {
      for (let col = start; col < start + count; col += 1) hiddenColumns.add(col);
    },
    showColumns(start, count = 1) {
      for (let col = start; col < start + count; col += 1) hiddenColumns.delete(col);
    },
    getRange(rowOrA1, col, numRows = 1, numCols = 1) {
      const isA1 = typeof rowOrA1 === 'string';
      const a1 = isA1 ? rowOrA1 : null;
      const row = isA1 ? Number(a1.match(/\d+/)[0]) : rowOrA1;
      const column = isA1 ? a1.charCodeAt(0) - 64 : col;
      const range = {
        getFormula: () => formulas[a1] || '',
        getValues: () => Array.from({ length: numRows }, (_, r) =>
          Array.from({ length: numCols }, (_, c) => values[row - 1 + r]?.[column - 1 + c] ?? '')
        ),
        setValues(rows) {
          rows.forEach((sourceRow, r) => sourceRow.forEach((value, c) => {
            values[row - 1 + r][column - 1 + c] = value;
          }));
          return range;
        },
        setDataValidation(rule) {
          validations.push({ row, column, numRows, numCols, rule });
          return range;
        },
        setNumberFormat(format) {
          formats.push({ row, column, numRows, numCols, format });
          return range;
        },
        setHorizontalAlignment(alignment) {
          alignments.push({ row, column, numRows, numCols, alignment });
          return range;
        },
        clearContent() {
          clearContentCalls += 1;
          return range;
        },
        setFontWeight: () => range,
        setFontSize: () => range,
        setFontColor: () => range,
        setBackground: () => range,
        setVerticalAlignment: () => range,
        setWrap: () => range,
        setBorder: () => range
      };
      return range;
    }
  };

  const spreadsheet = {
    getId: () => spreadsheetId,
    getSheetByName(name) {
      sheetLookups.push(name);
      return name === sheetName ? sheet : null;
    }
  };

  const context = {
    ScriptApp: { getScriptId: () => scriptId },
    SpreadsheetApp: {
      BorderStyle: { SOLID: 'SOLID' },
      getActiveSpreadsheet: () => spreadsheet,
      newDataValidation: () => {
        const rule = { values: null, allowInvalid: true };
        const builder = {
          requireValueInList(list, showDropdown) {
            rule.values = [...list];
            rule.showDropdown = showDropdown;
            return builder;
          },
          setAllowInvalid(value) {
            rule.allowInvalid = value;
            return builder;
          },
          build: () => rule
        };
        return builder;
      }
    },
    Logger: { log() {} },
    console
  };

  vm.createContext(context);
  vm.runInContext(normalizedSource(sourcePaths[1]), context);

  return {
    context,
    values,
    formulas,
    validations,
    formats,
    alignments,
    hiddenColumns,
    sheetLookups,
    getClearContentCalls: () => clearContentCalls
  };
}

test('root and dev-api sources stay in parity with the 30-column schema', () => {
  const [rootSource, devSource] = sourcePaths.map(normalizedSource);
  assert.equal(rootSource, devSource);

  for (const source of [rootSource, devSource]) {
    assert.match(source, /damBaoSoCotQltdTemplateV1_\(sheet, 30\)/);
    assert.doesNotMatch(source, /damBaoSoCotQltdTemplateV1_\(sheet, 26\)/);
    assert.doesNotMatch(source, /Cảnh báo tiến độ/);
    assert.match(source, /function migrateTemplateCongViec30ColsV1\(\)/);
  }
});

test('migration is idempotent, preserves formulas, and only targets the template sheet', () => {
  const harness = makeHarness();
  const formulasBefore = { ...harness.formulas };

  harness.context.migrateTemplateCongViec30ColsV1();
  harness.context.migrateTemplateCongViec30ColsV1();

  assert.equal(harness.values[0].length, 30);
  assert.deepEqual(harness.values[3], expectedHeaders);
  assert.deepEqual(harness.formulas, formulasBefore);
  assert.equal(harness.getClearContentCalls(), 0);
  assert.deepEqual([...new Set(harness.sheetLookups)], ['_TEMPLATE_Cong_viec']);
  assert.deepEqual([...harness.hiddenColumns], [26]);

  const wRule = harness.validations.find((item) => item.column === 23)?.rule;
  const adRule = harness.validations.find((item) => item.column === 30)?.rule;
  assert.deepEqual(wRule.values, ['Có', 'Không']);
  assert.equal(wRule.allowInvalid, false);
  assert.deepEqual(adRule.values, ['Nháp', 'Đã chốt', 'Khóa']);
  assert.equal(adRule.allowInvalid, false);
  assert.ok(harness.formats.some((item) => item.column === 28 && item.numCols === 2 && item.format === '#,##0'));
  assert.ok(harness.alignments.some((item) => item.column === 28 && item.alignment === 'right'));
});

test('migration stops before sheet access when Spreadsheet ID is wrong', () => {
  const harness = makeHarness({ spreadsheetId: 'WRONG_SPREADSHEET' });
  assert.throws(
    () => harness.context.migrateTemplateCongViec30ColsV1(),
    /Spreadsheet ID không khớp/
  );
  assert.deepEqual(harness.sheetLookups, []);
});

test('migration allowlist accepts the exact three Master Script/Spreadsheet pairs', () => {
  const pairs = [
    ['1Tx-3JSUug5wvcosVfwjng9KaCJyKf_0s9YB6ZqJWdJQLVBMcEzql3fmI', '1EuIOvxEVT0IIzPq53AY_oBIgHxJI7qqOknkFrcyFwWU'],
    ['1QKFkAHLYlHxN0tTYQr9K2I66idyYtH8d8QdNxM18s_y4hBxtNKg965b5', '1EZk5YM-P132IkM9TWoKVHAqcajbiKs2O2hgjTWPe8K0'],
    ['1u4cdaLgra0Rr22Q1KaoLCziaEzsVN_KU3-QmSpFUkkN6w9dkjzQJCXGh', '1vvO54Lqimem-wpAD-O1UNtqcItBk-hDAnzbBVKtO2Js']
  ];

  for (const [scriptId, spreadsheetId] of pairs) {
    const harness = makeHarness({ scriptId, spreadsheetId });
    assert.doesNotThrow(() => harness.context.migrateTemplateCongViec30ColsV1());
  }
});
