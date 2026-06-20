const QLTD_PROJECTS_SHEET_NAME = 'Projects';
const QLTD_PROJECTS_HEADERS = [
  'ProjectCode',
  'ProjectName',
  'MasterSpreadsheetId',
  'DeptSpreadsheetId',
  'DefaultTaskSheet',
  'DefaultDeptSheet',
  'Status',
  'SortOrder',
  'Note'
];

const QLTD_PROJECTS_DEFAULT_NAM_CAM = {
  projectCode: '37-8.NC',
  projectName: 'Nam Cam',
  masterSpreadsheetId: '1ZAZwSjGOvKEp8iLCqLsEiJyJSFBR-jeru0RL25Q4xMM',
  deptSpreadsheetId: '1CW2n_SYUZkFCpTTT1B3vG2f59N2wPHlIv_mP0slszrs',
  defaultTaskSheet: 'Cong_viec',
  defaultDeptSheet: '*',
  status: 'ACTIVE',
  sortOrder: 1,
  note: 'Initial DEV project - two sheet mapping'
};

function qltdSetupProjectsSheet() {
  const sheet = qltdProjectsEnsureSheet_();
  qltdProjectsSeedDefaultIfMissing_();

  return {
    success: true,
    sheetName: sheet.getName(),
    headers: QLTD_PROJECTS_HEADERS
  };
}

function qltdProjectsEnsureSheet_() {
  const ss = getCurrentSpreadsheet_();
  let sheet = ss.getSheetByName(QLTD_PROJECTS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(QLTD_PROJECTS_SHEET_NAME);
  }

  qltdProjectsEnsureHeaders_(sheet);
  return sheet;
}

function qltdProjectsEnsureHeaders_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, QLTD_PROJECTS_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  const hasMissingHeader = QLTD_PROJECTS_HEADERS.some(function(header, index) {
    return currentHeaders[index] !== header;
  });

  if (hasMissingHeader) {
    headerRange.setValues([QLTD_PROJECTS_HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function qltdProjectsSeedDefaultIfMissing_() {
  const sheet = qltdProjectsEnsureSheet_();
  const existing = qltdProjectsFindRowByCode_(QLTD_PROJECTS_DEFAULT_NAM_CAM.projectCode);

  const values = [
    QLTD_PROJECTS_DEFAULT_NAM_CAM.projectCode,
    QLTD_PROJECTS_DEFAULT_NAM_CAM.projectName,
    QLTD_PROJECTS_DEFAULT_NAM_CAM.masterSpreadsheetId,
    QLTD_PROJECTS_DEFAULT_NAM_CAM.deptSpreadsheetId,
    QLTD_PROJECTS_DEFAULT_NAM_CAM.defaultTaskSheet,
    QLTD_PROJECTS_DEFAULT_NAM_CAM.defaultDeptSheet,
    QLTD_PROJECTS_DEFAULT_NAM_CAM.status,
    QLTD_PROJECTS_DEFAULT_NAM_CAM.sortOrder,
    QLTD_PROJECTS_DEFAULT_NAM_CAM.note
  ];

  if (existing) {
    return false;
  }

  sheet.appendRow(values);
  return true;
}

function qltdProjectsFindRowByCode_(projectCode) {
  const normalizedCode = qltdProjectsNormalizeCode_(projectCode);
  const sheet = qltdProjectsEnsureSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return null;

  const codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let index = 0; index < codes.length; index += 1) {
    if (qltdProjectsNormalizeCode_(codes[index][0]) === normalizedCode) {
      return {
        rowIndex: index + 2
      };
    }
  }

  return null;
}

function qltdProjectsGetByCode_(projectCode) {
  const normalizedCode = qltdProjectsNormalizeCode_(projectCode);
  if (!normalizedCode) return null;

  const projects = qltdProjectsListAll_();
  for (let index = 0; index < projects.length; index += 1) {
    if (qltdProjectsNormalizeCode_(projects[index].projectCode) === normalizedCode) {
      return projects[index];
    }
  }

  return null;
}

function qltdProjectsListActive_() {
  return qltdProjectsListAll_()
    .filter(function(project) {
      return project.status === 'ACTIVE';
    })
    .sort(qltdProjectsSort_);
}

function qltdProjectsListForUser_(email) {
  const normalizedEmail = qltdUsersNormalizeEmail_(email);
  const user = normalizedEmail ? qltdUsersGetByEmail_(normalizedEmail) : null;

  const allProjects = qltdProjectsListActive_();

  if (!user) return allProjects;

  if (user.role === 'ADMIN') {
    return allProjects;
  }

  const allowedProjectCodes = qltdProjectDeptsGetAllowedProjectCodesForUser_(user, normalizedEmail);
  if (!allowedProjectCodes.length) return [];

  return allProjects.filter(function(project) {
    return allowedProjectCodes.indexOf(qltdProjectsNormalizeCode_(project.projectCode)) !== -1;
  });
}

function qltdProjectsListAll_() {
  qltdProjectsEnsureSheet_();
  qltdProjectsSeedDefaultIfMissing_();
  return qltdProjectsListAllRaw_();
}

function qltdProjectsListAllRaw_() {
  const sheet = qltdProjectsEnsureSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet
    .getRange(2, 1, lastRow - 1, QLTD_PROJECTS_HEADERS.length)
    .getValues();

  return values
    .map(function(row, index) {
      return {
        rowIndex: index + 2,
        projectCode: qltdProjectsNormalizeCode_(row[0]),
        projectName: String(row[1] || '').trim(),
        masterSpreadsheetId: String(row[2] || '').trim(),
        deptSpreadsheetId: String(row[3] || '').trim(),
        defaultTaskSheet: String(row[4] || 'Cong_viec').trim() || 'Cong_viec',
        defaultDeptSheet: String(row[5] || '*').trim() || '*',
        status: qltdProjectsNormalizeStatus_(row[6]),
        sortOrder: row[7] || '',
        note: String(row[8] || '').trim()
      };
    })
    .filter(function(project) {
      return !!project.projectCode && !!project.projectName;
    });
}

function qltdProjectsSort_(a, b) {
  const aOrder = Number(a.sortOrder || 9999);
  const bOrder = Number(b.sortOrder || 9999);
  if (aOrder !== bOrder) return aOrder - bOrder;
  return String(a.projectName || '').localeCompare(String(b.projectName || ''));
}

function qltdProjectsNormalizeCode_(projectCode) {
  return String(projectCode || '').trim().toUpperCase();
}

function qltdProjectsNormalizeStatus_(status) {
  return String(status || 'ACTIVE').trim().toUpperCase();
}
