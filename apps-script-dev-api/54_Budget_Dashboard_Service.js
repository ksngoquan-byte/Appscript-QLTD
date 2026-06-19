function qltdBudgetGetSummary_(params) {
  const action = 'budget_getSummary';
  const context = qltdBudgetBuildReadContext_(params || {}, action, true);
  if (context.error) return context.error;

  const parsed = qltdBudgetReadRequiredCacheSheet_(
    QLTD_BUDGET_SHEET.CENTRAL_SUMMARY,
    QLTD_BUDGET_CENTRAL_SUMMARY_HEADERS,
    action,
    context.meta
  );
  if (parsed.error) return parsed.error;

  const rows = parsed.rows
    .map(function(item) {
      return qltdBudgetSummaryReadRow_(item, parsed.headerMap, context.departments);
    })
    .filter(function(row) {
      return qltdBudgetReadRowAllowed_(row, context) && qltdBudgetSummaryFilterMatches_(row, context);
    });

  const warnings = rows.length ? [] : [qltdBudgetWarning_('BUDGET_SUMMARY_EMPTY', 'Khong co du lieu tong hop ngan sach phu hop voi bo loc.')];
  return qltdBudgetOk_(action, {
    filters: context.filters,
    rows: rows,
    count: rows.length,
    updatedAt: qltdBudgetLatestUpdatedAt_(rows)
  }, warnings, context.meta);
}

function qltdBudgetGetDashboard_(params) {
  const action = 'budget_getDashboard';
  const context = qltdBudgetBuildReadContext_(params || {}, action, false);
  if (context.error) return context.error;

  const parsed = qltdBudgetReadRequiredCacheSheet_(
    QLTD_BUDGET_SHEET.CENTRAL_DASHBOARD,
    QLTD_BUDGET_CENTRAL_DASHBOARD_HEADERS,
    action,
    context.meta
  );
  if (parsed.error) return parsed.error;

  const kpis = parsed.rows
    .map(function(item) {
      return qltdBudgetDashboardReadRow_(item, parsed.headerMap);
    })
    .filter(function(row) {
      return qltdBudgetReadRowAllowed_(row, context) && qltdBudgetDashboardFilterMatches_(row, context);
    });

  const warnings = kpis.length ? [] : [qltdBudgetWarning_('BUDGET_DASHBOARD_EMPTY', 'Khong co KPI dashboard ngan sach phu hop voi bo loc.')];
  return qltdBudgetOk_(action, {
    filters: context.filters,
    kpis: kpis,
    count: kpis.length,
    updatedAt: qltdBudgetLatestUpdatedAt_(kpis)
  }, warnings, context.meta);
}

function qltdBudgetBuildReadContext_(params, action, includeBudgetType) {
  const email = qltdDevApiNormalizeEmail_(params.email);
  const meta = { action: action, email: email || 'anonymous' };
  if (!email) return { error: qltdBudgetError_(action, 'EMAIL_REQUIRED', 'email la bat buoc.', meta) };

  const user = qltdBudgetReadUserByEmail_(email);
  if (!user) return { error: qltdBudgetError_(action, 'USER_NOT_FOUND', 'Khong tim thay user.', meta) };
  if (user.status !== 'ACTIVE') return { error: qltdBudgetError_(action, 'USER_INACTIVE', 'User khong ACTIVE.', meta) };

  const projectCode = qltdBudgetNormalizeCode_(params.projectCode);
  const isAdmin = user.role === 'ADMIN';
  if (!projectCode) return { error: qltdBudgetError_(action, 'PROJECT_CODE_REQUIRED', 'Thieu projectCode.', meta) };
  if (projectCode === 'ALL' && !isAdmin) return { error: qltdBudgetError_(action, 'ACCESS_DENIED', 'Chi ADMIN duoc doc projectCode=ALL.', meta) };

  const periodTypeResult = qltdBudgetNormalizeReadPeriodType_(params.periodType);
  if (periodTypeResult.error) return { error: qltdBudgetError_(action, periodTypeResult.error.code, periodTypeResult.error.message, meta) };
  const periodCode = qltdBudgetNormalizeReadPeriodCode_(params.periodCode);
  const deptCode = qltdBudgetNormalizeCode_(params.deptCode);

  let budgetType = '';
  if (includeBudgetType && String(params.budgetType || '').trim()) {
    const budgetTypeResult = qltdBudgetNormalizeBudgetType_(params.budgetType);
    if (budgetTypeResult.error) return { error: qltdBudgetError_(action, budgetTypeResult.error.code, budgetTypeResult.error.message, meta) };
    budgetType = budgetTypeResult.value;
  }

  const departments = qltdBudgetReadProjectDeptsReadonly_();
  const projects = qltdBudgetReadProjectsForBudgetUser_(user, departments);
  const projectAllowed = projectCode === 'ALL'
    ? isAdmin
    : projects.some(function(project) { return qltdBudgetNormalizeCode_(project.projectCode) === projectCode; });
  if (!projectAllowed) return { error: qltdBudgetError_(action, 'ACCESS_DENIED', 'User khong co quyen doc du an.', meta) };

  const allowedDeptCodes = qltdBudgetReadAllowedDeptCodes_(user, email, departments, projectCode);
  if (!isAdmin) {
    if (!deptCode) return { error: qltdBudgetError_(action, 'DEPT_CODE_REQUIRED', 'User khong phai ADMIN phai truyen deptCode.', meta) };
    if (!allowedDeptCodes[deptCode]) return { error: qltdBudgetError_(action, 'ACCESS_DENIED', 'User khong co quyen doc phong/ban nay.', meta) };
  }
  if (isAdmin && deptCode && !qltdBudgetReadDeptExists_(departments, projectCode, deptCode)) {
    return { error: qltdBudgetError_(action, 'DEPT_NOT_FOUND', 'Khong tim thay phong/ban ACTIVE phu hop.', meta) };
  }

  const filters = {
    projectCode: projectCode,
    deptCode: deptCode,
    periodType: periodTypeResult.value,
    periodCode: periodCode,
    budgetType: budgetType
  };

  return {
    error: null,
    user: user,
    isAdmin: isAdmin,
    departments: departments,
    allowedDeptCodes: allowedDeptCodes,
    filters: filters,
    meta: Object.assign({}, meta, filters, { role: user.role })
  };
}

function qltdBudgetReadRequiredCacheSheet_(sheetName, expectedHeaders, action, meta) {
  const sheet = qltdBudgetGetReadonlySheet_(sheetName);
  if (!sheet) {
    return {
      error: qltdBudgetError_(action, 'SHEET_NOT_FOUND', 'Khong tim thay sheet: ' + sheetName, Object.assign({}, meta || {}, { sheetName: sheetName }))
    };
  }

  try {
    const schema = qltdBudgetGetSheetSchema_(sheetName);
    const parsed = qltdBudgetReadSheetAsObjects_(sheet, schema.headerRow);
    qltdBudgetRequireAggregateHeaders_(parsed.headers, expectedHeaders, sheetName);
    return Object.assign({ error: null }, parsed);
  } catch (error) {
    return {
      error: qltdBudgetError_(action, error && error.code || 'CACHE_HEADER_INVALID', qltdBudgetSafeErrorMessage_(error), Object.assign({}, meta || {}, {
        sheetName: sheetName,
        details: error && error.details || undefined
      }))
    };
  }
}

function qltdBudgetSummaryReadRow_(item, headerMap, departments) {
  const row = item.raw;
  const projectCode = qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, headerMap, 'Ma du an', ''));
  const deptName = String(qltdBudgetGetCell_(row, headerMap, 'Phong/Ban', '') || '').trim();
  const deptCode = qltdBudgetResolveReadDeptCode_(projectCode, deptName, departments);
  return {
    projectCode: projectCode,
    projectName: String(qltdBudgetGetCell_(row, headerMap, 'Ten du an', '') || '').trim(),
    periodType: qltdBudgetNormalizeReadPeriodType_(qltdBudgetGetCell_(row, headerMap, 'Loai ky', '')).value,
    periodCode: qltdBudgetNormalizeReadPeriodCode_(qltdBudgetGetCell_(row, headerMap, 'Ma ky', '')),
    masterTaskCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma cong viec Master', '') || '').trim(),
    wbs: String(qltdBudgetGetCell_(row, headerMap, 'WBS', '') || '').trim(),
    taskName: String(qltdBudgetGetCell_(row, headerMap, 'Cong viec', '') || '').trim(),
    deptCode: deptCode,
    deptName: deptName,
    totalBudget: qltdBudgetReadNumberOrBlank_(qltdBudgetGetCell_(row, headerMap, 'Ngan sach tong the', '')),
    periodPlan: qltdBudgetToNumber_(qltdBudgetGetCell_(row, headerMap, 'Ke hoach ky', 0)),
    periodActual: qltdBudgetToNumber_(qltdBudgetGetCell_(row, headerMap, 'Thuc hien ky', 0)),
    cumulativeActual: qltdBudgetToNumber_(qltdBudgetGetCell_(row, headerMap, 'Thuc hien luy ke', 0)),
    remaining: qltdBudgetReadNumberOrBlank_(qltdBudgetGetCell_(row, headerMap, 'Con lai', '')),
    usageRate: qltdBudgetReadNumberOrBlank_(qltdBudgetGetCell_(row, headerMap, 'Ty le su dung', '')),
    warning: String(qltdBudgetGetCell_(row, headerMap, 'Canh bao', '') || '').trim(),
    updatedAt: qltdBudgetReadDateIso_(qltdBudgetGetCell_(row, headerMap, 'Cap nhat cuoi', '')),
    budgetItemCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma khoan ngan sach', '') || '').trim(),
    budgetItemName: String(qltdBudgetGetCell_(row, headerMap, 'Ten khoan ngan sach', '') || '').trim(),
    budgetType: String(qltdBudgetGetCell_(row, headerMap, 'Loai ngan sach', '') || '').trim().toUpperCase(),
    budgetGroup: String(qltdBudgetGetCell_(row, headerMap, 'Nhom ngan sach', '') || '').trim(),
    budgetStage: String(qltdBudgetGetCell_(row, headerMap, 'Giai doan ngan sach', '') || '').trim()
  };
}

function qltdBudgetDashboardReadRow_(item, headerMap) {
  const row = item.raw;
  return {
    metricGroup: String(qltdBudgetGetCell_(row, headerMap, 'Nhom chi tieu', '') || '').trim(),
    metricName: String(qltdBudgetGetCell_(row, headerMap, 'Chi tieu', '') || '').trim(),
    projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, headerMap, 'Ma du an', '')),
    projectName: String(qltdBudgetGetCell_(row, headerMap, 'Ten du an', '') || '').trim(),
    periodType: qltdBudgetNormalizeReadPeriodType_(qltdBudgetGetCell_(row, headerMap, 'Loai ky', '')).value,
    periodCode: qltdBudgetNormalizeReadPeriodCode_(qltdBudgetGetCell_(row, headerMap, 'Ma ky', '')),
    value: qltdBudgetReadNumberOrBlank_(qltdBudgetGetCell_(row, headerMap, 'Gia tri', '')),
    unit: String(qltdBudgetGetCell_(row, headerMap, 'Don vi', '') || '').trim(),
    updatedAt: qltdBudgetReadDateIso_(qltdBudgetGetCell_(row, headerMap, 'Cap nhat cuoi', '')),
    note: String(qltdBudgetGetCell_(row, headerMap, 'Ghi chu', '') || '').trim(),
    deptCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, headerMap, 'Ma phong/ban', '')),
    deptName: String(qltdBudgetGetCell_(row, headerMap, 'Phong/Ban', '') || '').trim(),
    budgetType: String(qltdBudgetGetCell_(row, headerMap, 'Loai ngan sach', '') || '').trim().toUpperCase(),
    budgetGroup: String(qltdBudgetGetCell_(row, headerMap, 'Nhom ngan sach', '') || '').trim(),
    budgetItemCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma khoan ngan sach', '') || '').trim()
  };
}

function qltdBudgetReadRowAllowed_(row, context) {
  if (!row || !row.projectCode) return false;
  if (context.filters.projectCode !== 'ALL' && row.projectCode !== context.filters.projectCode) return false;
  if (context.filters.deptCode && row.deptCode !== context.filters.deptCode) return false;
  if (!context.isAdmin && !context.allowedDeptCodes[row.deptCode]) return false;
  return true;
}

function qltdBudgetSummaryFilterMatches_(row, context) {
  if (context.filters.periodType && row.periodType !== context.filters.periodType) return false;
  if (context.filters.periodCode && row.periodCode !== context.filters.periodCode) return false;
  if (context.filters.budgetType && row.budgetType !== context.filters.budgetType) return false;
  return true;
}

function qltdBudgetDashboardFilterMatches_(row, context) {
  if (context.filters.periodType && row.periodType !== context.filters.periodType) return false;
  if (context.filters.periodCode && row.periodCode !== context.filters.periodCode) return false;
  return true;
}

function qltdBudgetReadAllowedDeptCodes_(user, email, departments, projectCode) {
  const allowed = {};
  if (!user || user.role === 'ADMIN') return allowed;

  const userDeptCode = qltdBudgetNormalizeCode_(user.deptCode);
  const userProjectUnitCode = qltdBudgetNormalizeCode_(user.projectUnitCode);
  (departments || []).forEach(function(dept) {
    if (projectCode !== 'ALL' && dept.projectCode !== projectCode) return;
    if (
      (userDeptCode && dept.deptCode === userDeptCode) ||
      (userProjectUnitCode && dept.projectUnitCode === userProjectUnitCode)
    ) {
      allowed[dept.deptCode] = true;
    }
  });
  return allowed;
}

function qltdBudgetReadDeptExists_(departments, projectCode, deptCode) {
  return (departments || []).some(function(dept) {
    return dept.deptCode === deptCode && (projectCode === 'ALL' || dept.projectCode === projectCode);
  });
}

function qltdBudgetReadUserByEmail_(email) {
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.USERS);
  if (!sheet) return null;

  const parsed = qltdBudgetReadSheetAsObjects_(sheet, 1);
  const normalizedEmail = qltdDevApiNormalizeEmail_(email);
  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index].raw;
    const rowEmail = qltdDevApiNormalizeEmail_(qltdBudgetGetCell_(row, parsed.headerMap, 'Email', ''));
    if (rowEmail === normalizedEmail) {
      return {
        email: rowEmail,
        role: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Role', '') || '').trim().toUpperCase(),
        status: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Status', '') || '').trim().toUpperCase(),
        deptCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'DeptCode', '')),
        projectUnitCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'ProjectUnitCode', ''))
      };
    }
  }
  return null;
}

function qltdBudgetReadProjectsForBudgetUser_(user, departments) {
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.PROJECTS);
  if (!sheet) return [];

  const parsed = qltdBudgetReadSheetAsObjects_(sheet, 1);
  const activeProjects = parsed.rows.map(function(item) {
    const row = item.raw;
    return {
      projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'ProjectCode', '')),
      status: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Status', 'ACTIVE') || 'ACTIVE').trim().toUpperCase()
    };
  }).filter(function(project) {
    return project.projectCode && project.status === 'ACTIVE';
  });

  if (user && user.role === 'ADMIN') return activeProjects;

  const allowed = {};
  const userDeptCode = qltdBudgetNormalizeCode_(user && user.deptCode);
  const userProjectUnitCode = qltdBudgetNormalizeCode_(user && user.projectUnitCode);
  (departments || []).forEach(function(dept) {
    if (
      (userDeptCode && dept.deptCode === userDeptCode) ||
      (userProjectUnitCode && dept.projectUnitCode === userProjectUnitCode)
    ) {
      allowed[dept.projectCode] = true;
    }
  });

  return activeProjects.filter(function(project) {
    return !!allowed[project.projectCode];
  });
}

function qltdBudgetReadProjectDeptsReadonly_() {
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.PROJECT_DEPTS);
  if (!sheet) return [];

  const parsed = qltdBudgetReadSheetAsObjects_(sheet, 1);
  return parsed.rows.map(function(item) {
    const row = item.raw;
    return {
      projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'ProjectCode', '')),
      deptCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'DeptCode', '')),
      projectUnitCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, parsed.headerMap, 'ProjectUnitCode', '')),
      deptName: String(qltdBudgetGetCell_(row, parsed.headerMap, 'DeptName', '') || '').trim(),
      status: String(qltdBudgetGetCell_(row, parsed.headerMap, 'Status', 'ACTIVE') || 'ACTIVE').trim().toUpperCase()
    };
  }).filter(function(dept) {
    return dept.projectCode && dept.deptCode && dept.status === 'ACTIVE';
  });
}

function qltdBudgetResolveReadDeptCode_(projectCode, deptName, departments) {
  const normalizedProjectCode = qltdBudgetNormalizeCode_(projectCode);
  const normalizedDeptName = qltdBudgetNormalizeKey_(deptName);
  const match = (departments || []).filter(function(dept) {
    return dept.projectCode === normalizedProjectCode && qltdBudgetNormalizeKey_(dept.deptName) === normalizedDeptName;
  })[0];
  return match ? match.deptCode : '';
}

function qltdBudgetNormalizeReadPeriodType_(value) {
  const raw = String(value || '').trim();
  if (!raw) return { value: '', error: null };
  const result = qltdBudgetNormalizePeriodType_(raw);
  if (result.error) return result;
  if (result.value !== 'MONTH' && result.value !== 'WEEK') {
    return { value: '', error: { code: 'PERIOD_TYPE_INVALID', message: 'Chi ho tro Loai ky Thang/Tuan.' } };
  }
  return result;
}

function qltdBudgetNormalizeReadPeriodCode_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  }
  return String(value === null || value === undefined ? '' : value).trim();
}

function qltdBudgetReadNumberOrBlank_(value) {
  if (value === '' || value === null || value === undefined) return '';
  return qltdBudgetToNumber_(value);
}

function qltdBudgetReadDateIso_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value.toISOString();
  return String(value === null || value === undefined ? '' : value).trim();
}

function qltdBudgetLatestUpdatedAt_(rows) {
  let latest = '';
  (rows || []).forEach(function(row) {
    if (row.updatedAt && (!latest || String(row.updatedAt) > latest)) latest = String(row.updatedAt);
  });
  return latest;
}
