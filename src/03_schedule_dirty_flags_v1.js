const SCHEDULE_DIRTY_V1 = {
  KEY_NEED_RECALC: 'SCHEDULE_NEED_RECALC_V1',
  KEY_REASON: 'SCHEDULE_NEED_RECALC_REASON_V1',
  KEY_MARKED_AT: 'SCHEDULE_NEED_RECALC_MARKED_AT_V1',
  BACKGROUND_TRIGGER_HANDLER: 'chayTinhLaiTienDoNenV1'
};

function danhDauCanTinhLaiTienDoV1_(reason) {
  const props = PropertiesService.getDocumentProperties();
  props.setProperty(SCHEDULE_DIRTY_V1.KEY_NEED_RECALC, '1');
  props.setProperty(SCHEDULE_DIRTY_V1.KEY_REASON, String(reason || 'UNKNOWN'));
  props.setProperty(SCHEDULE_DIRTY_V1.KEY_MARKED_AT, new Date().toISOString());
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
}

function layTrangThaiTinhLaiTienDoV1() {
  const props = PropertiesService.getDocumentProperties();

  const status = {
    needRecalc: coCanTinhLaiTienDoV1_(),
    reason: props.getProperty(SCHEDULE_DIRTY_V1.KEY_REASON) || '',
    markedAt: props.getProperty(SCHEDULE_DIRTY_V1.KEY_MARKED_AT) || ''
  };

  Logger.log(JSON.stringify(status));
  return status;
}

function logPerfScheduleV1_(label, startedAt) {
  const ms = Date.now() - startedAt;
  const message = label + ': ' + ms + ' ms';
  Logger.log(message);
  return message;
}

function handleCauHinhEditLight_(e, sheet, row, editedCol, editedLastCol) {
  danhDauCanTinhLaiTienDoV1_('EDIT_CAU_HINH');
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
    danhDauCanTinhLaiTienDoV1_(dirtyReason);
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

  xoaCoTinhLaiTienDoV1_();

  return logPerfScheduleV1_('Da tinh lai tien do thu cong', started);
}

function chayTinhLaiTienDoThuCongFullV1() {
  const started = Date.now();

  chayScheduleEngineV1({
    normalizeFormat: true
  });

  xoaCoTinhLaiTienDoV1_();

  return logPerfScheduleV1_('Da tinh lai tien do thu cong full kem dinh dang', started);
}

function chayTinhLaiTienDoNenV1() {
  if (!coCanTinhLaiTienDoV1_()) {
    return 'Khong co co can tinh lai.';
  }

  const started = Date.now();

  chayScheduleEngineV1({
    normalizeFormat: false
  });

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

  return 'Da cai trigger nen tinh lai tien do moi 10 phut.';
}

function xoaTriggerTinhLaiTienDoNenV1() {
  let deleted = 0;

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === SCHEDULE_DIRTY_V1.BACKGROUND_TRIGGER_HANDLER)
    .forEach(t => {
      ScriptApp.deleteTrigger(t);
      deleted++;
    });

  return 'Da xoa trigger nen. So trigger xoa: ' + deleted;
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
  const message =
    'Can tinh lai: ' + (status.needRecalc ? 'CO' : 'KHONG') +
    '\nLy do: ' + status.reason +
    '\nThoi diem danh dau: ' + status.markedAt;

  SpreadsheetApp.getUi().alert(message);
  return status;
}

function taoMenuToiUuTienDoV1_() {
  SpreadsheetApp.getUi()
    .createMenu('QL tien do')
    .addItem('Chay tinh lai tien do', 'chayTinhLaiTienDoThuCongV1')
    .addItem('Chay tinh lai tien do + don dinh dang', 'chayTinhLaiTienDoThuCongFullV1')
    .addItem('Xem trang thai can tinh lai', 'hienTrangThaiTinhLaiTienDoV1')
    .addSeparator()
    .addItem('Don nen dong trong', 'chayDonNenCongViecThuCongV1')
    .addSeparator()
    .addItem('Cai trigger nen 10 phut', 'caiTriggerTinhLaiTienDoNenV1')
    .addItem('Xoa trigger nen', 'xoaTriggerTinhLaiTienDoNenV1')
    .addToUi();
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

    danhDauCanTinhLaiTienDoV1_('STRUCTURE_CHANGE_' + e.changeType);
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

  return 'Da cai trigger onChange cho thay doi cau truc hang/cot.';
}

function xoaTriggerThayDoiCauTrucScheduleV1() {
  let deleted = 0;

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'xuLyThayDoiCauTrucScheduleV1')
    .forEach(t => {
      ScriptApp.deleteTrigger(t);
      deleted++;
    });

  return 'Da xoa trigger onChange cau truc. So trigger xoa: ' + deleted;
}
