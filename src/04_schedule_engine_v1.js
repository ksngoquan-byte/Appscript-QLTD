const SCHEDULE_ENGINE_V1 = {
  SHEET_TASK: 'Cong_viec',
  SHEET_CONFIG: 'Cau_hinh',
  START_ROW: 5,
  CONFIG_ANCHOR_KEY: 'NGAY_NEO_KE_HOACH',
  TRIGGER_HANDLER: 'xuLySuaScheduleEngineV1',
  OLD_TRIGGER_HANDLERS: [
    'scheduleEngineOnEditV1',
    'runScheduler',
    'runScheduleEngineV1',
    'validatePlanning',
    'checkDependencyGraph',
    'runFullPipeline'
  ],
  COL: {
    MA_CONG_VIEC_MAU: 1,
    MA_CAU_TRUC: 2,
    HANG_MUC: 6,
    REF: 7,
    TASK_NAME: 8,
    DURATION: 10,
    PREDECESSOR: 11,
    START: 12,
    END: 13,
    ERROR: 17,
    ACTUAL_START: 19,
    ACTUAL_FINISH: 20
  }
};

function caiTriggerScheduleEngineV1() {
  const ss = SpreadsheetApp.getActive();
  const cfg = SCHEDULE_ENGINE_V1;

  ScriptApp.getProjectTriggers()
    .filter(t => {
      const handler = t.getHandlerFunction();
      return handler === cfg.TRIGGER_HANDLER || cfg.OLD_TRIGGER_HANDLERS.indexOf(handler) !== -1;
    })
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger(cfg.TRIGGER_HANDLER)
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  const message = 'Da cai trigger Schedule Engine V1.';
  Logger.log(message);
  return message;
}

function xuLySuaScheduleEngineV1(e) {
  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    const cfg = SCHEDULE_ENGINE_V1;

    const row = e.range.getRow();
    const editedCol = e.range.getColumn();
    const editedLastCol = editedCol + e.range.getNumColumns() - 1;

    if (sheetName === cfg.SHEET_CONFIG) {
      handleCauHinhEditLight_(e, sheet, row, editedCol, editedLastCol);
      return;
    }

    if (sheetName !== cfg.SHEET_TASK) return;
    if (row < cfg.START_ROW) return;

    handleCongViecEditLight_(e, sheet, row, editedCol, editedLastCol);
  } catch (err) {
    Logger.log('xuLySuaScheduleEngineV1: ' + err);
  }
}
function chayScheduleEngineV1(options) {
  options = options || {};
  return chayCoKhoa_(() => {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(SCHEDULE_ENGINE_V1.SHEET_TASK);
    if (!sheet) throw new Error('Khong tim thay sheet Cong_viec');

    const cfg = SCHEDULE_ENGINE_V1;
    const lastRow = sheet.getLastRow();
    if (lastRow < cfg.START_ROW) return;

    const numRows = lastRow - cfg.START_ROW + 1;
    const numCols = Math.max(sheet.getLastColumn(), cfg.COL.ACTUAL_FINISH);
    const data = sheet.getRange(cfg.START_ROW, 1, numRows, numCols).getValues();
    const anchorDate = layNgayNeoKeHoachV1_(ss);
    SCHEDULE_ENGINE_V1_NGAY_NGHI_SET_CACHE_ = null;

    const tasks = [];
    const taskByRef = {};

    data.forEach((row, index) => {
      if (!laDongCongViecScheduleV1_(row)) return;

      const rowIndex = cfg.START_ROW + index;
      const ref = chuanHoaRefV1_(row[cfg.COL.REF - 1]);
      const internalRef = ref || ('ROW_' + rowIndex);

      const task = {
        rowIndex,
        index,
        ref: internalRef,
        displayRef: ref,
        duration: docSoNgayV1_(row[cfg.COL.DURATION - 1]),
        predecessorText: row[cfg.COL.PREDECESSOR - 1],
        forecastStart: layNgayHopLeHoacNullV1_(row[cfg.COL.START - 1]),
        forecastEnd: layNgayHopLeHoacNullV1_(row[cfg.COL.END - 1]),
        actualStart: layNgayHopLeHoacNullV1_(row[cfg.COL.ACTUAL_START - 1]),
        actualFinish: layNgayHopLeHoacNullV1_(row[cfg.COL.ACTUAL_FINISH - 1]),
        predecessors: [],
        start: null,
        end: null,
        errors: []
      };

      tasks.push(task);

      if (ref && !taskByRef[ref]) {
        taskByRef[ref] = task;
      }
    });

    tasks.forEach(task => {

      const parsed = phanTichTienNhiemV1_(task.predecessorText, task.ref);
      task.predecessors = parsed.items;
      parsed.errors.forEach(code => task.errors.push(code));

      task.predecessors.forEach(pred => {
        if (!taskByRef[pred.ref]) {
          task.errors.push('ERR_REF_NOT_FOUND: ' + pred.ref);
        }
      });
    });

    danhDauLoiVongLapV1_(tasks, taskByRef);
    tinhLichCongViecV1_(tasks, taskByRef, anchorDate);
    ghiKetQuaScheduleV1_(sheet, tasks, numRows);
    if (options.normalizeFormat === true && typeof normalizeCongViecRowBackgrounds_ === 'function') {
      normalizeCongViecRowBackgrounds_(sheet);
    }
  });
}

function phanTichTienNhiemV1_(input, currentRef) {
  if (!coGiaTriV1_(input)) return { items: [], errors: [] };

  const text = String(input).toUpperCase().replace(/\s+/g, '');
  const parts = text.split(';').filter(Boolean);
  const items = [];
  const errors = [];
  const seen = {};

  parts.forEach(part => {
    let match = part.match(/^(\d+)$/);
    let ref;
    let type;
    let lag;

    if (match) {
      ref = String(Number(match[1]));
      type = 'FS';
      lag = 0;
    } else {
      match = part.match(/^(\d+)(FS|SS|FF)([+-]\d+)?$/);
      if (!match) {
        errors.push('ERR_SYNTAX: ' + part);
        return;
      }

      ref = String(Number(match[1]));
      type = match[2];
      lag = match[3] ? Number(match[3]) : 0;
    }

    if (ref === currentRef) {
      errors.push('ERR_SELF_LOOP: ' + ref);
      return;
    }

    const key = ref + '_' + type + '_' + lag;
    if (seen[key]) return;
    seen[key] = true;

    items.push({ ref, type, lag });
  });

  return { items, errors: layMaLoiDuyNhatV1_(errors) };
}
function tinhLichCongViecV1_(tasks, taskByRef, anchorDate) {
  const sorted = sapXepPhuThuocV1_(tasks, taskByRef);

  sorted.forEach(task => {
    if (task.errors.length) return;

    const startCandidates = [];
    const endCandidates = [];
    const startConstraintCandidates = [];
    const endConstraintCandidates = [];
    const actualStart = task.actualStart;
    const actualFinish = task.actualFinish;

    if (actualStart && actualFinish && actualFinish.getTime() < actualStart.getTime()) {
      task.errors.push('ERR_ACTUAL_FINISH_BEFORE_START');
      return;
    }

    task.predecessors.forEach(predInfo => {
      const pred = taskByRef[predInfo.ref];
      if (!pred) {
        task.errors.push('ERR_PREDECESSOR_NOT_SCHEDULED: ' + predInfo.ref);
        return;
      }

      if (predInfo.type === 'FS') {
        const predFinish = layNgayKetThucHieuLucV1_(pred);
        if (!predFinish) {
          task.errors.push('ERR_PREDECESSOR_NOT_SCHEDULED: ' + predInfo.ref);
          return;
        }

        const candidate = congNgayV1_(predFinish, 1 + predInfo.lag);
        startCandidates.push(candidate);
        startConstraintCandidates.push(candidate);
      }

      if (predInfo.type === 'SS') {
        const predStart = layNgayBatDauHieuLucV1_(pred);
        if (!predStart) {
          task.errors.push('ERR_PREDECESSOR_NOT_SCHEDULED: ' + predInfo.ref);
          return;
        }

        const candidate = congNgayV1_(predStart, predInfo.lag);
        startCandidates.push(candidate);
        startConstraintCandidates.push(candidate);
      }

      if (predInfo.type === 'FF') {
        const predFinish = layNgayKetThucHieuLucV1_(pred);
        if (!predFinish) {
          task.errors.push('ERR_PREDECESSOR_NOT_SCHEDULED: ' + predInfo.ref);
          return;
        }

        const candidate = congNgayV1_(predFinish, predInfo.lag);
        endCandidates.push(candidate);
        endConstraintCandidates.push(candidate);
      }
    });

    if (task.errors.length) return;

    if (task.duration && task.duration > 0) {
      endCandidates.forEach(endMin => {
        const candidate = tinhNgayBatDauTheoDurationV1_(endMin, task.duration);
        startCandidates.push(candidate);
        startConstraintCandidates.push(candidate);
      });
    }

    if (actualStart) startCandidates.push(actualStart);
    if (actualFinish) endCandidates.push(actualFinish);

    if (actualStart && actualFinish) {
      task.start = actualStart;
      task.end = actualFinish;
      task.duration = tinhSoNgayBaoGomV1_(task.start, task.end);
      danhDauXungDotActualV1_(task, startConstraintCandidates, endConstraintCandidates);
      return;
    }
    // Uu tien suy duration khi co dong thoi rang buoc dau va cuoi.
    // Vi du: 38SS;43FF => L lay theo 38SS, M lay theo 43FF, J tu tinh lai.
    // Quy tac: neu co ca start constraint va end constraint thi J khong giu so ngay cu.
    if (
      !actualStart &&
      !actualFinish &&
      startConstraintCandidates.length > 0 &&
      endConstraintCandidates.length > 0
    ) {
      task.start = layNgayLonNhatV1_(startConstraintCandidates);
      task.end = layNgayLonNhatV1_(endConstraintCandidates);

      if (task.end.getTime() < task.start.getTime()) {
        task.errors.push('ERR_DURATION_INFER_CONFLICT');
        task.start = null;
        task.end = null;
        return;
      }

      task.duration = tinhSoNgayBaoGomV1_(task.start, task.end);
      return;
    }

    if (actualFinish && (!task.duration || task.duration <= 0)) {
      task.errors.push('ERR_DURATION_EMPTY');
      return;
    }

    if (actualFinish && task.duration && task.duration > 0) {
      const startFromActualFinish = tinhNgayBatDauTheoDurationV1_(actualFinish, task.duration);
      startCandidates.push(startFromActualFinish);
    }

    if (task.duration && task.duration > 0) {
      let start;

      if (startCandidates.length > 0) {
        start = layNgayLonNhatV1_(startCandidates);
      } else if (task.predecessors.length === 0) {
        start = congNgayV1_(anchorDate, 0);
      } else {
        task.errors.push('ERR_PREDECESSOR_NOT_SCHEDULED');
        return;
      }

      task.start = start;
      task.end = actualFinish || tinhNgayKetThucTheoDurationV1_(task.start, task.duration);

      if (actualFinish) {
        const expectedStart = tinhNgayBatDauTheoDurationV1_(actualFinish, task.duration);
        if (task.start.getTime() > expectedStart.getTime()) {
          task.errors.push('ERR_ACTUAL_CONFLICT');
          task.start = expectedStart;
        }
      }

      if (actualStart) {
        danhDauXungDotActualV1_(task, startConstraintCandidates, endConstraintCandidates);
      }

      return;
    }

    if (startCandidates.length > 0 && endCandidates.length > 0) {
      task.start = layNgayLonNhatV1_(startCandidates);
      task.end = layNgayLonNhatV1_(endCandidates);

      if (task.end.getTime() < task.start.getTime()) {
        task.errors.push('ERR_DURATION_INFER_CONFLICT');
        task.start = null;
        task.end = null;
        return;
      }

      task.duration = tinhSoNgayBaoGomV1_(task.start, task.end);
      if (actualStart) {
        danhDauXungDotActualV1_(task, startConstraintCandidates, endConstraintCandidates);
      }
      return;
    }

    task.errors.push('ERR_DURATION_EMPTY');
  });
}
function sapXepPhuThuocV1_(tasks, taskByRef) {
  const visited = {};
  const visiting = {};
  const result = [];

  function visit(task) {
    if (!task || visited[task.ref]) return;

    if (visiting[task.ref]) {
      task.errors.push('ERR_CYCLE');
      return;
    }

    visiting[task.ref] = true;
    task.predecessors.forEach(pred => visit(taskByRef[pred.ref]));
    visiting[task.ref] = false;
    visited[task.ref] = true;
    result.push(task);
  }

  tasks.forEach(task => {
    if (task.ref) visit(task);
  });

  return result;
}

function danhDauLoiVongLapV1_(tasks, taskByRef) {
  const visiting = {};
  const visited = {};

  function visit(task, path) {
    if (!task || visited[task.ref]) return;

    if (visiting[task.ref]) {
      const cycleRefs = path.slice(path.indexOf(task.ref)).concat([task.ref]);
      cycleRefs.forEach(ref => {
        if (taskByRef[ref]) taskByRef[ref].errors.push('ERR_CYCLE');
      });
      return;
    }

    visiting[task.ref] = true;
    task.predecessors.forEach(pred => visit(taskByRef[pred.ref], path.concat([task.ref])));
    visiting[task.ref] = false;
    visited[task.ref] = true;
  }

  tasks.forEach(task => {
    if (task.ref) visit(task, []);
  });
}

function ghiKetQuaScheduleV1_(sheet, tasks, numRows) {
  const cfg = SCHEDULE_ENGINE_V1;
  const taskByIndex = {};
  tasks.forEach(task => {
    taskByIndex[task.index] = task;
  });

  const durationValues = [];
  const startValues = [];
  const endValues = [];
  const errorValues = [];
  const currentDurationValues = sheet
    .getRange(cfg.START_ROW, cfg.COL.DURATION, numRows, 1)
    .getValues();

  for (let i = 0; i < numRows; i++) {
    const task = taskByIndex[i];
    if (!task) {
      durationValues.push(['']);
      startValues.push(['']);
      endValues.push(['']);
      errorValues.push(['']);
      continue;
    }

    const oldDuration = currentDurationValues[i] ? currentDurationValues[i][0] : '';
    durationValues.push([task.duration || oldDuration || '']);
    startValues.push([task.start || '']);
    endValues.push([task.end || '']);
    errorValues.push([layMaLoiDuyNhatV1_(task.errors).join('; ')]);
  }

  sheet.getRange(cfg.START_ROW, cfg.COL.DURATION, numRows, 1).setValues(durationValues);
  sheet.getRange(cfg.START_ROW, cfg.COL.START, numRows, 1).setValues(startValues);
  sheet.getRange(cfg.START_ROW, cfg.COL.END, numRows, 1).setValues(endValues);
  sheet.getRange(cfg.START_ROW, cfg.COL.ERROR, numRows, 1).setValues(errorValues);

  sheet.getRange(cfg.START_ROW, cfg.COL.START, numRows, 2).setNumberFormat('dd/MM/yyyy');
}
function layNgayNeoKeHoachV1_(ss) {
  const cfg = SCHEDULE_ENGINE_V1;
  const sheet = ss.getSheetByName(cfg.SHEET_CONFIG);
  if (!sheet) return boGioV1_(new Date());

  const values = sheet.getDataRange().getValues();

  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (String(values[r][c]).trim() === cfg.CONFIG_ANCHOR_KEY) {
        const value = timGiaTriNgayNeoTrenDongV1_(values[r], c + 1);
        if (laNgayHopLeV1_(value)) return boGioV1_(value);
      }
    }
  }

  const fallback = sheet.getRange('D5').getValue();
  if (laNgayHopLeV1_(fallback)) return boGioV1_(fallback);

  return boGioV1_(new Date());
}

function timGiaTriNgayNeoTrenDongV1_(row, startIndex) {
  for (let c = startIndex; c < row.length; c++) {
    if (laNgayHopLeV1_(row[c])) return row[c];
  }
  return null;
}

function laDongCongViecScheduleV1_(row) {
  const col = SCHEDULE_ENGINE_V1.COL;
  if (typeof isDongCongViecChiTietV1_ === 'function') {
    return isDongCongViecChiTietV1_(row[col.MA_CAU_TRUC - 1], row[col.TASK_NAME - 1]);
  }

  return !coGiaTriV1_(row[col.MA_CAU_TRUC - 1]) && coGiaTriV1_(row[col.TASK_NAME - 1]);
}

function docSoNgayV1_(value) {
  if (!coGiaTriV1_(value)) return null;
  const duration = Number(value);
  return isFinite(duration) && duration > 0 && Math.floor(duration) === duration ? duration : null;
}

function chuanHoaRefV1_(value) {
  if (!coGiaTriV1_(value)) return '';
  const numberValue = Number(value);
  if (!isFinite(numberValue)) return String(value).trim();
  return String(numberValue);
}

function coGiaTriV1_(value) {
  return value !== null && value !== '' && typeof value !== 'undefined';
}

function laNgayHopLeV1_(value) {
  return Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime());
}

function layNgayHopLeHoacNullV1_(value) {
  return laNgayHopLeV1_(value) ? boGioV1_(value) : null;
}

function layNgayBatDauHieuLucV1_(task) {
  return task.actualStart || task.start || task.forecastStart || null;
}

function layNgayKetThucHieuLucV1_(task) {
  return task.actualFinish || task.end || task.forecastEnd || null;
}

function danhDauXungDotActualV1_(task, startConstraintCandidates, endConstraintCandidates) {
  if (task.actualStart && startConstraintCandidates.length > 0) {
    const maxStartConstraint = layNgayLonNhatV1_(startConstraintCandidates);
    if (maxStartConstraint.getTime() > task.actualStart.getTime()) {
      task.errors.push('ERR_ACTUAL_CONFLICT');
    }
  }

  if (task.actualFinish && endConstraintCandidates.length > 0) {
    const maxEndConstraint = layNgayLonNhatV1_(endConstraintCandidates);
    if (maxEndConstraint.getTime() > task.actualFinish.getTime()) {
      task.errors.push('ERR_ACTUAL_CONFLICT');
    }
  }
}

function layNgayLonNhatV1_(dates) {
  return boGioV1_(new Date(Math.max.apply(null, dates.map(d => d.getTime()))));
}

function tinhSoNgayBaoGomV1_(startDate, endDate) {
  const start = boGioV1_(startDate);
  const end = boGioV1_(endDate);

  if (!start || !end || end.getTime() < start.getTime()) return '';

  const ngayNghiSet = layNgayNghiSetScheduleV1_();

  // Nếu chưa có thư viện lịch làm việc thì fallback về cách đếm ngày lịch cũ.
  if (typeof cal_isNgayLamViec_ !== 'function') {
    return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  }

  let count = 0;
  const d = boGioV1_(start);

  while (d.getTime() <= end.getTime()) {
    if (cal_isNgayLamViec_(d, ngayNghiSet)) {
      count++;
    }
    d.setDate(d.getDate() + 1);
  }

  return count;
}


function tinhNgayKetThucTheoDurationV1_(startDate, duration) {
  const n = Number(duration || 0);
  const ngayNghiSet = layNgayNghiSetScheduleV1_();

  if (!n || n <= 0) return null;

  // Nếu chưa có thư viện lịch làm việc thì fallback về cách tính ngày lịch cũ.
  if (typeof cal_addNgayLamViec_ !== 'function') {
    const date = boGioV1_(startDate);
    date.setDate(date.getDate() + n - 1);
    return date;
  }

  return boGioV1_(cal_addNgayLamViec_(startDate, n, ngayNghiSet));
}

function tinhNgayBatDauTheoDurationV1_(endDate, duration) {
  const n = Number(duration || 0);
  const ngayNghiSet = layNgayNghiSetScheduleV1_();

  if (!n || n <= 0) return null;

  // Nếu chưa có thư viện lịch làm việc thì fallback về cách tính ngày lịch cũ.
  if (typeof cal_subtractNgayLamViec_ !== 'function') {
    const date = boGioV1_(endDate);
    date.setDate(date.getDate() - n + 1);
    return date;
  }

  return boGioV1_(cal_subtractNgayLamViec_(endDate, n, ngayNghiSet));
}
function congNgayV1_(value, days) {
  const n = Number(days || 0);
  const ngayNghiSet = layNgayNghiSetScheduleV1_();

  // Nếu chưa có thư viện lịch làm việc thì fallback về cách cộng ngày lịch cũ.
  if (typeof cal_shiftNgayLamViec_ !== 'function') {
    const date = boGioV1_(value);
    date.setDate(date.getDate() + n);
    return date;
  }

  return boGioV1_(cal_shiftNgayLamViec_(value, n, ngayNghiSet));
}

function boGioV1_(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function layMaLoiDuyNhatV1_(codes) {
  const seen = {};
  const result = [];
  codes.forEach(code => {
    if (!code || seen[code]) return;
    seen[code] = true;
    result.push(code);
  });
  return result;
}

function testScheduleEngineV1() {
  const anchor = new Date(2026, 0, 1);

  const case1 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('1', 6, '')
  ], anchor);
  assertScheduleV1_('Case 1 start', bangNgayV1_(case1['1'].start, anchor));
  assertScheduleV1_('Case 1 end', bangNgayV1_(case1['1'].end, new Date(2026, 0, 6)));
  assertScheduleV1_('Case 1 error', case1['1'].errors.length === 0);

  const case2 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('1', 6, ''),
    taoTaskTestScheduleV1_('2', 45, '1FS'),
    taoTaskTestScheduleV1_('3', 30, '2FS')
  ], anchor);
  assertScheduleV1_('Case 2 FS', bangNgayV1_(case2['2'].start, new Date(2026, 0, 7)));
  assertScheduleV1_('Case 3 FS', bangNgayV1_(case2['3'].start, new Date(2026, 1, 21)));

  const case4 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('1', 6, ''),
    taoTaskTestScheduleV1_('4', 10, '1SS+2')
  ], anchor);
  assertScheduleV1_('Case 4 SS+2', bangNgayV1_(case4['4'].start, new Date(2026, 0, 3)));

  const case5 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('1', 6, ''),
    taoTaskTestScheduleV1_('5', 3, '1FF-3')
  ], anchor);
  assertScheduleV1_('Case 5 FF-3 end', bangNgayV1_(case5['5'].end, new Date(2026, 0, 3)));

  const case6 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('1', 6, ''),
    taoTaskTestScheduleV1_('3', 30, '1FS'),
    taoTaskTestScheduleV1_('5', 3, '1FS'),
    taoTaskTestScheduleV1_('6', 4, '1FS; 3SS+2; 5FF-1')
  ], anchor);
  assertScheduleV1_('Case 6 max constraint', bangNgayV1_(case6['6'].start, new Date(2026, 0, 9)));

  const case7 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('7', 5, '99FS')
  ], anchor);
  assertScheduleV1_('Case 7 ref not found', case7['7'].errors.indexOf('ERR_REF_NOT_FOUND: 99') !== -1);
  assertScheduleV1_('Case 7 no dates', !case7['7'].start && !case7['7'].end);

  const case8 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('5', 5, '5FS')
  ], anchor);
  assertScheduleV1_('Case 8 self loop', case8['5'].errors.indexOf('ERR_SELF_LOOP: 5') !== -1);
  assertScheduleV1_('Case 8 no dates', !case8['5'].start && !case8['5'].end);

  const case9 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('1', 5, '2FS'),
    taoTaskTestScheduleV1_('2', 5, '3FS'),
    taoTaskTestScheduleV1_('3', 5, '1FS')
  ], anchor);
  assertScheduleV1_('Case 9 cycle 1', case9['1'].errors.indexOf('ERR_CYCLE') !== -1);
  assertScheduleV1_('Case 9 cycle 2', case9['2'].errors.indexOf('ERR_CYCLE') !== -1);
  assertScheduleV1_('Case 9 cycle 3', case9['3'].errors.indexOf('ERR_CYCLE') !== -1);
  assertScheduleV1_('Case 9 no dates', !case9['1'].start && !case9['2'].start && !case9['3'].start);

  const case10 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('10', null, '')
  ], anchor);
  assertScheduleV1_('Case 10 duration empty', case10['10'].errors.indexOf('ERR_DURATION_EMPTY') !== -1);
  assertScheduleV1_('Case 10 no dates', !case10['10'].start && !case10['10'].end);

  const actualFinish = new Date(2026, 4, 8);
  const case11 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('5', 4, '', null, actualFinish, null, new Date(2026, 4, 4)),
    taoTaskTestScheduleV1_('7', 10, '5FS')
  ], anchor);
  assertScheduleV1_('Case 11 FS actual finish start', bangNgayV1_(case11['7'].start, new Date(2026, 4, 9)));
  assertScheduleV1_('Case 11 FS actual finish end', bangNgayV1_(case11['7'].end, new Date(2026, 4, 18)));

  const case12 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('5', 4, '', null, actualFinish, null, new Date(2026, 4, 4)),
    taoTaskTestScheduleV1_('7', 10, '5FS+10')
  ], anchor);
  assertScheduleV1_('Case 12 FS+lag actual finish start', bangNgayV1_(case12['7'].start, new Date(2026, 4, 19)));
  assertScheduleV1_('Case 12 FS+lag actual finish end', bangNgayV1_(case12['7'].end, new Date(2026, 4, 28)));

  const case13 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('3', 10, '', new Date(2026, 4, 1), null),
    taoTaskTestScheduleV1_('4', 5, '3SS+2')
  ], anchor);
  assertScheduleV1_('Case 13 SS actual start', bangNgayV1_(case13['4'].start, new Date(2026, 4, 3)));

  const case14 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('3', 5, '', null, new Date(2026, 4, 10)),
    taoTaskTestScheduleV1_('4', 5, '3FF+2')
  ], anchor);
  assertScheduleV1_('Case 14 FF actual finish end', bangNgayV1_(case14['4'].end, new Date(2026, 4, 12)));
  assertScheduleV1_('Case 14 FF actual finish start', bangNgayV1_(case14['4'].start, new Date(2026, 4, 8)));

  const case15 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('15', null, '', new Date(2026, 4, 1), new Date(2026, 4, 5))
  ], anchor);
  assertScheduleV1_('Case 15 actual duration', case15['15'].duration === 5);
  assertScheduleV1_('Case 15 actual start', bangNgayV1_(case15['15'].start, new Date(2026, 4, 1)));
  assertScheduleV1_('Case 15 actual finish', bangNgayV1_(case15['15'].end, new Date(2026, 4, 5)));

  const case16 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('16', 5, '', new Date(2026, 4, 10), new Date(2026, 4, 9))
  ], anchor);
  assertScheduleV1_(
    'Case 16 actual finish before start',
    case16['16'].errors.indexOf('ERR_ACTUAL_FINISH_BEFORE_START') !== -1
  );

  const case17 = chayTestMangScheduleEngineV1_([
    taoTaskTestScheduleV1_('1', 4, '', null, new Date(2026, 4, 8)),
    taoTaskTestScheduleV1_('2', 3, '', new Date(2026, 4, 20), null),
    taoTaskTestScheduleV1_('3', 5, '1FS; 2SS+3')
  ], anchor);
  assertScheduleV1_('Case 17 multi pred actual tightest start', bangNgayV1_(case17['3'].start, new Date(2026, 4, 23)));
  assertScheduleV1_('Case 17 multi pred actual tightest end', bangNgayV1_(case17['3'].end, new Date(2026, 4, 27)));

  Logger.log('testScheduleEngineV1: PASS');
}

function chayTestMangScheduleEngineV1_(tasks, anchorDate) {
  const taskByRef = {};

  tasks.forEach(task => {
    taskByRef[task.ref] = task;
  });

  tasks.forEach(task => {
    const parsed = phanTichTienNhiemV1_(task.predecessorText, task.ref);
    task.predecessors = parsed.items;
    parsed.errors.forEach(code => task.errors.push(code));

    task.predecessors.forEach(pred => {
      if (!taskByRef[pred.ref]) {
        task.errors.push('ERR_REF_NOT_FOUND: ' + pred.ref);
      }
    });
  });

  danhDauLoiVongLapV1_(tasks, taskByRef);
  tinhLichCongViecV1_(tasks, taskByRef, anchorDate);

  return taskByRef;
}

function taoTaskTestScheduleV1_(ref, duration, predecessorText, actualStart, actualFinish, forecastStart, forecastEnd) {
  return {
    rowIndex: 0,
    index: 0,
    ref: String(ref),
    displayRef: String(ref),
    duration,
    predecessorText,
    forecastStart: layNgayHopLeHoacNullV1_(forecastStart),
    forecastEnd: layNgayHopLeHoacNullV1_(forecastEnd),
    actualStart: layNgayHopLeHoacNullV1_(actualStart),
    actualFinish: layNgayHopLeHoacNullV1_(actualFinish),
    predecessors: [],
    start: null,
    end: null,
    errors: []
  };
}

function bangNgayV1_(a, b) {
  return a && b && boGioV1_(a).getTime() === boGioV1_(b).getTime();
}

function assertScheduleV1_(name, ok) {
  if (!ok) {
    throw new Error('FAIL: ' + name);
  }
}

var SCHEDULE_ENGINE_V1_NGAY_NGHI_SET_CACHE_ = null;

function layNgayNghiSetScheduleV1_() {
  if (SCHEDULE_ENGINE_V1_NGAY_NGHI_SET_CACHE_) {
    return SCHEDULE_ENGINE_V1_NGAY_NGHI_SET_CACHE_;
  }

  if (typeof cal_getNgayNghiSet_ === 'function') {
    SCHEDULE_ENGINE_V1_NGAY_NGHI_SET_CACHE_ = cal_getNgayNghiSet_();
  } else {
    SCHEDULE_ENGINE_V1_NGAY_NGHI_SET_CACHE_ = new Set();
  }

  return SCHEDULE_ENGINE_V1_NGAY_NGHI_SET_CACHE_;
}





