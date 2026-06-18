export function getMainMilestoneTaskKey(task) {
  if (!task) return '';
  return String(task.id || task.code || '').trim();
}

export function normalizeMainMilestoneTaskKeys(values, tasks = []) {
  const aliases = new Map();
  (tasks || []).forEach((task) => {
    const key = getMainMilestoneTaskKey(task);
    if (!key) return;
    [task.id, task.code].forEach((value) => {
      const alias = String(value || '').trim();
      if (alias) aliases.set(alias, key);
    });
  });

  return new Set((values || []).map((value) => {
    const raw = String(value || '').trim();
    return aliases.get(raw) || raw;
  }).filter(Boolean));
}

export function isMainMilestoneKeySelected(selectedKeys, task) {
  const key = getMainMilestoneTaskKey(task);
  return !!(key && selectedKeys && selectedKeys.has(key));
}

export function toggleMainMilestoneTaskKey(selectedKeys, task) {
  const key = getMainMilestoneTaskKey(task);
  if (!key) return '';
  if (selectedKeys.has(key)) selectedKeys.delete(key);
  else selectedKeys.add(key);
  return key;
}
