function qltdBudgetRebuildAggregates_(payload) {
  const action = 'budget_rebuildAggregates';
  const email = qltdDevApiNormalizeEmail_(payload && payload.email);
  const meta = { action: action, email: email };
  const guard = qltdBudgetValidateRebuildRequest_(payload || {}, meta);
  if (guard.error) return guard.error;

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_BUDGET_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) return qltdBudgetRebuildError_(action, 'REBUILD_LOCK_TIMEOUT', 'Khong lay duoc lock rebuild ngan sach.', meta);

    const sheets = qltdBudgetGetAggregateSheets_();
    const rawParsed = qltdBudgetReadSheetAsObjects_(sheets.raw, 4);
    const summaryParsed = qltdBudgetReadSheetAsObjects_(sheets.summary, 4);
    const dashboardParsed = qltdBudgetReadSheetAsObjects_(sheets.dashboard, 4);
    qltdBudgetRequireAggregateHeaders_(rawParsed.headers, QLTD_BUDGET_CENTRAL_RAW_HEADERS, QLTD_BUDGET_SHEET.CENTRAL_RAW);
    qltdBudgetRequireAggregateHeaders_(summaryParsed.headers, QLTD_BUDGET_CENTRAL_SUMMARY_HEADERS, QLTD_BUDGET_SHEET.CENTRAL_SUMMARY);
    qltdBudgetRequireAggregateHeaders_(dashboardParsed.headers, QLTD_BUDGET_CENTRAL_DASHBOARD_HEADERS, QLTD_BUDGET_SHEET.CENTRAL_DASHBOARD);

    const itemsResult = qltdBudgetReadBudgetItems_();
    const deptsResult = qltdBudgetReadProjectDepts_();
    const sourceWarnings = (itemsResult.warnings || []).slice();
    if (deptsResult.error) {
      sourceWarnings.push(qltdBudgetWarning_('PROJECT_DEPTS_UNAVAILABLE', 'Khong doc duoc Project_Depts; ma phong/ban co the de trong.'));
    }
    const aggregate = qltdBudgetBuildAggregateData_(
      rawParsed.rows,
      rawParsed.headerMap,
      itemsResult.items || [],
      deptsResult.departments || [],
      sheets.raw.getParent().getSpreadsheetTimeZone()
    );
    aggregate.warnings = sourceWarnings.concat(aggregate.warnings || []);

    const summaryRows = aggregate.summary.map(qltdBudgetSummaryToRow_);
    const dashboardRows = aggregate.dashboard.map(qltdBudgetDashboardToRow_);
    qltdBudgetReplaceAggregateSheets_(sheets.summary, summaryRows, QLTD_BUDGET_CENTRAL_SUMMARY_HEADERS.length, sheets.dashboard, dashboardRows, QLTD_BUDGET_CENTRAL_DASHBOARD_HEADERS.length);

    aggregate.warnings.push(qltdBudgetWarning_('SYNC_LOG_NOT_WRITTEN', 'SYS_Sync_Log chua co helper/schema log rebuild duoc xac nhan; khong ghi log sheet.'));
    const rebuiltAt = qltdBudgetNowIso_();
    return qltdBudgetRebuildResponse_(true, 'OK', action, {
      rawRowsRead: rawParsed.rows.length,
      validRows: aggregate.validRows,
      skippedRows: rawParsed.rows.length - aggregate.validRows,
      summaryRowsWritten: summaryRows.length,
      dashboardRowsWritten: dashboardRows.length,
      summarySheet: QLTD_BUDGET_SHEET.CENTRAL_SUMMARY,
      dashboardSheet: QLTD_BUDGET_SHEET.CENTRAL_DASHBOARD,
      rebuiltAt: rebuiltAt
    }, aggregate.warnings, [], meta);
  } catch (error) {
    return qltdBudgetRebuildResponse_(false, 'ERROR', action, null, [], [{
      code: error && error.code || 'AGGREGATE_REBUILD_FAILED',
      message: qltdBudgetSafeErrorMessage_(error),
      details: error && error.details || undefined
    }], meta);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdBudgetValidateRebuildRequest_(payload, meta) {
  if (String(payload.confirm || '').trim() !== QLTD_BUDGET_REBUILD_CONFIRM_TOKEN) {
    return { error: qltdBudgetRebuildError_('budget_rebuildAggregates', 'REBUILD_CONFIRMATION_REQUIRED', 'Can confirm=YES_REBUILD_BUDGET de rebuild.', meta) };
  }
  const email = qltdDevApiNormalizeEmail_(payload.email);
  if (!email) return { error: qltdBudgetRebuildError_('budget_rebuildAggregates', 'EMAIL_REQUIRED', 'email la bat buoc.', meta) };
  const user = qltdUsersGetByEmail_(email);
  if (!user || user.status !== 'ACTIVE' || user.role !== 'ADMIN') {
    return { error: qltdBudgetRebuildError_('budget_rebuildAggregates', 'ACCESS_DENIED', 'Chi ADMIN ACTIVE duoc rebuild ngan sach.', meta) };
  }
  return { error: null };
}

function qltdBudgetGetAggregateSheets_() {
  const raw = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_RAW);
  const summary = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_SUMMARY);
  const dashboard = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_DASHBOARD);
  const missing = [];
  if (!raw) missing.push(QLTD_BUDGET_SHEET.CENTRAL_RAW);
  if (!summary) missing.push(QLTD_BUDGET_SHEET.CENTRAL_SUMMARY);
  if (!dashboard) missing.push(QLTD_BUDGET_SHEET.CENTRAL_DASHBOARD);
  if (missing.length) {
    const error = new Error('Thieu sheet bat buoc cho aggregate rebuild.');
    error.code = 'AGGREGATE_SHEET_MISSING';
    error.details = { missingSheets: missing };
    throw error;
  }
  return { raw: raw, summary: summary, dashboard: dashboard };
}

function qltdBudgetRequireAggregateHeaders_(actual, expected, sheetName) {
  const mismatch = [];
  for (let index = 0; index < expected.length; index += 1) {
    if (qltdBudgetNormalizeKey_(actual[index]) !== qltdBudgetNormalizeKey_(expected[index])) {
      mismatch.push({ columnNumber: index + 1, expected: expected[index], actual: actual[index] || '' });
    }
  }
  if (mismatch.length) {
    const error = new Error('Header aggregate khong dung schema: ' + sheetName);
    error.code = 'AGGREGATE_HEADER_MISMATCH';
    error.details = { sheetName: sheetName, mismatch: mismatch };
    throw error;
  }
}

function qltdBudgetBuildAggregateData_(rawRows, headerMap, items, departments, timeZone) {
  const warnings = [];
  const valid = [];
  (rawRows || []).forEach(function(item) {
    const parsed = qltdBudgetParseAggregateRawRow_(item, headerMap, timeZone);
    if (parsed.error) {
      warnings.push(qltdBudgetWarning_(parsed.error.code, parsed.error.message, { rowNumber: item.rowNumber }));
      return;
    }
    valid.push(parsed.value);
  });

  const approvedResult = qltdBudgetBuildApprovedBudgetIndex_(items || [], departments || []);
  const approvedIndex = approvedResult.index;
  Array.prototype.push.apply(warnings, approvedResult.warnings || []);
  const groups = {};
  valid.forEach(function(row) {
    row.deptCode = qltdBudgetResolveBudgetDeptCode_(row.projectCode, '', row.deptName, departments || []);
    if (!row.deptCode) {
      warnings.push(qltdBudgetWarning_('RAW_DEPT_CODE_NOT_RESOLVED', 'Khong resolve duoc ma phong/ban cho dong Raw; khong the doi ngan sach duyet bang deptCode.', {
        rowNumber: row.firstRowNumber,
        projectCode: row.projectCode,
        deptName: row.deptName,
        budgetType: row.budgetType,
        masterTaskCode: row.masterTaskCode,
        budgetItemCode: row.budgetItemCode
      }));
    }
    const key = qltdBudgetAggregateGroupKey_(row);
    if (!groups[key]) groups[key] = qltdBudgetNewAggregateGroup_(row, key);
    const group = groups[key];
    group.plan += row.plan;
    group.actual += row.actual;
    if (row.updatedAtMs > group.updatedAtMs) {
      group.updatedAtMs = row.updatedAtMs;
      group.updatedAt = row.updatedAt;
    }
  });

  const summary = Object.keys(groups).map(function(key) {
    const group = groups[key];
    const approved = approvedIndex[qltdBudgetApprovedBudgetKey_(group)];
    if (approved && approved.duplicate) {
      warnings.push(qltdBudgetWarning_('APPROVED_BUDGET_KEY_DUPLICATE_FOR_GROUP', 'Key ngan sach duyet bi trung; khong gan ngan sach tong the de tranh ghi de am tham.', {
        rowNumber: group.firstRowNumber,
        key: approved.key,
        firstRowNumber: approved.firstRowNumber,
        duplicateRowNumber: approved.duplicateRowNumber,
        budgetType: group.budgetType,
        projectCode: group.projectCode,
        deptCode: group.deptCode,
        masterTaskCode: group.masterTaskCode,
        budgetItemCode: group.budgetItemCode
      }));
    }
    group.hasApprovedBudget = !!approved && !approved.duplicate;
    group.totalBudget = group.hasApprovedBudget ? approved.value : '';
    group.periodSort = qltdBudgetParseAggregatePeriod_(group.periodType, group.periodCode);
    if (group.periodSort === null) {
      warnings.push(qltdBudgetWarning_('PERIOD_CODE_UNPARSEABLE', 'Ma ky khong parse duoc; luy ke chi bang thuc hien ky.', {
        rowNumber: group.firstRowNumber,
        periodType: group.periodType,
        periodCode: group.periodCode
      }));
    }
    return group;
  });

  qltdBudgetApplyCumulative_(summary);
  summary.forEach(function(group) {
    group.remaining = group.hasApprovedBudget ? group.totalBudget - group.cumulative : '';
    group.usageRate = group.hasApprovedBudget && group.totalBudget > 0 ? group.cumulative / group.totalBudget : '';
    group.warning = qltdBudgetAggregateWarningLabel_(group);
  });
  summary.sort(qltdBudgetCompareAggregateRows_);

  return {
    validRows: valid.length,
    summary: summary,
    dashboard: qltdBudgetBuildDashboardRows_(summary, departments || [], warnings),
    warnings: warnings
  };
}

function qltdBudgetParseAggregateRawRow_(item, headerMap, timeZone) {
  const row = item.raw;
  const periodType = String(qltdBudgetGetCell_(row, headerMap, 'Loai ky', '') || '').trim();
  const periodCodeRaw = qltdBudgetGetCell_(row, headerMap, 'Ma ky', '');
  const requiresMasterRaw = qltdBudgetGetCell_(row, headerMap, 'Yeu cau ma cong viec Master', '');
  const value = {
    firstRowNumber: item.rowNumber,
    reportId: String(qltdBudgetGetCell_(row, headerMap, 'Report ID', '') || '').trim(),
    projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, headerMap, 'Ma du an', '')),
    projectName: String(qltdBudgetGetCell_(row, headerMap, 'Ten du an', '') || '').trim(),
    deptName: String(qltdBudgetGetCell_(row, headerMap, 'Phong/Ban', '') || '').trim(),
    periodType: periodType,
    periodCode: qltdBudgetNormalizeAggregatePeriodCode_(periodType, periodCodeRaw, timeZone),
    masterTaskCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma cong viec Master', '') || '').trim(),
    wbs: String(qltdBudgetGetCell_(row, headerMap, 'WBS/STT', '') || '').trim(),
    taskName: String(qltdBudgetGetCell_(row, headerMap, 'Noi dung cong viec', '') || '').trim(),
    plan: qltdBudgetToNumber_(qltdBudgetGetCell_(row, headerMap, 'Ke hoach ngan sach ky', 0)),
    actual: qltdBudgetToNumber_(qltdBudgetGetCell_(row, headerMap, 'Gia tri thuc hien ky nay', 0)),
    confirmStatus: String(qltdBudgetGetCell_(row, headerMap, 'Trang thai xac nhan', '') || '').trim(),
    syncStatus: String(qltdBudgetGetCell_(row, headerMap, 'Sync status', '') || '').trim().toUpperCase(),
    budgetItemCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma khoan ngan sach', '') || '').trim(),
    budgetItemName: String(qltdBudgetGetCell_(row, headerMap, 'Ten khoan ngan sach', '') || '').trim(),
    budgetType: String(qltdBudgetGetCell_(row, headerMap, 'Loai ngan sach', '') || '').trim().toUpperCase(),
    budgetGroup: String(qltdBudgetGetCell_(row, headerMap, 'Nhom ngan sach', '') || '').trim(),
    budgetStage: String(qltdBudgetGetCell_(row, headerMap, 'Giai doan ngan sach', '') || '').trim(),
    requiresMaster: qltdBudgetNormalizeAggregateBoolean_(requiresMasterRaw)
  };
  const dates = [qltdBudgetGetCell_(row, headerMap, 'Thoi diem gui', ''), qltdBudgetGetCell_(row, headerMap, 'Sync at', '')]
    .map(qltdBudgetAggregateDateMs_).filter(function(ms) { return ms !== null; });
  value.updatedAtMs = dates.length ? Math.max.apply(null, dates) : 0;
  value.updatedAt = value.updatedAtMs ? new Date(value.updatedAtMs) : '';

  if (!value.reportId) return qltdBudgetInvalidAggregateRow_('REPORT_ID_REQUIRED', 'Report ID trong.');
  if (value.syncStatus !== 'SYNCED') return qltdBudgetInvalidAggregateRow_('RAW_NOT_SYNCED', 'Dong Raw chua SYNCED.');
  if (qltdBudgetNormalizeKey_(value.confirmStatus) === 'huy') return qltdBudgetInvalidAggregateRow_('RAW_CANCELLED', 'Dong Raw da Huy.');
  if (!value.projectCode) return qltdBudgetInvalidAggregateRow_('PROJECT_CODE_REQUIRED', 'Ma du an trong.');
  if (!value.periodCode) return qltdBudgetInvalidAggregateRow_('PERIOD_CODE_REQUIRED', 'Ma ky trong.');
  const periodKey = qltdBudgetNormalizeKey_(value.periodType);
  if (periodKey !== 'thang' && periodKey !== 'tuan') return qltdBudgetInvalidAggregateRow_('PERIOD_TYPE_INVALID', 'Loai ky khong phai Thang/Tuan.');
  if (value.budgetType !== QLTD_BUDGET_TYPE.TASK_LINKED && value.budgetType !== QLTD_BUDGET_TYPE.DEPT_STANDALONE) {
    return qltdBudgetInvalidAggregateRow_('BUDGET_TYPE_INVALID', 'Loai ngan sach khong hop le.');
  }
  if (value.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED && (!value.masterTaskCode || value.requiresMaster !== 'TRUE')) {
    return qltdBudgetInvalidAggregateRow_('TASK_LINKED_CONTEXT_INVALID', 'TASK_LINKED thieu ma Master hoac flag TRUE.');
  }
  if (value.budgetType === QLTD_BUDGET_TYPE.DEPT_STANDALONE && (!value.budgetItemCode || value.masterTaskCode || value.requiresMaster !== 'FALSE')) {
    return qltdBudgetInvalidAggregateRow_('STANDALONE_CONTEXT_INVALID', 'DEPT_STANDALONE context khong hop le.');
  }
  return { value: value, error: null };
}

function qltdBudgetNormalizeAggregatePeriodCode_(periodType, value, timeZone) {
  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    const periodKey = qltdBudgetNormalizeKey_(periodType);
    const targetTimeZone = String(timeZone || 'Asia/Ho_Chi_Minh');

    if (periodKey === 'thang') {
      return Utilities.formatDate(value, targetTimeZone, 'yyyy-MM');
    }

    if (periodKey === 'tuan') {
      return qltdBudgetAggregateIsoWeekCode_(value, targetTimeZone);
    }
  }

  return String(
    value === null || value === undefined ? '' : value
  ).trim();
}

function qltdBudgetAggregateIsoWeekCode_(value, timeZone) {
  const dateText = Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
  const parts = dateText.split('-');

  const utcDate = new Date(Date.UTC(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  ));

  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);

  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));

  const isoWeek = Math.ceil(
    (((utcDate - yearStart) / 86400000) + 1) / 7
  );

  return isoYear + '-W' + String(isoWeek).padStart(2, '0');
}

function qltdBudgetNormalizeAggregateBoolean_(value) {
  if (value === true) return 'TRUE';
  if (value === false) return 'FALSE';

  return String(
    value === null || value === undefined ? '' : value
  ).trim().toUpperCase();
}
function qltdBudgetInvalidAggregateRow_(code, message) {
  return { value: null, error: { code: code, message: message } };
}

function qltdBudgetAggregateGroupKey_(row) {
  const entity = row.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED ? row.masterTaskCode : row.budgetItemCode;
  return [row.projectCode, qltdBudgetNormalizeKey_(row.periodType).toUpperCase(), qltdBudgetNormalizeCode_(row.periodCode), qltdBudgetNormalizeCode_(row.deptCode), row.budgetType, qltdBudgetNormalizeCode_(entity)].join('|');
}

function qltdBudgetNewAggregateGroup_(row, groupKey) {
  return Object.assign({}, row, {
    groupKey: groupKey,
    entityKey: qltdBudgetAggregateEntityKey_(row),
    plan: 0,
    actual: 0,
    cumulative: 0,
    updatedAtMs: 0,
    updatedAt: ''
  });
}

function qltdBudgetAggregateEntityKey_(row) {
  const entity = row.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED ? row.masterTaskCode : row.budgetItemCode;
  return [row.projectCode, qltdBudgetNormalizeCode_(row.deptCode), row.budgetType, qltdBudgetNormalizeCode_(entity)].join('|');
}

function qltdBudgetBuildApprovedBudgetIndex_(items, departments) {
  const index = {};
  const warnings = [];
  (items || []).forEach(function(item) {
    if (item.status !== 'ACTIVE' || !item.hasApprovedBudget) return;
    const deptCode = qltdBudgetResolveBudgetDeptCode_(item.projectCode, item.deptCode, item.deptName, departments || []);
    const entityCode = qltdBudgetApprovedBudgetEntityCode_(item);
    const missing = [];
    if (!item.projectCode) missing.push('projectCode');
    if (!deptCode) missing.push('deptCode');
    if (!item.budgetType) missing.push('budgetType');
    if (!entityCode) missing.push(item.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED ? 'masterTaskCode' : 'budgetItemCode');
    if (missing.length) {
      warnings.push(qltdBudgetWarning_('APPROVED_BUDGET_KEY_INCOMPLETE', 'Dong CENTRAL_NS_Items thieu thanh phan key ngan sach duyet.', {
        rowNumber: item.rowNumber,
        missingFields: missing,
        projectCode: item.projectCode,
        deptCode: deptCode,
        deptName: item.deptName,
        budgetType: item.budgetType,
        masterTaskCode: item.masterTaskCode,
        budgetItemCode: item.budgetItemCode
      }));
      return;
    }

    const key = qltdBudgetApprovedBudgetKeyFromParts_(item.projectCode, deptCode, item.budgetType, entityCode);
    if (index[key]) {
      warnings.push(qltdBudgetWarning_('APPROVED_BUDGET_KEY_DUPLICATE', 'Key ngan sach duyet bi trung trong CENTRAL_NS_Items; khong ghi de am tham.', {
        key: key,
        firstRowNumber: index[key].firstRowNumber,
        duplicateRowNumber: item.rowNumber,
        projectCode: item.projectCode,
        deptCode: deptCode,
        budgetType: item.budgetType,
        masterTaskCode: item.masterTaskCode,
        budgetItemCode: item.budgetItemCode
      }));
      index[key] = Object.assign({}, index[key], {
        duplicate: true,
        duplicateRowNumber: item.rowNumber
      });
      return;
    }
    index[key] = {
      key: key,
      value: item.approvedBudget,
      firstRowNumber: item.rowNumber,
      duplicate: false
    };
  });
  return { index: index, warnings: warnings };
}

function qltdBudgetApprovedBudgetKey_(group) {
  return qltdBudgetApprovedBudgetKeyFromParts_(
    group.projectCode,
    group.deptCode,
    group.budgetType,
    group.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED ? group.masterTaskCode : group.budgetItemCode
  );
}

function qltdBudgetApprovedBudgetKeyFromParts_(projectCode, deptCode, budgetType, entityCode) {
  return [qltdBudgetNormalizeCode_(projectCode), qltdBudgetNormalizeCode_(deptCode), String(budgetType || '').trim().toUpperCase(), qltdBudgetNormalizeCode_(entityCode)].join('|');
}

function qltdBudgetApprovedBudgetEntityCode_(item) {
  if (item.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED) return qltdBudgetNormalizeCode_(item.masterTaskCode);
  if (item.budgetType === QLTD_BUDGET_TYPE.DEPT_STANDALONE) return qltdBudgetNormalizeCode_(item.budgetItemCode);
  return '';
}

function qltdBudgetResolveBudgetDeptCode_(projectCode, deptCode, deptName, departments) {
  const direct = qltdBudgetNormalizeCode_(deptCode);
  if (direct) return direct;

  const normalizedProjectCode = qltdBudgetNormalizeCode_(projectCode);
  const normalizedDeptName = qltdBudgetNormalizeKey_(deptName);
  if (!normalizedProjectCode || !normalizedDeptName) return '';

  const match = (departments || []).filter(function(dept) {
    return dept.status === 'ACTIVE' &&
      qltdBudgetNormalizeCode_(dept.projectCode) === normalizedProjectCode &&
      qltdBudgetNormalizeKey_(dept.deptName) === normalizedDeptName;
  })[0];
  return match ? qltdBudgetNormalizeCode_(match.deptCode) : '';
}

function qltdBudgetParseAggregatePeriod_(periodType, periodCode) {
  const code = String(periodCode || '').trim().toUpperCase();
  if (qltdBudgetNormalizeKey_(periodType) === 'thang') {
    const month = /^(\d{4})-(\d{2})$/.exec(code);
    if (!month || Number(month[2]) < 1 || Number(month[2]) > 12) return null;
    return Number(month[1]) * 100 + Number(month[2]);
  }
  const week = /^(\d{4})-W?(\d{1,2})$/.exec(code);
  if (!week || Number(week[2]) < 1 || Number(week[2]) > 53) return null;
  return Number(week[1]) * 100 + Number(week[2]);
}

function qltdBudgetApplyCumulative_(summary) {
  const byEntityAndType = {};
  summary.forEach(function(group) {
    const key = group.entityKey + '|' + qltdBudgetNormalizeKey_(group.periodType);
    if (!byEntityAndType[key]) byEntityAndType[key] = [];
    byEntityAndType[key].push(group);
  });
  Object.keys(byEntityAndType).forEach(function(key) {
    const rows = byEntityAndType[key];
    rows.forEach(function(current) {
      if (current.periodSort === null) {
        current.cumulative = current.actual;
        return;
      }
      current.cumulative = rows.reduce(function(total, candidate) {
        return candidate.periodSort !== null && candidate.periodSort <= current.periodSort ? total + candidate.actual : total;
      }, 0);
    });
  });
}

function qltdBudgetAggregateWarningLabel_(group) {
  if (!group.hasApprovedBudget) return 'CHƯA CÓ NGÂN SÁCH DUYỆT';
  if (group.remaining < 0) return 'VƯỢT NGÂN SÁCH';
  if (group.usageRate !== '' && group.usageRate >= 0.9 && group.usageRate <= 1) return 'SẮP HẾT';
  return 'BÌNH THƯỜNG';
}

function qltdBudgetBuildDashboardRows_(summary, departments, warnings) {
  const groups = {};
  summary.forEach(function(row) {
    const entity = row.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED ? row.masterTaskCode : row.budgetItemCode;
    const key = [row.projectCode, qltdBudgetNormalizeKey_(row.periodType), qltdBudgetNormalizeCode_(row.periodCode), qltdBudgetNormalizeCode_(row.deptCode), row.budgetType, qltdBudgetNormalizeKey_(row.budgetGroup), qltdBudgetNormalizeCode_(entity)].join('|');
    if (!groups[key]) groups[key] = { rows: [], first: row };
    groups[key].rows.push(row);
  });

  const result = [];
  Object.keys(groups).sort().forEach(function(key) {
    const bucket = groups[key];
    const first = bucket.first;
    const deptCode = qltdBudgetResolveAggregateDeptCode_(first, departments);
    if (!deptCode) warnings.push(qltdBudgetWarning_('DEPT_CODE_NOT_RESOLVED', 'Khong resolve duoc ma phong/ban.', { projectCode: first.projectCode, deptName: first.deptName }));
    const approvedEntities = {};
    let approved = 0;
    let plan = 0;
    let actual = 0;
    let cumulative = 0;
    let remaining = 0;
    let over = 0;
    let near = 0;
    let updatedAtMs = 0;
    bucket.rows.forEach(function(row) {
      plan += row.plan;
      actual += row.actual;
      cumulative += row.cumulative;
      if (row.hasApprovedBudget) {
        remaining += row.remaining;
        if (!approvedEntities[row.entityKey]) {
          approved += row.totalBudget;
          approvedEntities[row.entityKey] = true;
        }
      }
      if (row.warning === 'VƯỢT NGÂN SÁCH') over += 1;
      if (row.warning === 'SẮP HẾT') near += 1;
      updatedAtMs = Math.max(updatedAtMs, row.updatedAtMs || 0);
    });
    const common = {
      projectCode: first.projectCode, projectName: first.projectName, periodType: first.periodType,
      periodCode: first.periodCode, deptCode: deptCode, deptName: first.deptName,
      budgetType: first.budgetType, budgetGroup: first.budgetGroup, budgetItemCode: first.budgetItemCode,
      updatedAt: updatedAtMs ? new Date(updatedAtMs) : ''
    };
    [
      ['Tổng ngân sách được duyệt', approved, 'VND'],
      ['Tổng kế hoạch kỳ', plan, 'VND'],
      ['Tổng thực hiện kỳ', actual, 'VND'],
      ['Tổng thực hiện lũy kế', cumulative, 'VND'],
      ['Tổng còn lại', remaining, 'VND'],
      ['Số khoản vượt ngân sách', over, 'Khoản'],
      ['Số khoản sắp hết ngân sách', near, 'Khoản']
    ].forEach(function(metric) {
      result.push(Object.assign({}, common, { metricGroup: 'NGAN_SACH', metricName: metric[0], value: metric[1], unit: metric[2], note: '' }));
    });
  });
  return result;
}

function qltdBudgetResolveAggregateDeptCode_(row, departments) {
  if (row.deptCode) return row.deptCode;
  const match = (departments || []).filter(function(dept) {
    return dept.status === 'ACTIVE' && dept.projectCode === row.projectCode && qltdBudgetNormalizeKey_(dept.deptName) === qltdBudgetNormalizeKey_(row.deptName);
  })[0];
  return match ? match.deptCode : '';
}

function qltdBudgetSummaryToRow_(row) {
  const standalone = row.budgetType === QLTD_BUDGET_TYPE.DEPT_STANDALONE;
  return [row.projectCode, row.projectName, row.periodType, row.periodCode, standalone ? '' : row.masterTaskCode,
    standalone ? '' : row.wbs, standalone ? row.budgetItemName : row.taskName, row.deptName, row.totalBudget,
    row.plan, row.actual, row.cumulative, row.remaining, row.usageRate, row.warning, row.updatedAt,
    row.budgetItemCode, row.budgetItemName, row.budgetType, row.budgetGroup, row.budgetStage, standalone ? 'FALSE' : 'TRUE'];
}

function qltdBudgetDashboardToRow_(row) {
  return [row.metricGroup, row.metricName, row.projectCode, row.projectName, row.periodType, row.periodCode,
    row.value, row.unit, row.updatedAt, row.note, row.deptCode, row.deptName, row.budgetType, row.budgetGroup, row.budgetItemCode];
}

function qltdBudgetAggregateDateMs_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value.getTime();
  if (value === '' || value === null || value === undefined) return null;
  const ms = Date.parse(String(value));
  return isNaN(ms) ? null : ms;
}

function qltdBudgetCompareAggregateRows_(left, right) {
  return [left.projectCode, left.periodType, left.periodCode, left.deptName, left.budgetType, left.masterTaskCode || left.budgetItemCode].join('|')
    .localeCompare([right.projectCode, right.periodType, right.periodCode, right.deptName, right.budgetType, right.masterTaskCode || right.budgetItemCode].join('|'));
}

function qltdBudgetReplaceAggregateSheets_(summarySheet, summaryRows, summaryWidth, dashboardSheet, dashboardRows, dashboardWidth) {
  const summarySnapshot = qltdBudgetSnapshotDataRegion_(summarySheet, summaryWidth);
  const dashboardSnapshot = qltdBudgetSnapshotDataRegion_(dashboardSheet, dashboardWidth);
  try {
    qltdBudgetRewriteDataRegion_(summarySheet, summaryRows, summaryWidth);
    qltdBudgetRewriteDataRegion_(dashboardSheet, dashboardRows, dashboardWidth);
  } catch (writeError) {
    try {
      qltdBudgetRestoreDataRegion_(summarySheet, summarySnapshot, summaryWidth);
      qltdBudgetRestoreDataRegion_(dashboardSheet, dashboardSnapshot, dashboardWidth);
    } catch (rollbackError) {
      const error = new Error('Aggregate write loi va rollback that bai: ' + qltdBudgetSafeErrorMessage_(rollbackError));
      error.code = 'AGGREGATE_ROLLBACK_FAILED';
      error.details = { writeError: qltdBudgetSafeErrorMessage_(writeError), rollbackError: qltdBudgetSafeErrorMessage_(rollbackError) };
      throw error;
    }
    const error = new Error('Aggregate write loi; da rollback content cu.');
    error.code = 'AGGREGATE_WRITE_FAILED';
    error.details = { writeError: qltdBudgetSafeErrorMessage_(writeError), rolledBack: true };
    throw error;
  }
}

function qltdBudgetSnapshotDataRegion_(sheet, width) {
  const rowCount = Math.max(sheet.getLastRow() - 4, 0);
  return rowCount ? sheet.getRange(5, 1, rowCount, width).getValues() : [];
}

function qltdBudgetRewriteDataRegion_(sheet, rows, width) {
  const clearCount = Math.max(sheet.getLastRow() - 4, 0);
  if (clearCount) sheet.getRange(5, 1, clearCount, width).clearContent();
  if (!rows.length) return;
  qltdBudgetEnsureAggregateRows_(sheet, rows.length + 4);
  sheet.getRange(5, 1, rows.length, width).setValues(rows);
}

function qltdBudgetRestoreDataRegion_(sheet, snapshot, width) {
  const clearCount = Math.max(sheet.getLastRow() - 4, snapshot.length, 0);
  if (clearCount) sheet.getRange(5, 1, clearCount, width).clearContent();
  if (!snapshot.length) return;
  qltdBudgetEnsureAggregateRows_(sheet, snapshot.length + 4);
  sheet.getRange(5, 1, snapshot.length, width).setValues(snapshot);
}

function qltdBudgetEnsureAggregateRows_(sheet, requiredRows) {
  const missing = requiredRows - sheet.getMaxRows();
  if (missing > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missing);
}

function qltdBudgetRebuildError_(action, code, message, meta) {
  return qltdBudgetRebuildResponse_(false, 'VALIDATION_ERROR', action, null, [], [{ code: code, message: message }], meta);
}

function qltdBudgetRebuildResponse_(success, apiStatus, action, data, warnings, errors, meta) {
  return {
    success: !!success,
    apiStatus: apiStatus || (success ? 'OK' : 'ERROR'),
    source: QLTD_BUDGET_REBUILD_SOURCE,
    data: success ? (data || {}) : null,
    warnings: warnings || [],
    errors: errors || [],
    meta: Object.assign({ action: action || '', generatedAt: qltdBudgetNowIso_() }, meta || {})
  };
}
