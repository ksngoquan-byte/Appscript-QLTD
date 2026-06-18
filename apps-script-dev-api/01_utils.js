function dinhDangMa_(num) {
  return ('0000' + num).slice(-4);
}

function layMaCongViecCuoi_() {
  const prop = PropertiesService.getScriptProperties();
  return Number(prop.getProperty(CONFIG.CONFIG_KEY.LAST_TASK_ID)) || 0;
}

function luuMaCongViecCuoi_(val) {
  PropertiesService.getScriptProperties()
    .setProperty(CONFIG.CONFIG_KEY.LAST_TASK_ID, String(val));
}

function laDongCongViec_(row) {
  if (typeof laDongTaskTienDoV1_ === 'function') {
    return laDongTaskTienDoV1_(row);
  }

  const col = CONFIG.COLUMN.CONG_VIEC;
  const b = row[col.MA_CAU_TRUC - 1];
  const g = row[col.SO_THAM_CHIEU - 1];
  const h = row[col.TEN_CV - 1];

  return !!h && (!!b || !!g);
}

function coGiaTriCongViec_(value) {
  return value !== null && value !== '' && typeof value !== 'undefined';
}

function isCongViecActiveRow_(rowValues, headerMap) {
  const col = CONFIG.COLUMN.CONG_VIEC;
  const row = rowValues || [];
  const keyCols = [
    col.MA_CV_MAU,
    col.MA_CAU_TRUC,
    col.SO_THAM_CHIEU,
    col.TEN_CV,
    col.PHONG_BAN,
    col.SO_NGAY,
    col.PREDECESSOR,
    col.START,
    col.END,
    col.NOTE,
    col.MA_CONG_VIEC,
    col.MA_MOC
  ];

  // R:U la nhom cap nhat thuc te neu file da cai module tien do thuc te.
  [18, 19, 20, 21].forEach(function(colIndex) {
    if (keyCols.indexOf(colIndex) === -1) keyCols.push(colIndex);
  });

  return keyCols.some(function(colIndex) {
    return coGiaTriCongViec_(row[colIndex - 1]);
  });
}

function clearCongViecRowBackgroundIfInactive_(sheet, rowIndex, lastCol, rowValues) {
  if (!sheet || sheet.getName() !== CONFIG.SHEET.CONG_VIEC) return false;

  const width = Math.max(lastCol || sheet.getLastColumn(), 27);
  const values = rowValues || sheet.getRange(rowIndex, 1, 1, width).getValues()[0];

  if (isCongViecActiveRow_(values, null)) return false;

  sheet.getRange(rowIndex, 1, 1, width).setBackground(null);
  return true;
}

function normalizeCongViecRowBackgrounds_(sheet) {
  const targetSheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET.CONG_VIEC);
  if (!targetSheet) throw new Error('Khong tim thay sheet Cong_viec');

  const startRow = CONFIG.SYSTEM.START_ROW;
  const lastRow = targetSheet.getLastRow();
  if (lastRow < startRow) return 0;

  const numRows = lastRow - startRow + 1;
  const width = Math.max(targetSheet.getLastColumn(), 27);
  const range = targetSheet.getRange(startRow, 1, numRows, width);
  const values = range.getValues();
  const backgrounds = range.getBackgrounds();
  let highlightedRow = null;
  let changed = 0;

  try {
    const cache = PropertiesService.getDocumentProperties();
    const prevRaw = cache.getProperty('LAST_ROW_HIGHLIGHT_SAFE_V1');
    if (prevRaw) {
      const prev = JSON.parse(prevRaw);
      if (prev && prev.sheetName === targetSheet.getName() && prev.row) {
        highlightedRow = Number(prev.row);
      }
    }
  } catch (err) {
    Logger.log('normalizeCongViecRowBackgrounds_: khong doc duoc cache highlight: ' + err);
  }

  for (let i = 0; i < values.length; i++) {
    if (highlightedRow === startRow + i) continue;
    if (isCongViecActiveRow_(values[i], null)) continue;

    for (let c = 0; c < width; c++) {
      backgrounds[i][c] = null;
    }
    changed++;
  }

  if (changed > 0) {
    range.setBackgrounds(backgrounds);
  }

  Logger.log('normalizeCongViecRowBackgrounds_: da don background ' + changed + ' dong khong active.');
  return changed;
}

function ghiLogThongTin_(msg) {
  Logger.log('[INFO] ' + msg);
}

function ghiLogLoi_(msg) {
  Logger.log('[LOI] ' + msg);
}

function chayCoKhoa_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function layCache_() {
  return PropertiesService.getDocumentProperties();
}
