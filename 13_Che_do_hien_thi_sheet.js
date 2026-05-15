/*******************************************************
 * FILE: 13_Che_do_hien_thi_sheet.js
 *
 * MUC TIEU
 * - Bat che do chi hien thi sheet van hanh:
 *   Cong_viec va Tien_do_tong_hop.
 * - Hien lai toan bo sheet khi can thao tac ky thuat.
 *
 * NGUYEN TAC
 * - Khong xoa sheet.
 * - Khong xoa du lieu.
 * - Khong sua quyen chia se.
 * - Khong cai/go trigger.
 *******************************************************/

const CHE_DO_HIEN_THI_SHEET_V1 = {
  VISIBLE_SHEETS: ['Cong_viec', 'Tien_do_tong_hop']
};

function batCheDoChiHienSheetVanHanhV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const visibleSheetNames = CHE_DO_HIEN_THI_SHEET_V1.VISIBLE_SHEETS;

  visibleSheetNames.forEach(function(sheetName) {
    if (!ss.getSheetByName(sheetName)) {
      throw new Error('Không tìm thấy sheet bắt buộc: ' + sheetName);
    }
  });

  const congViecSheet = ss.getSheetByName('Cong_viec');
  ss.setActiveSheet(congViecSheet);

  anSheetKyThuatV1_(ss, visibleSheetNames);

  const message = 'Đã bật chế độ chỉ hiện sheet vận hành. Các sheet kỹ thuật đã được ẩn.';
  ghiLogCheDoHienThiV1_(message);

  try {
    ss.toast(message, 'Chế độ hiển thị', 8);
  } catch (err) {
    Logger.log('Không hiển thị được toast: ' + err.message);
  }

  return message;
}

function hienLaiTatCaSheetV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  hienTatCaSheetNoiBoV1_(ss);

  const message = 'Đã hiện lại toàn bộ sheet.';
  ghiLogCheDoHienThiV1_(message);

  try {
    ss.toast(message, 'Chế độ hiển thị', 8);
  } catch (err) {
    Logger.log('Không hiển thị được toast: ' + err.message);
  }

  return message;
}

function anSheetKyThuatV1_(ss, visibleSheetNames) {
  const visibleSet = {};
  visibleSheetNames.forEach(function(name) {
    visibleSet[name] = true;
  });

  ss.getSheets().forEach(function(sheet) {
    const sheetName = sheet.getName();

    if (visibleSet[sheetName]) {
      sheet.showSheet();
      return;
    }

    try {
      sheet.hideSheet();
    } catch (err) {
      Logger.log('Không ẩn được sheet "' + sheetName + '": ' + err.message);
    }
  });
}

function hienTatCaSheetNoiBoV1_(ss) {
  ss.getSheets().forEach(function(sheet) {
    try {
      sheet.showSheet();
    } catch (err) {
      Logger.log('Không hiện được sheet "' + sheet.getName() + '": ' + err.message);
    }
  });
}

function ghiLogCheDoHienThiV1_(message) {
  Logger.log('[CHE_DO_HIEN_THI_SHEET_V1] ' + message);
}
