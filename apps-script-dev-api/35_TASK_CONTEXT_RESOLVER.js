const QLTD_TASK_ROW_TYPE = {
  ZONE_GROUP: 'ZONE_GROUP',
  STRUCTURAL_GROUP: 'STRUCTURAL_GROUP',
  SCHEDULED_GROUP: 'SCHEDULED_GROUP',
  TASK: 'TASK',
  MILESTONE: 'MILESTONE'
};

/**
 * Normalizes hierarchy and business context without reading or writing Sheets.
 * Input rows are the backward-compatible Gantt DTOs built from Cong_viec.
 */
function qltdTaskContextResolveDataset_(tasks, options, warnings) {
  const rows = Array.isArray(tasks) ? tasks : [];
  const opts = options || {};
  const outputWarnings = warnings || [];
  const projectCode = String(opts.projectCode || '').trim();
  const scopeKeys = qltdTaskContextBuildScopeKeys_(rows);
  const hasChildren = qltdTaskContextDetectChildren_(rows, scopeKeys);
  const stack = [];
  let activeZone = '';
  let activeZoneId = '';
  let activeLoailCongTrinh = '';
  let activeCongTrinh = '';
  let activeHangMuc = '';

  rows.forEach(function(task, index) {
    const raw = task.raw || {};
    const name = String(task.text || task.name || '').trim();
    const wbs = String(task.wbs || '').trim();
    const directZone = qltdTaskContextRawValue_(raw, ['Zone']);
    const directLoai = qltdTaskContextRawValue_(raw, ['Loai cong trinh', 'Loại công trình']);
    const directCongTrinh = qltdTaskContextRawValue_(raw, ['Cong trinh', 'Công trình']);
    const directHangMuc = qltdTaskContextRawValue_(raw, ['Hang muc/Tang', 'Hạng mục/Tầng', 'Hang muc', 'Hạng mục']);
    const isZone = qltdTaskContextIsZoneRow_(task, directZone);
    const hasSchedule = !!task.start_date && !!task.end_date;
    const isMilestone = task.type === 'milestone';
    const hasChildRows = !!hasChildren[index];
    let rowType;

    if (isZone) rowType = QLTD_TASK_ROW_TYPE.ZONE_GROUP;
    else if (isMilestone) rowType = QLTD_TASK_ROW_TYPE.MILESTONE;
    else if (hasChildRows && hasSchedule) rowType = QLTD_TASK_ROW_TYPE.SCHEDULED_GROUP;
    else if (hasChildRows || (!!wbs && !hasSchedule)) rowType = QLTD_TASK_ROW_TYPE.STRUCTURAL_GROUP;
    else rowType = QLTD_TASK_ROW_TYPE.TASK;

    if (isZone) {
      activeZone = directZone || name;
      activeZoneId = String(task.id);
      activeLoailCongTrinh = directLoai || '';
      activeCongTrinh = directCongTrinh || '';
      activeHangMuc = directHangMuc || '';
      stack.length = 0;
      task.parent = '0';
    } else {
      if (directZone && directZone !== activeZone) {
        activeZone = directZone;
        activeZoneId = '';
        activeLoailCongTrinh = '';
        activeCongTrinh = '';
        activeHangMuc = '';
        stack.length = 0;
      }
      if (directLoai) activeLoailCongTrinh = directLoai;
      if (directCongTrinh) activeCongTrinh = directCongTrinh;

      const wbsLevel = qltdTaskContextWbsLevel_(task);
      if (wbs && wbsLevel === 1 && qltdTaskContextIsRomanWbs_(wbs)) {
        activeHangMuc = directHangMuc || name;
      } else if (directHangMuc) {
        activeHangMuc = directHangMuc;
      }

      while (stack.length && stack[stack.length - 1].level >= wbsLevel) stack.pop();
      const parentEntry = stack.length ? stack[stack.length - 1] : null;
      task.parent = parentEntry ? parentEntry.id : (activeZoneId || '0');
      if (wbs && wbsLevel < 999) {
        stack.push({
          id: String(task.id),
          wbs: wbs,
          name: name,
          level: wbsLevel,
          rowType: rowType
        });
      }
    }

    const ancestors = stack.filter(function(entry) {
      return String(entry.id) !== String(task.id);
    });
    const wbsPath = ancestors.map(function(entry) {
      return entry.wbs;
    }).filter(Boolean);
    if (wbs) wbsPath.push(wbs);

    const contextParts = [];
    qltdTaskContextPushUnique_(contextParts, activeZone);
    qltdTaskContextPushUnique_(contextParts, activeHangMuc);
    ancestors.forEach(function(entry) {
      if (entry.level > 1) qltdTaskContextPushUnique_(contextParts, entry.name);
    });
    if (!isZone) qltdTaskContextPushUnique_(contextParts, name);

    const mappingWarnings = [];
    if (
      rowType === QLTD_TASK_ROW_TYPE.TASK ||
      rowType === QLTD_TASK_ROW_TYPE.MILESTONE ||
      rowType === QLTD_TASK_ROW_TYPE.SCHEDULED_GROUP
    ) {
      if (!activeZone) mappingWarnings.push('ZONE_NOT_RESOLVED');
      if (!activeHangMuc) mappingWarnings.push('HANG_MUC_NOT_RESOLVED');
      if (!activeCongTrinh) mappingWarnings.push('CONG_TRINH_NOT_RESOLVED');
    }

    task.projectCode = projectCode;
    task.taskId = String(task.id);
    task.masterTaskCode = String(task.code || '').trim();
    task.refId = String(task.id);
    task.sourceRow = task.rawRowNumber || '';
    task.name = name;
    task.taskName = String(task.congViecTaskName || '').trim();
    task.parentId = String(task.parent || '0');
    task.parentWbs = ancestors.length ? ancestors[ancestors.length - 1].wbs : '';
    task.rowType = rowType;
    task.ownZone = String(task.congViecZone || '').trim();
    task.ownHangMuc = String(task.congViecHangMuc || '').trim();
    task.contextZone = activeZone;
    task.contextHangMuc = activeHangMuc;
    task.zone = activeZone;
    task.loaiCongTrinh = activeLoailCongTrinh;
    task.congTrinh = activeCongTrinh;
    task.hangMuc = activeHangMuc;
    task.wbsPath = wbsPath.join(' > ');
    task.contextPath = contextParts.join(' > ');
    task.plannedStart = task.baselineStart || '';
    task.plannedEnd = task.baselineEnd || '';
    task.displayStart = task.start_date || '';
    task.displayEnd = task.end_date || '';
    task.sourceStart = task.start_date || '';
    task.sourceEnd = task.end_date || '';
    task.rollupStart = '';
    task.rollupEnd = '';
    task.predecessors = task.predecessorRaw || '';
    task.hasValidSchedule = hasSchedule;
    task.isStructural = rowType === QLTD_TASK_ROW_TYPE.ZONE_GROUP || rowType === QLTD_TASK_ROW_TYPE.STRUCTURAL_GROUP;
    task.isScheduledGroup = rowType === QLTD_TASK_ROW_TYPE.SCHEDULED_GROUP;
    task.mappingWarnings = mappingWarnings;
    task.isSummary = task.isStructural || task.isScheduledGroup;
    task.type = rowType === QLTD_TASK_ROW_TYPE.MILESTONE
      ? 'milestone'
      : (task.isSummary ? 'project' : 'task');
  });

  qltdTaskContextApplyRollups_(rows, outputWarnings);
  return rows;
}

function qltdTaskContextBuildScopeKeys_(tasks) {
  let scope = 0;
  let directZone = '';
  return (tasks || []).map(function(task) {
    const rowZone = qltdTaskContextRawValue_(task.raw || {}, ['Zone']);
    if (qltdTaskContextIsZoneRow_(task, rowZone)) {
      scope += 1;
      directZone = rowZone || String(task.text || '').trim();
    } else if (rowZone && rowZone !== directZone) {
      scope += 1;
      directZone = rowZone;
    }
    return String(scope) + '|' + directZone;
  });
}

function qltdTaskContextDetectChildren_(tasks, scopeKeys) {
  const result = {};
  for (let index = 0; index < tasks.length; index += 1) {
    const current = tasks[index];
    const wbs = String(current.wbs || '').trim();
    const level = qltdTaskContextWbsLevel_(current);
    if (!wbs || level >= 999) continue;
    for (let childIndex = index + 1; childIndex < tasks.length; childIndex += 1) {
      if (scopeKeys[childIndex] !== scopeKeys[index]) break;
      const childWbs = String(tasks[childIndex].wbs || '').trim();
      const childLevel = qltdTaskContextWbsLevel_(tasks[childIndex]);
      if (!childWbs || childLevel >= 999) continue;
      if (childLevel <= level) break;
      result[index] = true;
      break;
    }
  }
  return result;
}

function qltdTaskContextApplyRollups_(tasks, warnings) {
  const byId = {};
  const children = {};
  (tasks || []).forEach(function(task) {
    const id = String(task.id);
    const parent = String(task.parent || '0');
    byId[id] = task;
    if (parent !== '0') {
      if (!children[parent]) children[parent] = [];
      children[parent].push(task);
    }
  });

  function visit(task, guard) {
    const id = String(task.id);
    if (guard[id]) return { start: '', end: '' };
    const nextGuard = Object.assign({}, guard);
    nextGuard[id] = true;
    const descendantRanges = [];

    (children[id] || []).forEach(function(child) {
      const childRange = visit(child, nextGuard);
      if (childRange.start && childRange.end) descendantRanges.push(childRange);
    });

    const rollupStart = qltdTaskContextMinDate_(descendantRanges.map(function(range) { return range.start; }));
    const rollupEnd = qltdTaskContextMaxDate_(descendantRanges.map(function(range) { return range.end; }));
    task.rollupStart = rollupStart;
    task.rollupEnd = rollupEnd;

    if (task.isStructural) {
      task.displayStart = rollupStart;
      task.displayEnd = rollupEnd;
      task.start_date = rollupStart;
      task.end_date = rollupEnd;
      task.deadline = rollupEnd;
      task.duration = rollupStart && rollupEnd ? qltdGanttDurationDays_(rollupStart, rollupEnd) : 0;
      task.hasValidSchedule = !!rollupStart && !!rollupEnd;
      task.$no_bar = !task.hasValidSchedule;
      task.unscheduled = !task.hasValidSchedule;
    } else if (task.isScheduledGroup) {
      if (
        rollupStart && rollupEnd &&
        (rollupStart !== task.sourceStart || rollupEnd !== task.sourceEnd)
      ) {
        task.mappingWarnings.push('GROUP_SCHEDULE_DIFFERS_FROM_CHILDREN');
        warnings.push({
          type: 'GROUP_SCHEDULE_DIFFERS_FROM_CHILDREN',
          taskId: String(task.id),
          wbs: task.wbs,
          sourceStart: task.sourceStart,
          sourceEnd: task.sourceEnd,
          rollupStart: rollupStart,
          rollupEnd: rollupEnd
        });
      }
    }

    if (task.isStructural || task.isScheduledGroup) {
      if (task.isScheduledGroup) {
        return {
          start: qltdTaskContextMinDate_([task.sourceStart, rollupStart]),
          end: qltdTaskContextMaxDate_([task.sourceEnd, rollupEnd])
        };
      }
      return {
        start: task.displayStart || task.sourceStart || rollupStart,
        end: task.displayEnd || task.sourceEnd || rollupEnd
      };
    }
    return {
      start: task.displayStart || '',
      end: task.displayEnd || ''
    };
  }

  (tasks || []).filter(function(task) {
    return String(task.parent || '0') === '0' || !byId[String(task.parent || '')];
  }).forEach(function(task) {
    visit(task, {});
  });
}

function qltdTaskContextFilterLinks_(links, tasks, warnings) {
  const byId = {};
  (tasks || []).forEach(function(task) {
    byId[String(task.id)] = task;
  });
  return (links || []).filter(function(link) {
    const source = byId[String(link.source)];
    const target = byId[String(link.target)];
    const blocked = [source, target].some(function(task) {
      return task && (
        task.rowType === QLTD_TASK_ROW_TYPE.ZONE_GROUP ||
        task.rowType === QLTD_TASK_ROW_TYPE.STRUCTURAL_GROUP
      );
    });
    if (!blocked) return true;
    warnings.push({
      type: source && source.rowType === QLTD_TASK_ROW_TYPE.STRUCTURAL_GROUP ||
        target && target.rowType === QLTD_TASK_ROW_TYPE.STRUCTURAL_GROUP
        ? 'STRUCTURAL_GROUP_LINK_SKIPPED'
        : 'ZONE_GROUP_LINK_SKIPPED',
      source: String(link.source),
      target: String(link.target),
      raw: link.raw || ''
    });
    return false;
  });
}

function qltdTaskContextBuildPublicDataset_(tasks) {
  const internalOnly = [
    'projectCode',
    'taskId',
    'refId',
    'sourceRow',
    'name',
    'parentId',
    'parentWbs',
    'plannedStart',
    'plannedEnd',
    'displayStart',
    'displayEnd',
    'predecessors',
    'hasValidSchedule',
    'isStructural',
    'isScheduledGroup',
    'isSummary'
  ];
  return (tasks || []).map(function(task) {
    const publicTask = Object.assign({}, task);
    internalOnly.forEach(function(key) {
      delete publicTask[key];
    });
    return publicTask;
  });
}

function qltdTaskContextRawValue_(raw, aliases) {
  const normalizedAliases = (aliases || []).map(qltdTaskContextNormalize_);
  const keys = Object.keys(raw || {});
  for (let index = 0; index < keys.length; index += 1) {
    if (normalizedAliases.indexOf(qltdTaskContextNormalize_(keys[index])) >= 0) {
      return String(raw[keys[index]] || '').trim();
    }
  }
  return '';
}

function qltdTaskContextIsZoneRow_(task, directZone) {
  const name = String(task && (task.text || task.name) || '').trim();
  const wbs = String(task && task.wbs || '').trim();
  return !wbs && (/^zone\s*\d+\b/i.test(name) || /^zone\s*\d+\b/i.test(String(directZone || '').trim()));
}

function qltdTaskContextWbsLevel_(task) {
  const explicit = Number(task && task.wbsLevel);
  if (isFinite(explicit) && explicit > 0 && explicit < 999) return explicit;
  const wbs = String(task && task.wbs || '').trim();
  if (!wbs) return 999;
  return wbs.split('.').length;
}

function qltdTaskContextIsRomanWbs_(wbs) {
  return /^[IVXLCDM]+$/i.test(String(wbs || '').trim());
}

function qltdTaskContextPushUnique_(parts, value) {
  const text = String(value || '').trim();
  if (text && parts[parts.length - 1] !== text) parts.push(text);
}

function qltdTaskContextMinDate_(values) {
  const filtered = (values || []).filter(Boolean).sort();
  return filtered.length ? filtered[0] : '';
}

function qltdTaskContextMaxDate_(values) {
  const filtered = (values || []).filter(Boolean).sort();
  return filtered.length ? filtered[filtered.length - 1] : '';
}

function qltdTaskContextNormalize_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
