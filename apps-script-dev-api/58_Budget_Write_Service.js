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

  const standaloneItemResult = qltdBudgetValidateStandaloneWriteItem_(payload, action, meta);
  if (standaloneItemResult.error) return standaloneItemResult.error;
  if (standaloneItemResult.item) {
    payload.budgetItemName = standaloneItemResult.item.budgetItemName;
    payload.budgetGroup = standaloneItemResult.item.budgetGroup;
    payload.budgetStage = standaloneItemResult.item.budgetStage;
  }

  const dryRunAction = operation === 'PLAN' ? 'budget_submitPlanDryRun' : 'budget_submitActualDryRun';
  const resolveResult = qltdBudgetBuildDryRunPreview_(payload, operation, dryRunAction);
  if (!resolveResult || !resolveResult.success) {
    return qltdBudgetWriteFromDryRunError_(action, resolveResult, meta);
  }

  const resolved = resolveResult.data || {};
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
      return qltdBudgetWriteResponse_(true, 'ALREADY_PROCESSED', action, {
        operation: operation,
        budgetType: resolved.budgetType,
        requestId: requestId,
        reportId: reportId,
        centralRawRowNumber: duplicate.rowNumber,
        pbUpdated: false,
        syncStatus: qltdBudgetGetCell_(duplicate.row, duplicate.headerMap, 'Sync status', ''),
        duplicate: true
      }, resolveResult.warnings || [], [], meta);
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
      }, (resolveResult.warnings || []).concat([qltdBudgetWarning_('CACHE_REBUILD_PENDING', 'Chua rebuild CENTRAL_NS_Tong_hop/CENTRAL_NS_Dashboard.')]), [], meta);
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
    }, (resolveResult.warnings || []).concat([qltdBudgetWarning_('CACHE_REBUILD_PENDING', 'Chua rebuild CENTRAL_NS_Tong_hop/CENTRAL_NS_Dashboard.')]), [], meta);
  } catch (error) {
    let message = qltdBudgetSafeErrorMessage_(error);
    if (centralWrite) {
      try {
        qltdBudgetUpdateCentralRawSync_(centralWrite, 'ERROR', qltdBudgetNowIso_(), message);
      } catch (statusError) {
        message = message + '; status update failed: ' + qltdBudgetSafeErrorMessage_(statusError);
      }
    }
    return qltdBudgetWriteResponse_(false, 'WRITE_ERROR', action, centralWrite ? {
      operation: operation,
      budgetType: resolved.budgetType,
      requestId: requestId,
      reportId: reportId,
      centralRawRowNumber: centralWrite.rowNumber,
      pbUpdated: false,
      syncStatus: 'ERROR',
      duplicate: false
    } : null, [], [{
      code: 'WRITE_ERROR',
      message: message
    }], meta);
  } finally {
    if (locked) lock.releaseLock();
  }
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

function qltdBudgetValidateStandaloneWriteItem_(payload, action, meta) {
  const budgetType = qltdBudgetNormalizeBudgetType_(payload.budgetType).value;
  if (budgetType !== QLTD_BUDGET_TYPE.DEPT_STANDALONE) {
    return {
      item: null,
      error: null
    };
  }

  const itemsResult = qltdBudgetReadBudgetItems_();
  const item = qltdBudgetFindStandaloneWriteItem_(itemsResult.items, payload.projectCode, payload.deptCode, payload.budgetItemCode);
  if (!item) {
    return {
      item: null,
      error: qltdBudgetWriteError_(action, 'BUDGET_ITEM_NOT_FOUND', 'Khong tim thay khoan ngan sach doc lap active trong CENTRAL_NS_Items.', meta, itemsResult.warnings)
    };
  }
  if (item.status !== 'ACTIVE') {
    return {
      item: null,
      error: qltdBudgetWriteError_(action, 'BUDGET_ITEM_INACTIVE', 'Khoan ngan sach khong active.', meta, itemsResult.warnings)
    };
  }
  if (item.budgetType !== QLTD_BUDGET_TYPE.DEPT_STANDALONE) {
    return {
      item: null,
      error: qltdBudgetWriteError_(action, 'BUDGET_ITEM_TYPE_MISMATCH', 'Khoan ngan sach khong phai DEPT_STANDALONE.', meta, itemsResult.warnings)
    };
  }
  return {
    item: item,
    error: null
  };
}

function qltdBudgetFindStandaloneWriteItem_(items, projectCode, deptCode, budgetItemCode) {
  const code = qltdBudgetNormalizeCode_(budgetItemCode);
  const normalizedProjectCode = qltdBudgetNormalizeCode_(projectCode);
  const normalizedDeptCode = qltdBudgetNormalizeCode_(deptCode);

  for (let index = 0; index < (items || []).length; index += 1) {
    const item = items[index];
    if (
      qltdBudgetNormalizeCode_(item.budgetItemCode) === code &&
      item.projectCode === normalizedProjectCode &&
      qltdBudgetNormalizeCode_(item.deptCode) === normalizedDeptCode &&
      item.budgetType === QLTD_BUDGET_TYPE.DEPT_STANDALONE
    ) {
      return item;
    }
  }
  return null;
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
  rowObject['Trang thai xac nhan'] = 'SUBMITTED';
  rowObject['Sync status'] = 'PENDING';
  rowObject['Sync at'] = '';
  rowObject['Sync error'] = '';
  if (resolved.budgetType === QLTD_BUDGET_TYPE.DEPT_STANDALONE) {
    rowObject['Nguon file PB'] = QLTD_BUDGET_WRITE_CENTRAL_ONLY_SOURCE;
  }

  const rowValues = qltdBudgetMapObjectToHeaderRow_(rowObject, parsed.headers);
  const rowNumber = Math.max(sheet.getLastRow() + 1, schema.headerRow + 1);
  sheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);

  return {
    sheet: sheet,
    rowNumber: rowNumber,
    headers: parsed.headers,
    headerMap: parsed.headerMap
  };
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
