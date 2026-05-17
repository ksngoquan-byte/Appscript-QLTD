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

  const numRows = lastRow - startRow + 1;
  const range = sheet.getRange(startRow, 1, numRows, 15); // A:O
  const values = range.getValues();

  let maxId = layIdLonNhatCongViecV1_(values);
  let updatedId = 0;
  let updatedCode = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];

    if (!laDongTaskThatChoCapMaCongViecV1_(row)) continue;

    let id = row[6];     // G
    const code = row[14];  // O

    if (!id) {
      maxId++;
      id = maxId;
      row[6] = id;
      sheet.getRange(startRow + i, 7).setValue(id);
      updatedId++;
    }

    if (!code) {
      const newCode = taoMaCongViecTuDongV1_(row, id);
      row[14] = newCode;
      sheet.getRange(startRow + i, 15).setValue(newCode);
      updatedCode++;
    }
  }

  const message =
    'Đã cấp/cập nhật mã công việc còn thiếu. ID mới: ' +
    updatedId +
    ', mã công việc mới: ' +
    updatedCode +
    '.';

  Logger.log(message);

  return {
    message: message,
    updatedId: updatedId,
    updatedCode: updatedCode
  };
}

function laDongTaskThatChoCapMaCongViecV1_(row) {
  if (typeof laDongTaskThatChoBaselineV1_ === 'function') {
    const isRealTask = laDongTaskThatChoBaselineV1_(moRongRowCapMaLen26CotV1_(row));
    if (isRealTask) return true;
  }

  const taskName = String(row[7] || '').trim(); // H
  if (!taskName) return false;

  return true;
}

function moRongRowCapMaLen26CotV1_(row) {
  const expanded = row.slice();

  while (expanded.length < 26) {
    expanded.push('');
  }

  return expanded;
}

function layIdLonNhatCongViecV1_(values) {
  let max = 0;

  values.forEach(function(row) {
    const n = Number(row[6]); // G
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
