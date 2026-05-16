const CAY_CONG_VIEC_WBS_V1 = {
  SHEET_NAME: 'Cong_viec',
  HEADER_ROW: 4,
  START_ROW: 5,
  COL_LEVEL_DISPLAY: 2,
  COL_LEVEL_SYS: 26,
  HEADER_LEVEL_SYS: 'WBS_LEVEL_SYS',
  LEVEL_LABELS: ['Cấp 1', 'Cấp 2', 'Cấp 3', 'Cấp 4'],
  MAX_LEVEL: 4,
  MAX_GROUP_DEPTH: 8
};

function hienThiCayCongViecWbsV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = laySheetCongViecWbsV1_(ss);
  const cfg = CAY_CONG_VIEC_WBS_V1;

  setupCotWbsLevelSysCongViecV1_(sheet);

  const lastRow = sheet.getLastRow();
  if (lastRow < cfg.START_ROW) {
    taoNhomDongCongViecWbsV1(sheet);
    ss.toast('Cong_viec chưa có dòng dữ liệu để đánh cây WBS.', 'Cây công việc', 5);
    return 'Cong_viec chưa có dòng dữ liệu để đánh cây WBS.';
  }

  const numRows = lastRow - cfg.START_ROW + 1;
  const displayValues = sheet
    .getRange(cfg.START_ROW, cfg.COL_LEVEL_DISPLAY, numRows, 1)
    .getValues();
  const sysValues = sheet
    .getRange(cfg.START_ROW, cfg.COL_LEVEL_SYS, numRows, 1)
    .getValues();
  const outputDisplayValues = [];
  const outputSysValues = [];
  const counters = [0, 0, 0, 0];
  let changed = 0;
  let missingParentCount = 0;

  for (let i = 0; i < numRows; i++) {
    const level = docCapWbsTuDong_({
      displayValue: displayValues[i][0],
      sysValue: sysValues[i][0]
    });

    if (level === null) {
      outputDisplayValues.push([displayValues[i][0]]);
      outputSysValues.push(['']);
      continue;
    }

    const normalizedLevel = Math.max(1, Math.min(cfg.MAX_LEVEL, level));
    if (normalizedLevel > 1 && counters[normalizedLevel - 2] === 0) {
      counters[0] = Math.max(counters[0], 1);
      missingParentCount++;
    }

    counters[normalizedLevel - 1]++;
    for (let j = normalizedLevel; j < cfg.MAX_LEVEL; j++) {
      counters[j] = 0;
    }

    const code = taoMaCayWbsV1_(counters, normalizedLevel);
    outputDisplayValues.push([code]);
    outputSysValues.push([normalizedLevel]);
    if (displayValues[i][0] !== code || Number(sysValues[i][0]) !== normalizedLevel) changed++;
  }

  sheet
    .getRange(cfg.START_ROW, cfg.COL_LEVEL_DISPLAY, numRows, 1)
    .setValues(outputDisplayValues);
  sheet
    .getRange(cfg.START_ROW, cfg.COL_LEVEL_SYS, numRows, 1)
    .setValues(outputSysValues);

  taoNhomDongCongViecWbsV1(sheet);

  const message = 'Đã hiển thị cây công việc. Dòng cập nhật: ' + changed + '.';
  const warning = missingParentCount > 0
    ? ' Có ' + missingParentCount + ' dòng thiếu cấp cha, đã gắn vào Cấp 1 gần nhất.'
    : '';
  ss.toast(message + warning, 'Cây công việc', 6);
  Logger.log(message + warning);
  return message + warning;
}

function taoNhomDongCongViecWbsV1(sheetInput) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = sheetInput || laySheetCongViecWbsV1_(ss);
  const cfg = CAY_CONG_VIEC_WBS_V1;

  setupCotWbsLevelSysCongViecV1_(sheet);
  xoaNhomDongCongViecWbsV1_(sheet);

  const lastRow = sheet.getLastRow();
  if (lastRow < cfg.START_ROW) return 'Cong_viec chưa có dòng dữ liệu để tạo nhóm.';

  const numRows = lastRow - cfg.START_ROW + 1;
  const levels = sheet
    .getRange(cfg.START_ROW, cfg.COL_LEVEL_SYS, numRows, 1)
    .getValues()
    .map(function(row) {
      return chuanHoaCapWbsV1_(row[0]);
    });

  for (let level = cfg.MAX_LEVEL - 1; level >= 1; level--) {
    let startIndex = null;

    for (let i = 0; i <= levels.length; i++) {
      const currentLevel = i < levels.length ? levels[i] : null;

      if (currentLevel !== null && currentLevel > level) {
        if (startIndex === null) startIndex = i;
        continue;
      }

      if (startIndex !== null) {
        const rowStart = cfg.START_ROW + startIndex;
        const rowCount = i - startIndex;
        if (rowCount > 0) {
          sheet.shiftRowGroupDepth(rowStart, rowCount, 1);
        }
        startIndex = null;
      }
    }
  }

  SpreadsheetApp.flush();
  return 'Đã tạo lại nhóm hàng Cong_viec theo cây WBS.';
}

function gomNhomCongViecWbsV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = laySheetCongViecWbsV1_(ss);

  sheet.collapseRowGroupsUpToDepth(CAY_CONG_VIEC_WBS_V1.MAX_LEVEL);
  ss.toast('Đã gom nhóm Cong_viec.', 'Cây công việc', 5);
  return 'Đã gom nhóm Cong_viec.';
}

function moNhomCongViecWbsV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = laySheetCongViecWbsV1_(ss);

  sheet.expandRowGroupsUpToDepth(CAY_CONG_VIEC_WBS_V1.MAX_LEVEL);
  ss.toast('Đã mở nhóm Cong_viec.', 'Cây công việc', 5);
  return 'Đã mở nhóm Cong_viec.';
}

function setupCotWbsLevelSysCongViecV1_(sheetInput) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = sheetInput || laySheetCongViecWbsV1_(ss);
  const cfg = CAY_CONG_VIEC_WBS_V1;
  const maxRows = sheet.getMaxRows();
  const numRows = Math.max(1, maxRows - cfg.START_ROW + 1);

  sheet.getRange(cfg.HEADER_ROW, cfg.COL_LEVEL_SYS).setValue(cfg.HEADER_LEVEL_SYS);

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(cfg.LEVEL_LABELS, true)
    .setAllowInvalid(false)
    .setHelpText('Chọn cấp công việc: Cấp 1, Cấp 2, Cấp 3 hoặc Cấp 4.')
    .build();

  sheet
    .getRange(cfg.START_ROW, cfg.COL_LEVEL_DISPLAY, numRows, 1)
    .setDataValidation(rule);

  try {
    sheet.hideColumns(cfg.COL_LEVEL_SYS);
  } catch (err) {
    Logger.log('Không ẩn được cột WBS_LEVEL_SYS: ' + err.message);
  }

  baoVeCotWbsLevelSysCongViecV1_(sheet);
  return 'Đã chuẩn hóa cột WBS_LEVEL_SYS và dropdown cấp công việc.';
}

function docCapWbsTuDong_(rowValuesOrSheet, row) {
  if (
    rowValuesOrSheet &&
    typeof rowValuesOrSheet.getRange === 'function' &&
    typeof row === 'number'
  ) {
    const cfg = CAY_CONG_VIEC_WBS_V1;
    const values = rowValuesOrSheet
      .getRange(row, cfg.COL_LEVEL_DISPLAY, 1, cfg.COL_LEVEL_SYS - cfg.COL_LEVEL_DISPLAY + 1)
      .getValues()[0];
    return docCapWbsTuDong_({
      displayValue: values[0],
      sysValue: values[cfg.COL_LEVEL_SYS - cfg.COL_LEVEL_DISPLAY]
    });
  }

  const displayValue = rowValuesOrSheet && typeof rowValuesOrSheet === 'object'
    ? rowValuesOrSheet.displayValue
    : '';
  const sysValue = rowValuesOrSheet && typeof rowValuesOrSheet === 'object'
    ? rowValuesOrSheet.sysValue
    : '';
  const displayLevel = chuanHoaNhanCapWbsV1_(displayValue);

  if (displayLevel !== null) return displayLevel;
  if (isMaCayWbsV1_(displayValue)) return chuanHoaCapWbsV1_(sysValue);
  if (isTrongWbsV1_(displayValue) && isTrongWbsV1_(sysValue)) return null;

  return chuanHoaCapWbsV1_(sysValue);
}

function laySheetCongViecWbsV1_(ss) {
  const sheet = ss.getSheetByName(CAY_CONG_VIEC_WBS_V1.SHEET_NAME);
  if (!sheet) throw new Error('Không tìm thấy sheet Cong_viec.');
  return sheet;
}

function chuanHoaNhanCapWbsV1_(value) {
  const text = String(value || '').trim();
  const match = /^Cấp\s*([1-4])$/i.exec(text);
  return match ? Number(match[1]) : null;
}

function chuanHoaCapWbsV1_(value) {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  const numberValue = Number(value);
  if (!isFinite(numberValue) || Math.floor(numberValue) !== numberValue) return null;
  return numberValue >= 1 && numberValue <= CAY_CONG_VIEC_WBS_V1.MAX_LEVEL
    ? numberValue
    : null;
}

function isMaCayWbsV1_(value) {
  const text = String(value || '').trim();
  return /^(?:[IVXLCDM]+)(?:\.\d+){0,3}$/.test(text);
}

function isTrongWbsV1_(value) {
  return value === null || typeof value === 'undefined' || String(value).trim() === '';
}

function taoMaCayWbsV1_(counters, level) {
  const parts = [];

  parts.push(soSangLaMaWbsV1_(counters[0]));
  for (let i = 1; i < level; i++) {
    parts.push(String(counters[i] || 1));
  }

  return parts.join('.');
}

function soSangLaMaWbsV1_(numberValue) {
  const map = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ];
  let value = Math.max(1, Number(numberValue) || 1);
  let result = '';

  map.forEach(function(pair) {
    while (value >= pair[0]) {
      result += pair[1];
      value -= pair[0];
    }
  });

  return result;
}

function xoaNhomDongCongViecWbsV1_(sheet) {
  const cfg = CAY_CONG_VIEC_WBS_V1;
  const maxRows = sheet.getMaxRows();
  const numRows = Math.max(1, maxRows - cfg.START_ROW + 1);

  for (let i = 0; i < cfg.MAX_GROUP_DEPTH; i++) {
    try {
      sheet.shiftRowGroupDepth(cfg.START_ROW, numRows, -1);
    } catch (err) {
      Logger.log('Dừng xóa group cũ tại lần ' + (i + 1) + ': ' + err.message);
      break;
    }
  }
}

function baoVeCotWbsLevelSysCongViecV1_(sheet) {
  const description = 'WBS_LEVEL_SYS - không chỉnh sửa trực tiếp';

  try {
    const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    protections.forEach(function(protection) {
      if (protection.getDescription() === description) {
        protection.remove();
      }
    });

    const protection = sheet
      .getRange(1, CAY_CONG_VIEC_WBS_V1.COL_LEVEL_SYS, sheet.getMaxRows(), 1)
      .protect();
    protection.setDescription(description);
    protection.setWarningOnly(true);
  } catch (err) {
    Logger.log('Không đặt được cảnh báo bảo vệ cột WBS_LEVEL_SYS: ' + err.message);
  }
}
