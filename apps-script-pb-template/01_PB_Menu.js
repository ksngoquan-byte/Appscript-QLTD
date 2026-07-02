/**
 * PB Utility V1 - Menu
 */

function onOpen(e) {
  taoMenuPBV1_();
}

function taoMenuPBV1_() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🧩 PB - Người dùng')
    .addItem('1. Chuẩn hóa sheet hiện tại', 'chuanHoaSheetHienTaiPBV1')
    .addItem('2. Tạo lại nhóm WBS sheet hiện tại', 'taoLaiNhomWbsSheetHienTaiPBV1')
    .addItem('3. Kiểm tra dữ liệu nhập sheet hiện tại', 'kiemTraDuLieuNhapSheetHienTaiPBV1')
    .addSeparator()
    .addItem('4. Đề xuất điều chỉnh tiến độ dòng đang chọn', 'moFormDeXuatDieuChinhTienDoPBV1')
    .addToUi();

  if (laAdminPBV1_()) {
    ui.createMenu('🔐 PB - Admin')
      .addItem('1. Chuẩn hóa toàn bộ sheet phòng/ban', 'chuanHoaTatCaSheetPhongBanPBV1')
      .addItem('2. Tạo lại nhóm WBS toàn bộ sheet phòng/ban', 'taoLaiNhomWbsTatCaSheetPhongBanPBV1')
      .addSeparator()
      .addItem('3. Xóa nhóm WBS sheet hiện tại', 'xoaNhomWbsSheetHienTaiPBV1')
      .addItem('4. Xóa nhóm WBS toàn bộ sheet phòng/ban', 'xoaNhomWbsTatCaSheetPhongBanPBV1')
      .addSeparator()
      .addItem('5. Ẩn/bảo vệ cột hệ thống N:R', 'anVaBaoVeCotHeThongTatCaSheetPBV1')
      .addItem('6. Kiểm tra kỹ thuật toàn bộ file PB', 'kiemTraKyThuatToanBoFilePBV1')
      .addSeparator()
      .addItem('Khởi tạo file PB sau nhân bản', 'moFormKhoiTaoFilePBSauNhanBanPBV1')
      .addToUi();
  }
}
