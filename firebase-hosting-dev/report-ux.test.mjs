import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pb = fs.readFileSync(new URL('./pb-detail-ui.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

const weeklyBinding = app.slice(app.indexOf('function bindWeeklyUpdateControls'), app.indexOf('async function loadGanttDataForSelectedProject'));
assert.match(weeklyBinding, /renderWeeklyUpdateRegion\(\)/);
assert.doesNotMatch(weeklyBinding, /renderSelectedDeptPlan\(\)/);
assert.doesNotMatch(weeklyBinding, /fetchBackendJson|dispatchDeptPlanRendered/);
assert.match(app, /id="weeklyUpdateMount"/);
assert.match(app, /class="weekly-period-control"/);
assert.match(app, /Thời gian kế hoạch/);
assert.match(styles, /body\.qltd-report-mode \.dept-plan-panel\.compact/);
assert.match(styles, /width: calc\(100vw - 32px\)/);
assert.doesNotMatch(app, /Phần trong tháng|2 \/ 7 ngày|5 \/ 7 ngày/);

const contextHandler = pb.slice(pb.indexOf('function qltdPbDetailHandleDeptPlanRendered'), pb.indexOf('function qltdPbDetailBoot'));
assert.doesNotMatch(contextHandler, /qltdPbDetailLoadAssignees/);
assert.match(pb, /qltdPbDetailAssigneeCache = new Map/);

console.log('Report UX/request contract: 12/12 cases passed.');
