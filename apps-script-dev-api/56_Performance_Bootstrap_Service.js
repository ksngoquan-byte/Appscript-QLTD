function qltdDevApiBootstrap_(params) {
  const identity = qltdFirebaseResolveIdentity_(params, true);
  if (!identity.success) return identity;
  const email = qltdDevApiNormalizeEmail_(identity.email);
  const meta = {
    action: 'bootstrap',
    email: email || 'anonymous'
  };

  qltdUsersEnsureSheet_();
  qltdUsersSeedAdminIfMissing_();

  const user = qltdUsersGetByEmail_(email);
  if (!user) {
    return {
      success: false,
      message: 'USER_NOT_FOUND',
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE,
      meta: meta
    };
  }

  if (!qltdUsersIsValidStatus_(user.status) || user.status !== 'ACTIVE') {
    return {
      success: false,
      message: 'USER_INACTIVE',
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE,
      meta: meta
    };
  }

  if (!qltdUsersIsValidRole_(user.role)) {
    return {
      success: false,
      message: 'INVALID_ROLE',
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE,
      meta: meta
    };
  }

  qltdUsersTouchLastLogin_(user.rowIndex);
  qltdProjectsEnsureSheet_();
  qltdProjectsSeedDefaultIfMissing_();

  const projects = qltdProjectsListForUser_(email).map(function(project) {
    return {
      projectCode: project.projectCode,
      projectName: project.projectName,
      defaultTaskSheet: project.defaultTaskSheet,
      defaultDeptSheet: project.defaultDeptSheet,
      sortOrder: project.sortOrder || ''
    };
  });

  return {
    success: true,
    profile: {
      success: true,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      deptCode: user.deptCode,
      deptName: user.deptName,
      empCode: user.empCode || '',
      permissions: qltdPermissionsForRole_(user.role),
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE
    },
    projects: projects,
    apiStatus: 'CONNECTED',
    source: 'users_and_projects_sheets',
    meta: meta
  };
}
