function taoGanttChart() {
  try {
    ghiLogThongTin_('Build Gantt Chart');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetData = ss.getSheetByName(CONFIG.SHEET.CONG_VIEC);

    let sheet = ss.getSheetByName('Gantt_chart');
    if (!sheet) sheet = ss.insertSheet('Gantt_chart');
    else sheet.clear();

    const lastRow = sheetData.getLastRow();
    if (lastRow < CONFIG.SYSTEM.START_ROW) return;

    const numRows = lastRow - CONFIG.SYSTEM.START_ROW + 1;
    const numCols = Math.max(sheetData.getLastColumn(), CONFIG.COLUMN.CONG_VIEC.LOI_TIEN_NHIEM);
    const data = sheetData.getRange(CONFIG.SYSTEM.START_ROW, 1, numRows, numCols).getValues();
    const col = CONFIG.COLUMN.CONG_VIEC;
    const tasks = [];

    for (let row of data) {
      if (!laDongCongViec_(row)) continue;

      const name = row[col.TEN_CV - 1];
      const start = row[col.START - 1];
      const end = row[col.END - 1];

      if (!start || !end) continue;

      tasks.push({ name, start: new Date(start), end: new Date(end) });
    }

    if (tasks.length === 0) return;

    const minDate = new Date(Math.min(...tasks.map(t => t.start)));
    const maxDate = new Date(Math.max(...tasks.map(t => t.end)));
    const days = [];
    let d = new Date(minDate);

    while (d <= maxDate) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    const header = ['Task'].concat(days.map(x => dinhDangNgay_(x)));
    sheet.getRange(1, 1, 1, header.length).setValues([header]);

    const output = tasks.map(t => {
      const row = [t.name];
      days.forEach(day => row.push(day >= t.start && day <= t.end ? 1 : ''));
      return row;
    });

    sheet.getRange(2, 1, output.length, output[0].length).setValues(output);

    for (let r = 2; r < output.length + 2; r++) {
      for (let c = 2; c < header.length + 1; c++) {
        const val = sheet.getRange(r, c).getValue();
        if (val === 1) {
          sheet.getRange(r, c).setBackground('#6fa8dc');
        }
      }
    }

    ghiLogThongTin_('Gantt done');
  } catch (err) {
    ghiLogLoi_('taoGanttChart: ' + err);
    throw err;
  }
}

function dinhDangNgay_(d) {
  return Utilities.formatDate(d, CONFIG.SYSTEM.TZ, 'dd/MM');
}
