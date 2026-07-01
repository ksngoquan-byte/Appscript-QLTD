const QLTD_EMPLOYEE_SOURCE_SPREADSHEET_ID = '1Tu3t6RyNJC3dkpnlBobdjR2yvP17UYrfish9jlXoQ3g';
const QLTD_EMPLOYEE_SOURCE_SHEET = 'USERS_SOFTWARE';
const QLTD_EMPLOYEE_REQUIRED_HEADERS = [
  'EMP_CODE',
  'FULL_NAME',
  'DEPT_SOURCE',
  'POSITION_SOURCE',
  'DEPT_CODE',
  'ROLE_CODE',
  'ACTIVE_STATUS'
];
const QLTD_EMPLOYEE_ACTIVE_STATUS = 'Đang làm việc';
const QLTD_EMPLOYEE_LOOKUP_CACHE_TTL_SECONDS = 3600;
const QLTD_EMPLOYEE_LOOKUP_CACHE_PREFIX = 'employee_lookup_v1_';
const QLTD_EMPLOYEE_LOOKUP_CACHE_MAX_CHARS = 80000;

function qltdEmployeesNormalizeCode_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdEmployeesNormalizeName_(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi-VN');
}

function qltdEmployeesNormalizeRoleText_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đđ]/g, 'd')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function qltdEmployeesLookupByName_(fullName) {
  const normalizedName = qltdEmployeesNormalizeName_(fullName);
  if (!normalizedName) {
    return qltdUsersBuildAuthError_('FULL_NAME_REQUIRED', 'Vui lòng nhập họ và tên.');
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = qltdEmployeesLookupCacheKey_(normalizedName);
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    try {
      return qltdEmployeesLookupResponse_(JSON.parse(cached));
    } catch (ignore) {
      // Cache miss fallback below.
    }
  }

  const source = qltdEmployeesReadSource_();
  if (!source.success) return source;
  const index = {};
  source.rows.forEach(function(employee) {
    if (!qltdEmployeesIsValid_(employee)) return;
    const key = qltdEmployeesNormalizeName_(employee.fullName);
    if (!index[key]) index[key] = [];
    index[key].push(employee);
  });
  const matches = (index[normalizedName] || []).map(qltdEmployeesPublicProfile_);
  const serialized = JSON.stringify(matches);
  if (serialized.length <= QLTD_EMPLOYEE_LOOKUP_CACHE_MAX_CHARS) {
    cache.put(cacheKey, serialized, QLTD_EMPLOYEE_LOOKUP_CACHE_TTL_SECONDS);
  }
  return qltdEmployeesLookupResponse_(matches);
}

function qltdEmployeesLookupResponse_(matches) {
  const profiles = Array.isArray(matches) ? matches : [];
  if (!profiles.length) {
    return qltdUsersBuildAuthError_('NAME_NOT_FOUND', 'Không tìm thấy nhân sự phù hợp.', {
      profiles: []
    });
  }
  return {
    success: true,
    profiles: profiles,
    matchCount: profiles.length,
    apiStatus: 'CONNECTED',
    source: 'users_software'
  };
}

function qltdEmployeesLookupCacheKey_(normalizedName) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalizedName,
    Utilities.Charset.UTF_8
  );
  return QLTD_EMPLOYEE_LOOKUP_CACHE_PREFIX + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function qltdEmployeesReadByCodeFresh_(empCode) {
  const targetCode = qltdEmployeesNormalizeCode_(empCode);
  if (!targetCode) {
    return qltdUsersBuildAuthError_('EMPLOYEE_CODE_REQUIRED', 'Vui lòng chọn đúng hồ sơ nhân sự.');
  }
  const source = qltdEmployeesReadSource_();
  if (!source.success) return source;
  const matches = source.rows.filter(function(item) {
    return item.empCode === targetCode;
  });
  if (!matches.length) {
    return qltdUsersBuildAuthError_('EMPLOYEE_NOT_FOUND', 'Không tìm thấy hồ sơ nhân sự.');
  }
  if (matches.length !== 1) {
    return qltdUsersBuildAuthError_('EMPLOYEE_NOT_UNIQUE', 'Mã nhân sự không xác định duy nhất một hồ sơ.');
  }
  const employee = matches[0];
  if (qltdEmployeesNormalizeName_(employee.activeStatus) !== qltdEmployeesNormalizeName_(QLTD_EMPLOYEE_ACTIVE_STATUS)) {
    return qltdUsersBuildAuthError_('EMPLOYEE_INACTIVE', 'Hồ sơ không còn trạng thái làm việc.');
  }
  if (!employee.fullName) {
    return qltdUsersBuildAuthError_('EMPLOYEE_NOT_FOUND', 'Hồ sơ nhân sự chưa có họ tên hợp lệ.');
  }
  if (!employee.deptCode) {
    return qltdUsersBuildAuthError_('EMPLOYEE_DEPT_INVALID', 'Hồ sơ nhân sự chưa có Phòng/Ban hợp lệ.');
  }
  return { success: true, employee: employee };
}

function qltdEmployeesReadSource_() {
  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(QLTD_EMPLOYEE_SOURCE_SPREADSHEET_ID);
  } catch (error) {
    return qltdUsersBuildAuthError_('EMPLOYEE_SOURCE_UNAVAILABLE', 'Không mở được nguồn nhân sự.');
  }
  const sheet = spreadsheet.getSheetByName(QLTD_EMPLOYEE_SOURCE_SHEET);
  if (!sheet) {
    return qltdUsersBuildAuthError_('EMPLOYEE_SOURCE_UNAVAILABLE', 'Không tìm thấy sheet USERS_SOFTWARE.');
  }
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    return qltdUsersBuildAuthError_('EMPLOYEE_SOURCE_INVALID', 'Nguồn nhân sự đang trống.');
  }
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headers = values[0].map(function(value) { return String(value || '').trim(); });
  const headerMap = {};
  headers.forEach(function(header, index) {
    if (header && headerMap[header] === undefined) headerMap[header] = index;
  });
  const missingHeaders = QLTD_EMPLOYEE_REQUIRED_HEADERS.filter(function(header) {
    return headerMap[header] === undefined;
  });
  if (missingHeaders.length) {
    return qltdUsersBuildAuthError_('EMPLOYEE_SOURCE_INVALID', 'Nguồn nhân sự thiếu cột bắt buộc.', {
      missingHeaders: missingHeaders
    });
  }

  const rows = values.slice(1).map(function(row) {
    return {
      empCode: qltdEmployeesNormalizeCode_(row[headerMap.EMP_CODE]),
      fullName: String(row[headerMap.FULL_NAME] || '').normalize('NFC').trim().replace(/\s+/g, ' '),
      deptName: String(row[headerMap.DEPT_SOURCE] || '').trim(),
      position: String(row[headerMap.POSITION_SOURCE] || '').trim(),
      deptCode: qltdEmployeesNormalizeCode_(row[headerMap.DEPT_CODE]),
      roleCode: String(row[headerMap.ROLE_CODE] || '').trim(),
      activeStatus: String(row[headerMap.ACTIVE_STATUS] || '').trim()
    };
  });
  return { success: true, rows: rows };
}

function qltdEmployeesIsValid_(employee) {
  return !!employee.empCode &&
    !!employee.fullName &&
    !!employee.deptCode &&
    qltdEmployeesNormalizeName_(employee.activeStatus) === qltdEmployeesNormalizeName_(QLTD_EMPLOYEE_ACTIVE_STATUS);
}

function qltdEmployeesPublicProfile_(employee) {
  return {
    empCode: employee.empCode,
    fullName: employee.fullName,
    deptCode: employee.deptCode,
    deptName: employee.deptName,
    position: employee.position
  };
}

function qltdEmployeesRoleFor_(employee) {
  const empCode = qltdEmployeesNormalizeCode_(employee && employee.empCode);
  const deptCode = qltdEmployeesNormalizeCode_(employee && employee.deptCode);
  const roleCode = qltdEmployeesNormalizeRoleText_(employee && employee.roleCode);

  if (empCode === 'E2510050') return 'EDITOR';
  if (deptCode === 'BLD' || deptCode === 'KEHOACH') return 'PMO';
  if (deptCode === 'PHAPCHE') return 'EDITOR';
  if (deptCode === 'KYTHUAT' && /^truong bo phan(?:\s|$)/.test(roleCode)) return 'EDITOR';
  if (
    roleCode === 'truong phong' ||
    /^truong phong kiem(?:\s|$)/.test(roleCode) ||
    roleCode === 'pho phong' ||
    roleCode === 'chanh van phong' ||
    roleCode === 'truong ban qlda' ||
    /^phu trach phong(?:\s|$)/.test(roleCode) ||
    roleCode === 'giam doc marketing'
  ) {
    return 'EDITOR';
  }
  return 'REPORTER';
}
