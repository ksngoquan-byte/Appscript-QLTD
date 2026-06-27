const QLTD_PROJECT_DEPTS_MASTER_MIGRATION_SOURCE = 'project_depts_masterdept_migration_v1';
const QLTD_PROJECT_DEPTS_MASTER_MIGRATION_CONFIRM_TOKEN = 'YES_MASTER_DEPT_MIGRATION';

function qltdProjectDeptsMasterDeptDryRun_() {
  const sheet = qltdProjectDeptsEnsureSheet_();
  const parsed = qltdProjectDeptsMasterDeptReadRows_(sheet);
  const mapped = [];
  const unmapped = [];

  parsed.rows.forEach(function(row) {
    if (row.status !== 'ACTIVE') return;
    const proposed = qltdMasterDeptCanonicalCode_(row.masterDeptCode || row.deptCode || row.projectUnitCode);
    const item = Object.assign({}, row, {
      proposedMasterDeptCode: proposed,
      proposedMasterDeptName: qltdMasterDeptName_(proposed)
    });
    if (proposed) mapped.push(item);
    else unmapped.push(item);
  });

  return {
    success: unmapped.length === 0,
    dryRun: true,
    source: QLTD_PROJECT_DEPTS_MASTER_MIGRATION_SOURCE,
    sheetName: sheet.getName(),
    headerIndex: parsed.headerIndex,
    hasMasterDeptCodeHeader: parsed.headerIndex.MasterDeptCode !== undefined,
    totalRows: parsed.rows.length,
    activeRows: mapped.length + unmapped.length,
    mappedCount: mapped.length,
    unmappedCount: unmapped.length,
    mapped: mapped,
    unmapped: unmapped,
    headers: parsed.headers,
    rows: parsed.rows
  };
}

function qltdProjectDeptsMasterDeptApply_(payload) {
  const confirmToken = String(payload && payload.confirmToken || '').trim();
  if (confirmToken !== QLTD_PROJECT_DEPTS_MASTER_MIGRATION_CONFIRM_TOKEN) {
    return {
      success: false,
      message: 'CONFIRM_TOKEN_REQUIRED',
      source: QLTD_PROJECT_DEPTS_MASTER_MIGRATION_SOURCE
    };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const dryRun = qltdProjectDeptsMasterDeptDryRun_();
    if (!dryRun.success) return dryRun;

    const sheet = qltdProjectDeptsEnsureSheet_();
    qltdProjectDeptsEnsureMasterDeptHeader_(sheet);
    const parsed = qltdProjectDeptsMasterDeptReadRows_(sheet);
    const masterCol = parsed.headerIndex.MasterDeptCode + 1;
    const updates = dryRun.rows.map(function(row) {
      if (row.status !== 'ACTIVE') return [row.masterDeptCode || ''];
      return [qltdMasterDeptCanonicalCode_(row.masterDeptCode || row.deptCode || row.projectUnitCode)];
    });

    if (updates.length) {
      sheet.getRange(2, masterCol, updates.length, 1).setValues(updates);
    }
    SpreadsheetApp.flush();

    const verify = qltdProjectDeptsMasterDeptDryRun_();
    return Object.assign({}, verify, {
      applied: true,
      dryRun: false,
      updatedRows: updates.length
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

function qltdProjectDeptsEnsureMasterDeptHeader_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), QLTD_PROJECT_DEPTS_HEADERS.length);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  if (headers.indexOf('MasterDeptCode') >= 0) return false;
  sheet.getRange(1, lastCol + 1).setValue('MasterDeptCode');
  sheet.setFrozenRows(1);
  return true;
}

function qltdProjectDeptsMasterDeptReadRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(value) {
    return String(value || '').trim();
  }) : [];
  const headerIndex = {};
  headers.forEach(function(header, index) {
    if (header) headerIndex[header] = index;
  });
  const values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  const rows = values.map(function(row, index) {
    return {
      rowIndex: index + 2,
      projectCode: qltdProjectsNormalizeCode_(row[headerIndex.ProjectCode]),
      deptCode: String(row[headerIndex.DeptCode] || '').trim(),
      projectUnitCode: String(row[headerIndex.ProjectUnitCode] || '').trim(),
      deptName: String(row[headerIndex.DeptName] || '').trim(),
      status: qltdProjectDeptsNormalizeStatus_(row[headerIndex.Status]),
      sortOrder: row[headerIndex.SortOrder] || '',
      note: String(row[headerIndex.Note] || '').trim(),
      masterDeptCode: String(row[headerIndex.MasterDeptCode] || '').trim()
    };
  }).filter(function(row) {
    return !!row.projectCode && !!row.deptCode;
  });

  return {
    headers: headers,
    headerIndex: headerIndex,
    rows: rows
  };
}
