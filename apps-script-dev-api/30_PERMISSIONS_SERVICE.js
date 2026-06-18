const QLTD_PERMISSIONS_BY_ROLE = {
  ADMIN: {
    dashboard: true,
    gantt: true,
    lookup: true,
    reportUpdate: true,
    admin: true
  },
  PMO: {
    dashboard: true,
    gantt: true,
    lookup: true,
    reportUpdate: true,
    admin: false
  },
  EDITOR: {
    dashboard: true,
    gantt: true,
    lookup: true,
    reportUpdate: true,
    admin: false
  },
  REPORTER: {
    dashboard: true,
    gantt: true,
    lookup: true,
    reportUpdate: true,
    admin: false
  },
  VIEWER: {
    dashboard: true,
    gantt: true,
    lookup: true,
    reportUpdate: true,
    admin: false
  }
};

function qltdPermissionsForRole_(role) {
  const normalizedRole = qltdUsersNormalizeRole_(role);
  const permissions = QLTD_PERMISSIONS_BY_ROLE[normalizedRole];

  if (!permissions) {
    return {
      dashboard: false,
      gantt: false,
      lookup: false,
      reportUpdate: false,
      admin: false
    };
  }

  return {
    dashboard: !!permissions.dashboard,
    gantt: !!permissions.gantt,
    lookup: !!permissions.lookup,
    reportUpdate: !!permissions.reportUpdate,
    admin: !!permissions.admin
  };
}

function qltdPermissionsCanWriteMainMilestones_(role) {
  return ['ADMIN', 'PMO', 'EDITOR'].indexOf(qltdUsersNormalizeRole_(role)) !== -1;
}
