const QLTD_MAIN_MILESTONES_SHEET_NAME = 'QLTD_MAIN_MILESTONES';
const QLTD_MAIN_MILESTONES_HEADERS = [
  'PROJECT_CODE',
  'MAIN_MILESTONE_IDS_JSON',
  'MAIN_MILESTONE_CODES_JSON',
  'UPDATED_BY',
  'UPDATED_AT'
];

function qltdMainMilestonesNormalizeProjectCode_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const displayMatch = raw.match(/^(.+?)\s+-\s+.+$/);
  return String(displayMatch ? displayMatch[1] : raw).trim().toUpperCase();
}

function qltdMainMilestonesEnsureSheet_() {
  const ss = getCurrentSpreadsheet_();
  let sheet = ss.getSheetByName(QLTD_MAIN_MILESTONES_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(QLTD_MAIN_MILESTONES_SHEET_NAME);

  const headerRange = sheet.getRange(1, 1, 1, QLTD_MAIN_MILESTONES_HEADERS.length);
  const current = headerRange.getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  const invalid = QLTD_MAIN_MILESTONES_HEADERS.some(function(header, index) {
    return current[index] !== header;
  });
  if (invalid) {
    headerRange.setValues([QLTD_MAIN_MILESTONES_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function qltdMainMilestonesFindRow_(sheet, projectCode) {
  const normalized = qltdMainMilestonesNormalizeProjectCode_(projectCode);
  const lastRow = sheet.getLastRow();
  if (!normalized || lastRow < 2) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let index = 0; index < values.length; index += 1) {
    if (qltdMainMilestonesNormalizeProjectCode_(values[index][0]) === normalized) return index + 2;
  }
  return 0;
}

function qltdMainMilestonesParseList_(value) {
  if (Array.isArray(value)) return qltdMainMilestonesUniqueStrings_(value);
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return qltdMainMilestonesUniqueStrings_(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    return qltdMainMilestonesUniqueStrings_(text.split(','));
  }
}

function qltdMainMilestonesUniqueStrings_(values) {
  const seen = {};
  return (values || []).map(function(value) {
    return String(value || '').trim();
  }).filter(function(value) {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}

function qltdMainMilestonesGet_(projectCode, email, skipEmailCheck) {
  const normalizedProjectCode = qltdMainMilestonesNormalizeProjectCode_(projectCode);
  const normalizedEmail = qltdUsersNormalizeEmail_(email);
  if (!normalizedProjectCode) return { success: false, message: 'PROJECT_CODE_REQUIRED' };
  if (!skipEmailCheck && !normalizedEmail) return { success: false, message: 'AUTHENTICATION_REQUIRED' };

  const sheet = qltdMainMilestonesEnsureSheet_();
  const rowIndex = qltdMainMilestonesFindRow_(sheet, normalizedProjectCode);
  let ids = [];
  let codes = [];
  let updatedBy = '';
  let updatedAt = '';
  if (rowIndex) {
    const row = sheet.getRange(rowIndex, 1, 1, QLTD_MAIN_MILESTONES_HEADERS.length).getValues()[0];
    ids = qltdMainMilestonesParseList_(row[1]);
    codes = qltdMainMilestonesParseList_(row[2]);
    updatedBy = String(row[3] || '').trim();
    updatedAt = row[4] || '';
  }

  return {
    success: true,
    projectCode: normalizedProjectCode,
    ids: ids,
    codes: codes,
    items: [],
    updatedBy: updatedBy,
    updatedAt: updatedAt,
    source: 'QLTD_MAIN_MILESTONES'
  };
}

function qltdMainMilestonesGetWriter_(email) {
  const normalizedEmail = qltdUsersNormalizeEmail_(email);
  if (!normalizedEmail) return { error: 'AUTHENTICATION_REQUIRED' };
  const user = qltdUsersGetByEmail_(normalizedEmail);
  if (!user) return { error: 'USER_NOT_FOUND' };
  if (user.status !== 'ACTIVE') return { error: 'USER_INACTIVE' };
  if (!qltdPermissionsCanWriteMainMilestones_(user.role)) return { error: 'PERMISSION_DENIED' };
  return { user: user };
}

function qltdMainMilestonesSave_(projectCode, idsValue, codesValue, email) {
  const normalizedProjectCode = qltdMainMilestonesNormalizeProjectCode_(projectCode);
  if (!normalizedProjectCode) return { success: false, message: 'PROJECT_CODE_REQUIRED' };
  const auth = qltdMainMilestonesGetWriter_(email);
  if (auth.error) return { success: false, message: auth.error };

  const ids = qltdMainMilestonesParseList_(idsValue);
  const codes = qltdMainMilestonesParseList_(codesValue);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = qltdMainMilestonesEnsureSheet_();
    const rowIndex = qltdMainMilestonesFindRow_(sheet, normalizedProjectCode);
    const values = [[
      normalizedProjectCode,
      JSON.stringify(ids),
      JSON.stringify(codes),
      auth.user.email,
      new Date()
    ]];
    if (rowIndex) {
      sheet.getRange(rowIndex, 1, 1, QLTD_MAIN_MILESTONES_HEADERS.length).setValues(values);
    } else {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, QLTD_MAIN_MILESTONES_HEADERS.length).setValues(values);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return {
    success: true,
    saved: ids.length + codes.length,
    projectCode: normalizedProjectCode,
    ids: ids,
    codes: codes,
    source: 'QLTD_MAIN_MILESTONES'
  };
}

function qltdMainMilestonesReset_(projectCode, email) {
  const normalizedProjectCode = qltdMainMilestonesNormalizeProjectCode_(projectCode);
  if (!normalizedProjectCode) return { success: false, message: 'PROJECT_CODE_REQUIRED' };
  const auth = qltdMainMilestonesGetWriter_(email);
  if (auth.error) return { success: false, message: auth.error };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = qltdMainMilestonesEnsureSheet_();
    const rowIndex = qltdMainMilestonesFindRow_(sheet, normalizedProjectCode);
    if (rowIndex) sheet.deleteRow(rowIndex);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return {
    success: true,
    reset: true,
    projectCode: normalizedProjectCode,
    source: 'QLTD_MAIN_MILESTONES'
  };
}
