const QLTD_WEEKLY_TASK_UPDATE_SOURCE = 'weekly_task_updates_v1';
const QLTD_WEEKLY_TASK_UPDATE_SHEET = 'WEEKLY_TASK_UPDATES';
const QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS = [
  'UpdateId', 'ProjectCode', 'DeptCode', 'WeekCode', 'ItemType', 'ItemId',
  'ThisWeekResult', 'ProgressEnd', 'TaskStatus', 'ActualStart', 'ActualFinish',
  'Issue', 'Recommendation', 'BudgetThisWeek', 'BudgetNote', 'UpdatedBy', 'UpdatedAt'
];
const QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS = [
  'ApprovalStatus', 'ReviewReason', 'ReviewedBy', 'ReviewedAt'
];
const QLTD_WEEKLY_TASK_UPDATE_HEADERS = QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.concat(QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS);
const QLTD_WEEKLY_TASK_APPROVAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

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
    success: inspection.headerMatches || inspection.canAppendApprovalColumns,
    safeToCreate: false,
    exists: true,
    headerMatches: inspection.headerMatches,
    canAppendApprovalColumns: inspection.canAppendApprovalColumns,
    approvalHeadersPresent: inspection.approvalHeadersPresent,
    expectedColumnCount: QLTD_WEEKLY_TASK_UPDATE_HEADERS.length,
    actualColumnCount: sheet.getLastColumn(),
    lastRow: sheet.getLastRow(),
    mismatches: inspection.mismatches,
    impact: inspection.headerMatches ? 'NO_CHANGE' : (inspection.canAppendApprovalColumns ? 'APPEND_APPROVAL_COLUMNS_ONLY' : 'STOP_HEADER_MISMATCH')
  };
  Logger.log(JSON.stringify(existingResult));
  return existingResult;
}

function qltdSetupWeeklyTaskUpdatesSheet() {
  const dryRun = qltdSetupWeeklyTaskUpdatesSheetDryRun();
  Logger.log(JSON.stringify(dryRun));
  if (dryRun.exists) {
    if (dryRun.headerMatches) return Object.assign({}, dryRun, { created: false, migrated: false, idempotent: true });
    if (!dryRun.canAppendApprovalColumns) throw new Error('WEEKLY_TASK_UPDATES_HEADER_MISMATCH');
    const sheet = getCurrentSpreadsheet_().getSheetByName(QLTD_WEEKLY_TASK_UPDATE_SHEET);
    const startColumn = QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.length + 1;
    sheet.getRange(1, startColumn, 1, QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS.length)
      .setValues([QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS])
      .setFontWeight('bold');
    return Object.assign({}, dryRun, {
      success: true,
      created: false,
      migrated: true,
      idempotent: true,
      columnCount: QLTD_WEEKLY_TASK_UPDATE_HEADERS.length,
      headers: QLTD_WEEKLY_TASK_UPDATE_HEADERS.slice(),
      impact: 'APPENDED_APPROVAL_COLUMNS_ONLY'
    });
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

function qltdWeeklyTaskUpdatesSetupDryRunApi_(params) {
  const action = 'weekly_taskupdates_setup_dryrun';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  if (!qltdWorkIsAdminScope_(auth.user)) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Only Admin/PMO can inspect weekly task update schema.', { email: auth.email });
  }
  return qltdSetupWeeklyTaskUpdatesSheetDryRun();
}

function qltdWeeklyTaskUpdatesSetupApi_(payload) {
  const action = 'weekly_taskupdates_setup';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  if (!qltdWorkIsAdminScope_(auth.user)) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Only Admin/PMO can migrate weekly task update schema.', { email: auth.email });
  }
  return qltdSetupWeeklyTaskUpdatesSheet();
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

function qltdWeeklyMasterApprovalsGet_(params) {
  const action = 'weekly_masterapprovals_get';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  if (!qltdWorkIsAdminScope_(auth.user)) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Only Admin/PMO can review MASTER completion approvals.', { email: auth.email });
  }
  const read = qltdWeeklyTaskUpdatesRead_();
  if (read.error) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, read.error.code, read.error.message, { email: auth.email });

  const statusFilter = qltdWeeklyTaskUpdatesNormalizeApprovalStatus_(params && params.status) || QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING;
  const projectFilter = qltdWorkNormalizeCode_(params && params.projectCode);
  const deptFilter = qltdWorkNormalizeCode_(params && params.deptCode);
  const projectCache = {};
  const approvals = read.updates.filter(function(update) {
    if (update.itemType !== 'MASTER') return false;
    if (!update.approvalStatus) return false;
    if (statusFilter && update.approvalStatus !== statusFilter) return false;
    if (projectFilter && update.projectCode !== projectFilter) return false;
    if (deptFilter && update.deptCode !== deptFilter) return false;
    return true;
  }).map(function(update) {
    return qltdWeeklyTaskUpdatesBuildApprovalDto_(update, projectCache);
  });

  return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
    approvals: approvals,
    count: approvals.length,
    status: statusFilter
  }, [], { email: auth.email });
}

function qltdWeeklyMasterApprovalReview_(payload) {
  const action = 'weekly_masterapproval_review';
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_WEEKLY_TASK_UPDATE_SOURCE);
  if (auth.error) return auth.error;
  if (!qltdWorkIsAdminScope_(auth.user)) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACCESS_DENIED', 'Only Admin/PMO can review MASTER completion approvals.', { email: auth.email });
  }
  const updateId = String(payload && payload.updateId || '').trim();
  const nextStatus = qltdWeeklyTaskUpdatesNormalizeApprovalStatus_(payload && payload.approvalStatus || payload && payload.status);
  const reason = String(payload && (payload.reviewReason || payload.reason) || '').trim();
  const meta = { email: auth.email, updateId: updateId, approvalStatus: nextStatus };
  if (!updateId) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'UPDATE_ID_REQUIRED', 'updateId is required.', meta);
  if ([QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED, QLTD_WEEKLY_TASK_APPROVAL_STATUS.REJECTED].indexOf(nextStatus) === -1) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'APPROVAL_STATUS_INVALID', 'Approval status must be APPROVED or REJECTED.', meta);
  }
  if (nextStatus === QLTD_WEEKLY_TASK_APPROVAL_STATUS.REJECTED && !reason) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'REVIEW_REASON_REQUIRED', 'ReviewReason is required when rejecting.', meta);
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'WRITE_LOCK_TIMEOUT', 'Cannot acquire approval review lock.', meta);
    const read = qltdWeeklyTaskUpdatesRead_();
    if (read.error) return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, read.error.code, read.error.message, meta);
    const target = read.updates.find(function(update) { return update.updateId === updateId; });
    if (!target || target.itemType !== 'MASTER' || !target.approvalStatus) {
      return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'APPROVAL_NOT_FOUND', 'MASTER completion approval request not found.', meta);
    }
    if (target.approvalStatus !== QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING) {
      return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'APPROVAL_NOT_PENDING', 'Only PENDING approval requests can be reviewed.', Object.assign({ currentStatus: target.approvalStatus }, meta));
    }
    const now = qltdWorkNowIso_();
    const startColumn = QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.length + 1;
    read.sheet.getRange(target.rowNumber, startColumn, 1, QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS.length)
      .setValues([[nextStatus, reason, auth.email, now]]);
    const reviewed = Object.assign({}, target, {
      approvalStatus: nextStatus,
      reviewReason: reason,
      reviewedBy: auth.email,
      reviewedAt: now
    });
    return qltdWorkOk_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, {
      approval: reviewed,
      masterAutoUpdated: false,
      congViecUpdated: false,
      columnWUpdated: false,
      recalcTriggered: false
    }, [qltdWorkWarning_('ADMIN_MANUAL_MASTER_UPDATE_REQUIRED', 'Admin must manually update Cong_viec and column W if needed.')], meta);
  } catch (error) {
    return qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'WRITE_ERROR', qltdBudgetSafeErrorMessage_(error), meta);
  } finally {
    if (locked) lock.releaseLock();
  }
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
  const lifecycle = qltdWeeklyTaskUpdatesResolveActualDateLifecycle_(payload || {}, validation, currentItem, scope);
  if (lifecycle.error) return lifecycle.error;
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
    const completionProposal = qltdWeeklyTaskUpdatesIsCompletionProposal_(validation);
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
      UpdatedAt: now,
      ApprovalStatus: completionProposal ? QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING : '',
      ReviewReason: '',
      ReviewedBy: '',
      ReviewedAt: ''
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
  const officialMasters = qltdWeeklyTaskUpdatesReadOfficialMasters_(scope, masterRead.tasks, action);
  if (officialMasters.error) return officialMasters.error;
  const budgetContext = qltdWeeklyTaskUpdatesReadBudgetContext_(scope);
  const detailContext = qltdPbDetailBuildSheetContext_(action, Object.assign({}, scope, { meta: scope.meta }));
  const detailsByMaster = {};
  const incompleteDetailsByMaster = {};
  const detailItems = [];
  if (!detailContext.error) {
    detailContext.dataRows.filter(function(row) { return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL; }).forEach(function(row) {
      const dto = qltdPbDetailBuildDetailDto_(row, detailContext.columns);
      qltdWeeklyTaskUpdatesAttachBudgetContext_(dto, budgetContext, dto.masterTaskCode);
      detailsByMaster[dto.masterTaskCode] = (detailsByMaster[dto.masterTaskCode] || 0) + 1;
      if (Number(dto.progress || 0) < 100 && !qltdWeeklyTaskUpdatesIsOfficialComplete_(dto)) {
        incompleteDetailsByMaster[dto.masterTaskCode] = (incompleteDetailsByMaster[dto.masterTaskCode] || 0) + 1;
      }
      detailItems.push(qltdWeeklyTaskUpdatesBuildItem_('PB_DETAIL', dto.detailTaskId, dto, weekStart, weekEnd, params.search));
    });
  }
  const masterItems = officialMasters.tasks.map(function(task) {
    qltdWeeklyTaskUpdatesAttachBudgetContext_(task, budgetContext, task.masterTaskCode);
    const item = qltdWeeklyTaskUpdatesBuildItem_('MASTER', task.masterTaskCode, task, weekStart, weekEnd, params.search, !!detailsByMaster[task.masterTaskCode]);
    item.incompleteDetailCount = incompleteDetailsByMaster[task.masterTaskCode] || 0;
    return item;
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
    summary: summary,
    standaloneBudgetItems: budgetContext.standaloneItems || []
  }, scope.warnings.concat(officialMasters.warnings || []).concat(budgetContext.warnings || []).concat(detailContext.error ? [qltdWorkWarning_('PB_DETAIL_UNAVAILABLE', 'PB_DETAIL items could not be loaded.')] : []), scope.meta);
}

function qltdWeeklyTaskUpdatesReadOfficialMasters_(scope, deptMasterRows, action) {
  const warnings = [];
  const result = qltdGanttGetDataForProject_(scope.projectCode);
  if (!result || result.success === false || !Array.isArray(result.data)) {
    return {
      tasks: [],
      warnings: warnings,
      error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'GANTT_PAYLOAD_UNAVAILABLE', 'Official MASTER payload from Cong_viec is unavailable.', scope.meta, scope.warnings)
    };
  }
  const officialByCode = {};
  result.data.forEach(function(task) {
    [task.code, task.id].forEach(function(value) {
      const key = qltdWeeklyTaskUpdatesNormalizeTaskCode_(value);
      if (key && !officialByCode[key]) officialByCode[key] = task;
    });
  });
  const tasks = (deptMasterRows || []).map(function(deptTask) {
    const code = qltdWeeklyTaskUpdatesNormalizeTaskCode_(deptTask.masterTaskCode);
    const official = officialByCode[code];
    if (!official) {
      warnings.push(qltdWorkWarning_('OFFICIAL_MASTER_NOT_FOUND', 'MASTER not found in Gantt/Cong_viec payload; using dept reference fields for this item only.', {
        masterTaskCode: deptTask.masterTaskCode
      }));
      return deptTask;
    }
    return qltdWeeklyTaskUpdatesBuildOfficialMasterDto_(official, deptTask);
  });
  return {
    tasks: tasks,
    warnings: warnings,
    error: null
  };
}

function qltdWeeklyTaskUpdatesBuildOfficialMasterDto_(official, deptTask) {
  const progress = Number(official.percent !== undefined ? official.percent : Math.round(Number(official.progress || 0) * 100));
  return {
    masterTaskCode: String(deptTask.masterTaskCode || official.code || official.id || '').trim(),
    wbs: String(official.wbs || deptTask.wbs || '').trim(),
    taskName: String(official.text || deptTask.taskName || '').trim(),
    rowType: deptTask.rowType || 'MASTER',
    planStart: qltdBudgetFormatDate_(official.baselineStart || official.startPlan || official.start_date || deptTask.planStart),
    planFinish: qltdBudgetFormatDate_(official.baselineEnd || official.endPlan || official.end_date || official.deadline || deptTask.planFinish),
    status: String(official.status || deptTask.status || '').trim(),
    actualStart: qltdBudgetFormatDate_(official.actualStart || official.startActual || deptTask.actualStart),
    actualFinish: qltdBudgetFormatDate_(official.actualFinish || official.actualEnd || official.endActual || deptTask.actualFinish),
    progress: isNaN(progress) ? Number(deptTask.progress || 0) : Math.max(0, Math.min(100, progress)),
    budgetPlan: Number(deptTask.budgetPlan || 0),
    budgetActual: Number(deptTask.budgetActual || 0),
    ownerText: String(official.owner || deptTask.ownerText || '').trim(),
    coordinatorText: deptTask.coordinatorText || '',
    officialSource: 'GANTT_CONG_VIEC'
  };
}

function qltdWeeklyTaskUpdatesBuildApprovalDto_(update, projectCache) {
  const dto = Object.assign({}, update);
  const projectCode = update.projectCode;
  let official = null;
  if (projectCode) {
    if (!Object.prototype.hasOwnProperty.call(projectCache, projectCode)) {
      const result = qltdGanttGetDataForProject_(projectCode);
      const map = {};
      if (result && result.success !== false && Array.isArray(result.data)) {
        result.data.forEach(function(task) {
          [task.code, task.id].forEach(function(value) {
            const key = qltdWeeklyTaskUpdatesNormalizeTaskCode_(value);
            if (key && !map[key]) map[key] = task;
          });
        });
      }
      projectCache[projectCode] = map;
    }
    official = projectCache[projectCode][qltdWeeklyTaskUpdatesNormalizeTaskCode_(update.itemId)];
  }
  if (official) {
    dto.wbs = String(official.wbs || '').trim();
    dto.taskName = String(official.text || '').trim();
    dto.planStart = qltdBudgetFormatDate_(official.baselineStart || official.start_date || '');
    dto.planFinish = qltdBudgetFormatDate_(official.baselineEnd || official.end_date || official.deadline || '');
    dto.officialStatus = String(official.status || '').trim();
    dto.officialProgress = Number(official.percent !== undefined ? official.percent : Math.round(Number(official.progress || 0) * 100));
    dto.officialActualFinish = qltdBudgetFormatDate_(official.actualFinish || official.actualEnd || '');
  }
  return dto;
}

function qltdWeeklyTaskUpdatesReadBudgetContext_(scope) {
  const empty = { taskLinkedByMaster: {}, standaloneItems: [], warnings: [] };
  if (typeof qltdBudgetReadBudgetItems_ !== 'function') return empty;
  const result = qltdBudgetReadBudgetItems_();
  const warnings = result.warnings || [];
  const projectCode = qltdBudgetNormalizeCode_(scope.projectCode);
  const deptCode = qltdBudgetNormalizeCode_(scope.deptCode);
  (result.items || []).forEach(function(item) {
    if (item.status !== 'ACTIVE') return;
    if (item.projectCode !== projectCode) return;
    if (qltdBudgetNormalizeCode_(item.deptCode) !== deptCode) return;
    const flowType = qltdWeeklyTaskUpdatesResolveCashFlowType_(item);
    const dto = {
      budgetItemCode: item.budgetItemCode,
      budgetItemName: item.budgetItemName,
      budgetType: item.budgetType,
      budgetGroup: item.budgetGroup,
      budgetStage: item.budgetStage,
      approvedBudget: Number(item.approvedBudget || 0),
      budgetFlowType: flowType
    };
    if (item.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED && item.masterTaskCode) {
      empty.taskLinkedByMaster[qltdWeeklyTaskUpdatesNormalizeTaskCode_(item.masterTaskCode)] = dto;
    } else if (item.budgetType === QLTD_BUDGET_TYPE.DEPT_STANDALONE) {
      empty.standaloneItems.push(dto);
    }
  });
  empty.warnings = warnings;
  return empty;
}

function qltdWeeklyTaskUpdatesAttachBudgetContext_(target, budgetContext, masterTaskCode) {
  const item = budgetContext && budgetContext.taskLinkedByMaster &&
    budgetContext.taskLinkedByMaster[qltdWeeklyTaskUpdatesNormalizeTaskCode_(masterTaskCode)];
  if (!item) return target;
  target.budgetItemCode = item.budgetItemCode;
  target.budgetItemName = item.budgetItemName;
  target.budgetType = item.budgetType;
  target.budgetGroup = item.budgetGroup;
  target.budgetStage = item.budgetStage;
  target.budgetFlowType = item.budgetFlowType;
  if (!Number(target.budgetPlan || 0) && Number(item.approvedBudget || 0)) target.budgetPlan = Number(item.approvedBudget || 0);
  return target;
}

function qltdWeeklyTaskUpdatesResolveCashFlowType_(source) {
  const text = [
    source && source.budgetFlowType,
    source && source.cashFlowType,
    source && source.flowType,
    source && source.budgetGroup,
    source && source.budgetStage,
    source && source.budgetItemName,
    source && source.taskName
  ].join(' ');
  const key = qltdWeeklyTaskUpdatesNormalizeStatusKey_(text);
  if (key.indexOf('khoanthu') >= 0 || key.indexOf('dongthu') >= 0 || key.indexOf('doanhthu') >= 0 || /(^|[^a-z])thu([^a-z]|$)/.test(key)) return 'THU';
  if (key.indexOf('khoanchi') >= 0 || key.indexOf('dongchi') >= 0 || key.indexOf('chiphi') >= 0 || /(^|[^a-z])chi([^a-z]|$)/.test(key)) return 'CHI';
  return '';
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

function qltdWeeklyTaskUpdatesResolveActualDateLifecycle_(payload, validation, currentItem, scope) {
  const action = 'weekly_taskupdates_save';
  const existingStart = qltdBudgetFormatDate_(currentItem && currentItem.actualStart);
  const existingFinish = qltdBudgetFormatDate_(currentItem && currentItem.actualFinish);
  const startEditRequested = qltdWeeklyTaskUpdatesActualDateEditRequested_(payload, 'actualStart');
  const finishEditRequested = qltdWeeklyTaskUpdatesActualDateEditRequested_(payload, 'actualFinish');
  const completionState = qltdWeeklyTaskUpdatesIsCompletionState_(validation);

  if (!validation.actualStart && existingStart) validation.actualStart = existingStart;
  if (!validation.actualFinish && existingFinish) validation.actualFinish = existingFinish;

  if (startEditRequested && !validation.actualStart) {
    return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACTUAL_START_REQUIRED', 'ActualStart is required when user confirms or edits the actual start date.', scope.meta, scope.warnings) };
  }
  if (validation.progressEnd > 0 && validation.progressEnd < 100 && !validation.actualStart) {
    return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACTUAL_START_REQUIRED', 'ActualStart is required once task progress is between 1 and 99%.', scope.meta, scope.warnings) };
  }
  if (completionState && !validation.actualFinish) {
    return { error: qltdWorkError_(QLTD_WEEKLY_TASK_UPDATE_SOURCE, action, 'ACTUAL_FINISH_REQUIRED', 'ActualFinish is required when task reaches 100% or completed status.', scope.meta, scope.warnings) };
  }
  if (!completionState && !finishEditRequested && !existingFinish) {
    validation.actualFinish = '';
  }

  validation.actualStartShouldWrite = !!validation.actualStart && (!existingStart || startEditRequested);
  validation.actualFinishShouldWrite = !!validation.actualFinish && ((completionState && !existingFinish) || finishEditRequested);
  validation.existingActualStart = existingStart;
  validation.existingActualFinish = existingFinish;
  return { error: null };
}

function qltdWeeklyTaskUpdatesActualDateEditRequested_(payload, field) {
  const editKey = field + 'Edit';
  const modeKey = field + 'Mode';
  const editValue = String(payload && payload[editKey] || '').trim().toLowerCase();
  const modeValue = String(payload && payload[modeKey] || '').trim().toLowerCase();
  return qltdWeeklyTaskUpdatesTruthy_(payload && payload[editKey]) ||
    editValue === 'edit' || editValue === 'confirm' || editValue === 'complete' ||
    modeValue === 'edit' || modeValue === 'confirm' || modeValue === 'complete';
}

function qltdWeeklyTaskUpdatesTruthy_(value) {
  const text = String(value || '').trim().toLowerCase();
  return value === true || value === 1 || text === '1' || text === 'true' || text === 'yes';
}

function qltdWeeklyTaskUpdatesSyncTask_(payload, validation, scope, auth) {
  const updates = { status: validation.taskStatus };
  if (validation.actualStartShouldWrite) updates.actualStart = validation.actualStart;
  if (validation.actualFinishShouldWrite) updates.actualFinish = validation.actualFinish;
  if (validation.itemType === 'PB_DETAIL') {
    updates.action = 'work_updatedetailtask'; updates.email = auth.email; updates.projectCode = scope.projectCode;
    updates.deptCode = scope.deptCode; updates.detailTaskId = validation.itemId; updates.progress = validation.progressEnd;
    const result = qltdWorkUpdateDetailTask_(updates);
    return result && result.success ? { result: result } : { result: result, warning: qltdWorkWarning_('TASK_SYNC_PARTIAL', 'Weekly update was saved but PB_DETAIL sync failed.') };
  }
  if (qltdWeeklyTaskUpdatesIsCompletionProposal_(validation)) {
    return {
      result: {
        success: true,
        approvalRequired: true,
        approvalStatus: QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING,
        skippedMasterSync: true,
        message: 'MASTER completion proposal saved for Admin approval. Cong_viec was not updated.'
      },
      warning: qltdWorkWarning_('MASTER_COMPLETION_APPROVAL_PENDING', 'MASTER completion proposal saved; Admin must approve and update Cong_viec manually.')
    };
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
  if (target.error) return null;
  const official = qltdWeeklyTaskUpdatesReadOfficialMasters_(scope, [target.task], action);
  return official.error || !official.tasks.length ? target.task : official.tasks[0];
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
  const lastColumn = sheet.getLastColumn();
  const width = Math.max(lastColumn, QLTD_WEEKLY_TASK_UPDATE_HEADERS.length);
  const current = sheet.getRange(1, 1, 1, width).getValues()[0].map(function(value) { return String(value || '').trim(); });
  const baseMismatches = QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.map(function(expected, index) {
    return current[index] === expected ? null : { column: index + 1, expected: expected, actual: current[index] };
  }).filter(Boolean);
  const approvalMismatches = QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS.map(function(expected, index) {
    const column = QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.length + index;
    return current[column] === expected ? null : { column: column + 1, expected: expected, actual: current[column] };
  }).filter(Boolean);
  const extraHeaders = current.slice(QLTD_WEEKLY_TASK_UPDATE_HEADERS.length).filter(function(value) { return !!value; });
  const approvalHeadersPresent = !approvalMismatches.length && lastColumn >= QLTD_WEEKLY_TASK_UPDATE_HEADERS.length;
  const headerMatches = !baseMismatches.length && approvalHeadersPresent && !extraHeaders.length && lastColumn === QLTD_WEEKLY_TASK_UPDATE_HEADERS.length;
  const oldHeaderMatches = !baseMismatches.length && lastColumn === QLTD_WEEKLY_TASK_UPDATE_BASE_HEADERS.length &&
    !QLTD_WEEKLY_TASK_UPDATE_APPROVAL_HEADERS.some(function(header) { return current.indexOf(header) !== -1; });
  return {
    headerMatches: headerMatches,
    canAppendApprovalColumns: oldHeaderMatches,
    approvalHeadersPresent: approvalHeadersPresent,
    mismatches: headerMatches || oldHeaderMatches ? [] : baseMismatches.concat(approvalMismatches)
  };
}

function qltdWeeklyTaskUpdatesNormalize_(object, rowNumber) {
  const update = {
    updateId: String(object.UpdateId || '').trim(), projectCode: qltdWorkNormalizeCode_(object.ProjectCode), deptCode: qltdWorkNormalizeCode_(object.DeptCode),
    weekCode: qltdWorkNormalizeWeekCode_(object.WeekCode), itemType: qltdWeeklyTaskUpdatesNormalizeType_(object.ItemType), itemId: String(object.ItemId || '').trim(),
    thisWeekResult: String(object.ThisWeekResult || ''), progressEnd: Number(object.ProgressEnd || 0), taskStatus: String(object.TaskStatus || ''),
    actualStart: qltdBudgetFormatDate_(object.ActualStart), actualFinish: qltdBudgetFormatDate_(object.ActualFinish), issue: String(object.Issue || ''),
    recommendation: String(object.Recommendation || ''), budgetThisWeek: qltdBudgetToNumber_(object.BudgetThisWeek), budgetNote: String(object.BudgetNote || ''),
    updatedBy: qltdWorkNormalizeEmail_(object.UpdatedBy), updatedAt: qltdWeeklyCellText_(object.UpdatedAt),
    approvalStatus: qltdWeeklyTaskUpdatesNormalizeApprovalStatus_(object.ApprovalStatus),
    reviewReason: String(object.ReviewReason || ''),
    reviewedBy: qltdWorkNormalizeEmail_(object.ReviewedBy),
    reviewedAt: qltdWeeklyCellText_(object.ReviewedAt),
    rowNumber: rowNumber
  };
  update.key = qltdWeeklyTaskUpdatesBuildKey_(update.projectCode, update.deptCode, update.weekCode, update.itemType, update.itemId);
  return update;
}

function qltdWeeklyTaskUpdatesBuildItem_(type, id, source, weekStart, weekEnd, search, hasDetails) {
  const progress = Number(source.progress || 0); const planStart = qltdBudgetFormatDate_(source.planStart); const planFinish = qltdBudgetFormatDate_(source.planFinish);
  const actualStart = qltdBudgetFormatDate_(source.actualStart); const actualFinish = qltdBudgetFormatDate_(source.actualFinish);
  const text = [source.wbs, source.taskName, id].join(' ').toLowerCase(); const query = String(search || '').trim().toLowerCase();
  const officialComplete = qltdWeeklyTaskUpdatesIsOfficialComplete_(source);
  let reason = '';
  if (officialComplete && actualFinish && actualFinish >= weekStart && actualFinish <= weekEnd) reason = 'COMPLETED_THIS_WEEK';
  else if (!officialComplete && progress < 100 && planFinish && planFinish < weekStart) reason = 'OVERDUE';
  else if (!officialComplete && progress < 100 && actualStart) reason = 'IN_PROGRESS';
  else if (!officialComplete && progress < 100 && planStart && planStart <= weekEnd) reason = 'PLANNED';
  else if (query && text.indexOf(query) !== -1 && !planStart && !planFinish) reason = 'UNSCHEDULED';
  if (query && text.indexOf(query) === -1) reason = '';
  return {
    itemType: type, itemId: id, masterTaskCode: type === 'MASTER' ? id : source.masterTaskCode,
    detailTaskId: type === 'PB_DETAIL' ? id : '', parentMasterTaskCode: type === 'PB_DETAIL' ? source.masterTaskCode : '',
    wbs: source.wbs || '', taskName: source.taskName || '', planStart: planStart, planFinish: planFinish,
    actualStart: actualStart, actualFinish: actualFinish, progress: officialComplete ? Math.max(progress, 100) : progress, status: officialComplete ? 'Hoàn thành' : (source.status || ''),
    owner: source.owner || source.ownerText || '', plannedBudget: Number(source.budgetPlan || source.plannedBudget || 0),
    actualBudget: Number(source.budgetActual || source.actualBudget || 0), hasBudget: Number(source.budgetPlan || source.plannedBudget || 0) > 0 || Number(source.budgetActual || source.actualBudget || 0) > 0,
    budgetItemCode: source.budgetItemCode || '',
    budgetItemName: source.budgetItemName || '',
    budgetType: source.budgetType || '',
    budgetGroup: source.budgetGroup || '',
    budgetStage: source.budgetStage || '',
    budgetFlowType: qltdWeeklyTaskUpdatesResolveCashFlowType_(source),
    hasDetails: !!hasDetails, progressReadonly: type === 'MASTER' && !!hasDetails, officialComplete: !!officialComplete, eligibleReason: reason, eligible: !!reason
  };
}

function qltdWeeklyTaskUpdatesSortItems_(a, b) {
  const order = { OVERDUE: 1, IN_PROGRESS: 2, PLANNED: 3, COMPLETED_THIS_WEEK: 4, UNSCHEDULED: 5 };
  return (order[a.eligibleReason] || 9) - (order[b.eligibleReason] || 9) || String(a.planFinish || '9999').localeCompare(String(b.planFinish || '9999')) || String(a.wbs || '').localeCompare(String(b.wbs || ''), 'vi', { numeric: true });
}

function qltdWeeklyTaskUpdatesNormalizeType_(value) { const type = String(value || '').trim().toUpperCase(); return type === 'MASTER' || type === 'PB_DETAIL' ? type : ''; }
function qltdWeeklyTaskUpdatesNormalizeApprovalStatus_(value) {
  const status = String(value || '').trim().toUpperCase();
  return status === QLTD_WEEKLY_TASK_APPROVAL_STATUS.PENDING ||
    status === QLTD_WEEKLY_TASK_APPROVAL_STATUS.APPROVED ||
    status === QLTD_WEEKLY_TASK_APPROVAL_STATUS.REJECTED ? status : '';
}
function qltdWeeklyTaskUpdatesNormalizeTaskCode_(value) {
  return String(value || '').trim().toUpperCase();
}
function qltdWeeklyTaskUpdatesNormalizeStatusKey_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function qltdWeeklyTaskUpdatesIsCompletionProposal_(validation) {
  if (!validation || validation.itemType !== 'MASTER') return false;
  return qltdWeeklyTaskUpdatesIsCompletionState_(validation);
}
function qltdWeeklyTaskUpdatesIsCompletionState_(validation) {
  if (!validation) return false;
  return Number(validation.progressEnd || 0) >= 100 ||
    !!validation.actualFinish ||
    qltdWeeklyTaskUpdatesNormalizeStatusKey_(validation.taskStatus).indexOf('hoanthanh') >= 0 ||
    qltdWeeklyTaskUpdatesNormalizeStatusKey_(validation.taskStatus).indexOf('complete') >= 0 ||
    qltdWeeklyTaskUpdatesNormalizeStatusKey_(validation.taskStatus).indexOf('done') >= 0;
}
function qltdWeeklyTaskUpdatesIsOfficialComplete_(source) {
  if (!source) return false;
  const progress = Number(source.progress || 0);
  const statusKey = qltdWeeklyTaskUpdatesNormalizeStatusKey_(source.status || source.taskStatus || '');
  return progress >= 100 ||
    !!qltdBudgetFormatDate_(source.actualFinish || source.actualEnd || source.endActual || '') ||
    statusKey.indexOf('hoanthanh') >= 0 ||
    statusKey.indexOf('complete') >= 0 ||
    statusKey.indexOf('done') >= 0;
}
function qltdWeeklyTaskUpdatesDate_(value, allowBlank) { const text = String(value || '').trim(); if (!text) return allowBlank ? '' : null; const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!match) return null; const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]); const date = new Date(year, month - 1, day); return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? text : null; }
function qltdWeeklyTaskUpdatesBuildKey_(projectCode, deptCode, weekCode, itemType, itemId) { return [qltdWorkNormalizeCode_(projectCode), qltdWorkNormalizeCode_(deptCode), qltdWorkNormalizeWeekCode_(weekCode), qltdWeeklyTaskUpdatesNormalizeType_(itemType), String(itemId || '').trim()].join('|'); }
