function taoDashboard() {
  try {
    ghiLogThongTin_('Build Dashboard V3');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetData = ss.getSheetByName(CONFIG.SHEET.CONG_VIEC);

    let sheetDash = ss.getSheetByName('Tien_do_tong_hop');
    if (!sheetDash) {
      sheetDash = ss.insertSheet('Tien_do_tong_hop');
    } else {
      sheetDash.clear();
    }

    const lastRow = sheetData.getLastRow();
    if (lastRow < CONFIG.SYSTEM.START_ROW) return;

    const numRows = lastRow - CONFIG.SYSTEM.START_ROW + 1;
    const numCols = Math.max(sheetData.getLastColumn(), CONFIG.COLUMN.CONG_VIEC.LOI_TIEN_NHIEM);
    const data = sheetData.getRange(CONFIG.SYSTEM.START_ROW, 1, numRows, numCols).getValues();
    const col = CONFIG.COLUMN.CONG_VIEC;

    let total = 0;
    let scheduled = 0;
    let missing = 0;
    let error = 0;
    const byHangMuc = {};
    const byPhongBan = {};

    for (let row of data) {
      if (!laDongCongViec_(row)) continue;

      total++;

      const hangMuc = row[col.HANG_MUC - 1] || 'Khong xac dinh';
      const phongBan = row[col.PHONG_BAN - 1] || 'Khong xac dinh';
      const start = row[col.START - 1];
      const end = row[col.END - 1];
      const note = row[col.LOI_TIEN_NHIEM - 1];

      if (note) error++;
      if (start && end) scheduled++; else missing++;

      if (!byHangMuc[hangMuc]) byHangMuc[hangMuc] = { total: 0, done: 0 };
      byHangMuc[hangMuc].total++;
      if (start && end) byHangMuc[hangMuc].done++;

      if (!byPhongBan[phongBan]) byPhongBan[phongBan] = { total: 0, done: 0 };
      byPhongBan[phongBan].total++;
      if (start && end) byPhongBan[phongBan].done++;
    }

    let rowCursor = 1;

    sheetDash.getRange(rowCursor++, 1).setValue('TONG QUAN');
    sheetDash.getRange(rowCursor++, 1, 1, 5).setValues([[
      'Tong', 'Da schedule', 'Chua schedule', 'Loi', '%'
    ]]);

    const percent = total ? scheduled / total : 0;
    sheetDash.getRange(rowCursor, 1, 1, 5).setValues([[total, scheduled, missing, error, percent]]);
    sheetDash.getRange(rowCursor, 5).setNumberFormat('0.00%');
    toMauTheoTyLe_(sheetDash.getRange(rowCursor, 5), percent);

    rowCursor += 2;
    sheetDash.getRange(rowCursor++, 1).setValue('THEO HANG MUC');
    sheetDash.getRange(rowCursor++, 1, 1, 4).setValues([[
      'Hang muc', 'Tong', 'Done', '%'
    ]]);

    const hangMucArr = Object.keys(byHangMuc).map(key => {
      const s = byHangMuc[key];
      return [key, s.total, s.done, s.total ? s.done / s.total : 0];
    }).sort((a, b) => a[3] - b[3]);

    if (hangMucArr.length) {
      sheetDash.getRange(rowCursor, 1, hangMucArr.length, 4).setValues(hangMucArr);
      for (let i = 0; i < hangMucArr.length; i++) {
        const cell = sheetDash.getRange(rowCursor + i, 4);
        cell.setNumberFormat('0.00%');
        toMauTheoTyLe_(cell, hangMucArr[i][3]);
      }
    }

    rowCursor += hangMucArr.length + 2;
    sheetDash.getRange(rowCursor++, 1).setValue('THEO PHONG BAN');
    sheetDash.getRange(rowCursor++, 1, 1, 4).setValues([[
      'Phong ban', 'Tong', 'Done', '%'
    ]]);

    const phongBanArr = Object.keys(byPhongBan).map(key => {
      const s = byPhongBan[key];
      return [key, s.total, s.done, s.total ? s.done / s.total : 0];
    }).sort((a, b) => a[3] - b[3]);

    if (phongBanArr.length) {
      sheetDash.getRange(rowCursor, 1, phongBanArr.length, 4).setValues(phongBanArr);
      for (let i = 0; i < phongBanArr.length; i++) {
        const cell = sheetDash.getRange(rowCursor + i, 4);
        cell.setNumberFormat('0.00%');
        toMauTheoTyLe_(cell, phongBanArr[i][3]);
      }
    }

    rowCursor += phongBanArr.length + 2;
    sheetDash.getRange(rowCursor++, 1).setValue('TOP 5 CHAM NHAT');
    const top5 = hangMucArr.slice(0, 5);
    if (top5.length) {
      sheetDash.getRange(rowCursor, 1, top5.length, 4).setValues(top5);
    }

    ghiLogThongTin_('Dashboard V3 done');
  } catch (err) {
    ghiLogLoi_('taoDashboard: ' + err);
    throw err;
  }
}

function toMauTheoTyLe_(cell, value) {
  if (value < 0.5) {
    cell.setBackground('#ffcccc');
  } else if (value < 0.8) {
    cell.setBackground('#fff2cc');
  } else {
    cell.setBackground('#d9ead3');
  }
}
