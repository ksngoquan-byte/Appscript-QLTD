/**
 * DHTMLX Gantt viewer chỉ đọc, chạy song song viewer Frappe hiện tại.
 */
function showDhtmlxGanttViewer() {
  const html = HtmlService
    .createHtmlOutputFromFile('DHTMLX_Gantt_WebApp')
    .setWidth(1500)
    .setHeight(900);

  SpreadsheetApp.getUi().showModalDialog(html, 'DHTMLX Gantt Viewer');
}


function doGet(e) {
  if (qltdDevApiIsActionRequest(e)) {
    return qltdDevApiHandleGet(e);
  }

  const view = e && e.parameter ? e.parameter.view : '';

  if (view === 'dhtmlx') {
    return HtmlService
      .createHtmlOutputFromFile('DHTMLX_Gantt_WebApp')
      .setTitle('DHTMLX Gantt Viewer')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService
    .createHtmlOutput('<p>Gantt WebApp is running. Use ?view=dhtmlx</p>')
    .setTitle('Gantt WebApp');
}


function setDhtmlxGanttWebAppUrl() {
  const ui = SpreadsheetApp.getUi();

  const res = ui.prompt(
    'Cấu hình DHTMLX Gantt WebApp URL',
    'Dán URL WebApp đã deploy, dạng https://script.google.com/macros/s/.../exec',
    ui.ButtonSet.OK_CANCEL
  );

  if (res.getSelectedButton() !== ui.Button.OK) return;

  let url = String(res.getResponseText() || '').trim();

  if (!url) {
    ui.alert('URL trống.');
    return;
  }

  url = url.replace(/\?view=dhtmlx$/, '');

  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) {
    ui.alert(
      'URL không đúng định dạng WebApp /exec.\n\n' +
      'URL đúng có dạng:\n' +
      'https://script.google.com/macros/s/.../exec'
    );
    return;
  }

  PropertiesService
    .getScriptProperties()
    .setProperty('DHTMLX_GANTT_WEBAPP_URL', url);

  ui.alert('Đã lưu DHTMLX Gantt WebApp URL:\n' + url);
}


function openDhtmlxGanttWebAppTab() {
  const props = PropertiesService.getScriptProperties();

  let baseUrl = props.getProperty('DHTMLX_GANTT_WEBAPP_URL');

  if (!baseUrl) {
    baseUrl = ScriptApp.getService().getUrl();
  }

  if (!baseUrl) {
    SpreadsheetApp.getUi().alert(
      'Chưa có WebApp URL.\n\n' +
      'Hãy Deploy WebApp, sau đó chạy menu:\n' +
      '⚙️ Cấu hình DHTMLX WebApp URL'
    );
    return;
  }

  baseUrl = String(baseUrl).trim().replace(/\?view=dhtmlx$/, '');

  const url = baseUrl + '?view=dhtmlx';

  const safeUrl = url.replace(/"/g, '&quot;');

  const html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html>' +
    '<html>' +
    '<body style="font-family:Arial;padding:16px">' +
    '<p>Đang mở DHTMLX Gantt Viewer ở tab mới...</p>' +
    '<p>Nếu trình duyệt chặn popup, bấm vào link dưới đây:</p>' +
    '<p><a href="' + safeUrl + '" target="_blank">Mở DHTMLX Gantt Viewer</a></p>' +
    '<p style="font-size:12px;color:#666;word-break:break-all">' + safeUrl + '</p>' +
    '<script>' +
    'window.open("' + safeUrl + '", "_blank");' +
    'setTimeout(function(){ google.script.host.close(); }, 1000);' +
    '</script>' +
    '</body>' +
    '</html>'
  ).setWidth(520).setHeight(240);

  SpreadsheetApp.getUi().showModelessDialog(html, 'Mở DHTMLX Gantt WebApp');
}


const DHTMLX_GANTT_ALIAS = {
  wbs: ['WBS', 'Mã cấu trúc', 'Cấp WBS', 'Nhóm WBS'],
  id: ['ID', 'Số tham chiếu', 'Ref', 'Ref gốc', 'STT', 'Mã số'],
  text: ['Công việc / Phạm vi', 'Tên công việc', 'Công việc', 'Nội dung công việc', 'Nội dung'],
  owner: ['Chủ trì', 'Phòng ban chủ trì', 'Đơn vị chủ trì', 'Bộ phận chủ trì'],
  duration: ['Số ngày kế hoạch', 'Số ngày', 'Thời lượng', 'Duration'],
  predecessor: ['Công việc liên kết', 'Liên kết gốc', 'Tiền nhiệm', 'Predecessor'],
  start: ['Bắt đầu hiện hành', 'Ngày bắt đầu hiện hành', 'Ngày bắt đầu kế hoạch', 'Bắt đầu kế hoạch', 'Bắt đầu gốc', 'Ngày bắt đầu', 'Bắt đầu'],
  end: ['Kết thúc hiện hành', 'Ngày kết thúc hiện hành', 'Ngày kết thúc kế hoạch', 'Kết thúc kế hoạch', 'Kết thúc gốc', 'Ngày kết thúc', 'Kết thúc', 'Deadline'],
  note: ['Ghi chú cập nhật', 'Ghi chú', 'Note'],
  status: ['Trạng thái thực hiện', 'Trạng thái', 'Tình trạng'],
  taskCode: ['Mã công việc'],
};


const CONG_VIEC_STATUS_ALIASES = {
  ref: ['Số tham chiếu', 'ID', 'Ref', 'Ref gốc'],
  taskCode: ['Mã công việc'],
  status: ['Trạng thái thực hiện', 'Trạng thái', 'Tình trạng'],
  actualStart: ['Bắt đầu thực tế', 'Ngày bắt đầu thực tế'],
  actualFinish: ['Hoàn thành thực tế', 'Ngày hoàn thành thực tế', 'Kết thúc thực tế'],
  updateNote: ['Ghi chú cập nhật'],
  updateDate: ['Ngày cập nhật'],
  warning: ['Cảnh báo tiến độ', 'Cảnh báo'],
};


function dhtmlxGantt_getData(filter) {
  const ss = getCurrentSpreadsheet_();
  const sh = ss.getSheetByName('Tien_do_tong_hop');

  if (!sh) {
    throw new Error('Không tìm thấy sheet Tien_do_tong_hop.');
  }

  const values = sh.getDataRange().getValues();
  const detected = dhtmlxGantt_detectHeader_(values);
  const headerMap = detected.headerMap;
  const rows = values.slice(detected.headerRow);
  const rawTasks = [];
  const owners = {};
  const statuses = {};
  const executionStatuses = {};
  const scheduleStatuses = {};
  const statusMap = dhtmlxGantt_buildCongViecStatusMap_(ss);
  const statusSource = {
    found: statusMap.found,
    matchedByRefCount: 0,
    matchedByTaskCodeCount: 0,
    unmatchedCount: 0,
  };

  rows.forEach(function(row) {
    const id = dhtmlxGantt_getByAliases_(row, headerMap, DHTMLX_GANTT_ALIAS.id);
    const text = dhtmlxGantt_getByAliases_(row, headerMap, DHTMLX_GANTT_ALIAS.text);
    const start = dhtmlxGantt_toIsoDate_(dhtmlxGantt_getByAliases_(row, headerMap, DHTMLX_GANTT_ALIAS.start));
    const end = dhtmlxGantt_toIsoDate_(dhtmlxGantt_getByAliases_(row, headerMap, DHTMLX_GANTT_ALIAS.end));

    if (!id || !text || !start || !end) return;

    const wbs = String(dhtmlxGantt_getByAliases_(row, headerMap, DHTMLX_GANTT_ALIAS.wbs) || '').trim();
    const owner = String(dhtmlxGantt_getByAliases_(row, headerMap, DHTMLX_GANTT_ALIAS.owner) || '').trim();
    const status = String(dhtmlxGantt_getByAliases_(row, headerMap, DHTMLX_GANTT_ALIAS.status) || '').trim();
    const predecessor = String(dhtmlxGantt_getByAliases_(row, headerMap, DHTMLX_GANTT_ALIAS.predecessor) || '').trim();
    const note = String(dhtmlxGantt_getByAliases_(row, headerMap, DHTMLX_GANTT_ALIAS.note) || '').trim();
    const taskCode = String(dhtmlxGantt_getByAliases_(row, headerMap, DHTMLX_GANTT_ALIAS.taskCode) || '').trim();
    const durationValue = dhtmlxGantt_getByAliases_(row, headerMap, DHTMLX_GANTT_ALIAS.duration);
    const duration = dhtmlxGantt_getDuration_(durationValue, start, end);
    const idText = String(id);
    const matchedByRef = statusMap.byRef[idText];
    const matchedByTaskCode = !matchedByRef && taskCode ? statusMap.byTaskCode[taskCode] : null;
    const matched = matchedByRef || matchedByTaskCode || {};
    const statusRaw = matched.statusRaw || status || '';
    const updateNote = matched.updateNote || note || '';
    const executionStatusNorm = dhtmlxGantt_normalizeExecutionStatus_(statusRaw);
    const executionStatusLabel = dhtmlxGantt_getExecutionStatusLabel_(executionStatusNorm);
    const scheduleInfo = dhtmlxGantt_classifyScheduleStatus_({
      executionStatusNorm: executionStatusNorm,
      startDateIso: start,
      endDateIso: end,
      actualStartIso: matched.actualStart || '',
      actualFinishIso: matched.actualFinish || '',
    });

    if (owner) owners[owner] = true;
    if (statusRaw) statuses[statusRaw] = true;
    executionStatuses[executionStatusNorm] = executionStatusLabel;
    scheduleStatuses[scheduleInfo.scheduleStatus] = scheduleInfo.scheduleStatusLabel;

    if (matchedByRef) {
      statusSource.matchedByRefCount++;
    } else if (matchedByTaskCode) {
      statusSource.matchedByTaskCodeCount++;
    } else {
      statusSource.unmatchedCount++;
    }

    rawTasks.push({
      id: idText,
      text: String(text),
      start_date: start,
      end_date: end,
      duration: duration,
      parent: 0,
      open: true,
      wbs: wbs,
      owner: owner,
      predecessorRaw: predecessor,
      note: note,
      status: status,
      taskCode: taskCode,
      statusRaw: statusRaw,
      executionStatusRaw: statusRaw,
      executionStatusNorm: executionStatusNorm,
      executionStatusLabel: executionStatusLabel,
      actualStart: matched.actualStart || '',
      actualFinish: matched.actualFinish || '',
      updateNote: updateNote,
      updateDate: matched.updateDate || '',
      warning: matched.warning || '',
      scheduleStatus: scheduleInfo.scheduleStatus,
      scheduleStatusLabel: scheduleInfo.scheduleStatusLabel,
      progressStatus: scheduleInfo.scheduleStatus,
      progressStatusLabel: scheduleInfo.scheduleStatusLabel,
      isDone: scheduleInfo.isDone,
      isDoneLate: scheduleInfo.isDoneLate,
      isOverdue: scheduleInfo.isOverdue,
      isPaused: scheduleInfo.isPaused,
      isPausedOverdue: scheduleInfo.isPausedOverdue,
      isInProgressOnTime: scheduleInfo.isInProgressOnTime,
      isNotStartedOnTime: scheduleInfo.isNotStartedOnTime,
      isUnknown: scheduleInfo.isUnknown,
      isInProgressByDate: scheduleInfo.isInProgressOnTime,
      isFuture: scheduleInfo.isNotStartedOnTime,
      progress: scheduleInfo.progress,
    });
  });

  const wbsToTaskId = {};
  rawTasks.forEach(function(task) {
    if (task.wbs) wbsToTaskId[task.wbs] = task.id;
  });

  rawTasks.forEach(function(task) {
    const parentWbs = dhtmlxGantt_getParentWbs_(task.wbs);
    task.parent = parentWbs && wbsToTaskId[parentWbs] ? wbsToTaskId[parentWbs] : 0;
  });

  const taskIds = {};
  rawTasks.forEach(function(task) {
    taskIds[task.id] = true;
  });

  const links = [];
  rawTasks.forEach(function(task) {
    dhtmlxGantt_parseDependencies_(task.predecessorRaw, task.id).forEach(function(link) {
      if (taskIds[link.source]) links.push(link);
    });
  });

  return {
    ok: true,
    sheetName: sh.getName(),
    meta: {
      projectName: dhtmlxGantt_getProjectName_(ss),
      spreadsheetName: ss.getName(),
      sheetName: sh.getName(),
      updatedAt: Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh',
        'yyyy-MM-dd HH:mm'
      ),
    },
    taskCount: rawTasks.length,
    linkCount: links.length,
    data: rawTasks,
    links: links,
    owners: Object.keys(owners).sort(),
    statuses: Object.keys(statuses).sort(),
    executionStatuses: executionStatuses,
    scheduleStatuses: scheduleStatuses,
    progressStatuses: scheduleStatuses,
    statusSource: statusSource,
  };
}


function dhtmlxGantt_getProjectName_(ss) {
  const configured = String(
    PropertiesService.getScriptProperties().getProperty('DHTMLX_GANTT_PROJECT_NAME') || ''
  ).trim();

  if (configured) return configured;

  const spreadsheetName = String(ss && ss.getName ? ss.getName() : '').trim();
  const normalized = dhtmlxGantt_normalizeHeader_(spreadsheetName);

  if (normalized.indexOf('nam cam') !== -1) return 'Nam Cấm';
  if (normalized.indexOf('hung loc') !== -1) return 'Hưng Lộc';

  return spreadsheetName
    .replace(/\b(qltd|quan ly tien do|tien do|gantt|template)\b/ig, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function dhtmlxGantt_buildCongViecStatusMap_(ss) {
  const sh = ss.getSheetByName('Cong_viec');

  if (!sh) {
    return {
      byRef: {},
      byTaskCode: {},
      found: false,
      reason: 'Không tìm thấy sheet Cong_viec',
    };
  }

  const values = sh.getDataRange().getValues();
  const detected = dhtmlxGantt_detectCongViecStatusHeader_(values);

  if (!detected) {
    return {
      byRef: {},
      byTaskCode: {},
      found: false,
      reason: 'Không tìm thấy header trạng thái phù hợp trong sheet Cong_viec',
    };
  }

  const byRef = {};
  const byTaskCode = {};
  const rows = values.slice(detected.headerRow);

  rows.forEach(function(row) {
    const ref = String(dhtmlxGantt_getByAliases_(row, detected.headerMap, CONG_VIEC_STATUS_ALIASES.ref) || '').trim();
    const taskCode = String(dhtmlxGantt_getByAliases_(row, detected.headerMap, CONG_VIEC_STATUS_ALIASES.taskCode) || '').trim();
    const status = String(dhtmlxGantt_getByAliases_(row, detected.headerMap, CONG_VIEC_STATUS_ALIASES.status) || '').trim();

    if (!ref && !taskCode) return;

    const record = {
      ref: ref,
      taskCode: taskCode,
      statusRaw: status,
      actualStart: dhtmlxGantt_toIsoDate_(dhtmlxGantt_getByAliases_(row, detected.headerMap, CONG_VIEC_STATUS_ALIASES.actualStart)),
      actualFinish: dhtmlxGantt_toIsoDate_(dhtmlxGantt_getByAliases_(row, detected.headerMap, CONG_VIEC_STATUS_ALIASES.actualFinish)),
      updateNote: String(dhtmlxGantt_getByAliases_(row, detected.headerMap, CONG_VIEC_STATUS_ALIASES.updateNote) || '').trim(),
      updateDate: dhtmlxGantt_toIsoDate_(dhtmlxGantt_getByAliases_(row, detected.headerMap, CONG_VIEC_STATUS_ALIASES.updateDate)),
      warning: String(dhtmlxGantt_getByAliases_(row, detected.headerMap, CONG_VIEC_STATUS_ALIASES.warning) || '').trim(),
    };

    if (ref) byRef[ref] = record;
    if (taskCode) byTaskCode[taskCode] = record;
  });

  return {
    byRef: byRef,
    byTaskCode: byTaskCode,
    found: true,
    reason: '',
  };
}


function dhtmlxGantt_detectCongViecStatusHeader_(values) {
  const scanRows = Math.min(50, values.length);

  for (let r = 0; r < scanRows; r++) {
    const headerMap = dhtmlxGantt_buildHeaderMap_(values[r]);
    const hasRef = CONG_VIEC_STATUS_ALIASES.ref.some(function(alias) {
      return headerMap[dhtmlxGantt_normalizeHeader_(alias)] !== undefined;
    });
    const hasStatus = CONG_VIEC_STATUS_ALIASES.status.some(function(alias) {
      return headerMap[dhtmlxGantt_normalizeHeader_(alias)] !== undefined;
    });

    if (hasRef && hasStatus) {
      return {
        headerRow: r + 1,
        headerMap: headerMap,
      };
    }
  }

  return null;
}


function dhtmlxGantt_normalizeExecutionStatus_(statusRaw) {
  const s = dhtmlxGantt_normalizeHeader_(statusRaw);

  if (!s) return 'NOT_STARTED';

  if (s.indexOf('hoan thanh') !== -1 || s.indexOf('done') !== -1 || s.indexOf('complete') !== -1) {
    return 'DONE';
  }

  if (
    s.indexOf('dang lam') !== -1 ||
    s.indexOf('dang thuc hien') !== -1 ||
    s.indexOf('in progress') !== -1 ||
    s.indexOf('doing') !== -1
  ) {
    return 'IN_PROGRESS';
  }

  if (s.indexOf('tam dung') !== -1 || s.indexOf('pause') !== -1 || s.indexOf('hold') !== -1) {
    return 'PAUSED';
  }

  if (s.indexOf('chua bat dau') !== -1 || s.indexOf('chua thuc hien') !== -1) {
    return 'NOT_STARTED';
  }

  return 'UNKNOWN';
}


function dhtmlxGantt_getExecutionStatusLabel_(norm) {
  switch (norm) {
    case 'DONE':
      return 'Hoàn thành';
    case 'IN_PROGRESS':
      return 'Đang làm';
    case 'PAUSED':
      return 'Tạm dừng';
    case 'NOT_STARTED':
      return 'Chưa bắt đầu';
    default:
      return 'Không xác định';
  }
}


function dhtmlxGantt_classifyScheduleStatus_(args) {
  args = args || {};

  const executionStatusNorm = args.executionStatusNorm || 'UNKNOWN';
  const startDateIso = args.startDateIso || '';
  const endDateIso = args.endDateIso || '';
  const actualStartIso = args.actualStartIso || '';
  const actualFinishIso = args.actualFinishIso || '';
  const todayIso = args.todayIso || Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh',
    'yyyy-MM-dd'
  );
  const result = {
    scheduleStatus: 'UNKNOWN',
    scheduleStatusLabel: 'Không xác định',
    isDone: false,
    isDoneLate: false,
    isOverdue: false,
    isPaused: false,
    isPausedOverdue: false,
    isInProgressOnTime: false,
    isNotStartedOnTime: false,
    isUnknown: false,
    progress: 0,
  };

  if (!startDateIso || !endDateIso) {
    result.isUnknown = true;
    return result;
  }

  if (executionStatusNorm === 'DONE' || actualFinishIso) {
    if (actualFinishIso && actualFinishIso > endDateIso) {
      result.scheduleStatus = 'DONE_LATE';
      result.scheduleStatusLabel = 'Hoàn thành trễ';
      result.isDoneLate = true;
    } else {
      result.scheduleStatus = 'DONE_ON_TIME';
      result.scheduleStatusLabel = 'Hoàn thành đúng hạn';
    }
    result.isDone = true;
    result.progress = 1;
    return result;
  }

  if (executionStatusNorm === 'PAUSED') {
    if (endDateIso < todayIso) {
      result.scheduleStatus = 'PAUSED_OVERDUE';
      result.scheduleStatusLabel = 'Tạm dừng quá hạn';
      result.isPausedOverdue = true;
    } else {
      result.scheduleStatus = 'PAUSED_ON_TIME';
      result.scheduleStatusLabel = 'Tạm dừng trong hạn';
    }
    result.isPaused = true;
    result.progress = 0.5;
    return result;
  }

  if (endDateIso < todayIso) {
    result.scheduleStatus = 'OVERDUE';
    result.scheduleStatusLabel = 'Quá hạn';
    result.isOverdue = true;
    result.progress = 0.5;
    return result;
  }

  if (executionStatusNorm === 'IN_PROGRESS' || actualStartIso) {
    result.scheduleStatus = 'IN_PROGRESS_ON_TIME';
    result.scheduleStatusLabel = 'Đang làm trong hạn';
    result.isInProgressOnTime = true;
    result.progress = 0.5;
    return result;
  }

  if (!actualStartIso) {
    result.scheduleStatus = 'NOT_STARTED_ON_TIME';
    result.scheduleStatusLabel = 'Chưa bắt đầu trong hạn';
    result.isNotStartedOnTime = true;
    result.progress = 0;
    return result;
  }

  result.isUnknown = true;
  return result;
}


function dhtmlxGantt_getProgressStatus_(statusRaw, startIso, endIso, actualFinishIso) {
  const statusText = dhtmlxGantt_normalizeHeader_(statusRaw);
  const isDone = Boolean(
    actualFinishIso ||
    statusText.indexOf('hoan thanh') !== -1 ||
    statusText.indexOf('done') !== -1 ||
    statusText.indexOf('complete') !== -1
  );
  const result = {
    progressStatus: 'UNKNOWN',
    progressStatusLabel: 'Không xác định',
    isDone: isDone,
    isOverdue: false,
    isInProgressByDate: false,
    isFuture: false,
    progress: 0,
  };

  if (isDone) {
    result.progressStatus = 'DONE';
    result.progressStatusLabel = 'Đã hoàn thành';
    result.progress = 1;
    return result;
  }

  if (!startIso || !endIso) return result;

  const today = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh',
    'yyyy-MM-dd'
  );

  if (endIso < today) {
    result.progressStatus = 'OVERDUE';
    result.progressStatusLabel = 'Quá hạn';
    result.isOverdue = true;
    result.progress = Math.max(dhtmlxGantt_statusToProgress_(statusRaw), 0.2);
  } else if (startIso <= today && today <= endIso) {
    result.progressStatus = 'IN_PROGRESS';
    result.progressStatusLabel = 'Đang thực hiện';
    result.isInProgressByDate = true;
    result.progress = Math.max(dhtmlxGantt_statusToProgress_(statusRaw), 0.5);
  } else if (startIso > today) {
    result.progressStatus = 'NOT_STARTED';
    result.progressStatusLabel = 'Chưa thực hiện';
    result.isFuture = true;
    result.progress = 0;
  }

  return result;
}


function dhtmlxGantt_statusMappingDiagnostic() {
  const data = dhtmlxGantt_getData({});
  const tasks = data.data || [];
  const executionStatusCount = {
    done: tasks.filter(function(t) { return t.executionStatusNorm === 'DONE'; }).length,
    inProgress: tasks.filter(function(t) { return t.executionStatusNorm === 'IN_PROGRESS'; }).length,
    paused: tasks.filter(function(t) { return t.executionStatusNorm === 'PAUSED'; }).length,
    notStarted: tasks.filter(function(t) { return t.executionStatusNorm === 'NOT_STARTED'; }).length,
    unknown: tasks.filter(function(t) { return t.executionStatusNorm === 'UNKNOWN'; }).length,
  };
  const scheduleStatusCount = {
    doneOnTime: tasks.filter(function(t) { return t.scheduleStatus === 'DONE_ON_TIME'; }).length,
    doneLate: tasks.filter(function(t) { return t.scheduleStatus === 'DONE_LATE'; }).length,
    overdue: tasks.filter(function(t) { return t.scheduleStatus === 'OVERDUE'; }).length,
    inProgressOnTime: tasks.filter(function(t) { return t.scheduleStatus === 'IN_PROGRESS_ON_TIME'; }).length,
    notStartedOnTime: tasks.filter(function(t) { return t.scheduleStatus === 'NOT_STARTED_ON_TIME'; }).length,
    pausedOnTime: tasks.filter(function(t) { return t.scheduleStatus === 'PAUSED_ON_TIME'; }).length,
    pausedOverdue: tasks.filter(function(t) { return t.scheduleStatus === 'PAUSED_OVERDUE'; }).length,
    unknown: tasks.filter(function(t) { return t.scheduleStatus === 'UNKNOWN'; }).length,
  };

  const result = {
    sheetName: data.sheetName,
    taskCount: data.taskCount,
    linkCount: data.linkCount,
    statusSource: data.statusSource || null,
    executionStatusCount: executionStatusCount,
    scheduleStatusCount: scheduleStatusCount,
    doneCount: scheduleStatusCount.doneOnTime + scheduleStatusCount.doneLate,
    overdueCount: scheduleStatusCount.overdue + scheduleStatusCount.pausedOverdue,
    inProgressCount: scheduleStatusCount.inProgressOnTime,
    notStartedCount: scheduleStatusCount.notStartedOnTime,
    unknownCount: scheduleStatusCount.unknown,
    unmatchedSamples: tasks
      .filter(function(t) { return !t.statusRaw; })
      .slice(0, 20)
      .map(function(t) {
        return {
          id: t.id,
          wbs: t.wbs,
          text: t.text,
          taskCode: t.taskCode,
        };
      }),
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


function showDhtmlxGanttStatusMappingDiagnostic() {
  const result = dhtmlxGantt_statusMappingDiagnostic();

  const html = HtmlService.createHtmlOutput(
    '<pre style="font-family:Consolas,monospace;font-size:12px;white-space:pre-wrap">' +
    JSON.stringify(result, null, 2)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;') +
    '</pre>'
  ).setWidth(900).setHeight(700);

  SpreadsheetApp.getUi().showModalDialog(html, 'DHTMLX Status Mapping Diagnostic');
}


function dhtmlxGantt_detectHeader_(values) {
  const required = [
    DHTMLX_GANTT_ALIAS.wbs,
    DHTMLX_GANTT_ALIAS.id,
    DHTMLX_GANTT_ALIAS.text,
    DHTMLX_GANTT_ALIAS.start,
    DHTMLX_GANTT_ALIAS.end,
  ];
  const scanRows = Math.min(50, values.length);

  for (let r = 0; r < scanRows; r++) {
    const headerMap = dhtmlxGantt_buildHeaderMap_(values[r]);
    const ok = required.every(function(aliases) {
      return aliases.some(function(alias) {
        return headerMap[dhtmlxGantt_normalizeHeader_(alias)] !== undefined;
      });
    });

    if (ok) {
      return {
        headerRow: r + 1,
        headerMap: headerMap,
      };
    }
  }

  throw new Error('Không tìm thấy header phù hợp trong sheet Tien_do_tong_hop.');
}


function dhtmlxGantt_buildHeaderMap_(headers) {
  const map = {};

  (headers || []).forEach(function(header, index) {
    const key = dhtmlxGantt_normalizeHeader_(header);
    if (key && map[key] === undefined) map[key] = index;
  });

  return map;
}


function dhtmlxGantt_getByAliases_(row, headerMap, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const key = dhtmlxGantt_normalizeHeader_(aliases[i]);
    const index = headerMap[key];

    if (index !== undefined) {
      const value = row[index];
      if (value !== null && value !== undefined && value !== '') return value;
    }
  }

  return '';
}


function dhtmlxGantt_toIsoDate_(value) {
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


function dhtmlxGantt_getDuration_(durationValue, startIso, endIso) {
  const numeric = Number(durationValue);
  if (!isNaN(numeric) && numeric > 0) return Math.round(numeric);

  const start = new Date(startIso + 'T00:00:00');
  const end = new Date(endIso + 'T00:00:00');

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;

  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}


function dhtmlxGantt_getParentWbs_(wbs) {
  const text = String(wbs || '').trim();
  const index = text.lastIndexOf('.');

  if (index <= 0) return '';

  return text.slice(0, index);
}


function dhtmlxGantt_parseDependencies_(text, targetTaskId) {
  if (!text) return [];

  const links = [];
  const typeMap = {
    FS: '0',
    SS: '1',
    FF: '2',
    SF: '3',
  };

  String(text)
    .split(/[;,]/)
    .forEach(function(part) {
      const token = String(part).trim();
      const match = token.match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?/i);
      if (!match) return;

      const source = match[1];
      const relation = String(match[2] || 'FS').toUpperCase();
      const lagText = match[3] ? match[3].replace(/\s+/g, '') : '';
      const link = {
        id: 'L-' + source + '-' + targetTaskId + '-' + (links.length + 1),
        source: String(source),
        target: String(targetTaskId),
        type: typeMap[relation] || '0',
      };

      if (lagText) link.lag = Number(lagText);

      links.push(link);
    });

  return links;
}


function dhtmlxGantt_statusToProgress_(status) {
  const text = dhtmlxGantt_normalizeHeader_(status);
  if (!text) return 0;
  if (text.indexOf('hoan thanh') !== -1 || text.indexOf('done') !== -1 || text.indexOf('complete') !== -1) return 1;
  if (text.indexOf('dang thuc hien') !== -1 || text.indexOf('doing') !== -1 || text.indexOf('progress') !== -1) return 0.5;
  if (text.indexOf('tam dung') !== -1 || text.indexOf('pause') !== -1 || text.indexOf('hold') !== -1) return 0.2;
  return 0;
}


function dhtmlxGantt_normalizeHeader_(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}
