/*******************************************************
 * FILE: 08_setup_new_copy.js
 *
 * MUC TIEU
 * - Khi tao ban sao moi:
 *   1) Xoa sheet van hanh/du lieu du an cu.
 *   2) Tao lai sheet van hanh moi tu cac sheet _TEMPLATE_.
 *   3) Giu nguyen cac sheet _TEMPLATE_ de sau nay tiep tuc nhan ban.
 *   4) Khong anh huong Apps Script/ham trong file.
 *******************************************************/

const SETUP_TEMPLATE_SHEETS_V1 = [
  { templateName: '_TEMPLATE_Cong_viec', targetName: 'Cong_viec' },
  { templateName: '_TEMPLATE_Tien_do_tong_hop', targetName: 'Tien_do_tong_hop' },
  { templateName: '_TEMPLATE_Ke_hoach_goc', targetName: 'Ke_hoach_goc' },
  { templateName: '_TEMPLATE_Ke_hoach_goc_history', targetName: 'Ke_hoach_goc_history' }
];

const CONG_VIEC_FORMULA_TEMPLATE_CELLS_SETUP_V1 = ['A5', 'D5', 'G5'];
const QLTD_TEMP_SAFE_DELETE_SHEET_V1 = '_QLTD_TEMP_SAFE_DELETE';

function menuXoaDuLieuCuVaTaoMoiTuTemplateV1() {
  const ui = SpreadsheetApp.getUi();

  const confirm1 = ui.alert(
    'Xóa dữ liệu cũ và tạo lại từ TEMPLATE',
    'Chức năng này sẽ:\n\n' +
    '1. XÓA HẲN các sheet vận hành cũ nếu đang tồn tại:\n' +
    '- Cong_viec\n' +
    '- Tien_do_tong_hop\n' +
    '- Ke_hoach_goc\n' +
    '- Ke_hoach_goc_history\n\n' +
    '2. XÓA các sheet snapshot KH gốc cũ dạng KH_goc_BL...\n\n' +
    '3. TẠO LẠI 4 sheet vận hành mới từ sheet _TEMPLATE_ tương ứng.\n\n' +
    'Các sheet _TEMPLATE_ được giữ nguyên, không bị sửa/xóa/clear.\n' +
    'Apps Script/hàm trong file cũng được giữ nguyên.\n\n' +
    'Chỉ chạy sau khi đã tạo bản sao file mẫu. Tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (confirm1 !== ui.Button.YES) return 'Người dùng hủy xác nhận lần 1.';

  const prompt = ui.prompt(
    'Xác nhận lần 2',
    'Nhập chính xác: TAO MOI TU TEMPLATE',
    ui.ButtonSet.OK_CANCEL
  );

  if (prompt.getSelectedButton() !== ui.Button.OK) return 'Người dùng hủy xác nhận lần 2.';

  const input = String(prompt.getResponseText() || '').trim().toUpperCase();

  if (input !== 'TAO MOI TU TEMPLATE') {
    ui.alert(
      'Không thực hiện',
      'Nội dung xác nhận không đúng. Hệ thống chưa xóa/tạo lại sheet.',
      ui.ButtonSet.OK
    );
    return 'Xác nhận không đúng. Không thực hiện.';
  }

  const result = xoaDuLieuCuVaTaoMoiTuTemplateV1();

  ui.alert('Đã hoàn thành', result, ui.ButtonSet.OK);

  return result;
}

function xoaDuLieuCuVaTaoMoiTuTemplateV1() {
  const snapshotResult = xoaSheetSnapshotKeHoachGocCuNoConfirmV1_();
  const result = taoSheetVanHanhTuTemplateCoreV1_(true);

  xoaTrangThaiTinhLaiSauKhiXoaDuLieuSetupV1_();

  const message =
    snapshotResult + '\n\n' +
    result + '\n\n' +
    'Đã xóa trạng thái cần tính lại nếu có.\n' +
    'Các sheet _TEMPLATE_ được giữ nguyên. Apps Script/hàm trong file không bị ảnh hưởng.';

  Logger.log(message);
  return message;
}

function taoSheetVanHanhTuTemplateV1() {
  return taoSheetVanHanhTuTemplateCoreV1_(false);
}

function taoSheetVanHanhTuTemplateCoreV1_(replaceExisting) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logs = [];
  let safeDeleteContext = null;

  if (replaceExisting) {
    kiemTraDuTemplateTruocKhiResetQltdV1_(ss);
    safeDeleteContext = chonSheetAnToanTruocKhiXoaSheetVanHanhV1_(ss);

    SETUP_TEMPLATE_SHEETS_V1.forEach(function(item) {
      const existingTarget = ss.getSheetByName(item.targetName);

      if (existingTarget) {
        ss.deleteSheet(existingTarget);
        logs.push('- Đã xóa sheet vận hành cũ: ' + item.targetName);
      }
    });

    SpreadsheetApp.flush();
  }

  SETUP_TEMPLATE_SHEETS_V1.forEach(function(item) {
    const templateSheet = ss.getSheetByName(item.templateName);

    if (!templateSheet) {
      logs.push('- Thiếu template: ' + item.templateName);
      return;
    }

    const existingTarget = ss.getSheetByName(item.targetName);

    if (existingTarget && !replaceExisting) {
      logs.push('- Đã có sheet "' + item.targetName + '", bỏ qua tạo mới.');
      return;
    }

    if (existingTarget && replaceExisting) {
      logs.push('- Sheet "' + item.targetName + '" vẫn còn sau bước xóa, bỏ qua để tránh trùng.');
      return;
    }

    const newSheet = templateSheet.copyTo(ss);
    newSheet.setName(item.targetName);

    try {
      newSheet.showSheet();
    } catch (err) {
      Logger.log('Không show được sheet vận hành mới ' + item.targetName + ': ' + err.message);
    }

    dinhDangSheetVanHanhSauCopyTemplateV1_(newSheet, item.targetName);
    const formulaWarning = canhBaoOCoHamNhungMatFormulaSauSetupV1_(newSheet);
    if (formulaWarning) logs.push(formulaWarning);

    ss.setActiveSheet(newSheet);
    ss.moveActiveSheet(Math.min(templateSheet.getIndex() + 1, ss.getNumSheets()));

    logs.push('- Đã tạo sheet "' + item.targetName + '" từ "' + item.templateName + '".');
  });

  anLaiCacSheetTemplateSauSetupV1_(ss);

  const congViec = ss.getSheetByName('Cong_viec');
  if (congViec) {
    ss.setActiveSheet(congViec);
  }

  xoaSheetTamAnToanSauResetQltdV1_(ss, safeDeleteContext, logs);

  SpreadsheetApp.flush();
  donSheetTamAnToanConSotSauResetQltdV1_(ss, logs);

  const activeCongViec = ss.getSheetByName('Cong_viec');
  if (activeCongViec) {
    ss.setActiveSheet(activeCongViec);
  }

  const message = logs.join('\n');
  Logger.log(message);
  return message;
}

function chonSheetAnToanTruocKhiXoaSheetVanHanhV1_(ss) {
  const targetNames = SETUP_TEMPLATE_SHEETS_V1.map(function(item) {
    return item.targetName;
  });

  const preferred = [
    'Cau_hinh',
    'Danh_muc_du_an',
    'Danh_muc_cong_viec'
  ];

  for (let i = 0; i < preferred.length; i++) {
    const sheet = ss.getSheetByName(preferred[i]);
    if (sheet && !sheet.isSheetHidden() && targetNames.indexOf(sheet.getName()) === -1) {
      ss.setActiveSheet(sheet);
      return {
        sheet: sheet,
        createdTemp: false
      };
    }
  }

  const fallback = ss.getSheets().find(function(sheet) {
    return !sheet.isSheetHidden() &&
      targetNames.indexOf(sheet.getName()) === -1 &&
      sheet.getName().indexOf('_TEMPLATE_') !== 0;
  });

  if (fallback) {
    ss.setActiveSheet(fallback);
    return {
      sheet: fallback,
      createdTemp: false
    };
  }

  let tempSheet = ss.getSheetByName(QLTD_TEMP_SAFE_DELETE_SHEET_V1);

  if (!tempSheet) {
    tempSheet = ss.insertSheet(QLTD_TEMP_SAFE_DELETE_SHEET_V1);
  }

  try {
    tempSheet.showSheet();
  } catch (err) {
    Logger.log('Không show được sheet tạm an toàn: ' + err.message);
  }

  ss.setActiveSheet(tempSheet);

  return {
    sheet: tempSheet,
    createdTemp: true
  };
}

function kiemTraDuTemplateTruocKhiResetQltdV1_(ss) {
  const missing = SETUP_TEMPLATE_SHEETS_V1
    .map(function(item) {
      return item.templateName;
    })
    .filter(function(templateName) {
      return !ss.getSheetByName(templateName);
    });

  if (missing.length > 0) {
    throw new Error(
      'Không thể reset từ TEMPLATE vì thiếu sheet template: ' + missing.join(', ') +
      '. Hệ thống chưa xóa sheet vận hành cũ.'
    );
  }
}

function xoaSheetTamAnToanSauResetQltdV1_(ss, safeDeleteContext, logs) {
  if (!safeDeleteContext || !safeDeleteContext.createdTemp) return;

  const tempSheet = ss.getSheetByName(QLTD_TEMP_SAFE_DELETE_SHEET_V1);
  if (!tempSheet) return;

  const congViec = ss.getSheetByName('Cong_viec');
  if (congViec) {
    ss.setActiveSheet(congViec);
  }

  try {
    ss.deleteSheet(tempSheet);
    logs.push('- Đã xóa sheet tạm an toàn sau reset.');
  } catch (err) {
    logs.push('- Không xóa được sheet tạm an toàn: ' + err.message);
  }
}

function donSheetTamAnToanConSotSauResetQltdV1_(ss, logs) {
  const tempSheet = ss.getSheetByName(QLTD_TEMP_SAFE_DELETE_SHEET_V1);
  if (!tempSheet) return;

  const congViec = ss.getSheetByName('Cong_viec');
  if (congViec) {
    try {
      congViec.showSheet();
      ss.setActiveSheet(congViec);
      SpreadsheetApp.flush();
    } catch (err) {
      Logger.log('Không active được Cong_viec trước khi dọn sheet tạm: ' + err.message);
    }
  }

  try {
    ss.deleteSheet(tempSheet);
    logs.push('- Đã dọn sheet tạm an toàn còn sót sau reset.');
  } catch (err) {
    try {
      tempSheet.hideSheet();
      logs.push('- Không xóa được sheet tạm, đã ẩn lại: ' + err.message);
    } catch (hideErr) {
      logs.push('- Không xóa/ẩn được sheet tạm: ' + err.message + ' / ' + hideErr.message);
    }
  }
}

function anLaiCacSheetTemplateSauSetupV1_(ss) {
  SETUP_TEMPLATE_SHEETS_V1.forEach(function(item) {
    const templateSheet = ss.getSheetByName(item.templateName);
    if (!templateSheet) return;

    try {
      templateSheet.hideSheet();
    } catch (err) {
      Logger.log('Không ẩn được template sau setup ' + item.templateName + ': ' + err.message);
    }
  });
}

function dinhDangSheetVanHanhSauCopyTemplateV1_(sheet, targetName) {
  if (!sheet || !targetName) return;

  if (targetName === 'Cong_viec') {
    dinhDangCongViecVanHanhSauCopyTemplateV1_(sheet);
    return;
  }

  if (targetName === 'Tien_do_tong_hop') {
    dinhDangTienDoTongHopVanHanhSauCopyTemplateV1_(sheet);
    return;
  }

  if (targetName === 'Ke_hoach_goc') {
    dinhDangKeHoachGocVanHanhSauCopyTemplateV1_(sheet);
    return;
  }

  if (targetName === 'Ke_hoach_goc_history') {
    dinhDangKeHoachGocHistoryVanHanhSauCopyTemplateV1_(sheet);
  }
}

function dinhDangCongViecVanHanhSauCopyTemplateV1_(sheet) {
  const maxRows = sheet.getMaxRows();

  sheet.getRange(1, 1, 1, 26)
    .breakApart()
    .mergeAcross()
    .setValue('BẢNG TIẾN ĐỘ DỰ ÁN')
    .setFontWeight('bold')
    .setFontSize(12)
    .setFontColor('#ffffff')
    .setBackground('#0f172a')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  dinhDangHeaderBangVanHanhSauCopyV1_(sheet.getRange(4, 1, 1, 26));

  if (maxRows >= 5) {
    const bodyRows = maxRows - 4;

    apDungZebraVaKeBangVanHanhSauCopyV1_(sheet, 5, 1, bodyRows, 26);

    // Wrap các cột dài.
    sheet.getRange(5, 8, bodyRows, 1).setWrap(true);   // H - Công việc / Phạm vi
    sheet.getRange(5, 11, bodyRows, 1).setWrap(true);  // K - Công việc liên kết
    sheet.getRange(5, 14, bodyRows, 1).setWrap(true);  // N - Ghi chú
    sheet.getRange(5, 21, bodyRows, 1).setWrap(true);  // U - Ghi chú cập nhật

    // Căn giữa các cột mã/ngày/trạng thái.
    sheet.getRange(5, 2, bodyRows, 1).setHorizontalAlignment('center');  // B - WBS
    sheet.getRange(5, 7, bodyRows, 1).setHorizontalAlignment('center');  // G - ID
    sheet.getRange(5, 10, bodyRows, 1).setHorizontalAlignment('center'); // J
    sheet.getRange(5, 12, bodyRows, 2).setHorizontalAlignment('center').setNumberFormat('dd/MM/yyyy'); // L:M
    sheet.getRange(5, 19, bodyRows, 2).setHorizontalAlignment('center').setNumberFormat('dd/MM/yyyy'); // S:T
    sheet.getRange(5, 22, bodyRows, 1).setHorizontalAlignment('center').setNumberFormat('dd/MM/yyyy'); // V
  }

  // Column width chuẩn.
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 140);
  sheet.setColumnWidth(6, 140);
  sheet.setColumnWidth(7, 70);
  sheet.setColumnWidth(8, 360);
  sheet.setColumnWidth(9, 130);
  sheet.setColumnWidth(10, 100);
  sheet.setColumnWidth(11, 160);
  sheet.setColumnWidth(12, 120);
  sheet.setColumnWidth(13, 120);
  sheet.setColumnWidth(14, 180);
  sheet.setColumnWidth(15, 120);
  sheet.setColumnWidth(16, 120);
  sheet.setColumnWidth(17, 160);
  sheet.setColumnWidth(18, 140);
  sheet.setColumnWidth(19, 120);
  sheet.setColumnWidth(20, 120);
  sheet.setColumnWidth(21, 220);
  sheet.setColumnWidth(22, 120);
  sheet.setColumnWidth(23, 180);
  sheet.setColumnWidth(26, 120);

  sheet.setFrozenRows(4);

  try {
    sheet.hideColumns(26);
  } catch (err) {
    Logger.log('Không ẩn được cột Z Cong_viec sau copy template: ' + err.message);
  }
}

function dinhDangTienDoTongHopVanHanhSauCopyTemplateV1_(sheet) {
  const maxRows = sheet.getMaxRows();
  const maxCols = sheet.getMaxColumns();
  const leftCols = 9;
  const ganttStartCol = 10;

  sheet.getRange(1, 1, 1, leftCols)
    .breakApart()
    .mergeAcross()
    .setValue('TIẾN ĐỘ TỔNG HỢP / GANTT VIEW')
    .setFontWeight('bold')
    .setFontSize(12)
    .setFontColor('#ffffff')
    .setBackground('#0f172a')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  sheet.getRange(2, 1, 1, 8)
    .setFontWeight('bold')
    .setFontSize(9)
    .setFontColor('#111827')
    .setBackground('#e5e7eb')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);

  dinhDangHeaderBangVanHanhSauCopyV1_(sheet.getRange(4, 1, 1, leftCols));

  if (maxRows >= 5) {
    const bodyRows = maxRows - 4;

    apDungZebraVaKeBangVanHanhSauCopyV1_(sheet, 5, 1, bodyRows, leftCols);

    sheet.getRange(5, 1, bodyRows, 2).setHorizontalAlignment('center');
    sheet.getRange(5, 3, bodyRows, 1).setWrap(true);
    sheet.getRange(5, 4, bodyRows, 1).setHorizontalAlignment('center');
    sheet.getRange(5, 5, bodyRows, 1).setHorizontalAlignment('center');
    sheet.getRange(5, 6, bodyRows, 1).setWrap(true).setHorizontalAlignment('center');
    sheet.getRange(5, 7, bodyRows, 2).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center');
    sheet.getRange(5, 9, bodyRows, 1).setWrap(true);

    // Gantt vùng trống từ J trở đi vẫn có grid nhẹ để người dùng thấy khu vực thao tác.
    if (maxCols >= ganttStartCol) {
      sheet.getRange(3, ganttStartCol, Math.min(maxRows - 2, 120), maxCols - ganttStartCol + 1)
        .setBorder(true, true, true, true, true, true, '#edf2f7', SpreadsheetApp.BorderStyle.SOLID);
    }
  }

  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 55);
  sheet.setColumnWidth(3, 360);
  sheet.setColumnWidth(4, 105);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 135);
  sheet.setColumnWidth(7, 110);
  sheet.setColumnWidth(8, 110);
  sheet.setColumnWidth(9, 220);

  for (let col = 10; col <= Math.min(maxCols, 80); col++) {
    sheet.setColumnWidth(col, 28);
  }

  sheet.setFrozenRows(4);
  sheet.setFrozenColumns(9);
}

function dinhDangKeHoachGocVanHanhSauCopyTemplateV1_(sheet) {
  const maxRows = sheet.getMaxRows();

  sheet.getRange(1, 1, 1, 14)
    .breakApart()
    .mergeAcross()
    .setValue('KẾ HOẠCH GỐC / BASELINE ACTIVE')
    .setFontWeight('bold')
    .setFontSize(12)
    .setFontColor('#ffffff')
    .setBackground('#374151')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  dinhDangHeaderBangVanHanhSauCopyV1_(sheet.getRange(4, 1, 1, 14));

  if (maxRows >= 5) {
    apDungZebraVaKeBangVanHanhSauCopyV1_(sheet, 5, 1, maxRows - 4, 14);
  }

  sheet.setFrozenRows(4);
}

function dinhDangKeHoachGocHistoryVanHanhSauCopyTemplateV1_(sheet) {
  const maxRows = sheet.getMaxRows();

  dinhDangHeaderBangVanHanhSauCopyV1_(sheet.getRange(1, 1, 1, 6));

  if (maxRows >= 2) {
    apDungZebraVaKeBangVanHanhSauCopyV1_(sheet, 2, 1, maxRows - 1, 6);
  }

  sheet.setFrozenRows(1);
}

function apDungZebraVaKeBangVanHanhSauCopyV1_(sheet, startRow, startCol, numRows, numCols) {
  if (!sheet || numRows <= 0 || numCols <= 0) return;

  const range = sheet.getRange(startRow, startCol, numRows, numCols);

  range
    .setFontColor('#111827')
    .setFontSize(9)
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);

  const zebraRows = Math.min(numRows, 300);
  for (let i = 0; i < zebraRows; i++) {
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    sheet.getRange(startRow + i, startCol, 1, numCols).setBackground(bg);
  }

  if (numRows > zebraRows) {
    sheet.getRange(startRow + zebraRows, startCol, numRows - zebraRows, numCols)
      .setBackground('#ffffff');
  }
}

function dinhDangHeaderBangVanHanhSauCopyV1_(range) {
  range
    .setFontWeight('bold')
    .setFontSize(9)
    .setFontColor('#ffffff')
    .setBackground('#1f4e79')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true)
    .setBorder(true, true, true, true, true, true, '#94a3b8', SpreadsheetApp.BorderStyle.SOLID);
}

function canhBaoOCoHamNhungMatFormulaSauSetupV1_(sheet) {
  if (!sheet || sheet.getName() !== 'Cong_viec') return '';

  const missing = [];

  CONG_VIEC_FORMULA_TEMPLATE_CELLS_SETUP_V1.forEach(function(a1) {
    const formula = String(sheet.getRange(a1).getFormula() || '').trim();

    if (!formula) {
      missing.push(a1);
    }
  });

  if (missing.length === 0) return '';

  return '- CẢNH BÁO: Các ô công thức mẫu đang mất công thức sau setup: ' + missing.join(', ');
}

function xoaSheetSnapshotKeHoachGocCuNoConfirmV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const deleted = [];

  sheets.forEach(function(sheet) {
    const name = sheet.getName();

    if (!/^KH_goc_BL\d{3,}(_\d{8})?$/.test(name)) return;

    try {
      ss.deleteSheet(sheet);
      deleted.push(name);
    } catch (err) {
      Logger.log('Không xóa được snapshot ' + name + ': ' + err.message);
    }
  });

  if (deleted.length === 0) {
    return 'Không có sheet snapshot KH gốc cũ cần xóa.';
  }

  return 'Đã xóa sheet snapshot KH gốc cũ: ' + deleted.join(', ');
}

function menuXoaSheetSnapshotKeHoachGocCuV1() {
  const ui = SpreadsheetApp.getUi();
  const snapshots = layDanhSachSheetSnapshotKeHoachGocV1_();

  if (snapshots.length === 0) {
    ui.alert(
      'Không có sheet snapshot',
      'Không tìm thấy sheet snapshot kế hoạch gốc có tiền tố KH_goc_BL.',
      ui.ButtonSet.OK
    );
    return 'Không có sheet snapshot để xóa.';
  }

  const confirm1 = ui.alert(
    'Xóa sheet snapshot kế hoạch gốc cũ',
    'Sẽ xóa các sheet snapshot sau:\n\n' +
    snapshots.join('\n') +
    '\n\nThao tác này không thể hoàn tác. Tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (confirm1 !== ui.Button.YES) return 'Người dùng hủy xóa snapshot.';

  const prompt = ui.prompt(
    'Xác nhận xóa snapshot',
    'Nhập chính xác: XOA SNAPSHOT',
    ui.ButtonSet.OK_CANCEL
  );

  if (prompt.getSelectedButton() !== ui.Button.OK) return 'Người dùng hủy xác nhận xóa snapshot.';

  const input = String(prompt.getResponseText() || '').trim().toUpperCase();

  if (input !== 'XOA SNAPSHOT') {
    ui.alert('Không xóa snapshot', 'Nội dung xác nhận không đúng.', ui.ButtonSet.OK);
    return 'Xác nhận không đúng. Không xóa snapshot.';
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const deleted = [];

  snapshots.forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      ss.deleteSheet(sheet);
      deleted.push(name);
    }
  });

  const message = 'Đã xóa sheet snapshot:\n' + deleted.join('\n');
  Logger.log(message);
  ui.alert('Đã xóa snapshot', message, ui.ButtonSet.OK);

  return message;
}

function layDanhSachSheetSnapshotKeHoachGocV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  return ss.getSheets()
    .map(function(sheet) { return sheet.getName(); })
    .filter(function(name) {
      return name.indexOf('KH_goc_BL') === 0;
    });
}

function xoaTrangThaiTinhLaiSauKhiXoaDuLieuSetupV1_() {
  if (typeof xoaCoTinhLaiTienDoV1_ === 'function') {
    xoaCoTinhLaiTienDoV1_();
    return;
  }

  const props = PropertiesService.getDocumentProperties();
  props.deleteProperty('SCHEDULE_NEED_RECALC_V1');
  props.deleteProperty('SCHEDULE_NEED_RECALC_REASON_V1');
  props.deleteProperty('SCHEDULE_NEED_RECALC_MARKED_AT_V1');
  props.deleteProperty('SCHEDULE_NEED_RECALC_MARKED_BY_V1');
  props.deleteProperty('SCHEDULE_NEED_RECALC_DETAIL_V1');
  props.deleteProperty('SCHEDULE_NEED_RECALC_RANGE_A1_V1');
  props.deleteProperty('SCHEDULE_NEED_RECALC_COLUMNS_V1');
}

function kiemTraSheetBatBuocQLTDV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const required = [
    'Cong_viec',
    'Tien_do_tong_hop',
    'Ke_hoach_goc',
    'Ke_hoach_goc_history',
    'Cau_hinh'
  ];

  const missing = required.filter(function(name) {
    return !ss.getSheetByName(name);
  });

  const message = missing.length
    ? 'Thiếu sheet bắt buộc:\n' + missing.join('\n')
    : 'Đủ sheet bắt buộc.';

  Logger.log(message);
  SpreadsheetApp.getUi().alert(
    'Kiểm tra sheet bắt buộc',
    message,
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return message;
}
