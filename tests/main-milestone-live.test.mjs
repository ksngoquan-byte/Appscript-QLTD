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
const selectedKinhDoanh = pilot.data.filter((task) =>
  task.owner === 'KinhDoanh' &&
  isMainMilestoneKeySelected(migration.keys, task, '37-5.HL')
);

assert.equal(pilot.data.length, 499);
assert.equal(pilot.links.length, 581);
assert.equal(rawKeys.length, 136);
assert.equal(migration.validCount, 136);
assert.equal(migration.migratedCount, 136);
assert.equal(migration.orphanCount, 0);
assert.equal(migration.ambiguousCount, 0);
assert.equal(selectedKinhDoanh.length, 26);
assert.ok(selectedKinhDoanh.some((task) => task.wbs === 'XII.5'));

const threeTasks = selectedKinhDoanh.slice(0, 3);
const threeKeys = new Set();
threeTasks.forEach((task) => toggleMainMilestoneTaskKey(threeKeys, task, '37-5.HL'));
const reloaded = migrateMainMilestoneKeys([...threeKeys], pilot.data, '37-5.HL');
assert.deepEqual([...reloaded.keys], [...threeKeys]);
assert.equal(
  pilot.data.filter((task) =>
    task.owner === 'KinhDoanh' &&
    isMainMilestoneKeySelected(reloaded.keys, task, '37-5.HL')
  ).length,
  3
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
  format: 'task.id',
  migrated: migration.migratedCount,
  valid: migration.validCount,
  orphan: migration.orphanCount,
  ambiguous: migration.ambiguousCount,
  kinhDoanhValid: selectedKinhDoanh.length,
  selectedThreeStableKeys: [...threeKeys],
  reloadValid: reloaded.validCount,
  tasks: pilot.data.length,
  links: pilot.links.length,
  smoke
}));
