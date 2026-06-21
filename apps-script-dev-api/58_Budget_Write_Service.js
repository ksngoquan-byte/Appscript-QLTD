function qltdBudgetSubmitPlan_(payload) {
  return qltdBudgetSubmitWrite_(payload || {}, 'PLAN', 'budget_submitPlan');
}

function qltdBudgetSubmitActual_(payload) {
  return qltdBudgetSubmitWrite_(payload || {}, 'ACTUAL', 'budget_submitActual');
}

function qltdBudgetSubmitWrite_(payload, operation, action) {
  const guard = qltdBudgetValidateWriteGuard_(payload, action);
  if (guard.error) return guard.error;

  const requestId = guard.requestId;
  const reportId = qltdBudgetBuildReportId_(operation, requestId);
  const meta = {
    action: action,
    requestId: requestId,
    reportId: reportId,
    email: guard.email
  };

  const admin = qltdBudgetValidateWriteUser_(guard.email, action, meta);
  if (admin.error) return admin.error;

  const allocationWrite = qltdBudgetValidateAllocationWriteControls_(payload, action, meta);
  if (allocationWrite.error) return allocationWrite.error;
  qltdBudgetApplyBudgetItemPayloadDefaults_(payload, allocationWrite.context);

  const dryRunAction = operation === 'PLAN' ? 'budget_submitPlanDryRun' : 'budget_submitActualDryRun';
  const resolveResult = qltdBudgetBuildDryRunPreview_(payload, operation, dryRunAction);
  if (!resolveResult || !resolveResult.success) {
    return qltdBudgetWriteFromDryRunError_(action, resolveResult, meta);
  }

  const resolved = qltdBudgetBuildResolvedWriteContext_(resolveResult.data || {});
  resolved.operation = operation;
  const resolvedGuard = qltdBudgetValidateResolvedWriteContext_(resolved, action, meta);
  if (resolvedGuard.error) return resolvedGuard.error;
  const recordType = qltdBudgetResolveRecordType_(resolved.operation, resolved.periodType);
  if (recordType.error) {
    return qltdBudgetWriteError_(action, recordType.error.code, recordType.error.message, Object.assign({}, meta, {
      operation: resolved.operation,
      periodType: resolved.periodType
    }));
  }
  qltdBudgetApplyAllocationContextToResolved_(resolved, allocationWrite.context, guard.email, recordType.value);
  const writeWarnings = (resolveResult.warnings || []).concat(allocationWrite.context.warnings || []);

  const lock = LockService.getScriptLock();
  let locked = false;
  let centralWrite = null;

  try {
    locked = lock.tryLock(QLTD_BUDGET_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdBudgetWriteError_(action, 'WRITE_LOCK_TIMEOUT', 'Khong lay duoc lock ghi ngan sach.', meta);
    }

    const duplicate = qltdBudgetFindCentralRawByReportId_(reportId);
    if (duplicate.found) {
      return qltdBudgetBuildDuplicateResponse_(duplicate, operation, resolved.budgetType, requestId, reportId, action, writeWarnings, meta);
    }

    centralWrite = qltdBudgetAppendCentralRawPending_(reportId, operation, resolved);

    if (resolved.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED) {
      const pbResult = qltdBudgetApplyPbUpdate_(operation, resolved.pbPreview);
      qltdBudgetUpdateCentralRawSync_(centralWrite, 'SYNCED', qltdBudgetNowIso_(), '');
      return qltdBudgetWriteResponse_(true, 'OK', action, {
        operation: operation,
        budgetType: resolved.budgetType,
        requestId: requestId,
        reportId: reportId,
        centralRawRowNumber: centralWrite.rowNumber,
        pbUpdated: true,
        pbTarget: pbResult.pbTarget,
        syncStatus: 'SYNCED',
        duplicate: false
      }, writeWarnings.concat([qltdBudgetWarning_('CACHE_REBUILD_PENDING', 'Chua rebuild CENTRAL_NS_Tong_hop/CENTRAL_NS_Dashboard.', {
        rebuildAction: 'budget_rebuildAggregates'
      })]), [], meta);
    }

    qltdBudgetUpdateCentralRawSync_(centralWrite, 'SYNCED', qltdBudgetNowIso_(), '');
    return qltdBudgetWriteResponse_(true, 'OK', action, {
      operation: operation,
      budgetType: resolved.budgetType,
      requestId: requestId,
      reportId: reportId,
      centralRawRowNumber: centralWrite.rowNumber,
      pbUpdated: false,
      skipTaskUpdate: true,
      target: 'CENTRAL_ONLY',
      syncStatus: 'SYNCED',
      duplicate: false
    }, writeWarnings.concat([qltdBudgetWarning_('CACHE_REBUILD_PENDING', 'Chua rebuild CENTRAL_NS_Tong_hop/CENTRAL_NS_Dashboard.', {
      rebuildAction: 'budget_rebuildAggregates'
    })]), [], meta);
  } catch (error) {
    let message = qltdBudgetSafeErrorMessage_(error);
    if (centralWrite) {
      try {
        qltdBudgetUpdateCentralRawSync_(centralWrite, 'ERROR', qltdBudgetNowIso_(), message);
      } catch (statusError) {
        message = message + '; status update failed: ' + qltdBudgetSafeErrorMessage_(statusError);
      }
    }
    const errorDetails = error && error.details || {};
    const errorData = centralWrite ? {
      operation: operation,
      budgetType: resolved.budgetType,
      requestId: requestId,
      reportId: reportId,
      centralRawRowNumber: centralWrite.rowNumber,
      pbUpdated: false,
      syncStatus: 'ERROR',
      duplicate: false
    } : (errorDetails.centralRawRowNumber ? Object.assign({
      operation: operation,
      budgetType: resolved.budgetType,
      requestId: requestId,
      reportId: reportId,
      pbUpdated: false,
      duplicate: false
    }, errorDetails) : null);
    return qltdBudgetWriteResponse_(false, qltdBudgetWriteApiStatusForError_(error), action, errorData, writeWarnings, [Object.assign({
      code: error && error.code || 'WRITE_ERROR',
      message: message
    }, errorDetails)], meta);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdBudgetBuildResolvedWriteContext_(resolved) {
  const source = resolved || {};
  const normalizedPayload = source.normalizedPayload || {};
  return Object.assign({}, source, {
    projectCode: normalizedPayload.projectCode || source.projectCode || '',
    deptCode: normalizedPayload.deptCode || source.deptCode || '',
    budgetType: normalizedPayload.budgetType || source.budgetType || '',
    budgetItemCode: normalizedPayload.budgetItemCode || source.budgetItemCode || '',
    masterTaskCode: normalizedPayload.masterTaskCode || source.masterTaskCode || '',
    periodType: normalizedPayload.periodType || source.periodType || '',
    periodCode: normalizedPayload.periodCode || source.periodCode || '',
    amount: normalizedPayload.amount !== undefined ? normalizedPayload.amount : source.amount,
    email: normalizedPayload.email || source.email || '',
    normalizedPayload: normalizedPayload
  });
}

function qltdBudgetValidateResolvedWriteContext_(resolved, action, meta) {
  const requiredFields = ['budgetType', 'periodType', 'periodCode', 'centralRawPreview', 'pbPreview'];
  const missingFields = requiredFields.filter(function(field) {
    const value = resolved[field];
    return value === undefined || value === null || value === '';
  });

  if (resolved.budgetType === QLTD_BUDGET_TYPE.TASK_LINKED) {
    if (!resolved.budgetItemCode) missingFields.push('budgetItemCode');
    if (!resolved.masterTaskCode) missingFields.push('masterTaskCode');
    const pbPreview = resolved.pbPreview || {};
    ['targetSpreadsheetId', 'targetSheet', 'targetRowNumber', 'targetColumnLetter'].forEach(function(field) {
      if (pbPreview[field] === undefined || pbPreview[field] === null || pbPreview[field] === '') {
        missingFields.push('pbPreview.' + field);
      }
    });
  }

  if (missingFields.length) {
    return {
      error: qltdBudgetWriteResponse_(false, 'VALIDATION_ERROR', action, null, [], [{
        code: 'RESOLVED_CONTEXT_INCOMPLETE',
        message: 'Resolved budget context thieu truong bat buoc.',
        missingFields: missingFields
      }], Object.assign({}, meta || {}, {
        missingFields: missingFields
      }))
    };
  }

  return {
    error: null
  };
}

function qltdBudgetParsePostJson_(e) {
  try {
    const content = e && e.postData && e.postData.contents ? e.postData.contents : '';
    if (!content) {
      return {
        payload: null,
        error: qltdBudgetWriteError_('POST_PARSE', 'POST_JSON_REQUIRED', 'Body JSON la bat buoc.', {})
      };
    }
    return {
      payload: JSON.parse(content),
      error: null
    };
  } catch (error) {
    return {
      payload: null,
      error: qltdBudgetWriteError_('POST_PARSE', 'POST_JSON_INVALID', 'Body JSON khong hop le.', {})
    };
  }
}

function qltdBudgetValidateWriteGuard_(payload, action) {
  if (!QLTD_BUDGET_WRITE_ENABLED) {
    return {
      error: qltdBudgetWriteError_(action, 'WRITE_DISABLED', 'Tinh nang ghi ngan sach dang tat.', {})
    };
  }

  if (String(payload.confirm || '').trim() !== QLTD_BUDGET_WRITE_CONFIRM_TOKEN) {
    return {
      error: qltdBudgetWriteError_(action, 'WRITE_CONFIRMATION_REQUIRED', 'Can confirm=YES_WRITE_BUDGET de ghi ngan sach.', {})
    };
  }

  const requestId = String(payload.requestId || '').trim();
  if (!requestId) {
    return {
      error: qltdBudgetWriteError_(action, 'REQUEST_ID_REQUIRED', 'requestId la bat buoc.', {})
    };
  }
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) {
    return {
      error: qltdBudgetWriteError_(action, 'REQUEST_ID_INVALID', 'requestId khong hop le.', {
        requestId: requestId
      })
    };
  }

  const email = qltdDevApiNormalizeEmail_(payload.email);
  if (!email) {
    return {
      error: qltdBudgetWriteError_(action, 'EMAIL_REQUIRED', 'email la bat buoc.', {
        requestId: requestId
      })
    };
  }

  return {
    requestId: requestId,
    email: email,
    error: null
  };
}

function qltdBudgetValidateWriteUser_(email, action, meta) {
  const user = qltdUsersGetByEmail_(email);
  if (!user || user.status !== 'ACTIVE') {
    return {
      error: qltdBudgetWriteError_(action, 'FORBIDDEN', 'User khong active hoac khong ton tai.', meta)
    };
  }
  if (QLTD_BUDGET_WRITE_ADMIN_ONLY && user.role !== 'ADMIN') {
    return {
      error: qltdBudgetWriteError_(action, 'FORBIDDEN', 'Chi ADMIN duoc phep ghi ngan sach o STEP 2D.', meta)
    };
  }
  return {
    user: user,
    error: null
  };
}

function qltdBudgetValidateAllocationWriteControls_(payload, action, meta) {
  const budgetType = qltdBudgetNormalizeBudgetType_(payload.budgetType).value;
  const normalizedProjectCode = qltdBudgetNormalizeCode_(payload.projectCode);
  const normalizedDeptCode = qltdBudgetNormalizeCode_(payload.deptCode);
  const budgetItemCode = String(payload.budgetItemCode || '').trim();
  if ((budgetType === QLTD_BUDGET_TYPE.TASK_LINKED || budgetType === QLTD_BUDGET_TYPE.DEPT_STANDALONE) && !budgetItemCode) {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'BUDGET_ITEM_CODE_REQUIRED', 'Thieu budgetItemCode cho write flow ngan sach MVP.', meta)
    };
  }

  const itemsResult = qltdBudgetReadBudgetItems_();
  const item = qltdBudgetFindWriteBudgetItem_(itemsResult.items, normalizedProjectCode, normalizedDeptCode, budgetItemCode);
  if (!item) {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'BUDGET_ITEM_NOT_FOUND', 'Khong tim thay khoan ngan sach active trong CENTRAL_NS_Items.', meta, itemsResult.warnings)
    };
  }
  if (item.status !== 'ACTIVE') {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'BUDGET_ITEM_INACTIVE', 'Khoan ngan sach khong active.', meta, itemsResult.warnings)
    };
  }
  if (item.budgetType !== budgetType) {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'BUDGET_ITEM_TYPE_MISMATCH', 'Khoan ngan sach khong khop Loai ngan sach.', meta, itemsResult.warnings)
    };
  }

  const allocationCode = String(item.allocationCode || '').trim();
  if (!allocationCode) {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'ALLOCATION_CODE_REQUIRED', 'Khoan ngan sach active thieu Ma phan bo.', meta, itemsResult.warnings)
    };
  }
  const requestedAllocationCode = String(payload.allocationCode || '').trim();
  if (requestedAllocationCode && qltdBudgetNormalizeCode_(requestedAllocationCode) !== qltdBudgetNormalizeCode_(allocationCode)) {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'ALLOCATION_CODE_MISMATCH', 'allocationCode request khong khop CENTRAL_NS_Items.', meta, itemsResult.warnings)
    };
  }

  const requestedFlow = String(payload.flowType || '').trim();
  const expectedFlow = requestedFlow ? qltdBudgetNormalizeFlowType_(requestedFlow) : { value: item.flowType, error: null };
  if (expectedFlow.error || !expectedFlow.value || item.flowType !== expectedFlow.value) {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'ALLOCATION_FLOW_MISMATCH', 'Huong dong tien khong khop khoan ngan sach.', meta, itemsResult.warnings)
    };
  }

  const allocationsResult = qltdBudgetReadAllocations_();
  const warnings = (itemsResult.warnings || []).concat(allocationsResult.warnings || []);
  const allocation = qltdBudgetFindWriteAllocation_(allocationsResult.allocations, allocationCode);
  if (!allocation) {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'ALLOCATION_NOT_FOUND', 'Khong tim thay allocationCode trong CENTRAL_NS_Allocations.', meta, warnings)
    };
  }
  if (allocation.status !== 'CONFIRMED') {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'ALLOCATION_NOT_CONFIRMED', 'Allocation chua o trang thai CONFIRMED/Da chot.', meta, warnings)
    };
  }
  if (allocation.projectCode !== normalizedProjectCode || item.projectCode !== normalizedProjectCode) {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'ALLOCATION_PROJECT_MISMATCH', 'Allocation khong khop projectCode.', meta, warnings)
    };
  }
  if (qltdBudgetNormalizeCode_(allocation.deptCode) !== normalizedDeptCode || qltdBudgetNormalizeCode_(item.deptCode) !== normalizedDeptCode) {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'ALLOCATION_DEPT_MISMATCH', 'Allocation khong khop deptCode.', meta, warnings)
    };
  }
  if (allocation.flowType !== expectedFlow.value || item.flowType !== allocation.flowType) {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, 'ALLOCATION_FLOW_MISMATCH', 'Allocation khong khop huong dong tien.', meta, warnings)
    };
  }

  const limit = qltdBudgetValidateAllocationBudgetItemLimit_(itemsResult.items, allocation);
  if (limit.error) {
    return {
      context: null,
      error: qltdBudgetWriteError_(action, limit.error.code, limit.error.message, Object.assign({}, meta || {}, limit.meta || {}), warnings)
    };
  }
  return {
    context: {
      item: item,
      allocation: allocation,
      flowType: expectedFlow.value,
      warnings: warnings
    },
    error: null
  };
}

function qltdBudgetFindWriteBudgetItem_(items, projectCode, deptCode, budgetItemCode) {
  const code = qltdBudgetNormalizeCode_(budgetItemCode);
  const normalizedProjectCode = qltdBudgetNormalizeCode_(projectCode);
  const normalizedDeptCode = qltdBudgetNormalizeCode_(deptCode);

  for (let index = 0; index < (items || []).length; index += 1) {
    const item = items[index];
    if (
      qltdBudgetNormalizeCode_(item.budgetItemCode) === code &&
      item.projectCode === normalizedProjectCode &&
      qltdBudgetNormalizeCode_(item.deptCode) === normalizedDeptCode
    ) {
      return item;
    }
  }
  return null;
}

function qltdBudgetFindWriteAllocation_(allocations, allocationCode) {
  const code = qltdBudgetNormalizeCode_(allocationCode);
  for (let index = 0; index < (allocations || []).length; index += 1) {
    const item = allocations[index];
    if (qltdBudgetNormalizeCode_(item.allocationCode) === code) return item;
  }
  return null;
}

function qltdBudgetValidateAllocationBudgetItemLimit_(items, allocation) {
  const allocationCode = qltdBudgetNormalizeCode_(allocation && allocation.allocationCode);
  let total = 0;
  (items || []).forEach(function(item) {
    if (item.status !== 'ACTIVE') return;
    if (qltdBudgetNormalizeCode_(item.allocationCode) !== allocationCode) return;
    total += Number(item.approvedBudget || 0);
  });
  const limit = Number(allocation && allocation.allocatedAmount || 0);
  if (total > limit) {
    return {
      error: {
        code: 'ALLOCATION_LIMIT_EXCEEDED',
        message: 'Tong Budget Item active vuot Gia tri giao cua allocation.'
      },
      meta: {
        allocationCode: allocation && allocation.allocationCode || '',
        allocationLimit: limit,
        activeBudgetItemTotal: total
      }
    };
  }
  return { error: null };
}

function qltdBudgetApplyBudgetItemPayloadDefaults_(payload, context) {
  const item = context && context.item || {};
  payload.budgetItemName = payload.budgetItemName || item.budgetItemName || '';
  payload.budgetGroup = payload.budgetGroup || item.budgetGroup || '';
  payload.budgetStage = payload.budgetStage || item.budgetStage || '';
  payload.allocationCode = item.allocationCode || '';
  payload.pbTaskCode = payload.pbTaskCode || item.pbTaskCode || '';
  payload.flowType = context && context.flowType || item.flowType || '';
}

function qltdBudgetResolveRecordType_(operation, periodType) {
  const normalizedOperation = String(operation || '').trim().toUpperCase();
  const normalizedPeriodType = String(periodType || '').trim().toUpperCase();
  if (normalizedOperation === 'PLAN' && normalizedPeriodType === 'MONTH') {
    return { value: 'PLAN_MONTH', error: null };
  }
  if (normalizedOperation === 'PLAN' && normalizedPeriodType === 'WEEK') {
    return { value: 'PLAN_WEEK', error: null };
  }
  if (normalizedOperation === 'ACTUAL') {
    return { value: 'PERFORMANCE_ACTUAL', error: null };
  }
  return {
    value: '',
    error: {
      code: 'BUDGET_RECORD_TYPE_INVALID',
      message: 'Khong map duoc Loai ban ghi tu operation va periodType.'
    }
  };
}

function qltdBudgetApplyAllocationContextToResolved_(resolved, context, confirmedBy, recordType) {
  const item = context && context.item || {};
  const allocation = context && context.allocation || {};
  const preview = resolved.centralRawPreview || {};
  const confirmedAt = qltdBudgetNowIso_();
  resolved.allocationCode = allocation.allocationCode || item.allocationCode || '';
  resolved.pbTaskCode = item.pbTaskCode || '';
  resolved.flowType = context && context.flowType || item.flowType || allocation.flowType || '';
  resolved.confirmedBy = qltdDevApiNormalizeEmail_(confirmedBy || resolved.email) || '';
  resolved.confirmedAt = confirmedAt;
  preview['Ma phan bo'] = resolved.allocationCode;
  preview['Ma cong viec chi tiet PB'] = resolved.pbTaskCode;
  preview['Huong dong tien'] = resolved.flowType;
  preview['Loai ban ghi'] = recordType;
  preview['Nguoi xac nhan'] = resolved.confirmedBy;
  preview['Thoi diem xac nhan'] = confirmedAt;
  resolved.centralRawPreview = preview;
}

function qltdBudgetBuildReportId_(operation, requestId) {
  return 'BUDGET_' + operation + '_' + requestId;
}

function qltdBudgetFindCentralRawByReportId_(reportId) {
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_RAW);
  if (!sheet) throw new Error('Khong tim thay CENTRAL_NS_Raw.');
  const schema = qltdBudgetGetSheetSchema_(QLTD_BUDGET_SHEET.CENTRAL_RAW);
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, schema.headerRow);
  for (let index = 0; index < parsed.rows.length; index += 1) {
    const item = parsed.rows[index];
    if (String(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'Report ID', '') || '').trim() === reportId) {
      return {
        found: true,
        rowNumber: item.rowNumber,
        row: item.raw,
        headerMap: parsed.headerMap
      };
    }
  }
  return {
    found: false
  };
}

function qltdBudgetAppendCentralRawPending_(reportId, operation, resolved) {
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_RAW);
  if (!sheet) throw new Error('Khong tim thay CENTRAL_NS_Raw.');
  const schema = qltdBudgetGetSheetSchema_(QLTD_BUDGET_SHEET.CENTRAL_RAW);
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, schema.headerRow);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_BUDGET_CENTRAL_RAW_HEADERS);
  if (missingHeaders.length) {
    throw new Error('CENTRAL_NS_Raw thieu header: ' + missingHeaders.join(', '));
  }

  const rowObject = Object.assign({}, resolved.centralRawPreview || {});
  rowObject['Report ID'] = reportId;
  rowObject['Loai ky'] = qltdBudgetGetPeriodSheetLabel_(resolved.periodType);
  rowObject['Trang thai xac nhan'] = qltdBudgetGetConfirmStatusSheetLabel_('CONFIRMED');
  rowObject['Sync status'] = 'PENDING';
  rowObject['Sync at'] = '';
  rowObject['Sync error'] = '';
  rowObject['Nguoi xac nhan'] = resolved.confirmedBy || resolved.email || '';
  rowObject['Thoi diem xac nhan'] = resolved.confirmedAt || qltdBudgetNowIso_();
  if (resolved.budgetType === QLTD_BUDGET_TYPE.DEPT_STANDALONE) {
    rowObject['Nguon file PB'] = QLTD_BUDGET_WRITE_CENTRAL_ONLY_SOURCE;
  }

  const rowValues = qltdBudgetMapObjectToHeaderRow_(rowObject, parsed.headers);
  const rowNumber = Math.max(sheet.getLastRow() + 1, schema.headerRow + 1);
  const targetRange = sheet.getRange(rowNumber, 1, 1, rowValues.length);
  qltdBudgetValidateRowAgainstDataValidation_(targetRange, rowValues, parsed.headers);
  try {
    targetRange.setValues([rowValues]);
  } catch (error) {
    let partialRowCleaned = false;
    let cleanupErrorMessage = '';
    try {
      targetRange.clearContent();
      partialRowCleaned = true;
    } catch (cleanupError) {
      cleanupErrorMessage = qltdBudgetSafeErrorMessage_(cleanupError);
    }
    error.code = cleanupErrorMessage ? 'PARTIAL_ROW_CLEANUP_FAILED' : (error.code || 'CENTRAL_RAW_WRITE_FAILED');
    error.details = Object.assign({}, error.details || {}, {
      partialRowCleaned: partialRowCleaned,
      centralRawRowNumber: rowNumber,
      cleanupError: cleanupErrorMessage
    });
    throw error;
  }

  return {
    sheet: sheet,
    rowNumber: rowNumber,
    headers: parsed.headers,
    headerMap: parsed.headerMap
  };
}

function qltdBudgetValidateRowAgainstDataValidation_(range, rowValues, headers) {
  const validations = range.getDataValidations()[0] || [];
  for (let index = 0; index < rowValues.length; index += 1) {
    const value = rowValues[index];
    const rule = validations[index];
    if (!rule || value === '' || value === null || value === undefined) continue;

    const criteria = rule.getCriteriaType();
    const criteriaName = String(criteria || '');
    const criteriaValues = rule.getCriteriaValues() || [];
    let allowedValues = null;
    if (criteriaName === 'VALUE_IN_LIST' || criteriaName === 'ONE_OF_LIST') {
      allowedValues = criteriaValues[0] || [];
    } else if (criteriaName === 'VALUE_IN_RANGE' || criteriaName === 'ONE_OF_RANGE') {
      const allowedRange = criteriaValues[0];
      allowedValues = allowedRange ? allowedRange.getDisplayValues().reduce(function(all, row) {
        return all.concat(row);
      }, []).filter(function(item) {
        return item !== '';
      }) : [];
    }
    if (!allowedValues) continue;

    const attempted = String(value);
    const normalizedAllowed = allowedValues.map(function(item) { return String(item); });
    if (normalizedAllowed.indexOf(attempted) !== -1) continue;

    const error = new Error('Giá trị không phù hợp data validation của Google Sheet.');
    error.code = 'SHEET_DATA_VALIDATION_REJECTED';
    error.details = {
      sheetName: range.getSheet().getName(),
      cellA1: range.getCell(1, index + 1).getA1Notation(),
      rowNumber: range.getRow(),
      columnNumber: range.getColumn() + index,
      header: headers[index] || '',
      attemptedValue: value,
      allowedValues: normalizedAllowed
    };
    throw error;
  }
}

function qltdBudgetBuildDuplicateResponse_(duplicate, operation, budgetType, requestId, reportId, action, warnings, meta) {
  const syncStatus = String(qltdBudgetGetCell_(duplicate.row, duplicate.headerMap, 'Sync status', '') || '').trim().toUpperCase();
  const data = {
    operation: operation,
    budgetType: budgetType,
    requestId: requestId,
    reportId: reportId,
    centralRawRowNumber: duplicate.rowNumber,
    pbUpdated: false,
    syncStatus: syncStatus,
    duplicate: true
  };
  if (syncStatus === 'SYNCED') {
    return qltdBudgetWriteResponse_(true, 'ALREADY_PROCESSED', action, data, warnings, [], meta);
  }

  const duplicateStatus = syncStatus === 'PENDING' ? {
    apiStatus: 'REQUEST_IN_PROGRESS',
    code: 'DUPLICATE_REQUEST_PENDING',
    message: 'Request đang được xử lý.'
  } : syncStatus === 'ERROR' ? {
    apiStatus: 'RETRY_BLOCKED',
    code: 'DUPLICATE_REQUEST_ERROR',
    message: 'Request trước đã lỗi; không tự retry cùng requestId.'
  } : {
    apiStatus: 'INCOMPLETE_RECORD',
    code: 'DUPLICATE_REQUEST_INCOMPLETE',
    message: 'Bản ghi trùng thiếu Sync status hợp lệ.'
  };
  if (syncStatus === 'ERROR') {
    data.syncError = qltdBudgetGetCell_(duplicate.row, duplicate.headerMap, 'Sync error', '');
  }
  return qltdBudgetWriteResponse_(false, duplicateStatus.apiStatus, action, data, warnings, [{
    code: duplicateStatus.code,
    message: duplicateStatus.message
  }], meta);
}

function qltdBudgetWriteApiStatusForError_(error) {
  const code = String(error && error.code || '');
  if (code === 'PERIOD_TYPE_SHEET_VALUE_UNSUPPORTED' || code === 'CONFIRM_STATUS_SHEET_VALUE_UNSUPPORTED' || code === 'SHEET_DATA_VALIDATION_REJECTED') {
    return 'VALIDATION_ERROR';
  }
  return 'WRITE_ERROR';
}

function qltdBudgetApplyPbUpdate_(operation, pbPreview) {
  if (!pbPreview || pbPreview.writeMode !== 'DRY_RUN_ONLY') {
    throw new Error('PB preview khong hop le.');
  }
  const spreadsheet = SpreadsheetApp.openById(pbPreview.targetSpreadsheetId);
  const sheet = spreadsheet.getSheetByName(pbPreview.targetSheet);
  if (!sheet) throw new Error('Khong tim thay sheet PB: ' + pbPreview.targetSheet);

  const targetColumn = qltdBudgetColumnIndexFromLetter_(pbPreview.targetColumnLetter);
  if (!targetColumn || !pbPreview.targetRowNumber) {
    throw new Error('PB target khong hop le.');
  }

  const targetRange = sheet.getRange(Number(pbPreview.targetRowNumber), targetColumn);
  const beforeValue = targetRange.getValue();
  targetRange.setValue(pbPreview.newValue);

  let noteTarget = null;
  if (operation === 'ACTUAL' && pbPreview.noteColumnLetter && String(pbPreview.noteNewValue || '').trim() !== '') {
    const noteColumn = qltdBudgetColumnIndexFromLetter_(pbPreview.noteColumnLetter);
    const noteRange = sheet.getRange(Number(pbPreview.targetRowNumber), noteColumn);
    const noteBeforeValue = noteRange.getValue();
    noteRange.setValue(pbPreview.noteNewValue);
    noteTarget = {
      columnLetter: pbPreview.noteColumnLetter,
      columnName: pbPreview.noteColumnName,
      beforeValue: noteBeforeValue,
      afterValue: pbPreview.noteNewValue
    };
  }

  return {
    pbTarget: {
      spreadsheetId: pbPreview.targetSpreadsheetId,
      sheetName: pbPreview.targetSheet,
      rowNumber: Number(pbPreview.targetRowNumber),
      columnLetter: pbPreview.targetColumnLetter,
      columnName: pbPreview.targetColumnName,
      beforeValue: beforeValue,
      afterValue: pbPreview.newValue,
      noteTarget: noteTarget
    }
  };
}

function qltdBudgetUpdateCentralRawSync_(centralWrite, syncStatus, syncAt, syncError) {
  const sheet = centralWrite.sheet;
  const statusColumn = qltdBudgetFindHeaderIndex_(centralWrite.headerMap, 'Sync status') + 1;
  const atColumn = qltdBudgetFindHeaderIndex_(centralWrite.headerMap, 'Sync at') + 1;
  const errorColumn = qltdBudgetFindHeaderIndex_(centralWrite.headerMap, 'Sync error') + 1;
  if (!statusColumn || !atColumn || !errorColumn) {
    throw new Error('CENTRAL_NS_Raw thieu cot Sync status/at/error.');
  }
  sheet.getRange(centralWrite.rowNumber, statusColumn, 1, 3).setValues([[syncStatus, syncAt, syncError || '']]);
}

function qltdBudgetMapObjectToHeaderRow_(object, headers) {
  const normalized = {};
  Object.keys(object || {}).forEach(function(key) {
    normalized[qltdBudgetNormalizeKey_(key)] = object[key];
  });
  return (headers || []).map(function(header) {
    const key = qltdBudgetNormalizeKey_(header);
    return Object.prototype.hasOwnProperty.call(normalized, key) ? normalized[key] : '';
  });
}

function qltdBudgetColumnIndexFromLetter_(letter) {
  const text = String(letter || '').trim().toUpperCase();
  let index = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 65 || code > 90) return 0;
    index = index * 26 + code - 64;
  }
  return index;
}

function qltdBudgetSafeErrorMessage_(error) {
  return String(error && error.message || error || 'WRITE_ERROR').slice(0, 300);
}

function qltdBudgetWriteFromDryRunError_(action, response, meta) {
  return qltdBudgetWriteResponse_(false, response && response.apiStatus || 'VALIDATION_ERROR', action, null, response && response.warnings || [], response && response.errors || [{
    code: 'VALIDATION_ERROR',
    message: 'Khong resolve duoc dry-run preview.'
  }], meta || {});
}

function qltdBudgetWriteError_(action, code, message, meta, warnings) {
  return qltdBudgetWriteResponse_(false, 'VALIDATION_ERROR', action, null, warnings || [], [{
    code: code,
    message: message || code
  }], meta || {});
}

function qltdBudgetWriteResponse_(success, apiStatus, action, data, warnings, errors, meta) {
  return {
    success: !!success,
    apiStatus: apiStatus || (success ? 'OK' : 'ERROR'),
    source: QLTD_BUDGET_WRITE_SOURCE,
    data: success ? (data || {}) : data,
    warnings: warnings || [],
    errors: errors || [],
    meta: Object.assign({
      action: action || '',
      generatedAt: qltdBudgetNowIso_()
    }, meta || {})
  };
}
