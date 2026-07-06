import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../apps-script-dev-api/36_MAIN_MILESTONES_SERVICE.js', import.meta.url),
  'utf8'
);
const routeSource = fs.readFileSync(
  new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url),
  'utf8'
);
const context = vm.createContext({
  qltdUsersNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdUsersGetByEmail_: () => ({ email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE' }),
  qltdPermissionsCanWriteMainMilestones_: () => true
});
vm.runInContext(source, context);

assert.deepEqual(
  JSON.parse(JSON.stringify(context.qltdMainMilestonesSave_('37-5.HL', '[]', '[]', 'admin@example.com'))),
  { success: false, message: 'EMPTY_MILESTONE_SELECTION_REQUIRES_RESET' }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.qltdMainMilestonesReset_('37-5.HL', 'admin@example.com', '0'))),
  { success: false, message: 'RESET_CONFIRMATION_REQUIRED' }
);
assert.match(
  routeSource,
  /qltdMainMilestonesReset_\(params\.projectCode, params\.email, params\.confirmed\)/
);

console.log('Main milestone empty-save/reset confirmation guards: PASS');
