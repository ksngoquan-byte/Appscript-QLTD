import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');
const usersSource = fs.readFileSync(new URL('../apps-script-dev-api/29_USERS_SERVICE.js', import.meta.url), 'utf8');
const projectsSource = fs.readFileSync(new URL('../apps-script-dev-api/31_PROJECTS_SERVICE.js', import.meta.url), 'utf8');
const scopeSource = fs.readFileSync(new URL('../apps-script-dev-api/37_SELF_REGISTRATION_SCOPE.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const signatures = [`async function ${name}`, `function ${name}`];
  const start = signatures.map((signature) => source.indexOf(signature)).find((index) => index >= 0);
  assert.ok(start >= 0, `Missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the parser sees a complete declaration.
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const activeProjects = [
  { projectCode: '37-5.HL1', status: 'ACTIVE' },
  { projectCode: '24-1.ĐB', status: 'ACTIVE' }
];
const users = new Map();
const projectContext = vm.createContext({
  qltdUsersNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdUsersGetByEmail_: (email) => users.get(email) || null,
  qltdUsersIsValidRole_: (role) => ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER'].includes(role),
  qltdProjectsListActive_: () => activeProjects.slice()
});
vm.runInContext(extractFunction(projectsSource, 'qltdProjectsListForUser_'), projectContext);

for (const role of ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER']) {
  const email = `${role.toLowerCase()}@example.com`;
  users.set(email, { email, role, status: 'ACTIVE', deptCode: 'NO_MAPPING' });
  assert.deepEqual(
    Array.from(projectContext.qltdProjectsListForUser_(email), (project) => project.projectCode),
    ['37-5.HL1', '24-1.ĐB'],
    `${role} must see every ACTIVE project`
  );
}
users.set('inactive@example.com', { role: 'VIEWER', status: 'INACTIVE' });
users.set('invalid@example.com', { role: 'OWNER', status: 'ACTIVE' });
assert.equal(projectContext.qltdProjectsListForUser_('missing@example.com').length, 0);
assert.equal(projectContext.qltdProjectsListForUser_('inactive@example.com').length, 0);
assert.equal(projectContext.qltdProjectsListForUser_('invalid@example.com').length, 0);
assert.doesNotMatch(extractFunction(projectsSource, 'qltdProjectsListForUser_'), /ProjectDepts|AllowedProjectCodes/);

assert.match(apiSource, /if \(action === 'listprojects'\) \{\s*return qltdDevApiListProjects_\(params\)/);
assert.match(extractFunction(apiSource, 'qltdDevApiListProjects_'), /qltdFirebaseResolveIdentity_\(params, true\)/);
assert.match(extractFunction(apiSource, 'qltdDevApiListProjects_'), /USER_INACTIVE/);
assert.match(extractFunction(apiSource, 'qltdDevApiListProjects_'), /INVALID_ROLE/);

assert.match(usersSource, /BAN_LANH_DAO:\s*'PMO'/);
assert.match(usersSource, /DEPT_MANAGER:\s*'EDITOR'/);
assert.match(usersSource, /EMPLOYEE:\s*'REPORTER'/);
assert.doesNotMatch(extractFunction(usersSource, 'qltdUsersRegister_'), /payload\s*&&\s*payload\.role/);
assert.match(extractFunction(usersSource, 'qltdUsersRegister_'), /LockService\.getScriptLock/);
assert.match(extractFunction(usersSource, 'qltdUsersRegister_'), /if \(existing\)/);

assert.match(scopeSource, /function qltdFirebaseResolveIdentity_/);
assert.match(scopeSource, /function qltdDeptScopeAuthorizeWrite_/);
assert.match(apiSource, /qltdDeptScopeAuthorizeWrite_\(payload, action\)/);
assert.match(apiSource, /weekly_masterapprovals_get:\s*true/);

let identityResponse = { statusCode: 200, payload: { users: [{ email: 'admin@example.com', displayName: 'Admin', localId: 'UID-1' }] } };
const identityContext = vm.createContext({
  qltdUsersNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdUsersBuildAuthError_: (code, message, extra = {}) => ({ success: false, message: code, errorMessage: message, ...extra }),
  qltdFirebaseGetWebApiKey_: () => 'test-api-key',
  UrlFetchApp: {
    fetch: () => ({
      getResponseCode: () => identityResponse.statusCode,
      getContentText: () => JSON.stringify(identityResponse.payload)
    })
  }
});
vm.runInContext(extractFunction(scopeSource, 'qltdFirebaseResolveIdentity_'), identityContext);
assert.equal(identityContext.qltdFirebaseResolveIdentity_({ email: 'admin@example.com' }, true).message, 'ID_TOKEN_REQUIRED');
identityResponse = { statusCode: 400, payload: { error: { message: 'INVALID_ID_TOKEN' } } };
assert.equal(identityContext.qltdFirebaseResolveIdentity_({ email: 'admin@example.com', idToken: 'invalid' }, true).message, 'ID_TOKEN_INVALID');
identityResponse = { statusCode: 200, payload: { users: [{ email: 'admin@example.com', displayName: 'Admin', localId: 'UID-1' }] } };
assert.equal(identityContext.qltdFirebaseResolveIdentity_({ email: 'other@example.com', idToken: 'valid' }, true).message, 'EMAIL_MISMATCH');
const verifiedIdentity = identityContext.qltdFirebaseResolveIdentity_({ email: 'admin@example.com', idToken: 'valid' }, true);
assert.equal(verifiedIdentity.success, true);
assert.equal(verifiedIdentity.email, 'admin@example.com');

let routeIdentity = { success: false, message: 'ID_TOKEN_REQUIRED' };
let approvalParams = null;
const approvalRouteContext = vm.createContext({
  qltdFirebaseResolveIdentity_: () => routeIdentity,
  qltdDevApiJson_: (payload) => payload,
  qltdWeeklyMasterApprovalsGet_: (params) => { approvalParams = { ...params }; return { success: true }; }
});
const readActionDeclaration = apiSource.slice(apiSource.indexOf('const QLTD_DEV_DEPT_READ_ACTIONS'), apiSource.indexOf('function qltdDevApiHandleGet'));
vm.runInContext(`${readActionDeclaration}\n${extractFunction(apiSource, 'qltdDevApiHandleGet')}`, approvalRouteContext);
assert.equal(
  approvalRouteContext.qltdDevApiHandleGet({ parameter: { action: 'weekly_masterapprovals_get', email: 'admin@example.com' } }).message,
  'ID_TOKEN_REQUIRED'
);
routeIdentity = { success: true, email: 'pmo@example.com' };
approvalRouteContext.qltdDevApiHandleGet({
  parameter: { action: 'weekly_masterapprovals_get', email: 'spoofed@example.com', idToken: 'valid', projectCode: 'P1', deptCode: 'D1', status: 'PENDING' }
});
assert.equal(approvalParams.email, 'pmo@example.com');
assert.equal(approvalParams.projectCode, 'P1');
assert.equal(approvalParams.deptCode, 'D1');
assert.equal(approvalParams.status, 'PENDING');

assert.match(indexSource, /id="registrationView"/);
assert.match(indexSource, /id="registrationForm"/);
assert.match(indexSource, /id="registrationUserGroup"/);
assert.match(indexSource, /id="registrationDeptCode"/);
assert.match(appSource, /async function showRegistrationGate/);
assert.match(appSource, /async function handleRegistrationSubmit/);
assert.match(appSource, /if \(registrationSubmitting \|\| !auth\?\.currentUser\) return/);
assert.match(appSource, /code === 'USER_NOT_FOUND' \|\| profile\.requiresRegistration === true/);
assert.match(appSource, /showOnly\(els\.registrationView\)/);
assert.doesNotMatch(appSource, /GUEST_VIEWER/);
assert.match(extractFunction(appSource, 'loadProjectsForSelector'), /fetchBackendJson\('listProjects',[\s\S]*\{ auth: true \}/);
assert.match(extractFunction(appSource, 'loadProjectsForSelector'), /Không tải được danh sách dự án/);

const profileContext = vm.createContext({
  normalizeRoleKey: (role) => String(role || '').trim().toUpperCase()
});
vm.runInContext(extractFunction(appSource, 'isValidAppProfile'), profileContext);
for (const role of ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER']) {
  assert.equal(profileContext.isValidAppProfile({ success: true, status: 'ACTIVE', role }), true);
}
assert.equal(profileContext.isValidAppProfile({ success: true, status: 'INACTIVE', role: 'VIEWER' }), false);
assert.equal(profileContext.isValidAppProfile({ success: true, status: 'ACTIVE', role: 'OWNER' }), false);
assert.equal(profileContext.isValidAppProfile({ success: false, status: 'ACTIVE', role: 'VIEWER' }), false);

console.log('Auth, registration and project visibility tests: PASS');
