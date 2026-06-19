function qltdWorkGetMyTasks_(params) {
  const action = 'work_getMyTasks';
  const auth = qltdWorkGetActiveUser_(params && params.email, action);
  if (auth.error) return auth.error;
  if (qltdWorkIsViewer_(auth.user)) return qltdWorkError_(action, 'PERMISSION_DENIED', 'VIEWER khong duoc xem cong viec ca nhan trong MVP.', { email: auth.user.email });

  const projectCode = qltdWorkNormalizeCode_(params && params.projectCode);
  if (!projectCode) return qltdWorkError_(action, 'PROJECT_CODE_REQUIRED', 'projectCode la bat buoc de gioi han pham vi quet.', { email: auth.user.email });
  const deptCode = qltdWorkNormalizeCode_((params && params.deptCode) || auth.user.deptCode);
  if (!deptCode) return qltdWorkError_(action, 'DEPT_CODE_REQUIRED', 'Khong xac dinh duoc deptCode cua nguoi dung.', { email: auth.user.email, projectCode: projectCode });
  if (!qltdWorkCanReadSystem_(auth.user) && qltdWorkNormalizeCode_(auth.user.deptCode) !== deptCode) {
    return qltdWorkError_(action, 'PERMISSION_DENIED', 'Khong duoc doc cong viec ngoai phong/ban.', { email: auth.user.email, projectCode: projectCode, deptCode: deptCode });
  }

  const scope = qltdWorkResolveDeptTaskScope_(action, projectCode, deptCode);
  if (scope.error) return scope.error;
  const userIndex = qltdWorkLoadUsersByDept_();
  const parsed = qltdWorkParseDeptTaskSheet_(scope.sheet, scope.project, scope.dept, userIndex, action);
  if (parsed.error) return parsed.error;

  const email = auth.user.email;
  const statusFilter = qltdWorkNormalizeText_(params && params.status);
  const tasks = parsed.tasks.filter(function(task) {
    const isOwner = task.assigneeEmail === email;
    const isCoordinator = task.coordinators.some(function(person) { return person.email === email; });
    if (!isOwner && !isCoordinator) return false;
    if (statusFilter && task.status !== statusFilter) return false;
    task.taskRole = isOwner ? 'OWNER' : 'COORDINATOR';
    return true;
  });

  return qltdWorkOk_(action, {
    projectCode: scope.project.projectCode,
    projectName: scope.project.projectName,
    deptCode: scope.dept.deptCode,
    deptName: scope.dept.deptName,
    taskCount: tasks.length,
    tasks: tasks.map(qltdWorkTaskForResponse_)
  }, parsed.warnings, { email: auth.user.email, projectCode: projectCode, deptCode: deptCode });
}

function qltdWorkGetDeptTasks_(params) {
  const action = 'work_getDeptTasks';
  const auth = qltdWorkGetActiveUser_(params && params.email, action);
  if (auth.error) return auth.error;
  const projectCode = qltdWorkNormalizeCode_(params && params.projectCode);
  const deptCode = qltdWorkNormalizeCode_((params && params.deptCode) || auth.user.deptCode);
  if (!projectCode) return qltdWorkError_(action, 'PROJECT_CODE_REQUIRED', 'projectCode la bat buoc.', { email: auth.user.email });
  if (!deptCode) return qltdWorkError_(action, 'DEPT_CODE_REQUIRED', 'deptCode la bat buoc.', { email: auth.user.email, projectCode: projectCode });
  if (!qltdWorkCanManageDept_(auth.user, deptCode)) return qltdWorkError_(action, 'PERMISSION_DENIED', 'Khong du quyen doc cong viec phong/ban.', { email: auth.user.email, projectCode: projectCode, deptCode: deptCode });

  const scope = qltdWorkResolveDeptTaskScope_(action, projectCode, deptCode);
  if (scope.error) return scope.error;
  const parsed = qltdWorkParseDeptTaskSheet_(scope.sheet, scope.project, scope.dept, qltdWorkLoadUsersByDept_(), action);
  if (parsed.error) return parsed.error;
  const statusFilter = qltdWorkNormalizeText_(params && params.status);
  const tasks = parsed.tasks.filter(function(task) { return !statusFilter || task.status === statusFilter; });
  return qltdWorkOk_(action, {
    projectCode: scope.project.projectCode,
    projectName: scope.project.projectName,
    deptCode: scope.dept.deptCode,
    deptName: scope.dept.deptName,
    taskCount: tasks.length,
    tasks: tasks.map(qltdWorkTaskForResponse_)
  }, parsed.warnings, { email: auth.user.email, projectCode: projectCode, deptCode: deptCode });
}

function qltdWorkAssignTask_(payload) {
  const action = 'work_assignTask';
  const auth = qltdWorkGetActiveUser_(payload && payload.email, action);
  if (auth.error) return auth.error;
  const projectCode = qltdWorkNormalizeCode_(payload && payload.projectCode);
  const deptCode = qltdWorkNormalizeCode_(payload && payload.deptCode);
  const masterTaskCode = qltdWorkNormalizeText_(payload && payload.masterTaskCode);
  const assigneeEmail = qltdWorkNormalizeEmail_(payload && payload.assigneeEmail);
  const assignmentRole = qltdWorkNormalizeCode_((payload && payload.assignmentRole) || 'OWNER');
  if (!projectCode || !deptCode || !masterTaskCode || !assigneeEmail) return qltdWorkError_(action, 'REQUIRED_FIELD_MISSING', 'Thieu projectCode/deptCode/masterTaskCode/assigneeEmail.', { email: auth.user.email });
  if (!qltdWorkCanManageDept_(auth.user, deptCode)) return qltdWorkError_(action, 'PERMISSION_DENIED', 'Khong du quyen giao viec phong/ban.', { email: auth.user.email, projectCode: projectCode, deptCode: deptCode });
  if (assignmentRole !== 'OWNER' && assignmentRole !== 'COORDINATOR') return qltdWorkError_(action, 'ASSIGNMENT_ROLE_INVALID', 'assignmentRole chi ho tro OWNER hoac COORDINATOR.', { assignmentRole: assignmentRole });

  const assignee = qltdUsersGetByEmail_(assigneeEmail);
  if (!assignee || assignee.status !== 'ACTIVE' || qltdWorkNormalizeCode_(assignee.deptCode) !== deptCode) return qltdWorkError_(action, 'ASSIGNEE_INVALID', 'Nguoi nhan khong ACTIVE hoac khong thuoc dung phong/ban.', { assigneeEmail: assigneeEmail, deptCode: deptCode });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return qltdWorkError_(action, 'LOCK_TIMEOUT', 'Khong lay duoc lock de giao viec.', { projectCode: projectCode, deptCode: deptCode, masterTaskCode: masterTaskCode });
  try {
    const target = qltdWorkFindWritableTask_(action, projectCode, deptCode, masterTaskCode);
    if (target.error) return target.error;
    const ownerCol = qltdBudgetFindHeaderIndex_(target.parsed.headerMap, 'Người chủ trì') + 1;
    const coordinatorCol = qltdBudgetFindHeaderIndex_(target.parsed.headerMap, 'Người phối hợp') + 1;
    const formatted = qltdWorkFormatAssignee_(assignee);
    if (assignmentRole === 'OWNER') {
      target.sheet.getRange(target.task.rowNumber, ownerCol).setValue(formatted);
    } else {
      const range = target.sheet.getRange(target.task.rowNumber, coordinatorCol);
      const current = qltdWorkNormalizeText_(range.getValue());
      const parts = current ? current.split(';').map(qltdWorkNormalizeText_).filter(Boolean) : [];
      const exists = parts.some(function(part) { return qltdWorkNormalizeEmail_((part.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0]) === assigneeEmail; });
      if (!exists) parts.push(formatted);
      range.setValue(parts.join('; '));
    }
    return qltdWorkOk_(action, { projectCode: projectCode, deptCode: deptCode, masterTaskCode: masterTaskCode, assigneeEmail: assigneeEmail, assignmentRole: assignmentRole }, [], { email: auth.user.email });
  } finally {
    lock.releaseLock();
  }
}

function qltdWorkUpdateTask_(payload) {
  const action = 'work_updateTask';
  const auth = qltdWorkGetActiveUser_(payload && payload.email, action);
  if (auth.error) return auth.error;
  if (!qltdWorkCanUpdateOwnTask_(auth.user)) return qltdWorkError_(action, 'PERMISSION_DENIED', 'Khong du quyen cap nhat cong viec.', { email: auth.user.email });
  const projectCode = qltdWorkNormalizeCode_(payload && payload.projectCode);
  const deptCode = qltdWorkNormalizeCode_(payload && payload.deptCode);
  const masterTaskCode = qltdWorkNormalizeText_(payload && payload.masterTaskCode);
  if (!projectCode || !deptCode || !masterTaskCode) return qltdWorkError_(action, 'REQUIRED_FIELD_MISSING', 'Thieu projectCode/deptCode/masterTaskCode.', { email: auth.user.email });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return qltdWorkError_(action, 'LOCK_TIMEOUT', 'Khong lay duoc lock de cap nhat cong viec.', { projectCode: projectCode, deptCode: deptCode, masterTaskCode: masterTaskCode });
  try {
    const target = qltdWorkFindWritableTask_(action, projectCode, deptCode, masterTaskCode);
    if (target.error) return target.error;
    const parsedTask = qltdWorkBuildTaskFromRow_(target.task.raw, target.task.rowNumber, target.parsed.headerMap, target.scope.project, target.scope.dept, qltdWorkLoadUsersByDept_(), []);
    const isOwner = parsedTask.assigneeEmail === auth.user.email;
    const isCoordinator = parsedTask.coordinators.some(function(person) { return person.email === auth.user.email; });
    const canManage = qltdWorkCanManageDept_(auth.user, deptCode);
    if (!canManage && !isOwner && !isCoordinator) return qltdWorkError_(action, 'PERMISSION_DENIED', 'Khong duoc cap nhat task khong duoc giao.', { email: auth.user.email, masterTaskCode: masterTaskCode });

    const allowed = [];
    if (canManage || isOwner) allowed.push(['status', 'Trạng thái thực hiện'], ['actualStart', 'Bắt đầu thực tế'], ['actualEnd', 'Hoàn thành thực tế'], ['note', 'Ghi chú cập nhật']);
    if (!canManage && isCoordinator && !isOwner) allowed.push(['note', 'Ghi chú cập nhật']);
    const updates = [];
    allowed.forEach(function(pair) {
      if (payload[pair[0]] !== undefined) {
        const column = qltdBudgetFindHeaderIndex_(target.parsed.headerMap, pair[1]) + 1;
        if (column > 0) updates.push({ column: column, value: payload[pair[0]], field: pair[0] });
      }
    });
    if (!updates.length) return qltdWorkError_(action, 'NO_ALLOWED_FIELDS', 'Khong co truong hop le duoc phep cap nhat.', { email: auth.user.email });
    updates.forEach(function(update) { target.sheet.getRange(target.task.rowNumber, update.column).setValue(update.value); });
    return qltdWorkOk_(action, { projectCode: projectCode, deptCode: deptCode, masterTaskCode: masterTaskCode, updatedFields: updates.map(function(item) { return item.field; }) }, [], { email: auth.user.email });
  } finally {
    lock.releaseLock();
  }
}

function qltdWorkResolveDeptTaskScope_(action, projectCode, deptCode) {
  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) return { error: projectsResult.error };
  const project = qltdBudgetFindProjectByCode_(projectsResult.projects, projectCode);
  if (!project || project.status !== 'ACTIVE') return { error: qltdWorkError_(action, 'PROJECT_NOT_FOUND', 'Khong tim thay du an ACTIVE.', { projectCode: projectCode }) };
  if (!project.deptSpreadsheetId) return { error: qltdWorkError_(action, 'DEPT_SPREADSHEET_ID_MISSING', 'Du an chua co DeptSpreadsheetId.', { projectCode: projectCode }) };
  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) return { error: deptsResult.error };
  const dept = qltdBudgetFindProjectDept_(deptsResult.departments.filter(function(item) { return item.projectCode === project.projectCode && item.status === 'ACTIVE'; }), deptCode);
  if (!dept) return { error: qltdWorkError_(action, 'DEPT_NOT_FOUND', 'Khong tim thay phong/ban ACTIVE cua du an.', { projectCode: projectCode, deptCode: deptCode }) };
  let spreadsheet;
  try { spreadsheet = SpreadsheetApp.openById(project.deptSpreadsheetId); } catch (error) { return { error: qltdWorkError_(action, 'DEPT_SPREADSHEET_OPEN_FAILED', error.message || String(error), { projectCode: projectCode }) }; }
  const sheetResult = qltdBudgetFindDeptSheet_(spreadsheet, dept, deptCode);
  if (!sheetResult.sheet) return { error: qltdWorkError_(action, 'DEPT_SHEET_NOT_FOUND', 'Khong tim thay sheet phong/ban.', { projectCode: projectCode, deptCode: deptCode }, sheetResult.warnings) };
  return { project: project, dept: dept, spreadsheet: spreadsheet, sheet: sheetResult.sheet, warnings: sheetResult.warnings || [], error: null };
}

function qltdWorkParseDeptTaskSheet_(sheet, project, dept, userIndex, action) {
  const parsed = qltdBudgetReadSheetAsObjects_(sheet, QLTD_WORK_DEPT_TASK_HEADER_ROW);
  const missing = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_WORK_REQUIRED_HEADERS);
  if (missing.length) return { error: qltdWorkError_(action, 'DEPT_TASK_SCHEMA_MISMATCH', 'Sheet phong/ban thieu header bat buoc.', { sheetName: sheet.getName(), missingHeaders: missing }) };
  const warnings = [];
  const tasks = parsed.rows.map(function(item) {
    return qltdWorkBuildTaskFromRow_(item.raw, item.rowNumber, parsed.headerMap, project, dept, userIndex, warnings);
  }).filter(function(task) { return !!task && !!task.masterTaskCode; });
  return { parsed: parsed, tasks: tasks, warnings: warnings, error: null };
}

function qltdWorkBuildTaskFromRow_(row, rowNumber, headerMap, project, dept, userIndex, warnings) {
  const masterTaskCode = qltdWorkNormalizeText_(qltdBudgetGetCell_(row, headerMap, 'Mã công việc Master', ''));
  if (!masterTaskCode) return null;
  const ownerPeople = qltdWorkParsePersonList_(qltdBudgetGetCell_(row, headerMap, 'Người chủ trì', ''), dept.deptCode, userIndex, warnings, { projectCode: project.projectCode, deptCode: dept.deptCode, masterTaskCode: masterTaskCode, field: 'Người chủ trì' });
  const coordinators = qltdWorkParsePersonList_(qltdBudgetGetCell_(row, headerMap, 'Người phối hợp', ''), dept.deptCode, userIndex, warnings, { projectCode: project.projectCode, deptCode: dept.deptCode, masterTaskCode: masterTaskCode, field: 'Người phối hợp' });
  const owner = ownerPeople.length ? ownerPeople[0] : null;
  return {
    rowNumber: rowNumber,
    projectCode: project.projectCode,
    projectName: project.projectName,
    deptCode: dept.deptCode,
    deptName: dept.deptName,
    masterTaskCode: masterTaskCode,
    wbs: qltdWorkNormalizeText_(qltdBudgetGetCell_(row, headerMap, 'STT', '')),
    taskName: qltdWorkNormalizeText_(qltdBudgetGetCell_(row, headerMap, 'Nội dung công việc', '')),
    assigneeEmail: owner ? owner.email : '',
    assigneeName: owner ? owner.displayName : '',
    coordinators: coordinators,
    status: qltdWorkNormalizeText_(qltdBudgetGetCell_(row, headerMap, 'Trạng thái thực hiện', '')),
    planStart: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, headerMap, 'Ngày bắt đầu kế hoạch', '')),
    planEnd: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, headerMap, 'Ngày kết thúc kế hoạch', '')),
    actualStart: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, headerMap, 'Bắt đầu thực tế', '')),
    actualEnd: qltdBudgetFormatDate_(qltdBudgetGetCell_(row, headerMap, 'Hoàn thành thực tế', '')),
    progress: '',
    result: '',
    issue: '',
    note: qltdWorkNormalizeText_(qltdBudgetGetCell_(row, headerMap, 'Ghi chú cập nhật', '')),
    updatedAt: ''
  };
}

function qltdWorkTaskForResponse_(task) {
  return {
    projectCode: task.projectCode,
    projectName: task.projectName,
    deptCode: task.deptCode,
    deptName: task.deptName,
    masterTaskCode: task.masterTaskCode,
    WBS: task.wbs,
    taskName: task.taskName,
    taskRole: task.taskRole || '',
    assigneeEmail: task.assigneeEmail,
    assigneeName: task.assigneeName,
    coordinatorEmails: task.coordinators.map(function(person) { return person.email; }),
    coordinatorNames: task.coordinators.map(function(person) { return person.displayName; }),
    status: task.status,
    planStart: task.planStart,
    planEnd: task.planEnd,
    actualStart: task.actualStart,
    actualEnd: task.actualEnd,
    progress: task.progress,
    result: task.result,
    issue: task.issue,
    note: task.note,
    updatedAt: task.updatedAt
  };
}

function qltdWorkFindWritableTask_(action, projectCode, deptCode, masterTaskCode) {
  const scope = qltdWorkResolveDeptTaskScope_(action, projectCode, deptCode);
  if (scope.error) return { error: scope.error };
  const parsed = qltdBudgetReadSheetAsObjects_(scope.sheet, QLTD_WORK_DEPT_TASK_HEADER_ROW);
  const missing = qltdBudgetFindMissingHeaders_(parsed.headerMap, QLTD_WORK_REQUIRED_HEADERS);
  if (missing.length) return { error: qltdWorkError_(action, 'DEPT_TASK_SCHEMA_MISMATCH', 'Sheet phong/ban thieu header bat buoc.', { sheetName: scope.sheet.getName(), missingHeaders: missing }) };
  const matches = parsed.rows.filter(function(item) { return qltdWorkNormalizeText_(qltdBudgetGetCell_(item.raw, parsed.headerMap, 'Mã công việc Master', '')) === masterTaskCode; });
  if (!matches.length) return { error: qltdWorkError_(action, 'TASK_NOT_FOUND', 'Khong tim thay task theo Ma cong viec Master.', { projectCode: projectCode, deptCode: deptCode, masterTaskCode: masterTaskCode }) };
  if (matches.length > 1) return { error: qltdWorkError_(action, 'TASK_KEY_DUPLICATED', 'Ma cong viec Master bi trung trong sheet phong/ban.', { projectCode: projectCode, deptCode: deptCode, masterTaskCode: masterTaskCode, matchCount: matches.length }) };
  return { scope: scope, sheet: scope.sheet, parsed: parsed, task: matches[0], error: null };
}
