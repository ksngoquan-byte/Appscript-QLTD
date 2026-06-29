import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildMainMilestoneTaskIndex,
  getMainMilestoneStableKey,
  isMainMilestoneKeySelected,
  migrateMainMilestoneKeys,
  resolveLegacyMainMilestoneKey,
  toggleMainMilestoneTaskKey
} from './main-milestone-logic.js';

const projectCode = '37-5.HL';
const tasks = [
  { id: 'A-ID', code: 'A-CODE', masterTaskCode: 'A-MASTER', owner: 'KinhDoanh', wbs: 'I.1' },
  { id: 'B-ID', code: 'B-CODE', masterTaskCode: 'B-MASTER', owner: 'KinhDoanh', parent: 'A-ID', wbs: 'I.2' },
  { id: 'C-ID', code: 'C-CODE', masterTaskCode: 'C-MASTER', owner: 'BQLDA', wbs: 'II.1' },
  { id: 'D-ID', code: 'DUPLICATE', masterTaskCode: 'D-MASTER' },
  { id: 'E-ID', code: 'DUPLICATE', masterTaskCode: 'E-MASTER' },
  { id: 'NO-CODE', text: 'No stable code' }
];

assert.equal(getMainMilestoneStableKey(tasks[0], projectCode), '37-5.HL|A-MASTER');
assert.equal(getMainMilestoneStableKey(tasks[5], projectCode), '');

const migration = migrateMainMilestoneKeys(
  ['A-ID', 'B-MASTER', 'C-CODE', '37-5.HL|A-MASTER', 'DUPLICATE', 'missing-key'],
  tasks,
  projectCode
);
assert.deepEqual([...migration.keys], [
  '37-5.HL|A-MASTER',
  '37-5.HL|B-MASTER',
  '37-5.HL|C-MASTER'
]);
assert.deepEqual([...migration.orphanKeys], ['DUPLICATE', 'missing-key']);
assert.equal(migration.migratedCount, 3);
assert.equal(migration.ambiguousCount, 1);
assert.equal(migration.orphanCount, 2);
assert.deepEqual(
  migration.warnings.map((warning) => warning.code),
  ['MAIN_MILESTONE_AMBIGUOUS_KEY', 'MAIN_MILESTONE_ORPHAN_KEY']
);

const index = buildMainMilestoneTaskIndex(tasks, projectCode);
assert.equal(resolveLegacyMainMilestoneKey('A-ID', index, projectCode).status, 'MIGRATED');
assert.equal(resolveLegacyMainMilestoneKey('DUPLICATE', index, projectCode).status, 'AMBIGUOUS');

const selected = new Set(migration.keys);
assert.equal(isMainMilestoneKeySelected(selected, tasks[0], projectCode), true);
toggleMainMilestoneTaskKey(selected, tasks[0], projectCode);
assert.equal(isMainMilestoneKeySelected(selected, tasks[0], projectCode), false);
toggleMainMilestoneTaskKey(selected, tasks[0], projectCode);

const changedTreeTask = { ...tasks[0], id: 'NEW-ID', parent: 'NEW-PARENT', wbs: 'XX.9' };
assert.equal(
  isMainMilestoneKeySelected(selected, changedTreeTask, projectCode),
  true,
  'stable key survives id/parent/WBS changes'
);

const visibleKinhDoanh = tasks.filter((task) =>
  task.owner === 'KinhDoanh' &&
  isMainMilestoneKeySelected(selected, task, projectCode)
);
assert.deepEqual(visibleKinhDoanh.map((task) => task.id), ['A-ID', 'B-ID']);

const cached = JSON.stringify({ keys: [...selected], orphanKeys: [...migration.orphanKeys] });
const reloaded = JSON.parse(cached);
const afterReload = migrateMainMilestoneKeys(
  [...reloaded.keys, ...reloaded.orphanKeys],
  tasks,
  projectCode
);
assert.deepEqual([...afterReload.keys], [...selected]);
assert.deepEqual([...afterReload.orphanKeys], [...migration.orphanKeys]);

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
assert.doesNotMatch(app, /qltdMainMilestoneIds/);
assert.match(app, /Mốc hợp lệ: \$\{valid\}/);
assert.match(app, /Chưa khớp: \$\{orphan\}/);
assert.match(app, /ids: JSON\.stringify\(Array\.from\(qltdMainMilestoneKeys\)\)/);
assert.match(app, /codes: JSON\.stringify\(Array\.from\(qltdMainMilestoneOrphanKeys\)\)/);
assert.match(app, /keys: \[\],\s+orphanKeys: \[\],\s+milestoneIds: \[\]/);
assert.match(app, /Công việc chưa có Mã công việc Master nên chưa thể chọn làm mốc chính\./);
assert.match(app, /if \(!canSelectMainMilestone\(\)\) return;/);
assert.match(app, /if \(!canResetMainMilestone\(\)\) return;/);

console.log('Main milestone stable key/migration/filter/reload: all cases passed.');
