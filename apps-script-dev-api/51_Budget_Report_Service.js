function qltdBudgetSubmitPlanDryRun_(params) {
  return qltdBudgetBuildDryRunPreview_(params || {}, 'PLAN', 'budget_submitPlanDryRun');
}

function qltdBudgetSubmitActualDryRun_(params) {
  return qltdBudgetBuildDryRunPreview_(params || {}, 'ACTUAL', 'budget_submitActualDryRun');
}

function qltdBudgetBuildDryRunPreview_(params, operation, action) {
  const submitValidation = qltdBudgetValidateSubmitPayload_(params, action);
  if (submitValidation.error) return submitValidation.error;

  const payload = submitValidation.value;
  const meta = {
    action: action,
    projectCode: payload.projectCode,
    deptCode: payload.deptCode,
    masterTaskCode: payload.masterTaskCode,
    email: payload.email
  };
  let warnings = [];

  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) return qltdBudgetDryRunFromBudgetError_(action, projectsResult.error);
  warnings = warnings.concat(projectsResult.warnings);

  const project = qltdBudgetFindProjectByCode_(projectsResult.projects, payload.projectCode);
  if (!project || project.status !== 'ACTIVE') {
    return qltdBudgetDryRunValidationError_(action, 'PROJECT_NOT_FOUND', 'Khong tim thay du an hoac du an khong active.', meta, warnings);
  }
  if (!project.deptSpreadsheetId) {
    return qltdBudgetDryRunValidationError_(action, 'DEPT_SPREADSHEET_ID_MISSING', 'Du an chua co DeptSpreadsheetId.', meta, warnings);
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) return qltdBudgetDryRunFromBudgetError_(action, deptsResult.error);
  warnings = warnings.concat(deptsResult.warnings);

  const projectDepts = deptsResult.departments.filter(function(dept) {
    return dept.projectCode === payload.projectCode && dept.status === 'ACTIVE';
  });
  const dept = qltdBudgetFindProjectDept_(projectDepts, payload.deptCode);
  if (!dept) {
    return qltdBudgetDryRunValidationError_(action, 'DEPT_NOT_FOUND', 'Khong tim thay phong/ban active cua du an.', meta, warnings);
  }

  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(project.deptSpreadsheetId);
  } catch (error) {
    return qltdBudgetDryRunValidationError_(action, 'DEPT_SPREADSHEET_OPEN_FAILED', error.message || String(error), meta, warnings);
  }

  const sheetResult = qltdBudgetFindDeptSheet_(spreadsheet, dept, payload.deptCode);
  warnings = warnings.concat(sheetResult.warnings);
  if (!sheetResult.sheet) {
    return qltdBudgetDryRunValidationError_(action, 'DEPT_SHEET_NOT_FOUND', 'Khong tim thay sheet phong/ban.', meta, warnings);
  }

  const parsed = qltdBudgetReadSheetAsObjects_(sheetResult.sheet, 4);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_BUDGET_DEPT_TASK_REQUIRED_HEADERS);
  if (missingHeaders.length) {
    return qltdBudgetDryRunValidationError_(action, 'REQUIRED_HEADER_MISSING', 'Sheet phong/ban thieu header bat buoc.', Object.assign({
      missingHeaders: missingHeaders
    }, meta), warnings);
  }

  const taskResult = qltdBudgetFindDeptTaskRow_(parsed, payload.masterTaskCode);
  if (taskResult.error) {
    return qltdBudgetDryRunValidationError_(action, taskResult.error.code, taskResult.error.message, meta, warnings);
  }

  const nowIso = qltdBudgetNowIso_();
  const task = taskResult.task;
  const pbPreview = qltdBudgetBuildPbPreview_(operation, sheetResult.sheet, parsed.headerMap, task, payload);
  const centralRawPreview = qltdBudgetBuildCentralRawPreview_({
    operation: operation,
    project: project,
    dept: dept,
    task: task,
    payload: payload,
    nowIso: nowIso
  });

  return qltdBudgetDryRunResponse_(true, 'OK', action, {
    dryRun: true,
    operation: operation,
    projectCode: payload.projectCode,
    deptCode: payload.deptCode,
    masterTaskCode: payload.masterTaskCode,
    pbPreview: pbPreview,
    centralRawPreview: centralRawPreview
  }, warnings, [], meta);
}

function qltdBudgetValidateSubmitPayload_(params, action) {
  const requiredFields = ['projectCode', 'deptCode', 'masterTaskCode', 'periodType', 'periodCode', 'amount', 'email'];
  for (let index = 0; index < requiredFields.length; index += 1) {
    const field = requiredFields[index];
    if (params[field] === undefined || params[field] === null || String(params[field]).trim() === '') {
      return {
        value: null,
        error: qltdBudgetDryRunValidationError_(action, 'FIELD_REQUIRED', 'Thieu truong bat buoc: ' + field + '.', {
          field: field
        })
      };
    }
  }

  const amount = qltdBudgetNormalizeAmount_(params.amount);
  if (amount.error) {
    return {
      value: null,
      error: qltdBudgetDryRunValidationError_(action, amount.error.code, amount.error.message)
    };
  }

  const periodType = qltdBudgetNormalizePeriodType_(params.periodType);
  if (periodType.error) {
    return {
      value: null,
      error: qltdBudgetDryRunValidationError_(action, periodType.error.code, periodType.error.message)
    };
  }

  const projectValidation = qltdBudgetValidateProjectCode_(action, params.projectCode);
  if (projectValidation.error) {
    return {
      value: null,
      error: qltdBudgetDryRunFromBudgetError_(action, projectValidation.error)
    };
  }

  const deptValidation = qltdBudgetValidateDeptCode_(action, params.deptCode, {
    projectCode: projectValidation.value
  });
  if (deptValidation.error) {
    return {
      value: null,
      error: qltdBudgetDryRunFromBudgetError_(action, deptValidation.error)
    };
  }

  return {
    value: {
      projectCode: projectValidation.value,
      deptCode: deptValidation.value,
      masterTaskCode: String(params.masterTaskCode || '').trim(),
      periodType: periodType.value,
      periodCode: String(params.periodCode || '').trim(),
      amount: amount.value,
      basis: String(params.basis || '').trim(),
      note: String(params.note || '').trim(),
      email: qltdDevApiNormalizeEmail_(params.email)
    },
    error: null
  };
}

function qltdBudgetFindDeptTaskRow_(parsed, masterTaskCode) {
  const target = String(masterTaskCode || '').trim();
  const matches = [];

  (parsed.rows || []).forEach(function(item) {
    const code = String(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'Ma cong viec Master', '') || '').trim();
    if (code === target) {
      matches.push({
        rowNumber: item.rowNumber,
        raw: item.raw,
        headerMap: parsed.headerMap
      });
    }
  });

  if (!matches.length) {
    return {
      task: null,
      error: {
        code: 'TASK_NOT_FOUND',
        message: 'Khong tim thay masterTaskCode trong sheet phong/ban.'
      }
    };
  }

  if (matches.length > 1) {
    return {
      task: null,
      error: {
        code: 'DUPLICATE_TASK_CODE',
        message: 'masterTaskCode bi trung trong sheet phong/ban.'
      }
    };
  }

  return {
    task: matches[0],
    error: null
  };
}

function qltdBudgetBuildPbPreview_(operation, sheet, headerMap, task, payload) {
  const row = task.raw;
  const amountColumnName = operation === 'PLAN' ? 'Ke hoach ngan sach' : 'Ngan sach thuc te';
  const amountColumnIndex = qltdBudgetFindHeaderIndex_(headerMap, amountColumnName) + 1;
  const preview = {
    targetSpreadsheetId: sheet.getParent().getId(),
    targetSheet: sheet.getName(),
    targetRowNumber: task.rowNumber,
    targetColumnName: amountColumnName,
    targetColumnLetter: qltdBudgetColumnLetter_(amountColumnIndex),
    oldValue: qltdBudgetGetCell_(row, headerMap, amountColumnName, ''),
    newValue: payload.amount,
    writeMode: 'DRY_RUN_ONLY'
  };

  if (operation === 'ACTUAL') {
    const noteColumnName = 'Ghi chu cap nhat';
    const noteColumnIndex = qltdBudgetFindHeaderIndex_(headerMap, noteColumnName) + 1;
    preview.noteColumnName = noteColumnName;
    preview.noteColumnLetter = qltdBudgetColumnLetter_(noteColumnIndex);
    preview.noteOldValue = qltdBudgetGetCell_(row, headerMap, noteColumnName, '');
    preview.noteNewValue = payload.note;
  }

  return preview;
}

function qltdBudgetBuildCentralRawPreview_(context) {
  const row = context.task.raw;
  const payload = context.payload;
  const reportPrefix = context.operation === 'PLAN' ? 'DRYRUN_PLAN_' : 'DRYRUN_ACTUAL_';
  const preview = {};

  preview['Report ID'] = reportPrefix + context.nowIso.replace(/[^0-9]/g, '');
  preview['Ma du an'] = payload.projectCode;
  preview['Ten du an'] = context.project.projectName;
  preview['Phong/Ban'] = context.dept.deptName || context.dept.deptCode || payload.deptCode;
  preview['Loai ky'] = payload.periodType;
  preview['Ma ky'] = payload.periodCode;
  preview['Ma cong viec Master'] = payload.masterTaskCode;
  preview['WBS/STT'] = String(qltdBudgetGetCell_(row, context.task.headerMap, 'STT', '') || '').trim();
  preview['Noi dung cong viec'] = String(qltdBudgetGetCell_(row, context.task.headerMap, 'Noi dung cong viec', '') || '').trim();
  preview['Ke hoach ngan sach ky'] = context.operation === 'PLAN' ? payload.amount : '';
  preview['Gia tri thuc hien ky nay'] = context.operation === 'ACTUAL' ? payload.amount : '';
  preview['Trang thai xac nhan'] = 'DRY_RUN';
  preview['Can cu'] = payload.basis;
  preview['Vuong mac/Ghi chu'] = payload.note;
  preview['Nguoi gui'] = payload.email;
  preview['Thoi diem gui'] = context.nowIso;
  preview['Nguon file PB'] = context.project.deptSpreadsheetId;
  preview['Sync status'] = 'DRY_RUN';
  preview['Sync at'] = '';
  preview['Sync error'] = '';

  return qltdBudgetOrderCentralRawPreview_(preview);
}

function qltdBudgetOrderCentralRawPreview_(preview) {
  const ordered = {};
  QLTD_BUDGET_CENTRAL_RAW_HEADERS.forEach(function(header) {
    ordered[header] = preview[header] === undefined ? '' : preview[header];
  });
  return ordered;
}

function qltdBudgetColumnLetter_(columnIndex) {
  let index = Number(columnIndex || 0);
  if (!index || index < 1) return '';

  let letter = '';
  while (index > 0) {
    const remainder = (index - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    index = Math.floor((index - 1) / 26);
  }
  return letter;
}

function qltdBudgetDryRunResponse_(success, apiStatus, action, data, warnings, errors, meta) {
  return {
    success: !!success,
    apiStatus: apiStatus || (success ? 'OK' : 'VALIDATION_ERROR'),
    source: QLTD_BUDGET_DRY_RUN_SOURCE,
    data: success ? (data || {}) : null,
    warnings: warnings || [],
    errors: errors || [],
    meta: Object.assign({
      action: action || '',
      generatedAt: qltdBudgetNowIso_()
    }, meta || {})
  };
}

function qltdBudgetDryRunValidationError_(action, code, message, meta, warnings) {
  return qltdBudgetDryRunResponse_(false, 'VALIDATION_ERROR', action, null, warnings || [], [{
    code: code,
    message: message || code
  }], meta || {});
}

function qltdBudgetDryRunFromBudgetError_(action, response) {
  return qltdBudgetDryRunResponse_(false, response && response.apiStatus === 'OK' ? 'ERROR' : (response && response.apiStatus) || 'ERROR', action, null, response && response.warnings || [], response && response.errors || [{
    code: 'ERROR',
    message: 'Loi khong xac dinh.'
  }], response && response.meta || {});
}
