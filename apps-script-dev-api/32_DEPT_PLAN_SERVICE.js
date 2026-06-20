const QLTD_DEPT_PLAN_ROW_TYPE_CONTEXT = 'CONTEXT';
const QLTD_DEPT_PLAN_ROW_TYPE_MASTER = 'MASTER';
const QLTD_DEPT_PLAN_ROW_TYPE_DETAIL_SLOT = 'DETAIL_SLOT';
const QLTD_DEPT_PLAN_ROW_TYPE_PB_DETAIL = 'PB_DETAIL';

function qltdDeptPlanListForProject_(projectCode) {
  const project = qltdProjectsGetByCode_(projectCode);

  if (!project) {
    return {
      success: false,
      message: 'PROJECT_NOT_FOUND',
      projectCode: qltdProjectsNormalizeCode_(projectCode),
      apiStatus: 'CONNECTED',
      source: 'dept_plan_service'
    };
  }

  if (project.status !== 'ACTIVE') {
    return {
      success: false,
      message: 'PROJECT_INACTIVE',
      projectCode: project.projectCode,
      apiStatus: 'CONNECTED',
      source: 'dept_plan_service'
    };
  }

  if (!project.deptSpreadsheetId) {
    return {
      success: false,
      message: 'PROJECT_DEPT_SPREADSHEET_ID_MISSING',
      projectCode: project.projectCode,
      apiStatus: 'CONNECTED',
      source: 'dept_plan_service'
    };
  }

  const ss = SpreadsheetApp.openById(project.deptSpreadsheetId);
  const departments = [];
  const warnings = [];
  const mappedDepts = qltdProjectDeptsListActive_().filter(function(row) {
    return row.projectCode === project.projectCode;
  });

  if (mappedDepts.length) {
    mappedDepts.forEach(function(dept) {
      const sheet = qltdDeptPlanFindMappedSheet_(ss, dept);

      if (!sheet) {
        warnings.push({
          type: 'DEPT_SHEET_MISSING',
          projectCode: project.projectCode,
          deptCode: dept.deptCode,
          projectUnitCode: dept.projectUnitCode,
          sheetName: dept.projectUnitCode || dept.deptCode
        });
        return;
      }

      const deptPlan = qltdDeptPlanParseSheet_(sheet, project);

      if (!deptPlan) {
        warnings.push({
          type: 'DEPT_SHEET_LAYOUT_UNSUPPORTED',
          projectCode: project.projectCode,
          deptCode: dept.deptCode,
          sheetName: sheet.getName(),
          message: 'Missing required headers: Noi dung cong viec, Ma cong viec master, Loai dong'
        });
        return;
      }

      deptPlan.deptCode = dept.deptCode || deptPlan.deptCode;
      deptPlan.deptCodeRaw = dept.deptCodeRaw || deptPlan.deptCode;
      deptPlan.deptName = dept.deptName || deptPlan.deptCode;
      deptPlan.projectUnitCode = dept.projectUnitCode || '';
      deptPlan.projectUnitCodeRaw = dept.projectUnitCodeRaw || deptPlan.projectUnitCode;

      if (deptPlan.masterCount > 0) {
        departments.push(deptPlan);
      } else {
        warnings.push({
          type: 'DEPT_SHEET_EMPTY',
          projectCode: project.projectCode,
          deptCode: dept.deptCode,
          sheetName: sheet.getName()
        });
      }
    });
  } else {
    ss.getSheets().forEach(function(sheet) {
      const deptPlan = qltdDeptPlanParseSheet_(sheet, project);
      if (deptPlan && deptPlan.masterCount > 0) {
        departments.push(deptPlan);
      }
    });
  }

  if (mappedDepts.length && !departments.length && warnings.length) {
    return {
      success: true,
      projectCode: project.projectCode,
      projectName: project.projectName,
      departments: departments,
      warnings: warnings,
      apiStatus: 'CONNECTED',
      source: 'dept_plan_service'
    };
  }

  departments.sort(function(a, b) {
    const aOrder = qltdDeptPlanFindMappedSortOrder_(mappedDepts, a);
    const bOrder = qltdDeptPlanFindMappedSortOrder_(mappedDepts, b);

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return String(a.deptCode || '').localeCompare(String(b.deptCode || ''));
  });

  return {
    success: true,
    projectCode: project.projectCode,
    projectName: project.projectName,
    departments: departments,
    warnings: warnings,
    apiStatus: 'CONNECTED',
    source: 'dept_plan_service'
  };
}

function qltdDeptPlanFindMappedSheet_(ss, dept) {
  const candidates = [
    dept.projectUnitCodeRaw,
    dept.projectUnitCode,
    dept.deptCodeRaw,
    dept.deptCode,
    dept.deptName
  ].filter(function(value) {
    return !!String(value || '').trim();
  });

  for (let index = 0; index < candidates.length; index += 1) {
    const sheet = ss.getSheetByName(candidates[index]);
    if (sheet) return sheet;
  }

  return null;
}

function qltdDeptPlanFindMappedSortOrder_(mappedDepts, deptPlan) {
  const match = mappedDepts.find(function(row) {
    return row.deptCode === deptPlan.deptCode ||
      row.projectUnitCode === deptPlan.projectUnitCode ||
      row.deptCodeRaw === deptPlan.deptCodeRaw ||
      row.projectUnitCodeRaw === deptPlan.projectUnitCodeRaw ||
      row.deptName === deptPlan.deptName;
  });

  return Number(match && match.sortOrder || 9999);
}

function qltdDeptPlanParseSheet_(sheet, project) {
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 3) return null;

  const deptCode = qltdDeptPlanFindDeptCode_(values, sheet.getName());
  const headerRowIndex = qltdDeptPlanFindHeaderRowIndex_(values);
  if (headerRowIndex < 0) return null;

  const headers = values[headerRowIndex].map(function(value) {
    return String(value || '').trim();
  });
  const columnMap = qltdDeptPlanBuildColumnMap_(headers);

  if (columnMap.masterCode < 0 || columnMap.rowType < 0) {
    return null;
  }

  const contexts = [];
  const masters = [];
  let currentContext = null;
  let currentMaster = null;

  for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const rowType = qltdDeptPlanNormalizeRowType_(row[columnMap.rowType]);
    const masterCode = String(row[columnMap.masterCode] || '').trim();
    const taskName = columnMap.taskName >= 0 ? String(row[columnMap.taskName] || '').trim() : '';

    if (!rowType && !masterCode && !taskName) continue;

    const item = {
      rowIndex: rowIndex + 1,
      stt: columnMap.stt >= 0 ? String(row[columnMap.stt] || '').trim() : '',
      taskName: taskName,
      planStart: columnMap.planStart >= 0 ? qltdDeptPlanFormatDate_(row[columnMap.planStart]) : '',
      planFinish: columnMap.planFinish >= 0 ? qltdDeptPlanFormatDate_(row[columnMap.planFinish]) : '',
      budgetPlan: columnMap.budgetPlan >= 0 ? row[columnMap.budgetPlan] : '',
      status: columnMap.status >= 0 ? String(row[columnMap.status] || '').trim() : '',
      actualStart: columnMap.actualStart >= 0 ? qltdDeptPlanFormatDate_(row[columnMap.actualStart]) : '',
      actualFinish: columnMap.actualFinish >= 0 ? qltdDeptPlanFormatDate_(row[columnMap.actualFinish]) : '',
      budgetActual: columnMap.budgetActual >= 0 ? row[columnMap.budgetActual] : '',
      owner: columnMap.owner >= 0 ? String(row[columnMap.owner] || '').trim() : '',
      coordinator: columnMap.coordinator >= 0 ? String(row[columnMap.coordinator] || '').trim() : '',
      condition: columnMap.condition >= 0 ? String(row[columnMap.condition] || '').trim() : '',
      note: columnMap.note >= 0 ? String(row[columnMap.note] || '').trim() : '',
      masterCode: masterCode,
      rowType: rowType,
      detailTaskId: columnMap.detailTaskId >= 0 ? String(row[columnMap.detailTaskId] || '').trim() : '',
      progress: columnMap.progress >= 0 ? row[columnMap.progress] : '',
      weight: columnMap.weight >= 0 ? row[columnMap.weight] : ''
    };

    if (rowType === QLTD_DEPT_PLAN_ROW_TYPE_CONTEXT) {
      currentContext = item;
      currentMaster = null;
      contexts.push(currentContext);
      continue;
    }

    if (rowType === QLTD_DEPT_PLAN_ROW_TYPE_MASTER) {
      currentMaster = item;
      currentMaster.detailSlots = [];
      currentMaster.details = [];
      currentMaster.contextMasterCode = currentContext ? currentContext.masterCode : '';
      currentMaster.contextName = currentContext ? currentContext.taskName : '';
      masters.push(currentMaster);
      continue;
    }

    if (rowType === QLTD_DEPT_PLAN_ROW_TYPE_DETAIL_SLOT) {
      item.slotNo = qltdDeptPlanExtractSlotNo_(masterCode);
      item.parentMasterCode = qltdDeptPlanExtractParentMasterCode_(masterCode);

      if (currentMaster) {
        currentMaster.detailSlots.push(item);
      }
    }

    if (rowType === QLTD_DEPT_PLAN_ROW_TYPE_PB_DETAIL && currentMaster) {
      item.parentMasterCode = masterCode;
      currentMaster.details.push(item);
    }
  }

  return {
    deptCode: deptCode,
    sheetName: sheet.getName(),
    masterCount: masters.length,
    contextCount: contexts.length,
    contexts: contexts,
    masters: masters
  };
}

function qltdDeptPlanFindDeptCode_(values, fallbackSheetName) {
  for (let row = 0; row < Math.min(values.length, 5); row += 1) {
    for (let col = 0; col < Math.min(values[row].length, 5); col += 1) {
      const text = String(values[row][col] || '').trim();
      const match = text.match(/PHÃƒÆ’Ã¢â‚¬â„¢NG\/BAN:\s*(.+)$/i) || text.match(/PHONG\/BAN:\s*(.+)$/i);
      if (match && match[1]) {
        return String(match[1] || '').trim();
      }
    }
  }
  return String(fallbackSheetName || '').trim();
}

function qltdDeptPlanFindHeaderRowIndex_(values) {
  for (let row = 0; row < Math.min(values.length, 10); row += 1) {
    const normalized = values[row].map(function(value) {
      return qltdDeptPlanNormalizeHeader_(value);
    });

    if (
      normalized.indexOf('NOIDUNGCONGVIEC') !== -1 &&
      normalized.indexOf('MACONGVIECMASTER') !== -1 &&
      normalized.indexOf('LOAIDONG') !== -1
    ) {
      return row;
    }
  }

  return -1;
}

function qltdDeptPlanBuildColumnMap_(headers) {
  const normalizedHeaders = headers.map(function(header) {
    return qltdDeptPlanNormalizeHeader_(header);
  });

  return {
    stt: normalizedHeaders.indexOf('STT'),
    taskName: normalizedHeaders.indexOf('NOIDUNGCONGVIEC'),
    planStart: normalizedHeaders.indexOf('NGAYBATDAUKEHOACH'),
    planFinish: normalizedHeaders.indexOf('NGAYKETTHUCKEHOACH'),
    budgetPlan: normalizedHeaders.indexOf('KEHOACHNGANSACH'),
    status: normalizedHeaders.indexOf('TRANGTHAITHUCHIEN'),
    actualStart: normalizedHeaders.indexOf('BATDAUTHUCTE'),
    actualFinish: normalizedHeaders.indexOf('HOANTHANHTHUCTE'),
    budgetActual: normalizedHeaders.indexOf('NGANSACHTHUCTE'),
    owner: normalizedHeaders.indexOf('NGUOICHUTRI'),
    coordinator: normalizedHeaders.indexOf('NGUOIPHOIHOP'),
    condition: normalizedHeaders.indexOf('DIEUKIENDAUVAO'),
    note: normalizedHeaders.indexOf('GHICHUCAPNHAT'),
    masterCode: normalizedHeaders.indexOf('MACONGVIECMASTER'),
    rowType: normalizedHeaders.indexOf('LOAIDONG'),
    detailTaskId: normalizedHeaders.indexOf('DETAILTASKID'),
    progress: normalizedHeaders.indexOf('HOANTHANH'),
    weight: normalizedHeaders.indexOf('TRONGSO')
  };
}

function qltdDeptPlanNormalizeHeader_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ãƒâ€žÃ¢â‚¬Ëœ/g, 'd')
    .replace(/Ãƒâ€žÃ‚Â/g, 'D')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function qltdDeptPlanNormalizeRowType_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdDeptPlanExtractSlotNo_(masterCode) {
  const match = String(masterCode || '').match(/::(\d+)$/);
  return match ? match[1] : '';
}

function qltdDeptPlanExtractParentMasterCode_(masterCode) {
  const match = String(masterCode || '').match(/^DETAIL::(.+)::\d+$/);
  return match ? match[1] : '';
}

function qltdDeptPlanFormatDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '').trim();
}
