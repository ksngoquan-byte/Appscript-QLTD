import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  getMainMilestoneStableKey,
  isMainMilestoneKeySelected
} from './main-milestone-logic.js';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `Missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed ${name}`);
}

const context = vm.createContext({});
vm.runInContext(extractFunction(app, 'isGanttBusinessRow'), context);

assert.equal(context.isGanttBusinessRow({ rowType: 'TASK' }, 'main-milestones'), true);
assert.equal(context.isGanttBusinessRow({ rowType: 'MILESTONE' }, 'main-milestones'), true);
assert.equal(context.isGanttBusinessRow({ rowType: 'SCHEDULED_GROUP' }, 'main-milestones'), true);
assert.equal(context.isGanttBusinessRow({ rowType: 'STRUCTURAL_GROUP' }, 'main-milestones'), false);
assert.equal(context.isGanttBusinessRow({ rowType: 'ZONE_GROUP' }, 'main-milestones'), false);
assert.equal(context.isGanttBusinessRow({ rowType: 'SCHEDULED_GROUP' }, 'all'), false);

const projectCode = '37-5.HL';
const tasks = [
  { id: 'zone', parent: '0', rowType: 'ZONE_GROUP', masterTaskCode: 'CV-ZONE', owner: '' },
  { id: 'lk', parent: 'zone', rowType: 'STRUCTURAL_GROUP', masterTaskCode: 'CV-LK', owner: '' },
  { id: 'group', parent: 'lk', rowType: 'SCHEDULED_GROUP', masterTaskCode: 'CV-GROUP', owner: 'KinhDoanh' },
  { id: 'task', parent: 'group', rowType: 'TASK', masterTaskCode: 'CV-TASK', owner: 'KinhDoanh' }
];
const selectedKeys = new Set([
  getMainMilestoneStableKey(tasks[0], projectCode),
  getMainMilestoneStableKey(tasks[1], projectCode),
  getMainMilestoneStableKey(tasks[2], projectCode),
  getMainMilestoneStableKey(tasks[3], projectCode)
]);
const directlyMatched = tasks.filter((task) =>
  task.owner === 'KinhDoanh' &&
  context.isGanttBusinessRow(task, 'main-milestones') &&
  isMainMilestoneKeySelected(selectedKeys, task, projectCode)
);
assert.deepEqual(directlyMatched.map((task) => task.id), ['group', 'task']);

const byId = Object.fromEntries(tasks.map((task) => [task.id, task]));
const visible = new Set();
directlyMatched.forEach((task) => {
  let current = task;
  while (current) {
    visible.add(current.id);
    current = current.parent === '0' ? null : byId[current.parent];
  }
});
assert.deepEqual([...visible], ['group', 'lk', 'zone', 'task']);

assert.match(app, /const matchRowType = depthFilter === 'main-milestones'/);
assert.match(app, /Không có mốc chính phù hợp với bộ lọc hiện tại\./);
assert.match(app, /MAIN_MILESTONE_NON_RENDERABLE_GROUP_KEY/);
assert.match(app, /function isNormalizedCountedTask[\s\S]*rowType === 'TASK' \|\| rowType === 'MILESTONE'/);

console.log('Gantt main milestone row-type/filter/ancestor/empty-state: PASS');
