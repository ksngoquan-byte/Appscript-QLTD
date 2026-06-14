/*******************************************************
 * FILE: 25_Gantt_Period_View.js
 *
 * MỤC TIÊU
 * - Bổ sung chế độ Gantt theo WEEK / MONTH / QUARTER.
 * - Giữ logic tuần hiện tại làm mặc định/backward compatible.
 * - Chỉ thay đổi trục thời gian và cách tô bar từ cột J trở đi.
 *******************************************************/

const GANTT_PERIOD_VIEW_V1 = {
  PERIOD: {
    WEEK: 'WEEK',
    MONTH: 'MONTH',
    QUARTER: 'QUARTER',
  },

  SHEET: {
    SOURCE: 'Cong_viec',
    TARGET: 'Tien_do_tong_hop',
  },

  ROW: {
    SOURCE_START: 5,
    TARGET_HEADER: 4,
    TARGET_DATA_START: 5,
    HEADER_GROUP: 3,
    HEADER_PERIOD: 4,
  },

  COL: {
    TARGET_START: 1,
    TARGET_LEFT_COUNT: 9,
    GANTT_START: 10,
    SOURCE_REQUIRED_COUNT: 21,
  },

  LIMIT: {
    MAX_PERIODS: 260,
  },

  COLOR: {
    GROUP_HEADER_A: '#dbeafe',
    GROUP_HEADER_B: '#e5eef8',
    PERIOD_HEADER: '#f1f5f9',
    EMPTY_ODD: '#ffffff',
    EMPTY_EVEN: '#f8fbff',
    FORECAST: '#3B82F6',
    OVERDUE: '#EF4444',
    ACTUAL: '#22C55E',
    BASELINE: '#D1D5DB',
    CURRENT: '#F97316',
    BORDER: '#cbd5e1',
    GRID: '#edf2f7',
  },
};

function runTongHopGanttByPeriod(periodType) {
  const period = validateGanttPeriodTypeV1_(periodType);
  Logger.log('[GANTT_PERIOD] Start: ' + period);

  if (period === GANTT_PERIOD_VIEW_V1.PERIOD.WEEK) {
    if (typeof capNhatTienDoTongHopV1 !== 'function') {
      throw new Error('Thiếu hàm capNhatTienDoTongHopV1 để chạy Gantt theo tuần.');
    }

    Logger.log('[GANTT_PERIOD] WEEK dùng logic hiện tại capNhatTienDoTongHopV1.');
    return capNhatTienDoTongHopV1();
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = laySheetBatBuocGanttPeriodV1_(ss, GANTT_PERIOD_VIEW_V1.SHEET.SOURCE);
  const targetSheet = laySheetBatBuocGanttPeriodV1_(ss, GANTT_PERIOD_VIEW_V1.SHEET.TARGET);

  const data = docDuLieuTongHopGanttPeriodV1_(sourceSheet);

  ghiBangTraiTongHopGanttPeriodV1_(targetSheet, data.output);

  if (typeof dinhDangBangTraiTienDoTongHop3A_ === 'function') {
    dinhDangBangTraiTienDoTongHop3A_(
      targetSheet,
      GANTT_PERIOD_VIEW_V1.ROW.TARGET_HEADER,
      GANTT_PERIOD_VIEW_V1.ROW.TARGET_DATA_START,
      Math.max(data.output.length, 1)
    );
  }

  const ganttMessage = capNhatGanttTongHopTheoKyV1_(targetSheet, data.ganttRows, period);
  const message =
    'Đã cập nhật Tien_do_tong_hop theo ' +
    tenKyGanttPeriodV1_(period) +
    '. Số dòng dữ liệu: ' +
    data.output.length +
    '. ' +
    ganttMessage;

  Logger.log('[GANTT_PERIOD] ' + message);
  ss.toast(message, 'Quan ly tien do', 5);
  return message;
}

function validateGanttPeriodTypeV1_(periodType) {
  const value = String(periodType || '').trim().toUpperCase();
  const valid = GANTT_PERIOD_VIEW_V1.PERIOD;

  if (value === valid.WEEK || value === valid.MONTH || value === valid.QUARTER) {
    return value;
  }

  throw new Error('periodType không hợp lệ. Chỉ nhận WEEK, MONTH, QUARTER. Giá trị nhận được: ' + periodType);
}

function docDuLieuTongHopGanttPeriodV1_(sourceSheet) {
  const sourceLastRow = sourceSheet.getLastRow();
  const output = [];
  const ganttRows = [];

  if (sourceLastRow < GANTT_PERIOD_VIEW_V1.ROW.SOURCE_START) {
    return { output, ganttRows };
  }

  const sourceLastCol = Math.max(
    sourceSheet.getLastColumn(),
    GANTT_PERIOD_VIEW_V1.COL.SOURCE_REQUIRED_COUNT
  );

  if (sourceLastCol < GANTT_PERIOD_VIEW_V1.COL.SOURCE_REQUIRED_COUNT) {
    throw new Error('Sheet Cong_viec thiếu cột dữ liệu bắt buộc đến cột U.');
  }

  const values = sourceSheet
    .getRange(
      GANTT_PERIOD_VIEW_V1.ROW.SOURCE_START,
      1,
      sourceLastRow - GANTT_PERIOD_VIEW_V1.ROW.SOURCE_START + 1,
      sourceLastCol
    )
    .getValues();

  const baselineByRef = coHienThiBaselineChoGanttPeriodV1_()
    ? layBaselineActiveTheoRefChoGanttPeriodV1_()
    : {};

  values.forEach(function(row) {
    const wbs = row[1];              // B
    const id = row[6];               // G
    const taskName = row[7];         // H
    const owner = row[8];            // I
    const duration = row[9];         // J
    const predecessor = typeof chuanHoaTienNhiemHienThiTongHopV1_ === 'function'
      ? chuanHoaTienNhiemHienThiTongHopV1_(row[10])
      : row[10];
    const planStart = row[11];       // L
    const planEnd = row[12];         // M
    const status = row[17] || '';    // R
    const actualStart = row[18];     // S
    const actualFinish = row[19];    // T
    const updateNote = row[20];      // U

    const hasDisplayData =
      coGiaTriTongHopGanttPeriodV1_(wbs) ||
      coGiaTriTongHopGanttPeriodV1_(id) ||
      coGiaTriTongHopGanttPeriodV1_(taskName);

    if (!hasDisplayData) return;

    const currentStart = coGiaTriTongHopGanttPeriodV1_(actualStart) ? actualStart : planStart;
    const currentEnd = coGiaTriTongHopGanttPeriodV1_(actualFinish) ? actualFinish : planEnd;

    output.push([
      wbs,
      id,
      taskName,
      owner,
      duration,
      predecessor,
      currentStart,
      currentEnd,
      updateNote,
    ]);

    const normalizedRef = typeof chuanHoaRefBaselineGanttV1_ === 'function'
      ? chuanHoaRefBaselineGanttV1_(id)
      : String(id || '').trim();
    const baseline = baselineByRef[normalizedRef] || null;

    ganttRows.push({
      wbs: wbs,
      id: id,
      taskName: taskName,
      start: currentStart,
      end: currentEnd,
      actualStart: actualStart,
      actualFinish: actualFinish,
      status: status,
      baselineStart: baseline ? baseline.start : null,
      baselineEnd: baseline ? baseline.end : null,
    });
  });

  return { output, ganttRows };
}

function ghiBangTraiTongHopGanttPeriodV1_(targetSheet, output) {
  const header = [[
    'WBS',
    'ID',
    'Công việc / Phạm vi',
    'Chủ trì',
    'Số ngày kế hoạch',
    'Công việc liên kết',
    'Bắt đầu hiện hành',
    'Kết thúc hiện hành',
    'Ghi chú cập nhật',
  ]];

  targetSheet
    .getRange(
      GANTT_PERIOD_VIEW_V1.ROW.TARGET_HEADER,
      GANTT_PERIOD_VIEW_V1.COL.TARGET_START,
      1,
      GANTT_PERIOD_VIEW_V1.COL.TARGET_LEFT_COUNT
    )
    .setValues(header);

  const rowsToClear = Math.max(
    targetSheet.getLastRow() - GANTT_PERIOD_VIEW_V1.ROW.TARGET_DATA_START + 1,
    1
  );

  targetSheet
    .getRange(
      GANTT_PERIOD_VIEW_V1.ROW.TARGET_DATA_START,
      GANTT_PERIOD_VIEW_V1.COL.TARGET_START,
      rowsToClear,
      GANTT_PERIOD_VIEW_V1.COL.TARGET_LEFT_COUNT
    )
    .clearContent();

  if (output.length > 0) {
    targetSheet
      .getRange(
        GANTT_PERIOD_VIEW_V1.ROW.TARGET_DATA_START,
        GANTT_PERIOD_VIEW_V1.COL.TARGET_START,
        output.length,
        GANTT_PERIOD_VIEW_V1.COL.TARGET_LEFT_COUNT
      )
      .setValues(output);
  }
}

function capNhatGanttTongHopTheoKyV1_(sheet, ganttRows, periodType) {
  const validRanges = layKhoangNgayTongHopGanttPeriodV1_(ganttRows);
  donVungGanttTheoKyV1_(sheet);

  if (validRanges.length === 0) {
    Logger.log('[GANTT_PERIOD] Không có ngày hợp lệ để vẽ Gantt.');
    return 'Không có dữ liệu ngày hợp lệ để vẽ Gantt.';
  }

  const minStart = validRanges.reduce(function(min, range) {
    return range.start.getTime() < min.getTime() ? range.start : min;
  }, validRanges[0].start);

  const maxEnd = validRanges.reduce(function(max, range) {
    return range.end.getTime() > max.getTime() ? range.end : max;
  }, validRanges[0].end);

  const periods = taoDanhSachKyGanttPeriodV1_(minStart, maxEnd, periodType);
  const ganttEndCol = GANTT_PERIOD_VIEW_V1.COL.GANTT_START + periods.length - 1;

  if (sheet.getMaxColumns() < ganttEndCol) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), ganttEndCol - sheet.getMaxColumns());
  }

  capNhatThongSoTongQuanTheoKyV1_(sheet, periods[0].start, maxEnd, periods.length, periodType);
  veTimelineTheoKyV1_(sheet, periods, periodType);
  toMauBarTheoKyV1_(sheet, ganttRows, periods);
  highlightKyHienTaiV1_(sheet, periods);
  keVienDocNhomKyV1_(sheet, periods);

  sheet.setFrozenRows(4);
  sheet.setFrozenColumns(9);

  SpreadsheetApp.flush();
  return 'Số cột ' + tenKyGanttPeriodV1_(periodType) + ': ' + periods.length + '.';
}

function layKhoangNgayTongHopGanttPeriodV1_(ganttRows) {
  const ranges = [];

  (ganttRows || []).forEach(function(row, index) {
    themKhoangNgayNeuHopLeGanttPeriodV1_(ranges, row.start, row.end, index + 1, 'current');
    themKhoangNgayNeuHopLeGanttPeriodV1_(ranges, row.baselineStart, row.baselineEnd, index + 1, 'baseline');
  });

  return ranges;
}

function themKhoangNgayNeuHopLeGanttPeriodV1_(ranges, startValue, endValue, rowNumber, label) {
  if (!laNgayHopLeGanttPeriodV1_(startValue) && !laNgayHopLeGanttPeriodV1_(endValue)) return;

  if (!laNgayHopLeGanttPeriodV1_(startValue) || !laNgayHopLeGanttPeriodV1_(endValue)) {
    Logger.log('[GANTT_PERIOD] Bỏ qua ' + label + ' dòng ' + rowNumber + ': thiếu ngày bắt đầu hoặc kết thúc.');
    return;
  }

  const start = boGioGanttPeriodV1_(startValue);
  const end = boGioGanttPeriodV1_(endValue);

  if (end.getTime() < start.getTime()) {
    Logger.log('[GANTT_PERIOD] Bỏ qua ' + label + ' dòng ' + rowNumber + ': ngày kết thúc nhỏ hơn ngày bắt đầu.');
    return;
  }

  ranges.push({ start: start, end: end });
}

function donVungGanttTheoKyV1_(sheet) {
  const maxRows = sheet.getMaxRows();
  const maxCols = sheet.getMaxColumns();
  const startCol = GANTT_PERIOD_VIEW_V1.COL.GANTT_START;

  if (maxCols < startCol) return;

  sheet
    .getRange(
      GANTT_PERIOD_VIEW_V1.ROW.HEADER_GROUP,
      startCol,
      maxRows - GANTT_PERIOD_VIEW_V1.ROW.HEADER_GROUP + 1,
      maxCols - startCol + 1
    )
    .breakApart()
    .clearContent()
    .clearFormat()
    .clearNote();
}

function taoDanhSachKyGanttPeriodV1_(minStart, maxEnd, periodType) {
  const periods = [];
  let cursor = layDauKyGanttPeriodV1_(minStart, periodType);
  const endBoundary = layDauKyGanttPeriodV1_(maxEnd, periodType);

  while (cursor.getTime() <= endBoundary.getTime()) {
    const start = boGioGanttPeriodV1_(cursor);
    const end = layCuoiKyGanttPeriodV1_(start, periodType);

    periods.push({
      start: start,
      end: end,
      label: taoNhanKyGanttPeriodV1_(start, periodType),
      groupLabel: taoNhanNhomKyGanttPeriodV1_(start, periodType),
    });

    if (periods.length >= GANTT_PERIOD_VIEW_V1.LIMIT.MAX_PERIODS) {
      Logger.log('[GANTT_PERIOD] Vượt giới hạn kỳ, cắt tại ' + GANTT_PERIOD_VIEW_V1.LIMIT.MAX_PERIODS);
      break;
    }

    cursor = congMotKyGanttPeriodV1_(cursor, periodType);
  }

  if (periods.length === 0) {
    periods.push({
      start: layDauKyGanttPeriodV1_(new Date(), periodType),
      end: layCuoiKyGanttPeriodV1_(new Date(), periodType),
      label: taoNhanKyGanttPeriodV1_(new Date(), periodType),
      groupLabel: taoNhanNhomKyGanttPeriodV1_(new Date(), periodType),
    });
  }

  return periods;
}

function capNhatThongSoTongQuanTheoKyV1_(sheet, startDate, endDate, periodCount, periodType) {
  const now = new Date();

  sheet.getRange(2, 1, 1, 8).setValues([[
    'Từ ngày',
    startDate,
    'Đến ngày',
    endDate,
    'Số ' + tenKyGanttPeriodV1_(periodType),
    periodCount,
    'Cập nhật',
    now,
  ]]);

  sheet.getRange(2, 2, 1, 1).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(2, 4, 1, 1).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(2, 8, 1, 1).setNumberFormat('dd/MM/yyyy');
}

function veTimelineTheoKyV1_(sheet, periods, periodType) {
  const startCol = GANTT_PERIOD_VIEW_V1.COL.GANTT_START;
  const periodLabels = periods.map(function(period) { return period.label; });

  sheet
    .getRange(GANTT_PERIOD_VIEW_V1.ROW.HEADER_PERIOD, startCol, 1, periods.length)
    .setValues([periodLabels])
    .setFontWeight('bold')
    .setFontSize(8)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground(GANTT_PERIOD_VIEW_V1.COLOR.PERIOD_HEADER)
    .setBorder(true, true, true, true, true, true, GANTT_PERIOD_VIEW_V1.COLOR.BORDER, SpreadsheetApp.BorderStyle.SOLID);

  const segments = taoDoanNhomKyGanttPeriodV1_(periods);

  segments.forEach(function(seg, index) {
    const col = startCol + seg.startIndex;
    const width = seg.endIndex - seg.startIndex + 1;
    const bg = index % 2 === 0
      ? GANTT_PERIOD_VIEW_V1.COLOR.GROUP_HEADER_A
      : GANTT_PERIOD_VIEW_V1.COLOR.GROUP_HEADER_B;

    sheet
      .getRange(GANTT_PERIOD_VIEW_V1.ROW.HEADER_GROUP, col, 1, width)
      .merge()
      .setValue(seg.label)
      .setFontWeight('bold')
      .setFontSize(8)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setBackground(bg)
      .setBorder(true, true, true, true, false, false, '#94a3b8', SpreadsheetApp.BorderStyle.SOLID);
  });

  const width = periodType === GANTT_PERIOD_VIEW_V1.PERIOD.QUARTER ? 44 : 34;
  for (let col = startCol; col < startCol + periods.length; col++) {
    sheet.setColumnWidth(col, width);
  }
}

function toMauBarTheoKyV1_(sheet, ganttRows, periods) {
  if (!ganttRows || ganttRows.length === 0) return;

  const today = boGioGanttPeriodV1_(new Date());
  const showBaseline = coHienThiBaselineChoGanttPeriodV1_();
  const backgrounds = [];

  for (let r = 0; r < ganttRows.length; r++) {
    const row = ganttRows[r];
    const emptyColor = r % 2 === 0
      ? GANTT_PERIOD_VIEW_V1.COLOR.EMPTY_ODD
      : GANTT_PERIOD_VIEW_V1.COLOR.EMPTY_EVEN;
    const rowBg = new Array(periods.length).fill(emptyColor);

    if (
      showBaseline &&
      laNgayHopLeGanttPeriodV1_(row.baselineStart) &&
      laNgayHopLeGanttPeriodV1_(row.baselineEnd)
    ) {
      toMauKhoangNgayTheoKyV1_(rowBg, row.baselineStart, row.baselineEnd, periods, GANTT_PERIOD_VIEW_V1.COLOR.BASELINE);
    }

    if (laNgayHopLeGanttPeriodV1_(row.start) && laNgayHopLeGanttPeriodV1_(row.end)) {
      const start = boGioGanttPeriodV1_(row.start);
      const end = boGioGanttPeriodV1_(row.end);
      const actualStartOk = laNgayHopLeGanttPeriodV1_(row.actualStart);
      const actualFinishOk = laNgayHopLeGanttPeriodV1_(row.actualFinish);
      let color = GANTT_PERIOD_VIEW_V1.COLOR.FORECAST;

      if (actualStartOk && actualFinishOk) {
        color = GANTT_PERIOD_VIEW_V1.COLOR.ACTUAL;
      } else if (end.getTime() < today.getTime()) {
        color = GANTT_PERIOD_VIEW_V1.COLOR.OVERDUE;
      }

      toMauKhoangNgayTheoKyV1_(rowBg, start, end, periods, color);
    } else if (coGiaTriTongHopGanttPeriodV1_(row.start) || coGiaTriTongHopGanttPeriodV1_(row.end)) {
      Logger.log('[GANTT_PERIOD] Bỏ qua bar ID ' + row.id + ': thiếu ngày bắt đầu hoặc kết thúc.');
    }

    backgrounds.push(rowBg);
  }

  sheet
    .getRange(
      GANTT_PERIOD_VIEW_V1.ROW.TARGET_DATA_START,
      GANTT_PERIOD_VIEW_V1.COL.GANTT_START,
      ganttRows.length,
      periods.length
    )
    .setBackgrounds(backgrounds)
    .setBorder(true, true, true, true, true, true, GANTT_PERIOD_VIEW_V1.COLOR.GRID, SpreadsheetApp.BorderStyle.SOLID);
}

function toMauKhoangNgayTheoKyV1_(rowBg, startValue, endValue, periods, color) {
  const start = boGioGanttPeriodV1_(startValue);
  const end = boGioGanttPeriodV1_(endValue);

  if (end.getTime() < start.getTime()) return;

  for (let i = 0; i < periods.length; i++) {
    if (end.getTime() >= periods[i].start.getTime() && start.getTime() <= periods[i].end.getTime()) {
      rowBg[i] = color;
    }
  }
}

function highlightKyHienTaiV1_(sheet, periods) {
  const today = boGioGanttPeriodV1_(new Date());
  const index = periods.findIndex(function(period) {
    return today.getTime() >= period.start.getTime() && today.getTime() <= period.end.getTime();
  });

  if (index < 0) return;

  const col = GANTT_PERIOD_VIEW_V1.COL.GANTT_START + index;
  const height = Math.max(sheet.getLastRow() - GANTT_PERIOD_VIEW_V1.ROW.HEADER_GROUP + 1, 2);

  sheet
    .getRange(GANTT_PERIOD_VIEW_V1.ROW.HEADER_GROUP, col, height, 1)
    .setBorder(null, true, null, true, null, null, GANTT_PERIOD_VIEW_V1.COLOR.CURRENT, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

function keVienDocNhomKyV1_(sheet, periods) {
  if (!periods || periods.length === 0) return;

  let previous = '';
  const totalHeight = Math.max(sheet.getLastRow() - GANTT_PERIOD_VIEW_V1.ROW.HEADER_GROUP + 1, 2);

  periods.forEach(function(period, index) {
    if (index > 0 && period.groupLabel === previous) return;

    const col = GANTT_PERIOD_VIEW_V1.COL.GANTT_START + index;
    sheet
      .getRange(GANTT_PERIOD_VIEW_V1.ROW.HEADER_GROUP, col, totalHeight, 1)
      .setBorder(null, true, null, null, null, null, '#64748b', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

    previous = period.groupLabel;
  });
}

function taoDoanNhomKyGanttPeriodV1_(periods) {
  const segments = [];
  if (!periods || periods.length === 0) return segments;

  let startIndex = 0;
  let current = periods[0].groupLabel;

  for (let i = 1; i < periods.length; i++) {
    if (periods[i].groupLabel !== current) {
      segments.push({ startIndex: startIndex, endIndex: i - 1, label: current });
      startIndex = i;
      current = periods[i].groupLabel;
    }
  }

  segments.push({ startIndex: startIndex, endIndex: periods.length - 1, label: current });
  return segments;
}

function layDauKyGanttPeriodV1_(dateValue, periodType) {
  const date = boGioGanttPeriodV1_(dateValue);
  const year = date.getFullYear();
  const month = date.getMonth();

  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.MONTH) {
    return new Date(year, month, 1);
  }

  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.QUARTER) {
    return new Date(year, Math.floor(month / 3) * 3, 1);
  }

  throw new Error('layDauKyGanttPeriodV1_ chi dung cho MONTH/QUARTER.');
}

function layCuoiKyGanttPeriodV1_(dateValue, periodType) {
  const start = layDauKyGanttPeriodV1_(dateValue, periodType);

  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.MONTH) {
    return new Date(start.getFullYear(), start.getMonth() + 1, 0);
  }

  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.QUARTER) {
    return new Date(start.getFullYear(), start.getMonth() + 3, 0);
  }

  throw new Error('layCuoiKyGanttPeriodV1_ chi dung cho MONTH/QUARTER.');
}

function congMotKyGanttPeriodV1_(dateValue, periodType) {
  const start = layDauKyGanttPeriodV1_(dateValue, periodType);

  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.MONTH) {
    return new Date(start.getFullYear(), start.getMonth() + 1, 1);
  }

  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.QUARTER) {
    return new Date(start.getFullYear(), start.getMonth() + 3, 1);
  }

  throw new Error('congMotKyGanttPeriodV1_ chi dung cho MONTH/QUARTER.');
}

function taoNhanKyGanttPeriodV1_(dateValue, periodType) {
  const date = boGioGanttPeriodV1_(dateValue);

  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.MONTH) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'MM/yyyy');
  }

  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.QUARTER) {
    return 'Q' + (Math.floor(date.getMonth() / 3) + 1);
  }

  return '';
}

function taoNhanNhomKyGanttPeriodV1_(dateValue, periodType) {
  const date = boGioGanttPeriodV1_(dateValue);

  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.MONTH) {
    return String(date.getFullYear());
  }

  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.QUARTER) {
    return String(date.getFullYear());
  }

  return '';
}

function tenKyGanttPeriodV1_(periodType) {
  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.WEEK) return 'tuần';
  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.MONTH) return 'tháng';
  if (periodType === GANTT_PERIOD_VIEW_V1.PERIOD.QUARTER) return 'quý';
  return String(periodType || '');
}

function coHienThiBaselineChoGanttPeriodV1_() {
  if (typeof coHienThiBaselineGanttV1_ === 'function') {
    return coHienThiBaselineGanttV1_();
  }

  if (typeof docHienThiDuongGangKeHoachGocV1_ === 'function') {
    return docHienThiDuongGangKeHoachGocV1_();
  }

  return false;
}

function layBaselineActiveTheoRefChoGanttPeriodV1_() {
  if (typeof layBaselineActiveTheoRefGanttV1_ === 'function') {
    return layBaselineActiveTheoRefGanttV1_();
  }

  return {};
}

function laySheetBatBuocGanttPeriodV1_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet ' + sheetName);
  return sheet;
}

function coGiaTriTongHopGanttPeriodV1_(value) {
  if (value === null || typeof value === 'undefined') return false;
  if (laNgayHopLeGanttPeriodV1_(value)) return true;
  if (typeof value === 'string') return value.trim() !== '';
  return value !== '';
}

function laNgayHopLeGanttPeriodV1_(value) {
  return Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime());
}

function boGioGanttPeriodV1_(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}
