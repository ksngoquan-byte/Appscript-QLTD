import { getExecutiveTaskDueDate, isExecutiveCategoryRow, isExecutiveTaskCompleted, isExecutiveTaskOverdue } from './dashboard-overdue.js';
import {
  getMainMilestoneStableKey,
  migrateMainMilestoneKeys
} from './main-milestone-logic.js';

function text(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

function date(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeDeptName(owner) {
  return text(owner).replace(/\b(phong|ban|bo phan|department|dept)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function getDeptCode(owner) {
  const value = normalizeDeptName(owner);
  const compact = value.replace(/\s/g, '');
  if (!compact) return 'UNASSIGNED';
  if (compact === 'ptda' || value.includes('phat trien du an')) return 'PTDA';
  if (compact === 'gpmb' || value.includes('giai phong mat bang')) return 'GPMB';
  if (compact === 'qlda' || value.includes('quan ly du an')) return 'QLDA';
  if (compact === 'tk' || value.includes('thiet ke')) return 'TK';
  if (compact === 'kd' || value.includes('kinh doanh')) return 'KD';
  const words = value.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((word) => word[0]).join('') : compact).toUpperCase();
}

export function getDeptDisplayName(code, owners = []) {
  const preferred = { PTDA: 'Phát triển dự án', GPMB: 'Giải phóng mặt bằng', QLDA: 'Quản lý dự án', TK: 'Thiết kế', KD: 'Kinh doanh', UNASSIGNED: 'Chưa phân công' };
  if (preferred[code]) return preferred[code];
  return owners.find((owner) => getDeptCode(owner) === code) || code;
}

function statusKey(status) {
  const value = text(status).replace(/[^a-z0-9]/g, '');
  if (value.includes('hoanthanh') || value.includes('complete') || value.includes('done')) return 'completed';
  if (value.includes('dang') || value.includes('progress')) return 'in-progress';
  if (value.includes('chuabatdau') || value.includes('notstarted')) return 'not-started';
  return 'other';
}

function isCategory(task) {
  const raw = task.raw || {};
  if ([task.isCategoryRow, task.is_category, task.isGroup, raw.isCategoryRow, raw.is_category, raw.isGroup]
    .some((value) => value === true || value === 1 || String(value).toLowerCase() === 'true')) return true;
  return ['category', 'group', 'heading', 'summary', 'project', 'hangmuc', 'hang muc']
    .includes(text(task.type || task.rowType || task.kind || raw.type || raw.rowType).replace(/[^a-z0-9 ]/g, ''));
}

export function getDepartmentTaskCategory(task) {
  const raw = task && task.raw || {};
  const values = [
    task && task.hangMuc,
    task && task.categoryName,
    task && task.workCategory,
    raw['Hạng mục'],
    raw['Hang muc'],
    raw['HANG_MUC'],
    raw.hang_muc,
    raw.hangMuc,
    raw.COL_6
  ];
  const value = values.find((item) => String(item || '').trim());
  return value ? String(value).trim() : '';
}

function enrichTask(task, payload, today, milestoneKeys) {
  const startDate = date(task.start_date || task.planned_start || task.baselineStart || task.planStart);
  const endDate = getExecutiveTaskDueDate(task);
  const actualStartDate = date(task.actualStart);
  const actualFinishDate = date(task.actualFinish || task.actualEnd);
  const normalizedStatus = statusKey(task.status);
  const duration = Number(task.duration || task.durationDays || task.planDays || task.plannedDays || 0);
  const item = { ...task, startDate, endDate, actualStartDate, actualFinishDate, normalizedStatus };
  item.hasActionStatus = normalizedStatus !== 'other';
  item.durationDays = duration;
  const category = isCategory(task) || isExecutiveCategoryRow(task, item, task.raw || {});
  item.isCategoryRow = category;
  item.isCompleted = isExecutiveTaskCompleted(item);
  item.isRealTask = !category && !!String(task.text || '').trim() && !!(startDate || endDate || actualStartDate || actualFinishDate || item.hasActionStatus);
  item.projectCode = payload.projectCode || '';
  item.projectName = payload.projectName || payload.projectCode || '';
  item.deptCode = getDeptCode(task.owner);
  item.contextLabel = getDepartmentTaskCategory(task);
  item.isMainMilestone = milestoneKeys.has(
    getMainMilestoneStableKey(task, payload.projectCode)
  );
  item.isOverdue = isExecutiveTaskOverdue(item, today);
  item.lateDays = item.isOverdue ? Math.round((today - endDate) / 86400000) : 0;
  return item;
}

export function buildDepartmentDashboardModel(payloads, filters = {}, todayValue = new Date()) {
  const today = date(todayValue);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const upcomingEnd = new Date(today); upcomingEnd.setDate(upcomingEnd.getDate() + 14);
  const all = [];
  (payloads || []).forEach((payload) => {
    const milestoneKeys = migrateMainMilestoneKeys([
      ...(payload.mainMilestoneIds || []), ...(payload.mainMilestoneCodes || [])
    ], payload.data || [], payload.projectCode).keys;
    (payload.data || []).forEach((task) => all.push(enrichTask(task, payload, today, milestoneKeys)));
  });
  const real = all.filter((task) => task.isRealTask);
  const owners = [...new Set(real.map((task) => String(task.owner || '').trim()).filter(Boolean))];
  const departments = [...new Set(real.map((task) => task.deptCode))].sort().map((code) => ({ code, name: getDeptDisplayName(code, owners) }));
  const projectScoped = real.filter((task) => !filters.projectCode || task.projectCode === filters.projectCode);
  const filtered = real.filter((task) => (!filters.deptCode || task.deptCode === filters.deptCode) && (!filters.projectCode || task.projectCode === filters.projectCode));
  const completed = filtered.filter((task) => task.isCompleted);
  const open = filtered.filter((task) => !task.isCompleted);
  const overdueAll = open.filter((task) => task.isOverdue).sort((a, b) => b.lateDays - a.lateDays);
  const upcomingAll = open.filter((task) => task.endDate && task.endDate >= today && task.endDate <= upcomingEnd)
    .map((task) => ({ ...task, remainingDays: Math.round((task.endDate - today) / 86400000) })).sort((a, b) => a.endDate - b.endDate);
  const completedThisMonth = completed.filter((task) => task.actualFinishDate && task.actualFinishDate >= monthStart && task.actualFinishDate < nextMonth)
    .sort((a, b) => b.actualFinishDate - a.actualFinishDate).slice(0, 10);
  const milestones = filtered.filter((task) => task.isMainMilestone).map((task) => ({
    ...task,
    remainingDays: task.endDate && task.endDate >= today ? Math.round((task.endDate - today) / 86400000) : null,
    lateDays: !task.isCompleted && task.endDate && task.endDate < today ? Math.round((today - task.endDate) / 86400000) : task.lateDays
  })).sort((a, b) => (a.endDate || new Date(8640000000000000)) - (b.endDate || new Date(8640000000000000))).slice(0, 10);
  const projectSummary = (payloads || []).map((payload) => {
    const rows = filtered.filter((task) => task.projectCode === payload.projectCode);
    const done = rows.filter((task) => task.isCompleted).length;
    return { projectCode: payload.projectCode, projectName: payload.projectName || payload.projectCode, total: rows.length, completed: done,
      inProgress: rows.filter((task) => !task.isCompleted && task.normalizedStatus === 'in-progress').length,
      notStarted: rows.filter((task) => !task.isCompleted && task.normalizedStatus === 'not-started').length,
      overdue: rows.filter((task) => task.isOverdue).length,
      upcoming: rows.filter((task) => !task.isCompleted && task.endDate && task.endDate >= today && task.endDate <= upcomingEnd).length,
      completionPercent: rows.length ? Math.round(done * 100 / rows.length) : 0 };
  }).filter((row) => row.total > 0);
  const departmentEfficiency = departments.map((dept) => {
    const rows = projectScoped.filter((task) => task.deptCode === dept.code);
    const done = rows.filter((task) => task.isCompleted).length;
    return {
      deptCode: dept.code,
      deptName: dept.name,
      total: rows.length,
      completed: done,
      inProgress: rows.filter((task) => !task.isCompleted && task.normalizedStatus === 'in-progress').length,
      notStarted: rows.filter((task) => !task.isCompleted && task.normalizedStatus === 'not-started').length,
      overdue: rows.filter((task) => task.isOverdue).length,
      completionPercent: rows.length ? Math.round(done * 100 / rows.length) : 0
    };
  }).filter((row) => row.total > 0).sort((a, b) => b.overdue - a.overdue || b.total - a.total || a.deptCode.localeCompare(b.deptCode));
  return { departments, tasks: filtered, overdue: overdueAll.slice(0, 5), upcoming: upcomingAll.slice(0, 10), completedThisMonth, milestones, projectSummary, departmentEfficiency,
    kpis: { total: filtered.length, completed: completed.length, inProgress: filtered.filter((task) => !task.isCompleted && task.normalizedStatus === 'in-progress').length,
      notStarted: filtered.filter((task) => !task.isCompleted && task.normalizedStatus === 'not-started').length, overdue: overdueAll.length,
      upcoming: upcomingAll.length, milestones: milestones.length } };
}
