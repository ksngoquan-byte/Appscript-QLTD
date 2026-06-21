/**
 * STEP 4C.1 - Budget Allocation Service.
 *
 * Phạm vi:
 * - Đọc CENTRAL_NS_Allocations.
 * - Kiểm tra phân bổ so với nguồn Master TASK_DIRECT/NON_TASK.
 * - Upsert allocation an toàn, có lock/idempotency.
 * - Không rebuild aggregate, không ghi CENTRAL_NS_Raw/Items, không cập nhật PB.
 */

function qltdBudgetGetAllocations_(params) {
  const action = 'budget_getAllocations';
  const filter = qltdBudgetNormalizeAllocationFilter_(params || {});
  const meta = Object.assign({
    action: action,
    email: qltdDevApiNormalizeEmail_(params && params.email) || 'anonymous'
  }, filter.meta);
  const access = qltdBudgetValidateAllocationAccess_(params || {}, action, meta);
  if (access.error) return access.error;
  if (filter.errors.length) {
    return qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, null, [], filter.errors, meta);
  }

  const read = qltdBudgetReadAllocations_();
  let allocations = read.allocations || [];
  allocations = allocations.filter(function(item) {
    if (filter.projectCode && item.projectCode !== filter.projectCode) return false;
    if (filter.deptCode && qltdBudgetNormalizeCode_(item.deptCode) !== qltdBudgetNormalizeCode_(filter.deptCode)) return false;
    if (filter.sourceType && item.sourceType !== filter.sourceType) return false;
    if (filter.sourceCode && qltdBudgetNormalizeCode_(item.sourceCode) !== qltdBudgetNormalizeCode_(filter.sourceCode)) return false;
    if (filter.flowType && item.flowType !== filter.flowType) return false;
    if (filter.status && item.status !== filter.status) return false;
    return true;
  });

  return qltdBudgetAllocationResponse_(true, 'OK', action, {
    allocations: allocations,
    count: allocations.length,
    filters: filter.meta
  }, read.warnings, [], meta);
}

function qltdBudgetCheckAllocation_(payload) {
  const action = 'budget_checkAllocation';
  const access = qltdBudgetValidateAllocationAccess_(payload || {}, action, {
    action: action,
    email: qltdDevApiNormalizeEmail_(payload && payload.email) || 'anonymous'
  });
  if (access.error) return access.error;
  return qltdBudgetBuildAllocationPreview_(payload || {}, action);
}

function qltdBudgetUpsertAllocation_(payload) {
  const action = 'budget_upsertAllocation';
  const guard = qltdBudgetValidateAllocationWriteGuard_(payload || {}, action);
  if (guard.error) return guard.error;

  const meta = {
    action: action,
    requestId: guard.requestId,
    email: guard.email,
    projectCode: qltdBudgetNormalizeCode_(payload && payload.projectCode),
    allocationCode: String(payload && payload.allocationCode || '').trim()
  };

  const admin = qltdBudgetValidateAllocationAdmin_(guard.email, action, meta);
  if (admin.error) return admin.error;

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_BUDGET_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, null, [], [{
        code: 'WRITE_LOCK_TIMEOUT',
        message: 'Khong lay duoc lock ghi phan bo ngan sach.'
      }], meta);
    }

    const existingRequest = qltdBudgetAllocationFindRequestLog_(guard.requestId);
    if (existingRequest.found) return qltdBudgetAllocationRequestStatusResponse_(existingRequest, action, meta);

    const preview = qltdBudgetBuildAllocationPreview_(Object.assign({}, payload, {
      email: guard.email
    }), action);
    if (!preview.success || !preview.data || !preview.data.canSave) {
      return qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, preview.data || null, preview.warnings || [], preview.errors || [{
        code: 'ALLOCATION_VALIDATION_FAILED',
        message: 'Phan bo ngan sach khong hop le.'
      }], meta);
    }

    const pendingLog = qltdBudgetAllocationAppendPendingLog_(guard.requestId, guard.email, preview.data, meta);
    let write = null;
    try {
      write = qltdBudgetWriteAllocationRow_(payload || {}, preview.data);
    } catch (writeError) {
      try {
        qltdBudgetAllocationMarkLogStatus_(pendingLog, 'ERROR', [
          'requestId=' + guard.requestId,
          'allocationCode=' + String(payload && payload.allocationCode || '').trim(),
          'errorCode=' + (writeError && writeError.code || 'ALLOCATION_WRITE_ERROR'),
          'errorMessage=' + qltdBudgetSafeErrorMessage_(writeError)
        ].join('; '));
      } catch (logError) {
        writeError.details = Object.assign({}, writeError.details || {}, {
          errorLogUpdateFailed: true,
          logRowNumber: pendingLog.rowNumber,
          logError: qltdBudgetSafeErrorMessage_(logError)
        });
      }
      throw writeError;
    }

    try {
      qltdBudgetAllocationMarkLogStatus_(pendingLog, 'SUCCESS', qltdBudgetAllocationBuildLogNote_(guard.requestId, write, 'SUCCESS'));
    } catch (finalizeError) {
      return qltdBudgetAllocationResponse_(false, 'WRITE_ERROR', action, {
        requestId: guard.requestId,
        allocationCode: write.allocation.allocationCode,
        rowNumber: write.rowNumber,
        created: write.created
      }, preview.warnings || [], [{
        code: 'IDEMPOTENCY_FINALIZE_FAILED',
        message: 'Da ghi allocation nhung khong cap nhat duoc log SUCCESS.',
        details: {
          allocationCode: write.allocation.allocationCode,
          rowNumber: write.rowNumber,
          logRowNumber: pendingLog.rowNumber,
          logError: qltdBudgetSafeErrorMessage_(finalizeError)
        }
      }], meta);
    }

    return qltdBudgetAllocationResponse_(true, 'OK', action, {
      requestId: guard.requestId,
      allocationCode: write.allocation.allocationCode,
      rowNumber: write.rowNumber,
      created: write.created,
      updated: !write.created,
      duplicate: false,
      allocation: write.allocation,
      capacity: preview.data.capacity
    }, preview.warnings || [], [], meta);
  } catch (error) {
    return qltdBudgetAllocationResponse_(false, 'WRITE_ERROR', action, null, [], [{
      code: error && error.code || 'ALLOCATION_WRITE_ERROR',
      message: qltdBudgetSafeErrorMessage_(error),
      details: error && error.details || undefined
    }], meta);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdBudgetValidateAllocationWriteGuard_(payload, action) {
  if (!QLTD_BUDGET_WRITE_ENABLED) {
    return {
      error: qltdBudgetAllocationGuardError_(action, 'WRITE_DISABLED', 'Tinh nang ghi ngan sach dang tat.', {})
    };
  }

  if (String(payload.confirm || '').trim() !== QLTD_BUDGET_WRITE_CONFIRM_TOKEN) {
    return {
      error: qltdBudgetAllocationGuardError_(action, 'WRITE_CONFIRMATION_REQUIRED', 'Can confirm=YES_WRITE_BUDGET de ghi ngan sach.', {})
    };
  }

  const requestId = String(payload.requestId || '').trim();
  if (!requestId) {
    return {
      error: qltdBudgetAllocationGuardError_(action, 'REQUEST_ID_REQUIRED', 'requestId la bat buoc.', {})
    };
  }
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) {
    return {
      error: qltdBudgetAllocationGuardError_(action, 'REQUEST_ID_INVALID', 'requestId khong hop le.', {
        requestId: requestId
      })
    };
  }

  const email = qltdDevApiNormalizeEmail_(payload.email);
  if (!email) {
    return {
      error: qltdBudgetAllocationGuardError_(action, 'EMAIL_REQUIRED', 'email la bat buoc.', {
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

function qltdBudgetValidateAllocationAccess_(payload, action, meta) {
  const email = qltdDevApiNormalizeEmail_(payload && payload.email);
  if (!email) {
    return {
      error: qltdBudgetAllocationGuardError_(action, 'EMAIL_REQUIRED', 'email la bat buoc.', meta || {})
    };
  }
  return qltdBudgetValidateAllocationAdmin_(email, action, Object.assign({}, meta || {}, {
    email: email
  }));
}

function qltdBudgetValidateAllocationAdmin_(email, action, meta) {
  const user = qltdUsersGetByEmail_(email);
  if (!user || user.status !== 'ACTIVE') {
    return {
      error: qltdBudgetAllocationGuardError_(action, 'FORBIDDEN', 'User khong active hoac khong ton tai.', meta || {})
    };
  }
  if (user.role !== 'ADMIN') {
    return {
      error: qltdBudgetAllocationGuardError_(action, 'FORBIDDEN', 'Chi ADMIN ACTIVE duoc phep truy cap phan bo ngan sach.', meta || {})
    };
  }
  return {
    user: user,
    error: null
  };
}

function qltdBudgetAllocationGuardError_(action, code, message, meta) {
  return qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, null, [], [{
    code: code,
    message: message || code
  }], meta || {});
}

function qltdBudgetReadAllocations_() {
  const warnings = [];
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS);
  if (!sheet) {
    warnings.push(qltdBudgetWarning_('ALLOCATIONS_SHEET_NOT_FOUND', 'Chua co sheet CENTRAL_NS_Allocations.', {
      sheetName: QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS
    }));
    return {
      allocations: [],
      warnings: warnings
    };
  }

  const schema = qltdBudgetGetSheetSchema_(QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS);
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, schema.headerRow);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_BUDGET_ALLOCATIONS_HEADERS);
  if (missingHeaders.length) {
    warnings.push(qltdBudgetWarning_('ALLOCATIONS_HEADER_MISSING', 'Sheet CENTRAL_NS_Allocations thieu header.', {
      missingHeaders: missingHeaders
    }));
  }

  return {
    allocations: (parsed.rows || []).map(function(item) {
      return qltdBudgetAllocationRowToObject_(item.raw, parsed.headerMap, item.rowNumber);
    }).filter(function(item) {
      return !!item.allocationCode;
    }),
    warnings: warnings,
    sheet: sheet,
    parsed: parsed
  };
}

function qltdBudgetAllocationRowToObject_(row, headerMap, rowNumber) {
  const sourceType = qltdBudgetNormalizeAllocationSourceType_(qltdBudgetGetCell_(row, headerMap, 'Loai nguon ngan sach', '')).value || '';
  const flowType = qltdBudgetNormalizeFlowType_(qltdBudgetGetCell_(row, headerMap, 'Huong dong tien', '')).value || '';
  const status = qltdBudgetNormalizeAllocationStatus_(qltdBudgetGetCell_(row, headerMap, 'Trang thai', 'Nháp')).value || '';
  return {
    allocationCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma phan bo', '') || '').trim(),
    projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, headerMap, 'Ma du an', '')),
    sourceType: sourceType,
    sourceCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma nguon ngan sach', '') || '').trim(),
    deptCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma phong/ban', '') || '').trim(),
    deptName: String(qltdBudgetGetCell_(row, headerMap, 'Ten phong/ban', '') || '').trim(),
    flowType: flowType,
    allocatedAmount: qltdBudgetToNumber_(qltdBudgetGetCell_(row, headerMap, 'Gia tri giao', 0)),
    status: status,
    note: String(qltdBudgetGetCell_(row, headerMap, 'Ghi chu', '') || '').trim(),
    rowNumber: rowNumber
  };
}

function qltdBudgetBuildAllocationPreview_(payload, action) {
  const normalized = qltdBudgetNormalizeAllocationPayload_(payload || {}, action);
  const meta = {
    action: action,
    projectCode: normalized.value.projectCode,
    sourceType: normalized.value.sourceType,
    sourceCode: normalized.value.sourceCode,
    deptCode: normalized.value.deptCode,
    flowType: normalized.value.flowType,
    allocationCode: normalized.value.allocationCode,
    email: qltdDevApiNormalizeEmail_(payload && payload.email) || 'anonymous'
  };

  if (normalized.errors.length) {
    return qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, qltdBudgetBuildAllocationEmptyPreview_(normalized.value), [], normalized.errors, meta);
  }

  let warnings = [];
  const context = qltdBudgetResolveAllocationContext_(normalized.value, action, meta);
  if (context.error) return context.error;
  warnings = warnings.concat(context.warnings || []);

  const sourceResult = qltdBudgetResolveAllocationSource_(context.project, normalized.value, action, meta, warnings);
  if (sourceResult.error) return sourceResult.error;

  const allocationsResult = qltdBudgetReadAllocations_();
  warnings = warnings.concat(allocationsResult.warnings || []);
  const duplicateCheck = qltdBudgetFindAllocationDuplicates_(allocationsResult.allocations, normalized.value.allocationCode);
  if (duplicateCheck.duplicate) {
    return qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, qltdBudgetBuildAllocationEmptyPreview_(normalized.value), warnings, [{
      code: 'ALLOCATION_CODE_DUPLICATE',
      message: 'Ma phan bo bi trung trong CENTRAL_NS_Allocations.',
      rowNumbers: duplicateCheck.rowNumbers
    }], meta);
  }

  const current = duplicateCheck.current || null;
  const transitionError = qltdBudgetValidateAllocationTransition_(current, normalized.value);
  if (transitionError) {
    return qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, qltdBudgetBuildAllocationEmptyPreview_(normalized.value), warnings, [transitionError], meta);
  }

  const capacity = qltdBudgetBuildAllocationCapacity_(allocationsResult.allocations, normalized.value, sourceResult.source, current);
  const exceeds = capacity.availableAfter < 0;
  const sourceReady = qltdBudgetIsMasterBudgetSourceReady_(sourceResult.source.sourceStatus);
  const errors = [];

  if (!sourceReady) {
    errors.push({
      code: 'ALLOCATION_SOURCE_NOT_READY',
      message: 'Nguon ngan sach chua o trang thai Đã chốt/Khóa.'
    });
  }
  if (exceeds) {
    errors.push({
      code: 'ALLOCATION_EXCEEDS_SOURCE',
      message: 'Tong phan bo vuot tran/muc tieu nguon ngan sach.'
    });
  }

  const data = {
    source: sourceResult.source,
    allocation: {
      allocationCode: normalized.value.allocationCode,
      deptCode: context.dept.deptCode,
      deptName: context.dept.deptName,
      amount: normalized.value.amount,
      status: normalized.value.status
    },
    capacity: capacity,
    canSave: errors.length === 0,
    canConfirm: errors.length === 0 && normalized.value.status === 'CONFIRMED',
    existingAllocation: current
  };

  return qltdBudgetAllocationResponse_(errors.length === 0, errors.length ? 'VALIDATION_ERROR' : 'OK', action, data, warnings, errors, meta);
}

function qltdBudgetNormalizeAllocationPayload_(payload, action) {
  const errors = [];
  const sourceType = qltdBudgetNormalizeAllocationSourceType_(payload.sourceType);
  const flowType = qltdBudgetNormalizeFlowType_(payload.flowType);
  const status = qltdBudgetNormalizeAllocationStatus_(payload.status || 'DRAFT');
  const amount = qltdBudgetNormalizeAmount_(payload.amount);
  const projectValidation = qltdBudgetValidateProjectCode_(action, payload.projectCode);
  const deptValidation = qltdBudgetValidateDeptCode_(action, payload.deptCode, {
    projectCode: projectValidation.value
  });
  const allocationCode = String(payload.allocationCode || '').trim();
  const sourceCode = String(payload.sourceCode || '').trim();

  if (!allocationCode) errors.push({ code: 'ALLOCATION_CODE_REQUIRED', message: 'Ma phan bo la bat buoc.' });
  if (!sourceCode) errors.push({ code: 'ALLOCATION_SOURCE_CODE_REQUIRED', message: 'Ma nguon ngan sach la bat buoc.' });
  if (projectValidation.error) errors.push((projectValidation.error.errors || [])[0] || { code: 'PROJECT_CODE_REQUIRED', message: 'Thieu projectCode.' });
  if (deptValidation.error) errors.push((deptValidation.error.errors || [])[0] || { code: 'DEPT_CODE_REQUIRED', message: 'Thieu deptCode.' });
  if (sourceType.error) errors.push(sourceType.error);
  if (flowType.error) errors.push(flowType.error);
  if (status.error) errors.push(status.error);
  if (amount.error || amount.value <= 0) {
    errors.push({
      code: 'ALLOCATION_AMOUNT_INVALID',
      message: 'Gia tri phan bo phai la so lon hon 0.'
    });
  }

  return {
    value: {
      allocationCode: allocationCode,
      projectCode: projectValidation.value || qltdBudgetNormalizeCode_(payload.projectCode),
      sourceType: sourceType.value,
      sourceCode: sourceCode,
      deptCode: deptValidation.value || String(payload.deptCode || '').trim(),
      flowType: flowType.value,
      amount: amount.value,
      status: status.value,
      note: String(payload.note || '').trim(),
      email: qltdDevApiNormalizeEmail_(payload.email)
    },
    errors: errors
  };
}

function qltdBudgetResolveAllocationContext_(payload, action, meta) {
  let warnings = [];
  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) return { error: qltdBudgetAllocationFromBudgetError_(action, projectsResult.error) };
  warnings = warnings.concat(projectsResult.warnings || []);

  const project = qltdBudgetFindProjectByCode_(projectsResult.projects, payload.projectCode);
  if (!project || project.status !== 'ACTIVE') {
    return {
      error: qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, null, warnings, [{
        code: 'PROJECT_NOT_FOUND',
        message: 'Khong tim thay du an hoac du an khong active.'
      }], meta)
    };
  }
  if (!project.masterSpreadsheetId) {
    return {
      error: qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, null, warnings, [{
        code: 'MASTER_SPREADSHEET_ID_MISSING',
        message: 'Du an chua co MasterSpreadsheetId.'
      }], meta)
    };
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) return { error: qltdBudgetAllocationFromBudgetError_(action, deptsResult.error) };
  warnings = warnings.concat(deptsResult.warnings || []);

  const projectDepts = deptsResult.departments.filter(function(dept) {
    return dept.projectCode === payload.projectCode && dept.status === 'ACTIVE';
  });
  const dept = qltdBudgetFindProjectDept_(projectDepts, payload.deptCode);
  if (!dept) {
    return {
      error: qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, null, warnings, [{
        code: 'PROJECT_DEPT_NOT_FOUND',
        message: 'Khong tim thay phong/ban active cua du an.'
      }], meta)
    };
  }

  return {
    project: project,
    dept: dept,
    warnings: warnings,
    error: null
  };
}

function qltdBudgetResolveAllocationSource_(project, payload, action, meta, warnings) {
  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(project.masterSpreadsheetId);
  } catch (error) {
    return {
      error: qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, null, warnings || [], [{
        code: 'MASTER_SPREADSHEET_OPEN_FAILED',
        message: error.message || String(error)
      }], meta)
    };
  }

  return payload.sourceType === 'TASK_DIRECT'
    ? qltdBudgetResolveTaskDirectSource_(spreadsheet, project, payload, action, meta, warnings)
    : qltdBudgetResolveNonTaskSource_(spreadsheet, project, payload, action, meta, warnings);
}

function qltdBudgetResolveTaskDirectSource_(spreadsheet, project, payload, action, meta, warnings) {
  const sheet = spreadsheet.getSheetByName('Cong_viec');
  if (!sheet) {
    return qltdBudgetAllocationSourceError_(action, 'ALLOCATION_SOURCE_NOT_FOUND', 'Khong tim thay sheet Cong_viec trong Master.', meta, warnings);
  }
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, 4);
  const missing = qltdBudgetFindMissingAnyHeaders_(parsed.headerMap, [
    ['Ma cong viec Master', 'Ma cong viec'],
    ['Tran chi phi truc tiep'],
    ['Du thu ke hoach'],
    ['Trang thai ngan sach']
  ]);
  if (missing.length) {
    return qltdBudgetAllocationSourceError_(action, 'ALLOCATION_SOURCE_NOT_FOUND', 'Cong_viec thieu header nguon ngan sach.', meta, warnings, {
      missingHeaders: missing
    });
  }

  const match = qltdBudgetFindMasterSourceRow_(parsed, payload.sourceCode);
  if (!match) {
    return qltdBudgetAllocationSourceError_(action, 'ALLOCATION_SOURCE_NOT_FOUND', 'Khong tim thay ma cong viec Master trong Cong_viec.', meta, warnings);
  }

  const row = match.raw;
  const amountHeader = payload.flowType === 'CHI' ? 'Tran chi phi truc tiep' : 'Du thu ke hoach';
  const sourceAmount = qltdBudgetNormalizeSourceAmount_(qltdBudgetGetCell_(row, parsed.headerMap, amountHeader, ''));
  if (sourceAmount.error) {
    return qltdBudgetAllocationSourceError_(action, sourceAmount.error.code, sourceAmount.error.message, meta, warnings, {
      sourceCode: payload.sourceCode,
      sourceSheet: sheet.getName(),
      sourceRowNumber: match.rowNumber,
      amountHeader: amountHeader
    });
  }
  const sourceStatus = String(qltdBudgetGetCell_(row, parsed.headerMap, 'Trang thai ngan sach', '') || '').trim();
  return {
    source: {
      sourceType: payload.sourceType,
      sourceCode: payload.sourceCode,
      sourceName: String(qltdBudgetGetCellAny_(row, parsed.headerMap, ['Noi dung cong viec', 'Cong viec', 'Ten cong viec'], '') || '').trim(),
      flowType: payload.flowType,
      sourceStatus: sourceStatus,
      sourceAmount: sourceAmount.value,
      masterSpreadsheetId: project.masterSpreadsheetId,
      sourceSheet: sheet.getName(),
      sourceRowNumber: match.rowNumber
    },
    error: null
  };
}

function qltdBudgetResolveNonTaskSource_(spreadsheet, project, payload, action, meta, warnings) {
  const sheet = spreadsheet.getSheetByName('NS_Khong_Gan_CV');
  if (!sheet) {
    return qltdBudgetAllocationSourceError_(action, 'ALLOCATION_SOURCE_NOT_FOUND', 'Khong tim thay sheet NS_Khong_Gan_CV trong Master.', meta, warnings);
  }
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, 4);
  const missing = qltdBudgetFindMissingAnyHeaders_(parsed.headerMap, [
    ['Ma nguon ngan sach'],
    ['Ten nguon ngan sach'],
    ['Phong/Ban chu tri'],
    ['Huong dong tien'],
    ['Gia tri ke hoach'],
    ['Trang thai ngan sach']
  ]);
  if (missing.length) {
    return qltdBudgetAllocationSourceError_(action, 'ALLOCATION_SOURCE_NOT_FOUND', 'NS_Khong_Gan_CV thieu header nguon ngan sach.', meta, warnings, {
      missingHeaders: missing
    });
  }

  const match = (parsed.rows || []).filter(function(item) {
    return qltdBudgetNormalizeCode_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'Ma nguon ngan sach', '')) === qltdBudgetNormalizeCode_(payload.sourceCode);
  })[0];
  if (!match) {
    return qltdBudgetAllocationSourceError_(action, 'ALLOCATION_SOURCE_NOT_FOUND', 'Khong tim thay ma nguon ngan sach trong NS_Khong_Gan_CV.', meta, warnings);
  }

  const row = match.raw;
  const sourceFlow = qltdBudgetNormalizeFlowType_(qltdBudgetGetCell_(row, parsed.headerMap, 'Huong dong tien', '')).value || '';
  if (sourceFlow !== payload.flowType) {
    return qltdBudgetAllocationSourceError_(action, 'ALLOCATION_FLOW_MISMATCH', 'Huong dong tien allocation khong khop nguon NON_TASK.', meta, warnings);
  }

  const sourceStatus = String(qltdBudgetGetCell_(row, parsed.headerMap, 'Trang thai ngan sach', '') || '').trim();
  const sourceAmount = qltdBudgetNormalizeSourceAmount_(qltdBudgetGetCell_(row, parsed.headerMap, 'Gia tri ke hoach', ''));
  if (sourceAmount.error) {
    return qltdBudgetAllocationSourceError_(action, sourceAmount.error.code, sourceAmount.error.message, meta, warnings, {
      sourceCode: payload.sourceCode,
      sourceSheet: sheet.getName(),
      sourceRowNumber: match.rowNumber,
      amountHeader: 'Gia tri ke hoach'
    });
  }
  return {
    source: {
      sourceType: payload.sourceType,
      sourceCode: payload.sourceCode,
      sourceName: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ten nguon ngan sach', '') || '').trim(),
      flowType: sourceFlow,
      sourceStatus: sourceStatus,
      sourceAmount: sourceAmount.value,
      masterSpreadsheetId: project.masterSpreadsheetId,
      sourceSheet: sheet.getName(),
      sourceRowNumber: match.rowNumber
    },
    error: null
  };
}

function qltdBudgetBuildAllocationCapacity_(allocations, payload, source, current) {
  let committed = 0;
  let reserved = 0;
  (allocations || []).forEach(function(item) {
    if (qltdBudgetNormalizeCode_(item.allocationCode) === qltdBudgetNormalizeCode_(payload.allocationCode)) return;
    if (item.projectCode !== payload.projectCode) return;
    if (item.sourceType !== payload.sourceType) return;
    if (qltdBudgetNormalizeCode_(item.sourceCode) !== qltdBudgetNormalizeCode_(payload.sourceCode)) return;
    if (item.flowType !== payload.flowType) return;
    if (item.status === 'CONFIRMED') committed += Number(item.allocatedAmount || 0);
    if (item.status === 'DRAFT' || item.status === 'CONFIRMED') reserved += Number(item.allocatedAmount || 0);
  });

  const proposedAmount = payload.status === 'CANCELLED' ? 0 : Number(payload.amount || 0);
  const availableBefore = Number(source.sourceAmount || 0) - reserved;
  return {
    sourceAmount: Number(source.sourceAmount || 0),
    committedAmount: committed,
    reservedAmount: reserved,
    currentAllocationAmount: current ? Number(current.allocatedAmount || 0) : 0,
    proposedAmount: proposedAmount,
    availableBefore: availableBefore,
    availableAfter: availableBefore - proposedAmount
  };
}

function qltdBudgetValidateAllocationTransition_(current, payload) {
  if (!current) {
    if (payload.status === 'CANCELLED') {
      return {
        code: 'ALLOCATION_CANCELLED_IMMUTABLE',
        message: 'Allocation moi khong duoc tao truc tiep o trang thai Huy.'
      };
    }
    return null;
  }

  if (current.status === 'CANCELLED') {
    return {
      code: 'ALLOCATION_CANCELLED_IMMUTABLE',
      message: 'Allocation da Huy khong duoc khoi phuc hoac sua.'
    };
  }

  const identityChanged = current.projectCode !== payload.projectCode ||
    current.sourceType !== payload.sourceType ||
    qltdBudgetNormalizeCode_(current.sourceCode) !== qltdBudgetNormalizeCode_(payload.sourceCode) ||
    qltdBudgetNormalizeCode_(current.deptCode) !== qltdBudgetNormalizeCode_(payload.deptCode) ||
    current.flowType !== payload.flowType;

  if (current.status === 'CONFIRMED') {
    if (payload.status !== 'CANCELLED') {
      if (identityChanged || Number(current.allocatedAmount || 0) !== Number(payload.amount || 0)) {
        return {
          code: 'ALLOCATION_CONFIRMED_IMMUTABLE',
          message: 'Allocation da chot khong duoc sua source/dept/flow/amount.'
        };
      }
      return {
        code: 'ALLOCATION_CONFIRMED_IMMUTABLE',
        message: 'Allocation da chot chi duoc chuyen sang Huy trong STEP 4C.1.'
      };
    }
    return identityChanged ? {
      code: 'ALLOCATION_CONFIRMED_IMMUTABLE',
      message: 'Khi Huy allocation da chot, source/dept/flow phai giu nguyen.'
    } : null;
  }

  if (current.status === 'DRAFT' && identityChanged) {
    return {
      code: 'ALLOCATION_CONFIRMED_IMMUTABLE',
      message: 'Allocation Nhap chi duoc sua gia tri/note/status trong STEP 4C.1.'
    };
  }

  return null;
}

function qltdBudgetWriteAllocationRow_(payload, previewData) {
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS);
  if (!sheet) {
    const error = new Error('Khong tim thay CENTRAL_NS_Allocations.');
    error.code = 'ALLOCATIONS_SHEET_NOT_FOUND';
    throw error;
  }

  const schema = qltdBudgetGetSheetSchema_(QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS);
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, schema.headerRow);
  const missing = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_BUDGET_ALLOCATIONS_HEADERS);
  if (missing.length) {
    const error = new Error('CENTRAL_NS_Allocations thieu header.');
    error.code = 'ALLOCATIONS_HEADER_MISSING';
    error.details = { missingHeaders: missing };
    throw error;
  }

  const normalized = qltdBudgetNormalizeAllocationPayload_(payload, 'budget_upsertAllocation').value;
  const existingMatches = (parsed.rows || []).map(function(item) {
    return {
      item: item,
      allocation: qltdBudgetAllocationRowToObject_(item.raw, parsed.headerMap, item.rowNumber)
    };
  }).filter(function(entry) {
    return qltdBudgetNormalizeCode_(entry.allocation.allocationCode) === qltdBudgetNormalizeCode_(normalized.allocationCode);
  });

  if (existingMatches.length > 1) {
    const error = new Error('Ma phan bo bi trung.');
    error.code = 'ALLOCATION_CODE_DUPLICATE';
    error.details = { rowNumbers: existingMatches.map(function(entry) { return entry.allocation.rowNumber; }) };
    throw error;
  }

  const current = existingMatches.length ? existingMatches[0].allocation : null;
  const allocation = {
    allocationCode: normalized.allocationCode,
    projectCode: normalized.projectCode,
    sourceType: normalized.sourceType,
    sourceCode: normalized.sourceCode,
    deptCode: previewData.allocation.deptCode,
    deptName: previewData.allocation.deptName,
    flowType: normalized.flowType,
    allocatedAmount: normalized.amount,
    status: normalized.status,
    note: normalized.note
  };

  if (current) {
    allocation.projectCode = current.projectCode;
    allocation.sourceType = current.sourceType;
    allocation.sourceCode = current.sourceCode;
    allocation.deptCode = current.deptCode;
    allocation.deptName = current.deptName || allocation.deptName;
    allocation.flowType = current.flowType;
    if (current.status === 'CONFIRMED' && normalized.status === 'CANCELLED') {
      allocation.allocatedAmount = current.allocatedAmount;
    }
  }

  const rowObject = qltdBudgetAllocationToSheetObject_(allocation);
  const rowValues = qltdBudgetMapObjectToHeaderRow_(rowObject, parsed.headers);
  const rowNumber = current ? current.rowNumber : Math.max(sheet.getLastRow() + 1, schema.headerRow + 1);
  sheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);

  return {
    rowNumber: rowNumber,
    created: !current,
    allocation: allocation
  };
}

function qltdBudgetAllocationToSheetObject_(allocation) {
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
    'Ghi chu': allocation.note || ''
  };
}

function qltdBudgetFindAllocationDuplicates_(allocations, allocationCode) {
  const matches = (allocations || []).filter(function(item) {
    return qltdBudgetNormalizeCode_(item.allocationCode) === qltdBudgetNormalizeCode_(allocationCode);
  });
  return {
    duplicate: matches.length > 1,
    current: matches.length === 1 ? matches[0] : null,
    rowNumbers: matches.map(function(item) {
      return item.rowNumber;
    })
  };
}

function qltdBudgetNormalizeAllocationFilter_(params) {
  const errors = [];
  const hasSourceType = String(params.sourceType || '').trim() !== '';
  const hasFlowType = String(params.flowType || '').trim() !== '';
  const hasStatus = String(params.status || '').trim() !== '';
  const sourceTypeResult = hasSourceType ? qltdBudgetNormalizeAllocationSourceType_(params.sourceType) : { value: '', error: null };
  const flowTypeResult = hasFlowType ? qltdBudgetNormalizeFlowType_(params.flowType) : { value: '', error: null };
  const statusResult = hasStatus ? qltdBudgetNormalizeAllocationStatus_(params.status) : { value: '', error: null };
  if (sourceTypeResult.error) errors.push(sourceTypeResult.error);
  if (flowTypeResult.error) errors.push(flowTypeResult.error);
  if (statusResult.error) errors.push(statusResult.error);
  const sourceType = sourceTypeResult.value || '';
  const flowType = flowTypeResult.value || '';
  const status = statusResult.value || '';
  const projectCode = qltdBudgetNormalizeCode_(params.projectCode);
  const deptCode = String(params.deptCode || '').trim();
  const sourceCode = String(params.sourceCode || '').trim();
  return {
    projectCode: projectCode,
    deptCode: deptCode,
    sourceType: sourceType,
    sourceCode: sourceCode,
    flowType: flowType,
    status: status,
    errors: errors,
    meta: {
      projectCode: projectCode,
      deptCode: deptCode,
      sourceType: sourceType,
      sourceCode: sourceCode,
      flowType: flowType,
      status: status
    }
  };
}

function qltdBudgetFindMasterSourceRow_(parsed, sourceCode) {
  const target = qltdBudgetNormalizeCode_(sourceCode);
  return (parsed.rows || []).filter(function(item) {
    const code = String(qltdBudgetGetCellAny_(item.raw, parsed.headerMap, ['Ma cong viec Master', 'Ma cong viec'], '') || '').trim();
    return qltdBudgetNormalizeCode_(code) === target;
  })[0] || null;
}

function qltdBudgetGetCellAny_(row, headerMap, headerNames, fallback) {
  for (let index = 0; index < (headerNames || []).length; index += 1) {
    const headerName = headerNames[index];
    if (qltdBudgetFindHeaderIndex_(headerMap, headerName) >= 0) {
      return qltdBudgetGetCell_(row, headerMap, headerName, fallback);
    }
  }
  return fallback === undefined ? '' : fallback;
}

function qltdBudgetFindMissingAnyHeaders_(headerMap, groups) {
  const missing = [];
  (groups || []).forEach(function(group) {
    const found = group.some(function(header) {
      return qltdBudgetFindHeaderIndex_(headerMap, header) >= 0;
    });
    if (!found) missing.push(group[0]);
  });
  return missing;
}

function qltdBudgetAllocationSourceError_(action, code, message, meta, warnings, details) {
  return {
    source: null,
    error: qltdBudgetAllocationResponse_(false, 'VALIDATION_ERROR', action, null, warnings || [], [Object.assign({
      code: code,
      message: message || code
    }, details || {})], meta || {})
  };
}

function qltdBudgetBuildAllocationEmptyPreview_(payload) {
  return {
    source: null,
    allocation: {
      allocationCode: payload.allocationCode || '',
      deptCode: payload.deptCode || '',
      deptName: '',
      amount: payload.amount || 0,
      status: payload.status || ''
    },
    capacity: {
      sourceAmount: 0,
      committedAmount: 0,
      reservedAmount: 0,
      currentAllocationAmount: 0,
      proposedAmount: payload.amount || 0,
      availableBefore: 0,
      availableAfter: 0
    },
    canSave: false,
    canConfirm: false
  };
}

function qltdBudgetAllocationFindRequestLog_(requestId) {
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.SYS_SYNC_LOG);
  if (!sheet) return { found: false };
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, 4);
  const target = String(requestId || '').trim();
  for (let index = 0; index < (parsed.rows || []).length; index += 1) {
    const row = parsed.rows[index].raw;
    const action = String(qltdBudgetGetCell_(row, parsed.headerMap, 'Hanh dong', '') || '').trim();
    const note = String(qltdBudgetGetCell_(row, parsed.headerMap, 'Loi/Ghi chu', '') || '').trim();
    const tokens = qltdBudgetAllocationParseLogNote_(note);
    if (action === 'BUDGET_ALLOCATION_UPSERT' && tokens.requestId === target) {
      return {
        found: true,
        rowNumber: parsed.rows[index].rowNumber,
        status: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ket qua', '') || '').trim().toUpperCase(),
        tokens: tokens
      };
    }
  }
  return { found: false };
}

function qltdBudgetAllocationRequestStatusResponse_(log, action, meta) {
  const status = String(log.status || '').trim().toUpperCase();
  const data = {
    requestId: meta && meta.requestId || log.tokens.requestId || '',
    duplicate: true,
    syncLogRowNumber: log.rowNumber,
    logStatus: status
  };
  if (status === 'SUCCESS') {
    return qltdBudgetAllocationResponse_(true, 'ALREADY_PROCESSED', action, data, [], [], meta);
  }
  if (status === 'PENDING') {
    return qltdBudgetAllocationResponse_(false, 'REQUEST_IN_PROGRESS', action, data, [], [{
      code: 'REQUEST_IN_PROGRESS',
      message: 'requestId dang duoc xu ly.'
    }], meta);
  }
  if (status === 'ERROR') {
    return qltdBudgetAllocationResponse_(false, 'RETRY_BLOCKED', action, data, [], [{
      code: 'RETRY_BLOCKED',
      message: 'requestId da loi; can tao requestId moi de retry.'
    }], meta);
  }
  return qltdBudgetAllocationResponse_(false, 'REQUEST_IN_PROGRESS', action, data, [], [{
    code: 'REQUEST_LOG_STATUS_UNKNOWN',
    message: 'Trang thai requestId trong SYS_Sync_Log khong xac dinh.'
  }], meta);
}

function qltdBudgetAllocationAppendPendingLog_(requestId, email, previewData, meta) {
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.SYS_SYNC_LOG);
  if (!sheet) {
    const missing = new Error('Khong tim thay SYS_Sync_Log.');
    missing.code = 'IDEMPOTENCY_PENDING_FAILED';
    throw missing;
  }
  const headers = qltdBudgetSyncLogHeaders_();
  const actualHeaders = sheet.getRange(4, 1, 1, headers.length).getValues()[0];
  qltdBudgetRequireSyncLogHeaders_(actualHeaders, headers);
  const allocation = previewData && previewData.allocation || {};
  const source = previewData && previewData.source || {};
  const rowNumber = sheet.getLastRow() + 1;
  const row = [
    qltdBudgetNowIso_(),
    email || 'SYSTEM',
    'BUDGET_ALLOCATION_UPSERT',
    meta && meta.projectCode || source.projectCode || '',
    '',
    QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS,
    0,
    'PENDING',
    [
      'requestId=' + requestId,
      'allocationCode=' + (allocation.allocationCode || meta && meta.allocationCode || ''),
      'status=PENDING'
    ].join('; ')
  ];
  try {
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  } catch (error) {
    error.code = 'IDEMPOTENCY_PENDING_FAILED';
    throw error;
  }
  return {
    sheet: sheet,
    rowNumber: rowNumber,
    headers: headers
  };
}

function qltdBudgetAllocationMarkLogStatus_(log, status, note) {
  const headers = log.headers || qltdBudgetSyncLogHeaders_();
  const statusColumn = qltdBudgetFindHeaderIndex_(qltdBudgetBuildHeaderMap_(headers), 'Ket qua') + 1;
  const noteColumn = qltdBudgetFindHeaderIndex_(qltdBudgetBuildHeaderMap_(headers), 'Loi/Ghi chu') + 1;
  const countColumn = qltdBudgetFindHeaderIndex_(qltdBudgetBuildHeaderMap_(headers), 'So dong xu ly') + 1;
  if (!statusColumn || !noteColumn || !countColumn) {
    const error = new Error('SYS_Sync_Log thieu cot idempotency.');
    error.code = 'SYNC_LOG_HEADER_MISSING';
    throw error;
  }
  log.sheet.getRange(log.rowNumber, countColumn, 1, 1).setValues([[status === 'SUCCESS' ? 1 : 0]]);
  log.sheet.getRange(log.rowNumber, statusColumn, 1, 1).setValues([[status]]);
  log.sheet.getRange(log.rowNumber, noteColumn, 1, 1).setValues([[note || '']]);
}

function qltdBudgetAllocationBuildLogNote_(requestId, write, status) {
  return [
    'requestId=' + requestId,
    'allocationCode=' + write.allocation.allocationCode,
    'rowNumber=' + write.rowNumber,
    'created=' + write.created,
    'status=' + status
  ].join('; ');
}

function qltdBudgetAllocationParseLogNote_(note) {
  const tokens = {};
  String(note || '').split(';').forEach(function(part) {
    const text = String(part || '').trim();
    const separatorIndex = text.indexOf('=');
    if (separatorIndex <= 0) return;
    const key = text.slice(0, separatorIndex).trim();
    const value = text.slice(separatorIndex + 1).trim();
    if (key) tokens[key] = value;
  });
  return tokens;
}

function qltdBudgetAllocationFromBudgetError_(action, response) {
  return qltdBudgetAllocationResponse_(false, response && response.apiStatus || 'ERROR', action, null, response && response.warnings || [], response && response.errors || [{
    code: 'ERROR',
    message: 'Loi khong xac dinh.'
  }], response && response.meta || {});
}

function qltdBudgetAllocationResponse_(success, apiStatus, action, data, warnings, errors, meta) {
  return {
    success: !!success,
    apiStatus: apiStatus || (success ? 'OK' : 'VALIDATION_ERROR'),
    source: QLTD_BUDGET_ALLOCATION_SOURCE,
    data: success ? (data || {}) : data,
    warnings: warnings || [],
    errors: errors || [],
    meta: Object.assign({
      action: action || '',
      generatedAt: qltdBudgetNowIso_()
    }, meta || {})
  };
}
