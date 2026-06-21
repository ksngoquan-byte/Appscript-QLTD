import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function latestFunction(name, nextName) {
  const start = app.lastIndexOf(`function ${name}`);
  const end = nextName ? app.indexOf(`function ${nextName}`, start + 1) : app.length;
  assert.ok(start >= 0 && end > start, `Khong tim thay ham ${name}`);
  return app.slice(start, end);
}

assert.match(app, /workDashboard: 'Dashboard c\\u00f4ng vi\\u1ec7c'/);
assert.match(app, /budgetDashboard: 'Dashboard ng\\u00e2n s\\u00e1ch'/);
assert.match(app, /help: 'H\\u01b0\\u1edbng d\\u1eabn s\\u1eed d\\u1ee5ng'/);
assert.match(app, /report: 'L\\u1eadp & c\\u1eadp nh\\u1eadt c\\u00f4ng vi\\u1ec7c'/);

const permissions = latestFunction('normalizePermissions', 'setApiStatus');
assert.match(permissions, /budgetDashboard: !!permissions\.budgetDashboard \|\| canViewCore/);
assert.match(permissions, /help: !!permissions\.help \|\| canViewCore/);
assert.match(permissions, /reportUpdate: !!permissions\.reportUpdate \|\| canViewCore/);

const applyPermissions = latestFunction('applyPermissions', 'getStoredProjectCode');
assert.match(applyPermissions, /ensureTopNavigation\(\)/);
assert.match(applyPermissions, /NAV_LABELS\.workDashboard/);
assert.match(applyPermissions, /NAV_LABELS\.budgetDashboard/);
assert.match(applyPermissions, /NAV_LABELS\.help/);
assert.match(applyPermissions, /NAV_LABELS\.report/);

const nav = latestFunction('ensureTopNavigation', 'ensureProjectSelector');
assert.ok(nav.indexOf('NAV_LABELS.workDashboard') < nav.indexOf('NAV_LABELS.budgetDashboard'));
assert.ok(nav.indexOf('NAV_LABELS.budgetDashboard') < nav.indexOf('NAV_LABELS.gantt'));
assert.ok(nav.indexOf('NAV_LABELS.gantt') < nav.indexOf('NAV_LABELS.help'));
assert.ok(nav.indexOf('NAV_LABELS.help') < nav.indexOf('NAV_LABELS.report'));
assert.ok(nav.indexOf('NAV_LABELS.report') < nav.indexOf('NAV_LABELS.admin'));

const projectSelector = latestFunction('ensureProjectSelector', 'ensureDeptSelector');
assert.match(projectSelector, /insertBefore\(wrapper, adminButton\)/);

const renderProjects = latestFunction('renderProjectOptions', 'loadProjectsForSelector');
assert.match(renderProjects, /loadBudgetDashboardForSelectedProject\(\{ force: true \}\)/);
assert.match(renderProjects, /renderNoProjectBudgetDashboardState\(\)/);

const panels = latestFunction('ensureWeb07Panels', 'showWeb07View');
assert.match(panels, /web07BudgetDashboardPanel/);
assert.match(panels, /web07HelpPanel/);

const router = latestFunction('showWeb07View', 'bindWeb07Navigation');
assert.match(router, /qltd-budget-mode/);
assert.match(router, /qltd-help-mode/);
assert.match(router, /loadBudgetDashboardForSelectedProject\(\)/);
assert.match(router, /renderHelpPanel\(\)/);

const bindings = latestFunction('bindWeb07Navigation', 'renderNoProjectBudgetDashboardState');
assert.match(bindings, /\[NAV_LABELS\.budgetDashboard, 'budget'\]/);
assert.match(bindings, /\[NAV_LABELS\.help, 'help'\]/);
assert.match(bindings, /\[NAV_LABELS\.report, 'report'\]/);

const loader = latestFunction('loadBudgetDashboardForSelectedProject', 'renderBudgetDashboardPanel');
assert.match(loader, /budget_getLiveDashboard/);
assert.match(loader, /deptCode: qltdBudgetDashboardView\.deptCode/);

const budgetRenderer = latestFunction('renderBudgetDashboardPanel', 'renderBudgetDashboardContent');
assert.match(budgetRenderer, /CENTRAL_NS_Items/);
assert.match(budgetRenderer, /CENTRAL_NS_Allocations/);
assert.match(budgetRenderer, /CENTRAL_NS_Raw/);
assert.match(budgetRenderer, /budgetDashboardDeptFilter/);

const budgetContent = latestFunction('renderBudgetDashboardContent', 'renderBudgetFlowCard');
assert.match(budgetContent, /renderBudgetFlowCard\('THU'/);
assert.match(budgetContent, /renderBudgetFlowCard\('CHI'/);
assert.match(budgetContent, /renderBudgetBalanceCard/);
assert.match(budgetContent, /renderBudgetAlerts/);
assert.match(budgetContent, /renderBudgetItemsTable/);

const styles = app.slice(app.indexOf('.budget-dashboard'), app.indexOf('@media (max-width: 900px)'));
assert.match(styles, /conic-gradient/);
assert.match(styles, /\.budget-dashboard-table/);
assert.match(styles, /\.budget-alert-list/);

console.log('Navigation and budget dashboard UI: PASS');
