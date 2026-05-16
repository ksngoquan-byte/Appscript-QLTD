/*******************************************************
 * FILE: 07_Cap_nhat_Thuc_te_Tien_do.gs
 *
 * MỤC TIÊU
 * - Thiết lập nhóm cột cập nhật thực tế tại sheet Cong_viec
 * - R: Trạng thái thực hiện
 * - S: Bắt đầu thực tế
 * - T: Hoàn thành thực tế
 * - U: Ghi chú cập nhật
 * - V: Ngày cập nhật
 * - W: Cảnh báo tiến độ
 *
 * NGUYÊN TẮC
 * - Người dùng chỉ nhập R:S:T:U
 * - Apps Script tự ghi V
 * - Apps Script tự tính W
 * - Khi sửa S/T, Schedule Engine tự cập nhật lại J/L/M/Q
 *******************************************************/

function thietLapCotCapNhatThucTeTienDoV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Cong_viec');

  if (!sheet) {
    throw new Error('Không tìm thấy sheet Cong_viec');
  }

  const HEADER_ROW = 4;
  const DATA_START_ROW = 5;
  const MAX_ROW = Math.max(sheet.getMaxRows(), 1000);

  // R:W = 18:23
  const START_COL = 18;
  const COL_COUNT = 6;

  const headers = [[
    'Trạng thái thực hiện',
    'Bắt đầu thực tế',
    'Hoàn thành thực tế',
    'Ghi chú cập nhật',
    'Ngày cập nhật',
    'Cảnh báo tiến độ'
  ]];

  // 1. Ghi header R:W
  sheet.getRange(HEADER_ROW, START_COL, 1, COL_COUNT)
    .setValues(headers)
    .setBackground('#EAF4EC')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true)
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#8AA896',
      SpreadsheetApp.BorderStyle.SOLID
    );

  // 2. Format vùng nhập R:U
  sheet.getRange(DATA_START_ROW, 18, MAX_ROW - DATA_START_ROW + 1, 4)
    .setBackground('#FFF8E7')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setWrap(true)
    .setBorder(
      null,
      null,
      true,
      null,
      true,
      null,
      '#E5E7EB',
      SpreadsheetApp.BorderStyle.SOLID
    );

  // 3. Format vùng hệ thống V:W
  sheet.getRange(DATA_START_ROW, 22, MAX_ROW - DATA_START_ROW + 1, 2)
    .setBackground('#F1F5F9')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setWrap(true)
    .setBorder(
      null,
      null,
      true,
      null,
      true,
      null,
      '#E5E7EB',
      SpreadsheetApp.BorderStyle.SOLID
    );

  // 4. Format ngày cho S:T và V
  sheet.getRange(DATA_START_ROW, 19, MAX_ROW - DATA_START_ROW + 1, 2)
    .setNumberFormat('dd/MM/yyyy')
    .setHorizontalAlignment('center');

  sheet.getRange(DATA_START_ROW, 22, MAX_ROW - DATA_START_ROW + 1, 1)
    .setNumberFormat('dd/MM/yyyy')
    .setHorizontalAlignment('center');

  // 5. Dropdown trạng thái tại R
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      'Chưa bắt đầu',
      'Đang làm',
      'Hoàn thành',
      'Tạm dừng'
    ], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(DATA_START_ROW, 18, MAX_ROW - DATA_START_ROW + 1, 1)
    .setDataValidation(statusRule)
    .setHorizontalAlignment('center');

  // 6. Căn chỉnh cột
  sheet.setColumnWidth(18, 130); // R
  sheet.setColumnWidth(19, 110); // S
  sheet.setColumnWidth(20, 125); // T
  sheet.setColumnWidth(21, 240); // U
  sheet.setColumnWidth(22, 135); // V
  sheet.setColumnWidth(23, 210); // W

  // 7. Cập nhật cảnh báo lần đầu
  capNhatCanhBaoTienDoCongViecV1();

  SpreadsheetApp.flush();

  const message = 'Đã thiết lập xong cột cập nhật thực tế R:W tại Cong_viec.';
  Logger.log(message);
  return message;
}


/**
 * Hàm xử lý khi người dùng sửa R:U tại sheet Cong_viec.
 * Nên gắn bằng installable onEdit trigger.
 */
function xuLyCapNhatThucTeTienDoOnEditV1(e) {
  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== 'Cong_viec') return;

  const startRow = range.getRow();
  const endRow = startRow + range.getNumRows() - 1;
  const startCol = range.getColumn();
  const endCol = startCol + range.getNumColumns() - 1;

  if (endRow < 5) return;

  // Chỉ xử lý khi sửa R:U
  if (endCol < 18 || startCol > 21) return;

  const actualStartRow = Math.max(startRow, 5);
  const numRows = endRow - actualStartRow + 1;
  const now = new Date();
  const touchedActualDate = startCol <= 20 && endCol >= 19;

  const updateDates = new Array(numRows).fill(null).map(() => [now]);

  // Ghi ngày cập nhật tại V cho toàn bộ dòng bị sửa.
  sheet.getRange(actualStartRow, 22, numRows, 1)
    .setValues(updateDates)
    .setNumberFormat('dd/MM/yyyy');

  if (touchedActualDate) {
    capNhatTrangThaiThucHienChoVungCongViecV1_(sheet, actualStartRow, numRows);
  }

  if (!touchedActualDate) {
    for (let i = 0; i < numRows; i++) {
      capNhatCanhBaoMotDongTienDo_(sheet, actualStartRow + i);
    }

    return;
  }

  const lock = LockService.getDocumentLock();
  let locked = false;

  try {
    locked = lock.tryLock(10000);

    if (!locked) {
      Logger.log('xuLyCapNhatThucTeTienDoOnEditV1: dang co tien trinh khac, bo qua lan chay Schedule Engine.');
      return;
    }

    if (typeof chayScheduleEngineV1 !== 'function') {
      Logger.log('xuLyCapNhatThucTeTienDoOnEditV1: khong tim thay ham chayScheduleEngineV1.');
      for (let i = 0; i < numRows; i++) {
        capNhatCanhBaoMotDongTienDo_(sheet, actualStartRow + i);
      }
      return;
    }

    chayScheduleEngineV1();
    capNhatCanhBaoTienDoCongViecV1();
  } catch (err) {
    Logger.log('xuLyCapNhatThucTeTienDoOnEditV1: ' + err);

    for (let i = 0; i < numRows; i++) {
      capNhatCanhBaoMotDongTienDo_(sheet, actualStartRow + i);
    }
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}


/**
 * Tạo installable trigger cho hàm xử lý cập nhật thực tế.
 * Chạy 1 lần sau khi push code.
 */
function taoTriggerCapNhatThucTeTienDoV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'xuLyCapNhatThucTeTienDoOnEditV1') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('xuLyCapNhatThucTeTienDoOnEditV1')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  const message = 'Đã tạo trigger cập nhật thực tế tiến độ V1.';
  Logger.log(message);
  return message;
}


/**
 * Cập nhật cảnh báo tiến độ cho toàn bộ dữ liệu trong Cong_viec.
 */
function capNhatCanhBaoTienDoCongViecV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Cong_viec');

  if (!sheet) {
    throw new Error('Không tìm thấy sheet Cong_viec');
  }

  const lastRow = Math.max(sheet.getLastRow(), 5);
  capNhatTrangThaiThucHienCongViecV1(sheet);

  for (let row = 5; row <= lastRow; row++) {
    capNhatCanhBaoMotDongTienDo_(sheet, row);
  }

  if (typeof normalizeCongViecRowBackgrounds_ === 'function') {
    normalizeCongViecRowBackgrounds_(sheet);
  }

  SpreadsheetApp.flush();

  const message = 'Đã cập nhật cảnh báo tiến độ cho Cong_viec.';
  Logger.log(message);
  return message;
}

function capNhatTrangThaiThucHienCongViecV1(sheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = sheet || ss.getSheetByName('Cong_viec');

  if (!targetSheet) {
    throw new Error('Không tìm thấy sheet Cong_viec');
  }

  const startRow = 5;
  const lastRow = targetSheet.getLastRow();

  if (lastRow < startRow) {
    return 'Không có dữ liệu để cập nhật trạng thái thực hiện.';
  }

  const changed = capNhatTrangThaiThucHienChoVungCongViecV1_(
    targetSheet,
    startRow,
    lastRow - startRow + 1
  );

  const message = 'Đã cập nhật trạng thái thực hiện cho Cong_viec. Số ô đổi: ' + changed;
  Logger.log(message);
  return message;
}

function capNhatTrangThaiThucHienChoVungCongViecV1_(sheet, startRow, numRows) {
  if (!sheet || sheet.getName() !== 'Cong_viec' || numRows <= 0) return 0;

  const width = Math.max(sheet.getLastColumn(), 20);
  const values = sheet.getRange(startRow, 1, numRows, width).getValues();
  const statusRange = sheet.getRange(startRow, 18, numRows, 1);
  const statusValues = statusRange.getValues();
  let changed = 0;

  values.forEach(function(row, index) {
    const currentStatus = String(statusValues[index][0] || '').trim();
    const actualStart = row[18];    // S
    const actualFinish = row[19];   // T

    const isDetailTask = typeof laDongTaskTienDoV1_ === 'function'
      ? laDongTaskTienDoV1_(row)
      : false;

    if (!isDetailTask) return;

    const nextStatus = tinhTrangThaiThucHienTuNgayThucTeV1_(
      currentStatus,
      actualStart,
      actualFinish
    );

    if (nextStatus !== currentStatus) {
      statusValues[index][0] = nextStatus;
      changed++;
    }
  });

  if (changed > 0) {
    statusRange.setValues(statusValues);
  }

  return changed;
}

function tinhTrangThaiThucHienTuNgayThucTeV1_(currentStatus, actualStart, actualFinish) {
  const status = String(currentStatus || '').trim();

  if (coGiaTriTrangThaiThucHienV1_(actualFinish)) {
    return 'Hoàn thành';
  }

  if (status === 'Tạm dừng') {
    return 'Tạm dừng';
  }

  if (coGiaTriTrangThaiThucHienV1_(actualStart)) {
    return 'Đang làm';
  }

  return 'Chưa bắt đầu';
}

function coGiaTriTrangThaiThucHienV1_(value) {
  return value !== null && value !== '' && typeof value !== 'undefined';
}


/**
 * Tính cảnh báo cho 1 dòng.
 *
 * Nguồn hiện tại:
 * H = Tên công việc
 * M = Ngày kết thúc forecast hiện hành
 * Q = Lỗi tiền nhiệm/liên kết
 * R = Trạng thái thực hiện
 * S = Bắt đầu thực tế
 * T = Hoàn thành thực tế
 * W = Cảnh báo tiến độ
 */
function capNhatCanhBaoMotDongTienDo_(sheet, row) {
  const width = Math.max(sheet.getLastColumn(), 27);
  const rowValues = sheet.getRange(row, 1, 1, width).getValues()[0];

  if (typeof laDongTaskTienDoV1_ === 'function' && !laDongTaskTienDoV1_(rowValues)) {
    const warningCell = sheet.getRange(row, 23);
    if (!warningCell.getFormula()) {
      warningCell.clearContent();
    }
    return;
  }

  if (typeof isCongViecActiveRow_ === 'function' && !isCongViecActiveRow_(rowValues, null)) {
    const warningCell = sheet.getRange(row, 23);
    if (!warningCell.getFormula()) {
      warningCell.clearContent();
    }
    clearCongViecRowBackgroundIfInactive_(sheet, row, width, rowValues);
    return;
  }

  const tenCongViec = rowValues[7];   // H

  const forecastFinish = rowValues[12]; // M
  const loiTienNhiem = rowValues[16];   // Q

  const status = String(rowValues[17] || '').trim(); // R
  const actualStart = rowValues[18];  // S
  const actualFinish = rowValues[19]; // T

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let warning = '';

  if (loiTienNhiem) {
    warning = '⚠️ Lỗi liên kết/tiền nhiệm';
  } else if (status === 'Hoàn thành' && !actualFinish) {
    warning = '⚠️ Thiếu ngày hoàn thành thực tế';
  } else if (status === 'Đang làm' && !actualStart) {
    warning = '⚠️ Thiếu ngày bắt đầu thực tế';
  } else if (status === 'Tạm dừng') {
    warning = '⏸️ Tạm dừng';
  } else if (actualFinish && forecastFinish && actualFinish > forecastFinish) {
    const delayDays = tinhSoNgayLechTienDo_(forecastFinish, actualFinish);
    warning = '🔴 Hoàn thành trễ +' + delayDays + ' ngày';
  } else if (forecastFinish && status !== 'Hoàn thành') {
    const finishDate = new Date(forecastFinish);
    finishDate.setHours(0, 0, 0, 0);

    if (finishDate < today) {
      const overdueDays = tinhSoNgayLechTienDo_(finishDate, today);
      warning = '🔴 Quá hạn +' + overdueDays + ' ngày';
    }
  }

  const warningCell = sheet.getRange(row, 23);
  warningCell.setValue(warning);

  // Tô nền nhẹ theo mức cảnh báo
  if (!warning) {
    warningCell.setBackground('#F1F5F9').setFontColor('#111827');
  } else if (warning.indexOf('🔴') >= 0) {
    warningCell.setBackground('#FEE2E2').setFontColor('#991B1B');
  } else if (warning.indexOf('⚠️') >= 0) {
    warningCell.setBackground('#FEF3C7').setFontColor('#92400E');
  } else if (warning.indexOf('⏸️') >= 0) {
    warningCell.setBackground('#E5E7EB').setFontColor('#374151');
  }
}


/**
 * Tính số ngày lệch giữa 2 ngày.
 */
function tinhSoNgayLechTienDo_(fromDate, toDate) {
  const d1 = new Date(fromDate);
  const d2 = new Date(toDate);

  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);

  const diffMs = d2.getTime() - d1.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
