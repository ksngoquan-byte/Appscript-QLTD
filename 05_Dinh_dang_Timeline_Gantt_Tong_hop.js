/*******************************************************
 * FILE: 05_Dinh_dang_Timeline_Gantt_Tong_hop.gs
 *
 * MỤC TIÊU
 * - Chuẩn hóa giao diện timeline Gantt tại sheet Tien_do_tong_hop
 * - A:H  = Bảng điều phối chính
 * - I:... = Gantt tuần thực tế theo cấu hình nhẹ
 * - Vùng kỹ thuật ẩn được tính động sau timeline
 *
 * QUY ƯỚC
 * - Mỗi cột Gantt = 1 tuần thực tế
 * - Tuần logic = Thứ Hai đến Chủ nhật
 * - Dòng 3 = MM/yyyy theo ngày Thứ Bảy của tuần
 * - Dòng 4 = ngày Thứ Bảy của tuần, format dd
 *
 * LƯU Ý
 * - Không xử lý dữ liệu task
 * - Không tô thanh tiến độ task
 * - Không sửa Schedule Engine
 * - Không dùng SpreadsheetApp.getUi()
 *******************************************************/

function dinhDangTimelineGanttTongHopV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Tien_do_tong_hop');

  if (!sheet) {
    sheet = ss.insertSheet('Tien_do_tong_hop');
  }

  const cfg = getGanttLayoutConfigV1_(ss);
  const MAX_ROW = Math.max(sheet.getMaxRows(), cfg.MAX_ROW);
  const requiredColumns = cfg.TECH_START_COL + cfg.TECH_COL_COUNT - 1;

  if (sheet.getMaxColumns() < requiredColumns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredColumns - sheet.getMaxColumns());
  }

  clearTienDoTongHopTimelineBeforeRender_(sheet);

  const firstWeekStart = cfg.START_DATE;
  const lastWeekStart = addDaysGantt_(firstWeekStart, (cfg.WEEK_COUNT - 1) * 7);
  const lastWeekEnd = addDaysGantt_(lastWeekStart, 6);

  // 1. Thông số tổng quan A:H
  capNhatThongSoTongQuanGantt_(sheet, firstWeekStart, lastWeekEnd, cfg.WEEK_COUNT);
  // 2. Dọn layout Gantt cũ trước khi vẽ lại
  donDepLayoutGanttTruocKhiVeLaiV1_(sheet, cfg, requiredColumns, MAX_ROW);
// 3. Tuần logic bắt đầu Thứ Hai, nhãn hiển thị lấy ngày Thứ Bảy.
  const weekStarts = [];
  const weekSaturdays = [];
  const weekSaturdayLabels = [];
  for (let i = 0; i < cfg.WEEK_COUNT; i++) {
    const weekStart = addDaysGantt_(firstWeekStart, i * 7);
    const weekSaturday = addDaysGantt_(weekStart, 5);
    weekStarts.push(weekStart);
    weekSaturdays.push(weekSaturday);
    weekSaturdayLabels.push(formatNgayGantt_(weekSaturday, 'dd'));
  }

  const monthSegments = taoDoanThangTuDanhSachTuan_(weekSaturdays);

  sheet
    .getRange(cfg.HEADER_WEEK_ROW, cfg.GANTT_START_COL, 1, cfg.WEEK_COUNT)
    .setNumberFormat('@')
    .setValues([weekSaturdayLabels])
    .setFontSize(8)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground('#EEF4FB')
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#D2DAE6',
      SpreadsheetApp.BorderStyle.SOLID
    );

  // 5. Reset format nền/border toàn vùng Gantt
  const ganttFullRange = sheet.getRange(
    cfg.HEADER_MONTH_ROW,
    cfg.GANTT_START_COL,
    MAX_ROW - cfg.HEADER_MONTH_ROW + 1,
    cfg.WEEK_COUNT
  );

  ganttFullRange
    .setBackground('#FFFFFF')
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#E6EAF0',
      SpreadsheetApp.BorderStyle.SOLID
    );

  // 6. Format từng tháng: merge dòng 3, tô nền tháng, kẻ đầu tháng/năm
  monthSegments.forEach((seg, index) => {
    const col = cfg.GANTT_START_COL + seg.startIndex;
    const width = seg.endIndex - seg.startIndex + 1;

    const bodyBg = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    const headerBg = index % 2 === 0 ? '#DCE8F6' : '#E7EEF8';

    // Header tháng dòng 3
    sheet
      .getRange(cfg.HEADER_MONTH_ROW, col, 1, width)
      .merge()
      .setNumberFormat('@')
      .setValue(seg.label)
      .setBackground(headerBg)
      .setFontSize(8)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        '#B8C2D0',
        SpreadsheetApp.BorderStyle.SOLID
      );

    // Header tuần dòng 4
    sheet
      .getRange(cfg.HEADER_WEEK_ROW, col, 1, width)
      .setBackground(headerBg)
      .setFontSize(8)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        false,
        '#D2DAE6',
        SpreadsheetApp.BorderStyle.SOLID
      );

    // Nền thân Gantt theo tháng chẵn/lẻ
    sheet
      .getRange(cfg.DATA_START_ROW, col, MAX_ROW - cfg.DATA_START_ROW + 1, width)
      .setBackground(bodyBg)
      .setBorder(
        null,
        true,
        null,
        true,
        true,
        true,
        '#EDF1F5',
        SpreadsheetApp.BorderStyle.SOLID
      );

    // Border đầu tháng
    sheet
      .getRange(cfg.HEADER_MONTH_ROW, col, MAX_ROW - cfg.HEADER_MONTH_ROW + 1, 1)
      .setBorder(
        null,
        true,
        null,
        null,
        null,
        null,
        '#AEB8C6',
        SpreadsheetApp.BorderStyle.SOLID
      );

    // Border đầu năm: tháng 01 hoặc cột đầu tiên
    if (seg.month === 0 || seg.startIndex === 0) {
      sheet
        .getRange(cfg.HEADER_MONTH_ROW, col, MAX_ROW - cfg.HEADER_MONTH_ROW + 1, 1)
        .setBorder(
          null,
          true,
          null,
          null,
          null,
          null,
          '#2F3A4A',
          SpreadsheetApp.BorderStyle.SOLID_THICK
        );
    }
  });

  // 7. Highlight tuần hiện tại nếu nằm trong phạm vi 5 năm
  highlightTuanHienTaiGantt_(sheet, weekStarts, cfg.GANTT_START_COL, MAX_ROW);

  // 8. Format bảng trái A:H
  dinhDangBangTraiGantt_(sheet, MAX_ROW);

  // 9. Freeze và kích thước
  sheet.setFrozenRows(4);
  sheet.setFrozenColumns(cfg.LEFT_COLS);

  sheet.setColumnWidth(1, 70);  // A
  sheet.setColumnWidth(2, 390); // B
  sheet.setColumnWidth(3, 100); // C
  sheet.setColumnWidth(4, 105); // D
  sheet.setColumnWidth(5, 105); // E
  sheet.setColumnWidth(6, 120); // F
  sheet.setColumnWidth(7, 120); // G
  sheet.setColumnWidth(8, 220); // H

  for (let col = cfg.GANTT_START_COL; col <= cfg.GANTT_END_COL; col++) {
    sheet.setColumnWidth(col, 28);
  }

  sheet.setRowHeight(1, 32);
  sheet.setRowHeight(2, 30);
  sheet.setRowHeight(3, 30);
  sheet.setRowHeight(4, 36);

  // 10. Ẩn vùng kỹ thuật sau timeline
  try {
    sheet.hideColumns(cfg.TECH_START_COL, cfg.TECH_COL_COUNT);
  } catch (err) {
    Logger.log('Không ẩn được vùng kỹ thuật Gantt: ' + err.message);
  }

  SpreadsheetApp.flush();

  const message = 'Đã định dạng xong Timeline Gantt tổng hợp V1.';
  Logger.log(message);
  return message;
}

function clearTienDoTongHopTimelineBeforeRender_(sheet) {
  if (!sheet) return;

  const FIRST_TIMELINE_ROW = 3;
  const FIRST_TIMELINE_COL = 9; // I
  const lastRow = sheet.getMaxRows();
  const lastCol = sheet.getMaxColumns();

  if (lastRow < FIRST_TIMELINE_ROW || lastCol < FIRST_TIMELINE_COL) return;

  const range = sheet.getRange(
    FIRST_TIMELINE_ROW,
    FIRST_TIMELINE_COL,
    lastRow - FIRST_TIMELINE_ROW + 1,
    lastCol - FIRST_TIMELINE_COL + 1
  );

  range.clearContent();
  range.clearNote();
  range.setBackground(null);

  Logger.log('[GANTT] Cleared old timeline area before render: I3:lastColumn');
}


/**
 * Cập nhật vùng thông số A:H ở hàng 1–2.
 */

function donDepLayoutGanttTruocKhiVeLaiV1_(sheet, cfg, requiredColumns, maxRow) {
  const maxColumns = sheet.getMaxColumns();
  const safeMaxRow = Math.max(maxRow || cfg.MAX_ROW || sheet.getMaxRows(), cfg.HEADER_WEEK_ROW);

  const existingFilter = sheet.getFilter();
  if (existingFilter) {
    existingFilter.remove();
  }

  // Hiện tạm toàn bộ cột để có thể dọn merge/format cũ, sau đó sẽ ẩn lại cột thừa.
  try {
    sheet.showColumns(1, maxColumns);
  } catch (err) {
    Logger.log('Khong show duoc toan bo cot truoc khi don Gantt: ' + err.message);
  }

  // Gỡ merge + xóa nội dung header tháng/tuần cũ trong timeline từ cột I trở đi.
  // Đây là điểm xử lý lỗi khi giảm GANTT_HORIZON_YEARS từ 5 năm xuống 2/3 năm.
  if (maxColumns >= cfg.GANTT_START_COL) {
    const ganttWidth = maxColumns - cfg.GANTT_START_COL + 1;

    sheet
      .getRange(cfg.HEADER_MONTH_ROW, cfg.GANTT_START_COL, 2, ganttWidth)
      .breakApart()
      .clearContent()
      .clearNote()
      .setBackground(null);
  }

  // Gỡ merge còn sót trong vùng Gantt từ cột I trở đi, không động vào bảng trái A:H.
  if (maxColumns >= cfg.GANTT_START_COL) {
    const ganttWidth = maxColumns - cfg.GANTT_START_COL + 1;
    const ganttHeight = safeMaxRow - cfg.HEADER_MONTH_ROW + 1;

    sheet
      .getRange(cfg.HEADER_MONTH_ROW, cfg.GANTT_START_COL, ganttHeight, ganttWidth)
      .breakApart();
  }

  // Hiện vùng layout mới và ẩn toàn bộ cột thừa sau layout mới.
  sheet.showColumns(1, Math.min(requiredColumns, maxColumns));
  anCotThuaSauLayoutGanttV1_(sheet, requiredColumns);
}

function capNhatThongSoTongQuanGantt_(sheet, firstWeekStart, lastWeekEnd, weekCount) {
  const now = new Date();

  sheet.getRange('A1:H1')
    .breakApart()
    .clearContent()
    .setBackground('#1B3A57')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(13)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(
      true,
      true,
      true,
      true,
      false,
      false,
      '#132B42',
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );

  sheet.getRange('A1').setValue('TIẾN ĐỘ TỔNG HỢP / GANTT VIEW');

  const row2 = [
    'Từ ngày',
    '=IFERROR(MIN(FILTER(F5:F;ISNUMBER(F5:F)));"")',
    'Đến ngày',
    '=IFERROR(MAX(FILTER(G5:G;ISNUMBER(G5:G)));"")',
    'Số tuần',
    '=IF(OR(B2="";D2="");"";ROUNDUP((D2-B2+1)/7;0))',
    'Cập nhật',
    now
  ];

  sheet.getRange(2, 1, 1, 8)
    .setValues([row2])
    .setBackground('#E6F0FA')
    .setFontWeight('bold')
    .setFontSize(9)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#C7D3E0',
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet.getRange('B2').setNumberFormat('dd/MM/yyyy');
  sheet.getRange('D2').setNumberFormat('dd/MM/yyyy');
  sheet.getRange('H2').setNumberFormat('dd/MM/yyyy');
}


/**
 * Cấu hình layout Gantt V1.
 */
function getGanttLayoutConfigV1_(ss) {
  const ganttConfig = docCauHinhGanttV1_(ss);
  const horizonYears = laySoNamGanttV1_(ganttConfig.GANTT_HORIZON_YEARS, 5);
  let labelDay = String(ganttConfig.GANTT_LABEL_DAY || 'SATURDAY').trim().toUpperCase();
  let startDate = layNgayCauHinhGanttV1_(ganttConfig.GANTT_START_DATE);

  if (labelDay !== 'SATURDAY') {
    Logger.log('GANTT_LABEL_DAY chưa hỗ trợ "' + labelDay + '", fallback SATURDAY.');
    labelDay = 'SATURDAY';
  }

  if (!startDate) {
    startDate = layThuHaiCuaTuanV1_(new Date());
    if (ganttConfig.GANTT_START_DATE) {
      Logger.log('Sai GANTT_START_DATE, đang dùng Thứ Hai tuần hiện tại làm mốc.');
    } else {
      Logger.log('Thiếu GANTT_START_DATE, đang dùng Thứ Hai tuần hiện tại làm mốc.');
    }
  }

  startDate = layThuHaiCuaTuanV1_(startDate);

  const endDate = congNamGanttV1_(startDate, horizonYears);
  let weekCount = Math.ceil((endDate.getTime() - startDate.getTime() + 86400000) / (7 * 86400000));

  if (weekCount > 520) {
    Logger.log('GANTT_WEEK_COUNT vượt 520 tuần, giới hạn còn 520.');
    weekCount = 520;
  }

  if (weekCount < 1) {
    weekCount = 1;
  }

  const LEFT_COLS = 8;
  const GANTT_START_COL = LEFT_COLS + 1;
  const WEEK_COUNT = weekCount;
  const GANTT_END_COL = GANTT_START_COL + WEEK_COUNT - 1;
  const TECH_START_COL = GANTT_END_COL + 1;

  return {
    START_DATE: startDate,
    END_DATE: endDate,
    HORIZON_YEARS: horizonYears,
    LABEL_DAY: labelDay,
    LEFT_COLS,
    GANTT_START_COL,
    WEEK_COUNT,
    GANTT_END_COL,
    TECH_START_COL,
    TECH_COL_COUNT: 14,
    HEADER_MONTH_ROW: 3,
    HEADER_WEEK_ROW: 4,
    DATA_START_ROW: 5,
    MAX_ROW: 1000
  };
}


/**
 * Đọc cấu hình Gantt từ sheet Cau_hinh.
 */
function docCauHinhGanttV1_(ss) {
  const sheet = ss.getSheetByName('Cau_hinh');
  const config = {};

  if (!sheet) {
    return config;
  }

  const values = sheet.getDataRange().getValues();
  const keys = {
    GANTT_START_DATE: true,
    GANTT_HORIZON_YEARS: true,
    GANTT_LABEL_DAY: true
  };

  for (let r = 0; r < values.length; r++) {
    const key = String(values[r][1] || '').trim();
    if (!keys[key]) continue;

    config[key] = values[r].length > 3 ? values[r][3] : '';
  }

  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      const key = String(values[r][c] || '').trim();
      if (!keys[key] || Object.prototype.hasOwnProperty.call(config, key)) continue;

      config[key] = c + 1 < values[r].length ? values[r][c + 1] : '';
    }
  }

  return config;
}


/**
 * Parse ngày cấu hình Gantt.
 */
function layNgayCauHinhGanttV1_(value) {
  if (laNgayHopLeGanttV1_(value)) {
    return boGioGantt_(value);
  }

  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return boGioGantt_(date);
}


function laySoNamGanttV1_(value, fallback) {
  const years = Number(value);
  return isFinite(years) && years > 0 ? years : fallback;
}


function layThuHaiCuaTuanV1_(value) {
  const date = boGioGantt_(value);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDaysGantt_(date, offset);
}


function congNamGanttV1_(date, years) {
  const output = boGioGantt_(date);
  output.setFullYear(output.getFullYear() + years);
  return output;
}


function laNgayHopLeGanttV1_(value) {
  return Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime());
}


/**
 * Format bảng trái A:H.
 */
function dinhDangBangTraiGantt_(sheet, maxRow) {
  const bodyRowCount = maxRow - 4;

  sheet.getRange('A4:H4')
    .setValues([[
      'ID',
      'Công việc / Phạm vi',
      'Chủ trì',
      'Số ngày',
      'Công việc liên kết',
      'Bắt đầu',
      'Kết thúc',
      'Trạng thái'
    ]])
    .setBackground('#DDE9F2')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#8CA9C4',
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet.getRange(5, 1, bodyRowCount, 8)
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setWrap(true)
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#DCE3EA',
      SpreadsheetApp.BorderStyle.SOLID
    );

  const bandedBackgrounds = new Array(bodyRowCount).fill(null).map((_, index) => {
    const color = index % 2 === 0 ? '#FFFFFF' : '#F6FAFD';
    return new Array(8).fill(color);
  });

  sheet.getRange(5, 1, bodyRowCount, 8).setBackgrounds(bandedBackgrounds);

  sheet.getRange(5, 1, bodyRowCount, 1).setHorizontalAlignment('center');
  sheet.getRange(5, 2, bodyRowCount, 1).setHorizontalAlignment('left').setVerticalAlignment('top').setWrap(true);
  sheet.getRange(5, 3, bodyRowCount, 1).setHorizontalAlignment('center');
  sheet.getRange(5, 4, bodyRowCount, 1).setNumberFormat('0').setHorizontalAlignment('center');
  sheet.getRange(5, 5, bodyRowCount, 1).setNumberFormat('@').setHorizontalAlignment('center');
  sheet.getRange(5, 6, bodyRowCount, 2).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center');
  sheet.getRange(5, 8, bodyRowCount, 1).setHorizontalAlignment('left').setWrap(true);

  const filter = sheet.getFilter();
  if (filter) filter.remove();

  sheet.getRange(4, 1, maxRow - 3, 8).createFilter();
}


/**
 * Highlight tuần hiện tại.
 */
function highlightTuanHienTaiGantt_(sheet, weekStarts, startCol, maxRow) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < weekStarts.length; i++) {
    const weekStart = new Date(weekStarts[i]);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = addDaysGantt_(weekStart, 6);

    if (today >= weekStart && today <= weekEnd) {
      const col = startCol + i;

      sheet
        .getRange(3, col, maxRow - 2, 1)
        .setBackground('#FEF3C7')
        .setBorder(
          null,
          true,
          null,
          true,
          null,
          null,
          '#D97706',
          SpreadsheetApp.BorderStyle.SOLID_MEDIUM
        );

      break;
    }
  }
}


/**
 * Tạo danh sách segment tháng từ danh sách tuần thực tế.
 */
function taoDoanThangTuDanhSachTuan_(weekStarts) {
  const segments = [];
  let current = null;

  weekStarts.forEach((date, index) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const label = formatNgayGantt_(date, 'MM/yyyy');

    if (!current || current.year !== year || current.month !== month) {
      if (current) {
        current.endIndex = index - 1;
        segments.push(current);
      }

      current = {
        year: year,
        month: month,
        label: label,
        startIndex: index,
        endIndex: index
      };
    }
  });

  if (current) {
    current.endIndex = weekStarts.length - 1;
    segments.push(current);
  }

  return segments;
}


/**
 * Format ngày theo timezone script.
 */
function formatNgayGantt_(date, pattern) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    pattern
  );
}


/**
 * Cộng ngày.
 */
function addDaysGantt_(date, days) {
  const d = boGioGantt_(date);
  d.setDate(d.getDate() + days);
  return d;
}


function boGioGantt_(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function anCotThuaSauLayoutGanttV1_(sheet, requiredColumns) {
  const maxColumns = sheet.getMaxColumns();

  if (maxColumns <= requiredColumns) {
    return;
  }

  const extraStartCol = requiredColumns + 1;
  const extraCount = maxColumns - requiredColumns;

  try {
    sheet.hideColumns(extraStartCol, extraCount);
  } catch (err) {
    Logger.log('Khong an duoc cot thua sau layout Gantt: ' + err.message);
  }
}


