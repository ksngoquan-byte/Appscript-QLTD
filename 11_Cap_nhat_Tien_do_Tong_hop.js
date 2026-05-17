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
  if (sheet.getFrozenRows() < headerRow) {
    sheet.setFrozenRows(headerRow);
  }

  // Width bảng trái A:I
  sheet.setColumnWidth(1, 80);   // A - WBS
  sheet.setColumnWidth(2, 70);   // B - ID
  sheet.setColumnWidth(3, 420);  // C - Công việc / Phạm vi
  sheet.setColumnWidth(4, 130);  // D - Chủ trì
  sheet.setColumnWidth(5, 110);  // E - Số ngày kế hoạch
  sheet.setColumnWidth(6, 170);  // F - Công việc liên kết
  sheet.setColumnWidth(7, 130);  // G - Bắt đầu hiện hành
  sheet.setColumnWidth(8, 130);  // H - Kết thúc hiện hành
  sheet.setColumnWidth(9, 260);  // I - Ghi chú cập nhật

  // Dọn format cũ trong vùng bảng trái A:I từ header xuống dữ liệu.
  sheet
    .getRange(headerRow, 1, Math.max(numRows + 1, 2), 9)
    .clearFormat();

  sheet
    .getRange(headerRow, 1, 1, 9)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true)
    .setBackground('#f3f4f6');

  sheet
    .getRange(dataStartRow, 1, numRows, 9)
    .setVerticalAlignment('middle')
    .setBackground('#ffffff');

  sheet
    .getRange(dataStartRow, 1, numRows, 2)
    .setHorizontalAlignment('center');

  sheet
    .getRange(dataStartRow, 4, numRows, 1)
    .setHorizontalAlignment('center');

  sheet
    .getRange(dataStartRow, 5, numRows, 1)
    .setHorizontalAlignment('center');

  sheet
    .getRange(dataStartRow, 7, numRows, 2)
    .setNumberFormat('dd/MM/yyyy')
    .setHorizontalAlignment('center');

  sheet
    .getRange(dataStartRow, 3, numRows, 1)
    .setWrap(true);

  sheet
    .getRange(dataStartRow, 6, numRows, 1)
    .setWrap(true);

  sheet
    .getRange(dataStartRow, 9, numRows, 1)
    .setWrap(true)
    .setHorizontalAlignment('left')
    .setBackground('#ffffff');
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
