const QLTD_SELF_REGISTRATION_SOURCE = 'SELF_REGISTRATION_V1';
const QLTD_FIREBASE_WEB_API_KEY_PROPERTY = 'QLTD_FIREBASE_WEB_API_KEY';
const QLTD_SELF_REGISTRATION_EXECUTIVE_DEPT_CODE = 'EXECUTIVE';
const QLTD_SELF_REGISTRATION_EXECUTIVE_DEPT_NAME = 'Ban lãnh đạo';

const QLTD_SELF_REGISTRATION_JOB_GROUPS = [
  {
    code: 'EXECUTIVE',
    label: 'Ban lãnh đạo',
    description: 'Toàn quyền nghiệp vụ trên các dự án và phòng/ban.',
    role: 'PMO',
    requiresDept: false
  },
  {
    code: 'DEPT_MANAGER',
    label: 'Trưởng/Phó phòng, ban',
    description: 'Lập, cập nhật và rà soát dữ liệu trong phòng/ban của mình.',
    role: 'EDITOR',
    requiresDept: true
  },
  {
    code: 'SPECIALIST',
    label: 'Chuyên viên/Nhân viên',
    description: 'Lập công việc chi tiết và báo cáo tuần trong phòng/ban của mình.',
    role: 'REPORTER',
    requiresDept: true
  }
];

const QLTD_SELF_REGISTRATION_DEPT_FALLBACKS = [
  { code: 'TROLY', name: 'Trợ lý - Thư ký' },
  { code: 'PTDA', name: 'Phát triển dự án' },
  { code: 'GPMB', name: 'Giải phóng mặt bằng' },
  { code: 'THIETKE', name: 'Quản lý thiết kế' },
  { code: 'TIEUCHUAN', name: 'Tiêu chuẩn' },
  { code: 'BIM', name: 'BIM' },
  { code: 'KTXD', name: 'Kỹ thuật xây dựng' },
  { code: 'BQLDA', name: 'Ban Quản lý dự án' },
  { code: 'DAUTHAU', name: 'Đấu thầu' },
  { code: 'KEHOACH', name: 'Kế hoạch' },
  { code: 'TAICHINH', name: 'Tài chính' },
  { code: 'KETOAN', name: 'Kế toán' },
  { code: 'KINHDOANH', name: 'Kinh doanh' },
  { code: 'MKT', name: 'Marketing' },
  { code: 'PHAPCHE', name: 'Pháp chế' },
  { code: 'VANHANH', name: 'Vận hành' }
];

const QLTD_DEPT_SCOPE_ACTION_RULES = {
  work_assigntask: ['ADMIN', 'PMO', 'EDITOR'],
  work_updatetask: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  work_createdetailtask: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  work_updatedetailtask: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_taskupdates_save: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_masterapproval_review: ['ADMIN', 'PMO', 'EDITOR'],
  weekly_savedraft: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_submit: ['ADMIN', 'PMO', 'EDITOR', 'REPORTER'],
  weekly_review: ['ADMIN', 'PMO', 'EDITOR']
};

function qltdSelfRegistrationGetOptions_() {
  return {
    success: true,
    jobGroups: QLTD_SELF_REGISTRATION_JOB_GROUPS.map(function(item) {
      return {
        code: item.code,
        label: item.label,
        description: item.description,
        requiresDept: item.requiresDept
      };
    }),
    departments: qltdSelfRegistrationListDepartments_(),
    source: QLTD_SELF_REGISTRATION_SOURCE
  };
}

function qltdSelfRegistrationRegister_(payload) {
  const identity = qltdFirebaseResolveIdentity_(payload, true);
  if (!identity.success) return identity;

  const displayName = qltdSelfRegistrationSanitizeText_(payload.displayName, 120);
  const jobGroupCode = String(payload.jobGroup || '').trim().toUpperCase();
  const jobTitle = qltdSelfRegistrationSanitizeText_(payload.jobTitle, 160);
  const jobGroup = QLTD_SELF_REGISTRATION_JOB_GROUPS.find(function(item) {
    return item.code === jobGroupCode;
  });

  if (!displayName) return qltdSelfRegistrationError_('DISPLAY_NAME_REQUIRED', 'Vui lòng nhập họ và tên.');
  if (!jobGroup) return qltdSelfRegistrationError_('JOB_GROUP_INVALID', 'Nhóm chức vụ không hợp lệ.');
  if (!jobTitle) return qltdSelfRegistrationError_('JOB_TITLE_REQUIRED', 'Vui lòng nhập chức danh cụ thể.');

  let deptCode = QLTD_SELF_REGISTRATION_EXECUTIVE_DEPT_CODE;
  let deptName = QLTD_SELF_REGISTRATION_EXECUTIVE_DEPT_NAME;
  if (jobGroup.requiresDept) {
    const department = qltdSelfRegistrationFindDepartment_(payload.deptCode);
    if (!department) return qltdSelfRegistrationError_('DEPT_INVALID', 'Phòng/ban không hợp lệ hoặc chưa được kích hoạt.');
    deptCode = department.code;
    deptName = department.name;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return qltdSelfRegistrationError_('REGISTRATION_BUSY', 'Hệ thống đang xử lý đăng ký khác. Vui lòng thử lại.');

  try {
    qltdUsersEnsureSheet_();
    qltdUsersSeedAdminIfMissing_();
    const existing = qltdUsersGetByEmail_(identity.email);
    if (existing) {
      if (existing.status !== 'ACTIVE') return qltdSelfRegistrationError_('USER_INACTIVE', 'Tài khoản đã tồn tại nhưng đang bị khóa. Vui lòng liên hệ quản trị.');
      return {
        success: true,
        message: 'ALREADY_REGISTERED',
        email: existing.email,
        displayName: existing.displayName,
        role: existing.role,
        status: existing.status,
        deptCode: existing.deptCode,
        deptName: existing.deptName,
        permissions: qltdPermissionsForRole_(existing.role),
        source: QLTD_SELF_REGISTRATION_SOURCE
      };
    }

    const sheet = qltdUsersEnsureSheet_();
    const registeredAt = new Date();
    const note = [
      QLTD_SELF_REGISTRATION_SOURCE,
      'Group=' + jobGroup.code,
      'Title=' + jobTitle,
      'RegisteredAt=' + Utilities.formatDate(registeredAt, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss")
    ].join(' | ');

    sheet.appendRow([identity.email, displayName, jobGroup.role, 'ACTIVE', deptCode, deptName, registeredAt, note]);

    return {
      success: true,
      message: 'REGISTERED',
      email: identity.email,
      displayName: displayName,
      role: jobGroup.role,
      status: 'ACTIVE',
      deptCode: deptCode,
      deptName: deptName,
      permissions: qltdPermissionsForRole_(jobGroup.role),
      source: QLTD_SELF_REGISTRATION_SOURCE
    };
  } finally {
    lock.releaseLock();
  }
}

function qltdSelfRegistrationTouchLastLogin_(user) {
  if (!user || !user.rowIndex) return;
  try {
    qltdUsersEnsureSheet_().getRange(user.rowIndex, 7).setValue(new Date());
  } catch (error) {
    console.warn('Cannot update LastLoginAt', error);
  }
}

function qltdSelfRegistrationListDepartments_() {
  const fallbackByKey = {};
  QLTD_SELF_REGISTRATION_DEPT_FALLBACKS.forEach(function(item, index) {
    fallbackByKey[qltdDeptScopeNormalizeCode_(item.code)] = { code: item.code, name: item.name, sortOrder: (index + 1) * 10 };
  });

  const resultByKey = {};
  Object.keys(fallbackByKey).forEach(function(key) { resultByKey[key] = fallbackByKey[key]; });

  try {
    const sheet = getCurrentSpreadsheet_().getSheetByName('Project_Depts');
    if (sheet && sheet.getLastRow() >= 2) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues().forEach(function(row) {
        const rawCode = String(row[1] || '').trim();
        const key = qltdDeptScopeNormalizeCode_(rawCode);
        const status = String(row[4] || '').trim().toUpperCase();
        if (!key || status !== 'ACTIVE') return;
        const fallback = fallbackByKey[key];
        const rawName = String(row[3] || '').trim();
        const current = resultByKey[key];
        const sortOrder = Number(row[5]) || (current && current.sortOrder) || 9999;
        resultByKey[key] = {
          code: rawCode,
          name: fallback ? fallback.name : (qltdSelfRegistrationCleanDeptName_(rawName) || rawCode),
          sortOrder: Math.min(sortOrder, current && current.sortOrder || 9999)
        };
      });
    }
  } catch (error) {
    console.warn('Cannot read Project_Depts for self registration', error);
  }

  return Object.keys(resultByKey)
    .map(function(key) { return resultByKey[key]; })
    .filter(function(item) { return item.code && item.name; })
    .sort(function(a, b) { return (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'vi'); })
    .map(function(item) { return { code: item.code, name: item.name }; });
}

function qltdSelfRegistrationFindDepartment_(deptCode) {
  const target = qltdDeptScopeNormalizeCode_(deptCode);
  if (!target) return null;
  return qltdSelfRegistrationListDepartments_().find(function(item) {
    return qltdDeptScopeNormalizeCode_(item.code) === target;
  }) || null;
}

function qltdSelfRegistrationCleanDeptName_(name) {
  return String(name || '').replace(/\s+(Cốc Lếu|C1 Hưng Lộc|Hưng Lộc|Nam Cấm)$/i, '').trim();
}

function qltdSelfRegistrationSanitizeText_(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength || 200);
}

function qltdSelfRegistrationError_(code, message, extra) {
  const response = { success: false, message: code, errorCode: code, errorMessage: message, source: QLTD_SELF_REGISTRATION_SOURCE };
  if (extra && typeof extra === 'object') Object.keys(extra).forEach(function(key) { response[key] = extra[key]; });
  return response;
}

function qltdFirebaseGetWebApiKey_() {
  return String(PropertiesService.getScriptProperties().getProperty(QLTD_FIREBASE_WEB_API_KEY_PROPERTY) || '').trim();
}

function qltdFirebaseResolveIdentity_(payload, tokenRequired) {
  const idToken = String(payload && payload.idToken || '').trim();
  const requestedEmail = qltdUsersNormalizeEmail_(payload && payload.email);

  if (!idToken) {
    if (tokenRequired) return qltdSelfRegistrationError_('ID_TOKEN_REQUIRED', 'Không xác minh được phiên đăng nhập Google. Vui lòng đăng nhập lại.');
    if (!requestedEmail) return qltdSelfRegistrationError_('AUTH_REQUIRED', 'Thiếu thông tin người dùng thực hiện thao tác.');
    return { success: true, email: requestedEmail, authMode: 'LEGACY_EMAIL' };
  }

  const firebaseApiKey = qltdFirebaseGetWebApiKey_();
  if (!firebaseApiKey) return qltdSelfRegistrationError_('FIREBASE_API_KEY_MISSING', 'Apps Script chưa được cấu hình khóa xác minh Firebase.');

  try {
    const response = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(firebaseApiKey), {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true
    });
    const statusCode = response.getResponseCode();
    const data = JSON.parse(response.getContentText() || '{}');
    const firebaseUser = data && data.users && data.users[0];
    const verifiedEmail = qltdUsersNormalizeEmail_(firebaseUser && firebaseUser.email);
    if (statusCode < 200 || statusCode >= 300 || !verifiedEmail) return qltdSelfRegistrationError_('ID_TOKEN_INVALID', 'Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.');
    if (requestedEmail && requestedEmail !== verifiedEmail) return qltdSelfRegistrationError_('EMAIL_MISMATCH', 'Email khai báo không khớp tài khoản Google đang đăng nhập.');
    return {
      success: true,
      email: verifiedEmail,
      displayName: String(firebaseUser.displayName || '').trim(),
      localId: String(firebaseUser.localId || '').trim(),
      authMode: 'FIREBASE_ID_TOKEN'
    };
  } catch (error) {
    return qltdSelfRegistrationError_('IDENTITY_VERIFY_ERROR', 'Không thể xác minh phiên đăng nhập Google.', { detail: String(error && error.message || error) });
  }
}

function qltdDeptScopeAuthorizeWrite_(payload, actionValue) {
  const action = String(actionValue || '').trim().toLowerCase();
  const allowedRoles = QLTD_DEPT_SCOPE_ACTION_RULES[action];
  if (!allowedRoles) return { allowed: true, response: null };

  const identity = qltdFirebaseResolveIdentity_(payload, false);
  if (!identity.success) return { allowed: false, response: identity };

  const user = qltdUsersGetByEmail_(identity.email);
  if (!user) return { allowed: false, response: qltdSelfRegistrationError_('USER_NOT_FOUND', 'Tài khoản chưa được đăng ký trên hệ thống.') };
  if (user.status !== 'ACTIVE') return { allowed: false, response: qltdSelfRegistrationError_('USER_INACTIVE', 'Tài khoản đang bị khóa.') };

  const role = qltdUsersNormalizeRole_(user.role);
  if (allowedRoles.indexOf(role) === -1) {
    return { allowed: false, response: qltdSelfRegistrationError_('ROLE_SCOPE_DENIED', 'Vai trò hiện tại không được phép thực hiện thao tác này.', { action: action, role: role }) };
  }

  payload.email = user.email;
  payload.actorEmail = user.email;
  if (role === 'ADMIN' || role === 'PMO') return { allowed: true, response: null, user: user };

  const userDept = qltdDeptScopeNormalizeCode_(user.deptCode);
  const targetDept = qltdDeptScopeFindPayloadDept_(payload);
  if (!userDept) return { allowed: false, response: qltdSelfRegistrationError_('USER_DEPT_MISSING', 'Tài khoản chưa được gắn phòng/ban. Vui lòng liên hệ quản trị.') };
  if (targetDept && targetDept !== userDept) {
    return {
      allowed: false,
      response: qltdSelfRegistrationError_('DEPT_SCOPE_DENIED', 'Bạn chỉ được lập và cập nhật dữ liệu thuộc phòng/ban của mình.', {
        action: action,
        userDeptCode: user.deptCode,
        requestedDeptCode: qltdDeptScopeReadRawPayloadDept_(payload)
      })
    };
  }

  qltdDeptScopeForcePayloadDept_(payload, user.deptCode, user.deptName);
  return { allowed: true, response: null, user: user };
}

function qltdDeptScopeFindPayloadDept_(payload) {
  return qltdDeptScopeNormalizeCode_(qltdDeptScopeReadRawPayloadDept_(payload));
}

function qltdDeptScopeReadRawPayloadDept_(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const directKeys = ['deptCode', 'departmentCode', 'ownerDeptCode', 'reportDeptCode'];
  for (let index = 0; index < directKeys.length; index += 1) {
    const value = payload[directKeys[index]];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  const nestedKeys = ['task', 'detailTask', 'item', 'report', 'data', 'payload'];
  for (let index = 0; index < nestedKeys.length; index += 1) {
    const nested = payload[nestedKeys[index]];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
    for (let keyIndex = 0; keyIndex < directKeys.length; keyIndex += 1) {
      const value = nested[directKeys[keyIndex]];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
  }
  return '';
}

function qltdDeptScopeForcePayloadDept_(payload, deptCode, deptName) {
  payload.deptCode = deptCode;
  payload.deptName = deptName;
  ['task', 'detailTask', 'item', 'report', 'data', 'payload'].forEach(function(key) {
    const nested = payload[key];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return;
    if (Object.prototype.hasOwnProperty.call(nested, 'deptCode')) nested.deptCode = deptCode;
    if (Object.prototype.hasOwnProperty.call(nested, 'departmentCode')) nested.departmentCode = deptCode;
    if (Object.prototype.hasOwnProperty.call(nested, 'deptName')) nested.deptName = deptName;
  });
}

function qltdDeptScopeNormalizeCode_(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9Đ_-]/g, '');
}
