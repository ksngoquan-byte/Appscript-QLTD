const QLTD_HR_ASSIGNEE_SOURCE = 'hr_assignee_directory_v2';
const QLTD_HR_ASSIGNEE_SPREADSHEET_ID = '1PRajs_qmf-fm6XBRmKpDgv9xTKKEM8zsbMBvkOwSuQQ';
const QLTD_HR_ASSIGNEE_SHEET_NAME = 'Data';
const QLTD_HR_ASSIGNEE_CACHE_SECONDS = 600;
const QLTD_HR_ASSIGNEE_ACTIVE_STATUS = 'dang lam viec';
const QLTD_HR_ASSIGNEE_HEADERS = {
  name: 'Họ và Tên',
  status: 'Trạng thái',
  department: 'Phòng/ Ban',
  project: 'Dự án',
  position: 'Vị trí',
  email: 'Email Công ty'
};

// Mapping is independent from Project_Depts. A department is usable only after
// the project registry contains the corresponding QLTD code.
const QLTD_HR_DEPT_CODE_BY_NAME = {
  'ban quan ly du an': 'BQLDA',
  'phong phat trien du an': 'PTDA',
  'phong thiet ke ky thuat': 'THIETKE',
  'phong concept': 'THIETKE',
  'phong ket cau': 'THIETKE',
  'phong bim': 'THIETKE',
  'phong tieu chuan': 'TIEUCHUAN',
  'bo phan dau thau': 'DAUTHAU',
  'phong ke hoach': 'KEHOACH',
  'phong tai chinh': 'TAICHINH',
  'phong ke toan': 'KETOAN',
  'van phong uy ban r&d': 'UBNCSP',
  'phong phap che': 'PHAPCHE',
  'phong kiem soat xay dung': 'KSXD',
  'khoi xay dung': 'KSXD',
  'phong mkt - truyen thong': 'MKT',
  'phong quan ly kinh doanh': 'KINHDOANH',
  'phong quan ly va khai thac bds': 'VANHANH',
  'phong nhan su': 'NHANSU',
  'phong hanh chinh': 'HANHCHINH',
  'phong quan tri he thong': 'CNTT',
  'entiz tech': 'CNTT',
  'bo phan tro ly tgd': 'TROLY',
  'bo phan tro ly hdqt': 'TROLY',
  'phong giai phong mat bang': 'GPMB'
};

function qltdWorkListAssignees_(params) {
  const action = 'work_listassignees';
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_HR_ASSIGNEE_SOURCE, {});
  if (auth.error) return auth.error;

  const context = qltdWorkResolveProjectDept_(action, params || {}, QLTD_HR_ASSIGNEE_SOURCE, {});
  if (context.error) return qltdHrAssigneeNormalizeContextError_(context.error, params && params.deptCode);
  if (!qltdWorkCanReadDept_(auth.user, context.deptCode)) {
    return qltdWorkError_(QLTD_HR_ASSIGNEE_SOURCE, action, 'FORBIDDEN', 'Bạn không có quyền xem nhân sự của phòng/ban này.', {
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      email: auth.email
    }, context.warnings);
  }

  try {
    const directory = qltdHrAssigneeGetDirectory_(context);
    return qltdWorkOk_(QLTD_HR_ASSIGNEE_SOURCE, action, {
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      assignees: directory.assignees
    }, (context.warnings || []).concat(directory.warnings || []), {
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      email: auth.email,
      cacheSeconds: QLTD_HR_ASSIGNEE_CACHE_SECONDS
    });
  } catch (error) {
    Logger.log('[HR_ASSIGNEE] list failed: ' + (error && error.stack || error));
    return qltdWorkError_(QLTD_HR_ASSIGNEE_SOURCE, action, 'HR_DIRECTORY_UNAVAILABLE', 'Không thể đọc danh bạ nhân sự. Vui lòng liên hệ Admin.', {
      projectCode: context.projectCode,
      deptCode: context.deptCode,
      email: auth.email
    }, context.warnings);
  }
}

function qltdHrAssigneeNormalizeContextError_(errorResponse, requestedDeptCode) {
  const errors = errorResponse && errorResponse.errors || [];
  const isMissingDept = errors.some(function(error) { return error.code === 'DEPT_NOT_FOUND'; });
  if (!isMissingDept) return errorResponse;
  const deptCode = qltdWorkNormalizeCode_(requestedDeptCode);
  const message = deptCode === 'TAICHINH'
    ? 'Phòng Tài chính chưa được cấu hình cho dự án này. Vui lòng liên hệ Admin.'
    : 'Phòng/ban này chưa được cấu hình cho dự án. Vui lòng liên hệ Admin.';
  return qltdWorkError_(QLTD_HR_ASSIGNEE_SOURCE, 'work_listassignees', 'DEPT_NOT_CONFIGURED', message, Object.assign({}, errorResponse.meta || {}, {
    deptCode: deptCode
  }), errorResponse.warnings || []);
}

function qltdHrAssigneeGetDirectory_(context) {
  const cache = CacheService.getScriptCache();
  const cacheKey = ['hr_assignees_v2', context.projectCode, context.deptCode].join('::');
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignore) {}
  }

  const rows = qltdHrAssigneeReadRows_();
  const result = qltdHrAssigneeBuildDirectory_(rows, context.project, context.deptCode);
  cache.put(cacheKey, JSON.stringify(result), QLTD_HR_ASSIGNEE_CACHE_SECONDS);
  return result;
}

function qltdHrAssigneeReadRows_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('hr_assignee_rows_v2');
  if (cached) {
    try { return JSON.parse(cached); } catch (ignore) {}
  }
  const configuredId = PropertiesService.getScriptProperties().getProperty('HR_ASSIGNEE_SPREADSHEET_ID');
  const spreadsheetId = String(configuredId || QLTD_HR_ASSIGNEE_SPREADSHEET_ID).trim();
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(QLTD_HR_ASSIGNEE_SHEET_NAME);
  if (!sheet) throw new Error('Không tìm thấy sheet HR: ' + QLTD_HR_ASSIGNEE_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) return [];

  const headerValues = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const headerMap = {};
  headerValues.forEach(function(header, index) {
    headerMap[qltdHrAssigneeNormalizeText_(header)] = index;
  });
  const indexes = {};
  Object.keys(QLTD_HR_ASSIGNEE_HEADERS).forEach(function(key) {
    const normalizedHeader = qltdHrAssigneeNormalizeText_(QLTD_HR_ASSIGNEE_HEADERS[key]);
    if (!Object.prototype.hasOwnProperty.call(headerMap, normalizedHeader)) {
      throw new Error('Thiếu cột HR bắt buộc: ' + QLTD_HR_ASSIGNEE_HEADERS[key]);
    }
    indexes[key] = headerMap[normalizedHeader];
  });

  if (lastRow < 2) return [];
  const columns = {};
  Object.keys(indexes).forEach(function(key) {
    columns[key] = sheet.getRange(2, indexes[key] + 1, lastRow - 1, 1).getDisplayValues();
  });
  const rows = Array.from({ length: lastRow - 1 }, function(unused, index) {
    const departmentName = String(columns.department[index][0] || '').trim();
    return {
      name: String(columns.name[index][0] || '').trim(),
      status: String(columns.status[index][0] || '').trim(),
      departmentName: departmentName,
      deptCode: QLTD_HR_DEPT_CODE_BY_NAME[qltdHrAssigneeNormalizeText_(departmentName)] || '',
      project: String(columns.project[index][0] || '').trim(),
      position: String(columns.position[index][0] || '').trim(),
      email: qltdWorkNormalizeEmail_(columns.email[index][0])
    };
  }).filter(function(row) {
    return !!(row.name || row.email || row.departmentName);
  });
  cache.put('hr_assignee_rows_v2', JSON.stringify(rows), QLTD_HR_ASSIGNEE_CACHE_SECONDS);
  return rows;
}

function qltdHrAssigneeBuildDirectory_(rows, project, deptCode) {
  const normalizedDeptCode = qltdWorkNormalizeCode_(deptCode);
  const projectName = String(project && project.projectName || '').trim();
  const warnings = [];
  const assignees = rows.filter(function(row) {
    if (row.deptCode !== normalizedDeptCode) return false;
    if (qltdHrAssigneeNormalizeText_(row.status) !== QLTD_HR_ASSIGNEE_ACTIVE_STATUS) return false;
    return normalizedDeptCode !== 'BQLDA' || qltdHrAssigneeProjectMatches_(row.project, projectName, project && project.projectCode);
  }).map(function(row) {
    return {
      email: row.email,
      displayName: row.name,
      position: row.position,
      assignable: !!row.email
    };
  }).sort(function(a, b) {
    return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'vi');
  });

  if (!Object.keys(QLTD_HR_DEPT_CODE_BY_NAME).some(function(name) {
    return QLTD_HR_DEPT_CODE_BY_NAME[name] === normalizedDeptCode;
  })) {
    warnings.push(qltdWorkWarning_('HR_DEPT_MAPPING_MISSING', 'Chưa có mapping HR cho phòng/ban này.', { deptCode: normalizedDeptCode }));
  }
  return { assignees: assignees, warnings: warnings };
}

function qltdHrAssigneeProjectMatches_(hrProject, projectName, projectCode) {
  const source = qltdHrAssigneeNormalizeText_(hrProject);
  if (!source) return false;
  const targets = [projectName, projectCode].map(qltdHrAssigneeNormalizeText_).filter(String);
  return targets.some(function(target) {
    return source === target || source.indexOf(target) !== -1 || target.indexOf(source) !== -1;
  });
}

function qltdHrAssigneeNormalizeText_(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ');
}

function qltdHrAssigneeResolve_(value, context) {
  const raw = String(value || '').trim();
  if (!raw) return { raw: raw, users: [], unresolved: [], canonicalText: '', ok: true };
  const emails = qltdWorkExtractEmails_(raw);
  if (!emails.length) {
    return { raw: raw, users: [], unresolved: [{ value: raw, reason: 'EMAIL_REQUIRED' }], canonicalText: '', ok: false };
  }

  const rows = qltdHrAssigneeReadRows_();
  const users = [];
  const unresolved = [];
  emails.forEach(function(email) {
    const matches = rows.filter(function(row) { return row.email === email; });
    if (!matches.length) {
      unresolved.push({ value: email, reason: 'NOT_FOUND' });
      return;
    }
    const row = matches[0];
    if (qltdHrAssigneeNormalizeText_(row.status) !== QLTD_HR_ASSIGNEE_ACTIVE_STATUS) {
      unresolved.push({ value: email, reason: 'INACTIVE' });
      return;
    }
    if (row.deptCode !== context.deptCode) {
      unresolved.push({ value: email, reason: 'WRONG_DEPT' });
      return;
    }
    if (context.deptCode === 'BQLDA' && !qltdHrAssigneeProjectMatches_(row.project, context.project.projectName, context.projectCode)) {
      unresolved.push({ value: email, reason: 'WRONG_PROJECT' });
      return;
    }
    users.push({ email: email, displayName: row.name, position: row.position, deptCode: row.deptCode });
  });
  return {
    raw: raw,
    users: users,
    unresolved: unresolved,
    canonicalText: users.map(function(user) {
      return user.displayName ? user.displayName + ' <' + user.email + '>' : user.email;
    }).join('; '),
    ok: unresolved.length === 0
  };
}

function qltdHrAssigneeResolutionError_(action, fieldName, resolution, context, warnings) {
  const labels = {
    EMAIL_REQUIRED: 'Người được chọn chưa có email công ty.',
    INACTIVE: 'Nhân sự đã nghỉ việc hoặc không còn trạng thái đang làm việc.',
    WRONG_DEPT: 'Nhân sự không thuộc đúng phòng/ban của công việc.',
    WRONG_PROJECT: 'Nhân sự BQLDA không thuộc đúng dự án.',
    NOT_FOUND: 'Không tìm thấy nhân sự trong danh bạ HR.'
  };
  const reasons = (resolution.unresolved || []).map(function(item) { return item.reason; });
  const reason = reasons[0] || 'NOT_FOUND';
  return qltdWorkError_(QLTD_HR_ASSIGNEE_SOURCE, action, 'ASSIGNEE_' + reason, labels[reason] || labels.NOT_FOUND, context.meta, warnings || [], {
    field: fieldName,
    unresolved: resolution.unresolved || []
  });
}
