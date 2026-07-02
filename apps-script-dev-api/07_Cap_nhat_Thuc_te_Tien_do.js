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
 * - W: Điều chỉnh liên kết?
 *
 * NGUYÊN TẮC
 * - Người dùng chỉ nhập R:S:T:U
 * - Apps Script tự ghi V
 * - Người dùng chọn W để quyết định có lan truyền ngày thực tế sang successor hay không
 * - Khi sửa S/T, hệ thống chỉ đánh dấu cần tính lại J/L/M/Q
 *******************************************************/

const DIEU_CHINH_LIEN_KET_V1 = {
  YES: 'Có',
  NO: 'Không',
  COL: 23,
  HEADER_ROW: 4,
  DATA_START_ROW: 5,
  START_COL: 18,
  COL_COUNT: 6,
  HEADERS: [
    'Trạng thái thực hiện',
    'Bắt đầu thực tế',
    'Hoàn thành thực tế',
    'Ghi chú cập nhật',
    'Ngày cập nhật',
    'Điều chỉnh liên kết?'
  ]
};

function thietLapCotCapNhatThucTeTienDoV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Cong_viec');

  if (!sheet) {
    throw new Error('Không tìm thấy sheet Cong_viec');
  }

  const DATA_START_ROW = DIEU_CHINH_LIEN_KET_V1.DATA_START_ROW;
  const MAX_ROW = Math.max(sheet.getMaxRows(), 1000);

  // 1. Ghi header R:W
  thietLapHeaderCapNhatThucTeTienDoV1_(sheet);

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

  // 3. Format vùng hệ thống V
  sheet.getRange(DATA_START_ROW, 22, MAX_ROW - DATA_START_ROW + 1, 1)
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

  // 3b. Format vùng người dùng chọn W
  sheet.getRange(DATA_START_ROW, 23, MAX_ROW - DATA_START_ROW + 1, 1)
    .setBackground('#FFF8E7')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('center')
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

  // 6. Dropdown điều chỉnh liên kết tại W
  thietLapDropdownDieuChinhLienKetV1_(sheet, DATA_START_ROW, MAX_ROW - DATA_START_ROW + 1);

  // 7. Căn chỉnh cột
  sheet.setColumnWidth(18, 130); // R
  sheet.setColumnWidth(19, 110); // S
  sheet.setColumnWidth(20, 125); // T
  sheet.setColumnWidth(21, 240); // U
  sheet.setColumnWidth(22, 135); // V
  sheet.setColumnWidth(23, 210); // W

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
    return;
  }

  if (typeof danhDauCanTinhLaiTienDoV1_ === 'function') {
    const actualDateColumns = typeof layCotAnhHuongScheduleV1_ === 'function'
      ? layCotAnhHuongScheduleV1_(startCol, endCol, [19, 20])
      : [];

    danhDauCanTinhLaiTienDoV1_('EDIT_ACTUAL_DATE', {
      sheetName: sheet.getName(),
      rangeA1: range.getA1Notation(),
      columns: actualDateColumns,
      message: 'Sửa ngày thực tế bắt đầu/hoàn thành'
    });
  }

}

function thietLapHeaderCapNhatThucTeTienDoV1_(sheet) {
  if (!sheet) return;

  sheet
    .getRange(
      DIEU_CHINH_LIEN_KET_V1.HEADER_ROW,
      DIEU_CHINH_LIEN_KET_V1.START_COL,
      1,
      DIEU_CHINH_LIEN_KET_V1.COL_COUNT
    )
    .setValues([DIEU_CHINH_LIEN_KET_V1.HEADERS])
    .setBackground('#EAF4EC')
    .setFontColor('#111827')
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
}

function dongBoCotDieuChinhLienKetTemplateCongViecV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('_TEMPLATE_Cong_viec');

  if (!sheet) {
    throw new Error('Không tìm thấy sheet _TEMPLATE_Cong_viec');
  }

  const startRow = DIEU_CHINH_LIEN_KET_V1.DATA_START_ROW;
  const numRows = Math.max(sheet.getMaxRows() - startRow + 1, 1);

  thietLapHeaderCapNhatThucTeTienDoV1_(sheet);
  thietLapDropdownDieuChinhLienKetV1_(sheet, startRow, numRows);

  SpreadsheetApp.flush();

  const message = 'Đã đồng bộ _TEMPLATE_Cong_viec!W = Điều chỉnh liên kết? và dropdown Có/Không.';
  Logger.log(message);
  return message;
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
 * Chuẩn hóa cột W điều chỉnh liên kết cho toàn bộ dữ liệu trong Cong_viec.
 * Giữ tên hàm cũ để các menu/trigger cũ không lỗi, nhưng không ghi cảnh báo vào W nữa.
 */
function capNhatCanhBaoTienDoCongViecV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Cong_viec');

  if (!sheet) {
    throw new Error('Không tìm thấy sheet Cong_viec');
  }

  const lastRow = Math.max(sheet.getLastRow(), 5);
  capNhatTrangThaiThucHienCongViecV1(sheet);
  thietLapDropdownDieuChinhLienKetV1_(sheet, 5, Math.max(lastRow - 5 + 1, 1));

  if (typeof normalizeCongViecRowBackgrounds_ === 'function') {
    normalizeCongViecRowBackgrounds_(sheet);
  }

  SpreadsheetApp.flush();

  const message = 'Đã chuẩn hóa dropdown Điều chỉnh liên kết? tại Cong_viec!W.';
  Logger.log(message);
  return message;
}

function thietLapDropdownDieuChinhLienKetV1_(sheet, startRow, numRows) {
  if (!sheet || numRows <= 0) return;

  const range = sheet.getRange(startRow, DIEU_CHINH_LIEN_KET_V1.COL, numRows, 1);
  const values = range.getValues();
  let changed = false;

  values.forEach(function(row) {
    const normalized = chuanHoaGiaTriDieuChinhLienKetV1_(row[0]);
    if (normalized !== row[0]) {
      row[0] = normalized;
      changed = true;
    }
  });

  if (changed) {
    range.setValues(values);
  }

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      DIEU_CHINH_LIEN_KET_V1.YES,
      DIEU_CHINH_LIEN_KET_V1.NO
    ], true)
    .setAllowInvalid(false)
    .build();

  range
    .setDataValidation(rule)
    .setHorizontalAlignment('center');
}

function chuanHoaGiaTriDieuChinhLienKetV1_(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

  if (normalized === 'co' || normalized === 'yes' || normalized === 'true' || normalized === '1') {
    return DIEU_CHINH_LIEN_KET_V1.YES;
  }

  if (normalized === 'khong' || normalized === 'no' || normalized === 'false' || normalized === '0') {
    return DIEU_CHINH_LIEN_KET_V1.NO;
  }

  return '';
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
 * Hàm tương thích tên cũ.
 * W nay là dropdown Điều chỉnh liên kết?, không còn ghi cảnh báo tiến độ tự động.
 */
function capNhatCanhBaoMotDongTienDo_(sheet, row) {
  if (!sheet || row < 5) return;
  thietLapDropdownDieuChinhLienKetV1_(sheet, row, 1);
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
