const QLTD_BUDGET_ENVELOPE_ALLOCATION_HEADERS = [
  'Ma cong viec Master',
  'Giai doan FS',
  'Phien ban',
  'Can cu',
  'Nguoi de xuat',
  'Nguoi duyet',
  'Thoi diem duyet',
  'Hieu luc'
];

const QLTD_BUDGET_ENVELOPE_PB_HEADERS = [
  'Co ngan sach',
  'Huong dong tien',
  'Can cu ngan sach',
  'Trang thai ngan sach chi tiet',
  'Ma yeu cau dieu chinh'
];

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
