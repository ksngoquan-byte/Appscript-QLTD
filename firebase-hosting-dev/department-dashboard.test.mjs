import assert from 'node:assert/strict';
import { buildDepartmentDashboardModel, getDepartmentPerformancePresentation, getDepartmentTaskCategory, getDeptCode } from './department-dashboard.js';

const today = new Date(2026, 5, 18);
const payloads = [
  {
    success: true,
    projectCode: 'HL',
    projectName: 'Hung Loc',
    mainMilestoneIds: ['a', 'g'],
    data: [
      { id: 'a', code: 'CV-A', masterTaskCode: 'CV-A', text: 'A', owner: 'Phong Phat trien du an', status: 'Dang thuc hien', start_date: '2026-06-01', end_date: '2026-06-17', wbs: 'V.1', raw: { 'Hang muc': 'Phap ly' } },
      { id: 'b', text: 'B', owner: 'PTDA', status: 'Chua bat dau', start_date: '2026-06-18', end_date: '2026-06-25', wbs: 'VIII.1', raw: { COL_6: '' } },
      { id: 'e', text: 'E', owner: 'PTDA', status: 'Chua bat dau', start_date: '2026-06-01', end_date: '2026-06-16' },
      { id: 'f', text: 'F', owner: 'PTDA', status: 'Dang thuc hien', start_date: '2026-06-01', end_date: '2026-06-15' },
      { id: 'g', code: 'CV-G', masterTaskCode: 'CV-G', text: 'G', owner: 'PTDA', status: 'Hoan thanh', start_date: '2026-06-01', end_date: '2026-06-28', actualFinish: '2026-06-12' },
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

const individualPayloads = [
  {
    success: true,
    projectCode: 'HL',
    projectName: 'Hung Loc',
    departments: [{
      deptCode: 'PTDA',
      masters: [{
        masterCode: 'CV-A',
        taskName: 'Phap ly',
        details: [
          { detailTaskId: 'hl-1', taskName: 'Viec Alice 1', owner: 'Alice Nguyen <alice@example.com>', status: 'Hoan thanh', progress: 100, planStart: '2026-06-01', planFinish: '2026-06-10', actualFinish: '2026-06-10' },
          { detailTaskId: 'hl-2', taskName: 'Viec Alice 2', owner: 'Alice Nguyen <ALICE@example.com>', status: 'Dang thuc hien', progress: 50, planStart: '2026-06-01', planFinish: '2026-06-17' },
          { detailTaskId: 'hl-3', taskName: 'Owner cu', owner: 'Cuu Nhan Su <former@example.com>', status: 'Chua bat dau', progress: 0, planStart: '2026-06-01', planFinish: '2026-06-25' },
          { detailTaskId: 'hl-4', taskName: 'Chua giao', owner: '', status: '', progress: 0, planStart: '2026-06-01', planFinish: '2026-06-16' }
        ]
      }]
    }, {
      deptCode: 'GPMB',
      masters: [{
        masterCode: 'CV-C',
        taskName: 'Giai phong mat bang',
        details: [
          { detailTaskId: 'hl-5', taskName: 'Viec GPMB', owner: 'GPMB User <gpmb@example.com>', status: 'Hoan thanh', progress: 100, planStart: '2026-06-01', planFinish: '2026-06-10', actualFinish: '2026-06-10' }
        ]
      }]
    }]
  },
  {
    success: true,
    projectCode: 'NC',
    projectName: 'Nam Cam',
    departments: [{
      deptCode: 'PTDA',
      masters: [{
        masterCode: 'CV-D',
        taskName: 'Ha tang',
        details: [
          { detailTaskId: 'nc-1', taskName: 'Viec Alice 3', owner: 'Alice Nguyen <alice@example.com>', status: 'Hoan thanh', progress: 100, planStart: '2026-05-01', planFinish: '2026-06-15', actualFinish: '2026-06-16' }
        ]
      }]
    }]
  }
];

// A. Tất cả phòng/ban + tất cả dự án: group by DeptCode.
const allDepartmentsAllProjects = buildDepartmentDashboardModel(payloads, {}, today, { detailPayloads: individualPayloads });
assert.equal(allDepartmentsAllProjects.kpis.total, 6);
assert.equal(allDepartmentsAllProjects.departmentEfficiency.find((row) => row.deptCode === 'PTDA')?.total, 5);
assert.equal(allDepartmentsAllProjects.departmentEfficiency.find((row) => row.deptCode === 'GPMB')?.total, 1);

// B. Tất cả phòng/ban + một dự án: vẫn group by DeptCode và chỉ lấy HL.
const allDepartmentsOneProject = buildDepartmentDashboardModel(payloads, { projectCode: 'HL' }, today, { detailPayloads: individualPayloads });
assert.equal(allDepartmentsOneProject.kpis.total, 5);
assert.equal(allDepartmentsOneProject.departmentEfficiency.find((row) => row.deptCode === 'PTDA')?.total, 4);
assert.equal(allDepartmentsOneProject.departmentEfficiency.find((row) => row.deptCode === 'GPMB')?.total, 1);

// C. Một phòng/ban + tất cả dự án: group chủ trì ổn định theo email.
const oneDepartmentAllProjects = buildDepartmentDashboardModel(payloads, { deptCode: 'PTDA' }, today, { detailPayloads: individualPayloads });
assert.equal(oneDepartmentAllProjects.kpis.total, 5);
assert.equal(oneDepartmentAllProjects.individualEfficiency.reduce((sum, row) => sum + row.total, 0), oneDepartmentAllProjects.kpis.total);
assert.equal(oneDepartmentAllProjects.individualEfficiency.find((row) => row.ownerEmail === 'alice@example.com')?.total, 3);
assert.equal(oneDepartmentAllProjects.individualEfficiency.find((row) => row.ownerEmail === 'former@example.com')?.ownerLabel, 'Cuu Nhan Su <former@example.com>');
assert.equal(oneDepartmentAllProjects.individualEfficiency.find((row) => row.ownerKey === 'UNASSIGNED')?.ownerLabel, 'CHƯA PHÂN CÔNG');
assert.equal(oneDepartmentAllProjects.kpis.total, allDepartmentsAllProjects.departmentEfficiency.find((row) => row.deptCode === 'PTDA')?.total);

// D. Một phòng/ban + một dự án: chỉ lấy PB_DETAIL của HL.
const oneDepartmentOneProject = buildDepartmentDashboardModel(payloads, { deptCode: 'PTDA', projectCode: 'HL' }, today, { detailPayloads: individualPayloads });
assert.equal(oneDepartmentOneProject.kpis.total, 4);
assert.equal(oneDepartmentOneProject.individualEfficiency.reduce((sum, row) => sum + row.total, 0), 4);
assert.equal(oneDepartmentOneProject.individualEfficiency.find((row) => row.ownerEmail === 'alice@example.com')?.total, 2);
assert.equal(oneDepartmentOneProject.kpis.completed, 1);
assert.equal(oneDepartmentOneProject.kpis.inProgress, 1);
assert.equal(oneDepartmentOneProject.kpis.notStarted, 2);
assert.equal(oneDepartmentOneProject.individualEfficiency.find((row) => row.ownerEmail === 'alice@example.com')?.completionPercent, 50);
assert.equal(oneDepartmentOneProject.kpis.total, allDepartmentsOneProject.departmentEfficiency.find((row) => row.deptCode === 'PTDA')?.total);

// Phòng/ban hoặc dự án không có công việc phải giữ filter và trả tập rỗng an toàn.
const emptyDepartment = buildDepartmentDashboardModel(payloads, { deptCode: 'TK' }, today, { detailPayloads: individualPayloads });
assert.equal(emptyDepartment.kpis.total, 0);
assert.equal(emptyDepartment.departments.some((dept) => dept.code === 'TK'), true);
const emptyProject = buildDepartmentDashboardModel(payloads, { deptCode: 'PTDA', projectCode: 'EMPTY' }, today, { detailPayloads: individualPayloads });
assert.equal(emptyProject.kpis.total, 0);
assert.equal(emptyProject.individualEfficiency.length, 0);

assert.deepEqual(getDepartmentPerformancePresentation(''), {
  individual: false, title: 'Hiệu quả phòng/ban', firstColumnLabel: 'PHÒNG/BAN', emptyMessage: 'Không có phòng/ban phù hợp.'
});
assert.deepEqual(getDepartmentPerformancePresentation('PTDA'), {
  individual: true, title: 'Hiệu quả cá nhân', firstColumnLabel: 'CÁ NHÂN', emptyMessage: 'Không có cá nhân phù hợp.'
});
assert.equal(oneDepartmentOneProject.tasks.find((task) => task.id === 'hl-1')?.contextLabel, 'Phap ly');
assert.equal(allDepartmentsAllProjects.tasks.some((task) => task.id === 'cat'), false);
assert.equal(Object.prototype.hasOwnProperty.call(oneDepartmentOneProject.kpis, 'missingDates'), false);

console.log('Department dashboard context filters and individual owner aggregation passed.');
