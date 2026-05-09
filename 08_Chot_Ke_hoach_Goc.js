/*******************************************************
 * FILE: 08_Chot_Ke_hoach_Goc.gs
 *
 * MỤC TIÊU
 * - Chốt baseline từ Cong_viec sang Ke_hoach_goc
 * - Ke_hoach_goc là snapshot cố định, không dùng công thức sống
 * - Layout tối ưu:
 *   A:I  = phần quản lý nhìn thấy
 *   J:N  = vùng kỹ thuật ẩn
 * - Ke_hoach_goc_history lưu lịch sử baseline cũ
 *
 * NGUYÊN TẮC
 * - Cong_viec!J/L/M tại thời điểm chốt là kế hoạch gốc
 * - Cột B "Công việc / Phạm vi" được Apps Script gộp thành text tĩnh
 * - Không ghi đè mất baseline cũ nếu chưa lưu lịch sử
 * - Baseline mới là ACTIVE
 *******************************************************/

function chotBaselineLanDauV1() {
  return chotKeHoachGocCoreV1_('LAN_DAU');
}


function chotBaselineDieuChinhV1() {
  return chotKeHoachGocCoreV1_('DIEU_CHINH');
}


/**
 * Giu ten ham cu de tranh mat tuong thich.
 * Nếu chưa có baseline thì hiểu là LAN_DAU.
 * Nếu đã có baseline thì hiểu là DIEU_CHINH.
 */
function chotKeHoachGocV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Ke_hoach_goc');
  const hasBaseline = coBaselineHienTaiKeHoachGocV1_(sheet);

  return chotKeHoachGocCoreV1_(hasBaseline ? 'DIEU_CHINH' : 'LAN_DAU');
}


/**
 * Hàm lõi chốt baseline.
 */
function chotKeHoachGocCoreV1_(baselineType) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName('Cong_viec');

  if (!sourceSheet) {
    throw new Error('Không tìm thấy sheet Cong_viec');
  }

  const targetSheet = taoHoacLaySheetKeHoachGocV1_();
  const hasCurrentBaseline = coBaselineHienTaiKeHoachGocV1_(targetSheet);

  if (baselineType === 'LAN_DAU' && hasCurrentBaseline) {
    throw new Error(
      'Ke_hoach_goc đã có baseline ACTIVE hiện tại. ' +
      'Vui lòng dùng chotBaselineDieuChinhV1() để chốt điều chỉnh.'
    );
  }

  const now = new Date();
  const baselineVersion = taoBaselineVersionTuanTuKeHoachGocV1_(ss);

  const startRow = 5;
  const lastRow = sourceSheet.getLastRow();

  if (lastRow < startRow) {
    throw new Error('Cong_viec chưa có dữ liệu để chốt kế hoạch gốc.');
  }

  // Đọc A:Q một lần để tối ưu hiệu năng.
  const sourceValues = sourceSheet
    .getRange(startRow, 1, lastRow - startRow + 1, 17)
    .getValues();

  const output = [];
  const errors = [];

  sourceValues.forEach((row, index) => {
    const sourceRow = startRow + index;

    const zone = row[2];              // C
    const congTrinh = row[4];         // E
    const hangMucTang = row[5];       // F
    const soThamChieu = row[6];       // G
    const tenCongViec = row[7];       // H
    const chuTri = row[8];            // I
    const soNgay = row[9];            // J
    const lienKet = row[10];          // K
    const batDau = row[11];           // L
    const ketThuc = row[12];          // M
    const ghiChuKeHoach = row[13];    // N
    const maCongViec = row[14];       // O
    const maMocHeThong = row[15];     // P

    if (!tenCongViec) return;

    if (!maCongViec) {
      errors.push('D\u00f2ng ' + sourceRow + ': thi\u1ebfu M\u00e3 c\u00f4ng vi\u1ec7c t\u1ea1i c\u1ed9t O.');
    }

    if (!batDau || !ketThuc) {
      if (!batDau) errors.push('Dòng ' + sourceRow + ': thiếu Bắt đầu forecast tại cột L.');
      if (!ketThuc) errors.push('Dòng ' + sourceRow + ': thiếu Kết thúc forecast tại cột M.');
    }

    const congViecPhamVi = taoCongViecPhamViBaselineV1_({
      tenCongViec,
      zone,
      congTrinh,
      hangMucTang
    });

    output.push([
      soThamChieu,            // A - Ref gốc
      congViecPhamVi,         // B - Công việc / Phạm vi
      chuTri,                 // C - Chủ trì
      batDau,                 // D - Bắt đầu gốc
      ketThuc,                // E - Kết thúc gốc
      soNgay,                 // F - Ngày gốc
      lienKet,                // G - Liên kết gốc
      maMocHeThong,           // H - Mốc/Gate
      ghiChuKeHoach,          // I - Ghi chú gốc
      maCongViec,             // J - Ma cong viec
      baselineVersion,        // K - Baseline version
      baselineType,           // L - Baseline type
      'ACTIVE',               // M - Baseline status
      now                     // N - Created at
    ]);
  });

  if (output.length === 0) {
    throw new Error('Không có dòng công việc hợp lệ để chốt baseline.');
  }

  if (errors.length > 0) {
    const message =
      'Chưa thể chốt baseline vì còn lỗi dữ liệu:\n' +
      errors.slice(0, 30).join('\n');

    throw new Error(message);
  }

  const historySheet = taoHoacLaySheetKeHoachGocHistoryV1_();
  capNhatBaselineDangApDungThanhDaThayTheV1_(historySheet);

  moKhoaSheetKeHoachGocV1_(targetSheet);

  thietLapKhungKeHoachGocV1_(targetSheet);

  targetSheet
    .getRange(5, 1, output.length, output[0].length)
    .setValues(output);

  capNhatThongTinDauSheetKeHoachGocV1_(targetSheet, {
    baselineVersion,
    baselineType,
    createdAt: now,
    taskCount: output.length
  });

  dinhDangSheetKeHoachGocV1_(targetSheet);
  khoaSheetKeHoachGocV1_(targetSheet);

  const snapshotName = taoSnapshotSheetTheoBaselineVersionV1_(targetSheet, baselineVersion, now);
  ghiDongDangKyBaselineHistoryV1_(historySheet, {
    baselineVersion,
    snapshotName,
    createdAt: now,
    taskCount: output.length,
    note: ''
  });

  SpreadsheetApp.flush();

  const message =
    'Đã chốt baseline thành công.\n' +
    'Phiên bản: ' + baselineVersion + '\n' +
    'Loại: ' + baselineType + '\n' +
    'Số công việc: ' + output.length;

  Logger.log(message);
  return message;
}


/**
 * Tạo text tĩnh cho cột B - Công việc / Phạm vi.
 */

/**
 * PHASE 2 - Baseline versioning.
 * Ke_hoach_goc_history = registry 6 cot.
 */
function taoBaselineVersionTuanTuKeHoachGocV1_(ss) {
  const maxFromSheets = laySoBaselineLonNhatTuTenSheetV1_(ss);
  const maxFromHistory = laySoBaselineLonNhatTuHistoryV1_(ss);
  const maxFromActive = laySoBaselineLonNhatTuActiveV1_(ss);
  const next = Math.max(maxFromSheets, maxFromHistory, maxFromActive) + 1;
  return 'BL' + String(next).padStart(3, '0');
}

function laySoBaselineLonNhatTuTenSheetV1_(ss) {
  let max = 0;
  ss.getSheets().forEach(sheet => {
    const name = sheet.getName();
    let match = name.match(/^KH_goc_BL(\d{3,})_\d{8}$/);
    if (!match) match = name.match(/^KH_goc_BL(\d{3,})$/);
    if (!match) return;
    const n = Number(match[1]);
    if (isFinite(n) && n > max) max = n;
  });
  return max;
}

function laySoBaselineLonNhatTuHistoryV1_(ss) {
  const sheet = ss.getSheetByName('Ke_hoach_goc_history');
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  let max = 0;

  values.forEach(row => {
    const n = laySoThuTuTuBaselineVersionV1_(row[0]);
    if (n > max) max = n;
  });

  return max;
}

function laySoBaselineLonNhatTuActiveV1_(ss) {
  const sheet = ss.getSheetByName('Ke_hoach_goc');
  if (!sheet) return 0;

  let max = 0;

  try {
    const row2 = sheet.getRange(2, 1, 1, Math.min(sheet.getLastColumn(), 14)).getValues()[0];
    row2.forEach(value => {
      const n = laySoThuTuTuBaselineVersionV1_(value);
      if (n > max) max = n;
    });
  } catch (err) {
    Logger.log('Khong doc duoc row2 Ke_hoach_goc: ' + err.message);
  }

  if (sheet.getLastRow() >= 5 && sheet.getLastColumn() >= 11) {
    try {
      const values = sheet.getRange(5, 11, sheet.getLastRow() - 4, 1).getValues();
      values.forEach(row => {
        const n = laySoThuTuTuBaselineVersionV1_(row[0]);
        if (n > max) max = n;
      });
    } catch (err) {
      Logger.log('Khong doc duoc cot K Ke_hoach_goc: ' + err.message);
    }
  }

  return max;
}

function laySoThuTuTuBaselineVersionV1_(value) {
  const text = String(value || '').trim();
  const match = text.match(/^BL(\d{3,})$/);
  return match ? Number(match[1]) : 0;
}

function taoHoacLaySheetKeHoachGocHistoryV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Ke_hoach_goc_history');

  if (!sheet) {
    sheet = ss.insertSheet('Ke_hoach_goc_history');
  }

  thietLapHeaderHistoryKeHoachGocV1_(sheet);
  dinhDangSheetHistoryKeHoachGocV1_(sheet);

  try {
    sheet.hideSheet();
  } catch (err) {
    Logger.log('Khong an duoc Ke_hoach_goc_history: ' + err.message);
  }

  return sheet;
}

function thietLapHeaderHistoryKeHoachGocV1_(sheet) {
  const HEADER_MA_BASELINE = 'M\u00e3 baseline';
  const HEADER_TEN_SHEET = 'T\u00ean sheet l\u01b0u tr\u1eef';
  const HEADER_TRANG_THAI = 'Tr\u1ea1ng th\u00e1i';
  const HEADER_NGAY_LUU = 'Ng\u00e0y l\u01b0u';
  const HEADER_SO_DONG = 'S\u1ed1 d\u00f2ng c\u00f4ng vi\u1ec7c';
  const HEADER_GHI_CHU = 'Ghi ch\u00fa';

  const headers = [[
    HEADER_MA_BASELINE,
    HEADER_TEN_SHEET,
    HEADER_TRANG_THAI,
    HEADER_NGAY_LUU,
    HEADER_SO_DONG,
    HEADER_GHI_CHU
  ]];

  const currentA1 = String(sheet.getRange('A1').getValue() || '').trim();
  const lastColumn = sheet.getLastColumn();
  const headerWidthToRead = Math.max(1, Math.min(lastColumn, 6));
  const currentHeaders = sheet.getRange(1, 1, 1, headerWidthToRead).getValues()[0];
  const hasExactHeader = headers[0].every((header, index) => String(currentHeaders[index] || '').trim() === header);

  if (currentA1 !== HEADER_MA_BASELINE || !hasExactHeader || lastColumn > 6) {
    const filter = sheet.getFilter();
    if (filter) filter.remove();

    sheet.clear();

    const maxColumns = sheet.getMaxColumns();
    if (maxColumns < 6) {
      sheet.insertColumnsAfter(maxColumns, 6 - maxColumns);
    }
  }

  sheet.getRange(1, 1, 1, 6).setValues(headers);
  sheet.setFrozenRows(1);

  try {
    if (sheet.getMaxColumns() > 6) {
      sheet.deleteColumns(7, sheet.getMaxColumns() - 6);
    }
  } catch (err) {
    Logger.log('Khong xoa duoc cot thua trong Ke_hoach_goc_history: ' + err.message);
  }
}

function dinhDangSheetHistoryKeHoachGocV1_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 1);

  sheet.getRange(1, 1, 1, 6)
    .setBackground('#1F4E78')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 6)
      .setFontSize(10)
      .setVerticalAlignment('middle')
      .setBorder(true, true, true, true, true, true, '#D7E1EA', SpreadsheetApp.BorderStyle.SOLID);

    sheet.getRange(2, 4, lastRow - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm');
    sheet.getRange(2, 5, lastRow - 1, 1).setNumberFormat('0');
  }

  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 230);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 145);
  sheet.setColumnWidth(5, 130);
  sheet.setColumnWidth(6, 260);
  sheet.setRowHeight(1, 36);
}

function capNhatBaselineDangApDungThanhDaThayTheV1_(historySheet) {
  thietLapHeaderHistoryKeHoachGocV1_(historySheet);

  const STATUS_ACTIVE = '\u0110ang \u00e1p d\u1ee5ng';
  const STATUS_REPLACED = '\u0110\u00e3 thay th\u1ebf';

  const lastRow = historySheet.getLastRow();
  if (lastRow < 2) return;

  const range = historySheet.getRange(2, 3, lastRow - 1, 1);
  const values = range.getValues();

  let changed = false;

  for (let i = 0; i < values.length; i++) {
    const status = String(values[i][0] || '').trim();
    if (status === STATUS_ACTIVE) {
      values[i][0] = STATUS_REPLACED;
      changed = true;
    }
  }

  if (changed) {
    range.setValues(values);
  }
}

function ghiDongDangKyBaselineHistoryV1_(historySheet, info) {
  thietLapHeaderHistoryKeHoachGocV1_(historySheet);

  const STATUS_ACTIVE = '\u0110ang \u00e1p d\u1ee5ng';

  const row = [[
    info.baselineVersion || '',
    info.snapshotName || '',
    STATUS_ACTIVE,
    info.createdAt || new Date(),
    info.taskCount || '',
    info.note || ''
  ]];

  historySheet
    .getRange(historySheet.getLastRow() + 1, 1, 1, row[0].length)
    .setValues(row);

  dinhDangSheetHistoryKeHoachGocV1_(historySheet);

  try {
    historySheet.hideSheet();
  } catch (err) {
    Logger.log('Khong an duoc history sau khi ghi dong moi: ' + err.message);
  }
}

function taoSnapshotSheetTheoBaselineVersionV1_(sourceSheet, baselineVersion, createdAt) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const safeVersion = String(baselineVersion || '').trim();

  if (!/^BL\d{3,}$/.test(safeVersion)) {
    Logger.log('Khong tao snapshot vi baselineVersion sai: ' + safeVersion);
    return '';
  }

  const dateSource = createdAt || new Date();
  const tz = Session.getScriptTimeZone();
  const dateText = Utilities.formatDate(dateSource, tz, 'ddMMyyyy');

  let snapshotName = 'KH_goc_' + safeVersion + '_' + dateText;

  if (snapshotName.length > 99) {
    snapshotName = snapshotName.slice(0, 99);
  }

  const existed = ss.getSheetByName(snapshotName);
  if (existed) {
    Logger.log('Snapshot da ton tai: ' + snapshotName);
    return snapshotName;
  }

  const protections = sourceSheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  protections.forEach(p => {
    try {
      p.remove();
    } catch (err) {
      Logger.log('Khong go duoc protection truoc khi copy snapshot: ' + err.message);
    }
  });

  const snapshot = sourceSheet.copyTo(ss).setName(snapshotName);

  try {
    const protection = snapshot.protect();
    protection.setDescription(snapshotName + ' la snapshot baseline. Khong chinh sua tay.');

    try {
      protection.removeEditors(protection.getEditors());
    } catch (err) {
      Logger.log('Khong remove editors snapshot: ' + err.message);
    }

    if (protection.canDomainEdit()) {
      protection.setDomainEdit(false);
    }
  } catch (err) {
    Logger.log('Khong khoa duoc snapshot baseline: ' + err.message);
  }

  try {
    snapshot.hideSheet();
  } catch (err) {
    Logger.log('Khong an duoc snapshot baseline: ' + err.message);
  }

  try {
    khoaSheetKeHoachGocV1_(sourceSheet);
  } catch (err) {
    Logger.log('Khong khoa lai Ke_hoach_goc: ' + err.message);
  }

  return snapshotName;
}

function taoCongViecPhamViBaselineV1_(data) {
  const ten = data.tenCongViec || '';

  const contextParts = [];

  if (data.zone) contextParts.push(data.zone);
  if (data.congTrinh) contextParts.push(data.congTrinh);
  if (data.hangMucTang) contextParts.push('Hạng mục: ' + data.hangMucTang);

  if (contextParts.length === 0) {
    return ten;
  }

  return ten + '\n' + contextParts.join(' · ');
}


/**
 * Tạo/lấy sheet Ke_hoach_goc.
 */
function taoHoacLaySheetKeHoachGocV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Ke_hoach_goc');

  if (!sheet) {
    sheet = ss.insertSheet('Ke_hoach_goc');
  }

  return sheet;
}

/**
 * Kiểm tra Ke_hoach_goc có baseline hiện tại hay không.
 */
function coBaselineHienTaiKeHoachGocV1_(sheet) {
  if (!sheet) return false;
  if (sheet.getLastRow() < 5) return false;

  const headerA4 = String(sheet.getRange('A4').getValue()).trim();
  if (headerA4 !== 'M\u00e3 c\u00f4ng vi\u1ec7c' && headerA4 !== 'Ref g\u1ed1c') return false;

  const values = sheet.getRange(5, 1, sheet.getLastRow() - 4, Math.min(sheet.getLastColumn(), 14)).getValues();
  return values.some(row => row.some(cell => cell !== '' && cell !== null));
}


/**
 * Thiết lập khung cố định cho Ke_hoach_goc.
 */
function thietLapKhungKeHoachGocV1_(sheet) {
  const filter = sheet.getFilter();
  if (filter) filter.remove();

  sheet.setFrozenColumns(0);
  sheet.setFrozenRows(0);

  sheet.clear();

  const maxColumns = sheet.getMaxColumns();
  if (maxColumns < 14) {
    sheet.insertColumnsAfter(maxColumns, 14 - maxColumns);
  } else if (maxColumns > 14) {
    sheet.deleteColumns(15, maxColumns - 14);
  }

  sheet.showColumns(1, 14);

  sheet.getRange('A1:I1')
    .breakApart()
    .clearContent()
    .merge()
    .setBackground('#1F4E78')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(13)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.getRange('A1').setValue('KẾ HOẠCH GỐC / BASELINE ACTIVE');

  const headers = [[
    'Ref gốc',
    'Công việc / Phạm vi',
    'Chủ trì',
    'Bắt đầu gốc',
    'Kết thúc gốc',
    'Ngày gốc',
    'Liên kết gốc',
    'Mốc/Gate',
    'Ghi chú gốc',
    'M\u00e3 c\u00f4ng vi\u1ec7c',
    'Baseline version',
    'Baseline type',
    'Baseline status',
    'Created at'
  ]];

  sheet.getRange(4, 1, 1, headers[0].length).setValues(headers);
}


/**
 * Cập nhật thông tin đầu sheet.
 */
function capNhatThongTinDauSheetKeHoachGocV1_(sheet, info) {
  const row2 = [
    'Phiên bản',
    info.baselineVersion,
    'Ngày chốt',
    info.createdAt,
    'Loại',
    info.baselineType,
    'Số việc',
    info.taskCount,
    'ACTIVE'
  ];

  sheet.getRange(2, 1, 1, 9)
    .setValues([row2])
    .setBackground('#E6F0FA')
    .setFontWeight('bold')
    .setFontSize(9)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.getRange('D2').setNumberFormat('dd/MM/yyyy');
}

/**
 * Định dạng sheet Ke_hoach_goc.
 */
function dinhDangSheetKeHoachGocV1_(sheet) {
  const maxRow = Math.max(sheet.getMaxRows(), 1000);
  const lastRow = Math.max(sheet.getLastRow(), 5);
  const dataRowCount = Math.max(lastRow - 4, 1);
  const visibleTableRange = sheet.getRange(4, 1, Math.max(lastRow - 3, 2), 9);
  const bodyRange = sheet.getRange(5, 1, dataRowCount, 9);

  sheet.setFrozenRows(4);
  sheet.setFrozenColumns(0);

  // Tiêu đề
  sheet.getRange('A1:I1')
    .setBackground('#1F4E78')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(13)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(
      true,
      true,
      true,
      true,
      null,
      null,
      '#173B5C',
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );

  // Metadata
  sheet.getRange('A2:I2')
    .setBackground('#EAF3F8')
    .setFontColor('#173B5C')
    .setFontWeight('bold')
    .setFontSize(9)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#8CA9C4',
      SpreadsheetApp.BorderStyle.SOLID
    )
    .setBorder(
      true,
      true,
      true,
      true,
      null,
      null,
      '#5E7F9B',
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );

  sheet.getRange('A3:I3')
    .clearContent()
    .setBackground('#F8FAFC')
    .setBorder(
      null,
      null,
      true,
      null,
      null,
      null,
      '#D7E1EA',
      SpreadsheetApp.BorderStyle.SOLID
    );

  // Header bảng
  sheet.getRange('A4:I4')
    .setBackground('#CFE3F2')
    .setFontWeight('bold')
    .setFontSize(10)
    .setFontColor('#173B5C')
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
      '#6F91AD',
      SpreadsheetApp.BorderStyle.SOLID
    )
    .setBorder(
      true,
      true,
      true,
      true,
      null,
      null,
      '#4F728E',
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );

  sheet.getRange('J4:N4')
    .setBackground('#E5E7EB')
    .setFontWeight('bold')
    .setFontSize(9)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  // Thân bảng
  bodyRange
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#D7E1EA',
      SpreadsheetApp.BorderStyle.SOLID
    )
    .setBorder(
      true,
      true,
      true,
      true,
      null,
      null,
      '#9FB6C9',
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet.getRange(5, 10, dataRowCount, 5)
    .setFontSize(9)
    .setVerticalAlignment('middle');

  // Căn chỉnh và định dạng số/ngày
  sheet.getRange(5, 1, maxRow - 4, 1).setNumberFormat('0').setHorizontalAlignment('center'); // A
  sheet.getRange(5, 2, maxRow - 4, 1).setHorizontalAlignment('left').setVerticalAlignment('top').setWrap(true); // B
  sheet.getRange(5, 3, maxRow - 4, 1).setHorizontalAlignment('center'); // C
  sheet.getRange(5, 4, maxRow - 4, 2).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center'); // D:E
  sheet.getRange(5, 6, maxRow - 4, 1).setNumberFormat('0').setHorizontalAlignment('center'); // F
  sheet.getRange(5, 7, maxRow - 4, 2).setHorizontalAlignment('center'); // G:H
  sheet.getRange(5, 9, maxRow - 4, 1).setHorizontalAlignment('left').setWrap(true); // I
  sheet.getRange(5, 10, maxRow - 4, 1).setNumberFormat('@').setHorizontalAlignment('center'); // J
  sheet.getRange(5, 14, maxRow - 4, 1).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center'); // N

  // Kích thước cột nhìn thấy
  sheet.setColumnWidth(1, 70);  // A
  sheet.setColumnWidth(2, 420); // B
  sheet.setColumnWidth(3, 100); // C
  sheet.setColumnWidth(4, 105); // D
  sheet.setColumnWidth(5, 105); // E
  sheet.setColumnWidth(6, 70);  // F
  sheet.setColumnWidth(7, 110); // G
  sheet.setColumnWidth(8, 95);  // H
  sheet.setColumnWidth(9, 220); // I

  for (let col = 10; col <= 14; col++) {
    sheet.setColumnWidth(col, 130);
  }

  sheet.hideColumns(10, 5);

  // Filter
  const filter = sheet.getFilter();
  if (filter) filter.remove();

  visibleTableRange.createFilter();

  if (lastRow >= 5) {
    const rowBackgrounds = new Array(lastRow - 4).fill(null).map((_, index) => {
      const color = index % 2 === 0 ? '#FFFFFF' : '#F6FAFD';
      return new Array(9).fill(color);
    });
    sheet.getRange(5, 1, lastRow - 4, 9).setBackgrounds(rowBackgrounds);
    sheet.setRowHeights(5, lastRow - 4, 36);
  }

  sheet.setRowHeight(1, 34);
  sheet.setRowHeight(2, 30);
  sheet.setRowHeight(3, 7);
  sheet.setRowHeight(4, 40);
}


/**
 * Gỡ protection cũ để script có thể ghi lại baseline.
 */
function moKhoaSheetKeHoachGocV1_(sheet) {
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  protections.forEach(p => {
    try {
      p.remove();
    } catch (err) {
      Logger.log('Không thể gỡ protection cũ: ' + err.message);
    }
  });
}


/**
 * Khóa sheet Ke_hoach_goc.
 */
function khoaSheetKeHoachGocV1_(sheet) {
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  protections.forEach(p => p.remove());

  const protection = sheet.protect();
  protection.setDescription('Ke_hoach_goc là baseline đã chốt. Không chỉnh sửa tay.');

  try {
    protection.removeEditors(protection.getEditors());
  } catch (err) {
    Logger.log('Không thể remove editors: ' + err.message);
  }

  if (protection.canDomainEdit()) {
    protection.setDomainEdit(false);
  }
}

