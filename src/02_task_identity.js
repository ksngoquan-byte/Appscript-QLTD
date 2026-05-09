function capMaCongViec() {
  return chayCoKhoa_(() => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEET.CONG_VIEC);

      const lastRow = sheet.getLastRow();
      if (lastRow < CONFIG.SYSTEM.START_ROW) return;

      const numRows = lastRow - CONFIG.SYSTEM.START_ROW + 1;
      const numCols = Math.max(sheet.getLastColumn(), CONFIG.COLUMN.CONG_VIEC.LOI_TIEN_NHIEM);
      const data = sheet.getRange(CONFIG.SYSTEM.START_ROW, 1, numRows, numCols).getValues();
      const col = CONFIG.COLUMN.CONG_VIEC;

      const maCongViecCol = [];
      let newIdCount = 0;
      let lastId = Math.max(layMaCongViecCuoi_(), layMaCongViecLonNhatTuSheet_(data, col));

      for (let i = 0; i < data.length; i++) {
        const row = data[i];

        if (laDongCongViec_(row)) {
          let maCongViec = row[col.MA_CONG_VIEC - 1];
          if (!maCongViec) {
            lastId++;
            maCongViec = dinhDangMa_(lastId);
            newIdCount++;
          } else {
            maCongViec = chuanHoaMaCongViec_(maCongViec);
          }

          maCongViecCol.push([maCongViec]);
        } else {
          maCongViecCol.push(['']);
        }
      }

      if (!CONFIG.SYSTEM.DRY_RUN) {
        sheet.getRange(CONFIG.SYSTEM.START_ROW, col.MA_CONG_VIEC, numRows, 1).setValues(maCongViecCol);
        luuMaCongViecCuoi_(lastId);
      }

      ghiLogThongTin_('Cap ma xong. Ma moi: ' + newIdCount + ', so dong: ' + numRows);
    } catch (err) {
      ghiLogLoi_('capMaCongViec: ' + err);
      throw err;
    }
  });
}

function layMaCongViecLonNhatTuSheet_(data, col) {
  let maxId = 0;

  data.forEach(row => {
    const value = row[col.MA_CONG_VIEC - 1];
    if (!value) return;

    const numberValue = Number(String(value).trim());
    if (isFinite(numberValue) && numberValue > maxId) {
      maxId = numberValue;
    }
  });

  return maxId;
}

function chuanHoaMaCongViec_(value) {
  const text = String(value).trim();
  const numberValue = Number(text);

  if (!isFinite(numberValue) || numberValue <= 0) {
    return text;
  }

  return dinhDangMa_(Math.floor(numberValue));
}
