import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../apps-script-dev-api/32_DEPT_PLAN_SERVICE.js', import.meta.url),
  'utf8'
);
const context = vm.createContext({ console });
vm.runInContext(source, context);

const deptPlan = {
  masters: [
    { masterCode: 'CV-010', stt: 'II.3.2', rowIndex: 14, details: [{}] },
    { masterCode: 'CV-999', stt: 'X', rowIndex: 99, details: [] }
  ]
};
const warnings = [];
context.qltdDeptPlanEnrichWithMasterContext_(deptPlan, {
  'CV-010': {
    congViecZone: 'Zone 1',
    congViecHangMuc: 'LK02',
    zone: 'Zone 1',
    hangMuc: 'Inherited LK 05',
    wbs: 'II.3.2',
    wbsPath: 'II > II.3 > II.3.2',
    contextPath: 'Zone 1 > LK 05 > Tiến độ thi công > Hoàn thành phần móng',
    mappingWarnings: ['CONG_TRINH_NOT_RESOLVED']
  }
}, warnings, '37-5.HL');

assert.equal(deptPlan.masters[0].zone, 'Zone 1');
assert.equal(deptPlan.masters[0].hangMuc, 'Inherited LK 05');
assert.equal(deptPlan.masters[0].ownZone, 'Zone 1');
assert.equal(deptPlan.masters[0].ownHangMuc, 'LK02');
assert.equal(deptPlan.masters[0].details[0].contextPath, deptPlan.masters[0].contextPath);
assert.equal(deptPlan.masters[1].mappingWarnings.join(','), 'MASTER_TASK_NOT_FOUND');
assert.equal(warnings.length, 1);
assert.equal(warnings[0].type, 'MASTER_TASK_NOT_FOUND');

console.log('Department plan context enrichment: PASS');
