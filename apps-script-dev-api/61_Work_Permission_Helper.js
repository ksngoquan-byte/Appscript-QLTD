const QLTD_WORK_SOURCE = 'work_backend_mvp_v1';
const QLTD_WORK_DEPT_TASK_HEADER_ROW = 4;
const QLTD_WORK_REQUIRED_HEADERS = [
  'STT',
  'Nội dung công việc',
  'Ngày bắt đầu kế hoạch',
  'Ngày kết thúc kế hoạch',
  'Trạng thái thực hiện',
  'Bắt đầu thực tế',
  'Hoàn thành thực tế',
  'Người chủ trì',
  'Người phối hợp',
  'Ghi chú cập nhật',
  'Mã công việc Master',
  'Loại dòng'
];

function qltdWorkResponse_(success, action, data, warnings, errors, meta) {
  return {
    success: !!success,
    apiStatus: success ? 'OK' : 'ERROR',
    source: QLTD_WORK_SOURCE,
    data: success ? (data || {}) : (data === undefined ? null : data),
    warnings: warnings || [],
    errors: errors || [],
    meta: Object.assign({
      action: action || '',
      generatedAt: qltdBudgetNowIso_()
    }, meta || {})
  };
}

function qltdWorkOk_(action, data, warnings, meta) {
  return qltdWorkResponse_(true, action, data || {}, warnings || [], [], meta || {});
}

function qltdWorkError_(action, code, message, meta, warnings) {
  return qltdWorkResponse_(false, action, null, warnings || [], [{
    code: code,
    message: message || code
  }], meta || {});
}

function qltdWorkNormalizeEmail_(value) {
  return qltdUsersNormalizeEmail_(value);
}

function qltdWorkNormalizeCode_(value) {
  return qltdBudgetNormalizeCode_(value);
}

function qltdWorkNormalizeText_(value) {
  return String(value || '').trim();
}

function qltdWorkGetActiveUser_(email, action) {
  const normalizedEmail = qltdWorkNormalizeEmail_(email);
  if (!normalizedEmail) {
    return {
      user: null,
      error: qltdWorkError_(action, 'EMAIL_REQUIRED', 'email la bat buoc.', {})
    };
  }
  const user = qltdUsersGetByEmail_(normalizedEmail);
  if (!user || user.status !== 'ACTIVE') {
    return {
      user: null,
      error: qltdWorkError_(action, 'USER_NOT_ACTIVE', 'Nguoi dung khong ton tai hoac khong ACTIVE.', { email: normalizedEmail })
    };
  }
  return {
    user: user,
    error: null
  };
}

function qltdWorkCanReadSystem_(user) {
  return ['ADMIN', 'PMO'].indexOf(qltdUsersNormalizeRole_(user && user.role)) !== -1;
}

function qltdWorkCanManageDept_(user, deptCode) {
  const role = qltdUsersNormalizeRole_(user && user.role);
  if (role === 'ADMIN' || role === 'PMO') return true;
  if (role !== 'EDITOR') return false;
  return qltdWorkNormalizeCode_(user && user.deptCode) === qltdWorkNormalizeCode_(deptCode);
}

function qltdWorkCanUpdateOwnTask_(user) {
  return ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'].indexOf(qltdUsersNormalizeRole_(user && user.role)) !== -1;
}

function qltdWorkIsViewer_(user) {
  return qltdUsersNormalizeRole_(user && user.role) === 'VIEWER';
}

function qltdWorkLoadUsersByDept_() {
  const sheet = qltdUsersEnsureSheet_();
  const lastRow = sheet.getLastRow();
  const result = {
    byEmail: {},
    byDeptName: {}
  };
  if (lastRow < 2) return result;
  const values = sheet.getRange(2, 1, lastRow - 1, QLTD_USERS_HEADERS.length).getValues();
  values.forEach(function(row) {
    const user = {
      email: qltdWorkNormalizeEmail_(row[0]),
      displayName: qltdWorkNormalizeText_(row[1]),
      role: qltdUsersNormalizeRole_(row[2]),
      status: qltdUsersNormalizeStatus_(row[3]),
      deptCode: qltdWorkNormalizeCode_(row[4]),
      deptName: qltdWorkNormalizeText_(row[5])
    };
    if (!user.email) return;
    result.byEmail[user.email] = user;
    const deptKey = user.deptCode;
    const nameKey = qltdBudgetNormalizeKey_(user.displayName);
    if (user.status === 'ACTIVE' && deptKey && nameKey) {
      const key = deptKey + '|' + nameKey;
      if (!result.byDeptName[key]) result.byDeptName[key] = [];
      result.byDeptName[key].push(user);
    }
  });
  return result;
}

function qltdWorkParsePersonList_(value, deptCode, userIndex, warnings, context) {
  const raw = qltdWorkNormalizeText_(value);
  if (!raw) return [];
  return raw.split(';').map(function(part) {
    return qltdWorkResolvePerson_(part, deptCode, userIndex, warnings, context);
  }).filter(function(person) {
    return !!person && !!person.email;
  });
}

function qltdWorkResolvePerson_(value, deptCode, userIndex, warnings, context) {
  const raw = qltdWorkNormalizeText_(value);
  if (!raw) return null;
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    const email = qltdWorkNormalizeEmail_(emailMatch[0]);
    const user = userIndex.byEmail[email];
    if (!user || user.status !== 'ACTIVE' || qltdWorkNormalizeCode_(user.deptCode) !== qltdWorkNormalizeCode_(deptCode)) {
      warnings.push(qltdBudgetWarning_('ASSIGNEE_UNRESOLVED', 'Khong resolve duoc nguoi duoc giao theo email active dung phong/ban.', Object.assign({ value: raw, email: email }, context || {})));
      return null;
    }
    return {
      email: user.email,
      displayName: user.displayName,
      raw: raw
    };
  }

  const key = qltdWorkNormalizeCode_(deptCode) + '|' + qltdBudgetNormalizeKey_(raw);
  const matches = userIndex.byDeptName[key] || [];
  if (matches.length !== 1) {
    warnings.push(qltdBudgetWarning_('ASSIGNEE_UNRESOLVED', 'Khong resolve duoc nguoi duoc giao theo DisplayName duy nhat trong phong/ban.', Object.assign({ value: raw, matchCount: matches.length }, context || {})));
    return null;
  }
  return {
    email: matches[0].email,
    displayName: matches[0].displayName,
    raw: raw
  };
}

function qltdWorkFormatAssignee_(user) {
  return qltdWorkNormalizeText_(user && user.displayName) + ' <' + qltdWorkNormalizeEmail_(user && user.email) + '>';
}
