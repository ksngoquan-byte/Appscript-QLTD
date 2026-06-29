import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const resolverSource = fs.readFileSync(
  new URL('../apps-script-dev-api/35_TASK_CONTEXT_RESOLVER.js', import.meta.url),
  'utf8'
);
const context = vm.createContext({ console });
vm.runInContext(`
  function qltdGanttDurationDays_(startIso, endIso) {
    if (!startIso || !endIso) return 1;
    const start = new Date(startIso + 'T00:00:00');
    const end = new Date(endIso + 'T00:00:00');
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
  }
  ${resolverSource}
`, context);

function row(id, wbs, text, start = '', end = '', extra = {}) {
  return {
    id: String(id),
    code: `CV-${String(id).padStart(3, '0')}`,
    wbs,
    text,
    start_date: start,
    end_date: end,
    baselineStart: start,
    baselineEnd: end,
    actualStart: '',
    actualEnd: '',
    type: extra.type || 'task',
    wbsLevel: wbs ? wbs.split('.').length : 999,
    predecessorRaw: extra.predecessorRaw || '',
    rawRowNumber: Number(id) + 4,
    raw: extra.raw || {}
  };
}

const tasks = [
  row(1, '', 'Zone 1'),
  row(2, 'II', 'LK 05'),
  row(3, 'II.3', 'Tiến độ thi công', '2026-01-01', '2026-02-15', { predecessorRaw: '4SS;5FF' }),
  row(4, 'II.3.1', 'Mốc đầu', '2026-01-02', '2026-01-02', { type: 'milestone' }),
  row(5, 'II.3.2', 'Hoàn thành phần móng', '2026-01-10', '2026-02-20'),
  row(6, '', 'Zone 2'),
  row(7, 'III', 'LK 14'),
  row(8, 'III.1', 'Task Zone 2', '2026-03-01', '2026-03-10'),
  row(9, '', 'Zone 3'),
  row(10, 'IV', 'Nhóm chưa có lịch')
];
const warnings = [];
context.qltdTaskContextResolveDataset_(tasks, { projectCode: '37-5.HL' }, warnings);

assert.equal(tasks[0].rowType, 'ZONE_GROUP');
assert.equal(tasks[1].rowType, 'STRUCTURAL_GROUP');
assert.equal(tasks[2].rowType, 'SCHEDULED_GROUP');
assert.equal(tasks[3].rowType, 'MILESTONE');
assert.equal(tasks[4].rowType, 'TASK');
assert.equal(tasks[4].parent, '3');
assert.equal(tasks[2].parent, '2');
assert.equal(tasks[1].parent, '1');
assert.equal(tasks[4].zone, 'Zone 1');
assert.equal(tasks[4].hangMuc, 'LK 05');
assert.equal(tasks[4].wbsPath, 'II > II.3 > II.3.2');
assert.equal(tasks[4].contextPath, 'Zone 1 > LK 05 > Tiến độ thi công > Hoàn thành phần móng');
assert.equal(tasks[7].zone, 'Zone 2');
assert.equal(tasks[7].parent, '7');
assert.equal(tasks[9].rowType, 'STRUCTURAL_GROUP');
assert.equal(tasks[9].$no_bar, true);
assert.equal(tasks[0].start_date, '2026-01-01');
assert.equal(tasks[0].end_date, '2026-02-20');
assert.equal(tasks[2].sourceEnd, '2026-02-15');
assert.equal(tasks[2].rollupEnd, '2026-02-20');
assert.ok(tasks[2].mappingWarnings.includes('GROUP_SCHEDULE_DIFFERS_FROM_CHILDREN'));

const links = [
  { id: 'scheduled', source: '4', target: '3', relation: 'SS' },
  { id: 'structural', source: '5', target: '2', relation: 'FS' }
];
const linkWarnings = [];
const filteredLinks = context.qltdTaskContextFilterLinks_(links, tasks, linkWarnings);
assert.deepEqual(filteredLinks.map((link) => link.id), ['scheduled']);
assert.equal(linkWarnings[0].type, 'STRUCTURAL_GROUP_LINK_SKIPPED');

console.log('Task context resolver: PASS');
