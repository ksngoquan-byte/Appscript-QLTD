/**
 * PB Utility V1 - Hàm dùng chung
 */

function laySpreadsheetPBV1_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function layEmailNguoiDungPBV1_() {
  const email = Session.getActiveUser().getEmail();
  return email || 'unknown-user';
}

function laAdminPBV1_() {
  const email = (layEmailNguoiDungPBV1_() || '').toLowerCase();
  return PBV1_CONFIG.ADMIN_EMAILS.map(e => e.toLowerCase()).indexOf(email) !== -1;
}

function layDanhSachSheetPhongBanPBV1_() {
  const ss = laySpreadsheetPBV1_();
  return PBV1_CONFIG.SHEET_NAMES.map(name => ss.getSheetByName(name)).filter(Boolean);
}

function laSheetPhongBanPBV1_(sheet) {
  if (!sheet) return false;
  const name = sheet.getName();
  if (PBV1_CONFIG.EXCLUDE_SHEET_NAMES.indexOf(name) !== -1) return false;
  return PBV1_CONFIG.SHEET_NAMES.indexOf(name) !== -1;
}

function laySheetHienTaiHopLePBV1_() {
  const sheet = laySpreadsheetPBV1_().getActiveSheet();
  if (!laSheetPhongBanPBV1_(sheet)) {
    SpreadsheetApp.getUi().alert('Sheet hiện tại không phải sheet phòng/ban hợp lệ.\nVui lòng chọn một sheet phòng/ban như PTDA, Kehoach, GPMB...');
    return null;
  }
  return sheet;
}

function layLastDataRowPBV1_(sheet) {
  const maxLastRow = Math.max(sheet.getLastRow(), PBV1_CONFIG.HEADER_ROW);
  if (maxLastRow < PBV1_CONFIG.DATA_START_ROW) return PBV1_CONFIG.HEADER_ROW;
  const values = sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 1, maxLastRow - PBV1_CONFIG.DATA_START_ROW + 1, layCotCuoiHeThongPBV1_()).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i].some(v => v !== '' && v !== null)) return PBV1_CONFIG.DATA_START_ROW + i;
  }
  return PBV1_CONFIG.HEADER_ROW;
}

function layCotCuoiHeThongPBV1_() {
  return PBV1_CONFIG.SYSTEM_LAST_COL ||
    (PBV1_CONFIG.SYSTEM_START_COL + PBV1_CONFIG.SYSTEM_COL_COUNT - 1);
}

function damBaoDuCotHeThongPBV1_(sheet) {
  const requiredLastCol = layCotCuoiHeThongPBV1_();
  const currentMaxCols = sheet.getMaxColumns();
  if (currentMaxCols < requiredLastCol) {
    sheet.insertColumnsAfter(currentMaxCols, requiredLastCol - currentMaxCols);
  }
}

function normalizeCodeForDetailTaskIdPBV1_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function taoDetailTaskIdPBV1_(projectCode, deptCode) {
  const project = normalizeCodeForDetailTaskIdPBV1_(projectCode || layCauHinhPBV1_('MA_DU_AN', 'PROJECT')) || 'PROJECT';
  const dept = normalizeCodeForDetailTaskIdPBV1_(deptCode || 'DEPT') || 'DEPT';
  for (let attempt = 0; attempt < 5; attempt++) {
    const random8 = Utilities.getUuid().replace(/-/g, '').toUpperCase().slice(0, 8);
    const detailTaskId = `DT-${project}-${dept}-${random8}`;
    if (!detailTaskIdDaTonTaiPBV1_(detailTaskId)) return detailTaskId;
  }
  throw new Error('Khong sinh duoc DetailTaskId khong trung sau 5 lan thu.');
}

function detailTaskIdDaTonTaiPBV1_(detailTaskId, targetSheet) {
  const id = String(detailTaskId || '').trim();
  if (!id) return false;

  const sheets = targetSheet ? [targetSheet] : layDanhSachSheetPhongBanPBV1_();
  return sheets.some(sheet => {
    const lastRow = layLastDataRowPBV1_(sheet);
    if (lastRow < PBV1_CONFIG.DATA_START_ROW) return false;
    const rowCount = lastRow - PBV1_CONFIG.DATA_START_ROW + 1;
    const values = sheet.getRange(PBV1_CONFIG.DATA_START_ROW, PBV1_CONFIG.COLUMNS.DETAIL_TASK_ID, rowCount, 1).getDisplayValues();
    return values.some(row => String(row[0] || '').trim() === id);
  });
}

function layCapWbsPBV1_(wbs) {
  const s = String(wbs || '').trim();
  if (!s) return 0;
  if (!/^[IVXLCDM]+(\.\d+)*$/i.test(s) && !/^\d+(\.\d+)*$/.test(s)) return 0;
  return s.split('.').length;
}

function laNgayHopLePBV1_(value) {
  if (!value) return true;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return true;
  return parseNgayVNPBV1_(value) !== null;
}

function parseNgayVNPBV1_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const y = Number(m[3]);
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
}

function dinhDangNgayVNPBV1_(value) {
  if (!value) return '';
  const date = parseNgayVNPBV1_(value);
  if (!date) return String(value);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

function soSanhNgayPBV1_(date1, date2) {
  const d1 = parseNgayVNPBV1_(date1);
  const d2 = parseNgayVNPBV1_(date2);
  if (!d1 || !d2) return null;
  const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  if (t1 < t2) return -1;
  if (t1 > t2) return 1;
  return 0;
}

function laSoTrongKhoangPBV1_(value, min, max) {
  if (value === '' || value === null || value === undefined) return false;
  const numberValue = Number(value);
  return !isNaN(numberValue) && numberValue >= min && numberValue <= max;
}

function taoMaYeuCauDieuChinhPBV1_() {
  const now = new Date();
  const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const rand = Math.floor(Math.random() * 900 + 100);
  return `YC-${stamp}-${rand}`;
}

function escapeHtmlPBV1_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layTenPhongBanTuSheetPBV1_(sheet) {
  const row2 = String(sheet.getRange(2, 1).getDisplayValue() || '').trim();
  const m = row2.match(/PHÒNG\/BAN:\s*(.+)$/i);
  return m ? m[1].trim() : sheet.getName();
}

function damBaoSheetVoiHeaderPBV1_(sheetName, headers) {
  const ss = laySpreadsheetPBV1_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeader = firstRow.some(v => v !== '' && v !== null);
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground(PBV1_CONFIG.COLORS.HEADER_BG).setFontColor(PBV1_CONFIG.COLORS.HEADER_FONT);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function layGiaTriDongPBV1_(sheet, rowIndex) {
  return sheet.getRange(rowIndex, 1, 1, layCotCuoiHeThongPBV1_()).getValues()[0];
}

function layDisplayDongPBV1_(sheet, rowIndex) {
  return sheet.getRange(rowIndex, 1, 1, layCotCuoiHeThongPBV1_()).getDisplayValues()[0];
}

function timBlockConCuaMasterPBV1_(sheet, masterTaskCode) {
  const lastRow = layLastDataRowPBV1_(sheet);
  if (lastRow < PBV1_CONFIG.DATA_START_ROW) return null;

  const rowCount = lastRow - PBV1_CONFIG.DATA_START_ROW + 1;
  const values = sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 1, rowCount, layCotCuoiHeThongPBV1_()).getDisplayValues();
  let masterRow = 0;
  for (let index = 0; index < values.length; index++) {
    const row = values[index];
    const rowType = String(row[PBV1_CONFIG.COLUMNS.LOAI_DONG - 1] || '').trim();
    const code = String(row[PBV1_CONFIG.COLUMNS.MA_MASTER - 1] || '').trim();
    if (rowType === PBV1_CONFIG.ROW_TYPES.MASTER && code === String(masterTaskCode || '').trim()) {
      masterRow = PBV1_CONFIG.DATA_START_ROW + index;
      break;
    }
  }
  if (!masterRow) return null;

  let endRow = lastRow;
  for (let rowIndex = masterRow + 1; rowIndex <= lastRow; rowIndex++) {
    const row = values[rowIndex - PBV1_CONFIG.DATA_START_ROW];
    const rowType = String(row[PBV1_CONFIG.COLUMNS.LOAI_DONG - 1] || '').trim();
    if (rowType === PBV1_CONFIG.ROW_TYPES.MASTER || rowType === PBV1_CONFIG.ROW_TYPES.CONTEXT) {
      endRow = rowIndex - 1;
      break;
    }
  }

  return {
    masterRow,
    startRow: masterRow + 1,
    endRow,
    insertAfterRow: endRow
  };
}

function taoWbsDetailPBV1_(parentWbs, detailIndex) {
  const index = Math.max(Number(detailIndex) || 1, 1);
  return `${String(parentWbs || '').trim()}.D${String(index).padStart(2, '0')}`;
}
