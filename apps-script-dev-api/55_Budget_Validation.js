function qltdBudgetValidateProjectCode_(action, projectCode, extraMeta) {
  const code = qltdBudgetNormalizeCode_(projectCode);
  if (!code) {
    return {
      value: '',
      error: qltdBudgetError_(action, 'PROJECT_CODE_REQUIRED', 'Thieu projectCode.', extraMeta || {})
    };
  }
  return {
    value: code,
    error: null
  };
}

function qltdBudgetValidateDeptCode_(action, deptCode, extraMeta) {
  const code = String(deptCode || '').trim();
  if (!code) {
    return {
      value: '',
      error: qltdBudgetError_(action, 'DEPT_CODE_REQUIRED', 'Thieu deptCode.', extraMeta || {})
    };
  }
  return {
    value: code,
    error: null
  };
}

function qltdBudgetFindMissingHeaders_(headerMap, requiredHeaders) {
  return (requiredHeaders || []).filter(function(header) {
    return qltdBudgetFindHeaderIndex_(headerMap, header) < 0;
  });
}

function qltdBudgetFindProjectByCode_(projects, projectCode) {
  const normalizedCode = qltdBudgetNormalizeCode_(projectCode);
  for (let index = 0; index < (projects || []).length; index += 1) {
    if (qltdBudgetNormalizeCode_(projects[index].projectCode) === normalizedCode) {
      return projects[index];
    }
  }
  return null;
}

function qltdBudgetFindProjectDept_(departments, deptCode) {
  const normalized = qltdBudgetNormalizeCode_(deptCode);
  for (let index = 0; index < (departments || []).length; index += 1) {
    const dept = departments[index];
    if (
      qltdBudgetNormalizeCode_(dept.deptCode) === normalized ||
      qltdBudgetNormalizeCode_(dept.projectUnitCode) === normalized ||
      qltdBudgetNormalizeCode_(dept.deptName) === normalized
    ) {
      return dept;
    }
  }
  return null;
}

function qltdBudgetNormalizeAmount_(value) {
  const raw = String(value === undefined || value === null ? '' : value).trim();
  if (!raw) {
    return {
      value: null,
      error: {
        code: 'AMOUNT_INVALID',
        message: 'So tien khong hop le.'
      }
    };
  }

  let normalized = raw.replace(/\s/g, '');
  if (/^\d{1,3}([,.]\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/[,.]/g, '');
  } else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }
  const number = Number(normalized);
  if (isNaN(number) || number < 0) {
    return {
      value: null,
      error: {
        code: 'AMOUNT_INVALID',
        message: 'So tien khong hop le.'
      }
    };
  }

  return {
    value: number,
    error: null
  };
}

function qltdBudgetNormalizeSourceAmount_(value) {
  const amount = qltdBudgetNormalizeAmount_(value);
  if (amount.error) {
    return {
      value: null,
      error: {
        code: 'ALLOCATION_SOURCE_AMOUNT_INVALID',
        message: 'Gia tri nguon ngan sach khong hop le.'
      }
    };
  }
  return {
    value: amount.value,
    error: null
  };
}

function qltdBudgetNormalizePeriodType_(value) {
  const normalized = qltdBudgetNormalizeKey_(value);
  const map = {
    week: 'WEEK',
    tuan: 'WEEK',
    month: 'MONTH',
    thang: 'MONTH',
    quarter: 'QUARTER',
    quy: 'QUARTER'
  };

  if (!normalized || !map[normalized]) {
    return {
      value: '',
      error: {
        code: 'PERIOD_TYPE_INVALID',
        message: 'Loai ky khong hop le.'
      }
    };
  }

  return {
    value: map[normalized],
    error: null
  };
}

function qltdBudgetNormalizeBudgetType_(value) {
  const normalized = qltdBudgetNormalizeKey_(value || QLTD_BUDGET_TYPE.TASK_LINKED);
  const map = {
    tasklinked: QLTD_BUDGET_TYPE.TASK_LINKED,
    gantiendo: QLTD_BUDGET_TYPE.TASK_LINKED,
    linked: QLTD_BUDGET_TYPE.TASK_LINKED,
    deptstandalone: QLTD_BUDGET_TYPE.DEPT_STANDALONE,
    doclapphongban: QLTD_BUDGET_TYPE.DEPT_STANDALONE,
    standalone: QLTD_BUDGET_TYPE.DEPT_STANDALONE
  };

  if (!normalized || !map[normalized]) {
    return {
      value: '',
      error: {
        code: 'BUDGET_TYPE_INVALID',
        message: 'Loai ngan sach khong hop le.'
      }
    };
  }

  return {
    value: map[normalized],
    error: null
  };
}

function qltdBudgetNormalizeAllocationSourceType_(value) {
  const normalized = qltdBudgetNormalizeKey_(value);
  const map = {
    taskdirect: 'TASK_DIRECT',
    task: 'TASK_DIRECT',
    congviec: 'TASK_DIRECT',
    chitietcongviec: 'TASK_DIRECT',
    nontask: 'NON_TASK',
    khonggancongviec: 'NON_TASK',
    nguonkhonggancongviec: 'NON_TASK'
  };

  if (!normalized || !map[normalized]) {
    return {
      value: '',
      error: {
        code: 'ALLOCATION_SOURCE_TYPE_INVALID',
        message: 'Loai nguon ngan sach khong hop le.'
      }
    };
  }

  return {
    value: map[normalized],
    error: null
  };
}

function qltdBudgetNormalizeFlowType_(value) {
  const normalized = qltdBudgetNormalizeKey_(value);
  const map = {
    thu: 'THU',
    chi: 'CHI'
  };

  if (!normalized || !map[normalized]) {
    return {
      value: '',
      error: {
        code: 'ALLOCATION_FLOW_MISMATCH',
        message: 'Huong dong tien khong hop le.'
      }
    };
  }

  return {
    value: map[normalized],
    error: null
  };
}

function qltdBudgetNormalizeAllocationStatus_(value) {
  const normalized = qltdBudgetNormalizeKey_(value || 'Nháp');
  const map = {
    draft: 'DRAFT',
    nhap: 'DRAFT',
    confirmed: 'CONFIRMED',
    dachot: 'CONFIRMED',
    daxacnhan: 'CONFIRMED',
    cancelled: 'CANCELLED',
    canceled: 'CANCELLED',
    huy: 'CANCELLED'
  };

  if (!normalized || !map[normalized]) {
    return {
      value: '',
      error: {
        code: 'ALLOCATION_STATUS_INVALID',
        message: 'Trang thai phan bo khong hop le.'
      }
    };
  }

  return {
    value: map[normalized],
    error: null
  };
}

function qltdBudgetGetAllocationStatusSheetLabel_(status) {
  const normalized = qltdBudgetNormalizeAllocationStatus_(status).value || String(status || '').trim().toUpperCase();
  const map = {
    DRAFT: 'Nháp',
    CONFIRMED: 'Đã chốt',
    CANCELLED: 'Hủy'
  };
  return map[normalized] || '';
}

function qltdBudgetNormalizeMasterBudgetStatus_(value) {
  const normalized = qltdBudgetNormalizeKey_(value);
  const map = {
    nhap: 'DRAFT',
    draft: 'DRAFT',
    dachot: 'CONFIRMED',
    confirmed: 'CONFIRMED',
    khoa: 'LOCKED',
    locked: 'LOCKED'
  };

  return map[normalized] || '';
}

function qltdBudgetIsMasterBudgetSourceReady_(status) {
  const normalized = qltdBudgetNormalizeMasterBudgetStatus_(status);
  return normalized === 'CONFIRMED' || normalized === 'LOCKED';
}
