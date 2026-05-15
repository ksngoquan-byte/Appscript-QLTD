/*******************************************************
 * FILE: 10_To_mau_Gantt_Tong_hop.gs
 *
 * MỤC TIÊU
 * - Tô Gantt bar V1 trên sheet Tien_do_tong_hop.
 * - Chỉ tô nền timeline body từ cột I trở đi.
 * - Không ghi giá trị, không sửa A:H, không set border.
 *******************************************************/

const GANTT_BAR_TONG_HOP_V1 = {
  COLOR_EMPTY_ODD: '#FFFFFF',
  COLOR_EMPTY_EVEN: '#F8FAFC',
  COLOR_BASELINE: '#E5E7EB',
  COLOR_FORECAST: '#3B82F6',
  COLOR_OVERDUE: '#EF4444',
  COLOR_ACTUAL: '#22C55E',
  CHUNK_SIZE: 100,
  PROP_LAST_PAINTED_ROWS: 'GANTT_TONG_HOP_V1_LAST_PAINTED_ROWS',
  PROP_SHOW_BASELINE: 'GANTT_TONG_HOP_V1_SHOW_BASELINE'
};


function toMauGanttBarTienDoTongHopV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tien_do_tong_hop');

  if (!sheet) {
    throw new Error('Không tìm thấy sheet Tien_do_tong_hop.');
  }

  if (typeof getGanttLayoutConfigV1_ !== 'function') {
    throw new Error('Thiếu getGanttLayoutConfigV1_. Hãy kiểm tra file 05_Dinh_dang_Timeline_Gantt_Tong_hop.gs');
  }

  const cfg = getGanttLayoutConfigV1_(ss);
  const startRow = 5;
  const previousPaintedRows = docSoDongDaToGanttTongHopV1_();

  if (!cfg.WEEK_COUNT || cfg.WEEK_COUNT <= 0) {
    Logger.log('WEEK_COUNT không hợp lệ, bỏ qua tô Gantt bar.');
    return 'Không có tuần hợp lệ để tô Gantt bar.';
  }

  if (sheet.getMaxColumns() < cfg.GANTT_END_COL) {
    throw new Error('Timeline chưa đủ cột đến GANTT_END_COL. Hãy chạy layout timeline trước.');
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    if (previousPaintedRows > 0) {
      toNenRongTimelineGanttTongHopV1_(sheet, cfg, startRow, previousPaintedRows);
      luuSoDongDaToGanttTongHopV1_(0);
      SpreadsheetApp.flush();
    }

    Logger.log('Tien_do_tong_hop chưa có dòng task để tô Gantt bar.');
    return 'Không có task để tô Gantt bar.';
  }

  const rowCount = lastRow - startRow + 1;
  const values = sheet
    .getRange(startRow, 1, rowCount, 8)
    .getValues();
  const techValues = sheet
    .getRange(startRow, cfg.TECH_START_COL, rowCount, 6)
    .getValues();

  const lastTaskOffset = xacDinhDongCuoiCoTaskGanttTongHopV1_(values);

  if (lastTaskOffset < 0) {
    if (previousPaintedRows > 0) {
      toNenRongTimelineGanttTongHopV1_(sheet, cfg, startRow, previousPaintedRows);
      luuSoDongDaToGanttTongHopV1_(0);
      SpreadsheetApp.flush();
    }

    Logger.log('Tien_do_tong_hop không có task hợp lệ trong A:H để tô Gantt bar.');
    return 'Không có task để tô Gantt bar.';
  }

  const taskRows = values.slice(0, lastTaskOffset + 1);
  const taskTechRows = techValues.slice(0, lastTaskOffset + 1);
  const weekRanges = taoWeekRangesGanttTongHopV1_(cfg.START_DATE, cfg.WEEK_COUNT);
  const showBaseline = docHienThiDuongGangKeHoachGocV1_();
  const totalTaskRows = taskRows.length;
  const paintRows = Math.max(totalTaskRows, previousPaintedRows);
  const chunkSize = GANTT_BAR_TONG_HOP_V1.CHUNK_SIZE;

  for (let offset = 0; offset < paintRows; offset += chunkSize) {
    const chunkRowCount = Math.min(chunkSize, paintRows - offset);
    const chunkRows = [];
    const chunkTechRows = [];

    for (let i = 0; i < chunkRowCount; i++) {
      chunkRows.push(taskRows[offset + i] || null);
      chunkTechRows.push(taskTechRows[offset + i] || null);
    }

    const backgrounds = chunkRows.map((_, index) => {
      const sheetRow = startRow + offset + index;
      const emptyColor = sheetRow % 2 === 0
        ? GANTT_BAR_TONG_HOP_V1.COLOR_EMPTY_EVEN
        : GANTT_BAR_TONG_HOP_V1.COLOR_EMPTY_ODD;

      return new Array(cfg.WEEK_COUNT).fill(emptyColor);
    });

    chunkRows.forEach((row, index) => {
      if (!row) return;

      const sheetRow = startRow + offset + index;
      const techRow = chunkTechRows[index] || [];

      const baselineStart = techRow[4]; // Baseline Start - Ke_hoach_goc!D
      const baselineEnd = techRow[5];   // Baseline End - Ke_hoach_goc!E
      const forecastStart = row[5];     // F - Bắt đầu hiện hành
      const forecastEnd = row[6];       // G - Kết thúc hiện hành
      const actualStart = techRow[1];   // Actual Start - Cong_viec!S
      const actualEnd = techRow[2];     // Actual Finish - Cong_viec!T
      const status = chuanHoaTrangThaiGanttTongHopV1_(techRow[3]); // Cong_viec!R

      if (showBaseline) {
        toMauKhoangNgayLenBackgroundsV1_(
          backgrounds,
          index,
          baselineStart,
          baselineEnd,
          weekRanges,
          GANTT_BAR_TONG_HOP_V1.COLOR_BASELINE,
          sheetRow,
          'baseline'
        );
      }

      const forecastColor = laCongViecQuaHanChuaHoanThanhGanttTongHopV1_(forecastEnd, status, actualEnd)
        ? GANTT_BAR_TONG_HOP_V1.COLOR_OVERDUE
        : GANTT_BAR_TONG_HOP_V1.COLOR_FORECAST;

      toMauKhoangNgayLenBackgroundsV1_(
        backgrounds,
        index,
        forecastStart,
        forecastEnd,
        weekRanges,
        forecastColor,
        sheetRow,
        'forecast'
      );

      toMauActualCompletedLenBackgroundsV1_(
        backgrounds,
        index,
        actualStart,
        actualEnd,
        weekRanges,
        sheetRow
      );
    });

    sheet
      .getRange(startRow + offset, cfg.GANTT_START_COL, chunkRows.length, cfg.WEEK_COUNT)
      .setBackgrounds(backgrounds);
  }

  luuSoDongDaToGanttTongHopV1_(totalTaskRows);
  SpreadsheetApp.flush();

  const message =
    'Đã tô Gantt bar V1 cho Tien_do_tong_hop. Số dòng: ' +
    totalTaskRows +
    ', số tuần: ' +
    cfg.WEEK_COUNT;

  Logger.log(message);
  return message;
}


function toMauActualCompletedLenBackgroundsV1_(
  backgrounds,
  rowOffset,
  actualStart,
  actualEnd,
  weekRanges,
  sheetRow
) {
  const hasStart = laNgayHopLeGanttBarTongHopV1_(actualStart);
  const hasEnd = laNgayHopLeGanttBarTongHopV1_(actualEnd);

  if (!hasStart && !hasEnd) {
    return;
  }

  if (hasStart && !hasEnd) {
    return;
  }

  if (!hasStart && hasEnd) {
    Logger.log('Bỏ qua actual tại dòng ' + sheetRow + ': có ngày hoàn thành thực tế nhưng thiếu ngày bắt đầu thực tế.');
    return;
  }

  toMauKhoangNgayLenBackgroundsV1_(
    backgrounds,
    rowOffset,
    actualStart,
    actualEnd,
    weekRanges,
    GANTT_BAR_TONG_HOP_V1.COLOR_ACTUAL,
    sheetRow,
    'actual'
  );
}

function chuanHoaTrangThaiGanttTongHopV1_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/\s+/g, ' ');
}

function laCongViecQuaHanChuaHoanThanhGanttTongHopV1_(forecastEnd, status, actualEnd) {
  if (!laNgayHopLeGanttBarTongHopV1_(forecastEnd)) return false;
  if (laNgayHopLeGanttBarTongHopV1_(actualEnd)) return false;
  if (status === 'hoan thanh' || status.startsWith('hoan thanh ')) return false;

  const today = boGioGanttBarTongHopV1_(new Date());
  const finish = boGioGanttBarTongHopV1_(forecastEnd);

  return finish.getTime() < today.getTime();
}


function xacDinhDongCuoiCoTaskGanttTongHopV1_(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const hasTask =
      row[1] !== '' && row[1] !== null ||
      row[3] !== '' && row[3] !== null ||
      row[4] !== '' && row[4] !== null ||
      row[5] !== '' && row[5] !== null ||
      row[6] !== '' && row[6] !== null;

    if (hasTask) {
      return i;
    }
  }

  return -1;
}


function toNenRongTimelineGanttTongHopV1_(sheet, cfg, startRow, rowCount) {
  const chunkSize = GANTT_BAR_TONG_HOP_V1.CHUNK_SIZE;

  for (let offset = 0; offset < rowCount; offset += chunkSize) {
    const chunkRowCount = Math.min(chunkSize, rowCount - offset);
    const backgrounds = new Array(chunkRowCount).fill(null).map((_, index) => {
      const sheetRow = startRow + offset + index;
      const emptyColor = sheetRow % 2 === 0
        ? GANTT_BAR_TONG_HOP_V1.COLOR_EMPTY_EVEN
        : GANTT_BAR_TONG_HOP_V1.COLOR_EMPTY_ODD;

      return new Array(cfg.WEEK_COUNT).fill(emptyColor);
    });

    sheet
      .getRange(startRow + offset, cfg.GANTT_START_COL, chunkRowCount, cfg.WEEK_COUNT)
      .setBackgrounds(backgrounds);
  }
}


function taoWeekRangesGanttTongHopV1_(startDate, weekCount) {
  const ranges = [];
  const firstWeekStart = boGioGanttBarTongHopV1_(startDate);

  for (let i = 0; i < weekCount; i++) {
    const weekStart = new Date(firstWeekStart);
    weekStart.setDate(weekStart.getDate() + i * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    ranges.push({
      start: boGioGanttBarTongHopV1_(weekStart),
      end: boGioGanttBarTongHopV1_(weekEnd)
    });
  }

  return ranges;
}


function toMauKhoangNgayLenBackgroundsV1_(
  backgrounds,
  rowOffset,
  startDate,
  endDate,
  weekRanges,
  color,
  sheetRow,
  label
) {
  if (!laNgayHopLeGanttBarTongHopV1_(startDate) || !laNgayHopLeGanttBarTongHopV1_(endDate)) {
    return;
  }

  const start = boGioGanttBarTongHopV1_(startDate);
  const end = boGioGanttBarTongHopV1_(endDate);

  if (end.getTime() < start.getTime()) {
    Logger.log(
      'Bỏ qua Gantt bar ' +
      label +
      ' tại dòng ' +
      sheetRow +
      ': ngày kết thúc nhỏ hơn ngày bắt đầu.'
    );
    return;
  }

  for (let i = 0; i < weekRanges.length; i++) {
    if (start.getTime() <= weekRanges[i].end.getTime() && end.getTime() >= weekRanges[i].start.getTime()) {
      backgrounds[rowOffset][i] = color;
    }
  }
}


function docSoDongDaToGanttTongHopV1_() {
  const value = PropertiesService
    .getDocumentProperties()
    .getProperty(GANTT_BAR_TONG_HOP_V1.PROP_LAST_PAINTED_ROWS);
  const rows = Number(value);

  return isFinite(rows) && rows > 0 ? Math.floor(rows) : 0;
}


function luuSoDongDaToGanttTongHopV1_(rowCount) {
  PropertiesService
    .getDocumentProperties()
    .setProperty(
      GANTT_BAR_TONG_HOP_V1.PROP_LAST_PAINTED_ROWS,
      String(Math.max(0, Math.floor(Number(rowCount) || 0)))
    );
}


function laNgayHopLeGanttBarTongHopV1_(value) {
  return Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime());
}


function boGioGanttBarTongHopV1_(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toMauGanttTongHopV1() {
  return toMauGanttBarTienDoTongHopV1();
}

function toggleDuongGangKeHoachGocV1() {
  const props = PropertiesService.getDocumentProperties();
  const current = docHienThiDuongGangKeHoachGocV1_();
  const next = !current;

  props.setProperty(
    GANTT_BAR_TONG_HOP_V1.PROP_SHOW_BASELINE,
    next ? 'TRUE' : 'FALSE'
  );

  const message = next
    ? 'Đã bật hiển thị đường găng/kế hoạch gốc.'
    : 'Đã ẩn đường găng/kế hoạch gốc.';

  Logger.log(message);

  const result = toMauGanttBarTienDoTongHopV1();

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Quản lý tiến độ', 5);
  } catch (err) {
    Logger.log('Không thể hiển thị toast: ' + err.message);
  }

  return message + '\n' + result;
}

function docHienThiDuongGangKeHoachGocV1_() {
  const value = PropertiesService
    .getDocumentProperties()
    .getProperty(GANTT_BAR_TONG_HOP_V1.PROP_SHOW_BASELINE);

  // Mặc định là hiện baseline để không làm mất thông tin quản trị.
  if (value === null || value === '') return true;

  return String(value).trim().toUpperCase() !== 'FALSE';
}
