function xoaGiaoDienLoi_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(CONFIG.SHEET.CONG_VIEC);

  const lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.SYSTEM.START_ROW) return;

  const col = CONFIG.COLUMN.CONG_VIEC;
  const numRows = lastRow - CONFIG.SYSTEM.START_ROW + 1;
  const numCols = Math.max(sheet.getLastColumn(), col.LOI_TIEN_NHIEM);

  sheet.getRange(CONFIG.SYSTEM.START_ROW, 1, numRows, numCols).setBackground(null);
  sheet.getRange(CONFIG.SYSTEM.START_ROW, col.LOI_TIEN_NHIEM, numRows, 1).clearContent();
}

function danhDauDongLoi_(rowIndex, message) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(CONFIG.SHEET.CONG_VIEC);

  const col = CONFIG.COLUMN.CONG_VIEC;
  const numCols = Math.max(sheet.getLastColumn(), col.LOI_TIEN_NHIEM);

  sheet.getRange(rowIndex, 1, 1, numCols).setBackground('#ffe6e6');
  sheet.getRange(rowIndex, col.LOI_TIEN_NHIEM).setValue(message);
}

function hienTomTatLoi_(errors) {
  const ui = SpreadsheetApp.getUi();

  if (errors.length === 0) {
    ui.alert('Khong co loi.');
  } else {
    ui.alert('Co ' + errors.length + ' loi. Xem chi tiet tai cot Q.');
  }
}

function donLoiCuCotGhiChu() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.CONG_VIEC);
  const col = CONFIG.COLUMN.CONG_VIEC;
  const lastRow = sheet.getLastRow();

  if (lastRow < CONFIG.SYSTEM.START_ROW) return;

  const numRows = lastRow - CONFIG.SYSTEM.START_ROW + 1;
  const range = sheet.getRange(CONFIG.SYSTEM.START_ROW, col.NOTE, numRows, 1);
  const values = range.getValues();
  let changed = 0;

  const output = values.map(row => {
    const text = String(row[0] || '').trim();
    if (laLoiTienNhiemCu_(text)) {
      changed++;
      return [''];
    }
    return row;
  });

  range.setValues(output);
  SpreadsheetApp.getUi().alert('Da don ' + changed + ' loi cu tai cot N.');
}

function laLoiTienNhiemCu_(text) {
  if (!text) return false;

  return text.indexOf('Khong ton tai task') !== -1 ||
    text.indexOf('Không tồn tại task') !== -1 ||
    text.indexOf('Conflict ngay') !== -1 ||
    text.indexOf('Conflict ngày') !== -1 ||
    text.indexOf('Task co predecessor') !== -1 ||
    text.indexOf('Task có predecessor') !== -1;
}

const SELECTION_HIGHLIGHT_CACHE_KEY_V1 = 'LAST_ROW_HIGHLIGHT_SAFE_V1';
const SELECTION_HIGHLIGHT_COLOR_V1 = '#FFF2CC';

/**
 * Highlight tam thoi dung o dang chon.
 */
function xuLyDoiVungChon(e) {
  // Đã tắt highlight ô/dòng khi đổi vùng chọn trên Cong_viec và Tien_do_tong_hop
  // để giảm tải UI và tránh nháy màn hình.
  return;
}

function laSheetDuocHighlightSelectionV1_(sheetName) {
  return sheetName === CONFIG.SHEET.CONG_VIEC || sheetName === 'Tien_do_tong_hop';
}

function khoiPhucSelectionHighlightCuV1_(cache) {
  if (!cache) return;

  const prevRaw = cache.getProperty(SELECTION_HIGHLIGHT_CACHE_KEY_V1);
  if (!prevRaw) return;

  try {
    const prev = JSON.parse(prevRaw);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const prevSheet = ss.getSheetByName(prev.sheetName);
    const startColumn = prev.startColumn || prev.firstCol;
    const numColumns = prev.numColumns || (prev.lastCol && startColumn ? prev.lastCol - startColumn + 1 : 0);

    if (
      prevSheet &&
      prev.row &&
      startColumn &&
      numColumns &&
      prev.backgrounds &&
      prev.backgrounds.length
    ) {
      prevSheet
        .getRange(prev.row, startColumn, 1, numColumns)
        .setBackgrounds(prev.backgrounds);
    }
  } catch (restoreErr) {
    Logger.log('Khoi phuc highlight cu loi: ' + restoreErr);
  } finally {
    cache.deleteProperty(SELECTION_HIGHLIGHT_CACHE_KEY_V1);
  }
}

/**
 * Simple trigger khi doi vung chon.
 */
function onSelectionChange(e) {
  // Đã tắt highlight ô/dòng khi đổi vùng chọn trên toàn bộ file,
  // bao gồm Cong_viec và Tien_do_tong_hop.
  return;
}

/**
 * Khoi phuc highlight dang luu neu co.
 */
function xoaMauHighlightCongViecV1() {
  const cache = layCache_ && typeof layCache_ === 'function' ? layCache_() : null;

  if (cache) {
    khoiPhucSelectionHighlightCuV1_(cache);

    cache.deleteProperty('LAST_HIGHLIGHT');
    cache.deleteProperty('LAST_ROW_HIGHLIGHT_CONG_VIEC');
    cache.deleteProperty('LAST_ROW_HIGHLIGHT_ANY_SHEET_V1');
    cache.deleteProperty('LAST_CELL_HIGHLIGHT_ANY_SHEET_V1');
    cache.deleteProperty(SELECTION_HIGHLIGHT_CACHE_KEY_V1);
  }

  if (typeof normalizeCongViecRowBackgrounds_ === 'function') {
    normalizeCongViecRowBackgrounds_();
  }

  SpreadsheetApp.flush();

  const message = 'Da khoi phuc highlight dong dang chon.';
  Logger.log(message);
  return message;
}

