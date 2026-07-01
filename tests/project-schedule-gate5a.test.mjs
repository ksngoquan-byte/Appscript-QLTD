import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const dirtySource = fs.readFileSync(new URL('../apps-script-dev-api/03_schedule_dirty_flags_v1.js', import.meta.url), 'utf8');
const serviceSource = fs.readFileSync(new URL('../apps-script-dev-api/70_Project_Schedule_Service.js', import.meta.url), 'utf8');
const engineSource = fs.readFileSync(new URL('../apps-script-dev-api/04_schedule_engine_v1.js', import.meta.url), 'utf8');
const approvalSource = fs.readFileSync(new URL('../apps-script-dev-api/66_Weekly_Task_Update_Service.js', import.meta.url), 'utf8');

function createPropertyStore(seed) {
  const values = seed || new Map();
  return {
    values,
    api: {
      getProperty: (key) => values.has(key) ? values.get(key) : null,
      setProperty(key, value) {
        values.set(key, String(value));
        return this;
      },
      deleteProperty(key) {
        values.delete(key);
        return this;
      }
    }
  };
}

function createRuntime(options = {}, sharedStore) {
  const propertyStore = createPropertyStore(sharedStore);
  const calls = {
    openById: 0,
    lock: 0,
    release: 0,
    engine: 0,
    cache: 0,
    spreadsheet: null
  };
  const spreadsheet = { id: options.masterSpreadsheetId || 'MASTER-1' };
  const project = options.project === null ? null : {
    projectCode: 'P1',
    masterSpreadsheetId: options.missingMaster ? '' : (options.masterSpreadsheetId || 'MASTER-1')
  };
  const context = {
    console,
    Logger: { log: () => {} },
    Session: { getActiveUser: () => ({ getEmail: () => '' }) },
    Utilities: { formatDate: () => '' },
    PropertiesService: {
      getScriptProperties: () => propertyStore.api,
      getDocumentProperties: () => propertyStore.api
    },
    qltdProjectsNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
    qltdFirebaseResolveIdentity_: () => options.identityError
      ? { success: false, errorCode: 'ID_TOKEN_INVALID' }
      : { success: true, email: options.email || 'admin@example.com' },
    qltdWorkAuthUser_: () => ({
      email: options.email || 'admin@example.com',
      user: { email: options.email || 'admin@example.com', role: options.role || 'ADMIN', status: 'ACTIVE' },
      error: null
    }),
    qltdProjectsGetByCode_: () => project,
    SpreadsheetApp: {
      openById(id) {
        calls.openById += 1;
        if (options.openError) throw new Error('sensitive open stack');
        assert.equal(id, project.masterSpreadsheetId);
        calls.spreadsheet = spreadsheet;
        return spreadsheet;
      }
    },
    LockService: {
      getScriptLock() {
        calls.lock += 1;
        return {
          tryLock: () => options.lockTimeout !== true,
          releaseLock: () => { calls.release += 1; }
        };
      }
    },
    chayScheduleEngineV1NoLockForSpreadsheet_(receivedSpreadsheet) {
      calls.engine += 1;
      assert.equal(receivedSpreadsheet, spreadsheet);
      if (options.engineThrow) throw new Error('sensitive engine stack');
      if (options.engineFail) return { ok: false };
      return {
        ok: true,
        changedDurationCount: 1,
        changedStartCount: 2,
        changedFinishCount: 3,
        changedErrorCount: 4,
        processedTaskCount: 5,
        durationMs: 6
      };
    },
    qltdGanttInvalidateCache_() {
      calls.cache += 1;
      return options.cacheFail
        ? { success: false, code: 'GANTT_CACHE_INVALIDATE_FAILED' }
        : { success: true };
    }
  };
  vm.createContext(context);
  vm.runInContext(`${dirtySource}\n${serviceSource}\nthis.gate5a = {
    recalculate: qltdProjectScheduleRecalculate_,
    getState: qltdProjectScheduleGetStateApi_,
    markDirty: qltdScheduleMarkProjectDirty_,
    markClean: qltdScheduleMarkProjectClean_,
    readState: qltdScheduleGetProjectState_
  };`, context);
  return { api: context.gate5a, calls, store: propertyStore.values };
}

// 1, 11, 12, 15, 19: Admin success, one lock, passed spreadsheet, CLEAN and summary.
let runtime = createRuntime();
runtime.api.markDirty('P1', 'TEST', 'admin@example.com', {});
let result = runtime.api.recalculate({ projectCode: 'P1', idToken: 'token' });
assert.equal(result.ok, true);
assert.equal(result.scheduleState, 'CLEAN');
assert.deepEqual(
  [
    result.changedDurationCount,
    result.changedStartCount,
    result.changedFinishCount,
    result.changedErrorCount,
    result.processedTaskCount,
    result.durationMs
  ],
  [1, 2, 3, 4, 5, 6]
);
assert.equal(runtime.calls.lock, 1);
assert.equal(runtime.calls.engine, 1);
assert.equal(runtime.calls.cache, 1);
assert.equal(runtime.calls.release, 1);

// 2. Non-Admin is forbidden.
runtime = createRuntime({ role: 'EDITOR' });
result = runtime.api.recalculate({ projectCode: 'P1', idToken: 'token' });
assert.equal(result.errorCode, 'FORBIDDEN');
assert.equal(result.stage, 'AUTHORIZATION');

// 3. Empty projectCode.
runtime = createRuntime();
result = runtime.api.recalculate({ projectCode: '', idToken: 'token' });
assert.equal(result.errorCode, 'PROJECT_CODE_REQUIRED');
assert.equal(result.stage, 'VALIDATION');

// 4. Project not found.
runtime = createRuntime({ project: null });
result = runtime.api.recalculate({ projectCode: 'P1', idToken: 'token' });
assert.equal(result.errorCode, 'PROJECT_NOT_FOUND');

// 5. Master ID missing.
runtime = createRuntime({ missingMaster: true });
result = runtime.api.recalculate({ projectCode: 'P1', idToken: 'token' });
assert.equal(result.errorCode, 'MASTER_NOT_CONFIGURED');

// 6. Master open failure.
runtime = createRuntime({ openError: true });
result = runtime.api.recalculate({ projectCode: 'P1', idToken: 'token' });
assert.equal(result.errorCode, 'MASTER_OPEN_FAILED');
assert.doesNotMatch(JSON.stringify(result), /sensitive open stack/);

function expectDirtyAfterFailure(options, errorCode) {
  const current = createRuntime(options);
  current.api.markDirty('P1', 'BEFORE_RECALC', 'admin@example.com', {});
  const failed = current.api.recalculate({ projectCode: 'P1', idToken: 'token' });
  assert.equal(failed.errorCode, errorCode);
  assert.equal(current.api.readState('P1').scheduleState, 'DIRTY');
  return current;
}

// 7. Lock timeout keeps DIRTY.
runtime = expectDirtyAfterFailure({ lockTimeout: true }, 'SCHEDULE_LOCK_TIMEOUT');
assert.equal(runtime.calls.engine, 0);

// 8. Engine throw keeps DIRTY and does not leak stack.
runtime = expectDirtyAfterFailure({ engineThrow: true }, 'SCHEDULE_ENGINE_EXCEPTION');
result = runtime.api.recalculate({ projectCode: 'P1', idToken: 'token' });
assert.doesNotMatch(JSON.stringify(result), /sensitive engine stack/);

// 9. Engine ok=false keeps DIRTY.
expectDirtyAfterFailure({ engineFail: true }, 'SCHEDULE_ENGINE_FAILED');

// 10. Cache failure prevents CLEAN.
runtime = expectDirtyAfterFailure({ cacheFail: true }, 'GANTT_CACHE_INVALIDATE_FAILED');
assert.equal(runtime.calls.cache, 1);

// 13, 14. Service calls NoLock core and never uses Active Spreadsheet/public wrapper.
assert.match(serviceSource, /chayScheduleEngineV1NoLockForSpreadsheet_\(spreadsheet/);
assert.doesNotMatch(serviceSource, /chayScheduleEngineV1\(/);
assert.doesNotMatch(serviceSource, /getActive(?:Spreadsheet)?\(/);
assert.equal((serviceSource.match(/LockService\.getScriptLock\(\)/g) || []).length, 1);

// 16, 17. Gate 3 write boundary remains J/L/M/Q and no R:S:T:U:V:W writes.
const writeFunction = engineSource.match(
  /function ghiKetQuaScheduleV1_[\s\S]*?function ghiCotTheoCumNeuKhacScheduleV1_/
)[0];
const writeColumns = Array.from(
  writeFunction.matchAll(/ghiCotTheoCumNeuKhacScheduleV1_\(sheet,\s*cfg\.COL\.([A-Z_]+)/g),
  (match) => match[1]
);
assert.deepEqual(writeColumns, ['DURATION', 'START', 'END', 'ERROR']);

// 18. Approval marks persistent DIRTY and does not run Schedule Engine.
const approvalApply = approvalSource.match(
  /function qltdWeeklyMasterApprovalApplyToMaster_[\s\S]*?function qltdWeeklyMasterParseCongViec_/
)[0];
assert.match(approvalApply, /qltdScheduleMarkProjectDirty_/);
assert.doesNotMatch(approvalApply, /chayScheduleEngineV1/);

// 21, 22. DIRTY/CLEAN survive a new runtime sharing ScriptProperties.
runtime = createRuntime();
runtime.api.markDirty('P1', 'APPROVED', 'admin@example.com', {});
let reloaded = createRuntime({}, runtime.store);
assert.equal(reloaded.api.readState('P1').scheduleState, 'DIRTY');
reloaded.api.markClean('P1', 'admin@example.com', {});
reloaded = createRuntime({}, runtime.store);
assert.equal(reloaded.api.readState('P1').scheduleState, 'CLEAN');

// 23, 24, 25. State is isolated by projectCode.
runtime = createRuntime();
runtime.api.markDirty('P1', 'APPROVED', 'admin@example.com', {});
runtime.api.markClean('P2', 'admin@example.com', {});
assert.equal(runtime.api.readState('P1').scheduleState, 'DIRTY');
assert.equal(runtime.api.readState('P2').scheduleState, 'CLEAN');
runtime.api.markClean('P1', 'admin@example.com', {});
assert.equal(runtime.api.readState('P2').scheduleState, 'CLEAN');

console.log('Project Schedule Gate 5A backend: PASS');
