function qltdBudgetGetProjects_(params) {
  const action = 'budget_getProjects';
  const email = qltdDevApiNormalizeEmail_(params && params.email);
  const meta = {
    action: action,
    email: email || 'anonymous'
  };

  const readResult = qltdBudgetReadProjects_();
  if (readResult.error) return readResult.error;

  let projects = readResult.projects.filter(function(project) {
    return project.status === 'ACTIVE';
  });

  projects.sort(function(a, b) {
    const aOrder = Number(a.sortOrder || 9999);
    const bOrder = Number(b.sortOrder || 9999);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.projectName || '').localeCompare(String(b.projectName || ''));
  });

  return qltdBudgetOk_(action, {
    projects: projects.map(function(project) {
      return {
        projectCode: project.projectCode,
        projectName: project.projectName,
        status: project.status,
        sortOrder: project.sortOrder || '',
        hasMaster: !!project.masterSpreadsheetId,
        hasDeptFile: !!project.deptSpreadsheetId
      };
    })
  }, readResult.warnings, meta);
}

function qltdBudgetGetProjectDepts_(params) {
  const action = 'budget_getProjectDepts';
  const projectValidation = qltdBudgetValidateProjectCode_(action, params && params.projectCode);
  if (projectValidation.error) return projectValidation.error;

  const projectCode = projectValidation.value;
  const meta = {
    projectCode: projectCode,
    email: qltdDevApiNormalizeEmail_(params && params.email) || 'anonymous'
  };

  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) return projectsResult.error;
  const project = qltdBudgetFindProjectByCode_(projectsResult.projects, projectCode);
  if (!project || project.status !== 'ACTIVE') {
    return qltdBudgetError_(action, 'PROJECT_NOT_FOUND', 'Khong tim thay du an hoac du an khong active.', meta, projectsResult.warnings);
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) return deptsResult.error;

  const departments = deptsResult.departments
    .filter(function(dept) {
      return dept.projectCode === projectCode && dept.status === 'ACTIVE';
    })
    .sort(function(a, b) {
      const aOrder = Number(a.sortOrder || 9999);
      const bOrder = Number(b.sortOrder || 9999);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.deptName || '').localeCompare(String(b.deptName || ''));
    });

  return qltdBudgetOk_(action, {
    projectCode: projectCode,
    projectName: project.projectName,
    departments: departments.map(function(dept) {
      return {
        deptCode: dept.deptCode,
        deptName: dept.deptName,
        projectUnitCode: dept.projectUnitCode,
        status: dept.status,
        sortOrder: dept.sortOrder || ''
      };
    })
  }, projectsResult.warnings.concat(deptsResult.warnings), meta);
}

function qltdBudgetGetDeptTasks_(params) {
  const action = 'budget_getDeptTasks';
  const projectValidation = qltdBudgetValidateProjectCode_(action, params && params.projectCode);
  if (projectValidation.error) return projectValidation.error;

  const deptValidation = qltdBudgetValidateDeptCode_(action, params && params.deptCode, {
    projectCode: projectValidation.value
  });
  if (deptValidation.error) return deptValidation.error;

  const projectCode = projectValidation.value;
  const deptCode = deptValidation.value;
  const meta = {
    projectCode: projectCode,
    deptCode: deptCode,
    email: qltdDevApiNormalizeEmail_(params && params.email) || 'anonymous'
  };

  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) return projectsResult.error;
  const project = qltdBudgetFindProjectByCode_(projectsResult.projects, projectCode);
  if (!project || project.status !== 'ACTIVE') {
    return qltdBudgetError_(action, 'PROJECT_NOT_FOUND', 'Khong tim thay du an hoac du an khong active.', meta, projectsResult.warnings);
  }
  if (!project.deptSpreadsheetId) {
    return qltdBudgetError_(action, 'DEPT_SPREADSHEET_ID_MISSING', 'Du an chua co DeptSpreadsheetId.', meta, projectsResult.warnings);
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) return deptsResult.error;
  const projectDepts = deptsResult.departments.filter(function(dept) {
    return dept.projectCode === projectCode && dept.status === 'ACTIVE';
  });
  const dept = qltdBudgetFindProjectDept_(projectDepts, deptCode);
  if (!dept) {
    return qltdBudgetError_(action, 'DEPT_NOT_FOUND', 'Khong tim thay phong/ban active cua du an.', meta, projectsResult.warnings.concat(deptsResult.warnings));
  }

  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(project.deptSpreadsheetId);
  } catch (error) {
    return qltdBudgetError_(action, 'DEPT_SPREADSHEET_OPEN_FAILED', error.message || String(error), meta, projectsResult.warnings.concat(deptsResult.warnings));
  }

  const sheetResult = qltdBudgetFindDeptSheet_(spreadsheet, dept, deptCode);
  if (!sheetResult.sheet) {
    return qltdBudgetError_(action, 'DEPT_SHEET_NOT_FOUND', 'Khong tim thay sheet phong/ban.', meta, projectsResult.warnings.concat(deptsResult.warnings).concat(sheetResult.warnings));
  }

  const parsed = qltdBudgetReadSheetAsObjects_(sheetResult.sheet, 4);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_BUDGET_DEPT_TASK_REQUIRED_HEADERS);
  if (missingHeaders.length) {
    return qltdBudgetError_(action, 'REQUIRED_HEADER_MISSING', 'Sheet phong/ban thieu header bat buoc.', Object.assign({
      missingHeaders: missingHeaders
    }, meta), projectsResult.warnings.concat(deptsResult.warnings));
  }

  const tasks = parsed.rows.map(function(item) {
    const row = item.raw;
    const masterTaskCode = String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ma cong viec Master', '') || '').trim();
    if (!masterTaskCode) return null;

    return {
      masterTaskCode: masterTaskCode,
      wbs: String(qltdBudgetGetCell_(row, parsed.headerMap, 'STT', '') || '').trim(),
      taskName: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Noi dung cong viec', '') || '').trim(),
      planBudget: qltdBudgetToNumber_(qltdBudgetGetCell_(row, parsed.headerMap, 'Ke hoach ngan sach', 0)),
      actualBudget: qltdBudgetToNumber_(qltdBudgetGetCell_(row, parsed.headerMap, 'Ngan sach thuc te', 0)),
      status: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Trang thai thuc hien', '') || '').trim(),
      startPlan: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, parsed.headerMap, 'Ngay bat dau ke hoach', '')),
      finishPlan: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, parsed.headerMap, 'Ngay ket thuc ke hoach', '')),
      actualStart: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, parsed.headerMap, 'Bat dau thuc te', '')),
      actualFinish: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, parsed.headerMap, 'Hoan thanh thuc te', '')),
      owner: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Nguoi chu tri', '') || '').trim(),
      coordinator: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Nguoi phoi hop', '') || '').trim(),
      note: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Ghi chu cap nhat', '') || '').trim(),
      rowType: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Loai dong', '') || '').trim(),
      rowNumber: item.rowNumber,
      sourceSheet: sheetResult.sheet.getName()
    };
  }).filter(function(task) {
    return !!task;
  });

  return qltdBudgetOk_(action, {
    projectCode: projectCode,
    projectName: project.projectName,
    deptCode: dept.deptCode || deptCode,
    deptName: dept.deptName || '',
    sourceSheet: sheetResult.sheet.getName(),
    tasks: tasks
  }, projectsResult.warnings.concat(deptsResult.warnings).concat(sheetResult.warnings), meta);
}

function qltdBudgetReadProjects_() {
  const action = 'budget_readProjects';
  const result = qltdBudgetReadRequiredCentralSheet_(QLTD_BUDGET_SHEET.PROJECTS, action);
  if (result.error) return {
    projects: [],
    warnings: [],
    error: result.error
  };

  const parsed = qltdBudgetReadSheetAsObjects_(result.sheet, 1);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_BUDGET_PROJECT_HEADERS);
  if (missingHeaders.length) {
    return {
      projects: [],
      warnings: [],
      error: qltdBudgetError_(action, 'REQUIRED_HEADER_MISSING', 'Sheet Projects thieu header bat buoc.', {
        sheetName: QLTD_BUDGET_SHEET.PROJECTS,
        missingHeaders: missingHeaders
      })
    };
  }

  return {
    projects: parsed.rows.map(function(item) {
      const row = item.raw;
      return {
        rowNumber: item.rowNumber,
        projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'ProjectCode', '')),
        projectName: String(qltdBudgetGetCell_(row, parsed.headerMap, 'ProjectName', '') || '').trim(),
        masterSpreadsheetId: String(qltdBudgetGetCell_(row, parsed.headerMap, 'MasterSpreadsheetId', '') || '').trim(),
        deptSpreadsheetId: String(qltdBudgetGetCell_(row, parsed.headerMap, 'DeptSpreadsheetId', '') || '').trim(),
        defaultTaskSheet: String(qltdBudgetGetCell_(row, parsed.headerMap, 'DefaultTaskSheet', 'Cong_viec') || 'Cong_viec').trim(),
        defaultDeptSheet: String(qltdBudgetGetCell_(row, parsed.headerMap, 'DefaultDeptSheet', '*') || '*').trim(),
        status: qltdBudgetNormalizeStatus_(qltdBudgetGetCell_(row, parsed.headerMap, 'Status', 'ACTIVE')),
        sortOrder: qltdBudgetGetCell_(row, parsed.headerMap, 'SortOrder', ''),
        note: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Note', '') || '').trim()
      };
    }).filter(function(project) {
      return !!project.projectCode && !!project.projectName;
    }),
    warnings: [],
    error: null
  };
}

function qltdBudgetReadProjectDepts_() {
  const action = 'budget_readProjectDepts';
  const result = qltdBudgetReadRequiredCentralSheet_(QLTD_BUDGET_SHEET.PROJECT_DEPTS, action);
  if (result.error) return {
    departments: [],
    warnings: [],
    error: result.error
  };

  const parsed = qltdBudgetReadSheetAsObjects_(result.sheet, 1);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_BUDGET_PROJECT_DEPT_HEADERS);
  if (missingHeaders.length) {
    return {
      departments: [],
      warnings: [],
      error: qltdBudgetError_(action, 'REQUIRED_HEADER_MISSING', 'Sheet Project_Depts thieu header bat buoc.', {
        sheetName: QLTD_BUDGET_SHEET.PROJECT_DEPTS,
        missingHeaders: missingHeaders
      })
    };
  }

  return {
    departments: parsed.rows.map(function(item) {
      const row = item.raw;
      return {
        rowNumber: item.rowNumber,
        projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'ProjectCode', '')),
        deptCode: String(qltdBudgetGetCell_(row, parsed.headerMap, 'DeptCode', '') || '').trim(),
        projectUnitCode: String(qltdBudgetGetCell_(row, parsed.headerMap, 'ProjectUnitCode', '') || '').trim(),
        deptName: String(qltdBudgetGetCell_(row, parsed.headerMap, 'DeptName', '') || '').trim(),
        status: qltdBudgetNormalizeStatus_(qltdBudgetGetCell_(row, parsed.headerMap, 'Status', 'ACTIVE')),
        sortOrder: qltdBudgetGetCell_(row, parsed.headerMap, 'SortOrder', ''),
        note: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Note', '') || '').trim()
      };
    }).filter(function(dept) {
      return !!dept.projectCode && !!dept.deptCode;
    }),
    warnings: [],
    error: null
  };
}

function qltdBudgetFindDeptSheet_(spreadsheet, dept, requestedDeptCode) {
  const warnings = [];
  const candidates = [
    requestedDeptCode,
    dept.deptCode,
    dept.projectUnitCode,
    dept.deptName
  ].filter(function(value, index, array) {
    const text = String(value || '').trim();
    return !!text && array.indexOf(value) === index;
  });

  for (let index = 0; index < candidates.length; index += 1) {
    const sheet = spreadsheet.getSheetByName(candidates[index]);
    if (sheet) return {
      sheet: sheet,
      warnings: warnings
    };
  }

  warnings.push(qltdBudgetWarning_('DEPT_SHEET_CANDIDATES_NOT_FOUND', 'Khong tim thay sheet theo deptCode/projectUnitCode/deptName.', {
    candidates: candidates
  }));
  return {
    sheet: null,
    warnings: warnings
  };
}
