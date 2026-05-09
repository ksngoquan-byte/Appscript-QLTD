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

function xuLyDoiVungChon(e) {
  // Da tat highlight xanh/do khi doi vung chon de tranh nhay man hinh.
  // Khong anh huong den onEdit, cap ma cong viec, lien ket dong va tinh tien do.
  return;
}

function onSelectionChange(e) {
  return xuLyDoiVungChon(e);
}


// === DISABLE_SELECTION_HIGHLIGHT_V1_START ===

/**
 * Highlight dong dang chon.
 *
 * Cong_viec:
 * - To vang ca hang A:W.
 *
 * Tien_do_tong_hop:
 * - Chi to vang vung thong tin A:H.
 * - Khong to vung Gantt phia sau de khong phu mau duong gang/thanh Gantt.
 */
function xuLyDoiVungChon(e) {
  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    const row = e.range.getRow();

    if (row < 5) return;

    const cache = layCache_ && typeof layCache_ === 'function' ? layCache_() : null;

    // Khoi phuc highlight cu.
    if (cache) {
      const prevRaw = cache.getProperty('LAST_ROW_HIGHLIGHT_SAFE_V1');
      if (prevRaw) {
        try {
          const prev = JSON.parse(prevRaw);
          const ss = SpreadsheetApp.getActiveSpreadsheet();
          const prevSheet = ss.getSheetByName(prev.sheetName);

          if (
            prevSheet &&
            prev.row &&
            prev.firstCol &&
            prev.lastCol &&
            prev.backgrounds &&
            prev.backgrounds.length
          ) {
            const width = prev.lastCol - prev.firstCol + 1;
            prevSheet
              .getRange(prev.row, prev.firstCol, 1, width)
              .setBackgrounds(prev.backgrounds);
          }
        } catch (restoreErr) {
          Logger.log('Khoi phuc highlight cu loi: ' + restoreErr);
        }

        cache.deleteProperty('LAST_ROW_HIGHLIGHT_SAFE_V1');
      }
    }

    let firstCol;
    let lastCol;

    if (sheetName === CONFIG.SHEET.CONG_VIEC) {
      firstCol = 1;
      lastCol = 23; // A:W
    } else if (sheetName === 'Tien_do_tong_hop') {
      firstCol = 1;
      lastCol = 8; // A:H, khong phu vung Gantt
    } else {
      return;
    }

    const width = lastCol - firstCol + 1;
    const targetRange = sheet.getRange(row, firstCol, 1, width);
    const oldBackgrounds = targetRange.getBackgrounds();

    targetRange.setBackground('#FFF2CC');

    if (cache) {
      cache.setProperty(
        'LAST_ROW_HIGHLIGHT_SAFE_V1',
        JSON.stringify({
          sheetName: sheetName,
          row: row,
          firstCol: firstCol,
          lastCol: lastCol,
          backgrounds: oldBackgrounds
        })
      );
    }
  } catch (err) {
    Logger.log('xuLyDoiVungChon: ' + err);
  }
}

/**
 * Simple trigger khi doi vung chon.
 */
function onSelectionChange(e) {
  xuLyDoiVungChon(e);
}

/**
 * Khoi phuc highlight dang luu neu co.
 */
function xoaMauHighlightCongViecV1() {
  const cache = layCache_ && typeof layCache_ === 'function' ? layCache_() : null;
  if (!cache) return;

  const prevRaw = cache.getProperty('LAST_ROW_HIGHLIGHT_SAFE_V1');
  if (prevRaw) {
    const prev = JSON.parse(prevRaw);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const prevSheet = ss.getSheetByName(prev.sheetName);

    if (
      prevSheet &&
      prev.row &&
      prev.firstCol &&
      prev.lastCol &&
      prev.backgrounds &&
      prev.backgrounds.length
    ) {
      const width = prev.lastCol - prev.firstCol + 1;
      prevSheet
        .getRange(prev.row, prev.firstCol, 1, width)
        .setBackgrounds(prev.backgrounds);
    }
  }

  cache.deleteProperty('LAST_HIGHLIGHT');
  cache.deleteProperty('LAST_ROW_HIGHLIGHT_CONG_VIEC');
  cache.deleteProperty('LAST_ROW_HIGHLIGHT_ANY_SHEET_V1');
  cache.deleteProperty('LAST_CELL_HIGHLIGHT_ANY_SHEET_V1');
  cache.deleteProperty('LAST_ROW_HIGHLIGHT_SAFE_V1');

  SpreadsheetApp.flush();

  const message = 'Da khoi phuc highlight dong dang chon.';
  Logger.log(message);
  return message;
}

// === DISABLE_SELECTION_HIGHLIGHT_V1_END ===

