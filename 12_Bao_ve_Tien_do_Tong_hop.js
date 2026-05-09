var PROTECT_WARNING_TIEN_DO_TONG_HOP_V1 = 'PROTECT_WARNING_TIEN_DO_TONG_HOP_V1';

function baoVeCanhBaoTienDoTongHopV1() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = laySheetTienDoTongHopBaoVeV1_(ss);

  xoaProtectionTheoMoTaTienDoTongHopV1_(sheet, PROTECT_WARNING_TIEN_DO_TONG_HOP_V1);

  var protection = sheet.protect();
  protection.setDescription(PROTECT_WARNING_TIEN_DO_TONG_HOP_V1);
  protection.setWarningOnly(true);

  ss.toast('Đã bật cảnh báo bảo vệ sheet Tiến độ tổng hợp.', 'Quản lý tiến độ', 5);
  Logger.log('Da bat canh bao bao ve sheet Tien_do_tong_hop.');
}

function laySheetTienDoTongHopBaoVeV1_(ss) {
  var sheet = ss.getSheetByName('Tien_do_tong_hop');
  if (!sheet) {
    throw new Error('Không tìm thấy sheet Tien_do_tong_hop để bật cảnh báo bảo vệ.');
  }
  return sheet;
}

function xoaProtectionTheoMoTaTienDoTongHopV1_(sheet, description) {
  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  protections.forEach(function(protection) {
    if (protection.getDescription() === description) {
      protection.remove();
    }
  });
}
