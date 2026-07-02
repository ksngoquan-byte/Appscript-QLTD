function qltdBudgetGetBudgetItems_(params) {
  const action = 'budget_getBudgetItems';
  const projectCode = qltdBudgetNormalizeCode_(params && params.projectCode);
  const deptCode = String(params && params.deptCode || '').trim();
  const budgetTypeResult = qltdBudgetNormalizeBudgetItemsFilter_(params && params.budgetType);
  const meta = {
    action: action,
    projectCode: projectCode,
    deptCode: deptCode,
    budgetType: budgetTypeResult.value,
    email: qltdDevApiNormalizeEmail_(params && params.email) || 'anonymous'
  };

  if (budgetTypeResult.error) {
    return qltdBudgetItemsResponse_(false, action, null, [], [budgetTypeResult.error], meta);
  }

  const itemsResult = qltdBudgetReadBudgetItems_();
  const items = itemsResult.items.filter(function(item) {
    if (projectCode && item.projectCode !== projectCode) return false;
    if (deptCode && qltdBudgetNormalizeCode_(item.deptCode) !== qltdBudgetNormalizeCode_(deptCode)) return false;
    if (budgetTypeResult.value !== 'ALL' && item.budgetType !== budgetTypeResult.value) return false;
    return item.status === 'ACTIVE';
  });

  return qltdBudgetItemsResponse_(true, action, {
    projectCode: projectCode,
    deptCode: deptCode,
    budgetType: budgetTypeResult.value,
    taskBudgetItems: items.filter(function(item) {
      return item.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED;
    }),
    standaloneBudgetItems: items.filter(function(item) {
      return item.budgetType === QLTD_BUDGET_TYPE.DEPT_STANDALONE;
    })
  }, itemsResult.warnings, [], meta);
}

function qltdBudgetCheckTwoLayerSchema_(params) {
  const action = 'budget_checkTwoLayerSchema';
  const meta = {
    action: action,
    email: qltdDevApiNormalizeEmail_(params && params.email) || 'anonymous'
  };
  const result = qltdBudgetInspectTwoLayerSchema_();

  return qltdBudgetSchemaResponse_(true, action, {
    itemsSheet: result.itemsSheet,
    centralRaw: result.centralRaw,
    centralSummary: result.centralSummary,
    centralDashboard: result.centralDashboard,
    centralAllocations: result.centralAllocations,
    syncLog: result.syncLog,
    sheets: result.sheets,
    canApplySetup: result.canApplySetup,
    dryRunOnly: true
  }, result.warnings, [], meta);
}

function qltdBudgetSetupTwoLayerSchemaDryRun_(params) {
  const action = 'budget_setupTwoLayerSchemaDryRun';
  const meta = {
    action: action,
    email: qltdDevApiNormalizeEmail_(params && params.email) || 'anonymous'
  };
  const result = qltdBudgetInspectTwoLayerSchema_();

  return qltdBudgetSchemaResponse_(true, action, {
    dryRun: true,
    plannedActions: qltdBudgetBuildTwoLayerSchemaPlan_(result),
    itemsSheet: result.itemsSheet,
    centralRaw: result.centralRaw,
    centralSummary: result.centralSummary,
    centralDashboard: result.centralDashboard,
    centralAllocations: result.centralAllocations,
    syncLog: result.syncLog,
    sheets: result.sheets
  }, result.warnings, [], meta);
}

function qltdBudgetInspectTwoLayerSchema_() {
  const warnings = [];
  const itemsInfo = qltdBudgetInspectSheetHeaders_(QLTD_BUDGET_SHEET.CENTRAL_ITEMS, warnings);
  const rawInfo = qltdBudgetInspectSheetHeaders_(QLTD_BUDGET_SHEET.CENTRAL_RAW, warnings);
  const summaryInfo = qltdBudgetInspectSheetHeaders_(QLTD_BUDGET_SHEET.CENTRAL_SUMMARY, warnings);
  const dashboardInfo = qltdBudgetInspectSheetHeaders_(QLTD_BUDGET_SHEET.CENTRAL_DASHBOARD, warnings);
  const allocationsInfo = qltdBudgetInspectSheetHeaders_(QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS, warnings);
  const syncLogInfo = qltdBudgetInspectSheetHeaders_(QLTD_BUDGET_SHEET.SYS_SYNC_LOG, warnings);
  const sheets = [itemsInfo, rawInfo, summaryInfo, dashboardInfo, allocationsInfo, syncLogInfo];

  return {
    itemsSheet: itemsInfo,
    centralRaw: rawInfo,
    centralSummary: summaryInfo,
    centralDashboard: dashboardInfo,
    centralAllocations: allocationsInfo,
    syncLog: syncLogInfo,
    sheets: sheets,
    canApplySetup: sheets.every(function(info) {
      return !info.blocked;
    }),
    warnings: warnings
  };
}

function qltdBudgetInspectSheetHeaders_(sheetName, warnings) {
  const schema = qltdBudgetGetSheetSchema_(sheetName);
  const sheet = qltdBudgetGetReadonlySheet_(sheetName);
  const requiredHeaders = schema.requiredHeaders || [];
  if (!sheet) {
    warnings.push(qltdBudgetWarning_('SHEET_NOT_FOUND', 'Khong tim thay sheet: ' + sheetName, {
      sheetName: sheetName
    }));
    return {
      sheetName: sheetName,
      exists: false,
      titleRow: 1,
      descriptionRow: 2,
      blankRow: 3,
      headerRow: schema.headerRow,
      headersOk: false,
      title: schema.title,
      description: schema.description,
      existingHeaders: [],
      requiredHeaders: requiredHeaders.slice(),
      missingHeaders: requiredHeaders.slice(),
      appendOnly: true,
      blocked: false
    };
  }

  const parsed = qltdBudgetReadSheetAsObjects_(sheet, schema.headerRow);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, requiredHeaders);

  return {
    sheetName: sheetName,
    exists: true,
    titleRow: 1,
    descriptionRow: 2,
    blankRow: 3,
    headerRow: schema.headerRow,
    headersOk: missingHeaders.length === 0,
    title: schema.title,
    description: schema.description,
    existingHeaders: parsed.headers,
    requiredHeaders: requiredHeaders.slice(),
    missingHeaders: missingHeaders,
    appendOnly: true,
    blocked: false
  };
}

function qltdBudgetBuildTwoLayerSchemaPlan_(inspection) {
  const actions = [];
  const sheetInfos = inspection.sheets || [
    inspection.itemsSheet,
    inspection.centralRaw,
    inspection.centralSummary,
    inspection.centralDashboard,
    inspection.syncLog
  ];

  sheetInfos.forEach(function(info) {
    if (!info.exists && info.sheetName === QLTD_BUDGET_SHEET.CENTRAL_ITEMS) {
      actions.push({
        type: 'CREATE_SHEET',
        sheetName: info.sheetName,
        titleRow: info.titleRow,
        descriptionRow: info.descriptionRow,
        blankRow: info.blankRow,
        headerRow: info.headerRow,
        title: info.title,
        description: info.description,
        headers: info.requiredHeaders,
        appendOnly: true,
        dryRunOnly: true
      });
      return;
    }

    if (!info.exists) {
      actions.push({
        type: 'MISSING_REQUIRED_SHEET',
        sheetName: info.sheetName,
        headerRow: info.headerRow,
        appendOnly: true,
        dryRunOnly: true
      });
      return;
    }

    if (info.missingHeaders.length) {
      actions.push({
        type: 'APPEND_HEADERS',
        sheetName: info.sheetName,
        headerRow: info.headerRow,
        headers: info.missingHeaders,
        appendOnly: true,
        dryRunOnly: true
      });
    }
  });

  if (!actions.length) {
    actions.push({
      type: 'NO_OP',
      message: 'Two-layer budget schema already looks ready.',
      dryRunOnly: true
    });
  }
  return actions;
}

function qltdBudgetReadBudgetItems_() {
  const warnings = [];
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_ITEMS);
  if (!sheet) {
    warnings.push(qltdBudgetWarning_('ITEMS_SHEET_NOT_FOUND', 'Chua co sheet CENTRAL_NS_Items.', {
      sheetName: QLTD_BUDGET_SHEET.CENTRAL_ITEMS
    }));
    return {
      items: [],
      warnings: warnings
    };
  }

  const schema = qltdBudgetGetSheetSchema_(QLTD_BUDGET_SHEET.CENTRAL_ITEMS);
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, schema.headerRow);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_BUDGET_ITEMS_HEADERS);
  if (missingHeaders.length) {
    warnings.push(qltdBudgetWarning_('ITEMS_HEADER_MISSING', 'Sheet CENTRAL_NS_Items thieu header.', {
      missingHeaders: missingHeaders
    }));
  }

  const items = parsed.rows.map(function(item) {
    const row = item.raw;
    const budgetType = qltdBudgetNormalizeBudgetType_(qltdBudgetGetCell_(row, parsed.headerMap, 'Loai ngan sach', '')).value || '';
    const approvedBudgetRaw = qltdBudgetGetCell_(row, parsed.headerMap, 'Ngan sach duoc duyet', '');
    return {
      budgetItemCode: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma khoan ngan sach', '') || '').trim(),
      projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma du an', '')),
      projectName: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ten du an', '') || '').trim(),
      deptCode: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma phong/ban', '') || '').trim(),
      deptName: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ten phong/ban', '') || '').trim(),
      budgetItemName: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ten khoan ngan sach', '') || '').trim(),
      budgetType: budgetType,
      masterTaskCode: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma cong viec Master', '') || '').trim(),
      budgetGroup: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Nhom ngan sach', '') || '').trim(),
      budgetStage: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Giai doan ngan sach', '') || '').trim(),
      approvedBudget: qltdBudgetToNumber_(approvedBudgetRaw),
      hasApprovedBudget: String(approvedBudgetRaw === null || approvedBudgetRaw === undefined ? '' : approvedBudgetRaw).replace(/[,\s]/g, '').trim() !== '' &&
        !isNaN(Number(String(approvedBudgetRaw).replace(/[,\s]/g, ''))),
      status: qltdBudgetNormalizeStatus_(qltdBudgetGetCell_(row, parsed.headerMap, 'Trang thai', 'ACTIVE')),
      allocationCode: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma phan bo', '') || '').trim(),
      pbTaskCode: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma cong viec chi tiet PB', '') || '').trim(),
      flowType: qltdBudgetNormalizeFlowType_(qltdBudgetGetCell_(row, parsed.headerMap, 'Huong dong tien', '')).value || '',
      note: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ghi chu', '') || '').trim(),
      rowNumber: item.rowNumber
    };
  }).filter(function(item) {
    return !!item.budgetItemCode;
  });

  items.forEach(function(item) {
    if (item.status !== 'ACTIVE') return;
    const missing = [];
    if (!item.allocationCode) missing.push('allocationCode');
    if (!item.flowType) missing.push('flowType');
    if (missing.length) {
      warnings.push(qltdBudgetWarning_('BUDGET_ITEM_ALLOCATION_FIELDS_MISSING', 'Khoan ngan sach active thieu truong allocation/flow moi.', {
        rowNumber: item.rowNumber,
        budgetItemCode: item.budgetItemCode,
        missingFields: missing
      }));
    }
  });

  return {
    items: items,
    warnings: warnings
  };
}

function qltdBudgetFindBudgetItem_(items, projectCode, deptCode, budgetItemCode) {
  const code = qltdBudgetNormalizeCode_(budgetItemCode);
  const normalizedProjectCode = qltdBudgetNormalizeCode_(projectCode);
  const normalizedDeptCode = qltdBudgetNormalizeCode_(deptCode);

  for (let index = 0; index < (items || []).length; index += 1) {
    const item = items[index];
    if (
      qltdBudgetNormalizeCode_(item.budgetItemCode) === code &&
      (!item.projectCode || item.projectCode === normalizedProjectCode) &&
      (!item.deptCode || qltdBudgetNormalizeCode_(item.deptCode) === normalizedDeptCode)
    ) {
      return item;
    }
  }
  return null;
}

function qltdBudgetNormalizeBudgetItemsFilter_(value) {
  const raw = String(value || 'ALL').trim();
  if (qltdBudgetNormalizeKey_(raw) === 'all') {
    return {
      value: 'ALL',
      error: null
    };
  }

  const type = qltdBudgetNormalizeBudgetType_(raw);
  if (type.error) {
    return {
      value: '',
      error: type.error
    };
  }
  return {
    value: type.value,
    error: null
  };
}

function qltdBudgetItemsResponse_(success, action, data, warnings, errors, meta) {
  return {
    success: !!success,
    apiStatus: success ? 'OK' : 'VALIDATION_ERROR',
    source: QLTD_BUDGET_ITEMS_SOURCE,
    data: success ? (data || {}) : null,
    warnings: warnings || [],
    errors: errors || [],
    meta: Object.assign({
      action: action || '',
      generatedAt: qltdBudgetNowIso_()
    }, meta || {})
  };
}

function qltdBudgetSchemaResponse_(success, action, data, warnings, errors, meta) {
  return {
    success: !!success,
    apiStatus: success ? 'OK' : 'ERROR',
    source: QLTD_BUDGET_SCHEMA_SOURCE,
    data: success ? (data || {}) : null,
    warnings: warnings || [],
    errors: errors || [],
    meta: Object.assign({
      action: action || '',
      generatedAt: qltdBudgetNowIso_()
    }, meta || {})
  };
}
