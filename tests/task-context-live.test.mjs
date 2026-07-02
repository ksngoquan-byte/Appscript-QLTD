import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const endpoint = 'https://script.google.com/macros/s/AKfycbx6iHCEf6Ba05h6u6DiBcqv3kxV79T6RvktzoFsdBJXeQjBaCNMyGQL5akptlX8jGtxpg/exec';
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

async function getProject(projectCode) {
  const response = await fetch(`${endpoint}?action=ganttData&projectCode=${encodeURIComponent(projectCode)}`);
  assert.equal(response.ok, true, `${projectCode}: endpoint HTTP`);
  const payload = await response.json();
  assert.equal(payload.success, true, `${projectCode}: API success`);
  return payload;
}

const pilot = await getProject('37-5.HL');
const beforeBytes = Buffer.byteLength(JSON.stringify(pilot));
const tasks = structuredClone(pilot.data);
const warnings = [];
context.qltdTaskContextResolveDataset_(tasks, { projectCode: pilot.projectCode }, warnings);
const links = context.qltdTaskContextFilterLinks_(pilot.links, tasks, warnings);
const publicTasks = context.qltdTaskContextBuildPublicDataset_(tasks);
const afterPayload = { ...pilot, data: publicTasks, links, warnings: [...pilot.warnings, ...warnings] };
const afterBytes = Buffer.byteLength(JSON.stringify(afterPayload));
const byWbs = Object.fromEntries(tasks.filter((task) => task.wbs).map((task) => [task.wbs, task]));
const zones = tasks.filter((task) => task.rowType === 'ZONE_GROUP');
const countedTasks = tasks.filter((task) => ['TASK', 'MILESTONE'].includes(task.rowType));
const publicByWbs = Object.fromEntries(publicTasks.filter((task) => task.wbs).map((task) => [task.wbs, task]));
const hangMucValues = [...new Set(countedTasks.map((task) => task.hangMuc).filter(Boolean))].sort();
const lk14Tasks = countedTasks.filter((task) => task.hangMuc === 'LK 14');

assert.equal(tasks.length, 499);
assert.equal(new Set(tasks.map((task) => String(task.id))).size, 499);
assert.equal(zones.length, 3);
assert.equal(tasks.filter((task) => String(task.parent || '0') === '0').length, 3);
assert.equal(byWbs['II.3.2'].parent, byWbs['II.3'].id);
assert.equal(byWbs['II.3'].parent, byWbs.II.id);
assert.equal(byWbs.II.parent, zones[0].id);
assert.equal(byWbs['II.3.2'].zone, 'Zone 1');
assert.equal(byWbs['II.3.2'].hangMuc, 'LK 05');
assert.equal(publicByWbs['II.3.2'].zone, 'Zone 1');
assert.equal(publicByWbs['II.3.2'].hangMuc, 'LK 05');
assert.ok(publicByWbs['II.3.2'].contextPath);
assert.equal(byWbs['III.3.2'].hangMuc, 'LK 14');
assert.equal(byWbs['IV.2.2'].hangMuc, 'LK 15');
assert.deepEqual(
  ['III', 'IV', 'V'].map((wbs) => [
    byWbs[wbs].start_date,
    byWbs[wbs].end_date,
    byWbs[wbs].duration
  ]),
  [
    ['2025-09-21', '2028-04-22', 945],
    ['2025-10-10', '2028-04-22', 926],
    ['2025-09-21', '2028-04-22', 945]
  ]
);
assert.equal(countedTasks.filter((task) => !String(task.hangMuc || '').trim()).length, 0);
assert.ok(lk14Tasks.length > 0);
assert.ok(lk14Tasks.every((task) => task.hangMuc === 'LK 14'));
for (const hangMuc of ['LK 05', 'LK 14', 'LK 15', 'LK 19']) {
  assert.ok(hangMucValues.includes(hangMuc), `missing Hạng mục ${hangMuc}`);
}
assert.equal(links.length, 581);
assert.deepEqual(
  zones.map((zone) => [zone.start_date, zone.end_date]),
  [
    ['2025-09-21', '2028-04-22'],
    ['2025-10-10', '2028-04-22'],
    ['2025-10-10', '2028-04-22']
  ]
);

const smoke = [];
for (const projectCode of ['37-5.HL1', '24-1.ĐB']) {
  const payload = await getProject(projectCode);
  const smokeTasks = structuredClone(payload.data);
  const smokeWarnings = [];
  context.qltdTaskContextResolveDataset_(smokeTasks, { projectCode }, smokeWarnings);
  const smokeLinks = context.qltdTaskContextFilterLinks_(payload.links, smokeTasks, smokeWarnings);
  assert.equal(smokeTasks.length, payload.data.length, `${projectCode}: task count`);
  assert.ok(smokeTasks.length > 0, `${projectCode}: non-empty`);
  assert.ok(smokeLinks.length <= payload.links.length, `${projectCode}: valid link filter`);
  smoke.push({
    projectCode,
    tasks: smokeTasks.length,
    linksBefore: payload.links.length,
    linksAfter: smokeLinks.length,
    zones: smokeTasks.filter((task) => task.rowType === 'ZONE_GROUP').length
  });
}

console.log(JSON.stringify({
  status: 'PASS',
  pilotTasks: tasks.length,
  pilotLinks: links.length,
  countedTasks: countedTasks.length,
  unmappedHangMuc: countedTasks.filter((task) => !String(task.hangMuc || '').trim()).length,
  hangMucValues,
  rowTypes: Object.fromEntries(
    Object.entries(Object.groupBy(tasks, (task) => task.rowType)).map(([key, rows]) => [key, rows.length])
  ),
  beforeBytes,
  afterBytes,
  payloadIncreasePercent: Number((((afterBytes - beforeBytes) / beforeBytes) * 100).toFixed(1))
  ,
  smoke
}));
