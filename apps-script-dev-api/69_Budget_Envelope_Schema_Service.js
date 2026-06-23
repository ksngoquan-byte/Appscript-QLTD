<<<<<<< Updated upstream
const QLTD_BUDGET_ENVELOPE_ALLOCATION_HEADERS = [
=======
const QLTD_BUDGET_ENVELOPE_SOURCE = 'budget_envelope_schema_v1';
const QLTD_BUDGET_ENVELOPE_PROJECT_CODE = '24-1.ĐB';
const QLTD_BUDGET_ENVELOPE_HEADER_ROW = 4;

const QLTD_BUDGET_ENVELOPE_CENTRAL_HEADERS = [
>>>>>>> Stashed changes
  'Ma cong viec Master',
  'Giai doan FS',
  'Phien ban',
  'Can cu',
  'Nguoi de xuat',
  'Nguoi duyet',
  'Thoi diem duyet',
  'Hieu luc'
];

<<<<<<< Updated upstream
const QLTD_BUDGET_ENVELOPE_PB_HEADERS = [
=======
const QLTD_BUDGET_ENVELOPE_DEPT_HEADERS = [
>>>>>>> Stashed changes
  'Co ngan sach',
  'Huong dong tien',
  'Can cu ngan sach',
  'Trang thai ngan sach chi tiet',
  'Ma yeu cau dieu chinh'
];

<<<<<<< Updated upstream
/**
 * Dry-run kiểm tra schema phong bì ngân sách MVP.
 * Không ghi dữ liệu, không append cột, không đổi cấu trúc sheet.
 *
 * @param {string=} projectCode Mã dự án cần kiểm tra sheet phòng/ban.
 * @param {string=} deptCode Mã phòng/ban cần kiểm tra. Bỏ trống để kiểm tra các phòng active của dự án.
 * @return {Object} Báo cáo hiện trạng và danh sách hành động append dự kiến.
 */
function qltdBudgetEnvelopeSchemaDryRun(projectCode, deptCode) {
  const action = 'budget_envelope_schema_dryrun';
  const normalizedProjectCode = qltdBudgetNormalizeCode_(projectCode);
  const normalizedDeptCode = qltdBudgetNormalizeCode_(deptCode);
  const warnings = [];
  const errors = [];

  const centralAllocation = qltdBudgetEnvelopeInspectCentralAllocation_(warnings, errors);
  const pbSheets = normalizedProjectCode
    ? qltdBudgetEnvelopeInspectPbSheets_(normalizedProjectCode, normalizedDeptCode, warnings, errors)
    : [];

  if (!normalizedProjectCode) {
    warnings.push(qltdBudgetWarning_(
      'PROJECT_CODE_RECOMMENDED',
      'Chua truyen projectCode; dry-run chi kiem tra CENTRAL_NS_Allocations. Truyen projectCode de kiem tra sheet phong/ban.',
      {}
    ));
  }

  const plannedActions = [];
  if (centralAllocation.exists && centralAllocation.missingHeaders.length) {
    plannedActions.push({
      type: 'APPEND_HEADERS',
      target: 'CENTRAL_NS_Allocations',
      sheetName: centralAllocation.sheetName,
      headerRow: centralAllocation.headerRow,
      headers: centralAllocation.missingHeaders.slice(),
      appendOnly: true,
      dryRunOnly: true
    });
  }

  pbSheets.forEach(function(info) {
    if (info.exists && info.missingHeaders.length) {
      plannedActions.push({
        type: 'APPEND_HEADERS',
        target: 'PB_DETAIL_SHEET',
        projectCode: info.projectCode,
        deptCode: info.deptCode,
        spreadsheetId: info.spreadsheetId,
        sheetName: info.sheetName,
        headerRow: info.headerRow,
        headers: info.missingHeaders.slice(),
        appendOnly: true,
        dryRunOnly: true
      });
    }
  });

  if (!plannedActions.length && !errors.length) {
    plannedActions.push({
      type: 'NO_OP',
      message: 'Schema phong bi ngan sach MVP da san sang trong pham vi duoc kiem tra.',
      dryRunOnly: true
    });
  }

  return {
    success: errors.length === 0,
    apiStatus: errors.length ? 'ERROR' : 'OK',
    source: 'budget_envelope_schema_dryrun_v1',
    data: {
      dryRun: true,
      projectCode: normalizedProjectCode,
      deptCode: normalizedDeptCode,
      centralAllocation: centralAllocation,
      pbSheets: pbSheets,
      plannedActions: plannedActions,
      canApply: errors.length === 0 && centralAllocation.exists && pbSheets.every(function(info) {
        return info.exists && !info.blocked;
      })
    },
    warnings: warnings,
    errors: errors,
    meta: {
      action: action,
      generatedAt: qltdBudgetNowIso_()
    }
  };
}

function qltdBudgetEnvelopeInspectCentralAllocation_(warnings, errors) {
  const sheetName = QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS;
  const schema = qltdBudgetGetSheetSchema_(sheetName);
  const sheet = qltdBudgetGetReadonlySheet_(sheetName);

  if (!sheet) {
    errors.push({
      code: 'CENTRAL_ALLOCATIONS_NOT_FOUND',
      message: 'Khong tim thay sheet CENTRAL_NS_Allocations.',
      sheetName: sheetName
    });
    return {
      sheetName: sheetName,
      exists: false,
      headerRow: schema.headerRow,
      existingHeaders: [],
      requiredHeaders: QLTD_BUDGET_ENVELOPE_ALLOCATION_HEADERS.slice(),
      missingHeaders: QLTD_BUDGET_ENVELOPE_ALLOCATION_HEADERS.slice(),
      appendOnly: true,
      blocked: true
    };
  }

  const parsed = qltdBudgetReadSheetAsObjects_(sheet, schema.headerRow);
  const missingHeaders = qltdBudgetFindMissingHeaders_(
    parsed.headerMap,
    QLTD_BUDGET_ENVELOPE_ALLOCATION_HEADERS
  );

  if (missingHeaders.length) {
    warnings.push(qltdBudgetWarning_(
      'BUDGET_ENVELOPE_ALLOCATION_HEADERS_MISSING',
      'CENTRAL_NS_Allocations chua co du cot phong bi ngan sach MVP.',
      { sheetName: sheetName, missingHeaders: missingHeaders.slice() }
    ));
  }

  return {
    sheetName: sheetName,
    exists: true,
    headerRow: schema.headerRow,
    existingHeaders: parsed.headers,
    requiredHeaders: QLTD_BUDGET_ENVELOPE_ALLOCATION_HEADERS.slice(),
    missingHeaders: missingHeaders,
    appendOnly: true,
    blocked: false
  };
}

function qltdBudgetEnvelopeInspectPbSheets_(projectCode, deptCode, warnings, errors) {
  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) {
    errors.push({
      code: 'PROJECT_REGISTRY_READ_FAILED',
      message: 'Khong doc duoc Projects.',
      detail: projectsResult.error
    });
    return [];
  }

  const project = qltdBudgetFindProjectByCode_(projectsResult.projects, projectCode);
  if (!project || project.status !== 'ACTIVE') {
    errors.push({
      code: 'PROJECT_NOT_FOUND',
      message: 'Khong tim thay du an active trong Projects.',
      projectCode: projectCode
    });
    return [];
  }

  if (!project.deptSpreadsheetId) {
    errors.push({
      code: 'DEPT_SPREADSHEET_ID_MISSING',
      message: 'Du an chua co DeptSpreadsheetId.',
      projectCode: projectCode
    });
    return [];
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) {
    errors.push({
      code: 'PROJECT_DEPTS_READ_FAILED',
      message: 'Khong doc duoc Project_Depts.',
      detail: deptsResult.error
    });
    return [];
  }

  let targetDepts = deptsResult.departments.filter(function(dept) {
    return dept.projectCode === projectCode && dept.status === 'ACTIVE';
  });

  if (deptCode) {
    targetDepts = targetDepts.filter(function(dept) {
      return qltdBudgetNormalizeCode_(dept.deptCode) === deptCode;
    });
    if (!targetDepts.length) {
      errors.push({
        code: 'DEPT_NOT_FOUND',
        message: 'Khong tim thay phong/ban active cua du an.',
        projectCode: projectCode,
        deptCode: deptCode
      });
      return [];
    }
  }

  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(project.deptSpreadsheetId);
  } catch (error) {
    errors.push({
      code: 'DEPT_SPREADSHEET_OPEN_FAILED',
      message: error && error.message ? error.message : String(error),
      projectCode: projectCode,
      spreadsheetId: project.deptSpreadsheetId
    });
    return [];
  }

  return targetDepts.map(function(dept) {
    const sheetResult = qltdBudgetFindDeptSheet_(spreadsheet, dept, dept.deptCode);
    if (!sheetResult.sheet) {
      warnings.push(qltdBudgetWarning_(
        'DEPT_SHEET_NOT_FOUND',
        'Khong tim thay sheet phong/ban; bo qua trong dry-run.',
        { projectCode: projectCode, deptCode: dept.deptCode }
      ));
      return {
        projectCode: projectCode,
        deptCode: dept.deptCode,
        spreadsheetId: project.deptSpreadsheetId,
        sheetName: '',
        exists: false,
        headerRow: 4,
        existingHeaders: [],
        requiredHeaders: QLTD_BUDGET_ENVELOPE_PB_HEADERS.slice(),
        missingHeaders: QLTD_BUDGET_ENVELOPE_PB_HEADERS.slice(),
        appendOnly: true,
        blocked: true
      };
    }

    const parsed = qltdBudgetReadSheetAsObjects_(sheetResult.sheet, 4);
    const missingHeaders = qltdBudgetFindMissingHeaders_(
      parsed.headerMap,
      QLTD_BUDGET_ENVELOPE_PB_HEADERS
    );

    if (missingHeaders.length) {
      warnings.push(qltdBudgetWarning_(
        'PB_BUDGET_ENVELOPE_HEADERS_MISSING',
        'Sheet phong/ban chua co du cot ngan sach chi tiet MVP.',
        {
          projectCode: projectCode,
          deptCode: dept.deptCode,
          sheetName: sheetResult.sheet.getName(),
          missingHeaders: missingHeaders.slice()
        }
      ));
    }

    return {
      projectCode: projectCode,
      deptCode: dept.deptCode,
      spreadsheetId: project.deptSpreadsheetId,
      sheetName: sheetResult.sheet.getName(),
      exists: true,
      headerRow: 4,
      existingHeaders: parsed.headers,
      requiredHeaders: QLTD_BUDGET_ENVELOPE_PB_HEADERS.slice(),
      missingHeaders: missingHeaders,
      appendOnly: true,
      blocked: false
    };
  });
}
=======
function qltdBudgetEnvelopeSchemaDryRunPilotProject241DB() {
  return qltdBudgetEnvelopeSchemaRunPilotProject241DB_(true);
}

function qltdBudgetEnvelopeSchemaApplyPilotProject241DB() {
  return qltdBudgetEnvelopeSchemaRunPilotProject241DB_(false);
}

function qltdBudgetEnvelopeSchemaRunPilotProject241DB_(dryRun) {
  const inspection = qltdBudgetEnvelopeSchemaInspectPilotProject241DB_();
  if (inspection.blocked) {
    return Object.assign({}, inspection, {
      dryRun: !!dryRun,
      applied: false
    });
  }

  if (dryRun) {
    return Object.assign({}, inspection, {
      dryRun: true,
      applied: false
    });
  }

  const appliedActions = qltdBudgetEnvelopeSchemaApplyInspection_(inspection);
  const after = qltdBudgetEnvelopeSchemaInspectPilotProject241DB_();

  return Object.assign({}, after, {
    dryRun: false,
    applied: true,
    appliedActions: appliedActions,
    before: qltdBudgetEnvelopeSchemaStripRuntimeFields_(inspection)
  });
}

function qltdBudgetEnvelopeSchemaInspectPilotProject241DB_() {
  const warnings = [];
  const errors = [];
  const sheets = [];
  const blockedSheets = [];
  const skippedSheets = [];
  const changedSheets = [];

  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) {
    const blocked = qltdBudgetEnvelopeSchemaBuildBlockedResult_(
      warnings,
      errors,
      sheets,
      blockedSheets,
      skippedSheets,
      changedSheets,
      [projectsResult.error],
      []
    );
    return qltdBudgetEnvelopeSchemaFinalizeInspection_(blocked, true);
  }

  const project = qltdBudgetFindProjectByCode_(projectsResult.projects, QLTD_BUDGET_ENVELOPE_PROJECT_CODE);
  if (!project || project.status !== 'ACTIVE') {
    const blocked = qltdBudgetEnvelopeSchemaBuildBlockedResult_(
      warnings,
      errors,
      sheets,
      blockedSheets,
      skippedSheets,
      changedSheets,
      [{
        code: 'PROJECT_NOT_FOUND',
        message: 'Project ' + QLTD_BUDGET_ENVELOPE_PROJECT_CODE + ' khong ton tai hoac khong active.'
      }],
      projectsResult.warnings || []
    );
    return qltdBudgetEnvelopeSchemaFinalizeInspection_(blocked, true);
  }

  if (!project.deptSpreadsheetId) {
    const blocked = qltdBudgetEnvelopeSchemaBuildBlockedResult_(
      warnings,
      errors,
      sheets,
      blockedSheets,
      skippedSheets,
      changedSheets,
      [{
        code: 'DEPT_SPREADSHEET_ID_MISSING',
        message: 'Project chua co DeptSpreadsheetId.'
      }],
      projectsResult.warnings || []
    );
    return qltdBudgetEnvelopeSchemaFinalizeInspection_(blocked, true);
  }

  let deptSpreadsheet;
  try {
    deptSpreadsheet = SpreadsheetApp.openById(project.deptSpreadsheetId);
  } catch (error) {
    const blocked = qltdBudgetEnvelopeSchemaBuildBlockedResult_(
      warnings,
      errors,
      sheets,
      blockedSheets,
      skippedSheets,
      changedSheets,
      [{
        code: 'DEPT_SPREADSHEET_OPEN_FAILED',
        message: qltdBudgetEnvelopeSchemaSafeMessage_(error)
      }],
      projectsResult.warnings || []
    );
    return qltdBudgetEnvelopeSchemaFinalizeInspection_(blocked, true);
  }

  const centralSheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS);
  const centralResult = qltdBudgetEnvelopeSchemaInspectSheet_({
    sheet: centralSheet,
    sheetName: QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS,
    requiredHeaders: QLTD_BUDGET_ENVELOPE_CENTRAL_HEADERS,
    sourceLabel: 'CENTRAL'
  });
  sheets.push(centralResult);
  warnings.push.apply(warnings, centralResult.warnings || []);
  if (centralResult.blocked) blockedSheets.push(centralResult);
  if (centralResult.missingHeaders.length) changedSheets.push(centralResult);

  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) {
    const blocked = qltdBudgetEnvelopeSchemaBuildBlockedResult_(
      warnings,
      errors,
      sheets,
      blockedSheets,
      skippedSheets,
      changedSheets,
      [deptsResult.error],
      projectsResult.warnings.concat(centralResult.warnings || [])
    );
    return qltdBudgetEnvelopeSchemaFinalizeInspection_(blocked, true);
  }

  const activeDepts = (deptsResult.departments || [])
    .filter(function(dept) {
      return dept.projectCode === QLTD_BUDGET_ENVELOPE_PROJECT_CODE && dept.status === 'ACTIVE';
    })
    .sort(function(a, b) {
      const aOrder = Number(a.sortOrder || 9999);
      const bOrder = Number(b.sortOrder || 9999);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.deptName || '').localeCompare(String(b.deptName || ''));
    });

  const seenSheets = {};
  activeDepts.forEach(function(dept) {
    const resolved = qltdBudgetFindDeptSheet_(deptSpreadsheet, dept, dept.deptCode);
    const warningsBefore = (projectsResult.warnings || []).concat(deptsResult.warnings || []);

    if (!resolved.sheet) {
      const blockedResult = qltdBudgetEnvelopeSchemaInspectSheet_({
        sheet: null,
        sheetName: dept.deptCode || dept.projectUnitCode || dept.deptName || 'UNKNOWN',
        requiredHeaders: QLTD_BUDGET_ENVELOPE_DEPT_HEADERS,
        sourceLabel: 'PB',
        blockedReason: 'DEPT_SHEET_NOT_FOUND',
        warnings: warningsBefore.concat(resolved.warnings || []),
        candidateDept: dept
      });
      sheets.push(blockedResult);
      blockedSheets.push(blockedResult);
      return;
    }

    const sheetName = resolved.sheet.getName();
    if (seenSheets[sheetName]) {
      const skipped = qltdBudgetEnvelopeSchemaMakeSheetResult_({
        sheetName: sheetName,
        sourceLabel: 'PB',
        exists: true,
        blocked: false,
        skipped: true,
        skipReason: 'DUPLICATE_PHYSICAL_SHEET',
        beforeHeaders: qltdBudgetEnvelopeSchemaSnapshotHeaders_(resolved.sheet, QLTD_BUDGET_ENVELOPE_HEADER_ROW),
        requiredHeaders: QLTD_BUDGET_ENVELOPE_DEPT_HEADERS,
        missingHeaders: [],
        addedHeaders: [],
        afterHeaders: qltdBudgetEnvelopeSchemaSnapshotHeaders_(resolved.sheet, QLTD_BUDGET_ENVELOPE_HEADER_ROW),
        warnings: warningsBefore.concat(resolved.warnings || []),
        candidateDept: dept
      });
      sheets.push(skipped);
      skippedSheets.push(skipped);
      return;
    }

    seenSheets[sheetName] = true;
    const inspected = qltdBudgetEnvelopeSchemaInspectSheet_({
      sheet: resolved.sheet,
      sheetName: sheetName,
      requiredHeaders: QLTD_BUDGET_ENVELOPE_DEPT_HEADERS,
      sourceLabel: 'PB',
      warnings: warningsBefore.concat(resolved.warnings || []),
      candidateDept: dept
    });
    sheets.push(inspected);
    warnings.push.apply(warnings, inspected.warnings || []);
    if (inspected.blocked) blockedSheets.push(inspected);
    if (inspected.missingHeaders.length) changedSheets.push(inspected);
  });

  const overallBlocked = blockedSheets.length > 0;
  const overallChanged = changedSheets.length > 0;
  const status = overallBlocked ? 'BLOCKED' : (overallChanged ? 'CHANGE_REQUIRED' : 'NO_CHANGE');
  const result = {
    success: !overallBlocked,
    apiStatus: overallBlocked ? 'BLOCKED' : 'OK',
    source: QLTD_BUDGET_ENVELOPE_SOURCE,
    dryRun: true,
    applied: false,
    blocked: overallBlocked,
    status: status,
    projectCode: QLTD_BUDGET_ENVELOPE_PROJECT_CODE,
    projectName: project.projectName || '',
    projectSpreadsheetId: getCurrentSpreadsheet_().getId(),
    deptSpreadsheetId: project.deptSpreadsheetId,
    generatedAt: new Date().toISOString(),
    warnings: warnings.concat(projectsResult.warnings || [], deptsResult.warnings || []),
    errors: errors.slice(),
    sheets: sheets,
    central: centralResult,
    departments: sheets.filter(function(item) {
      return item.sourceLabel === 'PB';
    }),
    summary: {
      totalSheets: sheets.length,
      blockedSheets: blockedSheets.length,
      changedSheets: changedSheets.length,
      skippedSheets: skippedSheets.length,
      addedHeaders: changedSheets.reduce(function(total, item) {
        return total + item.missingHeaders.length;
      }, 0)
    },
    plannedActions: overallBlocked ? [] : qltdBudgetEnvelopeSchemaBuildPlan_(sheets),
    blockedSheets: blockedSheets,
    skippedSheets: skippedSheets,
    changedSheets: changedSheets,
    rollback: overallBlocked ? [] : qltdBudgetEnvelopeSchemaBuildRollback_(sheets)
  };

  return result;
}

function qltdBudgetEnvelopeSchemaInspectSheet_(input) {
  const warnings = (input.warnings || []).slice();
  const sheet = input.sheet || null;
  const sheetName = input.sheetName || (sheet && sheet.getName()) || '';
  const requiredHeaders = (input.requiredHeaders || []).slice();
  const sourceLabel = input.sourceLabel || '';

  if (!sheet) {
    return qltdBudgetEnvelopeSchemaMakeSheetResult_({
      sheetName: sheetName,
      sourceLabel: sourceLabel,
      exists: false,
      blocked: true,
      blockedReason: input.blockedReason || 'SHEET_NOT_FOUND',
      beforeHeaders: [],
      requiredHeaders: requiredHeaders,
      missingHeaders: requiredHeaders.slice(),
      addedHeaders: [],
      afterHeaders: [],
      warnings: warnings,
      candidateDept: input.candidateDept || null
    });
  }

  const beforeHeaders = qltdBudgetEnvelopeSchemaSnapshotHeaders_(sheet, QLTD_BUDGET_ENVELOPE_HEADER_ROW);
  const inspected = qltdBudgetEnvelopeSchemaInspectHeaders_(beforeHeaders, requiredHeaders);

  return qltdBudgetEnvelopeSchemaMakeSheetResult_({
    sheetName: sheetName,
    sourceLabel: sourceLabel,
    exists: true,
    blocked: inspected.blocked,
    blockedReason: inspected.blockedReason,
    beforeHeaders: beforeHeaders,
    requiredHeaders: requiredHeaders,
    missingHeaders: inspected.missingHeaders,
    addedHeaders: inspected.missingHeaders.slice(),
    afterHeaders: qltdBudgetEnvelopeSchemaBuildAfterHeaders_(beforeHeaders, inspected.startColumn, inspected.missingHeaders),
    startColumn: inspected.startColumn,
    warnings: warnings,
    candidateDept: input.candidateDept || null
  });
}

function qltdBudgetEnvelopeSchemaInspectHeaders_(beforeHeaders, requiredHeaders) {
  const normalizedBefore = (beforeHeaders || []).map(qltdBudgetEnvelopeSchemaNormalizeHeader_);
  const required = (requiredHeaders || []).slice();
  const seen = {};
  const duplicateHeaders = [];
  let lastUsedHeaderIndex = -1;

  normalizedBefore.forEach(function(header, index) {
    if (!header) return;
    lastUsedHeaderIndex = index;
    if (seen[header]) {
      duplicateHeaders.push(beforeHeaders[index]);
    } else {
      seen[header] = true;
    }
  });

  if (!normalizedBefore.some(function(header) { return !!header; })) {
    return {
      blocked: true,
      blockedReason: 'EMPTY_HEADER_ROW',
      missingHeaders: required.slice()
    };
  }

  if (duplicateHeaders.length) {
    return {
      blocked: true,
      blockedReason: 'DUPLICATE_HEADER',
      missingHeaders: []
    };
  }

  const missingHeaders = required.filter(function(header) {
    return normalizedBefore.indexOf(qltdBudgetEnvelopeSchemaNormalizeHeader_(header)) < 0;
  });

  return {
    blocked: false,
    blockedReason: '',
    missingHeaders: missingHeaders,
    startColumn: lastUsedHeaderIndex + 2
  };
}

function qltdBudgetEnvelopeSchemaApplyInspection_(inspection) {
  if (!inspection || inspection.blocked) return [];

  const applied = [];
  (inspection.plannedActions || []).forEach(function(action) {
    const sheet = qltdBudgetEnvelopeSchemaResolveSheetForAction_(action);
    if (!sheet) {
      throw new Error('Khong tim thay sheet de apply: ' + action.sheetName);
    }

    const insertCount = qltdBudgetEnvelopeSchemaGetInsertCount_(sheet, action.startColumn, action.headers.length);
    if (insertCount > 0) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), insertCount);
    }

    sheet.getRange(QLTD_BUDGET_ENVELOPE_HEADER_ROW, action.startColumn, 1, action.headers.length)
      .setValues([action.headers.slice()]);

    applied.push({
      sheetName: action.sheetName,
      sourceLabel: action.sourceLabel,
      headerRow: QLTD_BUDGET_ENVELOPE_HEADER_ROW,
      startColumn: action.startColumn,
      insertedColumns: insertCount,
      addedHeaders: action.headers.slice()
    });
  });

  return applied;
}

function qltdBudgetEnvelopeSchemaResolveSheetForAction_(action) {
  if (!action || !action.sheetName) return null;
  if (action.sourceLabel === 'CENTRAL') {
    return qltdBudgetGetReadonlySheet_(action.sheetName);
  }

  const project = qltdBudgetEnvelopeSchemaGetProject_();
  if (!project || !project.deptSpreadsheetId) return null;
  const spreadsheet = SpreadsheetApp.openById(project.deptSpreadsheetId);
  return spreadsheet.getSheetByName(action.sheetName);
}

function qltdBudgetEnvelopeSchemaGetProject_() {
  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) return null;
  return qltdBudgetFindProjectByCode_(projectsResult.projects, QLTD_BUDGET_ENVELOPE_PROJECT_CODE);
}

function qltdBudgetEnvelopeSchemaBuildPlan_(sheets) {
  return (sheets || []).map(function(item) {
    if (item.blocked || item.skipped || !item.missingHeaders.length) return null;
    return {
      type: 'APPEND_HEADERS',
      sourceLabel: item.sourceLabel,
      sheetName: item.sheetName,
      headerRow: QLTD_BUDGET_ENVELOPE_HEADER_ROW,
      startColumn: item.startColumn,
      headers: item.missingHeaders.slice(),
      beforeHeaders: item.beforeHeaders.slice(),
      afterHeaders: item.afterHeaders.slice(),
      blocked: false
    };
  }).filter(function(item) {
    return !!item;
  });
}

function qltdBudgetEnvelopeSchemaBuildRollback_(sheets) {
  return (sheets || []).map(function(item) {
    if (item.blocked || item.skipped || !item.missingHeaders.length) return null;
    return {
      sheetName: item.sheetName,
      headerRow: QLTD_BUDGET_ENVELOPE_HEADER_ROW,
      deleteFromColumn: item.startColumn,
      deleteColumnCount: item.missingHeaders.length,
      headersToRemove: item.missingHeaders.slice()
    };
  }).filter(function(item) {
    return !!item;
  });
}

function qltdBudgetEnvelopeSchemaSnapshotHeaders_(sheet, headerRow) {
  if (!sheet) return [];
  const width = Math.max(sheet.getLastColumn ? sheet.getLastColumn() : 1, 1);
  const values = sheet.getRange(headerRow, 1, 1, width).getDisplayValues()[0] || [];
  return values.map(function(value) {
    return qltdBudgetEnvelopeSchemaNormalizeHeader_(value);
  });
}

function qltdBudgetEnvelopeSchemaNormalizeHeader_(value) {
  return String(value === null || typeof value === 'undefined' ? '' : value).trim().replace(/\s+/g, ' ');
}

function qltdBudgetEnvelopeSchemaBuildAfterHeaders_(beforeHeaders, startColumn, missingHeaders) {
  const after = (beforeHeaders || []).slice();
  const columnStart = Math.max(Number(startColumn || 0) - 1, 0);
  (missingHeaders || []).forEach(function(header, index) {
    after[columnStart + index] = header;
  });
  return after;
}

function qltdBudgetEnvelopeSchemaMakeSheetResult_(input) {
  const beforeHeaders = (input.beforeHeaders || []).slice();
  const addedHeaders = (input.addedHeaders || []).slice();
  const afterHeaders = (input.afterHeaders || []).slice();
  const missingHeaders = (input.missingHeaders || []).slice();
  const warnings = (input.warnings || []).slice();
  const blocked = !!input.blocked;
  const skipped = !!input.skipped;
  const startColumn = typeof input.startColumn === 'number'
    ? input.startColumn
    : (blocked || skipped ? 0 : (beforeHeaders.reduce(function(lastIndex, value, index) {
      return qltdBudgetEnvelopeSchemaNormalizeHeader_(value) ? index : lastIndex;
    }, -1) + 2));

  return {
    sheetName: input.sheetName || '',
    sourceLabel: input.sourceLabel || '',
    exists: input.exists !== false,
    blocked: blocked,
    blockedReason: input.blockedReason || '',
    skipped: skipped,
    skipReason: input.skipReason || '',
    headerRow: QLTD_BUDGET_ENVELOPE_HEADER_ROW,
    beforeHeaders: beforeHeaders,
    requiredHeaders: (input.requiredHeaders || []).slice(),
    missingHeaders: missingHeaders,
    addedHeaders: addedHeaders,
    afterHeaders: afterHeaders,
    startColumn: startColumn,
    warnings: warnings,
    candidateDept: input.candidateDept || null
  };
}

function qltdBudgetEnvelopeSchemaBuildBlockedResult_(warnings, errors, sheets, blockedSheets, skippedSheets, changedSheets, localErrors, extraWarnings) {
  return {
    success: false,
    apiStatus: 'BLOCKED',
    source: QLTD_BUDGET_ENVELOPE_SOURCE,
    dryRun: true,
    applied: false,
    blocked: true,
    status: 'BLOCKED',
    projectCode: QLTD_BUDGET_ENVELOPE_PROJECT_CODE,
    projectName: '',
    projectSpreadsheetId: getCurrentSpreadsheet_().getId(),
    deptSpreadsheetId: '',
    generatedAt: new Date().toISOString(),
    warnings: (warnings || []).concat(extraWarnings || []),
    errors: (errors || []).concat(localErrors || []),
    sheets: (sheets || []).slice(),
    central: null,
    departments: [],
    summary: {
      totalSheets: (sheets || []).length,
      blockedSheets: (blockedSheets || []).length,
      changedSheets: (changedSheets || []).length,
      skippedSheets: (skippedSheets || []).length,
      addedHeaders: 0
    },
    plannedActions: [],
    blockedSheets: (blockedSheets || []).slice(),
    skippedSheets: (skippedSheets || []).slice(),
    changedSheets: (changedSheets || []).slice(),
    rollback: []
  };
}

function qltdBudgetEnvelopeSchemaFinalizeInspection_(result, blocked) {
  if (blocked) {
    return result;
  }
  return result;
}

function qltdBudgetEnvelopeSchemaGetInsertCount_(sheet, startColumn, headerCount) {
  const requiredEnd = startColumn + headerCount - 1;
  const maxColumns = sheet && typeof sheet.getMaxColumns === 'function' ? sheet.getMaxColumns() : requiredEnd;
  return Math.max(0, requiredEnd - maxColumns);
}

function qltdBudgetEnvelopeSchemaStripRuntimeFields_(result) {
  return {
    success: result.success,
    apiStatus: result.apiStatus,
    source: result.source,
    dryRun: result.dryRun,
    applied: result.applied,
    blocked: result.blocked,
    status: result.status,
    projectCode: result.projectCode,
    projectName: result.projectName,
    projectSpreadsheetId: result.projectSpreadsheetId,
    deptSpreadsheetId: result.deptSpreadsheetId,
    generatedAt: result.generatedAt,
    summary: result.summary,
    plannedActions: result.plannedActions,
    blockedSheets: result.blockedSheets,
    skippedSheets: result.skippedSheets,
    changedSheets: result.changedSheets,
    rollback: result.rollback
  };
}

function qltdBudgetEnvelopeSchemaSafeMessage_(error) {
  return error && error.message ? String(error.message) : String(error || 'UNKNOWN_ERROR');
}

function qltdBudgetEnvelopeSchemaLog_(message) {
  try {
    if (typeof Logger !== 'undefined' && Logger && typeof Logger.log === 'function') {
      Logger.log('[BudgetEnvelopeSchema] ' + message);
    }
  } catch (err) {
    // Logging should never block schema inspection/apply.
  }
}

function qltdBudgetEnvelopeSchemaCountAddedHeaders_(result) {
  return (result.changedSheets || []).reduce(function(total, item) {
    return total + (item.missingHeaders || []).length;
  }, 0);
}
>>>>>>> Stashed changes
