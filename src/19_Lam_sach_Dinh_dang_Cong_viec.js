/*******************************************************
 * FILE: 19_Lam_sach_Dinh_dang_Cong_viec.js
 *
 * MUC TIEU
 * - Lam sach dinh dang bi dinh do copy/paste tren Cong_viec.
 * - Chi xu ly vung nhap lieu A5:N, khong cham sheet khac.
 * - Khong xoa du lieu, cong thuc, note, validation hay conditional format.
 *******************************************************/

const LAM_SACH_DINH_DANG_CONG_VIEC_V1 = {
  SHEET_NAME: 'Cong_viec',
  TEMPLATE_SHEET_NAME: '_TEMPLATE_Cong_viec',
  START_ROW: 5,
  START_COL: 1,
  NUM_COLS: 14,
  FONT_FAMILY: 'Arial',
  FONT_SIZE: 10,
  FONT_COLOR: '#111827',
  BORDER_COLOR: '#E5E7EB'
};

function lamSachDinhDangVungNhapLieuCongViecV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LAM_SACH_DINH_DANG_CONG_VIEC_V1.SHEET_NAME);

  if (!sheet) {
    throw new Error('Khong tim thay sheet Cong_viec.');
  }

  const cfg = LAM_SACH_DINH_DANG_CONG_VIEC_V1;
  const startRow = typeof CONFIG !== 'undefined' && CONFIG.SYSTEM
    ? CONFIG.SYSTEM.START_ROW
    : cfg.START_ROW;
  const maxRows = sheet.getMaxRows();

  if (maxRows < startRow) {
    return 'Cong_viec khong co vung du lieu de lam sach dinh dang.';
  }

  const activeRange = ss.getActiveRange();
  const activeRow = activeRange && activeRange.getSheet().getName() === cfg.SHEET_NAME
    ? activeRange.getRow()
    : null;
  const cache = typeof layCache_ === 'function' ? layCache_() : null;

  if (typeof khoiPhucSelectionHighlightCuV1_ === 'function') {
    khoiPhucSelectionHighlightCuV1_(cache);
  }

  const numRows = maxRows - startRow + 1;
  const range = sheet.getRange(startRow, cfg.START_COL, numRows, cfg.NUM_COLS);

  // Khong dung clearFormat de tranh mat validation/dropdown dang co.
  range
    .setBackground(null)
    .setFontColor(cfg.FONT_COLOR)
    .setFontFamily(cfg.FONT_FAMILY)
    .setFontSize(cfg.FONT_SIZE)
    .setFontWeight('normal')
    .setFontStyle('normal')
    .setFontLine('none')
    .setVerticalAlignment('middle')
    .setWrap(false)
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      cfg.BORDER_COLOR,
      SpreadsheetApp.BorderStyle.SOLID
    );

  apDungCanLeChuanCongViecV1_(sheet, startRow, numRows);
  apDungDinhDangSoNgayChuanCongViecV1_(sheet, startRow, numRows);
  khoiPhucValidationCongViecSauLamSachV1_(ss, sheet, startRow, numRows);
  apDungLaiSelectionHighlightCongViecV1_(sheet, activeRow, cache);

  SpreadsheetApp.flush();

  const message =
    'Da lam sach dinh dang vung nhap lieu Cong_viec!A' +
    startRow +
    ':N' +
    maxRows +
    '. Du lieu, cong thuc, note va conditional formatting khong bi xoa.';

  Logger.log(message);
  return message;
}

function apDungCanLeChuanCongViecV1_(sheet, startRow, numRows) {
  sheet.getRange(startRow, 1, numRows, 14).setHorizontalAlignment('left');

  [1, 2, 7, 10, 11, 12, 13].forEach(function(col) {
    sheet.getRange(startRow, col, numRows, 1).setHorizontalAlignment('center');
  });

  sheet.getRange(startRow, 8, numRows, 1).setWrap(true);
  sheet.getRange(startRow, 14, numRows, 1).setWrap(true);
}

function apDungDinhDangSoNgayChuanCongViecV1_(sheet, startRow, numRows) {
  sheet.getRange(startRow, 1, numRows, 9).setNumberFormat('@');
  sheet.getRange(startRow, 10, numRows, 1).setNumberFormat('0');
  sheet.getRange(startRow, 11, numRows, 1).setNumberFormat('@');
  sheet.getRange(startRow, 12, numRows, 2).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(startRow, 14, numRows, 1).setNumberFormat('@');
}

function khoiPhucValidationCongViecSauLamSachV1_(ss, sheet, startRow, numRows) {
  const templateSheet = ss.getSheetByName(LAM_SACH_DINH_DANG_CONG_VIEC_V1.TEMPLATE_SHEET_NAME);

  if (templateSheet && templateSheet.getMaxRows() >= startRow) {
    const templateValidations = templateSheet
      .getRange(startRow, 1, 1, LAM_SACH_DINH_DANG_CONG_VIEC_V1.NUM_COLS)
      .getDataValidations()[0];
    const validations = new Array(numRows).fill(null).map(function() {
      return templateValidations.slice();
    });

    sheet
      .getRange(startRow, 1, numRows, LAM_SACH_DINH_DANG_CONG_VIEC_V1.NUM_COLS)
      .setDataValidations(validations);
  } else {
    Logger.log('Khong tim thay _TEMPLATE_Cong_viec de khoi phuc validation A:N.');
    apDungValidationMaCauTrucCongViecV1_(sheet, startRow, numRows);
  }

  if (typeof capNhatDataValidationTenCongViecMauV1_ === 'function') {
    capNhatDataValidationTenCongViecMauV1_(ss, sheet);
  }
}

function apDungValidationMaCauTrucCongViecV1_(sheet, startRow, numRows) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['0', '1', '2', '3', '4'], true)
    .setAllowInvalid(false)
    .setHelpText('Ma cau truc hop le: 0, 1, 2, 3, 4.')
    .build();

  sheet.getRange(startRow, 2, numRows, 1).setDataValidation(rule);
}

function apDungLaiSelectionHighlightCongViecV1_(sheet, activeRow, cache) {
  if (!activeRow || activeRow < LAM_SACH_DINH_DANG_CONG_VIEC_V1.START_ROW) return;

  const rangeInfo = typeof layVungSelectionHighlightV1_ === 'function'
    ? layVungSelectionHighlightV1_(sheet, sheet.getName())
    : { startColumn: 1, numColumns: 23 };

  if (!rangeInfo) return;

  const targetRange = sheet.getRange(
    activeRow,
    rangeInfo.startColumn,
    1,
    rangeInfo.numColumns
  );
  const oldBackgrounds = targetRange.getBackgrounds();

  targetRange.setBackground(
    typeof SELECTION_HIGHLIGHT_COLOR_V1 !== 'undefined'
      ? SELECTION_HIGHLIGHT_COLOR_V1
      : '#FFF2CC'
  );

  if (cache) {
    cache.setProperty(
      typeof SELECTION_HIGHLIGHT_CACHE_KEY_V1 !== 'undefined'
        ? SELECTION_HIGHLIGHT_CACHE_KEY_V1
        : 'LAST_ROW_HIGHLIGHT_SAFE_V1',
      JSON.stringify({
        sheetName: sheet.getName(),
        row: activeRow,
        startColumn: rangeInfo.startColumn,
        numColumns: rangeInfo.numColumns,
        backgrounds: oldBackgrounds
      })
    );
  }
}
