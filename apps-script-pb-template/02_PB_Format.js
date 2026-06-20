/**
 * PB Utility V1 - Chuẩn hóa giao diện
 */

function chuanHoaSheetHienTaiPBV1() {
  const sheet = laySheetHienTaiHopLePBV1_();
  if (!sheet) return;
  chuanHoaSheetPBV1_(sheet, true);
  SpreadsheetApp.getUi().alert(`Đã chuẩn hóa sheet: ${sheet.getName()}`);
}

function chuanHoaTatCaSheetPhongBanPBV1() {
  const sheets = layDanhSachSheetPhongBanPBV1_();
  sheets.forEach(sheet => chuanHoaSheetPBV1_(sheet, true));
  SpreadsheetApp.getUi().alert(`Đã chuẩn hóa ${sheets.length} sheet phòng/ban.`);
}

function chuanHoaSheetPBV1_(sheet, includeGroup) {
  damBaoDuCotHeThongPBV1_(sheet);
  damBaoHeaderCotHeThongPBV1_(sheet);

  const lastRow = Math.max(layLastDataRowPBV1_(sheet), PBV1_CONFIG.HEADER_ROW);
  const maxRows = sheet.getMaxRows();

  sheet.getRange(1, 1, 1, PBV1_CONFIG.DISPLAY_LAST_COL)
    .setFontWeight('bold')
    .setFontSize(14)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground(PBV1_CONFIG.COLORS.TITLE_BG);

  sheet.getRange(2, 1, 1, PBV1_CONFIG.DISPLAY_LAST_COL)
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setBackground(PBV1_CONFIG.COLORS.SUBTITLE_BG);

  sheet.getRange(PBV1_CONFIG.HEADER_ROW, 1, 1, PBV1_CONFIG.DISPLAY_LAST_COL)
    .setFontWeight('bold')
    .setFontColor(PBV1_CONFIG.COLORS.HEADER_FONT)
    .setBackground(PBV1_CONFIG.COLORS.HEADER_BG)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  if (lastRow >= PBV1_CONFIG.HEADER_ROW) {
    sheet.getRange(PBV1_CONFIG.HEADER_ROW, 1, lastRow - PBV1_CONFIG.HEADER_ROW + 1, PBV1_CONFIG.DISPLAY_LAST_COL)
      .setBorder(true, true, true, true, true, true, '#B7B7B7', SpreadsheetApp.BorderStyle.SOLID)
      .setVerticalAlignment('middle')
      .setWrap(true);
  }

  const dataRows = Math.max(maxRows - PBV1_CONFIG.DATA_START_ROW + 1, 1);
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 1, dataRows, 1).setHorizontalAlignment('center');
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 3, dataRows, 2).setHorizontalAlignment('center');
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 6, dataRows, 3).setHorizontalAlignment('center');
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 2, dataRows, 1).setHorizontalAlignment('left');
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 10, dataRows, 4).setHorizontalAlignment('left');

  sheet.setColumnWidth(1, 85);
  sheet.setColumnWidth(2, 360);
  sheet.setColumnWidth(3, 105);
  sheet.setColumnWidth(4, 105);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 115);
  sheet.setColumnWidth(7, 105);
  sheet.setColumnWidth(8, 105);
  sheet.setColumnWidth(9, 120);
  sheet.setColumnWidth(10, 145);
  sheet.setColumnWidth(11, 145);
  sheet.setColumnWidth(12, 220);
  sheet.setColumnWidth(13, 260);
  sheet.setColumnWidth(PBV1_CONFIG.COLUMNS.DETAIL_TASK_ID, 160);
  sheet.setColumnWidth(PBV1_CONFIG.COLUMNS.TIEN_DO, 90);
  sheet.setColumnWidth(PBV1_CONFIG.COLUMNS.TRONG_SO, 90);

  dinhDangNgayTienPBV1_(sheet);
  apDungValidationTienDoTrongSoPBV1_(sheet);
  apDungValidationTrangThaiPBV1_(sheet);
  apDungFilterFreezePBV1_(sheet);
  anCotHeThongPBV1_(sheet);

  if (includeGroup) {
    taoLaiNhomWbsSheetPBV1_(sheet, false);
  }
}

function dinhDangNgayTienPBV1_(sheet) {
  const rowCount = Math.max(sheet.getMaxRows() - PBV1_CONFIG.DATA_START_ROW + 1, 1);
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 3, rowCount, 2).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 7, rowCount, 2).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 5, rowCount, 1).setNumberFormat('#,##0');
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 9, rowCount, 1).setNumberFormat('#,##0');
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, PBV1_CONFIG.COLUMNS.TIEN_DO, rowCount, 2).setNumberFormat('0.##');
}

function damBaoHeaderCotHeThongPBV1_(sheet) {
  const headers = ['Mã công việc Master', 'Loại dòng', 'DetailTaskId', '% Hoàn thành', 'Trọng số'];
  sheet.getRange(PBV1_CONFIG.HEADER_ROW, PBV1_CONFIG.SYSTEM_START_COL, 1, PBV1_CONFIG.SYSTEM_COL_COUNT)
    .setValues([headers])
    .setFontWeight('bold')
    .setFontColor(PBV1_CONFIG.COLORS.HEADER_FONT)
    .setBackground(PBV1_CONFIG.COLORS.HEADER_BG)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
}
