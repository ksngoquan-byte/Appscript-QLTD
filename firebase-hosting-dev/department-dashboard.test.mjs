import assert from 'node:assert/strict';
import { buildDepartmentDashboardModel, getDepartmentTaskCategory, getDeptCode } from './department-dashboard.js';

const today = new Date(2026, 5, 18);
const payloads = [
  {
    success: true,
    projectCode: 'HL',
    projectName: 'Hung Loc',
    mainMilestoneIds: ['a', 'g'],
    data: [
      { id: 'a', text: 'A', owner: 'Phong Phat trien du an', status: 'Dang thuc hien', start_date: '2026-06-01', end_date: '2026-06-17', wbs: 'V.1', raw: { 'Hang muc': 'Phap ly' } },
      { id: 'b', text: 'B', owner: 'PTDA', status: 'Chua bat dau', start_date: '2026-06-18', end_date: '2026-06-25', wbs: 'VIII.1', raw: { COL_6: '' } },
      { id: 'e', text: 'E', owner: 'PTDA', status: 'Chua bat dau', start_date: '2026-06-01', end_date: '2026-06-16' },
      { id: 'f', text: 'F', owner: 'PTDA', status: 'Dang thuc hien', start_date: '2026-06-01', end_date: '2026-06-15' },
      { id: 'g', text: 'G', owner: 'PTDA', status: 'Hoan thanh', start_date: '2026-06-01', end_date: '2026-06-28', actualFinish: '2026-06-12' },
      { id: 'c', text: 'C', owner: 'GPMB', status: 'Hoan thanh', start_date: '2026-06-01', end_date: '2026-06-10', actualFinish: '2026-06-10' },
      { id: 'cat', text: 'Hang muc', owner: 'PTDA', type: 'project' }
    ]
  },
  {
    success: true,
    projectCode: 'NC',
    projectName: 'Nam Cam',
    data: [
      { id: 'd', text: 'D', owner: 'PTDA', status: 'Hoan thanh', start_date: '2026-05-01', end_date: '2026-06-15', actualEnd: '2026-06-16' }
    ]
  }
];

assert.equal(getDeptCode('Phong Phat trien du an'), 'PTDA');
assert.equal(getDeptCode('Phong Quan ly du an'), 'QLDA');
assert.equal(getDeptCode('Thiet ke'), 'TK');
assert.equal(getDepartmentTaskCategory(payloads[0].data[0]), 'Phap ly');
assert.equal(getDepartmentTaskCategory(payloads[0].data[1]), '');

const one = buildDepartmentDashboardModel(payloads, { deptCode: 'PTDA', projectCode: 'HL' }, today);
assert.equal(one.kpis.total, 5);
assert.equal(one.kpis.overdue, 3);
assert.equal(one.kpis.upcoming, 1);
assert.equal(one.overdue.some((task) => task.id === 'e'), true);
assert.equal(one.overdue.some((task) => task.id === 'f'), true);
assert.equal(one.tasks.find((task) => task.id === 'a')?.contextLabel, 'Phap ly');
assert.equal(one.tasks.find((task) => task.id === 'b')?.contextLabel, '');
assert.equal(one.tasks.find((task) => task.id === 'b')?.contextLabel === 'VIII.1', false);
assert.equal(one.milestones.find((task) => task.id === 'g')?.isCompleted, true);

const all = buildDepartmentDashboardModel(payloads, { deptCode: 'PTDA' }, today);
assert.equal(all.kpis.total, 6);
assert.equal(all.completedThisMonth.length, 2);
assert.equal(all.projectSummary.length, 2);
assert.equal(all.kpis.milestones, 2);
assert.equal(all.tasks.some((task) => task.id === 'cat'), false);
assert.equal(all.upcoming.some((task) => task.id === 'a'), false);
assert.equal(Object.prototype.hasOwnProperty.call(all.kpis, 'missingDates'), false);
assert.equal(all.departmentEfficiency[0].deptCode, 'PTDA');
assert.equal(all.departmentEfficiency[0].total, 6);
assert.equal(all.departmentEfficiency[0].completed, 2);
assert.equal(all.departmentEfficiency[0].overdue, 3);
assert.equal(all.departmentEfficiency[0].completionPercent, 33);
assert.equal(all.departmentEfficiency.some((row) => row.deptCode === 'GPMB' && row.total === 1 && row.completionPercent === 100), true);

const invalidDept = buildDepartmentDashboardModel(payloads, { deptCode: 'TK', projectCode: 'HL' }, today);
assert.equal(invalidDept.kpis.total, 0);

console.log('Department dashboard hotfix: overdue/deadline/category/missing-date cases passed.');
