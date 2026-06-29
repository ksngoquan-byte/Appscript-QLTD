import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./dashboard_executive_v3.css', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `Missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the complete declaration parses.
    }
  }
  throw new Error(`Unclosed ${name}`);
}

const context = vm.createContext({
  parseIsoDate: (value) => value ? new Date(`${value}T00:00:00`) : null
});
vm.runInContext(extractFunction(app, 'qltdWeb07GetTaskDuration'), context);
vm.runInContext(extractFunction(app, 'qltdResolveDhtmlxTaskType'), context);

assert.equal(context.qltdResolveDhtmlxTaskType({ rowType: 'MILESTONE' }), 'milestone');
assert.equal(context.qltdResolveDhtmlxTaskType({ rowType: 'SCHEDULED_GROUP' }), 'project');
assert.equal(context.qltdResolveDhtmlxTaskType({ rowType: 'ZONE_GROUP' }), 'task');
assert.equal(context.qltdResolveDhtmlxTaskType({ rowType: 'STRUCTURAL_GROUP' }), 'task');
assert.equal(context.qltdResolveDhtmlxTaskType({ rowType: 'TASK' }), 'task');
assert.equal(context.qltdWeb07GetTaskDuration({
  rowType: 'STRUCTURAL_GROUP',
  duration: 1,
  start_date: '2025-09-21',
  end_date: '2028-04-22'
}), 945);

assert.doesNotMatch(app, /function getExecutiveTaskCategoryFromColF/);
assert.match(app, /contextLabel: String\(item\.hangMuc \|\| ''\)\.trim\(\)/);
assert.match(app, /const unmappedContext = realTasks\.filter\(\(task\) => !String\(task\.hangMuc \|\| ''\)\.trim\(\)\)/);
assert.match(app, /\.filter\(\(field\) => field\.values\.length\)/);
assert.match(app, /title="\$\{escapeHtml\(task\.contextPath \|\| ''\)\}"/);
assert.match(app, /qltd-zone-summary/);
assert.match(app, /qltd-structural-summary/);
assert.match(app, /qltd-scheduled-group/);
assert.match(css, /\.exec-context-filter-card/);
assert.match(css, /\.exec-context-filters/);

console.log('Gantt summary date and Dashboard normalized context: PASS');
