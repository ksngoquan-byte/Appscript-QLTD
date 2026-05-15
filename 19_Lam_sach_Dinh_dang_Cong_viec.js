/*******************************************************
 * FILE: 19_Lam_sach_Dinh_dang_Cong_viec.js
 *
 * MUC TIEU
 * - Xoa mau nen bi dinh do copy/paste tren Cong_viec.
 * - Chi xu ly vung A5:W, khong cham dong 1:4 va khong cham sheet khac.
 *******************************************************/

const LAM_SACH_DINH_DANG_CONG_VIEC_V1 = {
  SHEET_NAME: 'Cong_viec',
  TEMPLATE_SHEET_NAME: '_TEMPLATE_Cong_viec',
  START_ROW: 5,
  START_COL: 1,
  NUM_COLS: 23
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
    return 'Cong_viec khong co vung du lieu de xoa mau nen.';
  }

  const numRows = maxRows - startRow + 1;

  sheet
    .getRange(startRow, cfg.START_COL, numRows, cfg.NUM_COLS)
    .setBackground(null);

  SpreadsheetApp.flush();

  const message =
    'Da xoa mau nen vung Cong_viec!A' +
    startRow +
    ':W' +
    maxRows +
    '. Khong thay doi du lieu, cong thuc, note, dropdown, border hay dinh dang so.';

  Logger.log(message);
  return message;
}

function khoiPhucDinhDangChuanCongViecTuTemplateV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LAM_SACH_DINH_DANG_CONG_VIEC_V1.SHEET_NAME);
  const templateSheet = ss.getSheetByName(LAM_SACH_DINH_DANG_CONG_VIEC_V1.TEMPLATE_SHEET_NAME);

  if (!sheet) {
    throw new Error('Khong tim thay sheet Cong_viec.');
  }

  if (!templateSheet) {
    throw new Error('Khong tim thay sheet _TEMPLATE_Cong_viec.');
  }

  const cfg = LAM_SACH_DINH_DANG_CONG_VIEC_V1;
  const startRow = typeof CONFIG !== 'undefined' && CONFIG.SYSTEM
    ? CONFIG.SYSTEM.START_ROW
    : cfg.START_ROW;
  const maxRows = sheet.getMaxRows();

  if (maxRows < startRow) {
    return 'Cong_viec khong co vung du lieu de khoi phuc dinh dang.';
  }

  const numRows = maxRows - startRow + 1;
  const templateRows = Math.max(1, templateSheet.getMaxRows() - startRow + 1);
  const templateRange = templateSheet.getRange(
    startRow,
    cfg.START_COL,
    Math.min(numRows, templateRows),
    cfg.NUM_COLS
  );
  const targetRange = sheet.getRange(startRow, cfg.START_COL, Math.min(numRows, templateRows), cfg.NUM_COLS);

  templateRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

  SpreadsheetApp.flush();

  const message = 'Da khoi phuc dinh dang chuan tu _TEMPLATE_Cong_viec!A5:W.';
  Logger.log(message);
  return message;
}
