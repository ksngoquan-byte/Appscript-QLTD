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
