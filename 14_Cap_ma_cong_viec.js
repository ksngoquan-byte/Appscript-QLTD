function capMaCongViecChoVungNeuThieuV1_(sheet, editedRange) {
  if (!sheet || !editedRange) return { updatedId: 0, updatedCode: 0 };
  if (sheet.getName() !== 'Cong_viec') return { updatedId: 0, updatedCode: 0 };

  const startRow = 5;
  const lastRow = sheet.getLastRow();
  if (lastRow < startRow) return { updatedId: 0, updatedCode: 0 };

  const rangeStartRow = Math.max(editedRange.getRow(), startRow);
  const rangeEndRow = Math.min(editedRange.getLastRow(), lastRow);

  if (rangeEndRow < rangeStartRow) return { updatedId: 0, updatedCode: 0 };

  if (vungEditGiaoCotTenCongViecCapMaV1_(editedRange)) {
    return danhLaiIdCongViecTheoThuTuTrenSheetV1_(sheet);
  }

  return capMaCongViecChoKhoangDongV1_(sheet, rangeStartRow, rangeEndRow);
}

function capMaCongViecChoKhoangDongV1_(sheet, fromRow, toRow) {
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(5000)) {
    Logger.log('Không lấy được lock để cấp mã công việc.');
    return { updatedId: 0, updatedCode: 0 };
  }

  try {
    const startRow = 5;
    const lastRow = sheet.getLastRow();

    if (lastRow < startRow) return { updatedId: 0, updatedCode: 0 };

    const safeFromRow = Math.max(fromRow, startRow);
    const safeToRow = Math.min(toRow, lastRow);

    if (safeToRow < safeFromRow) return { updatedId: 0, updatedCode: 0 };

    const numRows = safeToRow - safeFromRow + 1;

    // Chỉ đọc toàn bộ cột G để tìm ID lớn nhất; chỉ ghi G/O trong vùng vừa edit/paste.
    const allIds = sheet.getRange(startRow, 7, lastRow - startRow + 1, 1).getValues();
    let maxId = layIdLonNhatTuCotGV1_(allIds);

    const range = sheet.getRange(safeFromRow, 1, numRows, 15); // A:O
    const values = range.getValues();
    const idValues = values.map(function(row) {
      return [row[6]];
    });
    const codeValues = values.map(function(row) {
      return [row[14]];
    });

    let updatedId = 0;
    let updatedCode = 0;

    for (let i = 0; i < values.length; i++) {
      const row = values[i];

      if (!laDongTaskThatChoCapMaCongViecV1_(row)) continue;

      let id = row[6];    // G
      const code = row[14]; // O

      if (!id) {
        maxId++;
        id = maxId;
        idValues[i][0] = id;
        row[6] = id;
        updatedId++;
      }

      if (!code) {
        codeValues[i][0] = taoMaCongViecTuDongV1_(row, id);
        updatedCode++;
      }
    }

    if (updatedId > 0) {
      sheet.getRange(safeFromRow, 7, numRows, 1).setValues(idValues);
    }

    if (updatedCode > 0) {
      sheet.getRange(safeFromRow, 15, numRows, 1).setValues(codeValues);
    }

    return {
      updatedId: updatedId,
      updatedCode: updatedCode
    };
  } finally {
    lock.releaseLock();
  }
}

function capNhatMaCongViecConThieuV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Cong_viec');

  if (!sheet) throw new Error('Không tìm thấy sheet Cong_viec.');

  const startRow = 5;
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return {
      message: 'Không có dòng công việc để cấp mã.',
      updatedId: 0,
      updatedCode: 0
    };
  }

  const result = danhLaiIdCongViecTheoThuTuTrenSheetV1_(sheet);

  const message =
    'Đã cấp/cập nhật mã công việc còn thiếu. ID đã điều chỉnh: ' +
    result.updatedId +
    ', mã công việc mới: ' +
    result.updatedCode +
    '.';

  Logger.log(message);

  return {
    message: message,
    updatedId: result.updatedId,
    updatedCode: result.updatedCode
  };
}

function danhLaiIdCongViecTheoThuTuV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Cong_viec');

  if (!sheet) return { updatedId: 0, updatedCode: 0 };

  return danhLaiIdCongViecTheoThuTuTrenSheetV1_(sheet);
}

function danhLaiIdCongViecTheoThuTuTrenSheetV1_(sheet) {
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(5000)) {
    Logger.log('Không lấy được lock để đánh lại ID công việc.');
    return { updatedId: 0, updatedCode: 0 };
  }

  try {
    const startRow = 5;
    const lastRow = sheet.getLastRow();

    if (lastRow < startRow) return { updatedId: 0, updatedCode: 0 };

    const numRows = lastRow - startRow + 1;
    const values = sheet.getRange(startRow, 1, numRows, 15).getValues(); // A:O
    const idValues = values.map(function(row) {
      return [row[6]];
    });
    const codeValues = values.map(function(row) {
      return [row[14]];
    });

    let nextId = 0;
    let updatedId = 0;
    let updatedCode = 0;

    for (let i = 0; i < values.length; i++) {
      const row = values[i];

      if (!laDongTaskThatChoCapMaCongViecV1_(row)) {
        if (idValues[i][0] !== '') {
          idValues[i][0] = '';
          updatedId++;
        }
        continue;
      }

      nextId++;

      if (String(row[6] || '') !== String(nextId)) {
        idValues[i][0] = nextId;
        row[6] = nextId;
        updatedId++;
      } else {
        row[6] = idValues[i][0];
      }

      if (!row[14]) {
        codeValues[i][0] = taoMaCongViecTuDongV1_(row, nextId);
        updatedCode++;
      }
    }

    if (updatedId > 0) {
      sheet.getRange(startRow, 7, numRows, 1).setValues(idValues);
    }

    if (updatedCode > 0) {
      sheet.getRange(startRow, 15, numRows, 1).setValues(codeValues);
    }

    return {
      updatedId: updatedId,
      updatedCode: updatedCode
    };
  } finally {
    lock.releaseLock();
  }
}

function vungEditGiaoCotTenCongViecCapMaV1_(editedRange) {
  const startCol = editedRange.getColumn();
  const endCol = editedRange.getLastColumn();
  return startCol <= 8 && endCol >= 8;
}

function laDongTaskThatChoCapMaCongViecV1_(row) {
  const taskName = String(row[7] || '').trim(); // H
  if (!taskName) return false;

  return true;
}

function layIdLonNhatTuCotGV1_(idValues) {
  let max = 0;

  idValues.forEach(function(row) {
    const n = Number(row[0]);
    if (isFinite(n) && n > max) max = n;
  });

  return max;
}

function taoMaCongViecTuDongV1_(row, id) {
  const templateCode = String(row[0] || '').trim(); // A
  const numericId = Number(id);
  const paddedId = isFinite(numericId)
    ? Utilities.formatString('%03d', numericId)
    : String(id).trim();

  const projectCode = layMaDuAnChoMaCongViecV1_();

  if (projectCode && templateCode) {
    return projectCode + '-' + templateCode + '-' + paddedId;
  }

  if (templateCode) {
    return templateCode + '-' + paddedId;
  }

  return 'CV-' + paddedId;
}

function layMaDuAnChoMaCongViecV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Cau_hinh');

  if (!sheet) return '';

  const values = sheet.getDataRange().getValues();

  for (let i = 0; i < values.length; i++) {
    const key = String(values[i][0] || '').trim();
    const value = String(values[i][1] || '').trim();

    if (
      key === 'MA_DU_AN' ||
      key === 'PROJECT_CODE' ||
      key === 'Mã dự án'
    ) {
      return value;
    }
  }

  return '';
}

function dongBoMaCongViecCuoiV1() {
  const result = capNhatMaCongViecConThieuV1();
  return result.message || String(result);
}

function capMaCongViec() {
  const result = capNhatMaCongViecConThieuV1();
  return result.message || String(result);
}
