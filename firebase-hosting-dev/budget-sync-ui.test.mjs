import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function latestFunction(name, nextName) {
  const start = app.lastIndexOf(`function ${name}`);
  const end = nextName ? app.indexOf(`function ${nextName}`, start + 1) : app.length;
  assert.ok(start >= 0 && end > start, `Khong tim thay ham ${name}`);
  return app.slice(start, end);
}

assert.match(app, /let qltdBudgetSyncRunning = false/);

const renderGantt = latestFunction('renderGanttPanel', 'bindGanttToolbar');
assert.match(renderGantt, /ganttBudgetSyncButton/);
assert.match(renderGantt, /qltdGanttViewMode === 'budget'/);
assert.match(renderGantt, /Đồng bộ ngân sách/);

const bindings = latestFunction('bindGanttToolbar', 'applyGanttFilters');
assert.match(bindings, /ganttBudgetSyncButton/);
assert.match(bindings, /handleGanttBudgetSyncClick\(budgetSyncButton, payload\)/);

const handler = latestFunction('handleGanttBudgetSyncClick', 'renderGanttPanel');
assert.match(handler, /budget_syncApprovedTaskBudgets/);
assert.match(handler, /dryRun: '1'/);
assert.match(handler, /postBackendJson/);
assert.match(handler, /dryRun: '0'/);
assert.match(handler, /window\.confirm/);
assert.match(handler, /Đang đồng bộ/);
assert.match(handler, /refreshGanttBudgetMapForProject/);
assert.match(handler, /renderGanttPanel\(qltdGanttPayload\)/);
assert.match(handler, /qltdBudgetSyncRunning/);

const refresh = latestFunction('refreshGanttBudgetMapForProject', 'formatBudgetSyncSummary');
assert.match(refresh, /qltdGanttBudgetCache\.delete/);
assert.match(refresh, /budget_getTaskBudgetMap/);
assert.match(refresh, /qltdGanttBudgetCache\.set/);

const summary = latestFunction('formatBudgetSyncSummary', 'getBudgetSyncErrorMessage');
assert.match(summary, /rowsScanned/);
assert.match(summary, /createItems/);
assert.match(summary, /deactivateAllocations/);
assert.match(summary, /conflicts/);

console.log('Budget sync UI: PASS');
