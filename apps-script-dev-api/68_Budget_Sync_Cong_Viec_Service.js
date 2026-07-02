const QLTD_BUDGET_SYNC_SOURCE = 'AUTO_SYNC_CONG_VIEC';
const QLTD_BUDGET_SYNC_HEADER_SCAN_ROWS = 12;

const QLTD_BUDGET_SYNC_HEADER_ALIASES = {
  masterTaskCode: ['ma_cong_viec', 'ma_cong_viec_master', 'ma_cv', 'master_task_code', 'mastertaskcode', 'task_code', 'code'],
  wbs: ['wbs', 'stt', 'ma_wbs', 'wbs_code'],
  taskName: ['cong_viec_pham_vi', 'congviecphamvi', 'pham_vi_cong_viec', 'cong_viec', 'noi_dung_cong_viec', 'ten_cong_viec', 'task_name', 'name', 'text'],
  dept: ['chu_tri', 'phong_ban_chu_tri', 'don_vi_chu_tri', 'ten_phong_ban', 'ma_phong_ban', 'phong_ban', 'dept', 'deptcode', 'owner'],
  directChiPlan: ['tran_chi_phi_truc_tiep', 'tran_chi_phi', 'chi_phi_truc_tiep', 'chi_phi_duoc_duyet', 'ke_hoach_chi'],
  plannedRevenue: ['du_thu_ke_hoach', 'du_thu', 'doanh_thu_ke_hoach', 'ke_hoach_thu'],
  budgetStatus: ['trang_thai_ngan_sach', 'trang_thai_budget', 'budget_status', 'trang_thai_chot_ngan_sach']
};

function qltdBudgetSyncApprovedTaskBudgets_(params) {
  const action = 'budget_syncApprovedTaskBudgets';
  const dryRun = String(params && params.dryRun || '').trim() !== '0';
  const prepared = qltdBudgetSyncBuildPlan_(params || {}, action, dryRun);
  if (prepared.error) return prepared.error;
  if (dryRun) return qltdBudgetSyncResponse_(true, 'PREVIEW', action, prepared.plan, prepared.warnings, prepared.errors, prepared.meta);

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_BUDGET_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdBudgetSyncResponse_(false, 'LOCK_TIMEOUT', action, null, prepared.warnings, [{
        code: 'WRITE_LOCK_TIMEOUT',
        message: 'Khong lay duoc lock dong bo ngan sach.'
      }], prepared.meta);
    }

    const lockedPlan = qltdBudgetSyncBuildPlan_(params || {}, action, false);
    if (lockedPlan.error) return lockedPlan.error;
    qltdBudgetSyncExecutePlan_(lockedPlan.plan);
    return qltdBudgetSyncResponse_(
      lockedPlan.errors.length ? true : true,
      lockedPlan.errors.length || lockedPlan.plan.conflicts.length ? 'PARTIAL_SUCCESS' : 'OK',
      action,
      Object.assign({}, lockedPlan.plan, { executed: true }),
      lockedPlan.warnings,
      lockedPlan.errors,
      lockedPlan.meta
    );
  } catch (error) {
    return qltdBudgetSyncResponse_(false, 'WRITE_ERROR', action, null, prepared.warnings, [{
      code: error && error.code || 'BUDGET_SYNC_WRITE_ERROR',
      message: qltdBudgetSafeErrorMessage_(error),
      details: error && error.details || undefined
    }], prepared.meta);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdBudgetSyncBuildPlan_(params, action, dryRun) {
  const email = qltdDevApiNormalizeEmail_(params && params.email);
  const projectCode = qltdBudgetNormalizeCode_(params && params.projectCode);
  const meta = { action: action, email: email || 'anonymous', projectCode: projectCode, dryRun: !!dryRun };
  if (!email) return { error: qltdBudgetSyncResponse_(false, 'VALIDATION_ERROR', action, null, [], [{ code: 'EMAIL_REQUIRED', message: 'email la bat buoc.' }], meta) };
  const user = qltdUsersGetByEmail_(email);
  if (!user || user.status !== 'ACTIVE') {
    return { error: qltdBudgetSyncResponse_(false, 'ACCESS_DENIED', action, null, [], [{ code: 'ACCESS_DENIED', message: 'Chi user ACTIVE duoc dong bo ngan sach.' }], meta) };
  }
  if (!projectCode) return { error: qltdBudgetSyncResponse_(false, 'VALIDATION_ERROR', action, null, [], [{ code: 'PROJECT_CODE_REQUIRED', message: 'Thieu projectCode.' }], meta) };

  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) return { error: projectsResult.error };
  const project = qltdBudgetFindProjectByCode_(projectsResult.projects, projectCode);
  if (!project || project.status !== 'ACTIVE') {
    return { error: qltdBudgetSyncResponse_(false, 'PROJECT_NOT_FOUND', action, null, projectsResult.warnings || [], [{ code: 'PROJECT_NOT_FOUND', message: 'Khong tim thay du an ACTIVE.' }], meta) };
  }
  if (!project.masterSpreadsheetId) {
    return { error: qltdBudgetSyncResponse_(false, 'PROJECT_MASTER_MISSING', action, null, projectsResult.warnings || [], [{ code: 'MASTER_SPREADSHEET_ID_MISSING', message: 'Du an chua co MasterSpreadsheetId.' }], meta) };
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) return { error: deptsResult.error };
  const departments = (deptsResult.departments || []).filter(function(dept) {
    return dept.projectCode === projectCode && dept.status === 'ACTIVE';
  });

  const source = qltdBudgetSyncReadCongViec_(project, action, meta);
  if (source.error) return { error: source.error };

  const itemsRead = qltdBudgetSyncReadCentralSheetForWrite_(QLTD_BUDGET_SHEET.CENTRAL_ITEMS, QLTD_BUDGET_ITEMS_HEADERS, action, meta);
  if (itemsRead.error) return { error: itemsRead.error };
  const allocationsRead = qltdBudgetSyncReadCentralSheetForWrite_(QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS, QLTD_BUDGET_ALLOCATIONS_HEADERS, action, meta);
  if (allocationsRead.error) return { error: allocationsRead.error };

  const parsedSource = qltdBudgetSyncParseSourceRows_(source, project, departments);
  const plan = qltdBudgetSyncBuildWritePlan_({
    project: project,
    source: source,
    approvedEntries: parsedSource.approvedEntries,
    departments: departments,
    itemsRead: itemsRead,
    allocationsRead: allocationsRead,
    rowErrors: parsedSource.errors
  });

  const warnings = (projectsResult.warnings || [])
    .concat(deptsResult.warnings || [])
    .concat(itemsRead.warnings || [])
    .concat(allocationsRead.warnings || []);
  return { plan: plan, warnings: warnings, errors: plan.errors || [], meta: meta, error: null };
}

function qltdBudgetSyncReadCongViec_(project, action, meta) {
  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(project.masterSpreadsheetId);
  } catch (error) {
    return { error: qltdBudgetSyncResponse_(false, 'SOURCE_OPEN_FAILED', action, null, [], [{ code: 'MASTER_SPREADSHEET_OPEN_FAILED', message: error.message || String(error) }], meta) };
  }

  const sheetName = String(project.defaultTaskSheet || 'Cong_viec').trim() || 'Cong_viec';
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.getSheetByName('Cong_viec');
  if (!sheet) {
    return { error: qltdBudgetSyncResponse_(false, 'SOURCE_SHEET_NOT_FOUND', action, null, [], [{ code: 'CONG_VIEC_SHEET_NOT_FOUND', message: 'Khong tim thay sheet Cong_viec.' }], meta) };
  }

  const values = sheet.getDataRange().getValues();
  const detected = qltdBudgetSyncDetectHeader_(values || []);
  if (!detected) {
    return { error: qltdBudgetSyncResponse_(false, 'SOURCE_HEADER_NOT_FOUND', action, null, [], [{ code: 'CONG_VIEC_HEADER_NOT_FOUND', message: 'Khong detect duoc header Cong_viec.' }], meta) };
  }
  const missing = qltdBudgetSyncRequiredGroups_().filter(function(group) {
    return qltdBudgetSyncFindAliasIndex_(detected.headerIndex, group) < 0;
  });
  if (missing.length) {
    const missingLabels = missing.map(qltdBudgetSyncHeaderGroupLabel_);
    return { error: qltdBudgetSyncResponse_(false, 'SOURCE_HEADER_MISSING', action, null, [], [{
      code: 'CONG_VIEC_REQUIRED_HEADER_MISSING',
      message: 'Cong_viec thieu header bat buoc: ' + missingLabels.join(', '),
      missingHeaders: missingLabels,
      missingHeaderGroups: missing,
      detectedHeaders: values[detected.rowIndex].map(function(value) { return String(value || '').trim(); }),
      headerRowNumber: detected.rowIndex + 1,
      spreadsheetId: spreadsheet.getId(),
      sheetName: sheet.getName()
    }], meta) };
  }

  return {
    spreadsheetId: spreadsheet.getId(),
    sheet: sheet,
    sheetName: sheet.getName(),
    values: values,
    headerRowNumber: detected.rowIndex + 1,
    headers: values[detected.rowIndex].map(function(value) { return String(value || '').trim(); }),
    headerIndex: detected.headerIndex,
    error: null
  };
}

function qltdBudgetSyncDetectHeader_(values) {
  const maxRows = Math.min(values.length, QLTD_BUDGET_SYNC_HEADER_SCAN_ROWS);
  let best = null;
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const headerIndex = qltdBudgetBuildHeaderMap_(values[rowIndex] || []);
    const score = qltdBudgetSyncRequiredGroups_().reduce(function(total, group) {
      return total + (qltdBudgetSyncFindAliasIndex_(headerIndex, group) >= 0 ? 1 : 0);
    }, 0);
    if (!best || score > best.score) best = { rowIndex: rowIndex, headerIndex: headerIndex, score: score };
  }
  return best && best.score >= 4 ? best : null;
}

function qltdBudgetSyncRequiredGroups_() {
  return ['masterTaskCode', 'wbs', 'taskName', 'dept', 'directChiPlan', 'plannedRevenue', 'budgetStatus'];
}

function qltdBudgetSyncHeaderGroupLabel_(group) {
  const labels = {
    masterTaskCode: 'Ma cong viec',
    wbs: 'WBS',
    taskName: 'Cong viec / Pham vi',
    dept: 'Chu tri',
    directChiPlan: 'Tran chi phi truc tiep',
    plannedRevenue: 'Du thu ke hoach',
    budgetStatus: 'Trang thai ngan sach'
  };
  return labels[group] || group;
}

function qltdBudgetSyncFindAliasIndex_(headerIndex, group) {
  const aliases = QLTD_BUDGET_SYNC_HEADER_ALIASES[group] || [];
  for (let index = 0; index < aliases.length; index += 1) {
    const key = qltdBudgetNormalizeKey_(aliases[index]);
    if (Object.prototype.hasOwnProperty.call(headerIndex, key)) return headerIndex[key];
  }
  return -1;
}

function qltdBudgetSyncCell_(row, headerIndex, group) {
  const index = qltdBudgetSyncFindAliasIndex_(headerIndex, group);
  return index >= 0 ? row[index] : '';
}

function qltdBudgetSyncParseSourceRows_(source, project, departments) {
  const approvedEntries = [];
  const errors = [];
  const startRow = source.headerRowNumber;
  for (let rowIndex = startRow; rowIndex < (source.values || []).length; rowIndex += 1) {
    const row = source.values[rowIndex];
    if (!row || !row.some(function(value) { return String(value || '').trim() !== ''; })) continue;
    const parsed = qltdBudgetSyncParseSourceRow_(row, rowIndex + 1, source.headerIndex, project, departments);
    Array.prototype.push.apply(errors, parsed.errors);
    Array.prototype.push.apply(approvedEntries, parsed.entries);
  }
  return { approvedEntries: approvedEntries, errors: errors };
}

function qltdBudgetSyncParseSourceRow_(row, rowNumber, headerIndex, project, departments) {
  const masterTaskCode = qltdBudgetNormalizeCode_(qltdBudgetSyncCell_(row, headerIndex, 'masterTaskCode'));
  const wbs = String(qltdBudgetSyncCell_(row, headerIndex, 'wbs') || '').trim();
  const taskName = String(qltdBudgetSyncCell_(row, headerIndex, 'taskName') || '').trim();
  const deptRaw = String(qltdBudgetSyncCell_(row, headerIndex, 'dept') || '').trim();
  const budgetStatus = String(qltdBudgetSyncCell_(row, headerIndex, 'budgetStatus') || '').trim();
  const directChi = qltdBudgetSyncParseAmount_(qltdBudgetSyncCell_(row, headerIndex, 'directChiPlan'));
  const plannedRevenue = qltdBudgetSyncParseAmount_(qltdBudgetSyncCell_(row, headerIndex, 'plannedRevenue'));
  const errors = [];
  const entries = [];

  if (!masterTaskCode) {
    if (qltdBudgetSyncStatusIsConfirmed_(budgetStatus) || directChi.hasValue || plannedRevenue.hasValue) {
      errors.push(qltdBudgetSyncRowError_(rowNumber, masterTaskCode, wbs, taskName, deptRaw, '', 0, 'MASTER_TASK_CODE_MISSING', 'Dong Cong_viec thieu Ma cong viec.'));
    }
    return { entries: entries, errors: errors };
  }

  if (directChi.error) errors.push(qltdBudgetSyncRowError_(rowNumber, masterTaskCode, wbs, taskName, deptRaw, 'CHI', directChi.raw, directChi.error, 'Tran chi phi truc tiep khong hop le.'));
  if (plannedRevenue.error) errors.push(qltdBudgetSyncRowError_(rowNumber, masterTaskCode, wbs, taskName, deptRaw, 'THU', plannedRevenue.raw, plannedRevenue.error, 'Du thu ke hoach khong hop le.'));
  if (directChi.error || plannedRevenue.error) return { entries: entries, errors: errors };
  if (!qltdBudgetSyncStatusIsConfirmed_(budgetStatus)) return { entries: entries, errors: errors };

  if (!(directChi.value > 0) && !(plannedRevenue.value > 0)) return { entries: entries, errors: errors };

  const dept = qltdBudgetSyncResolveDept_(project.projectCode, deptRaw, departments);
  if (!dept) {
    errors.push(qltdBudgetSyncRowError_(rowNumber, masterTaskCode, wbs, taskName, deptRaw, '', directChi.value || plannedRevenue.value || 0, 'DEPT_NOT_RESOLVED', 'Khong resolve duoc phong/ban.'));
    return { entries: entries, errors: errors };
  }

  if (directChi.value > 0) entries.push(qltdBudgetSyncBuildSourceEntry_(project, dept, rowNumber, masterTaskCode, wbs, taskName, 'CHI', directChi.value));
  if (plannedRevenue.value > 0) entries.push(qltdBudgetSyncBuildSourceEntry_(project, dept, rowNumber, masterTaskCode, wbs, taskName, 'THU', plannedRevenue.value));
  return { entries: entries, errors: errors };
}

function qltdBudgetSyncStatusIsConfirmed_(value) {
  const normalized = qltdBudgetNormalizeKey_(value);
  return normalized === 'dachot' || normalized === 'confirmed' || normalized === 'xacnhan' || normalized === 'daxacnhan';
}

function qltdBudgetSyncParseAmount_(value) {
  const raw = value;
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) return { raw: raw, value: 0, hasValue: false, error: '' };
  let normalized = text.replace(/\s/g, '');
  if (/^\d{1,3}([,.]\d{3})+$/.test(normalized)) normalized = normalized.replace(/[,.]/g, '');
  else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(normalized)) normalized = normalized.replace(/\./g, '').replace(',', '.');
  else normalized = normalized.replace(/,/g, '');
  const number = Number(normalized);
  if (isNaN(number)) return { raw: raw, value: 0, hasValue: true, error: 'AMOUNT_INVALID' };
  if (number < 0) return { raw: raw, value: number, hasValue: true, error: 'AMOUNT_NEGATIVE' };
  return { raw: raw, value: number, hasValue: true, error: '' };
}

function qltdBudgetSyncResolveDept_(projectCode, deptRaw, departments) {
  const project = qltdBudgetNormalizeCode_(projectCode);
  const rawCode = qltdBudgetNormalizeCode_(deptRaw);
  const rawKey = qltdBudgetNormalizeKey_(deptRaw);
  return (departments || []).filter(function(dept) {
    if (dept.projectCode !== project || dept.status !== 'ACTIVE') return false;
    return qltdBudgetNormalizeCode_(dept.deptCode) === rawCode ||
      qltdBudgetNormalizeCode_(dept.projectUnitCode) === rawCode ||
      qltdBudgetNormalizeKey_(dept.deptName) === rawKey;
  })[0] || null;
}

function qltdBudgetSyncBuildSourceEntry_(project, dept, rowNumber, masterTaskCode, wbs, taskName, flowType, amount) {
  return {
    key: qltdBudgetSyncBusinessKey_(project.projectCode, dept.deptCode, masterTaskCode, flowType),
    projectCode: project.projectCode,
    projectName: project.projectName || '',
    deptCode: qltdBudgetNormalizeCode_(dept.deptCode),
    deptName: dept.deptName || dept.deptCode || '',
    masterTaskCode: qltdBudgetNormalizeCode_(masterTaskCode),
    wbs: wbs || '',
    taskName: taskName || masterTaskCode,
    flowType: flowType,
    amount: Number(amount || 0),
    rowNumber: rowNumber
  };
}

function qltdBudgetSyncReadCentralSheetForWrite_(sheetName, requiredHeaders, action, meta) {
  const sheet = qltdBudgetGetReadonlySheet_(sheetName);
  if (!sheet) {
    return { error: qltdBudgetSyncResponse_(false, 'SHEET_NOT_FOUND', action, null, [], [{ code: 'SHEET_NOT_FOUND', message: 'Khong tim thay sheet: ' + sheetName }], meta) };
  }
  const schema = qltdBudgetGetSheetSchema_(sheetName);
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, schema.headerRow);
  const missing = qltdBudgetFindMissingHeaders_(parsed.headerMap, requiredHeaders);
  if (missing.length) {
    return { error: qltdBudgetSyncResponse_(false, 'HEADER_MISSING', action, null, [], [{ code: 'CENTRAL_HEADER_MISSING', message: sheetName + ' thieu header.', missingHeaders: missing }], meta) };
  }
  return { sheet: sheet, schema: schema, parsed: parsed, warnings: [], error: null };
}

function qltdBudgetSyncBuildWritePlan_(input) {
  const sourceByKey = {};
  const duplicateSourceKeys = {};
  (input.approvedEntries || []).forEach(function(entry) {
    if (sourceByKey[entry.key]) duplicateSourceKeys[entry.key] = true;
    else sourceByKey[entry.key] = entry;
  });

  const itemIndex = qltdBudgetSyncBuildItemIndex_(input.itemsRead.parsed.rows || [], input.itemsRead.parsed.headerMap, input.project.projectCode);
  const allocationIndex = qltdBudgetSyncBuildAllocationIndex_(input.allocationsRead.parsed.rows || [], input.allocationsRead.parsed.headerMap, input.project.projectCode);
  const plan = qltdBudgetSyncEmptyPlan_(input, Object.keys(sourceByKey).length);
  plan.errors = (input.rowErrors || []).slice();

  Object.keys(sourceByKey).forEach(function(key) {
    const entry = sourceByKey[key];
    if (duplicateSourceKeys[key]) {
      plan.conflicts.push({ key: key, sourceRows: (input.approvedEntries || []).filter(function(item) { return item.key === key; }).map(function(item) { return item.rowNumber; }), code: 'SOURCE_BUSINESS_KEY_DUPLICATE' });
      return;
    }
    qltdBudgetSyncPlanUpsertKey_(plan, entry, itemIndex.byKey[key] || [], allocationIndex.byKey[key] || []);
  });

  Object.keys(itemIndex.byKey).forEach(function(key) {
    const matches = itemIndex.byKey[key] || [];
    if (matches.length !== 1 || sourceByKey[key]) return;
    const item = matches[0].item;
    if (item.status === 'ACTIVE') qltdBudgetSyncPlanDeactivateItem_(plan, matches[0], key);
  });

  Object.keys(allocationIndex.byKey).forEach(function(key) {
    const matches = allocationIndex.byKey[key] || [];
    if (matches.length !== 1 || sourceByKey[key]) return;
    const allocation = matches[0].allocation;
    if (allocation.status !== 'CANCELLED') qltdBudgetSyncPlanDeactivateAllocation_(plan, matches[0], key);
  });

  qltdBudgetSyncFinalizeSummary_(plan);
  return plan;
}

function qltdBudgetSyncEmptyPlan_(input, approvedRows) {
  return {
    projectCode: input.project.projectCode,
    projectName: input.project.projectName || '',
    sourceSpreadsheetId: input.source.spreadsheetId,
    sourceSheet: input.source.sheetName,
    sourceHeaderRow: input.source.headerRowNumber,
    sourceHeadersUsed: qltdBudgetSyncHeaderNamesUsed_(input.source),
    rowsScanned: Math.max((input.source.values || []).length - input.source.headerRowNumber, 0),
    approvedRows: approvedRows,
    createItems: 0,
    updateItems: 0,
    deactivateItems: 0,
    createAllocations: 0,
    updateAllocations: 0,
    deactivateAllocations: 0,
    unchanged: 0,
    skipped: 0,
    conflicts: [],
    errors: [],
    operations: []
  };
}

function qltdBudgetSyncHeaderNamesUsed_(source) {
  const result = {};
  qltdBudgetSyncRequiredGroups_().forEach(function(group) {
    const index = qltdBudgetSyncFindAliasIndex_(source.headerIndex, group);
    result[group] = index >= 0 ? source.headers[index] : '';
  });
  return result;
}

function qltdBudgetSyncBuildItemIndex_(rows, headerMap, projectCode) {
  const byKey = {};
  (rows || []).forEach(function(rowObj) {
    const item = qltdBudgetSyncItemFromRow_(rowObj.raw, headerMap, rowObj.rowNumber);
    if (item.projectCode !== projectCode || item.budgetType !== QLTD_BUDGET_TYPE.TASK_LINKED) return;
    const key = qltdBudgetSyncBusinessKey_(item.projectCode, item.deptCode, item.masterTaskCode, item.flowType);
    if (!key) return;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push({ row: rowObj.raw, rowNumber: rowObj.rowNumber, item: item });
  });
  return { byKey: byKey };
}

function qltdBudgetSyncBuildAllocationIndex_(rows, headerMap, projectCode) {
  const byKey = {};
  (rows || []).forEach(function(rowObj) {
    const allocation = qltdBudgetAllocationRowToObject_(rowObj.raw, headerMap, rowObj.rowNumber);
    if (allocation.projectCode !== projectCode || allocation.sourceType !== 'TASK_DIRECT') return;
    const key = qltdBudgetSyncBusinessKey_(allocation.projectCode, allocation.deptCode, allocation.sourceCode, allocation.flowType);
    if (!key) return;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push({ row: rowObj.raw, rowNumber: rowObj.rowNumber, allocation: allocation });
  });
  return { byKey: byKey };
}

function qltdBudgetSyncItemFromRow_(row, headerMap, rowNumber) {
  return {
    rowNumber: rowNumber,
    budgetItemCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma khoan ngan sach', '') || '').trim(),
    projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, headerMap, 'Ma du an', '')),
    projectName: String(qltdBudgetGetCell_(row, headerMap, 'Ten du an', '') || '').trim(),
    deptCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, headerMap, 'Ma phong/ban', '')),
    deptName: String(qltdBudgetGetCell_(row, headerMap, 'Ten phong/ban', '') || '').trim(),
    budgetItemName: String(qltdBudgetGetCell_(row, headerMap, 'Ten khoan ngan sach', '') || '').trim(),
    budgetType: qltdBudgetNormalizeBudgetType_(qltdBudgetGetCell_(row, headerMap, 'Loai ngan sach', '')).value || '',
    masterTaskCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, headerMap, 'Ma cong viec Master', '')),
    approvedBudget: qltdBudgetToNumber_(qltdBudgetGetCell_(row, headerMap, 'Ngan sach duoc duyet', 0)),
    status: qltdBudgetNormalizeStatus_(qltdBudgetGetCell_(row, headerMap, 'Trang thai', 'ACTIVE')),
    note: String(qltdBudgetGetCell_(row, headerMap, 'Ghi chu', '') || '').trim(),
    allocationCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma phan bo', '') || '').trim(),
    flowType: qltdBudgetNormalizeFlowType_(qltdBudgetGetCell_(row, headerMap, 'Huong dong tien', '')).value || ''
  };
}

function qltdBudgetSyncPlanUpsertKey_(plan, entry, itemMatches, allocationMatches) {
  if (itemMatches.length > 1 || allocationMatches.length > 1) {
    plan.conflicts.push({
      key: entry.key,
      code: 'CENTRAL_BUSINESS_KEY_DUPLICATE',
      budgetItemCodes: itemMatches.map(function(match) { return match.item.budgetItemCode; }),
      allocationCodes: allocationMatches.map(function(match) { return match.allocation.allocationCode; }),
      itemRows: itemMatches.map(function(match) { return match.rowNumber; }),
      allocationRows: allocationMatches.map(function(match) { return match.rowNumber; })
    });
    return;
  }

  const allocationCode = allocationMatches[0] ? allocationMatches[0].allocation.allocationCode : qltdBudgetSyncStableCode_('ALLOC', entry);
  const itemCode = itemMatches[0] ? itemMatches[0].item.budgetItemCode : qltdBudgetSyncStableCode_('NSI', entry);
  const nextItem = qltdBudgetSyncItemObject_(entry, itemCode, allocationCode, 'ACTIVE');
  const nextAllocation = qltdBudgetSyncAllocationObject_(entry, allocationCode, 'CONFIRMED');
  const itemChanged = !itemMatches[0] || !qltdBudgetSyncItemEqual_(itemMatches[0].item, nextItem);
  const allocationChanged = !allocationMatches[0] || !qltdBudgetSyncAllocationEqual_(allocationMatches[0].allocation, nextAllocation);

  if (!itemMatches[0]) plan.createItems += 1;
  else if (itemChanged) plan.updateItems += 1;
  if (!allocationMatches[0]) plan.createAllocations += 1;
  else if (allocationChanged) plan.updateAllocations += 1;
  if (itemMatches[0] && allocationMatches[0] && !itemChanged && !allocationChanged) plan.unchanged += 1;

  plan.operations.push({
    type: 'UPSERT',
    key: entry.key,
    entry: entry,
    itemRowNumber: itemMatches[0] ? itemMatches[0].rowNumber : 0,
    allocationRowNumber: allocationMatches[0] ? allocationMatches[0].rowNumber : 0,
    item: nextItem,
    allocation: nextAllocation,
    itemChanged: itemChanged,
    allocationChanged: allocationChanged
  });
}

function qltdBudgetSyncPlanDeactivateItem_(plan, match, key) {
  const item = Object.assign({}, match.item, { status: 'INACTIVE' });
  plan.deactivateItems += 1;
  plan.operations.push({ type: 'DEACTIVATE_ITEM', key: key, itemRowNumber: match.rowNumber, item: qltdBudgetSyncItemObjectFromExisting_(item) });
}

function qltdBudgetSyncPlanDeactivateAllocation_(plan, match, key) {
  const allocation = Object.assign({}, match.allocation, { status: 'CANCELLED' });
  plan.deactivateAllocations += 1;
  plan.operations.push({ type: 'DEACTIVATE_ALLOCATION', key: key, allocationRowNumber: match.rowNumber, allocation: qltdBudgetSyncAllocationObjectFromExisting_(allocation) });
}

function qltdBudgetSyncBusinessKey_(projectCode, deptCode, masterTaskCode, flowType) {
  const project = qltdBudgetNormalizeCode_(projectCode);
  const dept = qltdBudgetNormalizeCode_(deptCode);
  const master = qltdBudgetNormalizeCode_(masterTaskCode);
  const flow = qltdBudgetNormalizeCode_(flowType);
  if (!project || !dept || !master || !flow) return '';
  return [project, dept, master, flow, QLTD_BUDGET_TYPE.TASK_LINKED].join('|');
}

function qltdBudgetSyncStableCode_(prefix, entry) {
  const safe = [entry.projectCode, entry.deptCode, entry.masterTaskCode, entry.flowType]
    .map(function(part) { return qltdBudgetNormalizeCode_(part).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, ''); })
    .join('-')
    .replace(/-+/g, '-');
  return (prefix + '-' + safe).slice(0, 80);
}

function qltdBudgetSyncItemObject_(entry, itemCode, allocationCode, status) {
  return {
    'Ma khoan ngan sach': itemCode,
    'Ma du an': entry.projectCode,
    'Ten du an': entry.projectName || entry.projectCode,
    'Ma phong/ban': entry.deptCode,
    'Ten phong/ban': entry.deptName || entry.deptCode,
    'Ten khoan ngan sach': (entry.taskName || entry.masterTaskCode) + ' - ' + entry.flowType,
    'Loai ngan sach': QLTD_BUDGET_TYPE.TASK_LINKED,
    'Ma cong viec Master': entry.masterTaskCode,
    'Nhom ngan sach': '',
    'Giai doan ngan sach': '',
    'Ngan sach duoc duyet': entry.amount,
    'Trang thai': status,
    'Ghi chu': QLTD_BUDGET_SYNC_SOURCE + '; sourceRow=' + entry.rowNumber,
    'Ma phan bo': allocationCode,
    'Ma cong viec chi tiet PB': '',
    'Huong dong tien': entry.flowType
  };
}

function qltdBudgetSyncAllocationObject_(entry, allocationCode, status) {
  return {
    'Ma phan bo': allocationCode,
    'Ma du an': entry.projectCode,
    'Loai nguon ngan sach': 'TASK_DIRECT',
    'Ma nguon ngan sach': entry.masterTaskCode,
    'Ma phong/ban': entry.deptCode,
    'Ten phong/ban': entry.deptName || entry.deptCode,
    'Huong dong tien': entry.flowType,
    'Gia tri giao': entry.amount,
    'Trang thai': qltdBudgetGetAllocationStatusSheetLabel_(status),
    'Ghi chu': QLTD_BUDGET_SYNC_SOURCE + '; sourceRow=' + entry.rowNumber
  };
}

function qltdBudgetSyncItemObjectFromExisting_(item) {
  return {
    'Ma khoan ngan sach': item.budgetItemCode,
    'Ma du an': item.projectCode,
    'Ten du an': item.projectName,
    'Ma phong/ban': item.deptCode,
    'Ten phong/ban': item.deptName,
    'Ten khoan ngan sach': item.budgetItemName,
    'Loai ngan sach': QLTD_BUDGET_TYPE.TASK_LINKED,
    'Ma cong viec Master': item.masterTaskCode,
    'Ngan sach duoc duyet': item.approvedBudget,
    'Trang thai': item.status,
    'Ghi chu': item.note || QLTD_BUDGET_SYNC_SOURCE,
    'Ma phan bo': item.allocationCode,
    'Huong dong tien': item.flowType
  };
}

function qltdBudgetSyncAllocationObjectFromExisting_(allocation) {
  return {
    'Ma phan bo': allocation.allocationCode,
    'Ma du an': allocation.projectCode,
    'Loai nguon ngan sach': allocation.sourceType,
    'Ma nguon ngan sach': allocation.sourceCode,
    'Ma phong/ban': allocation.deptCode,
    'Ten phong/ban': allocation.deptName,
    'Huong dong tien': allocation.flowType,
    'Gia tri giao': allocation.allocatedAmount,
    'Trang thai': qltdBudgetGetAllocationStatusSheetLabel_(allocation.status),
    'Ghi chu': allocation.note || QLTD_BUDGET_SYNC_SOURCE
  };
}

function qltdBudgetSyncItemEqual_(current, nextObject) {
  return current.approvedBudget === Number(nextObject['Ngan sach duoc duyet'] || 0) &&
    current.status === String(nextObject['Trang thai'] || '').trim().toUpperCase() &&
    qltdBudgetNormalizeCode_(current.allocationCode) === qltdBudgetNormalizeCode_(nextObject['Ma phan bo']) &&
    current.flowType === nextObject['Huong dong tien'];
}

function qltdBudgetSyncAllocationEqual_(current, nextObject) {
  return current.allocatedAmount === Number(nextObject['Gia tri giao'] || 0) &&
    current.status === 'CONFIRMED' &&
    current.flowType === nextObject['Huong dong tien'];
}

function qltdBudgetSyncFinalizeSummary_(plan) {
  plan.skipped = (plan.errors || []).length + (plan.conflicts || []).length;
  delete plan.operationsForResponse;
}

function qltdBudgetSyncExecutePlan_(plan) {
  const itemsRead = qltdBudgetSyncReadCentralSheetForWrite_(QLTD_BUDGET_SHEET.CENTRAL_ITEMS, QLTD_BUDGET_ITEMS_HEADERS, 'budget_syncApprovedTaskBudgets', {});
  const allocationsRead = qltdBudgetSyncReadCentralSheetForWrite_(QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS, QLTD_BUDGET_ALLOCATIONS_HEADERS, 'budget_syncApprovedTaskBudgets', {});
  if (itemsRead.error) throw new Error('Cannot read CENTRAL_NS_Items for write.');
  if (allocationsRead.error) throw new Error('Cannot read CENTRAL_NS_Allocations for write.');
  qltdBudgetSyncApplySheetOperations_(itemsRead.sheet, itemsRead.parsed.headers, itemsRead.schema.headerRow, plan.operations, 'item');
  qltdBudgetSyncApplySheetOperations_(allocationsRead.sheet, allocationsRead.parsed.headers, allocationsRead.schema.headerRow, plan.operations, 'allocation');
}

function qltdBudgetSyncApplySheetOperations_(sheet, headers, headerRow, operations, target) {
  const rowsToWrite = [];
  (operations || []).forEach(function(operation) {
    const rowNumber = target === 'item' ? operation.itemRowNumber : operation.allocationRowNumber;
    const object = target === 'item' ? operation.item : operation.allocation;
    if (!object) return;
    if (operation.type === 'UPSERT' && target === 'item' && !operation.itemChanged) return;
    if (operation.type === 'UPSERT' && target === 'allocation' && !operation.allocationChanged) return;
    rowsToWrite.push({ rowNumber: rowNumber || 0, values: qltdBudgetMapObjectToHeaderRow_(object, headers) });
  });
  const appendRows = rowsToWrite.filter(function(row) { return !row.rowNumber; });
  rowsToWrite.filter(function(row) { return row.rowNumber; }).forEach(function(row) {
    sheet.getRange(row.rowNumber, 1, 1, row.values.length).setValues([row.values]);
  });
  if (appendRows.length) {
    const startRow = Math.max(sheet.getLastRow() + 1, Number(headerRow || 1) + 1);
    sheet.getRange(startRow, 1, appendRows.length, headers.length).setValues(appendRows.map(function(row) { return row.values; }));
  }
}

function qltdBudgetSyncRowError_(rowNumber, masterTaskCode, wbs, taskName, deptRaw, flowType, amount, code, message) {
  return {
    rowNumber: rowNumber,
    masterTaskCode: masterTaskCode || '',
    wbs: wbs || '',
    taskName: taskName || '',
    deptRaw: deptRaw || '',
    flowType: flowType || '',
    amount: amount || 0,
    errorCode: code,
    message: message || code
  };
}

function qltdBudgetSyncResponse_(success, status, action, data, warnings, errors, meta) {
  return {
    success: !!success,
    status: status || (success ? 'OK' : 'ERROR'),
    action: action,
    data: data || null,
    warnings: warnings || [],
    errors: errors || [],
    meta: meta || {}
  };
}
