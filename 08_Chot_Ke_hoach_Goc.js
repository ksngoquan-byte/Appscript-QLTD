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
 * Giữ tên hàm cũ để tránh mất tương thích.
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
  const hasAnyExistingData = coDuLieuTrongSheetKeHoachGocV1_(targetSheet);

  if (baselineType === 'LAN_DAU' && hasCurrentBaseline) {
    throw new Error(
      'Ke_hoach_goc đã có baseline ACTIVE hiện tại. ' +
      'Vui lòng dùng chotBaselineDieuChinhV1() để chốt điều chỉnh.'
    );
  }

  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const baselineVersion = 'BL_' + Utilities.formatDate(now, tz, 'yyyyMMdd_HHmmss');

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
      errors.push('Dòng ' + sourceRow + ': thiếu Mã công việc tại cột O.');
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
      maCongViec,             // J - Mã công việc
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

  moKhoaSheetKeHoachGocV1_(targetSheet);

  if (hasCurrentBaseline) {
    const historySheet = taoHoacLaySheetKeHoachGocHistoryV1_();
    luuBaselineHienTaiVaoHistoryV1_(targetSheet, historySheet, now);
    taoBackupSheetKeHoachGocV1_(targetSheet, now);
  } else if (hasAnyExistingData) {
    taoBackupSheetKeHoachGocV1_(targetSheet, now);
  }

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
 * Tạo/lấy sheet lịch sử baseline.
 */
function taoHoacLaySheetKeHoachGocHistoryV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Ke_hoach_goc_history');

  if (!sheet) {
    sheet = ss.insertSheet('Ke_hoach_goc_history');
  }

  thietLapHeaderHistoryKeHoachGocV1_(sheet);
  sheet.hideSheet();

  return sheet;
}


/**
 * Kiểm tra Ke_hoach_goc có baseline hiện tại hay không.
 */
function coBaselineHienTaiKeHoachGocV1_(sheet) {
  if (!sheet) return false;
  if (sheet.getLastRow() < 5) return false;

  const headerA4 = String(sheet.getRange('A4').getValue()).trim();
  if (headerA4 !== 'Mã công việc' && headerA4 !== 'Ref gốc') return false;

  const values = sheet.getRange(5, 1, sheet.getLastRow() - 4, Math.min(sheet.getLastColumn(), 14)).getValues();
  return values.some(row => row.some(cell => cell !== '' && cell !== null));
}


/**
 * Kiểm tra sheet có dữ liệu bất kỳ để backup trước khi clear.
 */
function coDuLieuTrongSheetKeHoachGocV1_(sheet) {
  if (!sheet) return false;
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) return false;

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
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
    'Mã công việc',
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
 * Lưu baseline hiện tại sang history trước khi ghi baseline mới.
 */
function luuBaselineHienTaiVaoHistoryV1_(sheet, historySheet, archivedAt) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 5) return;

  thietLapHeaderHistoryKeHoachGocV1_(historySheet);

  const metadata = docMetadataBaselineKeHoachGocV1_(sheet);
  const width = Math.min(sheet.getLastColumn(), 17);
  const values = sheet.getRange(5, 1, lastRow - 4, width).getValues();
  const historyRows = [];
  const layoutType = docLoaiLayoutKeHoachGocV1_(sheet);

  values.forEach(row => {
    const visibleRow = row.slice(0, layoutType === 'NEW_AI_JN' ? 9 : 10);
    const hasData = visibleRow.some(cell => cell !== '' && cell !== null);
    if (!hasData) return;

    const mapped = chuyenDongKeHoachGocSangHistoryV1_(row, metadata, layoutType);

    historyRows.push([
      mapped.baselineVersion,
      mapped.baselineType,
      String(mapped.baselineStatus).trim() === 'ACTIVE' ? 'INACTIVE' : mapped.baselineStatus,
      mapped.createdAt,
      archivedAt,
      mapped.maCongViec,
      mapped.refGoc,
      mapped.congViecPhamVi,
      mapped.chuTri,
      mapped.batDauGoc,
      mapped.ketThucGoc,
      mapped.ngayGoc,
      mapped.lienKetGoc,
      mapped.mocGate,
      mapped.ghiChuGoc
    ]);
  });

  if (historyRows.length > 0) {
    historySheet
      .getRange(historySheet.getLastRow() + 1, 1, historyRows.length, historyRows[0].length)
      .setValues(historyRows);
  }

  historySheet.hideSheet();
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
 * Header cố định cho history.
 */
function thietLapHeaderHistoryKeHoachGocV1_(sheet) {
  const headers = [[
    'baseline_version',
    'baseline_type',
    'baseline_status',
    'created_at',
    'archived_at',
    'ma_cong_viec',
    'ref_goc',
    'cong_viec_pham_vi',
    'chu_tri',
    'bat_dau_goc',
    'ket_thuc_goc',
    'ngay_goc',
    'lien_ket_goc',
    'moc_gate',
    'ghi_chu_goc'
  ]];

  const firstCell = String(sheet.getRange('A1').getValue()).trim();
  if (firstCell !== 'baseline_version') {
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    sheet.setFrozenRows(1);
  }
}


/**
 * Đọc metadata baseline hiện tại, hỗ trợ cả layout cũ và layout mới.
 */
function docMetadataBaselineKeHoachGocV1_(sheet) {
  const row2 = sheet.getRange(2, 1, 1, 10).getValues()[0];
  const headerWidth = Math.min(sheet.getLastColumn(), 17);
  const headers = sheet.getRange(4, 1, 1, headerWidth).getValues()[0];

  let baselineVersion = '';
  let baselineType = '';
  let baselineStatus = 'ACTIVE';
  let createdAt = '';

  if (String(row2[0]).trim() === 'Phiên bản') {
    baselineVersion = row2[1];
    createdAt = row2[3];
    baselineType = row2[5];
    baselineStatus = String(row2[8]).trim() === 'Trạng thái'
      ? row2[9] || 'ACTIVE'
      : row2[8] || row2[9] || 'ACTIVE';
  } else {
    baselineVersion = row2[1];
    baselineType = row2[3];
    createdAt = row2[5];
    baselineStatus = row2[9] || 'ACTIVE';
  }

  const versionIndex = headers.indexOf('Baseline version');
  const typeIndex = headers.indexOf('Baseline type');
  const statusIndex = headers.indexOf('Baseline status');
  const createdIndex = headers.indexOf('Created at');

  return {
    baselineVersion,
    baselineType,
    baselineStatus,
    createdAt,
    versionIndex,
    typeIndex,
    statusIndex,
    createdIndex
  };
}


/**
 * Nhận diện layout để archive đúng cả bản cũ và bản mới.
 */
function docLoaiLayoutKeHoachGocV1_(sheet) {
  const headerA = String(sheet.getRange('A4').getValue()).trim();
  const headerB = String(sheet.getRange('B4').getValue()).trim();

  if (headerA === 'Ref gốc' && headerB === 'Công việc / Phạm vi') {
    return 'NEW_AI_JN';
  }

  return 'OLD_AJ_KQ';
}


/**
 * Map một dòng Ke_hoach_goc sang cấu trúc history.
 */
function chuyenDongKeHoachGocSangHistoryV1_(row, metadata, layoutType) {
  if (layoutType === 'NEW_AI_JN') {
    return {
      baselineVersion: row[10] || metadata.baselineVersion,
      baselineType: row[11] || metadata.baselineType,
      baselineStatus: row[12] || metadata.baselineStatus || 'ACTIVE',
      createdAt: row[13] || metadata.createdAt,
      maCongViec: row[9],
      refGoc: row[0],
      congViecPhamVi: row[1],
      chuTri: row[2],
      batDauGoc: row[3],
      ketThucGoc: row[4],
      ngayGoc: row[5],
      lienKetGoc: row[6],
      mocGate: row[7],
      ghiChuGoc: row[8]
    };
  }

  return {
    baselineVersion: row[10] || metadata.baselineVersion,
    baselineType: row[11] || metadata.baselineType,
    baselineStatus: row[12] || metadata.baselineStatus || 'ACTIVE',
    createdAt: row[13] || metadata.createdAt,
    maCongViec: row[0],
    refGoc: row[1],
    congViecPhamVi: row[2],
    chuTri: row[3],
    batDauGoc: row[4],
    ketThucGoc: row[5],
    ngayGoc: row[6],
    lienKetGoc: row[7],
    mocGate: row[8],
    ghiChuGoc: row[9]
  };
}


/**
 * Tạo bản sao ẩn để bảo toàn dữ liệu layout cũ trước khi clear.
 */
function taoBackupSheetKeHoachGocV1_(sourceSheet, now) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();
  let name = 'Ke_hoach_goc_backup_' + Utilities.formatDate(now, tz, 'yyyyMMdd_HHmmss');

  if (name.length > 99) {
    name = name.slice(0, 99);
  }

  if (ss.getSheetByName(name)) {
    name = ('Ke_hoach_goc_backup_' + now.getTime()).slice(0, 99);
  }

  const backupSheet = sourceSheet.copyTo(ss).setName(name);
  backupSheet.hideSheet();
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

