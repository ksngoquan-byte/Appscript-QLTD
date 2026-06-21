import assert from 'node:assert/strict';
import fs from 'node:fs';

const cacheSource = fs.readFileSync(new URL('./api-read-cache.js', import.meta.url), 'utf8');
const dispatcherSource = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');
const serviceSource = fs.readFileSync(new URL('../apps-script-dev-api/55_Budget_Dashboard_Performance.js', import.meta.url), 'utf8');

assert.equal(cacheSource.includes("action === 'health'"), true);
assert.equal(cacheSource.includes('seedDepartmentDashboards'), true);
assert.equal(cacheSource.includes('120000'), true);
assert.equal(dispatcherSource.includes('qltdBudgetGetLiveDashboardOptimized_(params)'), true);
assert.equal(serviceSource.includes('departmentViews'), true);
assert.equal(serviceSource.includes('qltdBudgetReadBudgetItems_()'), true);
assert.equal(serviceSource.includes('qltdBudgetReadAllocations_()'), true);

console.log('performance-dashboard-cache.test.mjs: PASS');
