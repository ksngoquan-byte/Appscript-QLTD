import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps-script-dev-api/32_DEPT_PLAN_SERVICE.js', import.meta.url), 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(`${source}\nthis.api = { parse: qltdDeptPlanParseSheet_, map: qltdDeptPlanBuildColumnMap_, normalize: qltdDeptPlanNormalizeHeader_ };`, context);

const headers = ['STT', 'Nội dung công việc', 'Ngày bắt đầu kế hoạch', 'Ngày kết thúc kế hoạch', 'Mã công việc Master', 'Loại dòng'];
const dates = [
  ['V.1.1', 'Công việc 1', '2026-06-08', '2026-06-10', 'M-1', 'MASTER'],
  ['V.1.4', 'Công việc 2', '2026-06-11', '2026-06-11', 'M-2', 'MASTER'],
  ['V.1.5', 'Công việc 3', '2026-06-12', '2026-06-26', 'M-3', 'MASTER'],
  ['V.3.1', 'Công việc 4', '2026-06-10', '2026-06-11', 'M-4', 'MASTER'],
  ['V.3.2', 'Công việc 5', '2026-06-12', '2026-07-11', 'M-5', 'MASTER']
];
const values = [headers, ...dates];
const sheet = { getName: () => 'PTDA', getDataRange: () => ({ getValues: () => values }) };
const parsed = context.api.parse(sheet, { projectCode: '24-1.ĐB' });

assert.equal(context.api.normalize('Ngày bắt đầu kế hoạch'), 'NGAYBATDAUKEHOACH');
assert.equal(context.api.map(headers).planStart, 2);
assert.equal(context.api.map(['Bắt đầu KH']).planStart, 0);
assert.equal(context.api.map(['Kết thúc KH']).planFinish, 0);
assert.equal(parsed.masters.length, 5);
assert.deepEqual(Array.from(parsed.masters, (item) => item.planStart), dates.map((row) => row[2]));
assert.deepEqual(Array.from(parsed.masters, (item) => item.planFinish), dates.map((row) => row[3]));
assert.ok(parsed.masters.every((item) => item.planStart && item.planFinish));

console.log('Dept plan date parser/DTO: 5/5 masters passed.');
