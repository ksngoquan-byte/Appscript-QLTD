/*******************************************************
 * FILE: 11_Cap_nhat_Tien_do_Tong_hop.gs
 *
 * MỤC TIÊU
 * - Hàm tổng cho người dùng cuối cập nhật Tien_do_tong_hop.
 * - Chạy layout, đổ dữ liệu A:H, rồi tô Gantt bar.
 *******************************************************/

function capNhatTienDoTongHopV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName('Cong_viec');
  const targetSheet = ss.getSheetByName('Tien_do_tong_hop');

  if (!sourceSheet) throw new Error('Không tìm thấy sheet Cong_viec');
  if (!targetSheet) throw new Error('Không tìm thấy sheet Tien_do_tong_hop');

  donCotGhiChuKhoiGanttCu3A_(targetSheet);

  const SOURCE_START_ROW = 5;
  const TARGET_HEADER_ROW = 4;
  const TARGET_DATA_START_ROW = 5;
  const TARGET_START_COL = 1;
  const TARGET_NUM_COLS = 9;

  const header = [[
    'WBS',
    'ID',
    'Công việc / Phạm vi',
    'Chủ trì',
    'Số ngày kế hoạch',
    'Công việc liên kết',
    'Bắt đầu hiện hành',
    'Kết thúc hiện hành',
    'Ghi chú cập nhật'
  ]];

  targetSheet
    .getRange(TARGET_HEADER_ROW, TARGET_START_COL, 1, TARGET_NUM_COLS)
    .setValues(header);

  const sourceLastRow = sourceSheet.getLastRow();
  const sourceLastCol = Math.max(sourceSheet.getLastColumn(), 21); // cần đến U

  const output = [];

  if (sourceLastRow >= SOURCE_START_ROW) {
    const sourceValues = sourceSheet
      .getRange(SOURCE_START_ROW, 1, sourceLastRow - SOURCE_START_ROW + 1, sourceLastCol)
      .getValues();

    sourceValues.forEach(function(row) {
      const wbs = row[1];              // B - WBS
      const id = row[6];               // G - ID/Ref
      const taskName = row[7];         // H - Công việc / Phạm vi
      const owner = row[8];            // I - Chủ trì
      const duration = row[9];         // J - Số ngày kế hoạch
      const predecessor = row[10];     // K - Công việc liên kết
      const planStart = row[11];       // L - Bắt đầu kế hoạch
      const planEnd = row[12];         // M - Kết thúc kế hoạch
      const actualStart = row[18];     // S - Bắt đầu thực tế
      const actualFinish = row[19];    // T - Hoàn thành thực tế
      const updateNote = row[20];      // U - Ghi chú cập nhật

      const hasDisplayData =
        coGiaTriBangTraiTienDoTongHop3A_(wbs) ||
        coGiaTriBangTraiTienDoTongHop3A_(id) ||
        coGiaTriBangTraiTienDoTongHop3A_(taskName);

      if (!hasDisplayData) return;

      const currentStart = coGiaTriBangTraiTienDoTongHop3A_(actualStart)
        ? actualStart
        : planStart;

      const currentEnd = coGiaTriBangTraiTienDoTongHop3A_(actualFinish)
        ? actualFinish
        : planEnd;

      output.push([
        wbs,
        id,
        taskName,
        owner,
        duration,
        predecessor,
        currentStart,
        currentEnd,
        updateNote
      ]);
    });
  }

  const rowsToClear = Math.max(
    targetSheet.getLastRow() - TARGET_DATA_START_ROW + 1,
    1
  );

  targetSheet
    .getRange(TARGET_DATA_START_ROW, TARGET_START_COL, rowsToClear, TARGET_NUM_COLS)
    .clearContent();

  if (output.length > 0) {
    targetSheet
      .getRange(TARGET_DATA_START_ROW, TARGET_START_COL, output.length, TARGET_NUM_COLS)
      .setValues(output);
  }

  dinhDangBangTraiTienDoTongHop3A_(
    targetSheet,
    TARGET_HEADER_ROW,
    TARGET_DATA_START_ROW,
    Math.max(output.length, 1)
  );

  const message =
    'Đã cập nhật bảng trái Tien_do_tong_hop A:I. Số dòng dữ liệu: ' +
    output.length +
    '. Chặng 3A chưa tô Gantt.';

  Logger.log(message);
  ss.toast(message, 'Quản lý tiến độ', 5);

  return message;
}

function coGiaTriBangTraiTienDoTongHop3A_(value) {
  if (value === null || typeof value === 'undefined') return false;

  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() !== '';
  }

  return value !== '';
}

function dinhDangBangTraiTienDoTongHop3A_(sheet, headerRow, dataStartRow, numRows) {
  const LEFT_COLS = 9;
  const GANTT_START_COL = 10;

  // Freeze đủ phần bảng trái A:I và 4 dòng đầu.
  if (sheet.getFrozenRows() !== headerRow) {
    sheet.setFrozenRows(headerRow);
  }

  if (sheet.getFrozenColumns() !== LEFT_COLS) {
    sheet.setFrozenColumns(LEFT_COLS);
  }

  // Chiều rộng bảng trái A:I.
  sheet.setColumnWidth(1, 60);    // A - WBS
  sheet.setColumnWidth(2, 55);    // B - ID
  sheet.setColumnWidth(3, 360);   // C - Công việc / Phạm vi
  sheet.setColumnWidth(4, 105);   // D - Chủ trì
  sheet.setColumnWidth(5, 90);    // E - Số ngày kế hoạch
  sheet.setColumnWidth(6, 135);   // F - Công việc liên kết
  sheet.setColumnWidth(7, 110);   // G - Bắt đầu hiện hành
  sheet.setColumnWidth(8, 110);   // H - Kết thúc hiện hành
  sheet.setColumnWidth(9, 220);   // I - Ghi chú cập nhật

  // Chiều cao các dòng tiêu đề.
  sheet.setRowHeight(1, 28);
  sheet.setRowHeight(2, 24);
  sheet.setRowHeight(3, 22);
  sheet.setRowHeight(4, 34);

  // Dọn format cũ trong vùng bảng trái A:I từ dòng 1 xuống đến vùng dữ liệu.
  const rowsToFormat = Math.max(numRows + dataStartRow - 1, headerRow);
  sheet
    .getRange(1, 1, rowsToFormat, LEFT_COLS)
    .clearFormat();

  // Tiêu đề chính A1:I1.
  sheet.getRange(1, 1, 1, LEFT_COLS).breakApart();
  sheet
    .getRange(1, 1, 1, LEFT_COLS)
    .mergeAcross()
    .setValue('TIẾN ĐỘ TỔNG HỢP / GANTT VIEW')
    .setFontWeight('bold')
    .setFontSize(12)
    .setFontColor('#ffffff')
    .setBackground('#0f172a')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  // Metadata dòng 2 A:I.
  sheet
    .getRange(2, 1, 1, LEFT_COLS)
    .setFontWeight('bold')
    .setFontSize(9)
    .setBackground('#e5e7eb')
    .setVerticalAlignment('middle');

  // Dòng 3 vùng trái để trống, tạo khoảng đệm trước header.
  sheet
    .getRange(3, 1, 1, LEFT_COLS)
    .clearContent()
    .setBackground('#f8fafc');

  // Header bảng trái A4:I4.
  sheet
    .getRange(headerRow, 1, 1, LEFT_COLS)
    .setFontWeight('bold')
    .setFontSize(9)
    .setFontColor('#111827')
    .setBackground('#dbeafe')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true)
    .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);

  // Body bảng trái.
  if (numRows > 0) {
    const bodyRange = sheet.getRange(dataStartRow, 1, numRows, LEFT_COLS);

    bodyRange
      .setFontSize(9)
      .setVerticalAlignment('middle')
      .setBackground('#ffffff')
      .setBorder(null, null, true, null, null, null, '#e5e7eb', SpreadsheetApp.BorderStyle.SOLID);

    // Căn giữa WBS, ID, Chủ trì, số ngày, ngày.
    sheet.getRange(dataStartRow, 1, numRows, 2).setHorizontalAlignment('center');
    sheet.getRange(dataStartRow, 4, numRows, 1).setHorizontalAlignment('center');
    sheet.getRange(dataStartRow, 5, numRows, 1).setHorizontalAlignment('center');
    sheet.getRange(dataStartRow, 7, numRows, 2)
      .setNumberFormat('dd/MM/yyyy')
      .setHorizontalAlignment('center');

    // Wrap các cột dài.
    sheet.getRange(dataStartRow, 3, numRows, 1)
      .setWrap(true)
      .setHorizontalAlignment('left');

    sheet.getRange(dataStartRow, 6, numRows, 1)
      .setWrap(true)
      .setHorizontalAlignment('center');

    sheet.getRange(dataStartRow, 9, numRows, 1)
      .setWrap(true)
      .setHorizontalAlignment('left');

    // Tô nhẹ dòng nhóm WBS cấp 1 nếu cột A có dạng I, II, III... và cột B có ID.
    for (let i = 0; i < numRows; i++) {
      const rowIndex = dataStartRow + i;
      const wbsValue = String(sheet.getRange(rowIndex, 1).getDisplayValue() || '').trim();

      if (/^[IVXLCDM]+$/.test(wbsValue)) {
        sheet
          .getRange(rowIndex, 1, 1, LEFT_COLS)
          .setBackground('#f1f5f9')
          .setFontWeight('bold');
      }
    }
  }

  apDungKeBangVaZebraBangTrai3A_(sheet, dataStartRow, numRows, LEFT_COLS);
  dinhDangTimelineGanttNhe3A_(sheet, headerRow, dataStartRow, numRows, GANTT_START_COL);

  // Tạo ranh giới thị giác rõ giữa bảng trái A:I và Gantt từ J.
  sheet
    .getRange(1, 9, Math.max(rowsToFormat, 4), 1)
    .setBorder(null, null, null, true, null, null, '#64748b', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Cột Gantt bắt đầu từ J: giữ hẹp, không đụng dữ liệu/format Gantt đang có.
  sheet.setColumnWidth(GANTT_START_COL, 36);
}

function donCotGhiChuKhoiGanttCu3A_(sheet) {
  const maxRows = sheet.getMaxRows();

  // Cột I trước đây thuộc Gantt cũ, nay là Ghi chú cập nhật.
  // Dọn nội dung timeline cũ phía trên cột I, nhưng không đụng J trở đi.
  sheet.getRange(1, 9, Math.min(3, maxRows), 1).clearContent().clearFormat();

  // Dọn format tĩnh cũ của Gantt khỏi toàn bộ cột I.
  sheet.getRange(1, 9, maxRows, 1).clearFormat();

  // Nếu conditional format Gantt cũ bắt đầu từ cột I, đẩy range sang J.
  loaiCotIKhoiConditionalFormatGantt3A_(sheet);
}

function loaiCotIKhoiConditionalFormatGantt3A_(sheet) {
  const rules = sheet.getConditionalFormatRules();
  if (!rules || rules.length === 0) return;

  const newRules = [];
  let changed = false;

  rules.forEach(function(rule) {
    const ranges = rule.getRanges();
    const nextRanges = [];

    ranges.forEach(function(range) {
      if (range.getSheet().getSheetId() !== sheet.getSheetId()) {
        nextRanges.push(range);
        return;
      }

      const startCol = range.getColumn();
      const numCols = range.getNumColumns();

      // Chỉ xử lý các rule cũ của Gantt bắt đầu tại cột I và kéo dài sang phải.
      // Không can thiệp các rule khác bắt đầu trước cột I.
      if (startCol === 9 && numCols > 1) {
        nextRanges.push(
          sheet.getRange(
            range.getRow(),
            10,
            range.getNumRows(),
            numCols - 1
          )
        );
        changed = true;
        return;
      }

      // Nếu rule chỉ áp vào riêng cột I thì bỏ khỏi rule này.
      if (startCol === 9 && numCols === 1) {
        changed = true;
        return;
      }

      nextRanges.push(range);
    });

    if (nextRanges.length > 0) {
      newRules.push(rule.copy().setRanges(nextRanges).build());
    } else {
      changed = true;
    }
  });

  if (changed) {
    sheet.setConditionalFormatRules(newRules);
  }
}

function apDungKeBangVaZebraBangTrai3A_(sheet, dataStartRow, numRows, leftCols) {
  if (numRows <= 0) return;

  const bodyRange = sheet.getRange(dataStartRow, 1, numRows, leftCols);

  // Kẻ bảng rõ cho vùng A:I.
  bodyRange.setBorder(
    true,
    true,
    true,
    true,
    true,
    true,
    '#d6dee8',
    SpreadsheetApp.BorderStyle.SOLID
  );

  // Tô màu xen kẽ từng hàng cho bảng trái A:I.
  // Không áp dụng sang Gantt để tránh ghi đè màu bar xanh/đỏ.
  for (let i = 0; i < numRows; i++) {
    const rowIndex = dataStartRow + i;
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fbff';

    sheet
      .getRange(rowIndex, 1, 1, leftCols)
      .setBackground(bg);
  }

  // Tô lại dòng nhóm WBS cấp 1 sau zebra để không bị mất nhấn mạnh.
  for (let i = 0; i < numRows; i++) {
    const rowIndex = dataStartRow + i;
    const wbsValue = String(sheet.getRange(rowIndex, 1).getDisplayValue() || '').trim();

    if (/^[IVXLCDM]+$/.test(wbsValue)) {
      sheet
        .getRange(rowIndex, 1, 1, leftCols)
        .setBackground('#eaf2ff')
        .setFontWeight('bold');
    }
  }

  // Viền phải cột I đậm hơn để tách khỏi Gantt.
  sheet
    .getRange(1, leftCols, numRows + dataStartRow - 1, 1)
    .setBorder(
      null,
      null,
      null,
      true,
      null,
      null,
      '#334155',
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );
}

function dinhDangTimelineGanttNhe3A_(sheet, headerRow, dataStartRow, numRows, ganttStartCol) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < ganttStartCol) return;

  const ganttCols = lastCol - ganttStartCol + 1;
  const rowsToFormat = Math.max(numRows + dataStartRow - 1, headerRow);

  // Timeline header J trở đi: làm rõ tháng/tuần/ngày.
  sheet
    .getRange(3, ganttStartCol, 1, ganttCols)
    .setFontWeight('bold')
    .setFontSize(8)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground('#e5eef8')
    .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);

  sheet
    .getRange(4, ganttStartCol, 1, ganttCols)
    .setFontWeight('bold')
    .setFontSize(8)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground('#f1f5f9')
    .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);

  // Kẻ grid nhẹ cho vùng Gantt nhưng KHÔNG set background để không phá bar màu xanh/đỏ.
  if (numRows > 0) {
    sheet
      .getRange(dataStartRow, ganttStartCol, numRows, ganttCols)
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        '#edf2f7',
        SpreadsheetApp.BorderStyle.SOLID
      );
  }

  // Cột Gantt gọn, giống timeline cũ.
  for (let col = ganttStartCol; col <= Math.min(lastCol, ganttStartCol + 80); col++) {
    sheet.setColumnWidth(col, 28);
  }
}
