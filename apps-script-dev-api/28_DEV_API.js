const QLTD_DEV_API_SERVICE = 'QLTD_DEV_API';
const QLTD_DEV_API_SOURCE = 'users_sheet';

function qltdDevApiHandleGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '').trim().toLowerCase();

  if (action === 'health') {
    return qltdDevApiJson_({
      success: true,
      service: QLTD_DEV_API_SERVICE,
      status: 'OK'
    });
  }

  if (action === 'profile') {
    return qltdDevApiProfile_(params.email);
  }

  if (action === 'budget_getprojects') {
    return qltdDevApiJson_(qltdBudgetGetProjects_(params));
  }

  if (action === 'budget_getprojectdepts') {
    return qltdDevApiJson_(qltdBudgetGetProjectDepts_(params));
  }

  if (action === 'budget_getdepttasks') {
    return qltdDevApiJson_(qltdBudgetGetDeptTasks_(params));
  }

  if (action === 'budget_getdashboard') {
    return qltdDevApiJson_(qltdBudgetGetDashboard_(params));
  }

  if (action === 'budget_submitplandryrun') {
    return qltdDevApiJson_(qltdBudgetSubmitPlanDryRun_(params));
  }

  if (action === 'budget_submitactualdryrun') {
    return qltdDevApiJson_(qltdBudgetSubmitActualDryRun_(params));
  }

  if (action === 'listprojects') {
    return qltdDevApiListProjects_(params.email);
  }

  if (action === 'listdeptplans') {
    return qltdDevApiListDeptPlans_(params.projectCode);
  }

  if (action === 'ganttdata') {
    return qltdDevApiGanttData_(params.projectCode);
  }

  if (action === 'getmainmilestones') {
    return qltdDevApiJson_(qltdMainMilestonesGet_(params.projectCode, params.email));
  }

  if (action === 'savemainmilestones') {
    return qltdDevApiJson_(qltdMainMilestonesSave_(
      params.projectCode,
      params.ids || params.milestoneIds,
      params.codes || params.milestoneCodes,
      params.email
    ));
  }

  if (action === 'resetmainmilestones') {
    return qltdDevApiJson_(qltdMainMilestonesReset_(params.projectCode, params.email));
  }

  if (action === 'setupprojectdepts') {
    qltdSetupProjectDeptsSheet();
    return qltdDevApiJson_({
      success: true,
      message: 'PROJECT_DEPTS_SETUP_DONE',
      apiStatus: 'CONNECTED',
      source: 'project_depts_sheet'
    });
  }

  if (action === 'web06bseedregistry') {
    const result = web06bSeedProjectRegistry();
    result.apiStatus = 'CONNECTED';
    result.source = 'web06b_project_registry_seed';
    return qltdDevApiJson_(result);
  }

  return qltdDevApiJson_({
    success: false,
    message: 'UNKNOWN_ACTION'
  });
}

function qltdDevApiIsActionRequest(e) {
  return !!(e && e.parameter && e.parameter.action);
}

function qltdDevApiProfile_(emailValue) {
  const email = qltdDevApiNormalizeEmail_(emailValue);

  qltdUsersEnsureSheet_();
  qltdUsersSeedAdminIfMissing_();

  const user = qltdUsersGetByEmail_(email);

  if (!user) {
    return qltdDevApiJson_({
      success: false,
      message: 'USER_NOT_FOUND',
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE
    });
  }

  if (!qltdUsersIsValidStatus_(user.status) || user.status !== 'ACTIVE') {
    return qltdDevApiJson_({
      success: false,
      message: 'USER_INACTIVE',
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE
    });
  }

  if (!qltdUsersIsValidRole_(user.role)) {
    return qltdDevApiJson_({
      success: false,
      message: 'INVALID_ROLE',
      apiStatus: 'CONNECTED',
      source: QLTD_DEV_API_SOURCE
    });
  }

  return qltdDevApiJson_({
    success: true,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    deptCode: user.deptCode,
    deptName: user.deptName,
    permissions: qltdPermissionsForRole_(user.role),
    apiStatus: 'CONNECTED',
    source: QLTD_DEV_API_SOURCE
  });
}

function qltdDevApiNormalizeEmail_(emailValue) {
  return String(emailValue || '').trim().toLowerCase();
}

function qltdDevApiJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}


function qltdDevApiListProjects_(email) {
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

  return qltdDevApiJson_({
    success: true,
    projects: projects,
    apiStatus: 'CONNECTED',
    source: 'projects_sheet'
  });
}
function qltdDevApiListDeptPlans_(projectCode) {
  return qltdDevApiJson_(qltdDeptPlanListForProject_(projectCode));
}

function qltdDevApiGanttData_(projectCode) {
  const result = qltdGanttGetDataForProject_(projectCode);
  if (result && result.success !== false) {
    const milestones = qltdMainMilestonesGet_(projectCode, 'gantt-data@authenticated.local', true);
    result.mainMilestoneSource = 'GOOGLE_SHEET';
    result.mainMilestoneIds = milestones.ids || [];
    result.mainMilestoneCodes = milestones.codes || [];
  }
  return qltdDevApiJson_(result);
}
