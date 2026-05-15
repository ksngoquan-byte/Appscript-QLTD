function chayBoTinhLich() {
  try {
    chayScheduleEngineV1();
    SpreadsheetApp.getUi().alert('Da chay Schedule Engine V1. Ket qua o L/M, loi o Q.');
  } catch (err) {
    ghiLogLoi_('chayBoTinhLich: ' + err);
    throw err;
  }
}

function danhDauDuongGang() {
  try {
    ghiLogThongTin_('Detect Critical Path V1');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET.CONG_VIEC);

    const lastRow = sheet.getLastRow();
    if (lastRow < CONFIG.SYSTEM.START_ROW) return;

    const numRows = lastRow - CONFIG.SYSTEM.START_ROW + 1;
    const numCols = Math.max(sheet.getLastColumn(), CONFIG.COLUMN.CONG_VIEC.LOI_TIEN_NHIEM);
    const data = sheet.getRange(CONFIG.SYSTEM.START_ROW, 1, numRows, numCols).getValues();

    const col = CONFIG.COLUMN.CONG_VIEC;
    const taskMap = {};

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!laDongCongViec_(row)) continue;

      const ref = row[col.SO_THAM_CHIEU - 1];
      if (!ref) continue;

      const refKey = String(Number(ref));
      const parsed = phanTichTienNhiemV1_(row[col.PREDECESSOR - 1], refKey);

      taskMap[refKey] = {
        index: i,
        ref: refKey,
        end: row[col.END - 1],
        predecessors: parsed.items
      };
    }

    let lastTask = null;
    let maxEnd = null;

    for (let ref in taskMap) {
      const task = taskMap[ref];
      if (!task.end) continue;

      if (!maxEnd || task.end > maxEnd) {
        maxEnd = task.end;
        lastTask = ref;
      }
    }

    if (!lastTask) return;

    const criticalSet = new Set();

    function truyVet(ref) {
      if (criticalSet.has(ref)) return;
      criticalSet.add(ref);

      const task = taskMap[ref];
      if (!task) return;

      task.predecessors.forEach(p => truyVet(p.ref));
    }

    truyVet(lastTask);

    sheet.getRange(CONFIG.SYSTEM.START_ROW, 1, numRows, numCols).setBackground(null);

    criticalSet.forEach(ref => {
      const task = taskMap[ref];
      const rowIndex = task.index + CONFIG.SYSTEM.START_ROW;
      sheet.getRange(rowIndex, 1, 1, numCols).setBackground('#f4cccc');
    });

    if (typeof normalizeCongViecRowBackgrounds_ === 'function') {
      normalizeCongViecRowBackgrounds_(sheet);
    }

    ghiLogThongTin_('Critical path length: ' + criticalSet.size);
  } catch (err) {
    ghiLogLoi_('danhDauDuongGang: ' + err);
    throw err;
  }
}
