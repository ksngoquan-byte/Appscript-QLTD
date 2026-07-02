/**
 * Viewer Gantt chỉ đọc bằng HTML modal.
 */
const GANTT_WEB_ALIASES = {
  id: ['ID', 'Số tham chiếu', 'Ref', 'Ref gốc', 'STT', 'Mã số'],
  wbs: ['WBS', 'Mã cấu trúc', 'Cấp WBS', 'Nhóm WBS'],
  name: ['Công việc / Phạm vi', 'Tên công việc', 'Công việc', 'Nội dung công việc', 'Nội dung'],
  owner: ['Chủ trì', 'Phòng ban chủ trì', 'Đơn vị chủ trì', 'Bộ phận chủ trì'],
  predecessor: ['Công việc liên kết', 'Liên kết gốc', 'Tiền nhiệm', 'Predecessor'],
  start: ['Bắt đầu hiện hành', 'Ngày bắt đầu hiện hành', 'Ngày bắt đầu kế hoạch', 'Bắt đầu kế hoạch', 'Bắt đầu gốc', 'Ngày bắt đầu', 'Bắt đầu'],
  end: ['Kết thúc hiện hành', 'Ngày kết thúc hiện hành', 'Ngày kết thúc kế hoạch', 'Kết thúc kế hoạch', 'Kết thúc gốc', 'Ngày kết thúc', 'Kết thúc', 'Deadline'],
  status: ['Trạng thái thực hiện', 'Trạng thái', 'Tình trạng'],
  taskCode: ['Mã công việc'],
  warning: ['Cảnh báo tiến độ', 'Cảnh báo'],
  level: ['WBS_LEVEL_SYS', 'Level', 'WBS Level']
};


function showGanttWebAppViewer() {
  const html = HtmlService
    .createHtmlOutputFromFile('Gantt_WebApp')
    .setWidth(1400)
    .setHeight(850);

  SpreadsheetApp.getUi().showModalDialog(html, 'Gantt WebApp Viewer');
}


function ganttWeb_getTasks(filter) {
  const ss = getCurrentSpreadsheet_();
  const sheet = ganttWeb_findSourceSheet_(ss);
  const values = sheet.getDataRange().getValues();
  const detected = ganttWeb_detectHeaderAndCount_(values);

  if (!detected.headerRow) {
    throw new Error(detected.reason || 'Không tìm thấy dòng tiêu đề hợp lệ trong Tien_do_tong_hop.');
  }

  if (detected.validTaskCount === 0) {
    throw new Error('Đã tìm thấy Tien_do_tong_hop nhưng không có dòng đủ ID, tên, ngày bắt đầu và ngày kết thúc.');
  }

  const headerMap = detected.headerMap;
  const rows = values.slice(detected.headerRow);
  const tasks = [];

  rows.forEach(function(row) {
    const id = ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.id);
    const name = ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.name);
    const start = ganttWeb_toIsoDate_(ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.start));
    const end = ganttWeb_toIsoDate_(ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.end));

    if (!id || !name || !start || !end) return;

    const owner = ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.owner);
    const predecessor = ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.predecessor);
    const status = ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.status);
    const wbs = ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.wbs);
    const taskCode = ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.taskCode);
    const warning = ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.warning);
    const level = ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.level);
    const progress = ganttWeb_statusToProgress_(status);

    tasks.push({
      id: String(id),
      name: String(name),
      start: start,
      end: end,
      duration: ganttWeb_getDurationDays_(start, end),
      startDisplay: start,
      endDisplay: end,
      progress: progress,
      dependencies: ganttWeb_parseDependencies_(predecessor),
      custom_class: ganttWeb_getTaskClass_(status, warning, level, progress),
      owner: String(owner || ''),
      status: String(status || ''),
      wbs: String(wbs || ''),
      taskCode: String(taskCode || ''),
      predecessorRaw: String(predecessor || ''),
      warning: String(warning || ''),
      level: String(level || ''),
    });
  });

  return {
    sheetName: sheet.getName(),
    headerRow: detected.headerRow,
    taskCount: tasks.length,
    tasks: tasks,
  };
}


function ganttWeb_findSourceSheet_(ss) {
  const preferredNames = [
    'Tien_do_tong_hop',
    'Tiến độ tổng hợp',
    'TIEN_DO_TONG_HOP'
  ];

  for (const name of preferredNames) {
    const sh = ss.getSheetByName(name);
    if (sh) {
      return sh;
    }
  }

  throw new Error(
    'Không tìm thấy sheet nguồn `Tien_do_tong_hop`. Vui lòng kiểm tra lại tên sheet.'
  );
}


function ganttWeb_detectHeaderAndCount_(values) {
  const requiredAliases = [
    GANTT_WEB_ALIASES.id,
    GANTT_WEB_ALIASES.name,
    GANTT_WEB_ALIASES.start,
    GANTT_WEB_ALIASES.end,
  ];
  const scanRows = Math.min(50, values.length);

  for (let r = 0; r < scanRows; r++) {
    const headerMap = ganttWeb_buildHeaderMap_(values[r]);
    const hasRequired = requiredAliases.every(function(aliases) {
      return aliases.some(function(alias) {
        return headerMap[ganttWeb_normalizeHeader_(alias)] !== undefined;
      });
    });

    if (!hasRequired) continue;

    let validTaskCount = 0;
    values.slice(r + 1).forEach(function(row) {
      const id = ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.id);
      const name = ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.name);
      const start = ganttWeb_toIsoDate_(ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.start));
      const end = ganttWeb_toIsoDate_(ganttWeb_getByAliases_(row, headerMap, GANTT_WEB_ALIASES.end));

      if (id && name && start && end) validTaskCount++;
    });

    return {
      headerRow: r + 1,
      headerMap: headerMap,
      validTaskCount: validTaskCount,
      reason: validTaskCount ? '' : 'Đã tìm thấy header nhưng không có dòng đủ ID, tên, ngày bắt đầu và ngày kết thúc.',
    };
  }

  return {
    headerRow: 0,
    headerMap: {},
    validTaskCount: 0,
    reason: 'Không tìm thấy header đủ ID, tên, ngày bắt đầu và ngày kết thúc trong 50 dòng đầu của Tien_do_tong_hop.',
  };
}


function ganttWeb_debugSourceSheet() {
  const ss = getCurrentSpreadsheet_();
  const sh = ganttWeb_findSourceSheet_(ss);
  const values = sh.getDataRange().getValues();
  const detected = ganttWeb_detectHeaderAndCount_(values);

  Logger.log(JSON.stringify({
    sheetName: sh.getName(),
    headerRow: detected.headerRow,
    validTaskCount: detected.validTaskCount,
    reason: detected.reason || ''
  }, null, 2));

  return {
    sheetName: sh.getName(),
    headerRow: detected.headerRow,
    validTaskCount: detected.validTaskCount,
    reason: detected.reason || ''
  };
}


function ganttWeb_buildHeaderMap_(headers) {
  const map = {};

  (headers || []).forEach(function(header, index) {
    const key = ganttWeb_normalizeHeader_(header);
    if (key && map[key] === undefined) {
      map[key] = index;
    }
  });

  return map;
}


function ganttWeb_getByAliases_(row, headerMap, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const key = ganttWeb_normalizeHeader_(aliases[i]);
    const index = headerMap[key];

    if (index !== undefined) {
      const value = row[index];
      if (value !== null && value !== undefined && value !== '') return value;
    }
  }

  return '';
}


function ganttWeb_toIsoDate_(value) {
  if (!value) return '';

  let date = null;

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    date = value;
  } else if (typeof value === 'number') {
    date = new Date(Math.round((value - 25569) * 86400 * 1000));
  } else {
    const text = String(value).trim();
    let match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);

    if (match) {
      date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    } else {
      match = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (match) {
        date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      } else {
        const parsed = new Date(text);
        if (!isNaN(parsed.getTime())) date = parsed;
      }
    }
  }

  if (!date || isNaN(date.getTime())) return '';

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh',
    'yyyy-MM-dd'
  );
}


function ganttWeb_getDurationDays_(startIso, endIso) {
  if (!startIso || !endIso) return '';

  const start = new Date(startIso + 'T00:00:00');
  const end = new Date(endIso + 'T00:00:00');

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';

  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}


function ganttWeb_parseDependencies_(text) {
  if (!text) return '';

  const ids = [];
  String(text)
    .split(/[;,]/)
    .forEach(function(part) {
      const match = String(part).trim().match(/^\s*(\d+)/);
      if (match && ids.indexOf(match[1]) === -1) ids.push(match[1]);
    });

  return ids.join(',');
}


function ganttWeb_statusToProgress_(status) {
  const text = ganttWeb_normalizeHeader_(status);
  if (!text) return 0;
  if (text.indexOf('hoan thanh') !== -1 || text.indexOf('done') !== -1 || text.indexOf('complete') !== -1) return 100;
  if (text.indexOf('dang thuc hien') !== -1 || text.indexOf('doing') !== -1 || text.indexOf('progress') !== -1) return 50;
  if (text.indexOf('tam dung') !== -1 || text.indexOf('pause') !== -1 || text.indexOf('hold') !== -1) return 20;
  if (text.indexOf('chua thuc hien') !== -1 || text.indexOf('not started') !== -1) return 0;

  return 0;
}


function ganttWeb_escapeServerText_(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function ganttWeb_getTaskClass_(status, warning, level, progress) {
  const statusText = ganttWeb_normalizeHeader_(status);
  const warningText = ganttWeb_normalizeHeader_(warning);
  const numericLevel = Number(level);

  if (!isNaN(numericLevel) && numericLevel <= 1) return 'task-summary';
  if (progress >= 100 || statusText.indexOf('hoan thanh') !== -1) return 'task-done';
  if (
    warningText.indexOf('tre') !== -1 ||
    warningText.indexOf('qua han') !== -1 ||
    warningText.indexOf('late') !== -1 ||
    statusText.indexOf('tre') !== -1
  ) {
    return 'task-late';
  }
  if (progress > 0 || statusText.indexOf('dang thuc hien') !== -1) return 'task-doing';

  return 'task-normal';
}


function ganttWeb_normalizeHeader_(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}
