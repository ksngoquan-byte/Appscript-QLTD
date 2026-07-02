/***************************************
 * 15_Lich_lam_viec.js
 * Bộ hàm lịch làm việc dùng chung cho engine tiến độ
 * Nguồn ngày nghỉ: sheet Ngay_nghi
 ***************************************/

const CAL_SHEET_NGAY_NGHI = 'Ngay_nghi';
const CAL_NGAY_NGHI_START_ROW = 5;
const CAL_COL_NGAY = 1;      // Cột A
const CAL_COL_SU_DUNG = 4;   // Cột D

function cal_getTimeZone_(spreadsheet) {
  const ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  return ss && ss.getSpreadsheetTimeZone
    ? (ss.getSpreadsheetTimeZone() || 'Asia/Ho_Chi_Minh')
    : 'Asia/Ho_Chi_Minh';
}

function cal_toDateOnly_(value) {
  if (!value) return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'number') {
    const base = new Date(1899, 11, 30);
    const d = new Date(base.getTime() + value * 24 * 60 * 60 * 1000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  if (typeof value === 'string') {
    const text = value.trim();
    const m = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);

    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]) - 1;
      const yyyy = Number(m[3]);
      return new Date(yyyy, mm, dd);
    }

    const d = new Date(text);
    if (!isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }

  return null;
}

function cal_dateKey_(dateValue, spreadsheet, timeZone) {
  const d = cal_toDateOnly_(dateValue);
  if (!d) return '';
  return Utilities.formatDate(d, timeZone || cal_getTimeZone_(spreadsheet), 'yyyy-MM-dd');
}

function cal_getNgayNghiSet_() {
  return cal_getNgayNghiSetForSpreadsheet_(SpreadsheetApp.getActiveSpreadsheet());
}

function cal_getNgayNghiSetForSpreadsheet_(spreadsheet) {
  if (!spreadsheet || typeof spreadsheet.getSheetByName !== 'function') {
    throw new Error('Spreadsheet khong hop le khi doc ngay nghi');
  }
  const sh = spreadsheet.getSheetByName(CAL_SHEET_NGAY_NGHI);
  const set = new Set();
  set.timeZone = cal_getTimeZone_(spreadsheet);

  if (!sh) return set;

  const lastRow = sh.getLastRow();
  if (lastRow < CAL_NGAY_NGHI_START_ROW) return set;

  const numRows = lastRow - CAL_NGAY_NGHI_START_ROW + 1;
  const values = sh.getRange(CAL_NGAY_NGHI_START_ROW, 1, numRows, 4).getValues();

  values.forEach(row => {
    const ngay = row[CAL_COL_NGAY - 1];
    const suDung = String(row[CAL_COL_SU_DUNG - 1] || '').trim().toLowerCase();

    if (!ngay) return;
    if (suDung !== 'dùng' && suDung !== 'dung') return;

    const key = cal_dateKey_(ngay, spreadsheet, set.timeZone);
    if (key) set.add(key);
  });

  return set;
}

function cal_isNgayLamViec_(dateValue, ngayNghiSet) {
  const d = cal_toDateOnly_(dateValue);
  if (!d) return false;

  const key = cal_dateKey_(d, null, ngayNghiSet && ngayNghiSet.timeZone);
  return !ngayNghiSet.has(key);
}

function cal_nextNgayLamViec_(dateValue, ngayNghiSet) {
  let d = cal_toDateOnly_(dateValue);
  if (!d) return null;

  while (!cal_isNgayLamViec_(d, ngayNghiSet)) {
    d.setDate(d.getDate() + 1);
  }

  return d;
}

function cal_prevNgayLamViec_(dateValue, ngayNghiSet) {
  let d = cal_toDateOnly_(dateValue);
  if (!d) return null;

  while (!cal_isNgayLamViec_(d, ngayNghiSet)) {
    d.setDate(d.getDate() - 1);
  }

  return d;
}

/**
 * Cộng ngày làm việc theo duration.
 * Quy ước:
 * - duration = 1: bắt đầu và kết thúc cùng 1 ngày nếu là ngày làm việc.
 * - Nếu startDate rơi vào ngày nghỉ thì đẩy sang ngày làm việc kế tiếp.
 */
function cal_addNgayLamViec_(startDate, soNgayLamViec, ngayNghiSet) {
  let d = cal_nextNgayLamViec_(startDate, ngayNghiSet);
  const n = Number(soNgayLamViec || 0);

  if (!d) return null;
  if (n <= 1) return d;

  let count = 1;

  while (count < n) {
    d.setDate(d.getDate() + 1);
    if (cal_isNgayLamViec_(d, ngayNghiSet)) {
      count++;
    }
  }

  return d;
}

/**
 * Dịch ngày theo số ngày làm việc.
 * offset = 0: nếu rơi vào ngày nghỉ thì đẩy tới ngày làm việc kế tiếp.
 * offset > 0: cộng theo ngày làm việc.
 * offset < 0: lùi theo ngày làm việc.
 */
function cal_shiftNgayLamViec_(dateValue, offset, ngayNghiSet) {
  let d = cal_toDateOnly_(dateValue);
  let n = Number(offset || 0);

  if (!d) return null;

  if (n === 0) {
    return cal_nextNgayLamViec_(d, ngayNghiSet);
  }

  const step = n > 0 ? 1 : -1;
  let moved = 0;

  while (moved < Math.abs(n)) {
    d.setDate(d.getDate() + step);
    if (cal_isNgayLamViec_(d, ngayNghiSet)) {
      moved++;
    }
  }

  return d;
}

/**
 * Tính ngày bắt đầu khi biết ngày kết thúc và duration.
 * Dùng cho liên kết FF.
 */
function cal_subtractNgayLamViec_(endDate, soNgayLamViec, ngayNghiSet) {
  let d = cal_prevNgayLamViec_(endDate, ngayNghiSet);
  const n = Number(soNgayLamViec || 0);

  if (!d) return null;
  if (n <= 1) return d;

  let count = 1;

  while (count < n) {
    d.setDate(d.getDate() - 1);
    if (cal_isNgayLamViec_(d, ngayNghiSet)) {
      count++;
    }
  }

  return d;
}

/**
 * Test nhanh bộ lịch làm việc.
 * Chạy hàm này sau khi clasp push.
 */
function TEST_cal_lam_viec() {
  const ngayNghiSet = cal_getNgayNghiSet_();

  const ganttStart =
    cal_toDateOnly_(cal_getConfigValue_('GANTT_START_DATE')) ||
    cal_toDateOnly_(cal_getConfigValue_('NGAY_NEO_KE_HOACH')) ||
    cal_toDateOnly_(new Date());

  const horizonYears = Number(cal_getConfigValue_('GANTT_HORIZON_YEARS') || 5);
  const ganttEnd = cal_addYearsForGantt_(ganttStart, horizonYears);

  const end5 = cal_addNgayLamViec_(ganttStart, 5, ngayNghiSet);
  const shift3 = cal_shiftNgayLamViec_(ganttStart, 3, ngayNghiSet);

  Logger.log('Số ngày nghỉ đang dùng: ' + ngayNghiSet.size);
  Logger.log('GANTT_START_DATE: ' + cal_formatDateVN_(ganttStart));
  Logger.log('GANTT_HORIZON_YEARS: ' + horizonYears);
  Logger.log('GANTT_END_DATE: ' + cal_formatDateVN_(ganttEnd));
  Logger.log('Từ ngày bắt đầu Gantt, sau 5 ngày làm việc: ' + cal_formatDateVN_(end5));
  Logger.log('Từ ngày bắt đầu Gantt, dịch +3 ngày làm việc: ' + cal_formatDateVN_(shift3));
}

function cal_formatDateVN_(dateValue) {
  const d = cal_toDateOnly_(dateValue);
  if (!d) return '';
  return Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');
}

function cal_getConfigValue_(configCode) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Cau_hinh');

  if (!sh) return '';

  const lastRow = sh.getLastRow();
  if (lastRow < 5) return '';

  const values = sh.getRange(5, 1, lastRow - 4, 8).getValues();

  for (let i = 0; i < values.length; i++) {
    const code = String(values[i][1] || '').trim();
    const use = String(values[i][7] || '').trim().toLowerCase();

    if (code === configCode && (use === '' || use === 'dùng' || use === 'dung')) {
      return values[i][3]; // Cột D = Giá trị 1
    }
  }

  return '';
}

function cal_addYearsForGantt_(startDate, years) {
  const d = cal_toDateOnly_(startDate);
  if (!d) return null;

  const y = d.getFullYear() + Number(years || 0);
  const m = d.getMonth();
  const day = d.getDate();

  const result = new Date(y, m, day);

  // Xử lý riêng trường hợp 29/02 để không bị nhảy sang tháng 3.
  if (result.getMonth() !== m) {
    return new Date(y, m + 1, 0);
  }

  return result;
}
