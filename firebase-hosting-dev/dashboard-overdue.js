function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(`${text.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function firstValidDate(...values) {
  for (const value of values) {
    const date = parseDate(value);
    if (date) return date;
  }
  return null;
}

export function isExecutiveTaskCompleted(task) {
  if (!task) return false;
  const status = normalizeText(task.normalizedStatus || task.status).replace(/[^a-z0-9]/g, '');
  const completedStatus = status === 'completed' || status.includes('hoanthanh') || status.includes('done') || status.includes('complete');
  const actualFinishDate = task.actualFinishDate || firstValidDate(task.actualFinish, task.actualEnd);
  return Number(task.progress || 0) >= 1 || completedStatus || !!actualFinishDate;
}

export function getExecutiveTaskDueDate(task) {
  if (!task) return null;
  const raw = task.raw || {};
  return firstValidDate(
    task.deadline,
    task.end_date,
    task.baselineEnd,
    task.planEnd,
    raw.deadline,
    raw.end_date,
    raw.baselineEnd,
    raw.planEnd,
    raw.KT,
    raw.M
  );
}

export function isExecutiveTaskOverdue(task, today = new Date()) {
  if (!task || task.isCategoryRow || !task.isRealTask || isExecutiveTaskCompleted(task)) return false;
  const dueDate = task.endDate || getExecutiveTaskDueDate(task);
  const comparisonDate = parseDate(today);
  return !!(dueDate && comparisonDate && dueDate < comparisonDate);
}

export function isExecutiveCategoryRow(task, normalizedTask, raw = task && task.raw || {}) {
  const explicitFlags = [
    task && task.isCategoryRow,
    task && task.is_category,
    task && task.isGroup,
    raw.isCategoryRow,
    raw.is_category,
    raw.isGroup
  ];
  if (explicitFlags.some((value) => value === true || value === 1 || String(value).toLowerCase() === 'true')) return true;

  const rowType = normalizeText(task && (task.type || task.rowType || task.kind) || raw.type || raw.rowType)
    .replace(/[^a-z0-9 ]/g, '');
  if (['category', 'group', 'heading', 'summary', 'project', 'hang muc', 'hangmuc'].includes(rowType)) return true;

  return !normalizedTask.startDate && !normalizedTask.endDate && !normalizedTask.actualStartDate &&
    !normalizedTask.actualFinishDate && !normalizedTask.durationDays && !normalizedTask.hasActionStatus;
}
