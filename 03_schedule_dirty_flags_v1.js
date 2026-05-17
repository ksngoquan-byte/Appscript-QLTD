const SCHEDULE_DIRTY_V1 = {
  KEY_NEED_RECALC: 'SCHEDULE_NEED_RECALC_V1',
  KEY_REASON: 'SCHEDULE_NEED_RECALC_REASON_V1',
  KEY_MARKED_AT: 'SCHEDULE_NEED_RECALC_MARKED_AT_V1',
  KEY_MARKED_BY: 'SCHEDULE_NEED_RECALC_MARKED_BY_V1',
  KEY_DETAIL: 'SCHEDULE_NEED_RECALC_DETAIL_V1',
  KEY_RANGE_A1: 'SCHEDULE_NEED_RECALC_RANGE_A1_V1',
  KEY_COLUMNS: 'SCHEDULE_NEED_RECALC_COLUMNS_V1',
  KEY_LAST_RUN_AT: 'SCHEDULE_RECALC_LAST_RUN_AT_V1',
  BACKGROUND_TRIGGER_HANDLER: 'chayTinhLaiTienDoNenV1'
};

function danhDauCanTinhLaiTienDoV1_(reason, detail) {
  detail = detail || {};
  const props = PropertiesService.getDocumentProperties();
  props.setProperty(SCHEDULE_DIRTY_V1.KEY_NEED_RECALC, '1');
  props.setProperty(SCHEDULE_DIRTY_V1.KEY_REASON, String(reason || 'UNKNOWN'));
  props.setProperty(SCHEDULE_DIRTY_V1.KEY_MARKED_AT, new Date().toISOString());
  props.setProperty(SCHEDULE_DIRTY_V1.KEY_MARKED_BY, layEmailNguoiDungScheduleV1_());
  props.setProperty(SCHEDULE_DIRTY_V1.KEY_DETAIL, JSON.stringify({
    sheetName: detail.sheetName || '',
    rangeA1: detail.rangeA1 || '',
    columns: Array.isArray(detail.columns) ? detail.columns : [],
    message: detail.message || ''
  }));
  props.setProperty(SCHEDULE_DIRTY_V1.KEY_RANGE_A1, taoPhamViSuaScheduleV1_(detail.sheetName, detail.rangeA1));
  props.setProperty(SCHEDULE_DIRTY_V1.KEY_COLUMNS, (Array.isArray(detail.columns) ? detail.columns : []).join('; '));
}

function coCanTinhLaiTienDoV1_() {
  return PropertiesService
    .getDocumentProperties()
    .getProperty(SCHEDULE_DIRTY_V1.KEY_NEED_RECALC) === '1';
}

function xoaCoTinhLaiTienDoV1_() {
  const props = PropertiesService.getDocumentProperties();
  props.deleteProperty(SCHEDULE_DIRTY_V1.KEY_NEED_RECALC);
  props.deleteProperty(SCHEDULE_DIRTY_V1.KEY_REASON);
  props.deleteProperty(SCHEDULE_DIRTY_V1.KEY_MARKED_AT);
  props.deleteProperty(SCHEDULE_DIRTY_V1.KEY_MARKED_BY);
  props.deleteProperty(SCHEDULE_DIRTY_V1.KEY_DETAIL);
  props.deleteProperty(SCHEDULE_DIRTY_V1.KEY_RANGE_A1);
  props.deleteProperty(SCHEDULE_DIRTY_V1.KEY_COLUMNS);
}

function ghiLanChayTinhLaiTienDoV1_() {
  PropertiesService
    .getDocumentProperties()
    .setProperty(SCHEDULE_DIRTY_V1.KEY_LAST_RUN_AT, new Date().toISOString());
}

function layEmailNguoiDungScheduleV1_() {
  try {
    const email = Session.getActiveUser().getEmail();
    return email || '';
  } catch (err) {
    Logger.log('layEmailNguoiDungScheduleV1_: ' + err);
    return '';
  }
}

function layTrangThaiTinhLaiTienDoV1() {
  const props = PropertiesService.getDocumentProperties();

  const status = {
    needRecalc: coCanTinhLaiTienDoV1_(),
    reason: props.getProperty(SCHEDULE_DIRTY_V1.KEY_REASON) || '',
    markedAt: props.getProperty(SCHEDULE_DIRTY_V1.KEY_MARKED_AT) || '',
    markedBy: props.getProperty(SCHEDULE_DIRTY_V1.KEY_MARKED_BY) || '',
    detail: docJsonScheduleV1_(props.getProperty(SCHEDULE_DIRTY_V1.KEY_DETAIL)),
    rangeA1: props.getProperty(SCHEDULE_DIRTY_V1.KEY_RANGE_A1) || '',
    columns: props.getProperty(SCHEDULE_DIRTY_V1.KEY_COLUMNS) || '',
    lastRunAt: props.getProperty(SCHEDULE_DIRTY_V1.KEY_LAST_RUN_AT) || ''
  };

  Logger.log(JSON.stringify(status));
  return status;
}

function docJsonScheduleV1_(jsonText) {
  if (!jsonText) return {};

  try {
    return JSON.parse(jsonText);
  } catch (err) {
    Logger.log('docJsonScheduleV1_: ' + err);
    return {};
  }
}

function taoPhamViSuaScheduleV1_(sheetName, rangeA1) {
  if (!sheetName || !rangeA1) return '';
  return sheetName + '!' + rangeA1;
}

function dinhDangThoiGianScheduleV1_(isoText) {
  if (!isoText) return '';

  const date = new Date(isoText);
  if (isNaN(date.getTime())) return String(isoText);

  return Utilities.formatDate(date, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
}

function layLyDoTiengVietScheduleV1_(reason, detail) {
  if (detail && detail.message) return detail.message;

  const map = {
    EDIT_CAU_HINH: 'Sửa cấu hình tiến độ',
    EDIT_STRUCTURE_OR_SCOPE: 'Sửa cấu trúc hoặc tên công việc',
    EDIT_PREDECESSOR: 'Sửa công việc liên kết/tiền nhiệm',
    EDIT_SCHEDULE_FIELD: 'Sửa dữ liệu tiến độ',
    EDIT_ACTUAL_DATE: 'Sửa ngày thực tế bắt đầu/hoàn thành'
  };

  const code = String(reason || '');
  if (code.indexOf('STRUCTURE_CHANGE_') === 0) return 'Thay đổi cấu trúc hàng/cột';

  return map[code] || 'Có thay đổi tiến độ cần xử lý';
}

function layCotAnhHuongScheduleV1_(startCol, endCol, targetCols) {
  const result = [];
  const seen = {};

  targetCols.forEach(function(col) {
    if (!rangeGiaoCotV1_(startCol, endCol, col, col)) return;

    const label = layNhanCotScheduleV1_(col);
    if (seen[label]) return;

    seen[label] = true;
    result.push(label);
  });

  return result;
}

function layNhanCotScheduleV1_(col) {
  const map = {
    2: 'B - Cây công việc / WBS',
    8: 'H - Tên công việc / phạm vi',
    10: 'J - Số ngày kế hoạch',
    11: 'K - Công việc liên kết',
    12: 'L - Bắt đầu kế hoạch hiện hành',
    13: 'M - Kết thúc kế hoạch hiện hành',
    19: 'S - Bắt đầu thực tế',
    20: 'T - Hoàn thành thực tế'
  };

  return map[col] || (cotSoThanhChuScheduleV1_(col) + ' - Cột ảnh hưởng');
}

function cotSoThanhChuScheduleV1_(col) {
  let n = Number(col);
  let text = '';

  while (n > 0) {
    const remainder = (n - 1) % 26;
    text = String.fromCharCode(65 + remainder) + text;
    n = Math.floor((n - 1) / 26);
  }

  return text;
}

function logPerfScheduleV1_(label, startedAt) {
  const ms = Date.now() - startedAt;
  const message = label + ': ' + ms + ' ms';
  Logger.log(message);
  return message;
}

function handleCauHinhEditLight_(e, sheet, row, editedCol, editedLastCol) {
  danhDauCanTinhLaiTienDoV1_('EDIT_CAU_HINH', {
    sheetName: sheet.getName(),
    rangeA1: e.range.getA1Notation(),
    columns: layCotAnhHuongScheduleV1_(editedCol, editedLastCol, [editedCol]),
    message: 'Sửa cấu hình tiến độ'
  });
  return true;
}

function handleCongViecEditLight_(e, sheet, row, editedCol, editedLastCol) {
  const cfg = SCHEDULE_ENGINE_V1;
  let dirtyReason = '';

  if (
    rangeGiaoCotV1_(editedCol, editedLastCol, cfg.COL.MA_CAU_TRUC, cfg.COL.HANG_MUC) &&
    typeof capNhatTenCongViecTheoMaCauTrucV1_ === 'function'
  ) {
    for (let r = Math.max(row, cfg.START_ROW); r <= e.range.getLastRow(); r++) {
      capNhatTenCongViecTheoMaCauTrucV1_(sheet, r);
    }

    dirtyReason = 'EDIT_STRUCTURE_OR_SCOPE';
  }

  if (
    shouldAutoAssignTaskIdOnEditV1_(editedCol, editedLastCol) &&
    typeof capMaCongViecChoVungNeuThieuV1_ === 'function'
  ) {
    capMaCongViecChoVungNeuThieuV1_(sheet, e.range);
  }

  if (
    rangeGiaoCotV1_(editedCol, editedLastCol, cfg.COL.PREDECESSOR, cfg.COL.PREDECESSOR) &&
    typeof chuyenVungNhapThanhCongThucLienKetDongV1_ === 'function'
  ) {
    chuyenVungNhapThanhCongThucLienKetDongV1_(sheet, e.range, cfg.COL.PREDECESSOR);
    dirtyReason = 'EDIT_PREDECESSOR';
  }

  const watchedCols = [
    cfg.COL.MA_CAU_TRUC,
    cfg.COL.TASK_NAME,
    cfg.COL.DURATION,
    cfg.COL.PREDECESSOR,
    cfg.COL.START,
    cfg.COL.END,
    cfg.COL.ACTUAL_START,
    cfg.COL.ACTUAL_FINISH
  ];

  if (!dirtyReason && rangeGiaoMotTrongCacCotV1_(editedCol, editedLastCol, watchedCols)) {
    dirtyReason = 'EDIT_SCHEDULE_FIELD';
  }

  if (dirtyReason) {
    danhDauCanTinhLaiTienDoV1_(dirtyReason, {
      sheetName: sheet.getName(),
      rangeA1: e.range.getA1Notation(),
      columns: layCotAnhHuongScheduleV1_(editedCol, editedLastCol, watchedCols),
      message: layLyDoTiengVietScheduleV1_(dirtyReason, null)
    });
    return true;
  }

  return false;
}

function rangeGiaoCotV1_(startCol, endCol, targetStartCol, targetEndCol) {
  return startCol <= targetEndCol && endCol >= targetStartCol;
}

function rangeGiaoMotTrongCacCotV1_(startCol, endCol, cols) {
  return cols.some(col => rangeGiaoCotV1_(startCol, endCol, col, col));
}

function shouldAutoAssignTaskIdOnEditV1_(editedCol, editedLastCol) {
  const col = CONFIG.COLUMN.CONG_VIEC;

  return (
    rangeGiaoCotV1_(editedCol, editedLastCol, col.MA_CV_MAU, col.PREDECESSOR) ||
    rangeGiaoCotV1_(editedCol, editedLastCol, col.MA_CONG_VIEC, col.MA_CONG_VIEC)
  );
}

function chayTinhLaiTienDoThuCongV1() {
  const started = Date.now();

  chayScheduleEngineV1({
    normalizeFormat: false
  });

  ghiLanChayTinhLaiTienDoV1_();
  xoaCoTinhLaiTienDoV1_();

  return logPerfScheduleV1_('Da tinh lai tien do thu cong', started);
}

function chayTinhLaiTienDoThuCongFullV1() {
  const started = Date.now();

  chayScheduleEngineV1({
    normalizeFormat: true
  });

  ghiLanChayTinhLaiTienDoV1_();
  xoaCoTinhLaiTienDoV1_();

  return logPerfScheduleV1_('Da tinh lai tien do thu cong full kem dinh dang', started);
}

function chayTinhLaiTienDoNenV1() {
  if (!coCanTinhLaiTienDoV1_()) {
    return 'Không có cờ cần tính lại.';
  }

  const started = Date.now();

  chayScheduleEngineV1({
    normalizeFormat: false
  });

  ghiLanChayTinhLaiTienDoV1_();
  xoaCoTinhLaiTienDoV1_();

  return logPerfScheduleV1_('Da tinh lai tien do nen', started);
}

function caiTriggerTinhLaiTienDoNenV1() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === SCHEDULE_DIRTY_V1.BACKGROUND_TRIGGER_HANDLER)
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger(SCHEDULE_DIRTY_V1.BACKGROUND_TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(10)
    .create();

  return 'Đã cài trigger nền tính lại tiến độ mỗi 10 phút.';
}

function xoaTriggerTinhLaiTienDoNenV1() {
  let deleted = 0;

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === SCHEDULE_DIRTY_V1.BACKGROUND_TRIGGER_HANDLER)
    .forEach(t => {
      ScriptApp.deleteTrigger(t);
      deleted++;
    });

  return 'Đã xóa trigger nền. Số trigger đã xóa: ' + deleted;
}

function chayDonNenCongViecThuCongV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.CONG_VIEC);

  if (!sheet) throw new Error('Khong tim thay sheet Cong_viec');

  const started = Date.now();
  const changed = normalizeCongViecRowBackgrounds_(sheet);
  const message = 'Da don dinh dang dong trong. So dong anh huong: ' + changed + '. Thoi gian: ' + (Date.now() - started) + ' ms';

  Logger.log(message);
  return message;
}

function hienTrangThaiTinhLaiTienDoV1() {
  const status = layTrangThaiTinhLaiTienDoV1();
  const lines = [
    'Cần tính lại: ' + (status.needRecalc ? 'CÓ' : 'KHÔNG')
  ];

  if (status.needRecalc) {
    lines.push('Lý do: ' + layLyDoTiengVietScheduleV1_(status.reason, status.detail));
    lines.push('Mã hệ thống: ' + (status.reason || 'Không có'));
    lines.push('Phạm vi sửa: ' + (status.rangeA1 || 'Không ghi nhận'));
    lines.push('Cột ảnh hưởng: ' + (status.columns || 'Không ghi nhận'));
    lines.push('Thời điểm phát sinh: ' + (dinhDangThoiGianScheduleV1_(status.markedAt) || 'Không ghi nhận'));
    lines.push('Người cập nhật: ' + (status.markedBy || 'Không lấy được email'));
    lines.push('Lần chạy tính lại gần nhất: ' + (dinhDangThoiGianScheduleV1_(status.lastRunAt) || 'Chưa có'));
    lines.push('Gợi ý: Bấm “Chạy tính lại tiến độ J/L/M/Q” để cập nhật L/M/Q.');
  } else {
    lines.push('Lý do: Không có thay đổi tiến độ đang chờ xử lý');
    lines.push('Lần chạy tính lại gần nhất: ' + (dinhDangThoiGianScheduleV1_(status.lastRunAt) || 'Chưa có'));
    lines.push('Gợi ý: Chưa cần chạy lại. Nếu muốn đối soát, có thể chạy thủ công và xác nhận.');
  }

  SpreadsheetApp.getUi().alert('Trạng thái tính lại tiến độ', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
  return status;
}

function taoMenuToiUuTienDoV1_() {
  // Deprecated: menu da duoc gom ve taoMenu() trong 07_ui_menu.js.
  return;
}

function benchmarkScheduleEngineV1() {
  const started = Date.now();

  chayScheduleEngineV1({
    normalizeFormat: false
  });

  return logPerfScheduleV1_('Benchmark chayScheduleEngineV1', started);
}

function xuLyThayDoiCauTrucScheduleV1(e) {
  try {
    if (!e || !e.changeType) return;

    const watchedTypes = [
      'INSERT_ROW',
      'REMOVE_ROW',
      'INSERT_COLUMN',
      'REMOVE_COLUMN',
      'OTHER'
    ];

    if (watchedTypes.indexOf(e.changeType) === -1) return;

    danhDauCanTinhLaiTienDoV1_('STRUCTURE_CHANGE_' + e.changeType, {
      message: 'Thay đổi cấu trúc hàng/cột'
    });
  } catch (err) {
    Logger.log('xuLyThayDoiCauTrucScheduleV1: ' + err);
  }
}

function caiTriggerThayDoiCauTrucScheduleV1() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'xuLyThayDoiCauTrucScheduleV1')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('xuLyThayDoiCauTrucScheduleV1')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();

  return 'Đã cài trigger onChange cho thay đổi cấu trúc hàng/cột.';
}

function xoaTriggerThayDoiCauTrucScheduleV1() {
  let deleted = 0;

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'xuLyThayDoiCauTrucScheduleV1')
    .forEach(t => {
      ScriptApp.deleteTrigger(t);
      deleted++;
    });

  return 'Đã xóa trigger onChange cấu trúc. Số trigger đã xóa: ' + deleted;
}

