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

function qltdBudgetGetLiveDashboard_(params) {
  const action = 'budget_getLiveDashboard';
  const email = qltdDevApiNormalizeEmail_(params && params.email);
  const projectCode = qltdBudgetNormalizeCode_(params && params.projectCode);
  const deptCode = qltdBudgetNormalizeCode_(params && params.deptCode);
  const view = qltdBudgetNormalizeKey_(params && (params.view || params.scope)) === 'department' || deptCode ? 'department' : 'project';
  const meta = {
    action: action,
    email: email || 'anonymous',
    projectCode: projectCode,
    deptCode: deptCode,
    view: view
  };

  if (!email) return qltdBudgetError_(action, 'EMAIL_REQUIRED', 'email la bat buoc.', meta);
  const user = qltdUsersGetByEmail_(email);
  if (!qltdCanUseGeneralFeature_(user)) {
    return qltdBudgetError_(action, 'ACCESS_DENIED', 'Chi user ACTIVE duoc xem Dashboard ngan sach.', meta);
  }
  if (!projectCode) return qltdBudgetError_(action, 'PROJECT_CODE_REQUIRED', 'Thieu projectCode.', meta);

  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) return projectsResult.error;
  const project = qltdBudgetFindProjectByCode_(projectsResult.projects, projectCode);
  if (!project || project.status !== 'ACTIVE') {
    return qltdBudgetError_(action, 'PROJECT_NOT_FOUND', 'Khong tim thay du an ACTIVE.', meta, projectsResult.warnings);
  }

  const deptsResult = qltdBudgetReadProjectDepts_();
  const deptWarnings = deptsResult.error ? [
    qltdBudgetWarning_('PROJECT_DEPTS_UNAVAILABLE', 'Khong doc duoc Project_Depts.', {
      projectCode: projectCode
    })
  ] : (deptsResult.warnings || []);
  const departments = (deptsResult.departments || []).filter(function(dept) {
    return dept.projectCode === projectCode && dept.status === 'ACTIVE';
  });
  if (deptCode && !qltdBudgetFindProjectDept_(departments, deptCode)) {
    return qltdBudgetError_(action, 'DEPT_NOT_FOUND', 'Khong tim thay phong/ban ACTIVE.', meta, (projectsResult.warnings || []).concat(deptWarnings));
  }

  const itemsResult = qltdBudgetReadBudgetItems_();
  const allocationsResult = qltdBudgetReadAllocations_();
  const rawResult = qltdBudgetLiveDashboardReadRaw_();
  const model = qltdBudgetBuildLiveDashboardModel_({
    project: project,
    departments: departments,
    items: itemsResult.items || [],
    allocations: allocationsResult.allocations || [],
    rawRows: rawResult.rows || [],
    rawHeaderMap: rawResult.headerMap || {},
    projectCode: projectCode,
    deptCode: deptCode,
    view: view,
    meta: meta
  });

  return qltdBudgetOk_(action, model, (projectsResult.warnings || [])
    .concat(deptWarnings)
    .concat(itemsResult.warnings || [])
    .concat(allocationsResult.warnings || [])
    .concat(rawResult.warnings || []), meta);
}

function qltdBudgetLiveDashboardReadRaw_() {
  const warnings = [];
  const sheet = qltdBudgetGetReadonlySheet_(QLTD_BUDGET_SHEET.CENTRAL_RAW);
  if (!sheet) {
    warnings.push(qltdBudgetWarning_('CENTRAL_RAW_NOT_FOUND', 'Khong tim thay CENTRAL_NS_Raw.', {
      sheetName: QLTD_BUDGET_SHEET.CENTRAL_RAW
    }));
    return {
      rows: [],
      headerMap: {},
      warnings: warnings
    };
  }
  const schema = qltdBudgetGetSheetSchema_(QLTD_BUDGET_SHEET.CENTRAL_RAW);
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, schema.headerRow);
  const missingHeaders = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_BUDGET_CENTRAL_RAW_HEADERS);
  if (missingHeaders.length) {
    warnings.push(qltdBudgetWarning_('CENTRAL_RAW_HEADER_MISSING', 'CENTRAL_NS_Raw thieu header.', {
      missingHeaders: missingHeaders
    }));
  }
  return {
    rows: parsed.rows || [],
    headerMap: parsed.headerMap || {},
    warnings: warnings
  };
}

function qltdBudgetBuildLiveDashboardModel_(input) {
  const alerts = [];
  const projectCode = input.projectCode;
  const deptCode = input.deptCode;
  const departmentMap = qltdBudgetLiveDashboardDepartmentMap_(input.departments || []);
  const allocationIndex = qltdBudgetLiveDashboardAllocationIndex_(input.allocations || [], alerts, input.meta);
  const totals = {
    THU: qltdBudgetLiveDashboardEmptyFlow_('THU'),
    CHI: qltdBudgetLiveDashboardEmptyFlow_('CHI')
  };
  const itemModels = [];
  const itemByKey = {};

  (input.items || []).forEach(function(item) {
    if (!qltdBudgetLiveDashboardItemMatches_(item, projectCode, deptCode)) return;
    if (item.status !== 'ACTIVE') return;

    const allocation = allocationIndex[qltdBudgetNormalizeCode_(item.allocationCode)];
    const flowType = item.flowType || (allocation && allocation.flowType) || '';
    const itemModel = {
      budgetItemCode: item.budgetItemCode,
      budgetItemName: item.budgetItemName,
      projectCode: item.projectCode,
      projectName: item.projectName || (input.project && input.project.projectName) || '',
      deptCode: qltdBudgetNormalizeCode_(item.deptCode),
      deptName: item.deptName || departmentMap[qltdBudgetNormalizeCode_(item.deptCode)] || '',
      budgetType: item.budgetType,
      masterTaskCode: item.masterTaskCode || '',
      budgetGroup: item.budgetGroup || '',
      budgetStage: item.budgetStage || '',
      allocationCode: item.allocationCode || '',
      pbTaskCode: item.pbTaskCode || '',
      flowType: flowType,
      plannedAmount: Number(item.approvedBudget || 0),
      actualAmount: 0,
      remainingAmount: Number(item.approvedBudget || 0),
      overAmount: 0,
      usageRate: null,
      allocationValid: false,
      statusLabel: 'DATA_BLOCKED',
      severity: 'DATA'
    };

    const allocationError = qltdBudgetLiveDashboardValidateItemAllocation_(item, allocation);
    if (allocationError) {
      qltdBudgetLiveDashboardAddAlert_(alerts, 'DATA', allocationError.code, allocationError.message, itemModel, {
        rowNumber: item.rowNumber
      });
    } else {
      itemModel.allocationValid = true;
      const flow = itemModel.flowType === 'THU' ? totals.THU : totals.CHI;
      flow.plan += itemModel.plannedAmount;
    }

    itemByKey[qltdBudgetLiveDashboardItemKey_(item.projectCode, item.deptCode, item.budgetItemCode)] = itemModel;
    itemModels.push(itemModel);
  });

  qltdBudgetLiveDashboardApplyActuals_(input, itemByKey, allocationIndex, totals, alerts);
  itemModels.forEach(function(item) {
    qltdBudgetLiveDashboardFinalizeItem_(item, alerts);
  });

  const thu = qltdBudgetLiveDashboardFinalizeFlow_(totals.THU);
  const chi = qltdBudgetLiveDashboardFinalizeFlow_(totals.CHI);
  const balance = {
    plannedBalance: thu.planAmount - chi.planAmount,
    actualBalance: thu.actualAmount - chi.actualAmount,
    remainingBalance: (thu.planAmount - chi.planAmount) - (thu.actualAmount - chi.actualAmount),
    coverageRate: chi.actualAmount > 0 ? thu.actualAmount / chi.actualAmount : null
  };

  return {
    view: input.view,
    project: {
      projectCode: projectCode,
      projectName: input.project && input.project.projectName || ''
    },
    department: deptCode ? {
      deptCode: deptCode,
      deptName: departmentMap[deptCode] || ''
    } : null,
    departments: (input.departments || []).map(function(dept) {
      return {
        deptCode: dept.deptCode,
        deptName: dept.deptName || dept.deptCode
      };
    }),
    formulas: {
      thuRemaining: 'THU.planAmount - THU.actualAmount',
      chiRemaining: 'CHI.planAmount - CHI.actualAmount',
      plannedBalance: 'THU.planAmount - CHI.planAmount',
      actualBalance: 'THU.actualAmount - CHI.actualAmount',
      sourceRule: 'CENTRAL_NS_Items + CENTRAL_NS_Allocations + CENTRAL_NS_Raw(PERFORMANCE_ACTUAL,SYNCED,CONFIRMED), dedupe Report ID'
    },
    thu: thu,
    chi: chi,
    balance: balance,
    items: itemModels.sort(qltdBudgetLiveDashboardCompareItems_),
    alerts: alerts,
    alertsSummary: qltdBudgetLiveDashboardAlertSummary_(alerts),
    updatedAt: qltdBudgetNowIso_(),
    sourceSheets: [
      QLTD_BUDGET_SHEET.CENTRAL_ITEMS,
      QLTD_BUDGET_SHEET.CENTRAL_ALLOCATIONS,
      QLTD_BUDGET_SHEET.CENTRAL_RAW
    ]
  };
}

function qltdBudgetLiveDashboardDepartmentMap_(departments) {
  const result = {};
  (departments || []).forEach(function(dept) {
    result[qltdBudgetNormalizeCode_(dept.deptCode)] = dept.deptName || dept.deptCode || '';
  });
  return result;
}

function qltdBudgetLiveDashboardAllocationIndex_(allocations, alerts, meta) {
  const index = {};
  (allocations || []).forEach(function(allocation) {
    const key = qltdBudgetNormalizeCode_(allocation.allocationCode);
    if (!key) return;
    if (index[key]) {
      qltdBudgetLiveDashboardAddAlert_(alerts, 'DATA', 'ALLOCATION_CODE_DUPLICATE', 'Ma phan bo bi trung; dashboard chi doc ban ghi dau tien.', {
        allocationCode: allocation.allocationCode,
        projectCode: allocation.projectCode,
        deptCode: allocation.deptCode,
        flowType: allocation.flowType
      }, {
        firstRowNumber: index[key].rowNumber,
        duplicateRowNumber: allocation.rowNumber,
        action: meta && meta.action
      });
      return;
    }
    index[key] = allocation;
  });
  return index;
}

function qltdBudgetLiveDashboardItemMatches_(item, projectCode, deptCode) {
  if (!item || item.projectCode !== projectCode) return false;
  if (deptCode && qltdBudgetNormalizeCode_(item.deptCode) !== deptCode) return false;
  return true;
}

function qltdBudgetLiveDashboardValidateItemAllocation_(item, allocation) {
  if (!item.allocationCode) return { code: 'ITEM_ALLOCATION_MISSING', message: 'Khoan ngan sach ACTIVE thieu Ma phan bo.' };
  if (!allocation) return { code: 'ALLOCATION_NOT_FOUND', message: 'Khong tim thay phan bo tuong ung trong CENTRAL_NS_Allocations.' };
  if (allocation.status !== 'CONFIRMED') return { code: 'ALLOCATION_NOT_CONFIRMED', message: 'Phan bo chua CONFIRMED/Da chot.' };
  if (allocation.projectCode !== item.projectCode) return { code: 'ALLOCATION_PROJECT_MISMATCH', message: 'Phan bo khong khop Ma du an.' };
  if (qltdBudgetNormalizeCode_(allocation.deptCode) !== qltdBudgetNormalizeCode_(item.deptCode)) return { code: 'ALLOCATION_DEPT_MISMATCH', message: 'Phan bo khong khop Ma phong/ban.' };
  if (!item.flowType || allocation.flowType !== item.flowType) return { code: 'ALLOCATION_FLOW_MISMATCH', message: 'Phan bo khong khop Huong dong tien.' };
  return null;
}

function qltdBudgetLiveDashboardApplyActuals_(input, itemByKey, allocationIndex, totals, alerts) {
  const seenReports = {};
  (input.rawRows || []).forEach(function(entry) {
    const parsed = qltdBudgetLiveDashboardParseRaw_(entry, input.rawHeaderMap);
    parsed.deptCode = qltdBudgetResolveBudgetDeptCode_(parsed.projectCode, parsed.deptCode, parsed.deptName, input.departments || []);
    const meta = { rowNumber: entry.rowNumber };
    if (!parsed.reportId) {
      qltdBudgetLiveDashboardAddAlert_(alerts, 'DATA', 'RAW_REPORT_ID_MISSING', 'Dong Raw thieu Report ID; bo qua.', parsed, meta);
      return;
    }
    if (seenReports[parsed.reportId]) {
      qltdBudgetLiveDashboardAddAlert_(alerts, 'DATA', 'RAW_REPORT_ID_DUPLICATE', 'Report ID bi trung; bo qua ban ghi lap.', parsed, Object.assign({}, meta, {
        firstRowNumber: seenReports[parsed.reportId]
      }));
      return;
    }
    seenReports[parsed.reportId] = entry.rowNumber;

    if (parsed.syncStatus !== 'SYNCED') {
      qltdBudgetLiveDashboardAddAlert_(alerts, 'DATA', 'RAW_NOT_SYNCED', 'Dong Raw chua SYNCED; khong tinh vao thuc hien.', parsed, meta);
      return;
    }
    if (qltdBudgetNormalizeKey_(parsed.confirmStatus) !== 'daxacnhan') {
      qltdBudgetLiveDashboardAddAlert_(alerts, 'DATA', 'RAW_NOT_CONFIRMED', 'Dong Raw chua Da xac nhan; khong tinh vao thuc hien.', parsed, meta);
      return;
    }
    if (qltdBudgetNormalizeKey_(parsed.recordType) !== 'performanceactual') return;
    if (parsed.projectCode !== input.projectCode) return;
    if (input.deptCode && parsed.deptCode !== input.deptCode) return;

    const item = itemByKey[qltdBudgetLiveDashboardItemKey_(parsed.projectCode, parsed.deptCode, parsed.budgetItemCode)];
    if (!item) {
      qltdBudgetLiveDashboardAddAlert_(alerts, 'DATA', 'RAW_WITHOUT_ACTIVE_ITEM', 'Dong Raw co thuc hien nhung khong co Budget Item ACTIVE phu hop.', parsed, meta);
      return;
    }

    const allocation = allocationIndex[qltdBudgetNormalizeCode_(parsed.allocationCode)];
    const rawError = qltdBudgetLiveDashboardValidateRawActual_(parsed, item, allocation);
    if (rawError) {
      qltdBudgetLiveDashboardAddAlert_(alerts, 'DATA', rawError.code, rawError.message, parsed, meta);
      return;
    }

    item.actualAmount += parsed.actualAmount;
    const flow = item.flowType === 'THU' ? totals.THU : totals.CHI;
    flow.actual += parsed.actualAmount;
  });
}

function qltdBudgetLiveDashboardParseRaw_(entry, headerMap) {
  const row = entry.raw || [];
  const actualFlowRaw = qltdBudgetGetCell_(row, headerMap, 'Gia tri thuc thu/chi ky nay', '');
  const actualFallbackRaw = qltdBudgetGetCell_(row, headerMap, 'Gia tri thuc hien ky nay', 0);
  const deptCodeText = qltdBudgetFindHeaderIndex_(headerMap, 'Ma phong/ban') >= 0
    ? String(qltdBudgetGetCell_(row, headerMap, 'Ma phong/ban', '') || '').trim()
    : '';
  return {
    reportId: String(qltdBudgetGetCell_(row, headerMap, 'Report ID', '') || '').trim(),
    projectCode: qltdBudgetNormalizeCode_(qltdBudgetGetCell_(row, headerMap, 'Ma du an', '')),
    projectName: String(qltdBudgetGetCell_(row, headerMap, 'Ten du an', '') || '').trim(),
    deptCode: qltdBudgetNormalizeCode_(deptCodeText),
    deptName: String(qltdBudgetGetCell_(row, headerMap, 'Phong/Ban', '') || '').trim(),
    budgetItemCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma khoan ngan sach', '') || '').trim(),
    budgetItemName: String(qltdBudgetGetCell_(row, headerMap, 'Ten khoan ngan sach', '') || '').trim(),
    masterTaskCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma cong viec Master', '') || '').trim(),
    allocationCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma phan bo', '') || '').trim(),
    flowType: qltdBudgetNormalizeFlowType_(qltdBudgetGetCell_(row, headerMap, 'Huong dong tien', '')).value || '',
    recordType: String(qltdBudgetGetCell_(row, headerMap, 'Loai ban ghi', '') || '').trim(),
    confirmStatus: String(qltdBudgetGetCell_(row, headerMap, 'Trang thai xac nhan', '') || '').trim(),
    syncStatus: String(qltdBudgetGetCell_(row, headerMap, 'Sync status', '') || '').trim().toUpperCase(),
    actualAmount: qltdBudgetToNumber_(actualFlowRaw === '' ? actualFallbackRaw : actualFlowRaw),
    periodType: String(qltdBudgetGetCell_(row, headerMap, 'Loai ky', '') || '').trim(),
    periodCode: String(qltdBudgetGetCell_(row, headerMap, 'Ma ky', '') || '').trim()
  };
}

function qltdBudgetLiveDashboardValidateRawActual_(raw, item, allocation) {
  if (!allocation || allocation.status !== 'CONFIRMED') return { code: 'RAW_ALLOCATION_NOT_CONFIRMED', message: 'Raw khong gan phan bo CONFIRMED hop le.' };
  if (qltdBudgetNormalizeCode_(raw.allocationCode) !== qltdBudgetNormalizeCode_(item.allocationCode)) return { code: 'RAW_ITEM_ALLOCATION_MISMATCH', message: 'Raw khong khop Ma phan bo cua Budget Item.' };
  if (raw.flowType !== item.flowType || raw.flowType !== allocation.flowType) return { code: 'RAW_FLOW_MISMATCH', message: 'Raw khong khop Huong dong tien.' };
  if (raw.projectCode !== item.projectCode || allocation.projectCode !== item.projectCode) return { code: 'RAW_PROJECT_MISMATCH', message: 'Raw khong khop Ma du an.' };
  if (raw.deptCode !== qltdBudgetNormalizeCode_(item.deptCode) || qltdBudgetNormalizeCode_(allocation.deptCode) !== qltdBudgetNormalizeCode_(item.deptCode)) return { code: 'RAW_DEPT_MISMATCH', message: 'Raw khong khop Ma phong/ban.' };
  return null;
}

function qltdBudgetLiveDashboardFinalizeItem_(item, alerts) {
  item.remainingAmount = Math.max(Number(item.plannedAmount || 0) - Number(item.actualAmount || 0), 0);
  item.overAmount = Math.max(Number(item.actualAmount || 0) - Number(item.plannedAmount || 0), 0);
  item.usageRate = Number(item.plannedAmount || 0) > 0 ? Number(item.actualAmount || 0) / Number(item.plannedAmount || 0) : null;
  if (!item.allocationValid) return;

  const actual = Number(item.actualAmount || 0);
  const plan = Number(item.plannedAmount || 0);
  const rate = item.usageRate === null ? 0 : item.usageRate;
  if (item.flowType === 'CHI') {
    if (plan > 0 && actual === 0) qltdBudgetLiveDashboardSetItemAlert_(item, alerts, 'INFO', 'CHUA_THUC_HIEN', 'Chua thuc hien');
    else if (rate > 1) qltdBudgetLiveDashboardSetItemAlert_(item, alerts, 'CRITICAL', 'VUOT_TRAN', 'Vuot tran');
    else if (rate >= 0.9) qltdBudgetLiveDashboardSetItemAlert_(item, alerts, 'WARNING', 'SAP_HET_NGAN_SACH', 'Sap het ngan sach');
    else if (rate >= 0.8) qltdBudgetLiveDashboardSetItemAlert_(item, alerts, 'INFO', 'CAN_CHU_Y', 'Can chu y');
    else qltdBudgetLiveDashboardSetItemState_(item, 'NORMAL', 'Trong nguong');
    return;
  }

  if (plan > 0 && actual === 0) qltdBudgetLiveDashboardSetItemAlert_(item, alerts, 'INFO', 'CHUA_GHI_NHAN_THU', 'Chua ghi nhan');
  else if (rate >= 1) qltdBudgetLiveDashboardSetItemState_(item, 'NORMAL', rate > 1 ? 'Vuot ke hoach' : 'Dat ke hoach');
  else qltdBudgetLiveDashboardSetItemState_(item, 'NORMAL', 'Dang ghi nhan');
}

function qltdBudgetLiveDashboardSetItemState_(item, severity, label) {
  item.severity = severity;
  item.statusLabel = label;
}

function qltdBudgetLiveDashboardSetItemAlert_(item, alerts, severity, code, label) {
  qltdBudgetLiveDashboardSetItemState_(item, severity, label);
  qltdBudgetLiveDashboardAddAlert_(alerts, 'BUSINESS', code, label, item, {
    severity: severity,
    plannedAmount: item.plannedAmount,
    actualAmount: item.actualAmount,
    flowType: item.flowType
  });
}

function qltdBudgetLiveDashboardFinalizeFlow_(flow) {
  const plan = Number(flow.plan || 0);
  const actual = Number(flow.actual || 0);
  return {
    flowType: flow.flowType,
    planAmount: plan,
    actualAmount: actual,
    remainingAmount: Math.max(plan - actual, 0),
    overAmount: Math.max(actual - plan, 0),
    usageRate: plan > 0 ? actual / plan : null
  };
}

function qltdBudgetLiveDashboardEmptyFlow_(flowType) {
  return {
    flowType: flowType,
    plan: 0,
    actual: 0
  };
}

function qltdBudgetLiveDashboardItemKey_(projectCode, deptCode, budgetItemCode) {
  return [qltdBudgetNormalizeCode_(projectCode), qltdBudgetNormalizeCode_(deptCode), qltdBudgetNormalizeCode_(budgetItemCode)].join('|');
}

function qltdBudgetLiveDashboardAddAlert_(alerts, category, code, message, item, extra) {
  alerts.push(Object.assign({
    category: category,
    code: code,
    message: message || code,
    projectCode: item && item.projectCode || '',
    deptCode: item && item.deptCode || '',
    budgetItemCode: item && item.budgetItemCode || '',
    budgetItemName: item && item.budgetItemName || '',
    allocationCode: item && item.allocationCode || '',
    flowType: item && item.flowType || '',
    severity: category === 'DATA' ? 'DATA' : (extra && extra.severity) || ''
  }, extra || {}));
}

function qltdBudgetLiveDashboardAlertSummary_(alerts) {
  const summary = {
    total: alerts.length,
    data: 0,
    business: 0,
    critical: 0,
    warning: 0,
    info: 0
  };
  (alerts || []).forEach(function(alert) {
    if (alert.category === 'DATA') summary.data += 1;
    if (alert.category === 'BUSINESS') summary.business += 1;
    const severity = String(alert.severity || '').toUpperCase();
    if (severity === 'CRITICAL') summary.critical += 1;
    else if (severity === 'WARNING') summary.warning += 1;
    else if (severity === 'INFO') summary.info += 1;
  });
  return summary;
}

function qltdBudgetLiveDashboardCompareItems_(a, b) {
  if (String(a.flowType || '') !== String(b.flowType || '')) return String(a.flowType || '').localeCompare(String(b.flowType || ''));
  if (String(a.deptCode || '') !== String(b.deptCode || '')) return String(a.deptCode || '').localeCompare(String(b.deptCode || ''));
  return String(a.budgetItemCode || '').localeCompare(String(b.budgetItemCode || ''));
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
