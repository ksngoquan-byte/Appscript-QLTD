/**
 * PB Utility V1 - Khởi tạo file PB sau nhân bản
 */

function moFormKhoiTaoFilePBSauNhanBanPBV1() {
  if (!laAdminPBV1_()) {
    SpreadsheetApp.getUi().alert('Bạn không có quyền Admin để khởi tạo file PB.');
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = {
    tenFilePb: ss.getName(),
    idFilePb: ss.getId(),
    maDuAn: layCauHinhPBV1_('MA_DU_AN', ''),
    tenDuAn: layCauHinhPBV1_('TEN_DU_AN', ''),
    tenDayDuDuAn: layCauHinhPBV1_('TEN_DAY_DU_DU_AN', ''),
    tenFileMaster: layCauHinhPBV1_('TEN_FILE_MASTER', ''),
    idFileMaster: layCauHinhPBV1_('ID_FILE_MASTER', ''),
    emailNhanDeXuat: layCauHinhPBV1_('EMAIL_NHAN_DE_XUAT', PBV1_CONFIG.ADJUST_REQUEST_TO),
    tenNguoiNhan: layCauHinhPBV1_('TEN_NGUOI_NHAN', 'Mr Quân')
  };

  const template = HtmlService.createTemplateFromFile('PB_Init_Clone_Form');
  template.ctxJson = JSON.stringify(ctx);
  const html = template.evaluate().setWidth(760).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'Khởi tạo file PB sau nhân bản');
}

function khoiTaoFilePBSauNhanBanPBV1(formData) {
  if (!laAdminPBV1_()) {
    throw new Error('Bạn không có quyền Admin để khởi tạo file PB.');
  }

  const confirmText = String(formData.confirmText || '').trim();
  if (confirmText !== 'RESET PB') {
    throw new Error('Chuỗi xác nhận không đúng. Vui lòng nhập chính xác: RESET PB');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  const maDuAn = String(formData.maDuAn || '').trim();
  const tenDuAn = String(formData.tenDuAn || '').trim();
  const tenDayDuDuAn = String(formData.tenDayDuDuAn || '').trim() || (tenDuAn ? `Dự án ${tenDuAn}` : 'Dự án');
  const tenFileMaster = String(formData.tenFileMaster || '').trim();
  const idFileMaster = String(formData.idFileMaster || '').trim();
  const emailNhanDeXuat = String(formData.emailNhanDeXuat || '').trim();
  const tenNguoiNhan = String(formData.tenNguoiNhan || '').trim() || 'Mr Quân';

  if (!maDuAn || !tenDuAn || !tenFileMaster || !idFileMaster || !emailNhanDeXuat) {
    throw new Error('Vui lòng nhập đầy đủ: Mã dự án, Tên dự án, Tên file Master, ID file Master và Email nhận đề xuất.');
  }

  capNhatCauHinhKhoiTaoPBV1_({
    maDuAn,
    tenDuAn,
    tenDayDuDuAn,
    tenFileMaster,
    idFileMaster,
    tenFilePb: ss.getName(),
    idFilePb: ss.getId(),
    emailNhanDeXuat,
    tenNguoiNhan,
    ngayKhoiTao: now,
    nguoiKhoiTao: layEmailNguoiDungPBV1_()
  });

  const resetSheets = resetTatCaSheetPhongBanSauNhanBanPBV1_(tenDayDuDuAn);
  resetSheetYeuCauDieuChinhSauNhanBanPBV1_();

  ss.toast(
    'Đã khởi tạo file PB sau nhân bản. Vui lòng cập nhật Cau_hinh_dong_bo tại file Master mới trước khi đồng bộ.',
    'Thành công',
    8
  );

  return {
    success: true,
    message: 'Đã khởi tạo file PB sau nhân bản.',
    resetSheets
  };
}

function capNhatCauHinhKhoiTaoPBV1_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Cau_hinh_PB');
  if (!sheet) sheet = ss.insertSheet('Cau_hinh_PB');

  const headers = ['Mã cấu hình', 'Giá trị', 'Tên hiển thị', 'Ghi chú'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground(PBV1_CONFIG.COLORS.HEADER_BG)
    .setFontColor(PBV1_CONFIG.COLORS.HEADER_FONT);
  sheet.setFrozenRows(1);

  const entries = [
    ['MA_DU_AN', data.maDuAn, 'Mã dự án', 'Cập nhật khi khởi tạo PB sau nhân bản'],
    ['TEN_DU_AN', data.tenDuAn, 'Tên dự án', 'Cập nhật khi khởi tạo PB sau nhân bản'],
    ['TEN_DAY_DU_DU_AN', data.tenDayDuDuAn, 'Tên đầy đủ dự án', 'Dùng trong email và tiêu đề sheet PB'],
    ['TEN_FILE_MASTER', data.tenFileMaster, 'Tên file Master', 'File Master của dự án mới'],
    ['ID_FILE_MASTER', data.idFileMaster, 'ID file Master', 'ID file Master của dự án mới'],
    ['TEN_SHEET_MASTER', 'Cong_viec', 'Tên sheet Master', 'Tên sheet dữ liệu công việc trong Master'],
    ['TEN_FILE_PB', data.tenFilePb, 'Tên file PB', 'Tự lấy từ file PB hiện tại'],
    ['ID_FILE_PB', data.idFilePb, 'ID file PB', 'Tự lấy từ file PB hiện tại'],
    ['EMAIL_NHAN_DE_XUAT', data.emailNhanDeXuat, 'Email nhận đề xuất', 'Dùng khi gửi đề xuất điều chỉnh tiến độ'],
    ['TEN_NGUOI_NHAN', data.tenNguoiNhan, 'Tên người nhận', 'Dùng trong lời chào email đề xuất'],
    ['TRANG_THAI_CAU_HINH', 'Active', 'Trạng thái cấu hình', 'Active sau khi khởi tạo'],
    ['NGAY_KHOI_TAO', data.ngayKhoiTao, 'Ngày khởi tạo', 'Thời điểm chạy khởi tạo PB sau nhân bản'],
    ['NGUOI_KHOI_TAO', data.nguoiKhoiTao, 'Người khởi tạo', 'Email người chạy khởi tạo'],
    ['PB_SCHEMA_VERSION', PBV1_CONFIG.SCHEMA_VERSION, 'Phiên bản schema PB', 'Cập nhật khi template PB thay đổi schema']
  ];

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const current = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues() : [];
  const rowByKey = {};
  current.forEach((row, index) => {
    const key = String(row[0] || '').trim();
    if (key) rowByKey[key] = index + 2;
  });

  entries.forEach(entry => {
    const rowIndex = rowByKey[entry[0]] || sheet.getLastRow() + 1;
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([entry]);
    if (entry[0] === 'NGAY_KHOI_TAO') sheet.getRange(rowIndex, 2).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  });

  sheet.autoResizeColumns(1, headers.length);
}

function resetTatCaSheetPhongBanSauNhanBanPBV1_(tenDayDuDuAn) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resetSheets = [];
  PBV1_CONFIG.SHEET_NAMES.forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    damBaoDuCotHeThongPBV1_(sheet);

    const maxRows = sheet.getMaxRows();
    sheet.getRange(1, 1).setValue(`KẾ HOẠCH CHI TIẾT ${tenDayDuDuAn}`);
    sheet.getRange(2, 1).setValue(`PHÒNG/BAN: ${sheetName}`);
    sheet.getRange(3, 1, 1, layCotCuoiHeThongPBV1_()).clearContent();
    if (maxRows >= PBV1_CONFIG.DATA_START_ROW) {
      sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 1, maxRows - PBV1_CONFIG.DATA_START_ROW + 1, layCotCuoiHeThongPBV1_())
        .clearContent()
        .clearDataValidations();
      resetFormatVungDuLieuPhongBanSauNhanBanPBV1_(sheet);
    }

    xoaNhomWbsSheetPBV1_(sheet);
    chuanHoaSheetPBV1_(sheet, false);
    resetFormatVungDuLieuPhongBanSauNhanBanPBV1_(sheet);
    apDungValidationTrangThaiPBV1_(sheet);
    apDungValidationTienDoTrongSoPBV1_(sheet);
    anCotHeThongPBV1_(sheet);
    baoVeCotHeThongPBV1_(sheet);
    resetSheets.push(sheetName);
  });
  return resetSheets;
}

function resetFormatVungDuLieuPhongBanSauNhanBanPBV1_(sheet) {
  const maxRows = sheet.getMaxRows();
  if (maxRows < PBV1_CONFIG.DATA_START_ROW) return;

  const rowCount = maxRows - PBV1_CONFIG.DATA_START_ROW + 1;
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 1, rowCount, layCotCuoiHeThongPBV1_())
    .setBackground('#FFFFFF')
    .setFontWeight('normal')
    .setFontColor('#000000')
    .setFontStyle('normal')
    .setWrap(true);
}

function resetSheetYeuCauDieuChinhSauNhanBanPBV1_() {
  const headers = layHeadersYeuCauDieuChinhPBV1_();
  const sheet = damBaoSheetYeuCauDieuChinhPBV1_(headers);
  const maxRows = sheet.getMaxRows();
  if (maxRows > 1) {
    sheet.getRange(2, 1, maxRows - 1, headers.length).clearContent();
  }
  damBaoSheetYeuCauDieuChinhPBV1_(headers);
}
