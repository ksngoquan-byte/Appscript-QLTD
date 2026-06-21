import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function latestFunction(name, nextName) {
  const start = app.lastIndexOf(`function ${name}`);
  const end = nextName ? app.indexOf(`function ${nextName}`, start + 1) : app.length;
  assert.ok(start >= 0 && end > start, `Khong tim thay ham ${name}`);
  return app.slice(start, end);
}

const renderGantt = latestFunction('renderGanttPanel', 'bindGanttToolbar');
assert.match(renderGantt, /Gantt tiến độ/);
assert.match(renderGantt, /Gantt ngân sách/);
assert.match(renderGantt, /data-gantt-view-mode="progress"/);
assert.match(renderGantt, /data-gantt-view-mode="budget"/);

const bindings = latestFunction('bindGanttToolbar', 'applyGanttFilters');
assert.match(bindings, /qltdGanttViewMode = nextMode/);
assert.match(bindings, /ensureGanttBudgetMapForProject/);
assert.match(bindings, /renderGanttPanel\(payload\)/);

const budgetLoader = latestFunction('ensureGanttBudgetMapForProject', 'renderGanttPanel');
assert.match(budgetLoader, /budget_getTaskBudgetMap/);
assert.match(budgetLoader, /byMasterTaskCode/);
assert.match(budgetLoader, /qltdGanttBudgetCache/);

const budgetKey = latestFunction('getGanttTaskBudgetCode', 'getGanttBudgetMapForProject');
assert.match(budgetKey, /task\.code \|\| task\.masterTaskCode \|\| task\.masterCode/);
assert.doesNotMatch(budgetKey, /wbs/);
assert.doesNotMatch(budgetKey, /text/);

const attach = latestFunction('attachGanttBudgetToTasks', 'formatGanttBudgetCell');
assert.match(attach, /directChiPlan/);
assert.match(attach, /plannedRevenue/);
assert.match(attach, /chiItemCount/);
assert.match(attach, /thuItemCount/);
assert.doesNotMatch(attach, /parent/);
assert.doesNotMatch(attach, /children/);

const filters = latestFunction('applyGanttFilters', 'shouldShowByDepth');
assert.match(filters, /attachGanttBudgetToTasks/);
assert.match(filters, /getGanttBudgetMapForProject/);

const columns = latestFunction('qltdBuildGanttColumns', 'initDhtmlxGantt');
assert.match(columns, /Trần chi phí trực tiếp/);
assert.match(columns, /Dự thu kế hoạch/);
assert.match(columns, /formatGanttBudgetCell\(task\.directChiPlan, 'chi'\)/);
assert.match(columns, /formatGanttBudgetCell\(task\.plannedRevenue, 'thu'\)/);
assert.match(columns, /Số ngày/);
assert.match(columns, /qltdGanttViewMode === 'budget'/);

const exportRows = latestFunction('qltdWeb07BuildGanttDataRows', 'qltdWeb07BuildGanttDataColumns');
assert.match(exportRows, /row\.directChiPlan/);
assert.match(exportRows, /row\.plannedRevenue/);
assert.match(exportRows, /qltdGanttViewMode === 'budget'/);

const exportColumns = latestFunction('qltdWeb07BuildGanttDataColumns', 'qltdWeb07SafeFilename');
assert.match(exportColumns, /Trần chi phí trực tiếp/);
assert.match(exportColumns, /Dự thu kế hoạch/);
assert.match(exportColumns, /columns\.splice/);

assert.match(app, /gantt-mode-tabs/);
assert.match(app, /gantt-budget-money/);
assert.match(app, /gantt-budget-empty/);

console.log('Gantt budget view: PASS');
