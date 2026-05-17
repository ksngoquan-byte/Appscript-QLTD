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

  boCoDinhDongCotTruocKhiMergeTemplateQltdV1_(sheet);

  damBaoSoCotQltdTemplateV1_(sheet, 26);
  xoaNhomHangTemplateQltdV1_(sheet);

  sheet.getRange(1, 1, 1, 26).breakApart();
  sheet.getRange(1, 1, 1, 26)
    .mergeAcross()
    .setValue('BẢNG TIẾN ĐỘ DỰ ÁN / TEMPLATE')
    .setFontWeight('bold')
    .setFontSize(12)
    .setFontColor('#ffffff')
    .setBackground('#0f172a')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  const headers = [[
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
    'Cảnh báo tiến độ',
    '',
    '',
    'WBS_LEVEL_SYS'
  ]];

  sheet.getRange(4, 1, 1, 26).setValues(headers);

  const maxRows = sheet.getMaxRows();
  if (maxRows >= 5) {
    const bodyRange = sheet.getRange(5, 1, maxRows - 4, 26);
    bodyRange.clearContent();
    apDungZebraVaKeBangTemplateQltdV1_(sheet, 5, 1, maxRows - 4, 26);
  }

  dinhDangHeaderBangTemplateQltdV1_(sheet.getRange(4, 1, 1, 26));

  sheet.setFrozenRows(4);

  sheet.setColumnWidth(1, 120); // A
  sheet.setColumnWidth(2, 90);  // B - WBS
  sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 140);
  sheet.setColumnWidth(6, 140);
  sheet.setColumnWidth(7, 70);  // G - ID
  sheet.setColumnWidth(8, 360); // H - Công việc
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

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Cấp 1', 'Cấp 2', 'Cấp 3', 'Cấp 4'], true)
    .setAllowInvalid(false)
    .build();

  if (maxRows >= 5) {
    sheet.getRange(5, 2, maxRows - 4, 1).setDataValidation(rule);
  }

  try {
    sheet.hideColumns(26);
  } catch (err) {
    Logger.log('Không ẩn được cột Z _TEMPLATE_Cong_viec: ' + err.message);
  }

  return '- Đã hoàn thiện _TEMPLATE_Cong_viec: B=WBS, G=ID, Z=WBS_LEVEL_SYS, dropdown Cấp 1–4.';
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
