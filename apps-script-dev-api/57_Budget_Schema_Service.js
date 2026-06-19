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
    centralRaw: result.centralRaw
  }, result.warnings, [], meta);
}

function qltdBudgetInspectTwoLayerSchema_() {
  const warnings = [];
  const itemsSheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_ITEMS);
  const rawSheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_RAW);

  const itemsInfo = qltdBudgetInspectSheetHeaders_(
    itemsSheet,
    QLTD_BUDGET_SHEET.CENTRAL_ITEMS,
    QLTD_BUDGET_ITEMS_HEADERS,
    warnings
  );
  const rawInfo = qltdBudgetInspectSheetHeaders_(
    rawSheet,
    QLTD_BUDGET_SHEET.CENTRAL_RAW,
    QLTD_BUDGET_CENTRAL_RAW_TWO_LAYER_HEADERS,
    warnings
  );

  return {
    itemsSheet: itemsInfo,
    centralRaw: rawInfo,
    canApplySetup: !rawInfo.blocked,
    warnings: warnings
  };
}

function qltdBudgetInspectSheetHeaders_(sheet, sheetName, requiredHeaders, warnings) {
  if (!sheet) {
    warnings.push(qltdBudgetWarning_('SHEET_NOT_FOUND', 'Khong tim thay sheet: ' + sheetName, {
      sheetName: sheetName
    }));
    return {
      sheetName: sheetName,
      exists: false,
      headersOk: false,
      existingHeaders: [],
      missingHeaders: requiredHeaders.slice(),
      appendOnly: true,
      blocked: false
    };
  }

  const parsed = qltdBudgetReadSheetAsObjects_(sheet, 1);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, requiredHeaders);

  return {
    sheetName: sheetName,
    exists: true,
    headersOk: missingHeaders.length === 0,
    existingHeaders: parsed.headers,
    missingHeaders: missingHeaders,
    appendOnly: true,
    blocked: false
  };
}

function qltdBudgetBuildTwoLayerSchemaPlan_(inspection) {
  const actions = [];
  if (!inspection.itemsSheet.exists) {
    actions.push({
      type: 'CREATE_SHEET',
      sheetName: QLTD_BUDGET_SHEET.CENTRAL_ITEMS,
      headers: QLTD_BUDGET_ITEMS_HEADERS,
      dryRunOnly: true
    });
  } else if (inspection.itemsSheet.missingHeaders.length) {
    actions.push({
      type: 'APPEND_HEADERS',
      sheetName: QLTD_BUDGET_SHEET.CENTRAL_ITEMS,
      headers: inspection.itemsSheet.missingHeaders,
      dryRunOnly: true
    });
  }

  if (!inspection.centralRaw.exists) {
    actions.push({
      type: 'MISSING_REQUIRED_SHEET',
      sheetName: QLTD_BUDGET_SHEET.CENTRAL_RAW,
      dryRunOnly: true
    });
  } else if (inspection.centralRaw.missingHeaders.length) {
    actions.push({
      type: 'APPEND_HEADERS',
      sheetName: QLTD_BUDGET_SHEET.CENTRAL_RAW,
      headers: inspection.centralRaw.missingHeaders,
      dryRunOnly: true
    });
  }

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

  const parsed = qltdBudgetReadSheetAsObjects_(sheet, 1);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_BUDGET_ITEMS_HEADERS);
  if (missingHeaders.length) {
    warnings.push(qltdBudgetWarning_('ITEMS_HEADER_MISSING', 'Sheet CENTRAL_NS_Items thieu header.', {
      missingHeaders: missingHeaders
    }));
  }

  return {
    items: parsed.rows.map(function(item) {
      const row = item.raw;
      const budgetType = qltdBudgetNormalizeBudgetType_(qltdBudgetGetCell_(row, parsed.headerMap, 'Loai ngan sach', '')).value || '';
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
        approvedBudget: qltdBudgetToNumber_(qltdBudgetGetCell_(row, parsed.headerMap, 'Ngan sach duoc duyet', 0)),
        status: qltdBudgetNormalizeStatus_(qltdBudgetGetCell_(row, parsed.headerMap, 'Trang thai', 'ACTIVE')),
        note: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ghi chu', '') || '').trim(),
        rowNumber: item.rowNumber
      };
    }).filter(function(item) {
      return !!item.budgetItemCode;
    }),
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
