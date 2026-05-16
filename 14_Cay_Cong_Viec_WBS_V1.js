const CAY_CONG_VIEC_WBS_V1 = {
  SHEET_NAME: 'Cong_viec',
  HEADER_ROW: 4,
  START_ROW: 5,
  COL_LEVEL_DISPLAY: 2,
  COL_LEVEL_SYS: 26,
  HEADER_LEVEL_SYS: 'WBS_LEVEL_SYS',
  LEVEL_LABELS: ['Cấp 1', 'Cấp 2', 'Cấp 3', 'Cấp 4'],
  MAX_LEVEL: 4,
  MAX_GROUP_DEPTH: 5
};

function hienThiCayCongViecWbsV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = laySheetCongViecWbsV1_(ss);
  const cfg = CAY_CONG_VIEC_WBS_V1;

  const lastDataRow = layDongDuLieuCuoiWbsV1_(sheet);
  if (lastDataRow < cfg.START_ROW) {
    anCotWbsLevelSysCongViecV1_(sheet);
    ss.toast('Cong_viec chưa có dòng dữ liệu để đánh cây WBS.', 'Cây công việc', 5);
    return 'Cong_viec chưa có dòng dữ liệu để đánh cây WBS.';
  }

  const numRows = lastDataRow - cfg.START_ROW + 1;
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

  anCotWbsLevelSysCongViecV1_(sheet);

  const message = 'Đã hiển thị cây công việc. Dòng cập nhật: ' + changed + '.';
  const warning = missingParentCount > 0
    ? ' Có ' + missingParentCount + ' dòng thiếu cấp cha, đã gắn vào Cấp 1 gần nhất.'
    : '';
  ss.toast(message + warning, 'Cây công việc', 6);
  Logger.log(message + warning);
  return message + warning;
}

function taoNhomDongCongViecWbsV1(sheetInput, lastDataRowInput) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = sheetInput || laySheetCongViecWbsV1_(ss);
  const cfg = CAY_CONG_VIEC_WBS_V1;

  const lastDataRow = lastDataRowInput || layDongDuLieuCuoiWbsV1_(sheet);
  xoaNhomDongCongViecWbsV1_(sheet, lastDataRow);

  if (lastDataRow < cfg.START_ROW) return 'Cong_viec chưa có dòng dữ liệu để tạo nhóm.';

  const numRows = lastDataRow - cfg.START_ROW + 1;
  const levels = sheet
    .getRange(cfg.START_ROW, cfg.COL_LEVEL_SYS, numRows, 1)
    .getValues()
    .map(function(row) {
      return chuanHoaCapWbsV1_(row[0]);
    });

  const groupRanges = [];

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
          groupRanges.push({
            rowStart: rowStart,
            rowCount: rowCount
          });
        }
        startIndex = null;
      }
    }
  }

  groupRanges.forEach(function(item) {
    try {
      sheet.shiftRowGroupDepth(item.rowStart, item.rowCount, 1);
    } catch (err) {
      Logger.log('Không tạo được group dòng ' + item.rowStart + ': ' + err.message);
    }
  });

  SpreadsheetApp.flush();
  return 'Đã tạo lại nhóm hàng Cong_viec theo cây WBS.';
}

function gomNhomCongViecWbsV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = laySheetCongViecWbsV1_(ss);
  const cfg = CAY_CONG_VIEC_WBS_V1;
  const lastRow = layDongDuLieuCuoiWbsV1_(sheet);

  collapseAllRowGroupsSafe_(sheet, cfg.START_ROW, lastRow);
  ss.toast('Đã gom nhóm Cong_viec.', 'Cây công việc', 5);
  return 'Đã gom nhóm Cong_viec.';
}

function moNhomCongViecWbsV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = laySheetCongViecWbsV1_(ss);
  const cfg = CAY_CONG_VIEC_WBS_V1;
  const lastRow = layDongDuLieuCuoiWbsV1_(sheet);

  expandAllRowGroupsSafe_(sheet, cfg.START_ROW, lastRow);
  ss.toast('Đã mở nhóm Cong_viec.', 'Cây công việc', 5);
  return 'Đã mở nhóm Cong_viec.';
}

function thietLapCotWbsCongViecV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = laySheetCongViecWbsV1_(ss);
  const message = setupCotWbsLevelSysCongViecV1_(sheet);

  ss.toast(message, 'Cây công việc', 5);
  return message;
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
    .setAllowInvalid(true)
    .setHelpText('Chọn cấp công việc: Cấp 1, Cấp 2, Cấp 3 hoặc Cấp 4.')
    .build();

  sheet
    .getRange(cfg.START_ROW, cfg.COL_LEVEL_DISPLAY, numRows, 1)
    .setDataValidation(rule);

  anCotWbsLevelSysCongViecV1_(sheet);

  return 'Đã chuẩn hóa cột WBS_LEVEL_SYS và dropdown cấp công việc.';
}

function anCotWbsLevelSysCongViecV1_(sheet) {
  try {
    sheet.hideColumns(CAY_CONG_VIEC_WBS_V1.COL_LEVEL_SYS);
  } catch (err) {
    Logger.log('Không ẩn được cột WBS_LEVEL_SYS: ' + err.message);
  }
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
  const legacyLevel = chuanHoaCapCuWbsV1_(displayValue);

  if (displayLevel !== null) return displayLevel;
  if (legacyLevel !== null) return legacyLevel;
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

function chuanHoaCapCuWbsV1_(value) {
  if (value === null || typeof value === 'undefined' || value === '') return null;

  const text = String(value).trim();
  if (!/^[0-4]$/.test(text)) return null;

  const numberValue = Number(text);
  return numberValue <= 1 ? 1 : numberValue;
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

function xoaNhomDongCongViecWbsV1_(sheet, lastDataRowInput) {
  const cfg = CAY_CONG_VIEC_WBS_V1;
  const lastRow = Math.max(lastDataRowInput || layDongDuLieuCuoiWbsV1_(sheet), cfg.START_ROW);

  for (let depth = cfg.MAX_GROUP_DEPTH; depth >= 1; depth--) {
    for (let row = lastRow; row >= cfg.START_ROW; row--) {
      try {
        const group = sheet.getRowGroup(row, depth);
        if (group) group.remove();
      } catch (err) {
        // Bỏ qua dòng/depth không có group.
      }
    }
  }
}

function collapseAllRowGroupsSafe_(sheet, startRow, lastRow) {
  thaoTacRowGroupsSafe_(sheet, startRow, lastRow, 'collapse');
}

function expandAllRowGroupsSafe_(sheet, startRow, lastRow) {
  thaoTacRowGroupsSafe_(sheet, startRow, lastRow, 'expand');
}

function thaoTacRowGroupsSafe_(sheet, startRow, lastRow, actionName) {
  const cfg = CAY_CONG_VIEC_WBS_V1;
  if (!sheet || lastRow < startRow) return;

  for (let depth = 1; depth <= cfg.MAX_GROUP_DEPTH; depth++) {
    for (let row = startRow; row <= lastRow; row++) {
      try {
        const group = sheet.getRowGroup(row, depth);
        if (group && typeof group[actionName] === 'function') {
          group[actionName]();
        }
      } catch (err) {
        // Bỏ qua dòng/depth không có group hoặc runtime không hỗ trợ thao tác.
      }
    }
  }
}

function layDongDuLieuCuoiWbsV1_(sheet) {
  const cfg = CAY_CONG_VIEC_WBS_V1;
  const sheetLastRow = sheet.getLastRow();
  if (sheetLastRow < cfg.START_ROW) return cfg.START_ROW;

  const numRows = sheetLastRow - cfg.START_ROW + 1;
  const refs = [
    sheet.getRange(cfg.START_ROW, 2, numRows, 1).getValues(),  // B
    sheet.getRange(cfg.START_ROW, 8, numRows, 1).getValues(),  // H
    sheet.getRange(cfg.START_ROW, 10, numRows, 4).getValues(), // J:M
    sheet.getRange(cfg.START_ROW, 18, numRows, 4).getValues()  // R:U
  ];

  for (let i = numRows - 1; i >= 0; i--) {
    if (
      dongCoDuLieuWbsV1_(refs[0][i]) ||
      dongCoDuLieuWbsV1_(refs[1][i]) ||
      dongCoDuLieuWbsV1_(refs[2][i]) ||
      dongCoDuLieuWbsV1_(refs[3][i])
    ) {
      return cfg.START_ROW + i;
    }
  }

  return cfg.START_ROW;
}

function dongCoDuLieuWbsV1_(values) {
  return values.some(function(value) {
    return value !== null && typeof value !== 'undefined' && String(value).trim() !== '';
  });
}

function donCanhBaoBaoVeCongViecV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = laySheetCongViecWbsV1_(ss);
  const removed = cleanupWbsProtectionsCongViecV1_(sheet);
  const message = 'Đã dọn cảnh báo bảo vệ Cong_viec. Số protection đã xóa: ' + removed + '.';

  ss.toast(message, 'Cây công việc', 5);
  Logger.log(message);
  return message;
}

function cleanupWbsProtectionsCongViecV1_(sheetInput) {
  let removed = 0;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = sheetInput || laySheetCongViecWbsV1_(ss);
    const types = [
      SpreadsheetApp.ProtectionType.RANGE,
      SpreadsheetApp.ProtectionType.SHEET
    ];

    types.forEach(function(type) {
      let protections = [];
      try {
        protections = sheet.getProtections(type);
      } catch (err) {
        Logger.log('Không đọc được protection WBS: ' + err.message);
        return;
      }

      protections.forEach(function(protection) {
        try {
          if (laProtectionWbsCanXoaV1_(protection)) {
            protection.remove();
            removed++;
          }
        } catch (err) {
          Logger.log('Không xóa được protection WBS: ' + err.message);
        }
      });
    });
  } catch (err) {
    Logger.log('cleanupWbsProtectionsCongViecV1_: ' + err.message);
  }

  return removed;
}

function laProtectionWbsCanXoaV1_(protection) {
  if (!protection.isWarningOnly || !protection.isWarningOnly()) return false;

  try {
    if (!protection.getRange) return true;

    const range = protection.getRange();
    return !!range && range.getSheet().getName() === CAY_CONG_VIEC_WBS_V1.SHEET_NAME;
  } catch (err) {
    return true;
  }
}
