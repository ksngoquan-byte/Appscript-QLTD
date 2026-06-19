function qltdBudgetGetDashboard_(params) {
  const action = 'budget_getDashboard';
  const projectCode = qltdBudgetNormalizeCode_(params && params.projectCode);
  const periodType = String(params && params.periodType || '').trim().toUpperCase();
  const periodCode = String(params && params.periodCode || '').trim();
  const meta = {
    projectCode: projectCode,
    periodType: periodType,
    periodCode: periodCode,
    email: qltdDevApiNormalizeEmail_(params && params.email) || 'anonymous'
  };

  const warnings = [];
  const dashboard = qltdBudgetReadOptionalCacheSheet_(
    QLTD_BUDGET_SHEET.CENTRAL_DASHBOARD,
    qltdBudgetGetSheetSchema_(QLTD_BUDGET_SHEET.CENTRAL_DASHBOARD).headerRow,
    warnings
  );
  const summary = qltdBudgetReadOptionalCacheSheet_(
    QLTD_BUDGET_SHEET.CENTRAL_SUMMARY,
    qltdBudgetGetSheetSchema_(QLTD_BUDGET_SHEET.CENTRAL_SUMMARY).headerRow,
    warnings
  );

  const kpis = dashboard.rows
    .filter(function(item) {
      return qltdBudgetDashboardMatches_(item.raw, dashboard.headerMap, projectCode, periodType, periodCode);
    })
    .map(function(item) {
      const row = item.raw;
      return {
        group: String(qltdBudgetGetCell_(row, dashboard.headerMap, 'Nhom chi tieu', '') || '').trim(),
        name: String(qltdBudgetGetCell_(row, dashboard.headerMap, 'Chi tieu', '') || '').trim(),
        projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, dashboard.headerMap, 'Ma du an', '')),
        projectName: String(qltdBudgetGetCell_(row, dashboard.headerMap, 'Ten du an', '') || '').trim(),
        periodType: String(qltdBudgetGetCell_(row, dashboard.headerMap, 'Loai ky', '') || '').trim(),
        periodCode: String(qltdBudgetGetCell_(row, dashboard.headerMap, 'Ma ky', '') || '').trim(),
        value: qltdBudgetGetCell_(row, dashboard.headerMap, 'Gia tri', ''),
        unit: String(qltdBudgetGetCell_(row, dashboard.headerMap, 'Don vi', '') || '').trim(),
        updatedAt: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, dashboard.headerMap, 'Cap nhat cuoi', '')),
        note: String(qltdBudgetGetCell_(row, dashboard.headerMap, 'Ghi chu', '') || '').trim(),
        rowNumber: item.rowNumber
      };
    });

  const rows = summary.rows
    .filter(function(item) {
      return qltdBudgetSummaryMatches_(item.raw, summary.headerMap, projectCode, periodType, periodCode);
    })
    .map(function(item) {
      const row = item.raw;
      return {
        projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, summary.headerMap, 'Ma du an', '')),
        projectName: String(qltdBudgetGetCell_(row, summary.headerMap, 'Ten du an', '') || '').trim(),
        periodType: String(qltdBudgetGetCell_(row, summary.headerMap, 'Loai ky', '') || '').trim(),
        periodCode: String(qltdBudgetGetCell_(row, summary.headerMap, 'Ma ky', '') || '').trim(),
        masterTaskCode: String(qltdBudgetGetCell_(row, summary.headerMap, 'Ma cong viec Master', '') || '').trim(),
        wbs: String(qltdBudgetGetCell_(row, summary.headerMap, 'WBS', '') || '').trim(),
        taskName: String(qltdBudgetGetCell_(row, summary.headerMap, 'Cong viec', '') || '').trim(),
        deptName: String(qltdBudgetGetCell_(row, summary.headerMap, 'Phong/Ban', '') || '').trim(),
        totalBudget: qltdBudgetToNumber_(qltdBudgetGetCell_(row, summary.headerMap, 'Ngan sach tong the', 0)),
        planBudget: qltdBudgetToNumber_(qltdBudgetGetCell_(row, summary.headerMap, 'Ke hoach ky', 0)),
        actualBudget: qltdBudgetToNumber_(qltdBudgetGetCell_(row, summary.headerMap, 'Thuc hien ky', 0)),
        cumulativeActual: qltdBudgetToNumber_(qltdBudgetGetCell_(row, summary.headerMap, 'Thuc hien luy ke', 0)),
        remainingBudget: qltdBudgetToNumber_(qltdBudgetGetCell_(row, summary.headerMap, 'Con lai', 0)),
        usageRate: qltdBudgetGetCell_(row, summary.headerMap, 'Ty le su dung', ''),
        warning: String(qltdBudgetGetCell_(row, summary.headerMap, 'Canh bao', '') || '').trim(),
        updatedAt: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, summary.headerMap, 'Cap nhat cuoi', '')),
        rowNumber: item.rowNumber
      };
    });

  if (!kpis.length && !rows.length) {
    warnings.push(qltdBudgetWarning_('BUDGET_DASHBOARD_EMPTY', 'Chua co du lieu dashboard ngan sach phu hop voi bo loc.'));
  }

  return qltdBudgetOk_(action, {
    projectCode: projectCode,
    periodType: periodType,
    periodCode: periodCode,
    kpis: kpis,
    rows: rows,
    isEmpty: !kpis.length && !rows.length
  }, warnings, meta);
}

function qltdBudgetReadOptionalCacheSheet_(sheetName, headerRowIndex, warnings) {
  const sheet = qltdBudgetGetReadonlySheet_(sheetName);
  if (!sheet) {
    warnings.push(qltdBudgetWarning_('SHEET_NOT_FOUND', 'Khong tim thay sheet: ' + sheetName, {
      sheetName: sheetName
    }));
    return {
      headers: [],
      headerMap: {},
      rows: []
    };
  }

  const parsed = qltdBudgetReadSheetAsObjects_(sheet, headerRowIndex);
  if (!parsed.rows.length) {
    warnings.push(qltdBudgetWarning_('SHEET_EMPTY', 'Sheet chua co du lieu: ' + sheetName, {
      sheetName: sheetName
    }));
  }
  return parsed;
}

function qltdBudgetDashboardMatches_(row, headerMap, projectCode, periodType, periodCode) {
  if (!row || !headerMap) return false;
  const rowProjectCode = qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, headerMap, 'Ma du an', ''));
  const rowPeriodType = String(qltdBudgetGetCell_(row, headerMap, 'Loai ky', '') || '').trim().toUpperCase();
  const rowPeriodCode = String(qltdBudgetGetCell_(row, headerMap, 'Ma ky', '') || '').trim();

  if (projectCode && rowProjectCode !== projectCode) return false;
  if (periodType && rowPeriodType !== periodType) return false;
  if (periodCode && rowPeriodCode !== periodCode) return false;
  return true;
}

function qltdBudgetSummaryMatches_(row, headerMap, projectCode, periodType, periodCode) {
  if (!row || !headerMap) return false;
  const rowProjectCode = qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, headerMap, 'Ma du an', ''));
  const rowPeriodType = String(qltdBudgetGetCell_(row, headerMap, 'Loai ky', '') || '').trim().toUpperCase();
  const rowPeriodCode = String(qltdBudgetGetCell_(row, headerMap, 'Ma ky', '') || '').trim();

  if (projectCode && rowProjectCode !== projectCode) return false;
  if (periodType && rowPeriodType !== periodType) return false;
  if (periodCode && rowPeriodCode !== periodCode) return false;
  return true;
}
