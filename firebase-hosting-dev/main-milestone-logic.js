function clean(value) {
  return String(value || '').trim();
}

export function getMainMilestoneStableKey(task, projectCode) {
  const project = clean(projectCode);
  const code = clean(task && (task.masterTaskCode || task.code));
  return project && code ? `${project}|${code}` : '';
}

function addToIndex(map, rawValue, task) {
  const value = clean(rawValue);
  if (!value) return;
  const matches = map.get(value) || [];
  if (!matches.includes(task)) matches.push(task);
  map.set(value, matches);
}

export function buildMainMilestoneTaskIndex(tasks = [], projectCode = '') {
  const byStableKey = new Map();
  const byId = new Map();
  const byMasterTaskCode = new Map();
  const byCode = new Map();

  (tasks || []).forEach((task) => {
    const stableKey = getMainMilestoneStableKey(task, projectCode);
    addToIndex(byStableKey, stableKey, task);
    addToIndex(byId, task && task.id, task);
    addToIndex(byMasterTaskCode, task && task.masterTaskCode, task);
    addToIndex(byCode, task && task.code, task);
  });

  return { byStableKey, byId, byMasterTaskCode, byCode };
}

function uniqueMatches(rawKey, index) {
  const matches = [];
  [
    index.byStableKey,
    index.byId,
    index.byMasterTaskCode,
    index.byCode
  ].forEach((map) => {
    (map.get(rawKey) || []).forEach((task) => {
      if (!matches.includes(task)) matches.push(task);
    });
  });
  return matches;
}

export function resolveLegacyMainMilestoneKey(rawValue, taskIndex, projectCode) {
  const rawKey = clean(rawValue);
  if (!rawKey) return { rawKey, status: 'EMPTY', key: '' };

  const matches = uniqueMatches(rawKey, taskIndex);
  if (matches.length > 1) {
    return {
      rawKey,
      status: 'AMBIGUOUS',
      key: '',
      warning: 'MAIN_MILESTONE_AMBIGUOUS_KEY'
    };
  }
  if (matches.length === 1) {
    const key = getMainMilestoneStableKey(matches[0], projectCode);
    if (key) return { rawKey, status: key === rawKey ? 'STABLE' : 'MIGRATED', key };
  }

  return {
    rawKey,
    status: 'ORPHAN',
    key: '',
    warning: 'MAIN_MILESTONE_ORPHAN_KEY'
  };
}

export function migrateMainMilestoneKeys(values, tasks = [], projectCode = '') {
  const taskIndex = buildMainMilestoneTaskIndex(tasks, projectCode);
  const keys = new Set();
  const orphanKeys = new Set();
  const warnings = [];
  let migratedCount = 0;
  let ambiguousCount = 0;

  (values || []).forEach((value) => {
    const result = resolveLegacyMainMilestoneKey(value, taskIndex, projectCode);
    if (result.key) {
      keys.add(result.key);
      if (result.status === 'MIGRATED') migratedCount += 1;
      return;
    }
    if (!result.rawKey) return;
    orphanKeys.add(result.rawKey);
    if (result.status === 'AMBIGUOUS') ambiguousCount += 1;
    warnings.push({ code: result.warning, rawKey: result.rawKey });
  });

  return {
    keys,
    orphanKeys,
    warnings,
    rawCount: new Set((values || []).map(clean).filter(Boolean)).size,
    validCount: keys.size,
    migratedCount,
    orphanCount: orphanKeys.size,
    ambiguousCount,
    taskIndex
  };
}

export function isMainMilestoneKeySelected(selectedKeys, task, projectCode) {
  const key = getMainMilestoneStableKey(task, projectCode);
  return !!(key && selectedKeys && selectedKeys.has(key));
}

export function toggleMainMilestoneTaskKey(selectedKeys, task, projectCode) {
  const key = getMainMilestoneStableKey(task, projectCode);
  if (!key) return '';
  if (selectedKeys.has(key)) selectedKeys.delete(key);
  else selectedKeys.add(key);
  return key;
}
