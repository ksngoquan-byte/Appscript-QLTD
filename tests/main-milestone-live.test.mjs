import assert from 'node:assert/strict';
import {
  isMainMilestoneKeySelected,
  migrateMainMilestoneKeys,
  toggleMainMilestoneTaskKey
} from '../firebase-hosting-dev/main-milestone-logic.js';

const endpoint = 'https://script.google.com/macros/s/AKfycbx6iHCEf6Ba05h6u6DiBcqv3kxV79T6RvktzoFsdBJXeQjBaCNMyGQL5akptlX8jGtxpg/exec';

async function getProject(projectCode) {
  const response = await fetch(`${endpoint}?action=ganttData&projectCode=${encodeURIComponent(projectCode)}`);
  assert.equal(response.ok, true, `${projectCode}: endpoint HTTP`);
  const payload = await response.json();
  assert.equal(payload.success, true, `${projectCode}: API success`);
  return payload;
}

const pilot = await getProject('37-5.HL');
const rawKeys = [
  ...(pilot.mainMilestoneIds || []),
  ...(pilot.mainMilestoneCodes || [])
];
const migration = migrateMainMilestoneKeys(rawKeys, pilot.data, '37-5.HL');
const selectedTasks = pilot.data.filter((task) =>
  isMainMilestoneKeySelected(migration.keys, task, '37-5.HL')
);
const selectedKinhDoanh = pilot.data.filter((task) =>
  task.owner === 'KinhDoanh' &&
  isMainMilestoneKeySelected(migration.keys, task, '37-5.HL')
);
const countBy = (rows, key) => Object.fromEntries(
  Object.entries(Object.groupBy(rows, (row) => String(row[key] || '__BLANK__')))
    .map(([value, items]) => [value, items.length])
);
const rowTypes = countBy(selectedTasks, 'rowType');
const kinhDoanhRowTypes = countBy(selectedKinhDoanh, 'rowType');
const validGanttMilestoneTypes = new Set(['TASK', 'MILESTONE', 'SCHEDULED_GROUP']);
const selectedByOwner = {};
const selectedOwnerRowTypes = {};
for (const owner of ['KinhDoanh', 'BQLDA', 'PTDA']) {
  const ownerTasks = selectedTasks.filter((task) =>
    task.owner === owner && validGanttMilestoneTypes.has(task.rowType)
  );
  selectedByOwner[owner] = ownerTasks.length;
  selectedOwnerRowTypes[owner] = countBy(ownerTasks, 'rowType');
}
const countedDashboardTasks = pilot.data.filter((task) =>
  ['TASK', 'MILESTONE'].includes(task.rowType)
);

assert.equal(pilot.data.length, 499);
assert.equal(pilot.links.length, 581);
assert.equal(rawKeys.length, 136);
assert.equal(migration.validCount, 136);
assert.equal(migration.migratedCount, 0);
assert.ok(rawKeys.every((key) => String(key).startsWith('37-5.HL|')));
assert.equal(migration.orphanCount, 0);
assert.equal(migration.ambiguousCount, 0);
assert.equal(selectedKinhDoanh.length, 26);
assert.equal(selectedTasks.length, 136);
assert.equal(selectedByOwner.KinhDoanh, 26);
assert.equal(rowTypes.ZONE_GROUP, 3);
assert.equal(rowTypes.STRUCTURAL_GROUP, 26);
assert.equal(rowTypes.SCHEDULED_GROUP, 57);
assert.equal(rowTypes.TASK, 50);
assert.equal(kinhDoanhRowTypes.SCHEDULED_GROUP, 26);
assert.equal(selectedByOwner.BQLDA, 54);
assert.equal(selectedOwnerRowTypes.BQLDA.SCHEDULED_GROUP, 28);
assert.equal(selectedOwnerRowTypes.BQLDA.TASK, 26);
assert.equal(selectedByOwner.PTDA, 13);
assert.equal(selectedOwnerRowTypes.PTDA.TASK, 13);
assert.equal(countedDashboardTasks.length, 405);
assert.ok(selectedKinhDoanh.some((task) => task.wbs === 'XII.5'));

const mixedTasks = [
  selectedTasks.find((task) => task.rowType === 'SCHEDULED_GROUP'),
  selectedTasks.find((task) => task.rowType === 'TASK')
];
assert.ok(mixedTasks.every(Boolean));
const mixedKeys = new Set();
mixedTasks.forEach((task) => toggleMainMilestoneTaskKey(mixedKeys, task, '37-5.HL'));
const reloaded = migrateMainMilestoneKeys([...mixedKeys], pilot.data, '37-5.HL');
assert.deepEqual([...reloaded.keys], [...mixedKeys]);
assert.equal(
  pilot.data.filter((task) =>
    isMainMilestoneKeySelected(reloaded.keys, task, '37-5.HL')
  ).length,
  2
);

const smoke = [];
for (const projectCode of ['37-5.HL1', '24-1.ĐB']) {
  const payload = await getProject(projectCode);
  const values = [
    ...(payload.mainMilestoneIds || []),
    ...(payload.mainMilestoneCodes || [])
  ];
  const result = migrateMainMilestoneKeys(values, payload.data, projectCode);
  assert.ok(payload.data.length > 0, `${projectCode}: tasks`);
  assert.ok(payload.links.length > 0, `${projectCode}: links`);
  smoke.push({
    projectCode,
    tasks: payload.data.length,
    links: payload.links.length,
    raw: values.length,
    valid: result.validCount,
    orphan: result.orphanCount,
    ambiguous: result.ambiguousCount
  });
}

console.log(JSON.stringify({
  status: 'PASS',
  rawKeys: rawKeys.length,
  format: 'stable-composite',
  migrated: migration.migratedCount,
  valid: migration.validCount,
  orphan: migration.orphanCount,
  ambiguous: migration.ambiguousCount,
  rowTypes,
  kinhDoanhValid: selectedKinhDoanh.length,
  kinhDoanhRowTypes,
  selectedByOwner,
  selectedOwnerRowTypes,
  invalidIndependentMilestoneRows: selectedTasks.filter((task) =>
    ['STRUCTURAL_GROUP', 'ZONE_GROUP'].includes(task.rowType)
  ).length,
  dashboardCountedTasks: countedDashboardTasks.length,
  selectedMixedStableKeys: [...mixedKeys],
  reloadValid: reloaded.validCount,
  tasks: pilot.data.length,
  links: pilot.links.length,
  smoke
}));
