const CONG_VIEC_FORMULA_TEMPLATE_CELLS_V1 = ['A5', 'D5', 'G5'];

const QLTD_TEMPLATE_CONG_VIEC_30_HEADERS_V1 = [
  'Mã công việc mẫu',
  'WBS',
  'Zone',
  'Loại công trình',
  'Công trình',
  'Hạng mục/Tầng',
  'ID',
  'Công việc / Phạm vi',
  'Chủ trì',
  'Số ngày kế hoạch',
  'Công việc liên kết',
  'Bắt đầu kế hoạch',
  'Kết thúc kế hoạch',
  'Ghi chú',
  'Mã công việc',
  'Mã mốc hệ thống',
  'Lỗi tiền nhiệm',
  'Trạng thái thực hiện',
  'Bắt đầu thực tế',
  'Hoàn thành thực tế',
  'Ghi chú cập nhật',
  'Ngày cập nhật',
  'Điều chỉnh liên kết?',
  '',
  '',
  'WBS_LEVEL_SYS',
  '',
  'Trần chi phí trực tiếp',
  'Dự thu kế hoạch',
  'Trạng thái ngân sách'
];

const QLTD_TEMPLATE_CONG_VIEC_MASTER_SPREADSHEET_BY_SCRIPT_V1 = {
  '1Tx-3JSUug5wvcosVfwjng9KaCJyKf_0s9YB6ZqJWdJQLVBMcEzql3fmI': '1EuIOvxEVT0IIzPq53AY_oBIgHxJI7qqOknkFrcyFwWU',
  '1QKFkAHLYlHxN0tTYQr9K2I66idyYtH8d8QdNxM18s_y4hBxtNKg965b5': '1EZk5YM-P132IkM9TWoKVHAqcajbiKs2O2hgjTWPe8K0',
  '1u4cdaLgra0Rr22Q1KaoLCziaEzsVN_KU3-QmSpFUkkN6w9dkjzQJCXGh': '1vvO54Lqimem-wpAD-O1UNtqcItBk-hDAnzbBVKtO2Js'
};

function menuHoanThienTemplateGocQltdV1() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Hoàn thiện TEMPLATE gốc QLTD',
    'Chức năng này sẽ chuẩn hóa các sheet _TEMPLATE_ để khi tạo bản sao mới không quay về layout cũ. Chức năng chỉ sửa các sheet _TEMPLATE_, không sửa sheet vận hành hiện tại. Tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return 'Đã hủy hoàn thiện TEMPLATE gốc.';

  const message = hoanThienTemplateGocQltdV1_();

  ui.alert('Đã hoàn thiện TEMPLATE gốc', message, ui.ButtonSet.OK);
  SpreadsheetApp.getActiveSpreadsheet().toast('Đã hoàn thiện TEMPLATE gốc.', 'Thiết lập QL tiến độ', 5);

  return message;
}

function hoanThienTemplateGocQltdV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logs = [];

  logs.push(hoanThienTemplateCongViecQltdV1_(ss));
  logs.push(hoanThienTemplateTienDoTongHopQltdV1_(ss));
  logs.push(hoanThienTemplateKeHoachGocQltdV1_(ss));
  logs.push(hoanThienTemplateKeHoachGocHistoryQltdV1_(ss));

  anLaiCacSheetTemplateQltdV1_(ss);
  logs.push('- Đã ẩn lại toàn bộ sheet _TEMPLATE_.');

  const message = logs.join('\n');
  Logger.log(message);
  return message;
}

function hoanThienTemplateCongViecQltdV1_(ss) {
  const sheet = layTemplateBatBuocQltdV1_(ss, '_TEMPLATE_Cong_viec');

  kiemTraDungTemplateCongViec30ColsQltdV1_(sheet);

  boCoDinhDongCotTruocKhiMergeTemplateQltdV1_(sheet);

  damBaoSoCotQltdTemplateV1_(sheet, 30);
  xoaNhomHangTemplateQltdV1_(sheet);

  sheet.getRange(1, 1, 1, 30).breakApart();
  sheet.getRange(1, 1, 1, 30)
    .mergeAcross()
    .setValue('BẢNG TIẾN ĐỘ DỰ ÁN / TEMPLATE')
    .setFontWeight('bold')
    .setFontSize(12)
    .setFontColor('#ffffff')
    .setBackground('#0f172a')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  const maxRows = sheet.getMaxRows();

  // Dòng 5 là dòng mẫu công thức. Không clear dòng 5.
  if (maxRows >= 6) {
    sheet.getRange(6, 1, maxRows - 5, 30).clearContent();
  }

  // Vẫn format từ dòng 5 để dòng mẫu và vùng nhập liệu đẹp.
  if (maxRows >= 5) {
    apDungZebraVaKeBangTemplateQltdV1_(sheet, 5, 1, maxRows - 4, 30);
  }

  chuanHoaCauTrucTemplateCongViec30ColsQltdV1_(sheet);

  sheet.setFrozenRows(4);

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Cấp 1', 'Cấp 2', 'Cấp 3', 'Cấp 4'], true)
    .setAllowInvalid(false)
    .build();

  if (maxRows >= 5) {
    sheet.getRange(5, 2, maxRows - 4, 1).setDataValidation(rule);
  }

  const formulaWarning = canhBaoOCoHamNhungMatFormulaTemplateQltdV1_(sheet);
  const message = '- Đã hoàn thiện _TEMPLATE_Cong_viec: Z=WBS_LEVEL_SYS, AA=cột đệm, AB:AD=ngân sách; chỉ ẩn cột Z.';

  return formulaWarning ? message + '\n' + formulaWarning : message;
}

function migrateTemplateCongViec30ColsV1() {
  const scriptId = ScriptApp.getScriptId();
  const expectedSpreadsheetId = QLTD_TEMPLATE_CONG_VIEC_MASTER_SPREADSHEET_BY_SCRIPT_V1[scriptId];

  if (!expectedSpreadsheetId) {
    throw new Error('Migration bị chặn: Script ID không nằm trong allowlist 3 Master QLTD: ' + scriptId);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const actualSpreadsheetId = ss && ss.getId ? ss.getId() : '';

  if (actualSpreadsheetId !== expectedSpreadsheetId) {
    throw new Error(
      'Migration bị chặn: Spreadsheet ID không khớp. Expected=' +
      expectedSpreadsheetId + ', actual=' + actualSpreadsheetId
    );
  }

  const targetName = '_TEMPLATE_Cong_viec';
  if (targetName === 'Cong_viec') {
    throw new Error('Migration bị chặn vì target trỏ vào sheet vận hành Cong_viec.');
  }

  const sheet = ss.getSheetByName(targetName);
  if (!sheet) {
    throw new Error('Không tìm thấy sheet bắt buộc: ' + targetName);
  }

  kiemTraDungTemplateCongViec30ColsQltdV1_(sheet);

  const before = docTrangThaiTemplateCongViec30ColsQltdV1_(sheet);
  Logger.log('migrateTemplateCongViec30ColsV1 BEFORE ' + JSON.stringify(before));

  chuanHoaCauTrucTemplateCongViec30ColsQltdV1_(sheet);

  const after = docTrangThaiTemplateCongViec30ColsQltdV1_(sheet);
  Logger.log('migrateTemplateCongViec30ColsV1 AFTER ' + JSON.stringify(after));

  CONG_VIEC_FORMULA_TEMPLATE_CELLS_V1.forEach(function(a1) {
    if (before.formulas[a1] !== after.formulas[a1]) {
      throw new Error('Migration bị chặn: công thức ' + a1 + ' đã thay đổi ngoài dự kiến.');
    }
  });

  return JSON.stringify({
    ok: true,
    scriptId: scriptId,
    spreadsheetId: actualSpreadsheetId,
    sheet: targetName,
    before: before,
    after: after
  });
}

function chuanHoaCauTrucTemplateCongViec30ColsQltdV1_(sheet) {
  kiemTraDungTemplateCongViec30ColsQltdV1_(sheet);
  damBaoSoCotQltdTemplateV1_(sheet, 30);

  sheet.getRange(4, 1, 1, 30).setValues([QLTD_TEMPLATE_CONG_VIEC_30_HEADERS_V1]);
  dinhDangHeaderBangTemplateQltdV1_(sheet.getRange(4, 1, 1, 30));

  const widths = {
    1: 120, 2: 90, 3: 90, 4: 120, 5: 140, 6: 140, 7: 70, 8: 360,
    9: 130, 10: 100, 11: 160, 12: 120, 13: 120, 14: 180, 15: 120,
    16: 120, 17: 160, 18: 140, 19: 120, 20: 120, 21: 220, 22: 120,
    23: 180, 26: 120, 27: 14, 28: 150, 29: 135, 30: 145
  };

  Object.keys(widths).forEach(function(col) {
    sheet.setColumnWidth(Number(col), widths[col]);
  });

  const maxRows = sheet.getMaxRows();
  if (maxRows >= 5) {
    const numRows = maxRows - 4;
    thietLapDropdownTemplateCongViec30ColsQltdV1_(sheet, 5, numRows);

    sheet.getRange(5, 28, numRows, 2)
      .setNumberFormat('#,##0')
      .setHorizontalAlignment('right');
  }

  sheet.hideColumns(26);
  sheet.showColumns(27, 4);
}

function thietLapDropdownTemplateCongViec30ColsQltdV1_(sheet, startRow, numRows) {
  if (!sheet || numRows <= 0) return;

  const linkRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Có', 'Không'], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(startRow, 23, numRows, 1)
    .setDataValidation(linkRule)
    .setHorizontalAlignment('center');

  const budgetStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Nháp', 'Đã chốt', 'Khóa'], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(startRow, 30, numRows, 1)
    .setDataValidation(budgetStatusRule)
    .setHorizontalAlignment('center');
}

function kiemTraDungTemplateCongViec30ColsQltdV1_(sheet) {
  const actualName = sheet && sheet.getName ? sheet.getName() : '';
  if (actualName !== '_TEMPLATE_Cong_viec' || actualName === 'Cong_viec') {
    throw new Error(
      'Chỉ được phép xử lý _TEMPLATE_Cong_viec; target hiện tại=' + (actualName || '(không xác định)')
    );
  }
}

function docTrangThaiTemplateCongViec30ColsQltdV1_(sheet) {
  const formulas = {};
  CONG_VIEC_FORMULA_TEMPLATE_CELLS_V1.forEach(function(a1) {
    formulas[a1] = String(sheet.getRange(a1).getFormula() || '');
  });

  const headerValues = sheet.getRange(4, 1, 1, Math.min(sheet.getMaxColumns(), 30)).getValues()[0];

  return {
    maxColumns: sheet.getMaxColumns(),
    headerW: headerValues[22] || '',
    headersABAD: [headerValues[27] || '', headerValues[28] || '', headerValues[29] || ''],
    formulas: formulas
  };
}

function hoanThienTemplateTienDoTongHopQltdV1_(ss) {
  const sheet = layTemplateBatBuocQltdV1_(ss, '_TEMPLATE_Tien_do_tong_hop');

  boCoDinhDongCotTruocKhiMergeTemplateQltdV1_(sheet);

  damBaoSoCotQltdTemplateV1_(sheet, 52);
  xoaNhomHangTemplateQltdV1_(sheet);

  const maxRows = sheet.getMaxRows();
  const maxCols = sheet.getMaxColumns();

  sheet.getRange(1, 1, maxRows, maxCols).breakApart();

  // Dọn toàn bộ vùng template để không còn layout A:H/I cũ.
  sheet.getRange(1, 1, maxRows, maxCols).clearContent().clearFormat().clearNote();

  sheet.getRange(1, 1, 1, 9)
    .mergeAcross()
    .setValue('TIẾN ĐỘ TỔNG HỢP / GANTT VIEW')
    .setFontWeight('bold')
    .setFontSize(12)
    .setFontColor('#ffffff')
    .setBackground('#0f172a')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  sheet.getRange(2, 1, 1, 8).setValues([[
    'Từ ngày',
    '',
    'Đến ngày',
    '',
    'Số tuần',
    '',
    'Cập nhật',
    ''
  ]]);

  sheet.getRange(2, 1, 1, 8)
    .setFontWeight('bold')
    .setFontSize(9)
    .setBackground('#e5e7eb')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.getRange(3, 1, 1, 9)
    .clearContent()
    .setBackground('#f8fafc');

  sheet.getRange(4, 1, 1, 9).setValues([[
    'WBS',
    'ID',
    'Công việc / Phạm vi',
    'Chủ trì',
    'Số ngày kế hoạch',
    'Công việc liên kết',
    'Bắt đầu hiện hành',
    'Kết thúc hiện hành',
    'Ghi chú cập nhật'
  ]]);

  dinhDangHeaderBangTemplateQltdV1_(sheet.getRange(4, 1, 1, 9));

  if (maxRows >= 5) {
    apDungZebraVaKeBangTemplateQltdV1_(sheet, 5, 1, maxRows - 4, 9);
  }

  const ganttGridEndCol = Math.max(52, maxCols);
  sheet.getRange(3, 10, Math.min(Math.max(maxRows - 2, 1), 120), ganttGridEndCol - 9)
    .setBorder(true, true, true, true, true, true, '#edf2f7', SpreadsheetApp.BorderStyle.SOLID);

  sheet.setFrozenRows(4);
  sheet.setFrozenColumns(9);

  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 55);
  sheet.setColumnWidth(3, 360);
  sheet.setColumnWidth(4, 105);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 135);
  sheet.setColumnWidth(7, 110);
  sheet.setColumnWidth(8, 110);
  sheet.setColumnWidth(9, 220);

  for (let col = 10; col <= Math.min(sheet.getMaxColumns(), 80); col++) {
    sheet.setColumnWidth(col, 28);
  }

  return '- Đã hoàn thiện _TEMPLATE_Tien_do_tong_hop: A=WBS, B=ID, I=Ghi chú cập nhật, Gantt bắt đầu từ J.';
}

function hoanThienTemplateKeHoachGocQltdV1_(ss) {
  const sheet = layTemplateBatBuocQltdV1_(ss, '_TEMPLATE_Ke_hoach_goc');

  boCoDinhDongCotTruocKhiMergeTemplateQltdV1_(sheet);

  damBaoSoCotQltdTemplateV1_(sheet, 14);
  xoaNhomHangTemplateQltdV1_(sheet);

  const maxRows = sheet.getMaxRows();

  sheet.getRange(1, 1, 1, 14).breakApart();
  sheet.getRange(1, 1, 1, 14)
    .mergeAcross()
    .setValue('KẾ HOẠCH GỐC / BASELINE ACTIVE')
    .setFontWeight('bold')
    .setFontSize(12)
    .setFontColor('#ffffff')
    .setBackground('#374151')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  sheet.getRange(2, 1, 1, 9).setValues([[
    'Phiên bản',
    '',
    'Ngày chốt',
    '',
    'Loại',
    '',
    'Số việc',
    '',
    'ACTIVE'
  ]]);

  sheet.getRange(4, 1, 1, 14).setValues([[
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
  ]]);

  if (maxRows >= 5) {
    sheet.getRange(5, 1, maxRows - 4, 14).clearContent();
  }

  dinhDangHeaderBangTemplateQltdV1_(sheet.getRange(4, 1, 1, 14));

  if (maxRows >= 5) {
    apDungZebraVaKeBangTemplateQltdV1_(sheet, 5, 1, maxRows - 4, 14);
  }

  sheet.setFrozenRows(4);

  return '- Đã hoàn thiện _TEMPLATE_Ke_hoach_goc.';
}

function hoanThienTemplateKeHoachGocHistoryQltdV1_(ss) {
  const sheet = layTemplateBatBuocQltdV1_(ss, '_TEMPLATE_Ke_hoach_goc_history');

  boCoDinhDongCotTruocKhiMergeTemplateQltdV1_(sheet);

  damBaoSoCotQltdTemplateV1_(sheet, 6);
  xoaNhomHangTemplateQltdV1_(sheet);

  const maxRows = sheet.getMaxRows();

  sheet.getRange(1, 1, 1, 6).setValues([[
    'Mã baseline',
    'Tên sheet lưu trữ',
    'Trạng thái',
    'Ngày lưu',
    'Số dòng công việc',
    'Ghi chú'
  ]]);

  if (maxRows >= 2) {
    sheet.getRange(2, 1, maxRows - 1, 6).clearContent();
  }

  dinhDangHeaderBangTemplateQltdV1_(sheet.getRange(1, 1, 1, 6));

  if (maxRows >= 2) {
    apDungZebraVaKeBangTemplateQltdV1_(sheet, 2, 1, maxRows - 1, 6);
  }

  sheet.setFrozenRows(1);

  return '- Đã hoàn thiện _TEMPLATE_Ke_hoach_goc_history.';
}

function layTemplateBatBuocQltdV1_(ss, name) {
  const sheet = ss.getSheetByName(name);

  if (!sheet) {
    throw new Error('Không tìm thấy sheet template bắt buộc: ' + name);
  }

  return sheet;
}

function damBaoSoCotQltdTemplateV1_(sheet, minCols) {
  const current = sheet.getMaxColumns();

  if (current < minCols) {
    sheet.insertColumnsAfter(current, minCols - current);
  }
}

function xoaNhomHangTemplateQltdV1_(sheet) {
  const maxRows = sheet.getMaxRows();

  for (let i = 0; i < 6; i++) {
    try {
      sheet.getRange(1, 1, maxRows, 1).shiftRowGroupDepth(-1);
    } catch (err) {
      Logger.log('Dừng xóa group template tại vòng ' + (i + 1) + ': ' + err.message);
      break;
    }
  }
}

function boCoDinhDongCotTruocKhiMergeTemplateQltdV1_(sheet) {
  try {
    if (sheet.getFrozenRows && sheet.getFrozenRows() > 0) {
      sheet.setFrozenRows(0);
    }

    if (sheet.getFrozenColumns && sheet.getFrozenColumns() > 0) {
      sheet.setFrozenColumns(0);
    }

    SpreadsheetApp.flush();
  } catch (err) {
    Logger.log('Không bỏ được frozen rows/columns trước khi merge template: ' + err.message);
  }
}

function anLaiCacSheetTemplateQltdV1_(ss) {
  const templateNames = [
    '_TEMPLATE_Cong_viec',
    '_TEMPLATE_Tien_do_tong_hop',
    '_TEMPLATE_Ke_hoach_goc',
    '_TEMPLATE_Ke_hoach_goc_history'
  ];

  chonSheetVanHanhAnToanTruocKhiAnTemplateQltdV1_(ss);

  templateNames.forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;

    try {
      sheet.hideSheet();
    } catch (err) {
      Logger.log('Không ẩn được sheet template ' + name + ': ' + err.message);
    }
  });
}

function chonSheetVanHanhAnToanTruocKhiAnTemplateQltdV1_(ss) {
  const preferred = [
    'Cong_viec',
    'Tien_do_tong_hop',
    'Cau_hinh',
    'Danh_muc_du_an'
  ];

  for (let i = 0; i < preferred.length; i++) {
    const sheet = ss.getSheetByName(preferred[i]);
    if (sheet && !sheet.isSheetHidden()) {
      ss.setActiveSheet(sheet);
      return;
    }
  }

  const fallback = ss.getSheets().find(function(sheet) {
    return !sheet.isSheetHidden() && sheet.getName().indexOf('_TEMPLATE_') !== 0;
  });

  if (fallback) {
    ss.setActiveSheet(fallback);
  }
}

function apDungZebraVaKeBangTemplateQltdV1_(sheet, startRow, startCol, numRows, numCols) {
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

function dinhDangHeaderBangTemplateQltdV1_(range) {
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

function canhBaoOCoHamNhungMatFormulaTemplateQltdV1_(sheet) {
  const missing = [];

  CONG_VIEC_FORMULA_TEMPLATE_CELLS_V1.forEach(function(a1) {
    const formula = String(sheet.getRange(a1).getFormula() || '').trim();

    if (!formula) {
      missing.push(a1);
    }
  });

  if (missing.length === 0) return '';

  return 'CẢNH BÁO: Các ô công thức mẫu đang mất công thức: ' + missing.join(', ');
}
