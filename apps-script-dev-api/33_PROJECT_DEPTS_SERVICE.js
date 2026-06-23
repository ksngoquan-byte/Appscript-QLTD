const QLTD_PROJECT_DEPTS_SHEET_NAME = 'Project_Depts';
const QLTD_PROJECT_DEPTS_HEADERS = [
  'ProjectCode',
  'DeptCode',
  'ProjectUnitCode',
  'DeptName',
  'Status',
  'SortOrder',
  'Note',
  'MasterDeptCode'
];

const QLTD_PROJECT_DEPTS_DEFAULT_ROWS = [
  ['37-8.NC', 'UBNCSP', 'UBNCSP', 'UBNCSP', 'ACTIVE', 1, 'Initial mapping', 'UBNCSP'],
  ['37-8.NC', 'PTDA', 'PTDA', 'PTDA', 'ACTIVE', 2, 'Initial mapping', 'PTDA'],
  ['37-8.NC', 'KEHOACH', 'KEHOACH', 'Ke hoach', 'ACTIVE', 3, 'Initial mapping', 'KEHOACH'],
  ['37-8.NC', 'PHAPCHE', 'PHAPCHE', 'Phap che', 'ACTIVE', 4, 'Initial mapping', 'PHAPCHE'],
  ['37-8.NC', 'KSXD', 'KSXD', 'KSXD', 'ACTIVE', 5, 'Initial mapping', 'KYTHUAT'],
  ['37-8.NC', 'BQLDA', 'BQLDA_NC', 'BQLDA Nam Cam', 'ACTIVE', 6, 'Initial mapping', 'QLDA']
];

function qltdSetupProjectDeptsSheet() {
  const sheet = qltdProjectDeptsEnsureSheet_();
  qltdProjectDeptsSeedDefaultsIfMissing_();

  return {
    success: true,
    sheetName: sheet.getName(),
    headers: QLTD_PROJECT_DEPTS_HEADERS
  };
}

function qltdProjectDeptsEnsureSheet_() {
  const ss = getCurrentSpreadsheet_();
  let sheet = ss.getSheetByName(QLTD_PROJECT_DEPTS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(QLTD_PROJECT_DEPTS_SHEET_NAME);
  }

  qltdProjectDeptsEnsureHeaders_(sheet);
  return sheet;
}

function qltdProjectDeptsEnsureHeaders_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, QLTD_PROJECT_DEPTS_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  const hasMissingHeader = QLTD_PROJECT_DEPTS_HEADERS.some(function(header, index) {
    return currentHeaders[index] !== header;
  });

  if (hasMissingHeader) {
    headerRange.setValues([QLTD_PROJECT_DEPTS_HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function qltdProjectDeptsSeedDefaultsIfMissing_() {
  const sheet = qltdProjectDeptsEnsureSheet_();

  QLTD_PROJECT_DEPTS_DEFAULT_ROWS.forEach(function(row) {
    const projectCode = qltdProjectsNormalizeCode_(row[0]);
    const deptCode = qltdProjectDeptsNormalizeCode_(row[1]);
    const projectUnitCode = qltdProjectDeptsNormalizeCode_(row[2]);

    if (!qltdProjectDeptsFindRow_(projectCode, deptCode, projectUnitCode)) {
      sheet.appendRow(row);
    }
  });
}

function qltdProjectDeptsFindRow_(projectCode, deptCode, projectUnitCode) {
  const rows = qltdProjectDeptsListAllRaw_();
  const normalizedProjectCode = qltdProjectsNormalizeCode_(projectCode);
  const normalizedDeptCode = qltdProjectDeptsNormalizeCode_(deptCode);
  const normalizedProjectUnitCode = qltdProjectDeptsNormalizeCode_(projectUnitCode);

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (
      row.projectCode === normalizedProjectCode &&
      row.deptCode === normalizedDeptCode &&
      row.projectUnitCode === normalizedProjectUnitCode
    ) {
      return row;
    }
  }

  return null;
}

function qltdProjectDeptsListActive_() {
  qltdProjectDeptsEnsureSheet_();
  qltdProjectDeptsSeedDefaultsIfMissing_();

  return qltdProjectDeptsListAllRaw_()
    .filter(function(row) {
      return row.status === 'ACTIVE';
    })
    .sort(function(a, b) {
      const aOrder = Number(a.sortOrder || 9999);
      const bOrder = Number(b.sortOrder || 9999);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.deptName || '').localeCompare(String(b.deptName || ''));
    });
}

function qltdProjectDeptsListAllRaw_() {
  const sheet = qltdProjectDeptsEnsureSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet
    .getRange(2, 1, lastRow - 1, QLTD_PROJECT_DEPTS_HEADERS.length)
    .getValues();

  return values
    .map(function(row, index) {
      return {
        rowIndex: index + 2,
        projectCode: qltdProjectsNormalizeCode_(row[0]),
        deptCode: qltdProjectDeptsNormalizeCode_(row[1]),
        deptCodeRaw: String(row[1] || '').trim(),
        projectUnitCode: qltdProjectDeptsNormalizeCode_(row[2]),
        projectUnitCodeRaw: String(row[2] || '').trim(),
        deptName: String(row[3] || '').trim(),
        status: qltdProjectDeptsNormalizeStatus_(row[4]),
        sortOrder: row[5] || '',
        note: String(row[6] || '').trim(),
        masterDeptCode: qltdMasterDeptCanonicalCode_(row[7] || row[1] || row[2])
      };
    })
    .filter(function(row) {
      return !!row.projectCode && !!row.deptCode;
    });
}

function qltdProjectDeptsGetAllowedProjectCodesForUser_(user, email) {
  const deptCode = qltdMasterDeptCanonicalCode_(user && user.deptCode);
  const projectUnitCode = qltdProjectDeptsGetUserProjectUnitCode_(email);

  if (!deptCode && !projectUnitCode) return [];

  const rows = qltdProjectDeptsListActive_();
  const allowed = {};

  rows.forEach(function(row) {
    const matchesDept = deptCode && row.masterDeptCode === deptCode;
    const matchesProjectUnit = projectUnitCode && row.projectUnitCode === projectUnitCode;

    if (matchesDept || matchesProjectUnit) {
      allowed[row.projectCode] = true;
    }
  });

  return Object.keys(allowed);
}

function qltdProjectDeptsGetUserProjectUnitCode_(email) {
  const normalizedEmail = qltdUsersNormalizeEmail_(email);
  if (!normalizedEmail) return '';

  const ss = getCurrentSpreadsheet_();
  const sheet = ss.getSheetByName(QLTD_USERS_SHEET_NAME);
  if (!sheet) return '';

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return '';

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });

  const emailCol = headers.indexOf('Email') + 1;
  const projectUnitCol = headers.indexOf('ProjectUnitCode') + 1;

  if (emailCol < 1 || projectUnitCol < 1) return '';

  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    if (qltdUsersNormalizeEmail_(row[emailCol - 1]) === normalizedEmail) {
      return qltdProjectDeptsNormalizeCode_(row[projectUnitCol - 1]);
    }
  }

  return '';
}

function qltdProjectDeptsNormalizeCode_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdProjectDeptsNormalizeStatus_(status) {
  return String(status || 'ACTIVE').trim().toUpperCase();
}
