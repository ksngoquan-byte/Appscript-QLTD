const QLTD_SHADOW_COCLEU_SOURCE = 'firestore_shadow_cocleu_v1';
const QLTD_SHADOW_COCLEU_CONFIG = {
  SHADOW_ENABLED: true,
  SHADOW_MODE: true,
  TENANT_ID: 'entiz',
  PROJECT_ID: '24-1-db',
  PROJECT_CODE: '24-1-db',
  FIREBASE_PROJECT_ID: 'qltd-entiz-dev-208a3',
  SPREADSHEET_ID: '1XQXeT92SjqHt4-UV3aVMNAmSioF9JVOhdjZqy7HhS90',
  SHEET_NAME: 'Cong_viec',
  HEADER_ROW: 4,
  DATA_START_ROW: 5,
  VERSION: 'shadow-cocleu-v1',
  BATCH_SIZE: 450
};

function qltdShadowCocLeuSync_(payload) {
  const action = 'shadow_sync_cocleu';
  const auth = qltdShadowCocLeuAuthorizeAdmin_(payload, action);
  if (auth.error) return auth.error;
  if (!QLTD_SHADOW_COCLEU_CONFIG.SHADOW_ENABLED || !QLTD_SHADOW_COCLEU_CONFIG.SHADOW_MODE) {
    return qltdShadowCocLeuError_(action, 'SHADOW_DISABLED', 'Firestore Shadow pilot is disabled.', auth.meta);
  }

  const requestId = qltdShadowCocLeuRequestId_(payload);
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(20000);
    if (!locked) {
      return qltdShadowCocLeuError_(action, 'SHADOW_SYNC_BUSY', 'Shadow sync is already running. Retry later.', auth.meta);
    }

    const requestPath = qltdShadowCocLeuDocPath_('shadowRequests', requestId);
    const existingRequest = qltdShadowFirestoreGetDocument_(requestPath);
    if (existingRequest && String(existingRequest.status || '').toUpperCase() === 'COMPLETED') {
      const latest = qltdShadowCocLeuGetLatestStatus_(Object.assign({}, payload, { _authorized: auth }));
      return Object.assign({}, latest, {
        idempotent: true,
        requestId: requestId,
        message: 'REQUEST_ALREADY_COMPLETED'
      });
    }
    if (existingRequest && String(existingRequest.status || '').toUpperCase() === 'RUNNING') {
      return qltdShadowCocLeuError_(action, 'REQUEST_ALREADY_RUNNING', 'This requestId is already running.', auth.meta);
    }

    qltdShadowFirestoreCommit_([qltdShadowCocLeuDocument_(requestPath, {
      requestId: requestId,
      status: 'RUNNING',
      actorEmail: auth.email,
      action: action,
      startedAt: new Date(),
      shadowMode: true
    })]);

    const snapshot = qltdShadowCocLeuBuildSnapshot_(auth.email, requestId);
    if (snapshot.errors.length) {
      const failed = qltdShadowCocLeuBuildSnapshotDoc_(snapshot, 'FAILED', {
        ok: false,
        reason: 'SOURCE_VALIDATION_FAILED',
        taskCountMatches: false,
        dependencyCountMatches: false
      });
      qltdShadowFirestoreCommit_([
        qltdShadowCocLeuDocument_(qltdShadowCocLeuDocPath_('shadowSnapshots', snapshot.snapshotHash), failed),
        qltdShadowCocLeuDocument_(requestPath, {
          requestId: requestId,
          status: 'FAILED',
          actorEmail: auth.email,
          snapshotHash: snapshot.snapshotHash,
          completedAt: new Date(),
          errorCode: 'SOURCE_VALIDATION_FAILED'
        })
      ]);
      return qltdShadowCocLeuResponse_(action, false, failed, auth.meta);
    }

    const writes = [];
    snapshot.items.forEach(function(item) {
      writes.push(qltdShadowCocLeuDocument_(qltdShadowCocLeuDocPath_('items', item.taskCode), item));
    });
    snapshot.dependencies.forEach(function(dependency) {
      writes.push(qltdShadowCocLeuDocument_(qltdShadowCocLeuDocPath_('dependencies', dependency.dependencyId), dependency));
    });
    qltdShadowFirestoreCommit_(writes);

    const reconciliation = qltdShadowCocLeuReconcileSnapshot_(snapshot);
    const status = reconciliation.ok ? 'COMPLETED' : 'PARTIAL';
    const snapshotDoc = qltdShadowCocLeuBuildSnapshotDoc_(snapshot, status, reconciliation);
    qltdShadowFirestoreCommit_([
      qltdShadowCocLeuDocument_(qltdShadowCocLeuDocPath_('shadowSnapshots', snapshot.snapshotHash), snapshotDoc),
      qltdShadowCocLeuDocument_(qltdShadowCocLeuDocPath_('shadowState', 'latest'), snapshotDoc),
      qltdShadowCocLeuDocument_(requestPath, {
        requestId: requestId,
        status: status,
        actorEmail: auth.email,
        snapshotHash: snapshot.snapshotHash,
        completedAt: new Date(),
        shadowMode: true
      })
    ]);

    return qltdShadowCocLeuResponse_(action, status === 'COMPLETED', snapshotDoc, auth.meta);
  } catch (error) {
    try {
      const requestPath = qltdShadowCocLeuDocPath_('shadowRequests', requestId);
      qltdShadowFirestoreCommit_([qltdShadowCocLeuDocument_(requestPath, {
        requestId: requestId,
        status: 'FAILED',
        actorEmail: auth.email,
        completedAt: new Date(),
        errorCode: 'SHADOW_SYNC_FAILED',
        errorMessage: qltdShadowCocLeuSafeError_(error),
        shadowMode: true
      })]);
    } catch (writeError) {
      console.error('SHADOW_SYNC_FAILED_STATUS_WRITE_FAILED', writeError);
    }
    return qltdShadowCocLeuError_(action, 'SHADOW_SYNC_FAILED', qltdShadowCocLeuSafeError_(error), auth.meta);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function qltdShadowCocLeuReconcile_(payload) {
  const action = 'shadow_reconcile_cocleu';
  const auth = qltdShadowCocLeuAuthorizeAdmin_(payload, action);
  if (auth.error) return auth.error;
  const latest = qltdShadowFirestoreGetDocument_(qltdShadowCocLeuDocPath_('shadowState', 'latest'));
  if (!latest || !latest.snapshotHash) {
    return qltdShadowCocLeuError_(action, 'SHADOW_STATUS_NOT_FOUND', 'No Shadow snapshot has been written yet.', auth.meta);
  }
  const snapshotDoc = qltdShadowFirestoreGetDocument_(qltdShadowCocLeuDocPath_('shadowSnapshots', latest.snapshotHash)) || latest;
  const reconciliation = qltdShadowCocLeuReconcileCounts_(snapshotDoc);
  const nextDoc = Object.assign({}, snapshotDoc, {
    reconciliationResult: reconciliation,
    status: reconciliation.ok ? 'COMPLETED' : 'PARTIAL',
    completedAt: new Date()
  });
  qltdShadowFirestoreCommit_([
    qltdShadowCocLeuDocument_(qltdShadowCocLeuDocPath_('shadowSnapshots', latest.snapshotHash), nextDoc),
    qltdShadowCocLeuDocument_(qltdShadowCocLeuDocPath_('shadowState', 'latest'), nextDoc)
  ]);
  return qltdShadowCocLeuResponse_(action, reconciliation.ok, nextDoc, auth.meta);
}

function qltdShadowCocLeuGetLatestStatus_(payload) {
  const action = 'shadow_get_latest_status';
  const auth = payload && payload._authorized ? payload._authorized : qltdShadowCocLeuAuthorizeAdmin_(payload, action);
  if (auth.error) return auth.error;
  const latest = qltdShadowFirestoreGetDocument_(qltdShadowCocLeuDocPath_('shadowState', 'latest'));
  if (!latest) {
    return qltdShadowCocLeuResponse_(action, true, {
      status: 'NOT_RUN',
      taskCount: 0,
      dependencyCount: 0,
      warningCount: 0,
      errorCount: 0,
      shadowMode: true
    }, auth.meta);
  }
  return qltdShadowCocLeuResponse_(action, true, latest, auth.meta);
}

function qltdShadowCocLeuAuthorizeAdmin_(payload, action) {
  const meta = {
    source: QLTD_SHADOW_COCLEU_SOURCE,
    projectId: QLTD_SHADOW_COCLEU_CONFIG.PROJECT_ID,
    spreadsheetId: QLTD_SHADOW_COCLEU_CONFIG.SPREADSHEET_ID
  };
  const identity = qltdFirebaseResolveIdentity_(payload, true);
  if (!identity.success) return { error: identity, meta: meta };
  const user = qltdUsersGetByEmail_(identity.email);
  if (!user) {
    return { error: qltdUsersBuildAuthError_('USER_NOT_FOUND', 'Tai khoan chua duoc dang ky tren he thong.', meta), meta: meta };
  }
  if (user.status !== 'ACTIVE') {
    return { error: qltdUsersBuildAuthError_('USER_INACTIVE', 'Tai khoan dang bi khoa.', meta), meta: meta };
  }
  if (qltdUsersNormalizeRole_(user.role) !== 'ADMIN') {
    return { error: qltdUsersBuildAuthError_('FORBIDDEN_ADMIN_ONLY', 'Chi Admin moi duoc thao tac Firestore Shadow Pilot.', meta), meta: meta };
  }
  return {
    success: true,
    email: user.email,
    user: user,
    meta: Object.assign({}, meta, { actorEmail: user.email, action: action })
  };
}

function qltdShadowCocLeuBuildSnapshot_(actorEmail, requestId) {
  const startedAt = new Date();
  const warnings = [];
  const errors = [];
  const spreadsheet = SpreadsheetApp.openById(QLTD_SHADOW_COCLEU_CONFIG.SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(QLTD_SHADOW_COCLEU_CONFIG.SHEET_NAME);
  if (!sheet) {
    throw new Error('CONG_VIEC_SHEET_NOT_FOUND');
  }

  const lastRow = Math.max(QLTD_SHADOW_COCLEU_CONFIG.HEADER_ROW, sheet.getLastRow());
  const lastColumn = Math.max(1, sheet.getLastColumn());
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headerIndex = qltdGanttBuildHeaderIndex_(values[QLTD_SHADOW_COCLEU_CONFIG.HEADER_ROW - 1] || []);
  const detected = { rowIndex: QLTD_SHADOW_COCLEU_CONFIG.HEADER_ROW - 1, headerIndex: headerIndex, score: 999 };
  const tasks = qltdGanttBuildTasks_(values, detected, warnings, QLTD_SHADOW_COCLEU_CONFIG.SHEET_NAME);
  const parentByWbs = qltdShadowCocLeuBuildParentByWbs_(tasks);
  const items = qltdShadowCocLeuBuildItems_(tasks, parentByWbs, warnings, errors);
  const dependencies = qltdShadowCocLeuBuildDependencies_(tasks, warnings, errors);
  qltdShadowCocLeuValidateCycles_(dependencies, errors);

  const hashPayload = {
    config: {
      tenantId: QLTD_SHADOW_COCLEU_CONFIG.TENANT_ID,
      projectId: QLTD_SHADOW_COCLEU_CONFIG.PROJECT_ID,
      spreadsheetId: QLTD_SHADOW_COCLEU_CONFIG.SPREADSHEET_ID,
      sheetName: QLTD_SHADOW_COCLEU_CONFIG.SHEET_NAME,
      version: QLTD_SHADOW_COCLEU_CONFIG.VERSION
    },
    items: items.map(function(item) {
      return {
        taskCode: item.taskCode,
        sourceHash: item.sourceHash,
        predecessorRaw: item.predecessorRaw
      };
    }),
    dependencies: dependencies.map(function(item) {
      return {
        dependencyId: item.dependencyId,
        predecessorTaskCode: item.predecessorTaskCode,
        successorTaskCode: item.successorTaskCode,
        relationType: item.relationType,
        lag: item.lag
      };
    }),
    warnings: warnings,
    errors: errors
  };
  const snapshotHash = qltdShadowCocLeuSha256_(qltdShadowCocLeuCanonicalJson_(hashPayload));
  const completedAt = new Date();
  items.forEach(function(item) {
    item.snapshotHash = snapshotHash;
    item.createdAt = startedAt;
    item.updatedAt = completedAt;
  });
  dependencies.forEach(function(dependency) {
    dependency.snapshotHash = snapshotHash;
  });

  return {
    spreadsheetId: QLTD_SHADOW_COCLEU_CONFIG.SPREADSHEET_ID,
    sheetName: QLTD_SHADOW_COCLEU_CONFIG.SHEET_NAME,
    projectId: QLTD_SHADOW_COCLEU_CONFIG.PROJECT_ID,
    projectCode: QLTD_SHADOW_COCLEU_CONFIG.PROJECT_CODE,
    snapshotHash: snapshotHash,
    taskCount: items.length,
    dependencyCount: dependencies.length,
    warningCount: warnings.length,
    errorCount: errors.length,
    warnings: warnings,
    errors: errors,
    startedAt: startedAt,
    completedAt: completedAt,
    actorEmail: actorEmail,
    requestId: requestId,
    items: items,
    dependencies: dependencies
  };
}

function qltdShadowCocLeuBuildItems_(tasks, parentByWbs, warnings, errors) {
  const out = [];
  const taskCodes = {};
  const wbsCodes = {};
  tasks.forEach(function(task) {
    const taskCode = qltdShadowCocLeuTaskCode_(task);
    const wbs = String(task.wbs || '').trim();
    if (!taskCode) {
      errors.push({ type: 'TASK_CODE_MISSING', sourceRow: task.rawRowNumber || '' });
      return;
    }
    if (taskCodes[taskCode]) errors.push({ type: 'DUPLICATE_TASK_CODE', taskCode: taskCode, sourceRow: task.rawRowNumber || '' });
    taskCodes[taskCode] = true;
    if (wbs) {
      if (wbsCodes[wbs]) errors.push({ type: 'DUPLICATE_WBS', wbs: wbs, sourceRow: task.rawRowNumber || '' });
      wbsCodes[wbs] = true;
    }
    if (!task.start_date || !task.end_date || !task.duration) {
      warnings.push({ type: 'TASK_MISSING_SCHEDULE', taskCode: taskCode, sourceRow: task.rawRowNumber || '' });
    }
    out.push({
      tenantId: QLTD_SHADOW_COCLEU_CONFIG.TENANT_ID,
      projectId: QLTD_SHADOW_COCLEU_CONFIG.PROJECT_ID,
      projectCode: QLTD_SHADOW_COCLEU_CONFIG.PROJECT_CODE,
      spreadsheetId: QLTD_SHADOW_COCLEU_CONFIG.SPREADSHEET_ID,
      sheetName: QLTD_SHADOW_COCLEU_CONFIG.SHEET_NAME,
      taskCode: taskCode,
      legacyTaskId: String(task.id || '').trim(),
      wbs: wbs,
      wbsLevel: Number(task.wbsLevel || 0),
      parentTaskCode: qltdShadowCocLeuParentTaskCode_(task, parentByWbs),
      taskName: String(task.text || '').trim(),
      ownerDept: String(task.owner || '').trim(),
      duration: Number(task.duration || 0),
      predecessorRaw: String(task.predecessorRaw || '').trim(),
      plannedStart: String(task.baselineStart || task.start_date || '').trim(),
      plannedFinish: String(task.baselineEnd || task.end_date || '').trim(),
      actualStart: String(task.actualStart || '').trim(),
      actualFinish: String(task.actualFinish || task.actualEnd || '').trim(),
      sourceStatus: String(task.raw && (task.raw['Trạng thái'] || task.raw['Trang_thai'] || task.raw.Status) || task.status || '').trim(),
      normalizedStatus: qltdShadowCocLeuNormalizeStatus_(task.status, task.progress),
      note: String(task.note || task.updateNote || '').trim(),
      sourceRow: Number(task.rawRowNumber || 0),
      sourceHash: qltdShadowCocLeuSha256_(qltdShadowCocLeuCanonicalJson_(task.raw || {})),
      version: QLTD_SHADOW_COCLEU_CONFIG.VERSION,
      shadowMode: true,
      syncStatus: 'SHADOW_SYNCED'
    });
  });
  return out;
}

function qltdShadowCocLeuBuildDependencies_(tasks, warnings, errors) {
  const links = qltdGanttBuildLinks_(tasks, warnings);
  const taskCodeByLegacyId = {};
  tasks.forEach(function(task) {
    taskCodeByLegacyId[String(task.id || '').trim()] = qltdShadowCocLeuTaskCode_(task);
  });
  const seen = {};
  const out = [];
  links.forEach(function(link) {
    const predecessorTaskCode = taskCodeByLegacyId[String(link.source || '').trim()];
    const successorTaskCode = taskCodeByLegacyId[String(link.target || '').trim()];
    const relationType = String(link.relation || 'FS').toUpperCase();
    const lag = Number(link.lag || 0);
    if (!predecessorTaskCode || !successorTaskCode) {
      errors.push({ type: 'DEPENDENCY_TASK_NOT_FOUND', rawValue: link.raw || '', predecessor: link.source || '', successor: link.target || '' });
      return;
    }
    if (predecessorTaskCode === successorTaskCode) {
      errors.push({ type: 'SELF_DEPENDENCY', taskCode: successorTaskCode, rawValue: link.raw || '' });
      return;
    }
    const dependencyId = qltdShadowCocLeuDependencyId_(predecessorTaskCode, successorTaskCode, relationType, lag);
    if (seen[dependencyId]) return;
    seen[dependencyId] = true;
    out.push({
      dependencyId: dependencyId,
      projectId: QLTD_SHADOW_COCLEU_CONFIG.PROJECT_ID,
      predecessorTaskCode: predecessorTaskCode,
      successorTaskCode: successorTaskCode,
      relationType: relationType,
      lag: lag,
      rawValue: String(link.raw || '').trim(),
      snapshotHash: '',
      shadowMode: true
    });
  });
  return out;
}

function qltdShadowCocLeuBuildParentByWbs_(tasks) {
  const taskCodeByWbs = {};
  tasks.forEach(function(task) {
    const wbs = String(task.wbs || '').trim();
    if (wbs) taskCodeByWbs[wbs] = qltdShadowCocLeuTaskCode_(task);
  });
  return taskCodeByWbs;
}

function qltdShadowCocLeuParentTaskCode_(task, parentByWbs) {
  const parentWbs = qltdGanttGetParentWbs_(task.wbs);
  return parentWbs && parentByWbs[parentWbs] ? parentByWbs[parentWbs] : '';
}

function qltdShadowCocLeuValidateCycles_(dependencies, errors) {
  const graph = {};
  dependencies.forEach(function(dep) {
    const from = dep.predecessorTaskCode;
    const to = dep.successorTaskCode;
    if (!graph[from]) graph[from] = [];
    graph[from].push(to);
  });
  const visiting = {};
  const visited = {};
  function walk(node, stack) {
    if (visiting[node]) {
      errors.push({ type: 'DEPENDENCY_CYCLE', path: stack.concat([node]).join(' > ') });
      return;
    }
    if (visited[node]) return;
    visiting[node] = true;
    (graph[node] || []).forEach(function(next) { walk(next, stack.concat([node])); });
    delete visiting[node];
    visited[node] = true;
  }
  Object.keys(graph).forEach(function(node) { walk(node, []); });
}

function qltdShadowCocLeuReconcileSnapshot_(snapshot) {
  const counts = qltdShadowCocLeuReconcileCounts_(snapshot);
  const itemDocs = qltdShadowFirestoreListCollection_(qltdShadowCocLeuProjectRootPath_(), 'items')
    .filter(function(doc) { return doc.snapshotHash === snapshot.snapshotHash; });
  const dependencyDocs = qltdShadowFirestoreListCollection_(qltdShadowCocLeuProjectRootPath_(), 'dependencies')
    .filter(function(doc) { return doc.snapshotHash === snapshot.snapshotHash; });
  const sourceHashesMatch = snapshot.items.every(function(item) {
    const doc = itemDocs.find(function(candidate) { return candidate.taskCode === item.taskCode; });
    return doc && doc.sourceHash === item.sourceHash;
  });
  return Object.assign({}, counts, {
    ok: counts.ok && itemDocs.length === snapshot.taskCount && dependencyDocs.length === snapshot.dependencyCount && sourceHashesMatch,
    readTaskCount: itemDocs.length,
    readDependencyCount: dependencyDocs.length,
    sourceHashesMatch: sourceHashesMatch,
    checkedAt: new Date()
  });
}

function qltdShadowCocLeuReconcileCounts_(snapshotDoc) {
  const expectedTaskCount = Number(snapshotDoc.taskCount || 0);
  const expectedDependencyCount = Number(snapshotDoc.dependencyCount || 0);
  const snapshotHash = String(snapshotDoc.snapshotHash || '').trim();
  const itemDocs = qltdShadowFirestoreListCollection_(qltdShadowCocLeuProjectRootPath_(), 'items')
    .filter(function(doc) { return doc.snapshotHash === snapshotHash; });
  const dependencyDocs = qltdShadowFirestoreListCollection_(qltdShadowCocLeuProjectRootPath_(), 'dependencies')
    .filter(function(doc) { return doc.snapshotHash === snapshotHash; });
  return {
    ok: itemDocs.length === expectedTaskCount && dependencyDocs.length === expectedDependencyCount,
    expectedTaskCount: expectedTaskCount,
    actualTaskCount: itemDocs.length,
    expectedDependencyCount: expectedDependencyCount,
    actualDependencyCount: dependencyDocs.length,
    taskCountMatches: itemDocs.length === expectedTaskCount,
    dependencyCountMatches: dependencyDocs.length === expectedDependencyCount,
    snapshotHash: snapshotHash,
    checkedAt: new Date()
  };
}

function qltdShadowCocLeuBuildSnapshotDoc_(snapshot, status, reconciliation) {
  return {
    spreadsheetId: snapshot.spreadsheetId,
    sheetName: snapshot.sheetName,
    projectId: snapshot.projectId,
    projectCode: snapshot.projectCode,
    snapshotHash: snapshot.snapshotHash,
    taskCount: snapshot.taskCount,
    dependencyCount: snapshot.dependencyCount,
    warningCount: snapshot.warningCount,
    errorCount: snapshot.errorCount,
    warnings: snapshot.warnings,
    errors: snapshot.errors,
    startedAt: snapshot.startedAt,
    completedAt: new Date(),
    actorEmail: snapshot.actorEmail,
    requestId: snapshot.requestId,
    status: status,
    shadowMode: true,
    source: QLTD_SHADOW_COCLEU_SOURCE,
    reconciliationResult: reconciliation || {}
  };
}

function qltdShadowCocLeuDocument_(path, data) {
  return {
    name: qltdShadowFirestoreDocumentName_(path),
    fields: qltdShadowFirestoreEncodeFields_(data || {})
  };
}

function qltdShadowCocLeuDocPath_(collectionId, documentId) {
  return qltdShadowCocLeuProjectRootPath_() + '/' + collectionId + '/' + qltdShadowCocLeuSafeDocId_(documentId);
}

function qltdShadowCocLeuProjectRootPath_() {
  return 'tenants/' + QLTD_SHADOW_COCLEU_CONFIG.TENANT_ID + '/projects/' + QLTD_SHADOW_COCLEU_CONFIG.PROJECT_ID;
}

function qltdShadowCocLeuTaskCode_(task) {
  return String(task.code || task.id || '').trim();
}

function qltdShadowCocLeuDependencyId_(predecessorTaskCode, successorTaskCode, relationType, lag) {
  const raw = [predecessorTaskCode, successorTaskCode, relationType, String(lag || 0)].join('__');
  const safe = qltdShadowCocLeuSafeDocId_(raw);
  return safe.length <= 120 ? safe : 'dep_' + qltdShadowCocLeuSha256_(raw).slice(0, 32);
}

function qltdShadowCocLeuSafeDocId_(value) {
  return String(value || '')
    .trim()
    .replace(/[\/\\?#\[\]*]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.{1,2}$/, '_')
    .slice(0, 300) || 'empty';
}

function qltdShadowCocLeuNormalizeStatus_(status, progress) {
  const normalized = qltdGanttNormalizeKey_(status);
  if (normalized.indexOf('hoanthanh') >= 0 || normalized.indexOf('done') >= 0 || normalized.indexOf('complete') >= 0 || Number(progress || 0) >= 1) return 'COMPLETED';
  if (normalized.indexOf('tamdung') >= 0 || normalized.indexOf('paused') >= 0) return 'PAUSED';
  if (normalized.indexOf('dang') >= 0 || normalized.indexOf('progress') >= 0 || Number(progress || 0) > 0) return 'IN_PROGRESS';
  if (normalized.indexOf('chuabatdau') >= 0 || normalized.indexOf('notstarted') >= 0) return 'NOT_STARTED';
  return 'UNKNOWN';
}

function qltdShadowCocLeuRequestId_(payload) {
  const provided = String(payload && payload.requestId || '').trim();
  if (provided) return qltdShadowCocLeuSafeDocId_(provided);
  return 'shadow_cocleu_' + Utilities.getUuid();
}

function qltdShadowCocLeuResponse_(action, success, data, meta) {
  return {
    success: !!success,
    action: action,
    data: data || {},
    requestId: data && data.requestId || meta && meta.requestId || '',
    snapshotHash: data && data.snapshotHash || '',
    taskCount: Number(data && data.taskCount || 0),
    dependencyCount: Number(data && data.dependencyCount || 0),
    warningCount: Number(data && data.warningCount || 0),
    errorCount: Number(data && data.errorCount || 0),
    status: data && data.status || '',
    reconciliationResult: data && data.reconciliationResult || {},
    apiStatus: 'CONNECTED',
    source: QLTD_SHADOW_COCLEU_SOURCE,
    meta: meta || {}
  };
}

function qltdShadowCocLeuError_(action, code, message, meta) {
  return {
    success: false,
    action: action,
    message: code,
    errorCode: code,
    errorMessage: message,
    apiStatus: 'CONNECTED',
    source: QLTD_SHADOW_COCLEU_SOURCE,
    meta: meta || {}
  };
}

function qltdShadowCocLeuSafeError_(error) {
  return String(error && error.message || error || 'UNKNOWN_ERROR');
}

function qltdShadowCocLeuSha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return bytes.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function qltdShadowCocLeuCanonicalJson_(value) {
  if (value === null || value === undefined) return 'null';
  if (Object.prototype.toString.call(value) === '[object Date]') return JSON.stringify(qltdGanttToIsoDate_(value));
  if (Array.isArray(value)) return '[' + value.map(qltdShadowCocLeuCanonicalJson_).join(',') + ']';
  if (typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function(key) {
      return JSON.stringify(key) + ':' + qltdShadowCocLeuCanonicalJson_(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function qltdShadowFirestoreBaseUrl_() {
  return 'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(QLTD_SHADOW_COCLEU_CONFIG.FIREBASE_PROJECT_ID) +
    '/databases/(default)/documents';
}

function qltdShadowFirestoreDocumentName_(path) {
  return 'projects/' + QLTD_SHADOW_COCLEU_CONFIG.FIREBASE_PROJECT_ID +
    '/databases/(default)/documents/' + qltdShadowFirestoreEncodePath_(path);
}

function qltdShadowFirestoreEncodePath_(path) {
  return String(path || '').split('/').map(function(part) {
    return encodeURIComponent(part);
  }).join('/');
}

function qltdShadowFirestoreFetch_(url, options) {
  const headers = Object.assign({
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
  }, options && options.headers || {});
  const response = UrlFetchApp.fetch(url, Object.assign({}, options || {}, {
    headers: headers,
    muteHttpExceptions: true
  }));
  const status = response.getResponseCode();
  const text = response.getContentText() || '{}';
  const data = JSON.parse(text);
  if (status < 200 || status >= 300) {
    const message = data && data.error && data.error.message ? data.error.message : text;
    const error = new Error('FIRESTORE_REST_' + status + ': ' + message);
    error.status = status;
    throw error;
  }
  return data;
}

function qltdShadowFirestoreGetDocument_(path) {
  const url = qltdShadowFirestoreBaseUrl_() + '/' + qltdShadowFirestoreEncodePath_(path);
  try {
    return qltdShadowFirestoreDecodeDocument_(qltdShadowFirestoreFetch_(url, { method: 'get' }));
  } catch (error) {
    if (Number(error.status || 0) === 404) return null;
    throw error;
  }
}

function qltdShadowFirestoreListCollection_(parentPath, collectionId) {
  const docs = [];
  let pageToken = '';
  do {
    let url = qltdShadowFirestoreBaseUrl_() + '/' +
      qltdShadowFirestoreEncodePath_(parentPath) + '/' +
      encodeURIComponent(collectionId) + '?pageSize=300';
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
    const data = qltdShadowFirestoreFetch_(url, { method: 'get' });
    (data.documents || []).forEach(function(doc) {
      docs.push(qltdShadowFirestoreDecodeDocument_(doc));
    });
    pageToken = String(data.nextPageToken || '');
  } while (pageToken);
  return docs;
}

function qltdShadowFirestoreCommit_(documents) {
  const chunks = [];
  const batchSize = QLTD_SHADOW_COCLEU_CONFIG.BATCH_SIZE;
  for (let index = 0; index < documents.length; index += batchSize) {
    chunks.push(documents.slice(index, index + batchSize));
  }
  chunks.forEach(function(chunk) {
    if (!chunk.length) return;
    qltdShadowFirestoreFetch_(qltdShadowFirestoreBaseUrl_() + ':commit', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        writes: chunk.map(function(document) {
          return { update: document };
        })
      })
    });
  });
}

function qltdShadowFirestoreEncodeFields_(object) {
  const fields = {};
  Object.keys(object || {}).forEach(function(key) {
    fields[key] = qltdShadowFirestoreEncodeValue_(object[key]);
  });
  return fields;
}

function qltdShadowFirestoreEncodeValue_(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Object.prototype.toString.call(value) === '[object Date]') return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(qltdShadowFirestoreEncodeValue_) } };
  }
  if (typeof value === 'object') return { mapValue: { fields: qltdShadowFirestoreEncodeFields_(value) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Math.floor(value) === value) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function qltdShadowFirestoreDecodeDocument_(document) {
  const out = { _name: document && document.name || '' };
  const fields = document && document.fields || {};
  Object.keys(fields).forEach(function(key) {
    out[key] = qltdShadowFirestoreDecodeValue_(fields[key]);
  });
  return out;
}

function qltdShadowFirestoreDecodeValue_(field) {
  if (!field || Object.prototype.hasOwnProperty.call(field, 'nullValue')) return null;
  if (Object.prototype.hasOwnProperty.call(field, 'stringValue')) return field.stringValue;
  if (Object.prototype.hasOwnProperty.call(field, 'integerValue')) return Number(field.integerValue);
  if (Object.prototype.hasOwnProperty.call(field, 'doubleValue')) return Number(field.doubleValue);
  if (Object.prototype.hasOwnProperty.call(field, 'booleanValue')) return !!field.booleanValue;
  if (Object.prototype.hasOwnProperty.call(field, 'timestampValue')) return field.timestampValue;
  if (field.arrayValue) return (field.arrayValue.values || []).map(qltdShadowFirestoreDecodeValue_);
  if (field.mapValue) {
    const object = {};
    const fields = field.mapValue.fields || {};
    Object.keys(fields).forEach(function(key) {
      object[key] = qltdShadowFirestoreDecodeValue_(fields[key]);
    });
    return object;
  }
  return '';
}
