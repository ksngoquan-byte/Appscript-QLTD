const QLTD_PB_DETAIL_PROTECTION_SOURCE = 'pb_detail_protection_audit_v1';
const QLTD_PB_DETAIL_PROTECTION_DEFAULT_LIMIT = 20;
const QLTD_PB_DETAIL_PROTECTION_MAX_LIMIT = 50;
const QLTD_PB_DETAIL_PROTECTION_DETAIL_COLS = 18;
const QLTD_PB_DETAIL_PROTECTION_PROP_PREFIX = 'PB_DETAIL_PROTECTION_AUDIT_';
const QLTD_PB_DETAIL_PROTECTION_SNAPSHOT_PREFIX = 'PB_DETAIL_PROTECTION_SNAPSHOT_';

const QLTD_PB_DETAIL_PROTECTION_STATUS = {
  OK: 'OK',
  SCHEMA_NOT_READY: 'SCHEMA_NOT_READY',
  SHEET_NOT_FOUND: 'SHEET_NOT_FOUND',
  PROTECTED_SLOT: 'PROTECTED_SLOT',
  PROTECTED_INSERT: 'PROTECTED_INSERT',
  PROTECTED_WRITE: 'PROTECTED_WRITE',
  ACCESS_ERROR: 'ACCESS_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR'
};

function qltdPbDetailProtectionAuditAllProjects_(params) {
  const action = 'work_auditAllPbDetailProtections';
  const auth = qltdPbDetailProtectionRequireAdmin_(params, action);
  if (auth.error) return auth.error;

  const options = qltdPbDetailProtectionParseAuditParams_(params || {});
  const catalog = qltdPbDetailProtectionBuildTargetCatalog_(options);
  if (catalog.error) return catalog.error;

  const runId = qltdPbDetailProtectionRunId_();
  const spreadsheetCache = {};
  const start = options.cursor;
  const end = Math.min(start + options.limit, catalog.targets.length);
  const auditedTargets = [];
  const emittedTargets = [];
  const warnings = (catalog.warnings || []).slice();

  for (let index = start; index < end; index += 1) {
    const target = catalog.targets[index];
    let item;
    try {
      item = target.synthetic
        ? qltdPbDetailProtectionSyntheticAuditItem_(target)
        : qltdPbDetailProtectionAuditTarget_(target.project, target.dept, spreadsheetCache, auth);
    } catch (error) {
      item = qltdPbDetailProtectionTargetErrorItem_(target.project, target.dept, QLTD_PB_DETAIL_PROTECTION_STATUS.ACCESS_ERROR, qltdBudgetSafeErrorMessage_(error));
    }
    item.auditRunId = runId;
    item.batchIndex = index;
    auditedTargets.push(item);
    qltdPbDetailProtectionStoreAuditTarget_(runId, item);
    if (options.includeHealthy || item.status !== QLTD_PB_DETAIL_PROTECTION_STATUS.OK) {
      emittedTargets.push(item);
    }
  }

  const summary = qltdPbDetailProtectionBuildSummary_(catalog.targets.length, auditedTargets, catalog.totalActiveProjects);
  const nextCursor = end < catalog.targets.length ? String(end) : '';
  qltdPbDetailProtectionStoreRun_(runId, {
    auditRunId: runId,
    generatedAt: qltdWorkNowIso_(),
    actor: qltdPbDetailProtectionMaskEmail_(auth.email),
    targetCount: catalog.targets.length,
    cursorStart: start,
    cursorEnd: end,
    nextCursor: nextCursor
  });

  return qltdWorkOk_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, {
    auditRunId: runId,
    projectCount: summary.activeProjectCount,
    auditedDeptCount: summary.auditedDeptCount,
    targets: emittedTargets,
    matrix: qltdPbDetailProtectionBuildMatrix_(emittedTargets),
    groups: qltdPbDetailProtectionGroupTargets_(auditedTargets),
    summary: summary,
    cursor: String(start),
    nextCursor: nextCursor,
    limit: options.limit,
    includeHealthy: options.includeHealthy,
    dryRun: true
  }, warnings, {
    email: qltdPbDetailProtectionMaskEmail_(auth.email),
    action: action
  });
}

function qltdPbDetailProtectionRepairAllDryRun_(params) {
  const action = 'work_repairAllPbDetailProtections_dryRun';
  const auth = qltdPbDetailProtectionRequireAdmin_(params, action);
  if (auth.error) return auth.error;

  const auditParams = Object.assign({}, params || {}, {
    includeHealthy: false
  });
  const audit = qltdPbDetailProtectionAuditAllProjects_(auditParams);
  if (!audit.success) return audit;

  const repairTargets = (audit.data.targets || []).map(function(item) {
    return qltdPbDetailProtectionBuildRepairCandidate_(item);
  });
  return qltdWorkOk_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, {
    auditRunId: audit.data.auditRunId,
    targets: repairTargets,
    safeApplyCount: repairTargets.filter(function(target) { return target.autoApplySafe; }).length,
    manualCount: repairTargets.filter(function(target) { return !target.autoApplySafe; }).length,
    dryRun: true
  }, audit.warnings || [], {
    email: qltdPbDetailProtectionMaskEmail_(auth.email)
  });
}

function qltdPbDetailProtectionRepairAllApply_(params) {
  const action = 'work_repairAllPbDetailProtections_apply';
  const auth = qltdPbDetailProtectionRequireAdmin_(params, action);
  if (auth.error) return auth.error;

  const validation = qltdPbDetailProtectionValidateApplyRequest_(params || {}, action);
  if (validation.error) return validation.error;

  const results = [];
  const spreadsheetCache = {};
  validation.targets.forEach(function(target) {
    try {
      const preflight = qltdPbDetailProtectionPreflightTarget_(target, spreadsheetCache, auth);
      if (preflight.error) {
        results.push(Object.assign({}, target, {
          applied: false,
          skipped: true,
          reason: preflight.error
        }));
        return;
      }
      if (preflight.item.protectionFingerprint !== target.expectedProtectionFingerprint) {
        results.push(Object.assign({}, target, {
          applied: false,
          skipped: true,
          reason: 'PROTECTION_FINGERPRINT_CHANGED',
          currentProtectionFingerprint: preflight.item.protectionFingerprint
        }));
        return;
      }
      const applyResult = qltdPbDetailProtectionApplyTargetRepair_(preflight.item, target, auth, validation.auditRunId);
      results.push(Object.assign({}, target, applyResult));
    } catch (error) {
      results.push(Object.assign({}, target, {
        applied: false,
        skipped: true,
        reason: qltdBudgetSafeErrorMessage_(error)
      }));
    }
  });

  return qltdWorkOk_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, {
    auditRunId: validation.auditRunId,
    results: results,
    appliedCount: results.filter(function(result) { return result.applied; }).length,
    skippedCount: results.filter(function(result) { return !result.applied; }).length
  }, [], {
    email: qltdPbDetailProtectionMaskEmail_(auth.email)
  });
}

function qltdPbDetailProtectionRollback_(params) {
  const action = 'work_rollbackPbDetailProtections';
  const auth = qltdPbDetailProtectionRequireAdmin_(params, action);
  if (auth.error) return auth.error;

  const validation = qltdPbDetailProtectionValidateRollbackRequest_(params || {}, action);
  if (validation.error) return validation.error;

  const results = validation.targets.map(function(target) {
    try {
      return qltdPbDetailProtectionRollbackTarget_(validation.auditRunId, target, auth);
    } catch (error) {
      return Object.assign({}, target, {
        rolledBack: false,
        skipped: true,
        reason: qltdBudgetSafeErrorMessage_(error)
      });
    }
  });

  return qltdWorkOk_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, {
    auditRunId: validation.auditRunId,
    results: results,
    rolledBackCount: results.filter(function(result) { return result.rolledBack; }).length,
    skippedCount: results.filter(function(result) { return !result.rolledBack; }).length
  }, [], {
    email: qltdPbDetailProtectionMaskEmail_(auth.email)
  });
}

function qltdPbDetailProtectionRequireAdmin_(params, action) {
  const meta = {
    email: qltdPbDetailProtectionMaskEmail_(params && params.email)
  };
  const auth = qltdWorkAuthUser_(params && params.email, action, QLTD_PB_DETAIL_PROTECTION_SOURCE, meta);
  if (auth.error) return auth;
  if (qltdWorkNormalizeRole_(auth.user && auth.user.role) !== 'ADMIN') {
    auth.error = qltdWorkError_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, 'ACCESS_DENIED', 'Only ADMIN can run PB_DETAIL protection audit and repair.', meta);
  }
  return auth;
}

function qltdPbDetailProtectionParseAuditParams_(params) {
  return {
    projectCode: qltdWorkNormalizeCode_(params.projectCode),
    deptCode: qltdWorkNormalizeCode_(params.deptCode),
    onlyActive: qltdPbDetailProtectionBool_(params.onlyActive, true),
    includeHealthy: qltdPbDetailProtectionBool_(params.includeHealthy, false),
    limit: qltdPbDetailProtectionLimit_(params.limit),
    cursor: Math.max(Number(params.cursor || params.continuation || 0) || 0, 0)
  };
}

function qltdPbDetailProtectionBuildTargetCatalog_(options) {
  const projectsResult = qltdBudgetReadProjects_();
  if (projectsResult.error) {
    return {
      error: qltdWorkError_(QLTD_PB_DETAIL_PROTECTION_SOURCE, 'work_auditAllPbDetailProtections', 'PROJECTS_UNAVAILABLE', 'Cannot read Projects.', {}, projectsResult.warnings || [])
    };
  }
  const deptsResult = qltdBudgetReadProjectDepts_();
  if (deptsResult.error) {
    return {
      error: qltdWorkError_(QLTD_PB_DETAIL_PROTECTION_SOURCE, 'work_auditAllPbDetailProtections', 'PROJECT_DEPTS_UNAVAILABLE', 'Cannot read Project_Depts.', {}, (projectsResult.warnings || []).concat(deptsResult.warnings || []))
    };
  }

  const projects = (projectsResult.projects || []).filter(function(project) {
    if (options.onlyActive && project.status !== 'ACTIVE') return false;
    if (options.projectCode && project.projectCode !== options.projectCode) return false;
    return true;
  }).sort(function(a, b) {
    return qltdPbDetailProtectionSortKey_(a.projectCode, a.projectName).localeCompare(qltdPbDetailProtectionSortKey_(b.projectCode, b.projectName));
  });
  const totalActiveProjects = (projectsResult.projects || []).filter(function(project) {
    return !options.onlyActive || project.status === 'ACTIVE';
  }).length;
  const targets = [];

  if (options.projectCode && !projects.length) {
    targets.push({
      synthetic: true,
      project: { projectCode: options.projectCode, projectName: '', deptSpreadsheetId: '', status: '' },
      dept: { deptCode: options.deptCode || '', deptName: '', status: '' },
      status: QLTD_PB_DETAIL_PROTECTION_STATUS.CONFIG_ERROR,
      message: 'Project is not found in Projects registry or is inactive.'
    });
  }

  projects.forEach(function(project) {
    const projectDepts = (deptsResult.departments || []).filter(function(dept) {
      if (dept.projectCode !== project.projectCode) return false;
      if (options.onlyActive && dept.status !== 'ACTIVE') return false;
      if (options.deptCode && !qltdPbDetailProtectionDeptMatches_(dept, options.deptCode)) return false;
      return true;
    }).sort(function(a, b) {
      return qltdPbDetailProtectionSortKey_(a.deptCode, a.deptName).localeCompare(qltdPbDetailProtectionSortKey_(b.deptCode, b.deptName));
    });

    if (options.deptCode && !projectDepts.length) {
      targets.push({
        synthetic: true,
        project: project,
        dept: { deptCode: options.deptCode, deptName: '', status: '' },
        status: QLTD_PB_DETAIL_PROTECTION_STATUS.CONFIG_ERROR,
        message: 'Dept is not mapped to project in Project_Depts registry.'
      });
      return;
    }

    projectDepts.forEach(function(dept) {
      targets.push({
        project: project,
        dept: dept
      });
    });
  });

  return {
    targets: targets,
    totalActiveProjects: totalActiveProjects,
    warnings: (projectsResult.warnings || []).concat(deptsResult.warnings || []),
    error: null
  };
}

function qltdPbDetailProtectionAuditTarget_(project, dept, spreadsheetCache, auth, options) {
  const context = qltdPbDetailProtectionBuildContext_(project, dept);
  if (!project.deptSpreadsheetId) {
    return qltdPbDetailProtectionTargetErrorItem_(project, dept, QLTD_PB_DETAIL_PROTECTION_STATUS.CONFIG_ERROR, 'Project has no DeptSpreadsheetId.');
  }

  let spreadsheet = spreadsheetCache[project.deptSpreadsheetId];
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.openById(project.deptSpreadsheetId);
    spreadsheetCache[project.deptSpreadsheetId] = spreadsheet;
  }

  const sheetResult = qltdBudgetFindDeptSheet_(spreadsheet, dept, dept.deptCode);
  if (!sheetResult.sheet) {
    const missingSheetItem = qltdPbDetailProtectionBaseItem_(project, dept, {
      spreadsheetIdMasked: qltdPbDetailProtectionMaskId_(project.deptSpreadsheetId),
      schemaReady: false,
      status: QLTD_PB_DETAIL_PROTECTION_STATUS.SHEET_NOT_FOUND,
      warnings: sheetResult.warnings || []
    });
    missingSheetItem.protectionFingerprint = qltdPbDetailProtectionFingerprint_(missingSheetItem);
    return missingSheetItem;
  }

  const schema = qltdPbDetailCheckSchema_(spreadsheet, sheetResult.sheet);
  if (schema.error) {
    const schemaItem = qltdPbDetailProtectionBaseItem_(project, dept, {
      spreadsheetIdMasked: qltdPbDetailProtectionMaskId_(project.deptSpreadsheetId),
      sheetName: sheetResult.sheet.getName(),
      schemaReady: false,
      status: QLTD_PB_DETAIL_PROTECTION_STATUS.SCHEMA_NOT_READY,
      schemaError: schema.error,
      warnings: (sheetResult.warnings || []).concat(schema.warnings || [])
    });
    schemaItem.protectionFingerprint = qltdPbDetailProtectionFingerprint_(schemaItem);
    return schemaItem;
  }

  const sheetContext = qltdPbDetailProtectionReadSheetContext_(spreadsheet, sheetResult.sheet, schema, context);
  const protectionReport = qltdPbDetailProtectionInspect_(sheetContext, auth.email);
  const status = qltdPbDetailProtectionResolveStatus_(sheetContext, protectionReport);
  const repairStrategy = qltdPbDetailProtectionResolveRepairStrategy_(status, protectionReport);
  const item = qltdPbDetailProtectionBaseItem_(project, dept, {
    spreadsheetIdMasked: qltdPbDetailProtectionMaskId_(project.deptSpreadsheetId),
    spreadsheetId: project.deptSpreadsheetId,
    _spreadsheetId: project.deptSpreadsheetId,
    sheetId: sheetResult.sheet.getSheetId(),
    sheetName: sheetResult.sheet.getName(),
    schemaReady: true,
    masterCount: sheetContext.masterRows.length,
    detailSlotCount: sheetContext.slotRows.length,
    sheetProtectionCount: protectionReport.sheetProtectionCount,
    rangeProtectionCount: protectionReport.rangeProtectionCount,
    blockingProtectionCount: protectionReport.blockingProtections.length,
    canCreateInExistingSlot: protectionReport.canCreateInExistingSlot,
    canInsertNewDetailRow: protectionReport.canInsertNewDetailRow,
    effectiveUserCanEdit: protectionReport.effectiveUserCanEdit,
    status: status,
    blockingProtections: protectionReport.blockingProtections,
    repairStrategy: repairStrategy,
    warnings: (sheetResult.warnings || []).concat(schema.warnings || [])
  });
  item.protectionFingerprint = qltdPbDetailProtectionFingerprint_(item);
  item.snapshotKey = qltdPbDetailProtectionTargetKey_(item.projectCode, item.deptCode);
  return options && options.includePrivate ? item : qltdPbDetailProtectionPublicItem_(item);
}

function qltdPbDetailProtectionReadSheetContext_(spreadsheet, sheet, schema, context) {
  const lastRow = sheet.getLastRow();
  const values = lastRow > schema.headerRow
    ? sheet.getRange(schema.headerRow + 1, 1, lastRow - schema.headerRow, QLTD_PB_DETAIL_PROTECTION_DETAIL_COLS).getValues()
    : [];
  const dataRows = values.map(function(row, index) {
    return {
      rowNumber: schema.headerRow + 1 + index,
      values: row,
      rowType: qltdPbDetailNormalizeRowType_(row[schema.columns.rowType]),
      masterTaskCode: qltdPbDetailNormalizeTaskCode_(row[schema.columns.masterTaskCode]),
      detailTaskId: String(row[schema.columns.detailTaskId] || '').trim()
    };
  });
  const masterRows = dataRows.filter(function(row) { return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_MASTER; });
  const slotRows = dataRows.filter(function(row) { return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_SLOT; });
  const detailRows = dataRows.filter(function(row) { return row.rowType === QLTD_PB_DETAIL_ROW_TYPE_DETAIL; });
  const blocks = masterRows.map(function(row) {
    return qltdPbDetailFindMasterBlock_({
      dataRows: dataRows
    }, row.masterTaskCode);
  }).filter(function(block) { return !block.error; });
  const writeRanges = detailRows.concat(slotRows).map(function(row) {
    return qltdPbDetailProtectionRowBounds_(row.rowNumber);
  }).concat(blocks.map(function(block) {
    return qltdPbDetailProtectionRowBounds_(Math.max(block.endRow, schema.headerRow) + 1);
  }));
  return {
    spreadsheet: spreadsheet,
    sheet: sheet,
    context: context,
    headerRow: schema.headerRow,
    columns: schema.columns,
    dataRows: dataRows,
    masterRows: masterRows,
    slotRows: slotRows,
    detailRows: detailRows,
    blocks: blocks,
    writeRanges: writeRanges,
    detailArea: qltdPbDetailProtectionBoundsUnion_(writeRanges) || qltdPbDetailProtectionDetailAreaBounds_(schema.headerRow, lastRow)
  };
}

function qltdPbDetailProtectionInspect_(sheetContext, effectiveEmail) {
  const sheet = sheetContext.sheet;
  const sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET) || [];
  const rangeProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE) || [];
  const blockingProtections = [];
  const emptySlotRows = sheetContext.slotRows.filter(function(row) {
    return !String(row.values[sheetContext.columns.taskName] || '').trim() &&
      !String(row.values[sheetContext.columns.detailTaskId] || '').trim();
  });
  const slotRanges = emptySlotRows.map(function(row) {
    return qltdPbDetailProtectionRowBounds_(row.rowNumber);
  });
  const insertRanges = sheetContext.blocks.map(function(block) {
    return qltdPbDetailProtectionRowBounds_(Math.max(block.endRow, sheetContext.headerRow) + 1);
  });

  function collect(protection, type) {
    const info = qltdPbDetailProtectionInfo_(protection, type, sheetContext, effectiveEmail);
    const blocksSlot = slotRanges.some(function(bounds) { return qltdPbDetailProtectionBlocksBounds_(info, bounds); });
    const blocksInsert = insertRanges.some(function(bounds) { return qltdPbDetailProtectionBlocksBounds_(info, bounds); });
    info.blocksSlot = blocksSlot;
    info.blocksInsert = blocksInsert;
    if (info.blocksDetailArea || blocksSlot || blocksInsert) {
      blockingProtections.push(info);
    }
  }

  sheetProtections.forEach(function(protection) { collect(protection, 'SHEET'); });
  rangeProtections.forEach(function(protection) { collect(protection, 'RANGE'); });

  const canCreateInExistingSlot = slotRanges.some(function(bounds) {
    return !blockingProtections.some(function(info) { return qltdPbDetailProtectionBlocksBounds_(info, bounds); });
  });
  const canInsertNewDetailRow = insertRanges.some(function(bounds) {
    return !blockingProtections.some(function(info) { return qltdPbDetailProtectionBlocksBounds_(info, bounds); });
  });

  return {
    sheetProtectionCount: sheetProtections.length,
    rangeProtectionCount: rangeProtections.length,
    emptySlotCount: emptySlotRows.length,
    blockingProtections: blockingProtections.map(qltdPbDetailProtectionPublicProtection_),
    canCreateInExistingSlot: canCreateInExistingSlot,
    canInsertNewDetailRow: canInsertNewDetailRow,
    effectiveUserCanEdit: !blockingProtections.length
  };
}

function qltdPbDetailProtectionInfo_(protection, type, sheetContext, effectiveEmail) {
  const editors = qltdPbDetailProtectionEditorEmails_(protection);
  const warningOnly = qltdPbDetailProtectionTry_(function() { return protection.isWarningOnly(); }, false);
  const canEdit = qltdPbDetailProtectionTry_(function() { return protection.canEdit(); }, false);
  const bounds = type === 'RANGE'
    ? qltdPbDetailProtectionRangeBounds_(protection.getRange())
    : qltdPbDetailProtectionWholeSheetBounds_(sheetContext.sheet);
  const unprotected = type === 'SHEET'
    ? qltdPbDetailProtectionTry_(function() { return protection.getUnprotectedRanges() || []; }, []).map(qltdPbDetailProtectionRangeBounds_)
    : [];
  const protectionShape = {
    type: type,
    bounds: bounds,
    warningOnly: warningOnly,
    canEdit: canEdit,
    unprotectedBounds: unprotected
  };
  const writeRanges = (sheetContext.writeRanges && sheetContext.writeRanges.length)
    ? sheetContext.writeRanges
    : [sheetContext.detailArea];
  const blocksDetailArea = writeRanges.some(function(writeBounds) {
    return qltdPbDetailProtectionBlocksBounds_(protectionShape, writeBounds);
  });
  const overlapsDetailArea = writeRanges.some(function(writeBounds) {
    return qltdPbDetailProtectionOverlaps_(bounds, writeBounds);
  });

  return {
    type: type,
    description: qltdPbDetailProtectionTry_(function() { return protection.getDescription(); }, ''),
    rangeA1: type === 'RANGE' ? qltdPbDetailProtectionTry_(function() { return protection.getRange().getA1Notation(); }, '') : sheetContext.sheet.getName(),
    warningOnly: warningOnly,
    canEdit: canEdit,
    bounds: bounds,
    unprotectedBounds: unprotected,
    overlapsDetailArea: overlapsDetailArea,
    blocksDetailArea: blocksDetailArea,
    blocksInsert: false,
    editorCount: editors.length,
    effectiveUserIncluded: qltdPbDetailProtectionEmailIncluded_(editors, effectiveEmail),
    repairStrategy: ''
  };
}

function qltdPbDetailProtectionBlocksBounds_(info, bounds) {
  if (!info || info.warningOnly || info.canEdit) return false;
  if (!qltdPbDetailProtectionOverlaps_(info.bounds, bounds)) return false;
  if (info.type === 'SHEET' && qltdPbDetailProtectionBoundsCoveredByAny_(bounds, info.unprotectedBounds || [])) return false;
  return true;
}

function qltdPbDetailProtectionResolveStatus_(sheetContext, protectionReport) {
  if (protectionReport.emptySlotCount > 0 && !protectionReport.canCreateInExistingSlot) return QLTD_PB_DETAIL_PROTECTION_STATUS.PROTECTED_SLOT;
  if (protectionReport.emptySlotCount < 1 && sheetContext.masterRows.length && !protectionReport.canInsertNewDetailRow) return QLTD_PB_DETAIL_PROTECTION_STATUS.PROTECTED_INSERT;
  if (protectionReport.blockingProtections.length) return QLTD_PB_DETAIL_PROTECTION_STATUS.PROTECTED_WRITE;
  return QLTD_PB_DETAIL_PROTECTION_STATUS.OK;
}

function qltdPbDetailProtectionResolveRepairStrategy_(status, protectionReport) {
  if (status === QLTD_PB_DETAIL_PROTECTION_STATUS.OK) return 'NONE';
  const protections = protectionReport.blockingProtections || [];
  if (protections.some(function(item) { return item.type === 'SHEET'; })) return 'ADD_SHEET_UNPROTECTED_DETAIL_RANGE';
  if (protections.some(function(item) { return item.type === 'RANGE' && item.overlapsDetailArea; })) return 'SPLIT_RANGE_AROUND_DETAIL_AREA';
  if (protections.some(function(item) { return !item.effectiveUserIncluded; })) return 'ADD_EFFECTIVE_USER';
  return 'MANUAL_REVIEW';
}

function qltdPbDetailProtectionBuildSummary_(catalogCount, targets, activeProjectCount) {
  const counts = {
    activeProjectCount: activeProjectCount,
    auditedDeptCount: catalogCount,
    okCount: 0,
    protectionCount: 0,
    schemaConfigErrorCount: 0,
    repairNeeded: [],
    repairStrategies: {},
    manualTargets: [],
    safeAutoApplyCount: 0,
    confirmationTargets: []
  };
  (targets || []).forEach(function(target) {
    if (target.status === QLTD_PB_DETAIL_PROTECTION_STATUS.OK) counts.okCount += 1;
    if ([QLTD_PB_DETAIL_PROTECTION_STATUS.PROTECTED_SLOT, QLTD_PB_DETAIL_PROTECTION_STATUS.PROTECTED_INSERT, QLTD_PB_DETAIL_PROTECTION_STATUS.PROTECTED_WRITE].indexOf(target.status) !== -1) {
      counts.protectionCount += 1;
      counts.repairNeeded.push(qltdPbDetailProtectionTargetRef_(target));
      counts.repairStrategies[qltdPbDetailProtectionTargetKey_(target.projectCode, target.deptCode)] = target.repairStrategy || 'MANUAL_REVIEW';
      counts.confirmationTargets.push(qltdPbDetailProtectionTargetRef_(target));
      if (qltdPbDetailProtectionAutoApplySafe_(target.repairStrategy)) counts.safeAutoApplyCount += 1;
      else counts.manualTargets.push(qltdPbDetailProtectionTargetRef_(target));
    }
    if ([QLTD_PB_DETAIL_PROTECTION_STATUS.SCHEMA_NOT_READY, QLTD_PB_DETAIL_PROTECTION_STATUS.SHEET_NOT_FOUND, QLTD_PB_DETAIL_PROTECTION_STATUS.CONFIG_ERROR, QLTD_PB_DETAIL_PROTECTION_STATUS.ACCESS_ERROR].indexOf(target.status) !== -1) {
      counts.schemaConfigErrorCount += 1;
      counts.manualTargets.push(qltdPbDetailProtectionTargetRef_(target));
    }
  });
  return counts;
}

function qltdPbDetailProtectionBuildMatrix_(targets) {
  return (targets || []).map(function(target) {
    return {
      Project: target.projectCode,
      Dept: target.deptCode,
      Sheet: target.sheetName || '',
      Schema: target.schemaReady ? 'READY' : 'NOT_READY',
      Slot: target.canCreateInExistingSlot ? 'OK' : 'BLOCKED',
      Insert: target.canInsertNewDetailRow ? 'OK' : 'BLOCKED',
      Write: target.effectiveUserCanEdit ? 'OK' : 'BLOCKED',
      Protection: target.blockingProtectionCount || 0,
      Status: target.status,
      Repair: target.repairStrategy || ''
    };
  });
}

function qltdPbDetailProtectionGroupTargets_(targets) {
  const groups = {
    healthy: [],
    detailSlotLocked: [],
    noSlotInsertLocked: [],
    sheetProtectionMissingUnprotectedRange: [],
    rangeProtectionOverlapsPbDetail: [],
    effectiveUserMissingEditor: [],
    schemaNotReady: [],
    badConfig: []
  };
  (targets || []).forEach(function(target) {
    const ref = qltdPbDetailProtectionTargetRef_(target);
    if (target.status === QLTD_PB_DETAIL_PROTECTION_STATUS.OK) groups.healthy.push(ref);
    if (target.status === QLTD_PB_DETAIL_PROTECTION_STATUS.PROTECTED_SLOT) groups.detailSlotLocked.push(ref);
    if (target.status === QLTD_PB_DETAIL_PROTECTION_STATUS.PROTECTED_INSERT) groups.noSlotInsertLocked.push(ref);
    if ((target.blockingProtections || []).some(function(item) { return item.type === 'SHEET'; })) groups.sheetProtectionMissingUnprotectedRange.push(ref);
    if ((target.blockingProtections || []).some(function(item) { return item.type === 'RANGE' && item.overlapsDetailArea; })) groups.rangeProtectionOverlapsPbDetail.push(ref);
    if ((target.blockingProtections || []).some(function(item) { return !item.effectiveUserIncluded; })) groups.effectiveUserMissingEditor.push(ref);
    if (target.status === QLTD_PB_DETAIL_PROTECTION_STATUS.SCHEMA_NOT_READY) groups.schemaNotReady.push(ref);
    if ([QLTD_PB_DETAIL_PROTECTION_STATUS.SHEET_NOT_FOUND, QLTD_PB_DETAIL_PROTECTION_STATUS.CONFIG_ERROR, QLTD_PB_DETAIL_PROTECTION_STATUS.ACCESS_ERROR].indexOf(target.status) !== -1) groups.badConfig.push(ref);
  });
  return groups;
}

function qltdPbDetailProtectionPreflightTarget_(target, spreadsheetCache, auth) {
  const auditOptions = qltdPbDetailProtectionParseAuditParams_({
    projectCode: target.projectCode,
    deptCode: target.deptCode,
    onlyActive: true,
    includeHealthy: true,
    limit: 1
  });
  const catalog = qltdPbDetailProtectionBuildTargetCatalog_(auditOptions);
  if (catalog.error) return { error: 'CATALOG_ERROR' };
  const found = (catalog.targets || []).filter(function(candidate) {
    return candidate.project && candidate.project.projectCode === qltdWorkNormalizeCode_(target.projectCode) &&
      candidate.dept && qltdWorkNormalizeCode_(candidate.dept.deptCode) === qltdWorkNormalizeCode_(target.deptCode);
  })[0];
  if (!found || found.synthetic) return { error: 'TARGET_NOT_IN_ALLOWLIST' };
  const item = qltdPbDetailProtectionAuditTarget_(found.project, found.dept, spreadsheetCache, auth, { includePrivate: true });
  return { item: item, error: null };
}

function qltdPbDetailProtectionApplyTargetRepair_(item, target, auth, auditRunId) {
  const strategy = String(target.repairStrategy || item.repairStrategy || '').trim().toUpperCase();
  if (!qltdPbDetailProtectionAutoApplySafe_(strategy)) {
    return {
      applied: false,
      skipped: true,
      reason: 'REPAIR_STRATEGY_REQUIRES_MANUAL_REVIEW'
    };
  }
  const spreadsheet = SpreadsheetApp.openById(item._spreadsheetId || item.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(item.sheetName);
  if (!sheet) return { applied: false, skipped: true, reason: 'SHEET_NOT_FOUND' };
  const schema = qltdPbDetailCheckSchema_(spreadsheet, sheet);
  if (schema.error) return { applied: false, skipped: true, reason: 'SCHEMA_NOT_READY' };
  const context = qltdPbDetailProtectionReadSheetContext_(spreadsheet, sheet, schema, qltdPbDetailProtectionBuildContext_({ projectCode: item.projectCode }, { deptCode: item.deptCode }));
  const snapshots = qltdPbDetailProtectionSnapshotSheet_(auditRunId, item, sheet, auth.email);
  let changed = 0;
  if (strategy === 'ADD_SHEET_UNPROTECTED_DETAIL_RANGE') {
    changed = qltdPbDetailProtectionApplySheetUnprotectedRanges_(sheet, context);
  } else if (strategy === 'SPLIT_RANGE_AROUND_DETAIL_AREA') {
    changed = qltdPbDetailProtectionApplyRangeSplit_(sheet, context);
  } else if (strategy === 'ADD_EFFECTIVE_USER') {
    changed = qltdPbDetailProtectionApplyAddEffectiveUser_(sheet, auth.email);
  }
  qltdPbDetailProtectionStoreSnapshot_(auditRunId, item, snapshots);
  return {
    applied: changed > 0,
    skipped: changed < 1,
    changedProtectionCount: changed,
    snapshotCount: snapshots.length,
    reason: changed > 0 ? 'APPLIED' : 'NO_MATCHING_PROTECTION'
  };
}

function qltdPbDetailProtectionApplySheetUnprotectedRanges_(sheet, context) {
  const writeRanges = (context.writeRanges && context.writeRanges.length) ? context.writeRanges : [context.detailArea];
  let changed = 0;
  (sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET) || []).forEach(function(protection) {
    if (qltdPbDetailProtectionTry_(function() { return protection.isWarningOnly(); }, false)) return;
    const existing = qltdPbDetailProtectionTry_(function() { return protection.getUnprotectedRanges() || []; }, []);
    const existingBounds = existing.map(qltdPbDetailProtectionRangeBounds_);
    const missingRanges = writeRanges.filter(function(bounds) {
      return !qltdPbDetailProtectionBoundsCoveredByAny_(bounds, existingBounds);
    }).map(function(bounds) {
      return sheet.getRange(bounds.startRow, bounds.startCol, bounds.endRow - bounds.startRow + 1, bounds.endCol - bounds.startCol + 1);
    });
    if (!missingRanges.length) return;
    protection.setUnprotectedRanges(existing.concat(missingRanges));
    changed += 1;
  });
  return changed;
}

function qltdPbDetailProtectionApplyRangeSplit_(sheet, context) {
  let changed = 0;
  const detailBounds = context.detailArea;
  (sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE) || []).forEach(function(protection) {
    const warningOnly = qltdPbDetailProtectionTry_(function() { return protection.isWarningOnly(); }, false);
    if (warningOnly) return;
    const sourceRange = protection.getRange();
    const sourceBounds = qltdPbDetailProtectionRangeBounds_(sourceRange);
    if (!qltdPbDetailProtectionOverlaps_(sourceBounds, detailBounds)) return;
    if (!qltdPbDetailProtectionTry_(function() { return protection.canEdit(); }, false)) return;
    const editors = qltdPbDetailProtectionEditorEmails_(protection);
    const description = qltdPbDetailProtectionTry_(function() { return protection.getDescription(); }, '');
    const fragments = qltdPbDetailProtectionSubtractBounds_(sourceBounds, detailBounds);
    fragments.forEach(function(bounds) {
      const range = sheet.getRange(bounds.startRow, bounds.startCol, bounds.endRow - bounds.startRow + 1, bounds.endCol - bounds.startCol + 1);
      const next = range.protect();
      next.setDescription(description ? description + ' [PB_DETAIL_REPAIR_SPLIT]' : 'PB_DETAIL_REPAIR_SPLIT');
      next.setWarningOnly(false);
      if (editors.length) next.addEditors(editors);
      qltdPbDetailProtectionTry_(function() { if (next.canDomainEdit()) next.setDomainEdit(false); }, null);
    });
    protection.remove();
    changed += 1;
  });
  return changed;
}

function qltdPbDetailProtectionApplyAddEffectiveUser_(sheet, effectiveEmail) {
  const email = qltdWorkNormalizeEmail_(effectiveEmail);
  if (!email) return 0;
  let changed = 0;
  [SpreadsheetApp.ProtectionType.SHEET, SpreadsheetApp.ProtectionType.RANGE].forEach(function(type) {
    (sheet.getProtections(type) || []).forEach(function(protection) {
      if (qltdPbDetailProtectionEmailIncluded_(qltdPbDetailProtectionEditorEmails_(protection), email)) return;
      if (!qltdPbDetailProtectionTry_(function() { return protection.canEdit(); }, false)) return;
      protection.addEditor(email);
      changed += 1;
    });
  });
  return changed;
}

function qltdPbDetailProtectionRollbackTarget_(auditRunId, target, auth) {
  const snapshot = qltdPbDetailProtectionLoadSnapshot_(auditRunId, target);
  if (!snapshot || !snapshot.protections) {
    return Object.assign({}, target, {
      rolledBack: false,
      skipped: true,
      reason: 'SNAPSHOT_NOT_FOUND'
    });
  }
  const spreadsheet = SpreadsheetApp.openById(snapshot.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(snapshot.sheetName);
  if (!sheet) return Object.assign({}, target, { rolledBack: false, skipped: true, reason: 'SHEET_NOT_FOUND' });

  [SpreadsheetApp.ProtectionType.SHEET, SpreadsheetApp.ProtectionType.RANGE].forEach(function(type) {
    (sheet.getProtections(type) || []).forEach(function(protection) {
      protection.remove();
    });
  });

  snapshot.protections.forEach(function(entry) {
    let protection;
    if (entry.type === 'SHEET') {
      protection = sheet.protect();
      const unprotected = (entry.unprotectedRanges || []).map(function(a1) { return sheet.getRange(a1); });
      if (unprotected.length) protection.setUnprotectedRanges(unprotected);
    } else {
      protection = sheet.getRange(entry.rangeA1).protect();
    }
    protection.setDescription(entry.description || '');
    protection.setWarningOnly(!!entry.warningOnly);
    if ((entry.editors || []).length) protection.addEditors(entry.editors);
    qltdPbDetailProtectionTry_(function() { if (protection.canDomainEdit()) protection.setDomainEdit(false); }, null);
  });

  return Object.assign({}, target, {
    rolledBack: true,
    skipped: false,
    restoredProtectionCount: snapshot.protections.length,
    actor: qltdPbDetailProtectionMaskEmail_(auth.email)
  });
}

function qltdPbDetailProtectionValidateApplyRequest_(params, action) {
  if (params.confirmed !== true) {
    return { error: qltdWorkError_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, 'CONFIRMATION_REQUIRED', 'confirmed === true is required.') };
  }
  const auditRunId = String(params.auditRunId || '').trim();
  if (!auditRunId || !qltdPbDetailProtectionLoadRun_(auditRunId)) {
    return { error: qltdWorkError_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, 'AUDIT_RUN_ID_REQUIRED', 'A valid auditRunId is required.') };
  }
  const targets = Array.isArray(params.targets) ? params.targets : [];
  if (!targets.length) {
    return { error: qltdWorkError_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, 'TARGET_ALLOWLIST_REQUIRED', 'Explicit project/dept targets are required.') };
  }
  const invalid = targets.filter(function(target) {
    return !qltdWorkNormalizeCode_(target.projectCode) || !qltdWorkNormalizeCode_(target.deptCode) || !String(target.expectedProtectionFingerprint || '').trim() || !String(target.repairStrategy || '').trim();
  });
  if (invalid.length) {
    return { error: qltdWorkError_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, 'TARGET_INVALID', 'Each target must include projectCode, deptCode, expectedProtectionFingerprint and repairStrategy.') };
  }
  return { auditRunId: auditRunId, targets: targets, error: null };
}

function qltdPbDetailProtectionValidateRollbackRequest_(params, action) {
  if (params.confirmed !== true) {
    return { error: qltdWorkError_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, 'CONFIRMATION_REQUIRED', 'confirmed === true is required.') };
  }
  const auditRunId = String(params.auditRunId || '').trim();
  if (!auditRunId) {
    return { error: qltdWorkError_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, 'AUDIT_RUN_ID_REQUIRED', 'auditRunId is required.') };
  }
  const targets = Array.isArray(params.targets) ? params.targets : [];
  if (!targets.length) {
    return { error: qltdWorkError_(QLTD_PB_DETAIL_PROTECTION_SOURCE, action, 'TARGET_ALLOWLIST_REQUIRED', 'Explicit rollback targets are required.') };
  }
  return { auditRunId: auditRunId, targets: targets, error: null };
}

function qltdPbDetailProtectionSnapshotSheet_(auditRunId, item, sheet, actorEmail) {
  const snapshot = [];
  [SpreadsheetApp.ProtectionType.SHEET, SpreadsheetApp.ProtectionType.RANGE].forEach(function(type) {
    (sheet.getProtections(type) || []).forEach(function(protection) {
      const isSheet = type === SpreadsheetApp.ProtectionType.SHEET;
      snapshot.push({
        auditRunId: auditRunId,
        projectCode: item.projectCode,
        deptCode: item.deptCode,
        spreadsheetId: item.spreadsheetId,
        sheetId: sheet.getSheetId(),
        sheetName: sheet.getName(),
        type: isSheet ? 'SHEET' : 'RANGE',
        description: qltdPbDetailProtectionTry_(function() { return protection.getDescription(); }, ''),
        rangeA1: isSheet ? '' : qltdPbDetailProtectionTry_(function() { return protection.getRange().getA1Notation(); }, ''),
        warningOnly: qltdPbDetailProtectionTry_(function() { return protection.isWarningOnly(); }, false),
        editorsMasked: qltdPbDetailProtectionEditorEmails_(protection).map(qltdPbDetailProtectionMaskEmail_),
        editors: qltdPbDetailProtectionEditorEmails_(protection),
        unprotectedRanges: isSheet
          ? qltdPbDetailProtectionTry_(function() { return protection.getUnprotectedRanges() || []; }, []).map(function(range) { return range.getA1Notation(); })
          : [],
        timestamp: qltdWorkNowIso_(),
        actor: qltdPbDetailProtectionMaskEmail_(actorEmail),
        fingerprint: qltdPbDetailProtectionHash_(JSON.stringify({
          type: isSheet ? 'SHEET' : 'RANGE',
          description: qltdPbDetailProtectionTry_(function() { return protection.getDescription(); }, ''),
          range: isSheet ? '' : qltdPbDetailProtectionTry_(function() { return protection.getRange().getA1Notation(); }, '')
        }))
      });
    });
  });
  return snapshot;
}

function qltdPbDetailProtectionStoreSnapshot_(auditRunId, item, protections) {
  qltdPbDetailProtectionStore_(QLTD_PB_DETAIL_PROTECTION_SNAPSHOT_PREFIX + auditRunId + '_' + qltdPbDetailProtectionTargetKey_(item.projectCode, item.deptCode), {
    auditRunId: auditRunId,
    projectCode: item.projectCode,
    deptCode: item.deptCode,
    spreadsheetId: item.spreadsheetId,
    sheetName: item.sheetName,
    protections: protections
  });
}

function qltdPbDetailProtectionLoadSnapshot_(auditRunId, target) {
  return qltdPbDetailProtectionLoad_(QLTD_PB_DETAIL_PROTECTION_SNAPSHOT_PREFIX + auditRunId + '_' + qltdPbDetailProtectionTargetKey_(target.projectCode, target.deptCode));
}

function qltdPbDetailProtectionStoreRun_(auditRunId, data) {
  qltdPbDetailProtectionStore_(QLTD_PB_DETAIL_PROTECTION_PROP_PREFIX + 'RUN_' + auditRunId, data);
}

function qltdPbDetailProtectionLoadRun_(auditRunId) {
  return qltdPbDetailProtectionLoad_(QLTD_PB_DETAIL_PROTECTION_PROP_PREFIX + 'RUN_' + auditRunId);
}

function qltdPbDetailProtectionStoreAuditTarget_(auditRunId, item) {
  qltdPbDetailProtectionStore_(QLTD_PB_DETAIL_PROTECTION_PROP_PREFIX + 'TARGET_' + auditRunId + '_' + qltdPbDetailProtectionTargetKey_(item.projectCode, item.deptCode), {
    projectCode: item.projectCode,
    deptCode: item.deptCode,
    protectionFingerprint: item.protectionFingerprint,
    repairStrategy: item.repairStrategy,
    status: item.status
  });
}

function qltdPbDetailProtectionStore_(key, value) {
  try {
    if (typeof PropertiesService === 'undefined') return;
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(value));
  } catch (error) {
    Logger.log('PB_DETAIL protection audit store skipped: ' + qltdBudgetSafeErrorMessage_(error));
  }
}

function qltdPbDetailProtectionLoad_(key) {
  try {
    if (typeof PropertiesService === 'undefined') return null;
    const raw = PropertiesService.getScriptProperties().getProperty(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function qltdPbDetailProtectionBaseItem_(project, dept, extra) {
  return Object.assign({
    projectCode: project && project.projectCode || '',
    projectName: project && project.projectName || '',
    deptCode: dept && qltdWorkNormalizeCode_(dept.deptCode) || '',
    deptName: dept && dept.deptName || '',
    spreadsheetIdMasked: qltdPbDetailProtectionMaskId_(project && project.deptSpreadsheetId),
    sheetName: '',
    schemaReady: false,
    masterCount: 0,
    detailSlotCount: 0,
    sheetProtectionCount: 0,
    rangeProtectionCount: 0,
    blockingProtectionCount: 0,
    canCreateInExistingSlot: false,
    canInsertNewDetailRow: false,
    effectiveUserCanEdit: false,
    status: QLTD_PB_DETAIL_PROTECTION_STATUS.OK,
    blockingProtections: [],
    repairStrategy: 'NONE',
    protectionFingerprint: ''
  }, extra || {});
}

function qltdPbDetailProtectionPublicItem_(item) {
  const output = Object.assign({}, item);
  delete output.spreadsheetId;
  delete output._spreadsheetId;
  delete output.sheetId;
  return output;
}

function qltdPbDetailProtectionTargetErrorItem_(project, dept, status, message) {
  const item = qltdPbDetailProtectionBaseItem_(project || {}, dept || {}, {
    status: status,
    errorMessage: message || status,
    repairStrategy: 'MANUAL_REVIEW'
  });
  item.protectionFingerprint = qltdPbDetailProtectionFingerprint_(item);
  return item;
}

function qltdPbDetailProtectionSyntheticAuditItem_(target) {
  const item = qltdPbDetailProtectionTargetErrorItem_(target.project, target.dept, target.status, target.message);
  item.auditRunId = '';
  return item;
}

function qltdPbDetailProtectionBuildContext_(project, dept) {
  return {
    project: project || {},
    dept: dept || {},
    projectCode: project && project.projectCode || '',
    deptCode: dept && qltdWorkNormalizeCode_(dept.deptCode) || '',
    requestedDeptCode: dept && dept.deptCode || '',
    warnings: [],
    meta: {
      projectCode: project && project.projectCode || '',
      deptCode: dept && qltdWorkNormalizeCode_(dept.deptCode) || ''
    }
  };
}

function qltdPbDetailProtectionBuildRepairCandidate_(item) {
  const strategy = item.repairStrategy || 'MANUAL_REVIEW';
  return {
    projectCode: item.projectCode,
    projectName: item.projectName,
    deptCode: item.deptCode,
    deptName: item.deptName,
    sheetName: item.sheetName,
    status: item.status,
    expectedProtectionFingerprint: item.protectionFingerprint,
    repairStrategy: strategy,
    autoApplySafe: qltdPbDetailProtectionAutoApplySafe_(strategy),
    manualConfirmationRequired: true
  };
}

function qltdPbDetailProtectionTargetRef_(target) {
  return {
    projectCode: target.projectCode,
    projectName: target.projectName,
    deptCode: target.deptCode,
    deptName: target.deptName,
    sheetName: target.sheetName || '',
    status: target.status,
    repairStrategy: target.repairStrategy || ''
  };
}

function qltdPbDetailProtectionPublicProtection_(info) {
  return {
    type: info.type,
    description: info.description || '',
    rangeA1: info.rangeA1 || '',
    warningOnly: !!info.warningOnly,
    canEdit: !!info.canEdit,
    overlapsDetailArea: !!info.overlapsDetailArea,
    blocksInsert: !!info.blocksInsert,
    editorCount: info.editorCount || 0,
    effectiveUserIncluded: !!info.effectiveUserIncluded,
    repairStrategy: qltdPbDetailProtectionProtectionRepairStrategy_(info)
  };
}

function qltdPbDetailProtectionProtectionRepairStrategy_(info) {
  if (info.type === 'SHEET') return 'ADD_SHEET_UNPROTECTED_DETAIL_RANGE';
  if (info.type === 'RANGE' && info.overlapsDetailArea) return 'SPLIT_RANGE_AROUND_DETAIL_AREA';
  if (!info.effectiveUserIncluded) return 'ADD_EFFECTIVE_USER';
  return 'MANUAL_REVIEW';
}

function qltdPbDetailProtectionAutoApplySafe_(strategy) {
  return ['ADD_EFFECTIVE_USER', 'ADD_SHEET_UNPROTECTED_DETAIL_RANGE', 'SPLIT_RANGE_AROUND_DETAIL_AREA'].indexOf(String(strategy || '').trim().toUpperCase()) !== -1;
}

function qltdPbDetailProtectionFingerprint_(item) {
  return qltdPbDetailProtectionHash_(JSON.stringify({
    projectCode: item.projectCode,
    deptCode: item.deptCode,
    sheetName: item.sheetName,
    status: item.status,
    protections: (item.blockingProtections || []).map(function(protection) {
      return {
        type: protection.type,
        description: protection.description,
        rangeA1: protection.rangeA1,
        warningOnly: protection.warningOnly,
        editorCount: protection.editorCount,
        effectiveUserIncluded: protection.effectiveUserIncluded,
        repairStrategy: protection.repairStrategy
      };
    })
  }));
}

function qltdPbDetailProtectionHash_(text) {
  const value = String(text || '');
  try {
    if (typeof Utilities !== 'undefined' && Utilities.computeDigest) {
      const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value);
      return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
    }
  } catch (error) {}
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return 'H' + Math.abs(hash);
}

function qltdPbDetailProtectionRunId_() {
  try {
    if (typeof Utilities !== 'undefined' && Utilities.getUuid) return Utilities.getUuid();
  } catch (error) {}
  return 'AUDIT-' + new Date().getTime();
}

function qltdPbDetailProtectionRangeBounds_(range) {
  return {
    startRow: range.getRow(),
    endRow: range.getLastRow(),
    startCol: range.getColumn(),
    endCol: range.getLastColumn()
  };
}

function qltdPbDetailProtectionWholeSheetBounds_(sheet) {
  return {
    startRow: 1,
    endRow: Math.max(sheet.getMaxRows ? sheet.getMaxRows() : sheet.getLastRow(), sheet.getLastRow(), 1),
    startCol: 1,
    endCol: Math.max(sheet.getMaxColumns ? sheet.getMaxColumns() : sheet.getLastColumn(), sheet.getLastColumn(), QLTD_PB_DETAIL_PROTECTION_DETAIL_COLS)
  };
}

function qltdPbDetailProtectionDetailAreaBounds_(headerRow, lastRow) {
  return {
    startRow: Math.max(Number(headerRow || 1) + 1, 1),
    endRow: Math.max(Number(lastRow || 1), Number(headerRow || 1) + 1),
    startCol: 1,
    endCol: QLTD_PB_DETAIL_PROTECTION_DETAIL_COLS
  };
}

function qltdPbDetailProtectionRowBounds_(rowNumber) {
  const row = Math.max(Number(rowNumber || 1), 1);
  return {
    startRow: row,
    endRow: row,
    startCol: 1,
    endCol: QLTD_PB_DETAIL_PROTECTION_DETAIL_COLS
  };
}

function qltdPbDetailProtectionOverlaps_(a, b) {
  if (!a || !b) return false;
  return a.startRow <= b.endRow && a.endRow >= b.startRow && a.startCol <= b.endCol && a.endCol >= b.startCol;
}

function qltdPbDetailProtectionContains_(outer, inner) {
  return outer && inner &&
    outer.startRow <= inner.startRow &&
    outer.endRow >= inner.endRow &&
    outer.startCol <= inner.startCol &&
    outer.endCol >= inner.endCol;
}

function qltdPbDetailProtectionBoundsCoveredByAny_(bounds, candidates) {
  return (candidates || []).some(function(candidate) {
    return qltdPbDetailProtectionContains_(candidate, bounds);
  });
}

function qltdPbDetailProtectionBoundsUnion_(ranges) {
  if (!ranges || !ranges.length) return null;
  return ranges.reduce(function(acc, bounds) {
    if (!acc) return Object.assign({}, bounds);
    return {
      startRow: Math.min(acc.startRow, bounds.startRow),
      endRow: Math.max(acc.endRow, bounds.endRow),
      startCol: Math.min(acc.startCol, bounds.startCol),
      endCol: Math.max(acc.endCol, bounds.endCol)
    };
  }, null);
}

function qltdPbDetailProtectionSubtractBounds_(source, cut) {
  if (!qltdPbDetailProtectionOverlaps_(source, cut)) return [source];
  const overlap = {
    startRow: Math.max(source.startRow, cut.startRow),
    endRow: Math.min(source.endRow, cut.endRow),
    startCol: Math.max(source.startCol, cut.startCol),
    endCol: Math.min(source.endCol, cut.endCol)
  };
  const fragments = [];
  if (source.startRow < overlap.startRow) {
    fragments.push({ startRow: source.startRow, endRow: overlap.startRow - 1, startCol: source.startCol, endCol: source.endCol });
  }
  if (overlap.endRow < source.endRow) {
    fragments.push({ startRow: overlap.endRow + 1, endRow: source.endRow, startCol: source.startCol, endCol: source.endCol });
  }
  if (source.startCol < overlap.startCol) {
    fragments.push({ startRow: overlap.startRow, endRow: overlap.endRow, startCol: source.startCol, endCol: overlap.startCol - 1 });
  }
  if (overlap.endCol < source.endCol) {
    fragments.push({ startRow: overlap.startRow, endRow: overlap.endRow, startCol: overlap.endCol + 1, endCol: source.endCol });
  }
  return fragments.filter(function(fragment) {
    return fragment.startRow <= fragment.endRow && fragment.startCol <= fragment.endCol;
  });
}

function qltdPbDetailProtectionEditorEmails_(protection) {
  return qltdPbDetailProtectionTry_(function() {
    return (protection.getEditors() || []).map(function(user) {
      return qltdWorkNormalizeEmail_(user.getEmail ? user.getEmail() : user);
    }).filter(function(email) { return !!email; });
  }, []);
}

function qltdPbDetailProtectionEmailIncluded_(emails, email) {
  const normalized = qltdWorkNormalizeEmail_(email);
  if (!normalized) return false;
  return (emails || []).some(function(candidate) {
    return qltdWorkNormalizeEmail_(candidate) === normalized;
  });
}

function qltdPbDetailProtectionMaskEmail_(email) {
  const normalized = qltdWorkNormalizeEmail_(email);
  if (!normalized) return '';
  const parts = normalized.split('@');
  const local = parts[0] || '';
  const domain = parts[1] || '';
  return (local.slice(0, 2) || '*') + '***@' + domain;
}

function qltdPbDetailProtectionMaskId_(id) {
  const text = String(id || '').trim();
  if (!text) return '';
  if (text.length <= 10) return text.slice(0, 2) + '***';
  return text.slice(0, 6) + '...' + text.slice(-4);
}

function qltdPbDetailProtectionBool_(value, defaultValue) {
  if (value === undefined || value === null || value === '') return !!defaultValue;
  if (value === true || value === false) return value;
  const text = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y'].indexOf(text) !== -1;
}

function qltdPbDetailProtectionLimit_(value) {
  const limit = Number(value || QLTD_PB_DETAIL_PROTECTION_DEFAULT_LIMIT);
  if (!limit || limit < 1) return QLTD_PB_DETAIL_PROTECTION_DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), QLTD_PB_DETAIL_PROTECTION_MAX_LIMIT);
}

function qltdPbDetailProtectionDeptMatches_(dept, deptCode) {
  const normalized = qltdWorkNormalizeCode_(deptCode);
  return qltdWorkNormalizeCode_(dept.deptCode) === normalized ||
    qltdWorkNormalizeCode_(dept.projectUnitCode) === normalized ||
    qltdWorkNormalizeCode_(dept.masterDeptCode) === normalized;
}

function qltdPbDetailProtectionTargetKey_(projectCode, deptCode) {
  return qltdWorkNormalizeCode_(projectCode).replace(/[^A-Z0-9]/g, '_') + '__' + qltdWorkNormalizeCode_(deptCode).replace(/[^A-Z0-9]/g, '_');
}

function qltdPbDetailProtectionSortKey_(code, name) {
  return String(code || '') + '|' + String(name || '');
}

function qltdPbDetailProtectionTry_(fn, fallback) {
  try {
    return fn();
  } catch (error) {
    return fallback;
  }
}
