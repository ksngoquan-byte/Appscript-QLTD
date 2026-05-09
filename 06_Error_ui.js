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
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== CONFIG.SHEET.CONG_VIEC) return;

    const row = e.range.getRow();
    if (row < CONFIG.SYSTEM.START_ROW) return;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetData = ss.getSheetByName(CONFIG.SHEET.CONG_VIEC);
    const lastRow = sheetData.getLastRow();
    if (lastRow < CONFIG.SYSTEM.START_ROW) return;

    const col = CONFIG.COLUMN.CONG_VIEC;
    const numRows = lastRow - CONFIG.SYSTEM.START_ROW + 1;
    const numCols = Math.max(sheetData.getLastColumn(), col.LOI_TIEN_NHIEM);
    const data = sheetData.getRange(CONFIG.SYSTEM.START_ROW, 1, numRows, numCols).getValues();
    const cache = layCache_();

    const prev = cache.getProperty('LAST_HIGHLIGHT');
    if (prev) {
      JSON.parse(prev).forEach(r => {
        sheetData.getRange(r, 1, 1, numCols).setBackground(null);
      });
    }

    const taskMap = {};

    for (let i = 0; i < data.length; i++) {
      const dataRow = data[i];
      if (!laDongCongViec_(dataRow)) continue;

      const ref = dataRow[col.SO_THAM_CHIEU - 1];
      if (!ref) continue;

      const refKey = String(Number(ref));
      const parsed = phanTichTienNhiemV1_(dataRow[col.PREDECESSOR - 1], refKey);

      taskMap[refKey] = {
        index: i,
        predecessors: parsed.items
      };
    }

    const selectedRef = sheetData.getRange(row, col.SO_THAM_CHIEU).getValue();
    if (!selectedRef) return;

    const visited = new Set();

    function truyVet(ref) {
      if (visited.has(ref)) return;
      visited.add(ref);

      const task = taskMap[ref];
      if (!task) return;

      task.predecessors.forEach(p => truyVet(p.ref));
    }

    truyVet(String(Number(selectedRef)));

    const rowsToSave = [];

    visited.forEach(ref => {
      const task = taskMap[ref];
      if (!task) return;

      const rowIndex = task.index + CONFIG.SYSTEM.START_ROW;
      sheetData.getRange(rowIndex, 1, 1, numCols).setBackground('#cfe2f3');
      rowsToSave.push(rowIndex);
    });

    sheetData.getRange(row, 1, 1, numCols).setBackground('#f4cccc');
    rowsToSave.push(row);

    cache.setProperty('LAST_HIGHLIGHT', JSON.stringify(rowsToSave));
  } catch (err) {
    Logger.log(err);
  }
}

function onSelectionChange(e) {
  return xuLyDoiVungChon(e);
}
