const QLTD_PB_DETAIL_TASK_SOURCE = 'pb_detail_task_v1';
const QLTD_PB_DETAIL_SCHEMA_VERSION = 'PB_DETAIL_V1';
const QLTD_PB_DETAIL_LAST_COLUMN = 18;
const QLTD_PB_DETAIL_ID_COLUMN = 16;
const QLTD_PB_DETAIL_DEFAULT_STATUS = 'Chưa bắt đầu';
const QLTD_PB_DETAIL_ROW_TYPE_CONTEXT = 'CONTEXT';
const QLTD_PB_DETAIL_ROW_TYPE_MASTER = 'MASTER';
const QLTD_PB_DETAIL_ROW_TYPE_SLOT = 'DETAIL_SLOT';
const QLTD_PB_DETAIL_ROW_TYPE_DETAIL = 'PB_DETAIL';

const QLTD_PB_DETAIL_HEADERS = {
  stt: 'STT',
  taskName: 'Noi dung cong viec',
  planStart: 'Ngay bat dau ke hoach',
  planFinish: 'Ngay ket thuc ke hoach',
  budgetPlan: 'Ke hoach ngan sach',
  status: 'Trang thai thuc hien',
  actualStart: 'Bat dau thuc te',
  actualFinish: 'Hoan thanh thuc te',
  budgetActual: 'Ngan sach thuc te',
  owner: 'Nguoi chu tri',
  coordinator: 'Nguoi phoi hop',
  condition: 'Dieu kien dau vao',
  note: 'Ghi chu cap nhat',
  masterTaskCode: 'Ma cong viec master',
  rowType: 'Loai dong',
  detailTaskId: 'DetailTaskId',
  progress: '% Hoan thanh',
  weight: 'Trong so'
};

const QLTD_PB_DETAIL_REQUIRED_KEYS = [
  'stt', 'taskName', 'planStart', 'planFinish', 'budgetPlan', 'status',
  'actualStart', 'actualFinish', 'budgetActual', 'owner', 'coordinator',
  'condition', 'note', 'masterTaskCode', 'rowType', 'detailTaskId',
  'progress', 'weight'
];

const QLTD_PB_DETAIL_EDITABLE_FIELDS = [
  'taskName', 'planStart', 'planFinish', 'budgetPlan', 'status',
  'actualStart', 'actualFinish', 'budgetActual', 'owner', 'coordinator',
  'condition', 'note', 'progress', 'weight'
];

function qltdWorkGetDetailTasks_(params) {
  const action = 'work_getDetailTasks';
  const meta = {};
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_PB_DETAIL_TASK_SOURCE, meta);
  if (auth.error) return auth.error;

  const context = qltdPbDetailResolveContext_(action, params || {}, meta);
  if (context.error) return context.error;
  if (!qltdWorkCanReadDept_(auth.user, context.deptCode)) {
    return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'PERMISSION_DENIED', 'User cannot read this dept.', context.meta, context.warnings);
  }

  const masterTaskCode = qltdPbDetailNormalizeTaskCode_((params || {}).masterTaskCode);
  if (!masterTaskCode) {
    return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'MASTER_TASK_CODE_REQUIRED', 'masterTaskCode is required.', context.meta, context.warnings);
  }

  const sheetContext = qltdPbDetailBuildSheetContext_(action, context);
  if (sheetContext.error) return sheetContext.error;

  const block = qltdPbDetailFindMasterBlock_(sheetContext, masterTaskCode);
  if (block.error) {
    return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, block.error.code, block.error.message, context.meta, sheetContext.warnings);
  }

  return qltdWorkOk_(QLTD_PB_DETAIL_TASK_SOURCE, action, {
    projectCode: context.projectCode,
    deptCode: context.deptCode,
    sheetName: sheetContext.sheet.getName(),
    masterTask: qltdPbDetailBuildMasterDto_(block.masterRow, sheetContext.columns),
    detailTasks: qltdPbDetailListDetailsForBlock_(sheetContext, block)
  }, sheetContext.warnings, context.meta);
}

function qltdWorkCreateDetailTask_(payload) {
  return qltdPbDetailWriteWithLock_('work_createDetailTask', payload || {}, function(action, context, sheetContext, warnings) {
    const validation = qltdPbDetailValidateCreatePayload_(payload || {}, context, warnings);
    if (validation.error) return validation.error;

    const fileIdScan = qltdPbDetailScanIdsInFile_(action, context, sheetContext);
    warnings.push.apply(warnings, fileIdScan.warnings || []);
    if (fileIdScan.error) return fileIdScan.error;

    const block = qltdPbDetailFindMasterBlock_(sheetContext, validation.masterTaskCode);
    if (block.error) {
      return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, block.error.code, block.error.message, context.meta, warnings);
    }

    const detailTaskId = qltdPbDetailGenerateId_(fileIdScan.idSet, context.projectCode, context.deptCode);
    const target = qltdPbDetailFindCreateTarget_(sheetContext, block);
    const wbs = qltdPbDetailBuildNextWbs_(block, warnings);
    const row = qltdPbDetailBuildCreateRow_(sheetContext, validation, block.masterTaskCode, detailTaskId, wbs);
    let insertedRowNumber = 0;

    try {
      if (target.insertAfterRow) {
        sheetContext.sheet.insertRowsAfter(target.insertAfterRow, 1);
        insertedRowNumber = target.rowNumber;
        qltdPbDetailCopyFormatAndValidation_(sheetContext.sheet, target.formatSourceRow, target.rowNumber);
      }
      sheetContext.sheet.getRange(target.rowNumber, 1, 1, QLTD_PB_DETAIL_LAST_COLUMN).setValues([row]);
    } catch (error) {
      if (insertedRowNumber) {
        try {
          sheetContext.sheet.deleteRow(insertedRowNumber);
        } catch (rollbackError) {
          warnings.push(qltdWorkWarning_('DETAIL_TASK_INSERT_ROLLBACK_FAILED', qltdBudgetSafeErrorMessage_(rollbackError), {
            rowNumber: insertedRowNumber
          }));
        }
      }
      return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'DETAIL_TASK_CREATE_ERROR', qltdBudgetSafeErrorMessage_(error), context.meta, warnings);
    }

    warnings.push(qltdWorkWarning_('DETAIL_TASK_LOG_SKIPPED', 'Budget log helper is not available in this repo.'));
    return qltdWorkOk_(QLTD_PB_DETAIL_TASK_SOURCE, action, {
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      sheetName: sheetContext.sheet.getName(),
      masterTaskCode: block.masterTaskCode,
      detailTaskId: detailTaskId,
      rowNumber: target.rowNumber,
      wbs: wbs
    }, warnings, context.meta);
  });
}

function qltdWorkUpdateDetailTask_(payload) {
  return qltdPbDetailWriteWithLock_('work_updateDetailTask', payload || {}, function(action, context, sheetContext, warnings) {
    const validation = qltdPbDetailValidateUpdatePayload_(payload || {}, context, warnings);
    if (validation.error) return validation.error;

    const fileIdScan = qltdPbDetailScanIdsInFile_(action, context, sheetContext);
    warnings.push.apply(warnings, fileIdScan.warnings || []);
    if (fileIdScan.error) return fileIdScan.error;

    const matches = qltdPbDetailFindById_(sheetContext, validation.detailTaskId);
    if (!matches.length) {
      return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'DETAIL_TASK_NOT_FOUND', 'Detail task not found.', context.meta, warnings);
    }
    if (matches.length > 1) {
      return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'DETAIL_TASK_DUPLICATE', 'DetailTaskId is duplicated.', context.meta, warnings, {
        detailTaskId: validation.detailTaskId
      });
    }

    const target = matches[0];
    const row = target.values.slice();
    qltdPbDetailApplyUpdates_(row, sheetContext.columns, validation.updates);
    const mergedDateError = qltdPbDetailValidateMergedDateRow_(row, sheetContext.columns);
    if (mergedDateError) {
      return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, mergedDateError.code, mergedDateError.message, context.meta, warnings, mergedDateError.extra);
    }
    sheetContext.sheet.getRange(target.rowNumber, 1, 1, QLTD_PB_DETAIL_LAST_COLUMN).setValues([row]);

    warnings.push(qltdWorkWarning_('DETAIL_TASK_LOG_SKIPPED', 'Budget log helper is not available in this repo.'));
    return qltdWorkOk_(QLTD_PB_DETAIL_TASK_SOURCE, action, {
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      sheetName: sheetContext.sheet.getName(),
      detailTaskId: validation.detailTaskId,
      rowNumber: target.rowNumber
    }, warnings, context.meta);
  });
}

function qltdPbDetailWriteWithLock_(action, payload, handler) {
  const meta = {};
  const auth = qltdWorkAuthUser_(payload && payload.email, action, QLTD_PB_DETAIL_TASK_SOURCE, meta);
  if (auth.error) return auth.error;

  const context = qltdPbDetailResolveContext_(action, payload || {}, meta);
  if (context.error) return context.error;
  if (!qltdWorkCanManageDept_(auth.user, context.deptCode)) {
    return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'PERMISSION_DENIED', 'User cannot manage this dept.', context.meta, context.warnings);
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(QLTD_WORK_WRITE_LOCK_TIMEOUT_MS);
    if (!locked) {
      return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'LOCK_TIMEOUT', 'Cannot acquire write lock.', context.meta, context.warnings);
    }
    const sheetContext = qltdPbDetailBuildSheetContext_(action, context);
    if (sheetContext.error) return sheetContext.error;
    return handler(action, context, sheetContext, sheetContext.warnings.slice());
  } catch (error) {
    return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'DETAIL_TASK_WRITE_ERROR', qltdBudgetSafeErrorMessage_(error), context.meta, context.warnings);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdPbDetailResolveContext_(action, params, baseMeta) {
  const resolved = qltdWorkResolveProjectDept_(action, params, QLTD_PB_DETAIL_TASK_SOURCE, {
    requireDeptSpreadsheet: true,
    meta: baseMeta || {}
  });
  if (resolved.error) return {
    error: resolved.error
  };

  const meta = Object.assign({}, baseMeta || {}, {
    projectCode: resolved.projectCode,
    deptCode: resolved.deptCode
  });
  return Object.assign({}, resolved, {
    meta: meta,
    warnings: resolved.warnings || [],
    error: null
  });
}

function qltdPbDetailBuildSheetContext_(action, context) {
  const warnings = (context.warnings || []).slice();
  const spreadsheet = SpreadsheetApp.openById(context.project.deptSpreadsheetId);
  const sheetResult = qltdBudgetFindDeptSheet_(spreadsheet, context.dept, context.requestedDeptCode);
  warnings.push.apply(warnings, sheetResult.warnings || []);
  if (!sheetResult.sheet) {
    return {
      error: qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'DEPT_SHEET_NOT_FOUND', 'Dept sheet not found.', context.meta, warnings)
    };
  }

  const schema = qltdPbDetailCheckSchema_(spreadsheet, sheetResult.sheet);
  warnings.push.apply(warnings, schema.warnings || []);
  if (schema.error) {
    return {
      error: qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, schema.error.code, schema.error.message, context.meta, warnings, schema.error.extra)
    };
  }

  const lastRow = sheetResult.sheet.getLastRow();
  const lastColumn = QLTD_PB_DETAIL_LAST_COLUMN;
  const values = lastRow > schema.headerRow ? sheetResult.sheet.getRange(schema.headerRow + 1, 1, lastRow - schema.headerRow, lastColumn).getValues() : [];

  return {
    spreadsheet: spreadsheet,
    sheet: sheetResult.sheet,
    headerRow: schema.headerRow,
    headerMap: schema.headerMap,
    columns: schema.columns,
    lastColumn: lastColumn,
    dataRows: values.map(function(row, index) {
      return {
        rowNumber: schema.headerRow + 1 + index,
        values: row,
        rowType: qltdPbDetailNormalizeRowType_(row[schema.columns.rowType]),
        masterTaskCode: qltdPbDetailNormalizeTaskCode_(row[schema.columns.masterTaskCode]),
        detailTaskId: String(row[schema.columns.detailTaskId] || '').trim()
      };
    }),
    warnings: warnings,
    error: null
  };
}

function qltdPbDetailCheckSchema_(spreadsheet, sheet) {
  const warnings = [];
  const configSheet = spreadsheet.getSheetByName('Cau_hinh_PB');
  if (!configSheet) {
    return {
      error: {
        code: 'PB_SCHEMA_NOT_READY',
        message: 'Cau_hinh_PB sheet is missing.'
      },
      warnings: warnings
    };
  }

  const schemaVersion = qltdPbDetailReadConfigValue_(configSheet, 'PB_SCHEMA_VERSION');
  if (schemaVersion !== QLTD_PB_DETAIL_SCHEMA_VERSION) {
    return {
      error: {
        code: 'PB_SCHEMA_NOT_READY',
        message: 'PB_DETAIL schema is not ready.',
        extra: {
          expectedSchemaVersion: QLTD_PB_DETAIL_SCHEMA_VERSION,
          actualSchemaVersion: schemaVersion || ''
        }
      },
      warnings: warnings
    };
  }

  const maxRows = Math.min(sheet.getLastRow(), 12);
  const maxCols = QLTD_PB_DETAIL_LAST_COLUMN;
  const probeValues = maxRows ? sheet.getRange(1, 1, maxRows, maxCols).getValues() : [];
  for (let rowIndex = 0; rowIndex < probeValues.length; rowIndex += 1) {
    const headerMap = qltdBudgetBuildHeaderMap_(probeValues[rowIndex]);
    const missing = qltdPbDetailFindMissingHeaders_(headerMap);
    const columns = qltdPbDetailBuildColumns_(headerMap);
    const tailMismatch = qltdPbDetailFindTailHeaderMismatch_(columns);
    if (!missing.length && !tailMismatch.length) {
      return {
        headerRow: rowIndex + 1,
        headerMap: headerMap,
        columns: columns,
        lastColumn: maxCols,
        warnings: warnings,
        error: null
      };
    }
  }

  return {
    error: {
      code: 'PB_SCHEMA_NOT_READY',
      message: 'PB_DETAIL headers are missing.',
      extra: {
        requiredHeaders: QLTD_PB_DETAIL_REQUIRED_KEYS.map(function(key) {
          return QLTD_PB_DETAIL_HEADERS[key];
        }),
        requiredTailColumns: 'N:R = Ma cong viec master, Loai dong, DetailTaskId, % Hoan thanh, Trong so'
      }
    },
    warnings: warnings
  };
}

function qltdPbDetailReadConfigValue_(sheet, keyName) {
  const values = sheet.getDataRange().getValues();
  const key = String(keyName || '').trim();
  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0] || '').trim() === key) {
      return String(values[index][1] || '').trim();
    }
  }
  return '';
}

function qltdPbDetailFindMissingHeaders_(headerMap) {
  return QLTD_PB_DETAIL_REQUIRED_KEYS.filter(function(key) {
    return qltdBudgetFindHeaderIndex_(headerMap, QLTD_PB_DETAIL_HEADERS[key]) < 0;
  }).map(function(key) {
    return QLTD_PB_DETAIL_HEADERS[key];
  });
}

function qltdPbDetailBuildColumns_(headerMap) {
  const columns = {};
  QLTD_PB_DETAIL_REQUIRED_KEYS.forEach(function(key) {
    columns[key] = qltdBudgetFindHeaderIndex_(headerMap, QLTD_PB_DETAIL_HEADERS[key]);
  });
  return columns;
}

function qltdPbDetailFindTailHeaderMismatch_(columns) {
  const expected = {
    masterTaskCode: 13,
    rowType: 14,
    detailTaskId: 15,
    progress: 16,
    weight: 17
  };
  return Object.keys(expected).filter(function(key) {
    return columns[key] !== expected[key];
  });
}

function qltdPbDetailFindMasterBlock_(sheetContext, masterTaskCode) {
  const targetCode = qltdPbDetailNormalizeTaskCode_(masterTaskCode);
  const matches = sheetContext.dataRows.filter(function(row) {
    return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_MASTER && row.masterTaskCode === targetCode;
  });
  if (!matches.length) return {
    error: {
      code: 'MASTER_TASK_NOT_FOUND',
      message: 'Master task not found.'
    }
  };
  if (matches.length > 1) return {
    error: {
      code: 'MASTER_TASK_DUPLICATE',
      message: 'Master task is duplicated.'
    }
  };

  const masterRow = matches[0];
  const masterIndex = sheetContext.dataRows.indexOf(masterRow);
  let endIndex = sheetContext.dataRows.length - 1;
  for (let index = masterIndex + 1; index < sheetContext.dataRows.length; index += 1) {
    const rowType = sheetContext.dataRows[index].rowType;
    if (rowType === QLTD_PB_DETAIL_ROW_TYPE_MASTER || rowType === QLTD_PB_DETAIL_ROW_TYPE_CONTEXT) {
      endIndex = index - 1;
      break;
    }
  }

  return {
    masterRow: masterRow,
    masterTaskCode: targetCode,
    rows: sheetContext.dataRows.slice(masterIndex + 1, endIndex + 1),
    endRow: endIndex >= masterIndex ? sheetContext.dataRows[endIndex].rowNumber : masterRow.rowNumber,
    error: null
  };
}

function qltdPbDetailListDetailsForBlock_(sheetContext, block) {
  return block.rows.filter(function(row) {
    return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL && row.masterTaskCode === block.masterTaskCode;
  }).map(function(row) {
    return qltdPbDetailBuildDetailDto_(row, sheetContext.columns);
  });
}

function qltdPbDetailBuildMasterDto_(row, columns) {
  return {
    rowNumber: row.rowNumber,
    wbs: String(row.values[columns.stt] || '').trim(),
    taskName: String(row.values[columns.taskName] || '').trim(),
    masterTaskCode: row.masterTaskCode,
    rowType: row.rowType
  };
}

function qltdPbDetailBuildDetailDto_(row, columns) {
  const values = row.values;
  return {
    rowNumber: row.rowNumber,
    wbs: String(values[columns.stt] || '').trim(),
    taskName: String(values[columns.taskName] || '').trim(),
    planStart: qltdBudgetFormatDate_(values[columns.planStart]),
    planFinish: qltdBudgetFormatDate_(values[columns.planFinish]),
    budgetPlan: qltdBudgetToNumber_(values[columns.budgetPlan]),
    status: String(values[columns.status] || '').trim(),
    actualStart: qltdBudgetFormatDate_(values[columns.actualStart]),
    actualFinish: qltdBudgetFormatDate_(values[columns.actualFinish]),
    budgetActual: qltdBudgetToNumber_(values[columns.budgetActual]),
    owner: String(values[columns.owner] || '').trim(),
    coordinator: String(values[columns.coordinator] || '').trim(),
    condition: String(values[columns.condition] || '').trim(),
    note: String(values[columns.note] || '').trim(),
    masterTaskCode: row.masterTaskCode,
    rowType: row.rowType,
    detailTaskId: String(values[columns.detailTaskId] || '').trim(),
    progress: qltdBudgetToNumber_(values[columns.progress]),
    weight: qltdBudgetToNumber_(values[columns.weight])
  };
}

function qltdPbDetailValidateCreatePayload_(payload, context, warnings) {
  const action = 'work_createDetailTask';
  const fieldError = qltdPbDetailValidateAllowedPayloadFields_(payload, action, context, warnings);
  if (fieldError) return {
    error: fieldError
  };

  const masterTaskCode = qltdPbDetailNormalizeTaskCode_(payload.masterTaskCode);
  const taskName = String(payload.taskName || '').trim();
  if (!masterTaskCode) return {
    error: qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'MASTER_TASK_CODE_REQUIRED', 'masterTaskCode is required.', context.meta, warnings)
  };
  if (!taskName) return {
    error: qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'TASK_NAME_REQUIRED', 'taskName is required.', context.meta, warnings)
  };

  const validation = qltdPbDetailValidateEditableFields_(payload, context, action, warnings, true);
  if (validation.error) return validation;
  validation.masterTaskCode = masterTaskCode;
  validation.updates.taskName = taskName;
  qltdPbDetailApplyCreateDefaults_(validation.updates);
  return validation;
}

function qltdPbDetailValidateUpdatePayload_(payload, context, warnings) {
  const action = 'work_updateDetailTask';
  const fieldError = qltdPbDetailValidateAllowedPayloadFields_(payload, action, context, warnings);
  if (fieldError) return {
    error: fieldError
  };

  const detailTaskId = String(payload.detailTaskId || '').trim();
  if (!detailTaskId) return {
    error: qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'DETAIL_TASK_ID_REQUIRED', 'detailTaskId is required.', context.meta, warnings)
  };

  const validation = qltdPbDetailValidateEditableFields_(payload, context, action, warnings, false);
  if (validation.error) return validation;
  if (!Object.keys(validation.updates).length) return {
    error: qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'NO_UPDATE_FIELDS', 'No allowed update fields.', context.meta, warnings)
  };
  validation.detailTaskId = detailTaskId;
  return validation;
}

function qltdPbDetailValidateAllowedPayloadFields_(payload, action, context, warnings) {
  const allowedContext = action === 'work_createDetailTask'
    ? ['action', 'email', 'projectCode', 'deptCode', 'masterTaskCode']
    : ['action', 'email', 'projectCode', 'deptCode', 'detailTaskId'];
  const allowed = {};
  allowedContext.concat(QLTD_PB_DETAIL_EDITABLE_FIELDS).forEach(function(field) {
    allowed[field] = true;
  });
  const unknownFields = Object.keys(payload || {}).filter(function(field) {
    return !allowed[field];
  });
  if (!unknownFields.length) return null;
  return qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'FIELD_NOT_ALLOWED', 'Detail task payload contains fields outside the allowlist.', context.meta, warnings, {
    unknownFields: unknownFields
  });
}

function qltdPbDetailApplyCreateDefaults_(updates) {
  if (!Object.prototype.hasOwnProperty.call(updates, 'status') || !String(updates.status || '').trim()) {
    updates.status = QLTD_PB_DETAIL_DEFAULT_STATUS;
  }
  if (!Object.prototype.hasOwnProperty.call(updates, 'progress') || String(updates.progress || '').trim() === '') {
    updates.progress = 0;
  }
  if (!Object.prototype.hasOwnProperty.call(updates, 'weight')) updates.weight = '';
  if (!Object.prototype.hasOwnProperty.call(updates, 'budgetPlan')) updates.budgetPlan = '';
  if (!Object.prototype.hasOwnProperty.call(updates, 'budgetActual')) updates.budgetActual = '';
}

function qltdPbDetailValidateEditableFields_(payload, context, action, warnings, isCreate) {
  const updates = {};
  QLTD_PB_DETAIL_EDITABLE_FIELDS.forEach(function(field) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) updates[field] = payload[field];
  });

  if (Object.prototype.hasOwnProperty.call(updates, 'taskName')) {
    updates.taskName = String(updates.taskName || '').trim();
    if (!updates.taskName) return {
      error: qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'TASK_NAME_REQUIRED', 'taskName is required.', context.meta, warnings)
    };
  }

  const dateError = qltdPbDetailValidateDates_(updates);
  if (dateError) return {
    error: qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, dateError.code, dateError.message, context.meta, warnings, dateError.extra)
  };

  const numberError = qltdPbDetailValidateNumbers_(updates);
  if (numberError) return {
    error: qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, numberError.code, numberError.message, context.meta, warnings, numberError.extra)
  };

  const ownerResult = qltdPbDetailResolveAssigneeField_(updates, 'owner', context, action, warnings, true, isCreate);
  if (ownerResult.error) return ownerResult;
  const coordinatorResult = qltdPbDetailResolveAssigneeField_(updates, 'coordinator', context, action, warnings, false, isCreate);
  if (coordinatorResult.error) return coordinatorResult;

  return {
    updates: updates,
    error: null
  };
}

function qltdPbDetailResolveAssigneeField_(updates, fieldName, context, action, warnings, singleOnly, isCreate) {
  if (!Object.prototype.hasOwnProperty.call(updates, fieldName)) {
    if (isCreate) updates[fieldName] = '';
    return {
      error: null
    };
  }

  if (!String(updates[fieldName] || '').trim()) {
    updates[fieldName] = '';
    return {
      error: null
    };
  }

  const resolution = qltdWorkResolveAssignees_(updates[fieldName] || '', context.deptCode);
  if (!resolution.ok) return {
    error: qltdWorkAssigneeResolutionError_(QLTD_PB_DETAIL_TASK_SOURCE, action, fieldName, resolution, context.meta, warnings)
  };
  if (singleOnly && resolution.users.length > 1) return {
    error: qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'OWNER_MULTIPLE_NOT_ALLOWED', 'Owner must be one user only.', context.meta, warnings)
  };
  if (qltdWorkFindAssigneeDeptMismatches_(resolution, context.deptCode).length) return {
    error: qltdWorkAssigneeDeptMismatchError_(QLTD_PB_DETAIL_TASK_SOURCE, action, fieldName, resolution, context.deptCode, context.meta, warnings)
  };

  updates[fieldName] = resolution.canonicalText || String(updates[fieldName] || '').trim();
  return {
    error: null
  };
}

function qltdPbDetailValidateDates_(updates) {
  ['planStart', 'planFinish', 'actualStart', 'actualFinish'].forEach(function(field) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      updates[field] = String(updates[field] || '').trim();
    }
  });

  const fields = ['planStart', 'planFinish', 'actualStart', 'actualFinish'];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (updates[field] && !/^\d{4}-\d{2}-\d{2}$/.test(updates[field])) {
      return {
        code: 'INVALID_DATE',
        message: field + ' must use yyyy-MM-dd.',
        extra: {
          field: field
        }
      };
    }
    if (updates[field]) {
      const parsedDate = qltdPbDetailParseIsoDate_(updates[field]);
      if (!parsedDate) {
        return {
          code: 'INVALID_DATE',
          message: field + ' must be a valid yyyy-MM-dd date.',
          extra: {
            field: field
          }
        };
      }
      updates[field] = parsedDate;
    }
  }
  if (updates.planStart && updates.planFinish && qltdPbDetailDateIso_(updates.planFinish) < qltdPbDetailDateIso_(updates.planStart)) return {
    code: 'INVALID_DATE_RANGE',
    message: 'planFinish must be greater than or equal to planStart.'
  };
  if (updates.actualStart && updates.actualFinish && qltdPbDetailDateIso_(updates.actualFinish) < qltdPbDetailDateIso_(updates.actualStart)) return {
    code: 'INVALID_DATE_RANGE',
    message: 'actualFinish must be greater than or equal to actualStart.'
  };
  return null;
}

function qltdPbDetailParseIsoDate_(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function qltdPbDetailDateIso_(value) {
  if (!value) return '';
  return qltdBudgetFormatDate_(value);
}

function qltdPbDetailValidateMergedDateRow_(row, columns) {
  const planStart = qltdPbDetailDateIso_(row[columns.planStart]);
  const planFinish = qltdPbDetailDateIso_(row[columns.planFinish]);
  const actualStart = qltdPbDetailDateIso_(row[columns.actualStart]);
  const actualFinish = qltdPbDetailDateIso_(row[columns.actualFinish]);

  if (planStart && planFinish && planFinish < planStart) return {
    code: 'INVALID_DATE_RANGE',
    message: 'planFinish must be greater than or equal to planStart.',
    extra: {
      planStart: planStart,
      planFinish: planFinish
    }
  };
  if (actualStart && actualFinish && actualFinish < actualStart) return {
    code: 'INVALID_DATE_RANGE',
    message: 'actualFinish must be greater than or equal to actualStart.',
    extra: {
      actualStart: actualStart,
      actualFinish: actualFinish
    }
  };
  return null;
}

function qltdPbDetailValidateNumbers_(updates) {
  const nonNegativeFields = ['budgetPlan', 'budgetActual'];
  for (let index = 0; index < nonNegativeFields.length; index += 1) {
    const field = nonNegativeFields[index];
    if (Object.prototype.hasOwnProperty.call(updates, field) && String(updates[field] || '').trim() !== '') {
      const value = Number(updates[field]);
      if (isNaN(value) || value < 0) return {
        code: 'INVALID_NUMBER',
        message: field + ' must be a non-negative number.',
        extra: {
          field: field
        }
      };
      updates[field] = value;
    }
  }

  const percentFields = ['progress', 'weight'];
  for (let pIndex = 0; pIndex < percentFields.length; pIndex += 1) {
    const field = percentFields[pIndex];
    if (Object.prototype.hasOwnProperty.call(updates, field) && String(updates[field] || '').trim() !== '') {
      const value = Number(updates[field]);
      if (isNaN(value) || value < 0 || value > 100) return {
        code: 'INVALID_PERCENT',
        message: field + ' must be between 0 and 100.',
        extra: {
          field: field
        }
      };
      updates[field] = value;
    }
  }
  return null;
}

function qltdPbDetailGenerateId_(existing, projectCode, deptCode) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const randomPart = Utilities.getUuid().replace(/-/g, '').toUpperCase().slice(0, 8);
    const candidate = ['DT', qltdPbDetailIdPart_(projectCode), qltdPbDetailIdPart_(deptCode), randomPart].join('-');
    if (!existing[candidate]) return candidate;
  }
  throw new Error('Cannot generate unique DetailTaskId.');
}

function qltdPbDetailFindCreateTarget_(sheetContext, block) {
  const slot = block.rows.find(function(row) {
    return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_SLOT &&
      !String(row.values[sheetContext.columns.taskName] || '').trim() &&
      !String(row.values[sheetContext.columns.detailTaskId] || '').trim();
  });
  if (slot) return {
    rowNumber: slot.rowNumber,
    insertAfterRow: 0,
    formatSourceRow: slot.rowNumber
  };

  return {
    rowNumber: block.endRow + 1,
    insertAfterRow: block.endRow,
    formatSourceRow: qltdPbDetailFindNearestFormatSource_(block)
  };
}

function qltdPbDetailFindNearestFormatSource_(block) {
  for (let index = block.rows.length - 1; index >= 0; index -= 1) {
    const rowType = block.rows[index].rowType;
    if (rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL || rowType === QLTD_PB_DETAIL_ROW_TYPE_SLOT) {
      return block.rows[index].rowNumber;
    }
  }
  return block.masterRow.rowNumber;
}

function qltdPbDetailCopyFormatAndValidation_(sheet, sourceRow, targetRow) {
  const source = sheet.getRange(sourceRow, 1, 1, QLTD_PB_DETAIL_LAST_COLUMN);
  const target = sheet.getRange(targetRow, 1, 1, QLTD_PB_DETAIL_LAST_COLUMN);
  source.copyTo(target, {
    formatOnly: true
  });
  target.setDataValidations(source.getDataValidations());
}

function qltdPbDetailBuildNextWbs_(block, warnings) {
  const parentWbs = String(block.masterRow.values[0] || '').trim();
  const used = {};
  block.rows.forEach(function(row) {
    if (row.rowType !== QLTD_PB_DETAIL_ROW_TYPE_DETAIL) return;
    const match = String(row.values[0] || '').trim().match(/(?:^|\.)D(\d+)$/);
    if (match) used[Number(match[1])] = true;
  });

  let next = 1;
  while (used[next]) next += 1;
  const suffix = 'D' + (next < 10 ? '0' + next : String(next));
  if (!parentWbs) {
    warnings.push(qltdWorkWarning_('PARENT_WBS_MISSING', 'Parent WBS is missing; generated detail WBS without parent prefix.'));
    return suffix;
  }
  return parentWbs + '.' + suffix;
}

function qltdPbDetailBuildCreateRow_(sheetContext, validation, masterTaskCode, detailTaskId, wbs) {
  const row = new Array(QLTD_PB_DETAIL_LAST_COLUMN).fill('');
  const columns = sheetContext.columns;
  row[columns.stt] = wbs;
  row[columns.masterTaskCode] = masterTaskCode;
  row[columns.rowType] = QLTD_PB_DETAIL_ROW_TYPE_DETAIL;
  row[columns.detailTaskId] = detailTaskId;
  qltdPbDetailApplyUpdates_(row, columns, validation.updates);
  return row;
}

function qltdPbDetailApplyUpdates_(row, columns, updates) {
  Object.keys(updates || {}).forEach(function(field) {
    if (columns[field] === undefined || columns[field] < 0) return;
    row[columns[field]] = updates[field];
  });
}

function qltdPbDetailFindById_(sheetContext, detailTaskId) {
  const targetId = String(detailTaskId || '').trim();
  return sheetContext.dataRows.filter(function(row) {
    return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL && row.detailTaskId === targetId;
  });
}

function qltdPbDetailNormalizeTaskCode_(value) {
  return String(value || '').trim();
}

function qltdPbDetailNormalizeRowType_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdPbDetailIdPart_(value) {
  return qltdWorkNormalizeCode_(value).replace(/[^A-Z0-9]/g, '') || 'NA';
}

function qltdPbDetailScanIdsInFile_(action, context, sheetContext) {
  const warnings = [];
  const idSet = {};
  const duplicates = {};
  const sheets = qltdPbDetailListMappedSheets_(context, sheetContext, warnings);

  sheets.forEach(function(sheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 1) return;
    const values = sheet.getRange(1, QLTD_PB_DETAIL_ID_COLUMN, lastRow, 1).getValues();
    values.forEach(function(row, index) {
      const id = String(row[0] || '').trim();
      if (!id || id === QLTD_PB_DETAIL_HEADERS.detailTaskId) return;
      if (idSet[id]) {
        duplicates[id] = duplicates[id] || [idSet[id]];
        duplicates[id].push({
          sheetName: sheet.getName(),
          rowNumber: index + 1
        });
      } else {
        idSet[id] = {
          sheetName: sheet.getName(),
          rowNumber: index + 1
        };
      }
    });
  });

  const duplicateIds = Object.keys(duplicates);
  if (duplicateIds.length) {
    return {
      idSet: idSet,
      warnings: warnings,
      error: qltdWorkError_(QLTD_PB_DETAIL_TASK_SOURCE, action, 'DETAIL_TASK_ID_DUPLICATE_IN_FILE', 'DetailTaskId is duplicated in PB file.', context.meta, warnings, {
        duplicateIds: duplicateIds,
        locations: duplicates
      })
    };
  }

  return {
    idSet: idSet,
    warnings: warnings,
    error: null
  };
}

function qltdPbDetailListMappedSheets_(context, sheetContext, warnings) {
  const result = [];
  const seen = {};
  function addSheet(sheet) {
    if (!sheet || seen[sheet.getName()]) return;
    seen[sheet.getName()] = true;
    result.push(sheet);
  }

  addSheet(sheetContext.sheet);
  const deptsResult = qltdWorkListActiveProjectDepts_(context.projectCode);
  warnings.push.apply(warnings, deptsResult.warnings || []);
  if (deptsResult.error) {
    warnings.push(qltdWorkWarning_('PROJECT_DEPTS_SCAN_SKIPPED', 'Cannot read all project depts for DetailTaskId scan.'));
    return result;
  }

  deptsResult.departments.forEach(function(dept) {
    const sheetResult = qltdBudgetFindDeptSheet_(sheetContext.spreadsheet, dept, dept.deptCode);
    if (sheetResult.sheet) addSheet(sheetResult.sheet);
  });
  return result;
}
