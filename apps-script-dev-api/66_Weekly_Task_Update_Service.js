const QLTD_WEEKLY_TASK_UPDATE_SOURCE = 'weekly_task_updates_v1';
const QLTD_WEEKLY_TASK_UPDATE_SHEET = 'WEEKLY_TASK_UPDATES';
const QLTD_WEEKLY_TASK_UPDATE_HEADERS = [
  'UpdateId', 'ProjectCode', 'DeptCode', 'WeekCode', 'ItemType', 'ItemId',
  'ThisWeekResult', 'ProgressEnd', 'TaskStatus', 'ActualStart', 'ActualFinish',
  'Issue', 'Recommendation', 'BudgetThisWeek', 'BudgetNote', 'UpdatedBy', 'UpdatedAt'
];

function qltdSetupWeeklyTaskUpdatesSheetDryRun() {
  const spreadsheet = getCurrentSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(QLTD_WEEKLY_TASK_UPDATE_SHEET);
  if (!sheet) {
    const missingResult = {
      success: true,
      safeToCreate: true,
      exists: false,
      expectedColumnCount: QLTD_WEEKLY_TASK_UPDATE_HEADERS.length,
      impact: 'CREATE_SHEET_ONLY'
    };
    Logger.log(JSON.stringify(missingResult));
    return missingResult;
  }

  const inspection = qltdWeeklyTaskUpdatesInspectSheet_(sheet);
  const existingResult = {
    success: inspection.headerMatches,
    safeToCreate: false,
    exists: true,
    headerMatches: inspection.headerMatches,
    expectedColumnCount: QLTD_WEEKLY_TASK_UPDATE_HEADERS.length,
    actualColumnCount: sheet.getLastColumn(),
    lastRow: sheet.getLastRow(),
    mismatches: inspection.mismatches,
    impact: inspection.headerMatches ? 'NO_CHANGE' : 'STOP_HEADER_MISMATCH'
  };
  Logger.log(JSON.stringify(existingResult));
  return existingResult;
}

function qltdSetupWeeklyTaskUpdatesSheet() {
  const dryRun = qltdSetupWeeklyTaskUpdatesSheetDryRun();
  Logger.log(JSON.stringify(dryRun));
  if (dryRun.exists) {
    if (!dryRun.headerMatches) throw new Error('WEEKLY_TASK_UPDATES_HEADER_MISMATCH');
    return Object.assign({}, dryRun, { created: false, idempotent: true });
  }
  if (!dryRun.safeToCreate) throw new Error('WEEKLY_TASK_UPDATES_SETUP_NOT_SAFE');

  const spreadsheet = getCurrentSpreadsheet_();
  const sheet = spreadsheet.insertSheet(QLTD_WEEKLY_TASK_UPDATE_SHEET);
  sheet.getRange(1, 1, 1, QLTD_WEEKLY_TASK_UPDATE_HEADERS.length)
    .setValues([QLTD_WEEKLY_TASK_UPDATE_HEADERS])
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
  return {
    success: true,
    created: true,
    sheetName: sheet.getName(),
    columnCount: QLTD_WEEKLY_TASK_UPDATE_HEADERS.length,
    headers: QLTD_WEEKLY_TASK_UPDATE_HEADERS.slice()
  };
}

function qltdWeeklyTaskUpdatesGet_(params) {
  const action = 'weekly_taskupdates_get';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  const scope = qltdWeeklyTaskUpdatesResolveScope_(action, params || {}, auth);
  if (scope.error) return scope.error;
  const read = qltdWeeklyTaskUpdatesRead_();
  if (read.error) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, read.error.code, read.error.message, scope.meta, scope.warnings);

  const itemType = qltdWeeklyTaskUpdatesNormalizeType_(params.itemType);
  const itemId = String(params.itemId || '').trim();
  const updates = read.updates.filter(function(update) {
    return update.projectCode === scope.projectCode && update.deptCode === scope.deptCode &&
      update.weekCode === scope.weekCode && (!itemType || update.itemType === itemType) &&
      (!itemId || update.itemId === itemId);
  });
  updates.forEach(function(update) {
    update.budgetCumulative = read.updates.filter(function(candidate) {
      return candidate.projectCode === update.projectCode && candidate.deptCode === update.deptCode &&
        candidate.itemType === update.itemType && candidate.itemId === update.itemId;
    }).reduce(function(total, candidate) {
      return total + Number(candidate.budgetThisWeek || 0);
    }, 0);
  });
  return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
    projectCode: scope.projectCode,
    deptCode: scope.deptCode,
    weekCode: scope.weekCode,
    updates: updates,
    count: updates.length
  }, scope.warnings, scope.meta);
}

function qltdWeeklyTaskUpdatesSave_(payload) {
  const action = 'weekly_taskupdates_save';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  const scope = qltdWeeklyTaskUpdatesResolveScope_(action, payload || {}, auth);
  if (scope.error) return scope.error;
  const validation = qltdWeeklyTaskUpdatesValidatePayload_(payload || {}, scope);
  if (validation.error) return validation.error;
  const currentItem = qltdWeeklyTaskUpdatesFindCurrentItem_(validation.itemType, validation.itemId, scope, action);
  if (currentItem && validation.progressEnd < Number(currentItem.progress || 0) && !payload.confirmProgressDecrease) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'PROGRESS_DECREASE_CONFIRM_REQUIRED', 'Progress is lower than current task progress. Confirmation is required.', scope.meta, scope.warnings, {
      currentProgress: Number(currentItem.progress || 0),
      requestedProgress: validation.progressEnd
    });
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  let saved;
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'WRITE_LOCK_TIMEOUT', 'Cannot acquire weekly task update lock.', scope.meta, scope.warnings);
    const read = qltdWeeklyTaskUpdatesRead_();
    if (read.error) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, read.error.code, read.error.message, scope.meta, scope.warnings);
    const key = qltdWeeklyTaskUpdatesBuildKey_(scope.projectCode, scope.deptCode, scope.weekCode, validation.itemType, validation.itemId);
    const existing = read.updates.find(function(update) { return update.key === key; });
    if (existing && validation.progressEnd < existing.progressEnd && !payload.confirmProgressDecrease) {
      return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'PROGRESS_DECREASE_CONFIRM_REQUIRED', 'Progress is lower than the saved value. Confirmation is required.', scope.meta, scope.warnings, {
        currentProgress: existing.progressEnd,
        requestedProgress: validation.progressEnd
      });
    }
    const now = qltdWorkNowIso_();
    const rowObject = {
      UpdateId: existing ? existing.updateId : 'WTU_' + Utilities.getUuid(),
      ProjectCode: scope.projectCode,
      DeptCode: scope.deptCode,
      WeekCode: scope.weekCode,
      ItemType: validation.itemType,
      ItemId: validation.itemId,
      ThisWeekResult: validation.thisWeekResult,
      ProgressEnd: validation.progressEnd,
      TaskStatus: validation.taskStatus,
      ActualStart: validation.actualStart,
      ActualFinish: validation.actualFinish,
      Issue: validation.issue,
      Recommendation: validation.recommendation,
      BudgetThisWeek: validation.budgetThisWeek,
      BudgetNote: validation.budgetNote,
      UpdatedBy: auth.email,
      UpdatedAt: now
    };
    const rowNumber = existing ? existing.rowNumber : Math.max(read.sheet.getLastRow() + 1, 2);
    read.sheet.getRange(rowNumber, 1, 1, QLTD_WEEKLY_TASK_UPDATE_HEADERS.length).setValues([
      QLTD_WEEKLY_TASK_UPDATE_HEADERS.map(function(header) { return rowObject[header]; })
    ]);
    saved = {
      inserted: !existing,
      duplicatePrevented: !!existing,
      update: qltdWeeklyTaskUpdatesNormalize_(rowObject, rowNumber),
      warnings: scope.warnings.slice()
    };
  } catch (error) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'WRITE_ERROR', qltdBudgetSafeErrorMessage_(error), scope.meta, scope.warnings);
  } finally {
    if (locked) lock.releaseLock();
  }

  const sync = qltdWeeklyTaskUpdatesSyncTask_(payload, validation, scope, auth);
  if (sync.warning) saved.warnings.push(sync.warning);
  return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
    inserted: saved.inserted,
    duplicatePrevented: saved.duplicatePrevented,
    update: saved.update,
    taskSync: sync.result
  }, saved.warnings, scope.meta);
}

function qltdWorkListWeeklyItems_(params) {
  const action = 'work_listweeklyitems';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  const scope = qltdWeeklyTaskUpdatesResolveScope_(action, params || {}, auth);
  if (scope.error) return scope.error;
  const weekStart = qltdWeeklyTaskUpdatesDate_(params.weekStart);
  const weekEnd = qltdWeeklyTaskUpdatesDate_(params.weekEnd);
  if (!weekStart || !weekEnd || weekEnd < weekStart) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'INVALID_WEEK_RANGE', 'weekStart/weekEnd must be valid yyyy-MM-dd dates.', scope.meta, scope.warnings);

  const context = qltdWorkBuildDeptContext_(scope.project, scope.dept, scope.requestedDeptCode, scope.warnings);
  const masterRead = qltdWorkReadDeptTasksForContext_(context, {}, action);
  if (masterRead.error) return masterRead.error;
  const detailContext = qltdPbDetailBuildSheetContext_(action, Object.assign({}, scope, { meta: scope.meta }));
  const detailsByMaster = {};
  const detailItems = [];
  if (!detailContext.error) {
    detailContext.dataRows.filter(function(row) { return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL; }).forEach(function(row) {
      const dto = qltdPbDetailBuildDetailDto_(row, detailContext.columns);
      detailsByMaster[dto.masterTaskCode] = (detailsByMaster[dto.masterTaskCode] || 0) + 1;
      detailItems.push(qltdWeeklyTaskUpdatesBuildItem_('PB_DETAIL', dto.detailTaskId, dto, weekStart, weekEnd, params.search));
    });
  }
  const masterItems = masterRead.tasks.map(function(task) {
    return qltdWeeklyTaskUpdatesBuildItem_('MASTER', task.masterTaskCode, task, weekStart, weekEnd, params.search, !!detailsByMaster[task.masterTaskCode]);
  });
  let items = masterItems.concat(detailItems).filter(function(item) { return item.eligible; });
  const group = String(params.group || '').trim().toUpperCase();
  if (group && group !== 'ALL') items = items.filter(function(item) { return item.eligibleReason === group; });
  items.sort(qltdWeeklyTaskUpdatesSortItems_);
  const summary = { overdue: 0, inProgress: 0, planned: 0, completedThisWeek: 0 };
  items.forEach(function(item) {
    if (item.eligibleReason === 'OVERDUE') summary.overdue += 1;
    else if (item.eligibleReason === 'IN_PROGRESS') summary.inProgress += 1;
    else if (item.eligibleReason === 'PLANNED') summary.planned += 1;
    else if (item.eligibleReason === 'COMPLETED_THIS_WEEK') summary.completedThisWeek += 1;
  });
  return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
    projectCode: scope.projectCode,
    deptCode: scope.deptCode,
    weekCode: scope.weekCode,
    items: items.map(function(item) { delete item.eligible; return item; }),
    summary: summary
  }, scope.warnings.concat(detailContext.error ? [qltdWorkWarning_('PB_DETAIL_UNAVAILABLE', 'PB_DETAIL items could not be loaded.')] : []), scope.meta);
}

function qltdWeeklyTaskUpdatesResolveScope_(action, input, auth) {
  const weekCode = qltdWorkNormalizeWeekCode_(input.weekCode);
  if (!weekCode) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'WEEK_CODE_REQUIRED', 'weekCode is required.', { email: auth.email }) };
  const resolved = qltdWorkResolveProjectDept_(action, input, QLTD_WEEKLY_TASK_UPDATE_SOURCE, { requireDeptSpreadsheet: true, meta: { email: auth.email, weekCode: weekCode } });
  if (resolved.error) return { error: resolved.error };
  if (!qltdWorkCanReadDept_(auth.user, resolved.deptCode)) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'User cannot access this department.', { email: auth.email, deptCode: resolved.deptCode }, resolved.warnings) };
  return Object.assign({}, resolved, {
    weekCode: weekCode,
    warnings: resolved.warnings || [],
    meta: { email: auth.email, projectCode: resolved.projectCode, deptCode: resolved.deptCode, weekCode: weekCode },
    error: null
  });
}

function qltdWeeklyTaskUpdatesValidatePayload_(payload, scope) {
  const itemType = qltdWeeklyTaskUpdatesNormalizeType_(payload.itemType);
  const itemId = String(payload.itemId || '').trim();
  const progressEnd = Number(payload.progressEnd);
  const taskStatus = progressEnd === 100 ? 'Hoàn thành' : String(payload.taskStatus || '').trim();
  const actualStart = qltdWeeklyTaskUpdatesDate_(payload.actualStart, true);
  const actualFinish = qltdWeeklyTaskUpdatesDate_(payload.actualFinish, true);
  const budgetThisWeek = String(payload.budgetThisWeek || '').trim() === '' ? '' : Number(payload.budgetThisWeek);
  if (!itemType || !itemId) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, 'weekly_taskupdates_save', 'ITEM_REQUIRED', 'itemType and itemId are required.', scope.meta, scope.warnings) };
  if (isNaN(progressEnd) || progressEnd < 0 || progressEnd > 100) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, 'weekly_taskupdates_save', 'INVALID_PROGRESS', 'progressEnd must be between 0 and 100.', scope.meta, scope.warnings) };
  if (progressEnd === 100 && !actualFinish) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, 'weekly_taskupdates_save', 'ACTUAL_FINISH_REQUIRED', 'ActualFinish is required at 100%.', scope.meta, scope.warnings) };
  if (payload.actualStart && !actualStart || payload.actualFinish && !actualFinish) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, 'weekly_taskupdates_save', 'INVALID_DATE', 'Actual dates must use yyyy-MM-dd.', scope.meta, scope.warnings) };
  if (budgetThisWeek !== '' && (isNaN(budgetThisWeek) || budgetThisWeek < 0)) return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, 'weekly_taskupdates_save', 'INVALID_BUDGET', 'budgetThisWeek must be non-negative.', scope.meta, scope.warnings) };
  return {
    itemType: itemType, itemId: itemId,
    thisWeekResult: String(payload.thisWeekResult || '').trim(), progressEnd: progressEnd,
    taskStatus: taskStatus, actualStart: actualStart, actualFinish: actualFinish,
    issue: String(payload.issue || '').trim(), recommendation: String(payload.recommendation || '').trim(),
    budgetThisWeek: budgetThisWeek, budgetNote: String(payload.budgetNote || '').trim(), error: null
  };
}

function qltdWeeklyTaskUpdatesSyncTask_(payload, validation, scope, auth) {
  const updates = { status: validation.taskStatus, actualStart: validation.actualStart, actualFinish: validation.actualFinish };
  if (validation.itemType === 'PB_DETAIL') {
    updates.action = 'work_updatedetailtask'; updates.email = auth.email; updates.projectCode = scope.projectCode;
    updates.deptCode = scope.deptCode; updates.detailTaskId = validation.itemId; updates.progress = validation.progressEnd;
    const result = qltdWorkUpdateDetailTask_(updates);
    return result && result.success ? { result: result } : { result: result, warning: qltdWorkWarning_('TASK_SYNC_PARTIAL', 'Weekly update was saved but PB_DETAIL sync failed.') };
  }
  const detailContext = qltdPbDetailBuildSheetContext_('weekly_taskupdates_save', Object.assign({}, scope, { meta: scope.meta }));
  if (!detailContext.error && detailContext.dataRows.some(function(row) { return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL && row.masterTaskCode === validation.itemId; })) {
    return { result: { success: true, progressReadonly: true }, warning: qltdWorkWarning_('MASTER_PROGRESS_READONLY', 'MASTER has PB_DETAIL; narrative saved without overwriting progress.') };
  }
  updates.action = 'work_updatetask'; updates.email = auth.email; updates.projectCode = scope.projectCode;
  updates.deptCode = scope.deptCode; updates.masterTaskCode = validation.itemId; updates.progress = validation.progressEnd;
  const result = qltdWorkUpdateTask_(updates);
  return result && result.success ? { result: result } : { result: result, warning: qltdWorkWarning_('TASK_SYNC_PARTIAL', 'Weekly update was saved but MASTER sync was not completed.') };
}

function qltdWeeklyTaskUpdatesFindCurrentItem_(itemType, itemId, scope, action) {
  if (itemType === 'PB_DETAIL') {
    const detailContext = qltdPbDetailBuildSheetContext_(action, Object.assign({}, scope, { meta: scope.meta }));
    if (detailContext.error) return null;
    const row = detailContext.dataRows.find(function(candidate) {
      return candidate.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL && candidate.detailTaskId === itemId;
    });
    return row ? qltdPbDetailBuildDetailDto_(row, detailContext.columns) : null;
  }
  const context = qltdWorkBuildDeptContext_(scope.project, scope.dept, scope.requestedDeptCode, scope.warnings);
  const target = qltdWorkReadTaskTarget_(context, itemId, action);
  return target.error ? null : target.task;
}

function qltdWeeklyTaskUpdatesRead_() {
  const sheet = getCurrentSpreadsheet_().getSheetByName(QLTD_WEEKLY_TASK_UPDATE_SHEET);
  if (!sheet) return { error: { code: 'WEEKLY_TASK_UPDATES_NOT_READY', message: 'WEEKLY_TASK_UPDATES has not been set up.' } };
  const inspection = qltdWeeklyTaskUpdatesInspectSheet_(sheet);
  if (!inspection.headerMatches) return { error: { code: 'WEEKLY_TASK_UPDATES_HEADER_MISMATCH', message: 'WEEKLY_TASK_UPDATES headers do not match.' } };
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, QLTD_WEEKLY_TASK_UPDATE_HEADERS.length).getValues() : [];
  return { sheet: sheet, updates: rows.map(function(row, index) {
    const object = {}; QLTD_WEEKLY_TASK_UPDATE_HEADERS.forEach(function(header, column) { object[header] = row[column]; });
    return qltdWeeklyTaskUpdatesNormalize_(object, index + 2);
  }).filter(function(update) { return !!update.updateId; }), error: null };
}

function qltdWeeklyTaskUpdatesInspectSheet_(sheet) {
  const current = sheet.getRange(1, 1, 1, QLTD_WEEKLY_TASK_UPDATE_HEADERS.length).getValues()[0].map(function(value) { return String(value || '').trim(); });
  const mismatches = QLTD_WEEKLY_TASK_UPDATE_HEADERS.map(function(expected, index) { return current[index] === expected ? null : { column: index + 1, expected: expected, actual: current[index] }; }).filter(Boolean);
  return { headerMatches: !mismatches.length && sheet.getLastColumn() === QLTD_WEEKLY_TASK_UPDATE_HEADERS.length, mismatches: mismatches };
}

function qltdWeeklyTaskUpdatesNormalize_(object, rowNumber) {
  const update = {
    updateId: String(object.UpdateId || '').trim(), projectCode: qltdWorkNormalizeCode_(object.ProjectCode), deptCode: qltdWorkNormalizeCode_(object.DeptCode),
    weekCode: qltdWorkNormalizeWeekCode_(object.WeekCode), itemType: qltdWeeklyTaskUpdatesNormalizeType_(object.ItemType), itemId: String(object.ItemId || '').trim(),
    thisWeekResult: String(object.ThisWeekResult || ''), progressEnd: Number(object.ProgressEnd || 0), taskStatus: String(object.TaskStatus || ''),
    actualStart: qltdBudgetFormatDate_(object.ActualStart), actualFinish: qltdBudgetFormatDate_(object.ActualFinish), issue: String(object.Issue || ''),
    recommendation: String(object.Recommendation || ''), budgetThisWeek: qltdBudgetToNumber_(object.BudgetThisWeek), budgetNote: String(object.BudgetNote || ''),
    updatedBy: qltdWorkNormalizeEmail_(object.UpdatedBy), updatedAt: qltdWeeklyCellText_(object.UpdatedAt), rowNumber: rowNumber
  };
  update.key = qltdWeeklyTaskUpdatesBuildKey_(update.projectCode, update.deptCode, update.weekCode, update.itemType, update.itemId);
  return update;
}

function qltdWeeklyTaskUpdatesBuildItem_(type, id, source, weekStart, weekEnd, search, hasDetails) {
  const progress = Number(source.progress || 0); const planStart = qltdBudgetFormatDate_(source.planStart); const planFinish = qltdBudgetFormatDate_(source.planFinish);
  const actualStart = qltdBudgetFormatDate_(source.actualStart); const actualFinish = qltdBudgetFormatDate_(source.actualFinish);
  const text = [source.wbs, source.taskName, id].join(' ').toLowerCase(); const query = String(search || '').trim().toLowerCase();
  let reason = '';
  if (progress === 100 && actualFinish && actualFinish >= weekStart && actualFinish <= weekEnd) reason = 'COMPLETED_THIS_WEEK';
  else if (progress < 100 && planFinish && planFinish < weekStart) reason = 'OVERDUE';
  else if (progress < 100 && actualStart) reason = 'IN_PROGRESS';
  else if (progress < 100 && planStart && planStart <= weekEnd) reason = 'PLANNED';
  else if (query && text.indexOf(query) !== -1 && !planStart && !planFinish) reason = 'UNSCHEDULED';
  if (query && text.indexOf(query) === -1) reason = '';
  return {
    itemType: type, itemId: id, masterTaskCode: type === 'MASTER' ? id : source.masterTaskCode,
    detailTaskId: type === 'PB_DETAIL' ? id : '', parentMasterTaskCode: type === 'PB_DETAIL' ? source.masterTaskCode : '',
    wbs: source.wbs || '', taskName: source.taskName || '', planStart: planStart, planFinish: planFinish,
    actualStart: actualStart, actualFinish: actualFinish, progress: progress, status: source.status || '',
    owner: source.owner || source.ownerText || '', plannedBudget: Number(source.budgetPlan || source.plannedBudget || 0),
    actualBudget: Number(source.budgetActual || source.actualBudget || 0), hasBudget: Number(source.budgetPlan || source.plannedBudget || 0) > 0 || Number(source.budgetActual || source.actualBudget || 0) > 0,
    hasDetails: !!hasDetails, progressReadonly: type === 'MASTER' && !!hasDetails, eligibleReason: reason, eligible: !!reason
  };
}

function qltdWeeklyTaskUpdatesSortItems_(a, b) {
  const order = { OVERDUE: 1, IN_PROGRESS: 2, PLANNED: 3, COMPLETED_THIS_WEEK: 4, UNSCHEDULED: 5 };
  return (order[a.eligibleReason] || 9) - (order[b.eligibleReason] || 9) || String(a.planFinish || '9999').localeCompare(String(b.planFinish || '9999')) || String(a.wbs || '').localeCompare(String(b.wbs || ''), 'vi', { numeric: true });
}

function qltdWeeklyTaskUpdatesNormalizeType_(value) { const type = String(value || '').trim().toUpperCase(); return type === 'MASTER' || type === 'PB_DETAIL' ? type : ''; }
function qltdWeeklyTaskUpdatesDate_(value, allowBlank) { const text = String(value || '').trim(); if (!text) return allowBlank ? '' : null; const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!match) return null; const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]); const date = new Date(year, month - 1, day); return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? text : null; }
function qltdWeeklyTaskUpdatesBuildKey_(projectCode, deptCode, weekCode, itemType, itemId) { return [qltdWorkNormalizeCode_(projectCode), qltdWorkNormalizeCode_(deptCode), qltdWorkNormalizeWeekCode_(weekCode), qltdWeeklyTaskUpdatesNormalizeType_(itemType), String(itemId || '').trim()].join('|'); }
