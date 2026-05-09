function dinhDangMa_(num) {
  return ('0000' + num).slice(-4);
}

function layMaCongViecCuoi_() {
  const prop = PropertiesService.getScriptProperties();
  return Number(prop.getProperty(CONFIG.CONFIG_KEY.LAST_TASK_ID)) || 0;
}

function luuMaCongViecCuoi_(val) {
  PropertiesService.getScriptProperties()
    .setProperty(CONFIG.CONFIG_KEY.LAST_TASK_ID, String(val));
}

function laDongCongViec_(row) {
  const col = CONFIG.COLUMN.CONG_VIEC;
  const maCvMau = row[col.MA_CV_MAU - 1];
  const tenCv = row[col.TEN_CV - 1];

  return !!(maCvMau || tenCv);
}

function ghiLogThongTin_(msg) {
  Logger.log('[INFO] ' + msg);
}

function ghiLogLoi_(msg) {
  Logger.log('[LOI] ' + msg);
}

function chayCoKhoa_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function layCache_() {
  return PropertiesService.getDocumentProperties();
}
