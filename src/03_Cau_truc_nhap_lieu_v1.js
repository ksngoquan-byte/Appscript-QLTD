const CAU_TRUC_NHAP_LIEU_V1 = {
  SHEET_NAME: 'Cong_viec',
  START_ROW: 5,
  COL: {
    MA_CAU_TRUC: 2,
    ZONE: 3,
    LOAI_CT: 4,
    CONG_TRINH: 5,
    HANG_MUC: 6,
    TEN_CV: 8
  },
  TASK_NAME_SOURCE_SHEETS: [
    'Danh_muc_cong_viec',
    'DM_Goi_y_master'
  ],
  TASK_NAME_HEADER_KEYWORDS: [
    'ten cong viec',
    'ten cv',
    'cong viec',
    'task name'
  ],
  TASK_NAME_VALIDATION_HELP_TEXT: 'Giá trị tùy biến phù hợp.'
};

function getMaCauTrucV1_(value) {
  if (value === null || typeof value === 'undefined') return '';

  const text = String(value).trim();
  if (!text) return '';

  const numberValue = Number(text);
  if (!isFinite(numberValue) || Math.floor(numberValue) !== numberValue) return '';

  const normalized = String(numberValue);
  return ['0', '1', '2', '3', '4'].indexOf(normalized) !== -1 ? normalized : '';
}

function isDongNhomCauTrucV1_(ma) {
  return ['0', '1', '2', '3', '4'].indexOf(getMaCauTrucV1_(ma)) !== -1;
}

function isDongCongViecChiTietV1_(ma, tenCongViec) {
  return !coGiaTriCauTrucNhapLieuV1_(ma) && coGiaTriCauTrucNhapLieuV1_(tenCongViec);
}

function capNhatTenCongViecTheoMaCauTrucV1_(sheet, row) {
  if (!sheet || sheet.getName() !== CAU_TRUC_NHAP_LIEU_V1.SHEET_NAME) return false;
  if (row < CAU_TRUC_NHAP_LIEU_V1.START_ROW) return false;

  const col = CAU_TRUC_NHAP_LIEU_V1.COL;
  const values = sheet.getRange(row, col.MA_CAU_TRUC, 1, col.HANG_MUC - col.MA_CAU_TRUC + 1).getValues()[0];
  const ma = getMaCauTrucV1_(values[0]);
  let tenMoi = null;

  if (ma === '1') tenMoi = values[col.ZONE - col.MA_CAU_TRUC];
  if (ma === '2') tenMoi = values[col.LOAI_CT - col.MA_CAU_TRUC];
  if (ma === '3') tenMoi = values[col.CONG_TRINH - col.MA_CAU_TRUC];
  if (ma === '4') tenMoi = values[col.HANG_MUC - col.MA_CAU_TRUC];

  if (tenMoi === null) return false;

  sheet.getRange(row, col.TEN_CV).setValue(tenMoi || '');
  return true;
}

function chuanHoaNhapLieuMaCauTrucV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CAU_TRUC_NHAP_LIEU_V1.SHEET_NAME);
  if (!sheet) throw new Error('Khong tim thay sheet Cong_viec');

  const startRow = typeof CONFIG !== 'undefined' && CONFIG.SYSTEM
    ? CONFIG.SYSTEM.START_ROW
    : CAU_TRUC_NHAP_LIEU_V1.START_ROW;
  const lastRow = sheet.getLastRow();
  const maxRows = sheet.getMaxRows();
  const col = CAU_TRUC_NHAP_LIEU_V1.COL;

  const validationMessage = capNhatDataValidationTenCongViecMauV1_(ss, sheet);

  if (lastRow < startRow) {
    return validationMessage + '\nKhong co dong du lieu de chuan hoa.';
  }

  const numRows = lastRow - startRow + 1;
  const range = sheet.getRange(startRow, col.MA_CAU_TRUC, numRows, col.TEN_CV - col.MA_CAU_TRUC + 1);
  const values = range.getValues();
  const tenRange = sheet.getRange(startRow, col.TEN_CV, numRows, 1);
  const tenValues = tenRange.getValues();
  let changed = 0;

  values.forEach(function(row, index) {
    const ma = getMaCauTrucV1_(row[0]);
    let tenMoi = null;

    if (ma === '1') tenMoi = row[col.ZONE - col.MA_CAU_TRUC];
    if (ma === '2') tenMoi = row[col.LOAI_CT - col.MA_CAU_TRUC];
    if (ma === '3') tenMoi = row[col.CONG_TRINH - col.MA_CAU_TRUC];
    if (ma === '4') tenMoi = row[col.HANG_MUC - col.MA_CAU_TRUC];

    if (tenMoi !== null && tenValues[index][0] !== tenMoi) {
      tenValues[index][0] = tenMoi || '';
      changed++;
    }
  });

  if (changed > 0) {
    tenRange.setValues(tenValues);
  }

  const message = 'Da chuan hoa nhap lieu ma cau truc. Dong cap nhat H: ' + changed + '. ' + validationMessage;
  Logger.log(message);
  return message;
}

function capNhatDataValidationTenCongViecMauV1_(ss, sheet) {
  const startRow = typeof CONFIG !== 'undefined' && CONFIG.SYSTEM
    ? CONFIG.SYSTEM.START_ROW
    : CAU_TRUC_NHAP_LIEU_V1.START_ROW;
  const maxRows = sheet.getMaxRows();
  const numRows = Math.max(1, maxRows - startRow + 1);
  const source = timNguonDanhMucTenCongViecMauV1_(ss);

  if (!source) {
    const message = '[THIEU DU LIEU] Khong tim thay nguon dropdown ten cong viec mau.';
    Logger.log(message);
    throw new Error(message);
  }

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(source.range, true)
    .setAllowInvalid(true)
    .setHelpText(CAU_TRUC_NHAP_LIEU_V1.TASK_NAME_VALIDATION_HELP_TEXT)
    .build();

  sheet
    .getRange(startRow, CAU_TRUC_NHAP_LIEU_V1.COL.TEN_CV, numRows, 1)
    .setDataValidation(rule);

  const message =
    'Da cai dropdown mem cot H tu ' +
    source.sheetName +
    '!' +
    source.a1Notation +
    '.';
  Logger.log(message);
  return message;
}

function timNguonDanhMucTenCongViecMauV1_(ss) {
  for (let i = 0; i < CAU_TRUC_NHAP_LIEU_V1.TASK_NAME_SOURCE_SHEETS.length; i++) {
    const sheetName = CAU_TRUC_NHAP_LIEU_V1.TASK_NAME_SOURCE_SHEETS[i];
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;

    const sourceRange = timCotTenCongViecMauTrongSheetV1_(sheet);
    if (!sourceRange) continue;

    return {
      sheetName: sheetName,
      range: sourceRange,
      a1Notation: sourceRange.getA1Notation()
    };
  }

  return null;
}

function timCotTenCongViecMauTrongSheetV1_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) return null;

  const values = sheet.getRange(1, 1, Math.min(lastRow, 20), lastCol).getValues();

  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      const header = chuanHoaTextKeyCauTrucNhapLieuV1_(values[r][c]);
      if (!header) continue;

      const matched = CAU_TRUC_NHAP_LIEU_V1.TASK_NAME_HEADER_KEYWORDS.some(function(keyword) {
        return header === keyword || header.indexOf(keyword) !== -1;
      });

      if (!matched) continue;

      const startRow = r + 2;
      const numRows = lastRow - startRow + 1;
      if (numRows <= 0) return null;

      return sheet.getRange(startRow, c + 1, numRows, 1);
    }
  }

  return null;
}

function chuanHoaTextKeyCauTrucNhapLieuV1_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function coGiaTriCauTrucNhapLieuV1_(value) {
  return value !== null && value !== '' && typeof value !== 'undefined';
}
