import assert from 'node:assert/strict';
import {
  getExecutiveTaskDueDate,
  isExecutiveTaskCompleted,
  isExecutiveTaskOverdue
} from './dashboard-overdue.js';

const today = new Date(2026, 5, 18);
const yesterday = '2026-06-17';
const nextWeek = '2026-06-25';

function task(overrides = {}) {
  return { text: 'Task', isRealTask: true, isCategoryRow: false, ...overrides };
}

assert.equal(isExecutiveTaskOverdue(task({ status: 'Chưa bắt đầu', end_date: yesterday }), today), true, 'Case 1');
assert.equal(isExecutiveTaskOverdue(task({ status: 'Đang thực hiện', end_date: yesterday }), today), true, 'Case 2');
assert.equal(isExecutiveTaskOverdue(task({ status: 'Hoàn thành', end_date: yesterday, actualFinish: yesterday }), today), false, 'Case 3');
assert.equal(isExecutiveTaskOverdue(task({ isRealTask: false, isCategoryRow: true }), today), false, 'Case 4');
assert.equal(isExecutiveTaskOverdue(task({ status: 'Đang thực hiện', end_date: nextWeek }), today), false, 'Case 5 overdue');
assert.ok(getExecutiveTaskDueDate(task({ deadline: nextWeek })) >= today, 'Case 5 upcoming');
assert.equal(isExecutiveTaskCompleted(task({ actualEnd: yesterday })), true, 'Actual end marks completion');

console.log('Dashboard overdue: 5/5 cases passed.');
