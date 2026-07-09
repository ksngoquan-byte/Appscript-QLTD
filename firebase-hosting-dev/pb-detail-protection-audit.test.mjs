import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script-dev-api/73_PB_Detail_Protection_Audit_Service.js', import.meta.url), 'utf8');

const context = vm.createContext({
  qltdWorkNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkNormalizeEmail_: (value) => String(value || '').trim().toLowerCase(),
  qltdBudgetSafeErrorMessage_: (error) => error && error.message || String(error),
  qltdWorkNowIso_: () => '2026-07-09T00:00:00.000Z',
  qltdWorkError_: (sourceName, action, code, message) => ({ success: false, source: sourceName, action, errors: [{ code, message }] }),
  Logger: { log: () => {} }
});

vm.runInContext(`${source}
this.api = {
  parse: qltdPbDetailProtectionParseAuditParams_,
  catalog: qltdPbDetailProtectionBuildTargetCatalog_,
  overlaps: qltdPbDetailProtectionOverlaps_,
  contains: qltdPbDetailProtectionContains_,
  blocks: qltdPbDetailProtectionBlocksBounds_,
  subtract: qltdPbDetailProtectionSubtractBounds_,
  summary: qltdPbDetailProtectionBuildSummary_,
  matrix: qltdPbDetailProtectionBuildMatrix_,
  groups: qltdPbDetailProtectionGroupTargets_,
  validateApply: qltdPbDetailProtectionValidateApplyRequest_,
  autoSafe: qltdPbDetailProtectionAutoApplySafe_,
  key: qltdPbDetailProtectionTargetKey_
};`, context);

const { api } = context;

const parsedDefaults = api.parse({});
assert.equal(parsedDefaults.onlyActive, true);
assert.equal(parsedDefaults.includeHealthy, false);
assert.equal(parsedDefaults.limit, 20);
assert.equal(parsedDefaults.cursor, 0);

const parsedBounded = api.parse({ limit: 999, cursor: '2', includeHealthy: 'true', onlyActive: 'false' });
assert.equal(parsedBounded.onlyActive, false);
assert.equal(parsedBounded.includeHealthy, true);
assert.equal(parsedBounded.limit, 50);
assert.equal(parsedBounded.cursor, 2);

context.qltdBudgetReadProjects_ = () => ({
  projects: [
    { projectCode: 'P1', projectName: 'Project 1', deptSpreadsheetId: 'FILE1', status: 'ACTIVE' },
    { projectCode: 'P2', projectName: 'Project 2', deptSpreadsheetId: 'FILE2', status: 'INACTIVE' },
    { projectCode: 'P3', projectName: 'Project 3', deptSpreadsheetId: 'FILE3', status: 'ACTIVE' }
  ],
  warnings: [],
  error: null
});
context.qltdBudgetReadProjectDepts_ = () => ({
  departments: [
    { projectCode: 'P1', deptCode: 'D1', projectUnitCode: 'U1', deptName: 'Dept 1', status: 'ACTIVE' },
    { projectCode: 'P1', deptCode: 'D2', projectUnitCode: 'U2', deptName: 'Dept 2', status: 'ACTIVE' },
    { projectCode: 'P2', deptCode: 'D3', projectUnitCode: 'U3', deptName: 'Dept 3', status: 'ACTIVE' },
    { projectCode: 'P3', deptCode: 'D4', projectUnitCode: 'U4', deptName: 'Dept 4', status: 'INACTIVE' }
  ],
  warnings: [],
  error: null
});

const allActive = api.catalog(api.parse({}));
assert.equal(allActive.targets.length, 2);
assert.equal(JSON.stringify(allActive.targets.map((target) => `${target.project.projectCode}/${target.dept.deptCode}`)), JSON.stringify(['P1/D1', 'P1/D2']));
assert.equal(allActive.totalActiveProjects, 2);

const scopedDept = api.catalog(api.parse({ projectCode: 'P1', deptCode: 'U2' }));
assert.equal(scopedDept.targets.length, 1);
assert.equal(scopedDept.targets[0].dept.deptCode, 'D2');

const missingDept = api.catalog(api.parse({ projectCode: 'P1', deptCode: 'D404' }));
assert.equal(missingDept.targets.length, 1);
assert.equal(missingDept.targets[0].synthetic, true);
assert.equal(missingDept.targets[0].status, 'CONFIG_ERROR');

assert.equal(api.overlaps({ startRow: 2, endRow: 5, startCol: 1, endCol: 3 }, { startRow: 5, endRow: 8, startCol: 3, endCol: 4 }), true);
assert.equal(api.contains({ startRow: 1, endRow: 10, startCol: 1, endCol: 18 }, { startRow: 2, endRow: 3, startCol: 1, endCol: 18 }), true);
assert.equal(api.blocks({
  type: 'SHEET',
  warningOnly: false,
  canEdit: false,
  bounds: { startRow: 1, endRow: 100, startCol: 1, endCol: 18 },
  unprotectedBounds: [{ startRow: 2, endRow: 3, startCol: 1, endCol: 18 }]
}, { startRow: 2, endRow: 3, startCol: 1, endCol: 18 }), false);
assert.equal(api.blocks({
  type: 'RANGE',
  warningOnly: false,
  canEdit: false,
  bounds: { startRow: 2, endRow: 3, startCol: 1, endCol: 18 }
}, { startRow: 2, endRow: 3, startCol: 1, endCol: 18 }), true);

const fragments = api.subtract(
  { startRow: 1, endRow: 10, startCol: 1, endCol: 20 },
  { startRow: 3, endRow: 8, startCol: 1, endCol: 18 }
);
assert.equal(JSON.stringify(fragments), JSON.stringify([
  { startRow: 1, endRow: 2, startCol: 1, endCol: 20 },
  { startRow: 9, endRow: 10, startCol: 1, endCol: 20 },
  { startRow: 3, endRow: 8, startCol: 19, endCol: 20 }
]));

const sampleTargets = [
  { projectCode: 'P1', projectName: 'Project 1', deptCode: 'D1', deptName: 'Dept 1', sheetName: 'D1', schemaReady: true, canCreateInExistingSlot: true, canInsertNewDetailRow: true, effectiveUserCanEdit: true, blockingProtectionCount: 0, status: 'OK', repairStrategy: 'NONE', blockingProtections: [] },
  { projectCode: 'P1', projectName: 'Project 1', deptCode: 'D2', deptName: 'Dept 2', sheetName: 'D2', schemaReady: true, canCreateInExistingSlot: false, canInsertNewDetailRow: false, effectiveUserCanEdit: false, blockingProtectionCount: 1, status: 'PROTECTED_SLOT', repairStrategy: 'ADD_SHEET_UNPROTECTED_DETAIL_RANGE', blockingProtections: [{ type: 'SHEET', effectiveUserIncluded: false }] },
  { projectCode: 'P3', projectName: 'Project 3', deptCode: 'D4', deptName: 'Dept 4', sheetName: '', schemaReady: false, canCreateInExistingSlot: false, canInsertNewDetailRow: false, effectiveUserCanEdit: false, blockingProtectionCount: 0, status: 'SCHEMA_NOT_READY', repairStrategy: 'MANUAL_REVIEW', blockingProtections: [] }
];
const summary = api.summary(3, sampleTargets, 2);
assert.equal(summary.okCount, 1);
assert.equal(summary.protectionCount, 1);
assert.equal(summary.schemaConfigErrorCount, 1);
assert.equal(summary.safeAutoApplyCount, 1);
assert.equal(api.matrix(sampleTargets)[1].Protection, 1);
assert.equal(api.groups(sampleTargets).detailSlotLocked.length, 1);
assert.equal(api.groups(sampleTargets).schemaNotReady.length, 1);

context.qltdPbDetailProtectionLoadRun_ = (runId) => runId === 'RUN-1';
assert.equal(api.validateApply({ confirmed: true, auditRunId: 'RUN-1', targets: [{ projectCode: 'P1', deptCode: 'D2', expectedProtectionFingerprint: 'F1', repairStrategy: 'ADD_SHEET_UNPROTECTED_DETAIL_RANGE' }] }, 'apply').error, null);
assert.equal(api.validateApply({ confirmed: true, auditRunId: 'RUN-1', targets: [] }, 'apply').error.errors[0].code, 'TARGET_ALLOWLIST_REQUIRED');
assert.equal(api.autoSafe('ADD_EFFECTIVE_USER'), true);
assert.equal(api.autoSafe('MANUAL_REVIEW'), false);
assert.equal(api.key('37-5.HL', 'THIET-KE'), '37_5_HL__THIET_KE');

console.log('PB_DETAIL protection audit tests: PASS');
