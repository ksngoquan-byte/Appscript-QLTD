/*******************************************************
 * FILE: 06_Do_du_lieu_Tien_do_Tong_hop.gs
 *
 * MỤC TIÊU
 * - Đổ dữ liệu bảng trái A:H vào sheet Tien_do_tong_hop.
 * - Không ghi sang timeline từ cột I trở đi.
 * - Không tô Gantt bar, không tính đường găng.
 *******************************************************/

function doDuLieuBangTraiTienDoTongHopV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let targetSheet = ss.getSheetByName('Tien_do_tong_hop');

  if (!targetSheet) {
    targetSheet = ss.insertSheet('Tien_do_tong_hop');
  }

  if (typeof getGanttLayoutConfigV1_ !== 'function') {
    throw new Error('Thiếu getGanttLayoutConfigV1_. Kiểm tra file 05_Dinh_dang_Timeline_Gantt_Tong_hop.gs');
  }

  if (typeof capNhatTrangThaiThucHienCongViecV1 === 'function') {
    capNhatTrangThaiThucHienCongViecV1();
  }

  const cfg = getGanttLayoutConfigV1_(ss);
  const currentRows = docDuLieuCongViecChoTongHopV1_(ss);
  const baselineRows = docBaselineActiveChoTongHopV1_(ss);
  const baselineByTaskCode = taoMapBaselineTheoMaCongViecV1_(baselineRows);
  const output = [];
  const techOutput = [];

  currentRows.forEach(currentRow => {
    const values = currentRow.values;
    const displays = currentRow.displays;
    const maCauTruc = values[1];                  // B
    const taskName = String(values[7] || '').trim();  // H
    const taskCode = String(values[14] || '').trim(); // O
    const isGroupRow = typeof isDongNhomCauTrucV1_ === 'function' && isDongNhomCauTrucV1_(maCauTruc);
    const isDetailTask = typeof isDongCongViecChiTietV1_ === 'function'
      ? isDongCongViecChiTietV1_(maCauTruc, taskName)
      : (!maCauTruc && !!taskName);

    if (!isGroupRow && !isDetailTask) return;

    const baseline = isDetailTask && taskCode ? (baselineByTaskCode[taskCode] || null) : null;
    if (!taskName && !(baseline && baseline[1])) return;

    output.push([
  chuanHoaTextMotDongTongHopV1_(values[6] || (baseline ? baseline[0] : '')), // A - Ref
  taoCongViecPhamViTongHopV1_(values, baseline),
  chuanHoaTextMotDongTongHopV1_(values[8] || (baseline ? baseline[2] : '')), // C - Chủ trì
  values[9] || '',                            // D - Số ngày kế hoạch từ Cong_viec!J
  chuanHoaLienKetTienNhiemTongHopV1_(values[10], displays[10]),  // E - Công việc liên kết từ Cong_viec!K
  values[11] || '',                           // F - BĐ hiện hành từ Cong_viec!L
  values[12] || '',                           // G - KT hiện hành từ Cong_viec!M
  isDetailTask ? chuanHoaTextMotDongTongHopV1_(values[17]) : ''
]);
    const baselineStartForTech = baseline ? baseline[3] : ''; // Ke_hoach_goc!D - Bắt đầu gốc
    const baselineEndForTech = baseline ? baseline[4] : '';   // Ke_hoach_goc!E - Kết thúc gốc

    techOutput.push(isDetailTask ? [
      taskCode,                                      // 1 - Mã công việc - Cong_viec!O
      values[18] || '',                             // 2 - Actual Start - Cong_viec!S
      values[19] || '',                             // 3 - Actual Finish - Cong_viec!T
      chuanHoaTextMotDongTongHopV1_(values[17]),    // 4 - Trạng thái - Cong_viec!R
      baselineStartForTech,                         // 5 - Baseline Start - Ke_hoach_goc!D
      baselineEndForTech                            // 6 - Baseline End - Ke_hoach_goc!E
    ] : ['', '', '', '', '', '']);
  });

  const clearRows = Math.max(targetSheet.getLastRow() - 4, output.length, 1000);
  const requiredRows = clearRows + 4;

  if (targetSheet.getMaxRows() < requiredRows) {
    targetSheet.insertRowsAfter(targetSheet.getMaxRows(), requiredRows - targetSheet.getMaxRows());
  }

  targetSheet.getRange(5, 2, clearRows, 1).breakApart();

  targetSheet
    .getRange(5, 1, clearRows, 8)
    .clearContent();

  targetSheet
    .getRange(5, cfg.TECH_START_COL, clearRows, 6)
    .clearContent();

  if (output.length > 0) {
    // Ép định dạng trước khi ghi để cột E không tự chuyển số tiền nhiệm thành ngày 1900.
    targetSheet.getRange(5, 4, output.length, 1).setNumberFormat('0');          // D - Số ngày
    targetSheet.getRange(5, 5, output.length, 1).setNumberFormat('@');          // E - Công việc liên kết
    targetSheet.getRange(5, 6, output.length, 2).setNumberFormat('dd/MM/yyyy'); // F:G - Ngày

    targetSheet
      .getRange(5, 1, output.length, 8)
      .setValues(output);

    targetSheet.getRange(5, 5, output.length, 1).setNumberFormat('@');

    targetSheet
      .getRange(5, cfg.TECH_START_COL, techOutput.length, 6)
      .setValues(techOutput);
  }

  const formatRows = Math.max(output.length, clearRows);

  targetSheet
    .getRange(5, 1, formatRows, 8)
    .setWrap(false)
    .setVerticalAlignment('middle');

  targetSheet.setRowHeights(5, formatRows, 24);

  // D = Số ngày kế hoạch
targetSheet
  .getRange(5, 4, formatRows, 1)
  .setNumberFormat('0')
  .setHorizontalAlignment('center');

// E = Công việc liên kết
targetSheet
  .getRange(5, 5, formatRows, 1)
  .setNumberFormat('@')
  .setHorizontalAlignment('center');

// F:G = Bắt đầu/Kết thúc hiện hành
targetSheet
  .getRange(5, 6, formatRows, 2)
  .setNumberFormat('dd/MM/yyyy')
  .setHorizontalAlignment('center');

  targetSheet
    .getRange(5, cfg.TECH_START_COL + 1, formatRows, 2)
    .setNumberFormat('dd/MM/yyyy');

  targetSheet
    .getRange(5, cfg.TECH_START_COL + 4, formatRows, 2)
    .setNumberFormat('dd/MM/yyyy');

  targetSheet
    .getRange(5, 2, formatRows, 1)
    .setHorizontalAlignment('left');

  targetSheet
    .getRange(5, 8, formatRows, 1)
    .setHorizontalAlignment('left');

  targetSheet
    .getRange(5, 1, formatRows, 1)
    .setHorizontalAlignment('center');

  targetSheet
    .getRange(5, 3, formatRows, 1)
    .setHorizontalAlignment('center');
    
    // Cập nhật lại tiêu đề A:H của bảng trái
  targetSheet
    .getRange(4, 1, 1, 8)
    .setValues([[
      'ID',
      'Công việc / Phạm vi',
      'Chủ trì',
      'Thời lượng',
      'Tiền nhiệm',
      'Bắt đầu',
      'Kết thúc',
      'Trạng thái'
    ]])
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setFontWeight('bold')
    .setWrap(true);
  SpreadsheetApp.flush();

  const message = 'Đã đổ dữ liệu bảng trái A:H vào Tien_do_tong_hop. Số dòng: ' + output.length;
  Logger.log(message);
  return message;
}


function docDuLieuCongViecChoTongHopV1_(ss) {
  const sheet = ss.getSheetByName('Cong_viec');

  if (!sheet) {
    throw new Error('Không tìm thấy sheet Cong_viec');
  }

  const startRow = 5;
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return [];
  }

  const range = sheet.getRange(startRow, 1, lastRow - startRow + 1, 23);
  const values = range.getValues();
  const displays = range.getDisplayValues();

  return values.map((row, index) => ({
    values: row,
    displays: displays[index]
  }));
}


function docBaselineActiveChoTongHopV1_(ss) {
  const sheet = ss.getSheetByName('Ke_hoach_goc');

  if (!sheet) {
    Logger.log('Không tìm thấy sheet Ke_hoach_goc, dùng baseline rỗng.');
    return [];
  }

  const startRow = 5;
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return [];
  }

  return sheet
    .getRange(startRow, 1, lastRow - startRow + 1, 14)
    .getValues();
}


function taoMapBaselineTheoMaCongViecV1_(baselineRows) {
  const map = {};

  baselineRows.forEach((row, index) => {
    const taskCode = String(row[9] || '').trim(); // J
    if (!taskCode) return;

    if (map[taskCode]) {
      Logger.log(
        'Baseline trùng mã công việc "' + taskCode +
        '" tại dòng Ke_hoach_goc ' + (index + 5) +
        ', giữ dòng đầu tiên.'
      );
      return;
    }

    map[taskCode] = row;
  });

  return map;
}


function taoCongViecPhamViTongHopV1_(currentRow, baseline) {
  const maCauTruc = currentRow[1];    // B
  const taskName = currentRow[7] || '';   // H
  const zone = currentRow[2];             // C
  const congTrinh = currentRow[4];        // E
  const hangMucTang = currentRow[5];      // F
  const scopeParts = [];

  if (!taskName && baseline && baseline[1]) {
    return chuanHoaTextMotDongTongHopV1_(baseline[1]);
  }

  if (typeof isDongNhomCauTrucV1_ === 'function' && isDongNhomCauTrucV1_(maCauTruc)) {
    return chuanHoaTextMotDongTongHopV1_(taskName);
  }

  if (zone) scopeParts.push(chuanHoaTextMotDongTongHopV1_(zone));
  if (congTrinh) scopeParts.push(chuanHoaTextMotDongTongHopV1_(congTrinh));
  if (hangMucTang) scopeParts.push('Hạng mục: ' + chuanHoaTextMotDongTongHopV1_(hangMucTang));

  if (scopeParts.length === 0) {
    return chuanHoaTextMotDongTongHopV1_(taskName);
  }

  return chuanHoaTextMotDongTongHopV1_(taskName + ' | ' + scopeParts.join(' · '));
}


function soNgayLechTongHopV1_(date1, date2) {
  const d1 = boGioTongHopV1_(date1);
  const d2 = boGioTongHopV1_(date2);
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}


function laNgayHopLeTongHopV1_(value) {
  return Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime());
}


function boGioTongHopV1_(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}


function chuanHoaTextMotDongTongHopV1_(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' | ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/(\s*\|\s*){2,}/g, ' | ')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .trim();
}


function chuanHoaLienKetTienNhiemTongHopV1_(value, displayValue) {
  if (value === null || value === '' || typeof value === 'undefined') return '';

  if (laNgayHopLeTongHopV1_(value) && value.getFullYear() === 1900 && value.getMonth() === 0) {
    return String(value.getDate());
  }

  if (typeof value === 'number' && isFinite(value)) {
    return String(Math.floor(value));
  }

  let text = chuanHoaTextMotDongTongHopV1_(displayValue || value);

  // Sửa các giá trị đã từng bị biến thành ngày 1900:
  // 10/01/1900 -> 10
  // 11/01/1900 -> 11
  // 24/01/1900 -> 24
  const m = text.match(/^(\d{1,2})[\/\-]01[\/\-]1900$/);
  if (m) {
    return String(Number(m[1]));
  }

  return text;
}
