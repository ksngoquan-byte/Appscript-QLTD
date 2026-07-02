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
  TASK_NAME_SOURCE_SHEET: 'Danh_muc_cong_viec',
  TASK_NAME_SOURCE_START_ROW: 5,
  TASK_NAME_SOURCE_COL: 2,
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

function isDongCongViecChiTietV1_(ma, tenCongViec, row) {
  if (row && Array.isArray(row)) {
    return laDongTaskTienDoV1_(row);
  }

  // Khong du du lieu J/K/L/M/R/S/T de xac dinh task that.
  // Tranh fallback kieu cu B trong + H co noi dung = task.
  return false;
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
  const sourceSheet = ss.getSheetByName(CAU_TRUC_NHAP_LIEU_V1.TASK_NAME_SOURCE_SHEET);

  if (!sourceSheet) {
    const message = '[THIEU DU LIEU] Khong tim thay sheet Danh_muc_cong_viec.';
    Logger.log(message);
    throw new Error(message);
  }

  const sourceNumRows = Math.max(1, sourceSheet.getMaxRows() - CAU_TRUC_NHAP_LIEU_V1.TASK_NAME_SOURCE_START_ROW + 1);
  const sourceRange = sourceSheet.getRange(
    CAU_TRUC_NHAP_LIEU_V1.TASK_NAME_SOURCE_START_ROW,
    CAU_TRUC_NHAP_LIEU_V1.TASK_NAME_SOURCE_COL,
    sourceNumRows,
    1
  );

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sourceRange, true)
    .setAllowInvalid(true)
    .setHelpText(CAU_TRUC_NHAP_LIEU_V1.TASK_NAME_VALIDATION_HELP_TEXT)
    .build();

  sheet
    .getRange(startRow, CAU_TRUC_NHAP_LIEU_V1.COL.TEN_CV, numRows, 1)
    .setDataValidation(rule);

  const message =
    'Da cai dropdown mem cot H tu ' +
    CAU_TRUC_NHAP_LIEU_V1.TASK_NAME_SOURCE_SHEET +
    '!' +
    sourceRange.getA1Notation() +
    '.';
  Logger.log(message);
  return message;
}

function coGiaTriCauTrucNhapLieuV1_(value) {
  return value !== null && value !== '' && typeof value !== 'undefined';
}

function coWbsCongViecV1_(row) {
  if (!row || !Array.isArray(row)) return false;

  const b = row[1];   // B - STT WBS / ma cay
  const z = row[25];  // Z - WBS_LEVEL_SYS

  return coGiaTriCauTrucNhapLieuV1_(b) || coGiaTriCauTrucNhapLieuV1_(z);
}

function coDuLieuTienDoV1_(row) {
  if (!row || !Array.isArray(row)) return false;

  // J, K, L, M, R, S, T
  const indexes = [9, 10, 11, 12, 17, 18, 19];

  return indexes.some(function(index) {
    return coGiaTriCauTrucNhapLieuV1_(row[index]);
  });
}

function laDongPhanLoaiTuyBienV1_(row) {
  if (!row || !Array.isArray(row)) return false;

  if (coWbsCongViecV1_(row)) return false;
  if (typeof laDongTaskLegacyKhongWbsV1_ === 'function' && laDongTaskLegacyKhongWbsV1_(row)) return false;

  // B/Z trong, khong phai task legacy.
  // Co the co C hoac H nhung chi la dong phan loai/tieu de.
  return coGiaTriCauTrucNhapLieuV1_(row[2]) || coGiaTriCauTrucNhapLieuV1_(row[7]);
}

function laDongNhomWbsV1_(row) {
  if (!row || !Array.isArray(row)) return false;

  const hasWbs = coWbsCongViecV1_(row);
  const hasName = coGiaTriCauTrucNhapLieuV1_(row[7]); // H
  const hasScheduleData = coDuLieuTienDoV1_(row);

  return hasWbs && hasName && !hasScheduleData;
}

function laDongTaskTienDoV1_(row) {
  if (!row || !Array.isArray(row)) return false;

  const hasWbs = coWbsCongViecV1_(row);
  const hasName = coGiaTriCauTrucNhapLieuV1_(row[7]); // H
  const hasScheduleData = coDuLieuTienDoV1_(row);

  if (hasWbs && hasName && hasScheduleData) return true;

  // Ho tro du lieu cu truoc khi cap nhat WBS:
  // B/Z trong nhung co G ref + H + du lieu tien do van la task that.
  if (typeof laDongTaskLegacyKhongWbsV1_ === 'function' && laDongTaskLegacyKhongWbsV1_(row)) {
    return true;
  }

  return false;
}

function laDongTaskLegacyKhongWbsV1_(row) {
  if (!row || !Array.isArray(row)) return false;

  const g = row[6];   // G - Ref
  const h = row[7];   // H

  const hasWbs = coWbsCongViecV1_(row);
  if (hasWbs) return false;

  const hasRef = coGiaTriCauTrucNhapLieuV1_(g);
  const hasName = coGiaTriCauTrucNhapLieuV1_(h);
  const hasScheduleData = coDuLieuTienDoV1_(row);

  return hasRef && hasName && hasScheduleData;
}
