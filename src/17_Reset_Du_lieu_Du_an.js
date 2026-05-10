/*******************************************************
 * FILE: 17_Reset_Du_lieu_Du_An.js
 *
 * MUC TIEU
 * - Buoc 1: xoa du lieu/sheet van hanh cu sau khi da co du template.
 * - Buoc 2: tao lai sheet van hanh tu template an.
 *******************************************************/

const TEMPLATE_DU_AN_MOI_V1 = [
  {
    sheetName: 'Cong_viec',
    templateName: '_TEMPLATE_Cong_viec'
  },
  {
    sheetName: 'Tien_do_tong_hop',
    templateName: '_TEMPLATE_Tien_do_tong_hop'
  },
  {
    sheetName: 'Ke_hoach_goc',
    templateName: '_TEMPLATE_Ke_hoach_goc'
  },
  {
    sheetName: 'Ke_hoach_goc_history',
    templateName: '_TEMPLATE_Ke_hoach_goc_history'
  }
];

const SNAPSHOT_BACKUP_PATTERNS_DU_AN_MOI_V1 = [
  /^KH_goc_BL\d{3,}_\d{8}$/,
  /^Ke_hoach_goc_backup_/
];

const SCRIPT_PROPERTY_KEYS_RESET_DU_AN_MOI_V1 = [
  'LAST_TASK_ID'
];

const DOCUMENT_PROPERTY_KEYS_RESET_DU_AN_MOI_V1 = [
  'LAST_ROW_HIGHLIGHT_SAFE_V1',
  'LAST_HIGHLIGHT',
  'LAST_ROW_HIGHLIGHT_CONG_VIEC',
  'LAST_ROW_HIGHLIGHT_ANY_SHEET_V1',
  'LAST_CELL_HIGHLIGHT_ANY_SHEET_V1',
  'GANTT_TONG_HOP_V1_LAST_PAINTED_ROWS',
  'GANTT_TONG_HOP_V1_SHOW_BASELINE'
];

function xoaDuLieuDuAnCuV1() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Bước 1 - Xóa dữ liệu dự án cũ',
    'Chức năng này chỉ nên chạy trên BẢN SAO của file mẫu.\n\n' +
      'Hệ thống sẽ xóa các sheet vận hành cũ và snapshot/backup baseline cũ, nhưng KHÔNG xóa template, danh mục, cấu hình, ngày nghỉ, hướng dẫn và nhật ký email header.\n\n' +
      'Anh có chắc chắn tiếp tục không?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    return 'Da huy xoa du lieu du an cu.';
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const missingTemplates = layTemplateThieuDuAnMoiV1_(ss);

  if (missingTemplates.length > 0) {
    const message =
      'Thiếu template bắt buộc:\n' +
      missingTemplates.join('\n') +
      '\n\nDừng thao tác. Chưa xóa dữ liệu nào.';
    ui.alert('Không thể xóa dữ liệu', message, ui.ButtonSet.OK);
    Logger.log(message);
    return message;
  }

  const deletedSheets = [];
  const resetPropertyMessage = resetThuocTinhHeThongDuAnMoiV1_();

  ss.getSheets().forEach(function(sheet) {
    const name = sheet.getName();
    const isSnapshotOrBackup = SNAPSHOT_BACKUP_PATTERNS_DU_AN_MOI_V1.some(function(pattern) {
      return pattern.test(name);
    });

    if (!isSnapshotOrBackup) return;

    xoaSheetAnToanDuAnMoiV1_(ss, sheet);
    deletedSheets.push(name);
  });

  TEMPLATE_DU_AN_MOI_V1.forEach(function(item) {
    const sheet = ss.getSheetByName(item.sheetName);
    if (!sheet) return;

    xoaSheetAnToanDuAnMoiV1_(ss, sheet);
    deletedSheets.push(item.sheetName);
  });

  resetNhatKyEmailDuAnMoiV1_(ss);
  anVaBaoVeTemplateDuAnMoiV1_(ss);

  const message =
    'Hoàn tất bước 1.\n\n' +
    'Đã xóa sheet/snapshot: ' + (deletedSheets.length ? deletedSheets.join(', ') : 'không có') + '.\n\n' +
    resetPropertyMessage + '\n\n' +
    'Tiếp theo hãy chạy: Bước 2 - Dựng sheet từ mẫu chuẩn.';

  SpreadsheetApp.flush();
  ui.alert('Hoàn tất bước 1', message, ui.ButtonSet.OK);
  Logger.log(message);
  return message;
}

function resetThuocTinhHeThongDuAnMoiV1_() {
  const resetItems = [];
  const scriptProps = PropertiesService.getScriptProperties();
  const documentProps = PropertiesService.getDocumentProperties();

  SCRIPT_PROPERTY_KEYS_RESET_DU_AN_MOI_V1.forEach(function(key) {
    scriptProps.deleteProperty(key);
    resetItems.push('ScriptProperties.' + key);
    Logger.log('[RESET_PROPERTY] ScriptProperties: ' + key);
  });

  DOCUMENT_PROPERTY_KEYS_RESET_DU_AN_MOI_V1.forEach(function(key) {
    documentProps.deleteProperty(key);
    resetItems.push('DocumentProperties.' + key);
    Logger.log('[RESET_PROPERTY] DocumentProperties: ' + key);
  });

  const message = 'Da reset property he thong: ' + (resetItems.length ? resetItems.join(', ') : 'khong co');
  Logger.log(message);
  return message;
}

function taoSheetVanHanhTuTemplateV1() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const missingTemplates = layTemplateThieuDuAnMoiV1_(ss);

  if (missingTemplates.length > 0) {
    const message =
      'Thiếu template bắt buộc:\n' +
      missingTemplates.join('\n') +
      '\n\nDừng thao tác. Chưa tạo sheet vận hành.';
    ui.alert('Không thể dựng sheet', message, ui.ButtonSet.OK);
    Logger.log(message);
    return message;
  }

  const existingSheets = TEMPLATE_DU_AN_MOI_V1
    .filter(function(item) {
      return !!ss.getSheetByName(item.sheetName);
    })
    .map(function(item) {
      return item.sheetName;
    });

  if (existingSheets.length > 0) {
    const message =
      'Các sheet vận hành vẫn còn tồn tại:\n' +
      existingSheets.join('\n') +
      '\n\nVui lòng chạy Bước 1 - Xóa dữ liệu dự án cũ trước. Không copy đè.';
    ui.alert('Chưa thể dựng sheet', message, ui.ButtonSet.OK);
    Logger.log(message);
    return message;
  }

  TEMPLATE_DU_AN_MOI_V1.forEach(function(item) {
    const templateSheet = ss.getSheetByName(item.templateName);
    const newSheet = templateSheet.copyTo(ss);

    newSheet.setName(item.sheetName);
    newSheet.showSheet();
    goProtectionSheetDuAnMoiV1_(newSheet);
  });

  anVaBaoVeTemplateDuAnMoiV1_(ss);

  const configSheet = ss.getSheetByName('Cau_hinh');
  if (configSheet) {
    ss.setActiveSheet(configSheet);
  }

  const message =
    'Hoàn tất bước 2.\n\n' +
    'Vui lòng nhập/cập nhật trong sheet Cau_hinh:\n' +
    '- Tên dự án\n' +
    '- Mã dự án\n' +
    '- Ngày neo kế hoạch\n' +
    '- Số năm hiển thị Gantt';

  SpreadsheetApp.flush();
  ui.alert('Hoàn tất bước 2', message, ui.ButtonSet.OK);
  Logger.log(message);
  return message;
}

function resetDuLieuTaoDuAnMoiV1() {
  const message =
    'Hàm tổng resetDuLieuTaoDuAnMoiV1() đã ngừng tự chạy reset.\n\n' +
    'Vui lòng chạy theo đúng 2 bước:\n' +
    '1. xoaDuLieuDuAnCuV1()\n' +
    '2. taoSheetVanHanhTuTemplateV1()';

  SpreadsheetApp.getUi().alert('Dùng quy trình 2 bước', message, SpreadsheetApp.getUi().ButtonSet.OK);
  Logger.log(message);
  return message;
}

function thietLapDuAnMoiTuMauChuanV1() {
  const message =
    'Hàm tổng thietLapDuAnMoiTuMauChuanV1() đã ngừng tự chạy reset.\n\n' +
    'Vui lòng chạy theo đúng 2 bước:\n' +
    '1. xoaDuLieuDuAnCuV1()\n' +
    '2. taoSheetVanHanhTuTemplateV1()';

  SpreadsheetApp.getUi().alert('Dùng quy trình 2 bước', message, SpreadsheetApp.getUi().ButtonSet.OK);
  Logger.log(message);
  return message;
}

function layTemplateThieuDuAnMoiV1_(ss) {
  return TEMPLATE_DU_AN_MOI_V1
    .filter(function(item) {
      return !ss.getSheetByName(item.templateName);
    })
    .map(function(item) {
      return item.templateName;
    });
}

function resetNhatKyEmailDuAnMoiV1_(ss) {
  const sheet = ss.getSheetByName('Nhat_ky_email');
  if (!sheet) return 0;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) return 0;

  const rowCount = lastRow - 1;
  sheet.getRange(2, 1, rowCount, lastCol).clearContent();
  return rowCount;
}

function anVaBaoVeTemplateDuAnMoiV1_(ss) {
  TEMPLATE_DU_AN_MOI_V1.forEach(function(item) {
    const sheet = ss.getSheetByName(item.templateName);
    if (!sheet) return;

    sheet.hideSheet();
    baoVeSheetTemplateDuAnMoiV1_(sheet);
  });
}

function baoVeSheetTemplateDuAnMoiV1_(sheet) {
  const exists = sheet
    .getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .some(function(protection) {
      return protection.getDescription() === 'TEMPLATE_DU_AN_MOI_V1';
    });

  if (exists) return;

  try {
    const protection = sheet.protect();
    protection.setDescription('TEMPLATE_DU_AN_MOI_V1');

    try {
      protection.removeEditors(protection.getEditors());
    } catch (err) {
      Logger.log('Khong remove editors template ' + sheet.getName() + ': ' + err.message);
    }

    if (protection.canDomainEdit()) {
      protection.setDomainEdit(false);
    }
  } catch (err) {
    Logger.log('Khong bao ve duoc template ' + sheet.getName() + ': ' + err.message);
  }
}

function xoaSheetAnToanDuAnMoiV1_(ss, sheet) {
  if (!sheet) return;

  goProtectionSheetDuAnMoiV1_(sheet);
  sheet.showSheet();

  if (ss.getSheets().length <= 1) {
    throw new Error('Khong the xoa sheet cuoi cung trong file.');
  }

  ss.deleteSheet(sheet);
}

function goProtectionSheetDuAnMoiV1_(sheet) {
  const protectionTypes = [
    SpreadsheetApp.ProtectionType.SHEET,
    SpreadsheetApp.ProtectionType.RANGE
  ];

  protectionTypes.forEach(function(type) {
    sheet.getProtections(type).forEach(function(protection) {
      try {
        protection.remove();
      } catch (err) {
        Logger.log('Khong go duoc protection tren sheet ' + sheet.getName() + ': ' + err.message);
      }
    });
  });
}
