function qltdDevApiBootstrap_(params) {
  const email = qltdDevApiNormalizeEmail_(params && params.email);
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
      permissions: qltdPermissionsForRole_(user.role),
      delegatedScopes: qltdUserProjectDeptAccessResolveAllEffectiveScopes_(user.email),
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE
    },
    projects: projects,
    apiStatus: 'CONNECTED',
    source: 'users_and_projects_sheets',
    meta: meta
  };
}
