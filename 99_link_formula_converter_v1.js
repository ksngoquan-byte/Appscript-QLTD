/****************************************************
 * 99_link_formula_converter_v1.js
 * Chuyển K - Công việc liên kết thành công thức động
 *
 * Mục tiêu:
 * - Người dùng nhập: 1; 3SS; 5FF+2
 * - Hệ thống chuyển thành công thức tra Ref ở cột G theo mã cố định cột O
 * - Khi xóa dòng, công thức vẫn tìm đúng task theo mã O còn lại
 *
 * Quy tắc v1:
 * - Hỗ trợ FS, SS, FF
 * - Không hỗ trợ SF
 * - Nếu chỉ nhập số: hiểu là FS+0
 * - Lead/Lag phải là số nguyên: +n hoặc -n
 * - Nhiều liên kết phân cách bằng dấu ;
 ****************************************************/

const LINK_FORMULA_V1 = {
  SHEET_NAME: 'Cong_viec',
  CONFIG_SHEET: 'Cau_hinh',
  START_ROW: 5,
  COL: {
    REF: 7,       // G - Số tham chiếu
    NAME: 8,      // H - Tên công việc
    DURATION: 10, // J - Số ngày kế hoạch
    LINK: 11,     // K - Công việc liên kết
    START: 12,    // L
    END: 13,      // M
    TASK_ID: 15,  // O - Mã công việc cố định
    ERROR: 17     // Q
  },
  LOOKUP_END_ROW: 999
};

/**
 * Chạy 1 lần để cài cơ chế công thức hóa Công việc liên kết.
 *
 * Hàm này sẽ:
 * - Cài data validation chặt cho cột K.
 * - Chuyển toàn bộ K hiện tại từ text sang công thức.
 * - Cài trigger onEdit để tự chuyển K khi nhập mới.
 * - Cài trigger onChange để tính lại schedule khi xóa dòng.
 * - Xóa các trigger cũ có thể gây trùng xử lý.
 */
function caiTriggerLinkFormulaConverterV1() {
  const ss = SpreadsheetApp.getActive();

  const handlersToRemove = [
    'scheduleLinkFormulaOnEditV1',
    'scheduleLinkFormulaOnChangeV1',
    'scheduleAutoOnEditV1',
    'refRelinkOnChangeV1',
    'refSnapshotOnEditV1',
    'xuLySuaScheduleEngineV1',
    'scheduleEngineOnEditV1'
  ];

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlersToRemove.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  damBaoMaCongViecChoLinkFormulaV1_();
  SpreadsheetApp.flush();
  capNhatDataValidationCongViecLienKetV1();
  chuyenTatCaCongViecLienKetThanhCongThucV1();
  SpreadsheetApp.flush();

  ScriptApp.newTrigger('scheduleLinkFormulaOnEditV1')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ScriptApp.newTrigger('scheduleLinkFormulaOnChangeV1')
    .forSpreadsheet(ss)
    .onChange()
    .create();

  if (typeof chayScheduleEngineV1 === 'function') {
    chayScheduleEngineV1();
  }

    const message =
    'Đã cài Link Formula Converter V1. ' +
    'Từ nay cột K - Công việc liên kết sẽ được chuyển thành công thức động. ' +
    'Khi xóa dòng, số tham chiếu trong K sẽ tự cập nhật theo cột G.';

  Logger.log(message);
  return message;
}

/**
 * Trigger khi người dùng sửa Sheet.
 */
function scheduleLinkFormulaOnEditV1(e) {
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(5000)) return;

  try {
    if (!e || !e.range) return;

    const range = e.range;
    const sheet = range.getSheet();
    const sheetName = sheet.getName();

    if (sheetName === LINK_FORMULA_V1.CONFIG_SHEET) {
      if (typeof chayScheduleEngineV1 === 'function') {
        chayScheduleEngineV1();
      }
      return;
    }

    if (sheetName !== LINK_FORMULA_V1.SHEET_NAME) return;

    const rowStart = range.getRow();
    const rowEnd = rowStart + range.getNumRows() - 1;
    const colStart = range.getColumn();
    const colEnd = colStart + range.getNumColumns() - 1;

    if (rowEnd < LINK_FORMULA_V1.START_ROW) return;

    const touchedLink = LINK_FORMULA_V1.COL.LINK >= colStart && LINK_FORMULA_V1.COL.LINK <= colEnd;
    const touchedScheduleInput = [
      LINK_FORMULA_V1.COL.NAME,
      LINK_FORMULA_V1.COL.DURATION,
      LINK_FORMULA_V1.COL.LINK
    ].some(col => col >= colStart && col <= colEnd);

    if (touchedLink) {
      damBaoMaCongViecChoLinkFormulaV1_();
      SpreadsheetApp.flush();
      chuyenVungCongViecLienKetThanhCongThucV1_(sheet, range);
      SpreadsheetApp.flush();
    }

    if (touchedScheduleInput && typeof chayScheduleEngineV1 === 'function') {
      chayScheduleEngineV1();
    }

  } catch (err) {
    Logger.log('scheduleLinkFormulaOnEditV1 error: ' + err);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Trigger khi xóa/thêm dòng.
 * Khi xóa dòng, công thức ở K tự cập nhật theo Google Sheets.
 * Việc còn lại là chạy lại Schedule Engine.
 */
function scheduleLinkFormulaOnChangeV1(e) {
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(5000)) return;

  try {
    const changeType = e && e.changeType ? String(e.changeType) : '';

    if (['REMOVE_ROW', 'INSERT_ROW', 'OTHER'].includes(changeType)) {
      capNhatDataValidationCongViecLienKetV1();

      if (typeof chayScheduleEngineV1 === 'function') {
        chayScheduleEngineV1();
      }
    }

  } catch (err) {
    Logger.log('scheduleLinkFormulaOnChangeV1 error: ' + err);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Chuyển toàn bộ dữ liệu hiện có ở K sang công thức.
 */
function chuyenTatCaCongViecLienKetThanhCongThucV1() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(LINK_FORMULA_V1.SHEET_NAME);

  if (!sheet) {
    throw new Error('Không tìm thấy sheet: ' + LINK_FORMULA_V1.SHEET_NAME);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < LINK_FORMULA_V1.START_ROW) return;

  const numRows = lastRow - LINK_FORMULA_V1.START_ROW + 1;
  const range = sheet.getRange(
    LINK_FORMULA_V1.START_ROW,
    LINK_FORMULA_V1.COL.LINK,
    numRows,
    1
  );

  chuyenRangeLienKetThanhCongThucV1_(sheet, range);
}

/**
 * Cập nhật data validation cột K.
 * Chặn:
 * - SF
 * - số thập phân
 * - 3+2
 * - dấu phẩy
 */
function capNhatDataValidationCongViecLienKetV1() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(LINK_FORMULA_V1.SHEET_NAME);

  if (!sheet) {
    throw new Error('Không tìm thấy sheet: ' + LINK_FORMULA_V1.SHEET_NAME);
  }

  const maxRows = sheet.getMaxRows();
  const numRows = Math.max(1, maxRows - LINK_FORMULA_V1.START_ROW + 1);

  const formula =
    '=OR(K5="";REGEXMATCH(UPPER(SUBSTITUTE(K5;" ";""));' +
    '"^(\\d+|\\d+(FS|SS|FF)([+-]\\d+)?)(;(\\d+|\\d+(FS|SS|FF)([+-]\\d+)?))*$"))';

  const rule = SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied(formula)
    .setAllowInvalid(false)
    .setHelpText(
      'Cú pháp v1: 1 | 3SS | 5FF+2 | 7FS-1 | 1; 3SS; 5FF+2. ' +
      'Chỉ hỗ trợ FS, SS, FF. Không hỗ trợ SF. Không dùng số thập phân. Không dùng dấu phẩy.'
    )
    .build();

  sheet
    .getRange(LINK_FORMULA_V1.START_ROW, LINK_FORMULA_V1.COL.LINK, numRows, 1)
    .setDataValidation(rule);

  sheet.getRange(4, LINK_FORMULA_V1.COL.LINK).setNote(
    'Cú pháp công việc liên kết v1:\n' +
    '[Số tham chiếu][FS/SS/FF][+/- số ngày]\n' +
    'Nếu chỉ nhập số thì hiểu là FS+0.\n' +
    'Nhiều liên kết phân cách bằng dấu chấm phẩy (;).\n' +
    'Ví dụ: 1; 3SS; 5FF+2.\n' +
    'Không hỗ trợ SF; không dùng số thập phân; không dùng dấu phẩy.'
  );
}

/**
 * Kiểm tra trigger đã cài chưa.
 */
function kiemTraTriggerLinkFormulaConverterV1() {
  const triggers = ScriptApp.getProjectTriggers();

  const onEditCount = triggers.filter(t => t.getHandlerFunction() === 'scheduleLinkFormulaOnEditV1').length;
  const onChangeCount = triggers.filter(t => t.getHandlerFunction() === 'scheduleLinkFormulaOnChangeV1').length;

  const message =
    'Trigger Link Formula Converter V1:\n\n' +
    'scheduleLinkFormulaOnEditV1: ' + onEditCount + '\n' +
    'scheduleLinkFormulaOnChangeV1: ' + onChangeCount;

  Logger.log(message);
  return message;
}

/**
 * Chuyển các ô K trong vùng vừa sửa.
 */
function chuyenVungCongViecLienKetThanhCongThucV1_(sheet, editedRange) {
  const rowStart = editedRange.getRow();
  const rowEnd = rowStart + editedRange.getNumRows() - 1;
  const colStart = editedRange.getColumn();
  const colEnd = colStart + editedRange.getNumColumns() - 1;

  const linkCol = LINK_FORMULA_V1.COL.LINK;

  if (linkCol < colStart || linkCol > colEnd) return;
  if (rowEnd < LINK_FORMULA_V1.START_ROW) return;

  const actualStartRow = Math.max(rowStart, LINK_FORMULA_V1.START_ROW);
  const actualNumRows = rowEnd - actualStartRow + 1;

  const linkRange = sheet.getRange(actualStartRow, linkCol, actualNumRows, 1);
  chuyenRangeLienKetThanhCongThucV1_(sheet, linkRange);
}

/**
 * Chuyển một range tại cột K sang công thức.
 */
function chuyenRangeLienKetThanhCongThucV1_(sheet, linkRange) {
  const refToTaskId = taoMapRefToTaskIdLienKetV1_(sheet);

  const values = linkRange.getDisplayValues();
  const formulas = linkRange.getFormulas();

  for (let i = 0; i < values.length; i++) {
    const cell = linkRange.getCell(i + 1, 1);
    const displayText = String(values[i][0] || '').trim();
    const currentFormula = String(formulas[i][0] || '').trim();

    if (!displayText) {
      if (currentFormula) cell.clearContent();
      continue;
    }

    // Nếu đã là công thức động theo mã O của hệ thống thì bỏ qua.
    if (laCongThucLienKetTheoMaOV1_(currentFormula)) {
      continue;
    }

    const result = taoCongThucLienKetTuTextV1_(displayText, refToTaskId);

    if (!result.ok) {
      // Không chuyển nếu sai cú pháp hoặc ref không tồn tại.
      // Schedule Engine sẽ ghi lỗi vào Q.
      Logger.log('Khong chuyen K thanh cong thuc: ' + result.error);
      continue;
    }

    cell.setFormula(result.formula);
  }
}

/**
 * Tạo map Ref -> mã công việc cố định O.
 */
function taoMapRefToTaskIdLienKetV1_(sheet) {
  const lastRow = sheet.getLastRow();
  const output = {};

  if (lastRow < LINK_FORMULA_V1.START_ROW) return output;

  const numRows = lastRow - LINK_FORMULA_V1.START_ROW + 1;

  const values = sheet
    .getRange(LINK_FORMULA_V1.START_ROW, 1, numRows, LINK_FORMULA_V1.COL.TASK_ID)
    .getDisplayValues();

  values.forEach((row, i) => {
    const refText = String(row[LINK_FORMULA_V1.COL.REF - 1] || '').trim();
    if (!refText) return;

    const ref = String(Number(refText));
    if (!ref || ref === 'NaN') return;

    const taskId = String(row[LINK_FORMULA_V1.COL.TASK_ID - 1] || '').trim();
    if (!taskId) return;

    output[ref] = taskId;
  });

  return output;
}

/**
 * Tạo công thức cho toàn bộ chuỗi liên kết.
 */
function taoCongThucLienKetTuTextV1_(text, refToTaskId) {
  const normalized = String(text || '')
    .toUpperCase()
    .replace(/\s+/g, '');

  if (!normalized) return { ok: true, formula: '' };

  const tokens = normalized.split(';').filter(Boolean);
  const formulaParts = [];

  for (let i = 0; i < tokens.length; i++) {
    const parsed = phanTichTokenLienKetV1_(tokens[i]);

    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    const taskId = refToTaskId[parsed.ref];

    if (!taskId) {
      return { ok: false, error: 'ERR_REF_NOT_FOUND: ' + parsed.ref };
    }

    formulaParts.push(taoCongThucTimRefTheoMaCongViecV1_(taskId, parsed.suffix, tokens[i]));
  }

  return {
    ok: true,
    formula: '=' + formulaParts.join('&"; "&')
  };
}

function taoCongThucTimRefTheoMaCongViecV1_(taskId, suffix, originalToken) {
  const safeTaskId = String(taskId).replace(/"/g, '""');
  const safeSuffix = String(suffix || '').replace(/"/g, '""');
  const safeToken = String(originalToken).replace(/"/g, '""');
  const endRow = LINK_FORMULA_V1.LOOKUP_END_ROW;
  const suffixFormula = safeSuffix ? '&"' + safeSuffix + '"' : '';

  return 'IFERROR(' +
    'INDEX($G$' + LINK_FORMULA_V1.START_ROW + ':$G$' + endRow + ';' +
    'MATCH("' + safeTaskId + '";' +
    'ARRAYFORMULA(TO_TEXT($O$' + LINK_FORMULA_V1.START_ROW + ':$O$' + endRow + '));0))' + suffixFormula +
    ';"#DEL:' + safeToken + '")';
}

function laCongThucLienKetTheoMaOV1_(formula) {
  const text = String(formula || '').toUpperCase();
  return text.indexOf('INDEX($G$') !== -1 &&
    text.indexOf('MATCH(') !== -1 &&
    text.indexOf('$O$') !== -1;
}

function damBaoMaCongViecChoLinkFormulaV1_() {
  if (typeof capMaCongViec === 'function') {
    capMaCongViec();
  }
}

/**
 * Parse 1 token liên kết.
 *
 * Hợp lệ:
 * - 1
 * - 1FS
 * - 3SS
 * - 5FF+2
 * - 7FS-1
 *
 * Không hợp lệ:
 * - 5SF
 * - 8SS-1.5
 * - 3+2
 */
function phanTichTokenLienKetV1_(token) {
  const raw = String(token || '').toUpperCase().trim();

  let m = raw.match(/^(\d+)$/);

  if (m) {
    return {
      ok: true,
      ref: String(Number(m[1])),
      suffix: ''
    };
  }

  m = raw.match(/^(\d+)(FS|SS|FF)([+-]\d+)?$/);

  if (m) {
    return {
      ok: true,
      ref: String(Number(m[1])),
      suffix: m[2] + (m[3] || '')
    };
  }

  return {
    ok: false,
    error: 'ERR_SYNTAX: ' + raw
  };
}

