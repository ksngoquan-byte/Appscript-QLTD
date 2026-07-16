import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const uiSource = fs.readFileSync(new URL('./pb-detail-ui.js', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../apps-script-dev-api/28_DEV_API.js', import.meta.url), 'utf8');
const serviceSource = fs.readFileSync(new URL('../apps-script-dev-api/64_PB_Detail_Task_Service.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const signatures = [`async function ${name}`, `function ${name}`];
  const start = signatures.map((signature) => source.indexOf(signature)).find((index) => index >= 0);
  assert.ok(start >= 0, `Missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(start, index + 1);
    try {
      new vm.Script(candidate);
      return candidate;
    } catch {
      // Continue until the function declaration is complete.
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const formValues = new Map([
  ['taskName', 'Chuẩn bị hồ sơ'],
  ['planStart', '2026-07-20'],
  ['planFinish', '2026-07-25'],
  ['owner', 'owner@example.com'],
  ['coordinator', ['one@example.com', 'two@example.com']],
  ['hasBudgetPlan', 'on'],
  ['budgetPlan', '1500000'],
  ['condition', 'Đủ đầu vào'],
  ['note', 'Ghi chú'],
  ['status', 'Đang làm'],
  ['progress', '25'],
  ['actualStart', '2026-07-21'],
  ['actualFinish', '']
]);
class FakeFormData {
  get(key) {
    const value = formValues.get(key);
    return Array.isArray(value) ? value[0] : value ?? null;
  }
  getAll(key) {
    const value = formValues.get(key);
    return Array.isArray(value) ? value.slice() : value === undefined ? [] : [value];
  }
}
const uiContext = vm.createContext({
  document: { getElementById: () => ({}) },
  FormData: FakeFormData,
  qltdPbDetailState: { masterTask: { planFinish: '2026-07-31' } },
  qltdPbDetailFormatDisplayDate: (value) => value
});
vm.runInContext(extractFunction(uiSource, 'qltdPbDetailReadFormPayload'), uiContext);
const createPayload = uiContext.qltdPbDetailReadFormPayload({
  email: 'user@example.com', projectCode: 'P1', deptCode: 'BQLDA', masterTaskCode: 'M1', delegatedProgress: false
}, false);
for (const field of ['status', 'progress', 'actualStart', 'actualFinish', 'budgetActual', 'weight']) {
  assert.equal(Object.prototype.hasOwnProperty.call(createPayload, field), false, `create payload must omit ${field}`);
}
assert.equal(createPayload.taskName, 'Chuẩn bị hồ sơ');
assert.equal(createPayload.budgetPlan, 1500000);

const delegatedPayload = uiContext.qltdPbDetailReadFormPayload({
  email: 'reporter@example.com', projectCode: 'P1', deptCode: 'BQLDA', delegatedProgress: true
}, true);
assert.deepEqual({ ...delegatedPayload }, {
  email: 'reporter@example.com',
  projectCode: 'P1',
  deptCode: 'BQLDA',
  status: 'Đang làm',
  progress: 25,
  actualStart: '2026-07-21',
  actualFinish: '',
  note: 'Ghi chú'
});

let createServicePayload = null;
let updateServicePayload = null;
let finalizedUpdatePayload = null;
const routeContext = vm.createContext({
  qltdBudgetParsePostJson_: (event) => ({ payload: { ...event.payload } }),
  qltdPerfStartRequest_() {},
  qltdDeptScopeAuthorizeWrite_: (payload) => {
    payload.deptName = 'Ban QLDA';
    payload._qltdPermissionSource = 'HOME_DEPT';
    return { allowed: true, permissionSource: 'HOME_DEPT' };
  },
  qltdWorkCreateDetailTask_: (payload) => {
    createServicePayload = { ...payload };
    return { success: true, data: { detailTaskId: 'DT-1' } };
  },
  qltdWorkUpdateDetailTask_: (payload) => {
    updateServicePayload = { ...payload };
    return { success: true, data: { detailTaskId: payload.detailTaskId } };
  },
  qltdDeptScopeFinalizeWrite_: (_scope, _action, payload, result) => {
    finalizedUpdatePayload = { ...payload };
    return result;
  },
  qltdDevApiJson_: (payload) => payload
});
vm.runInContext(extractFunction(apiSource, 'qltdDevApiHandlePost_'), routeContext);
const routeBase = { email: 'user@example.com', idToken: 'token', projectCode: 'P1', deptCode: 'BQLDA', deptName: 'Client value' };
assert.equal(routeContext.qltdDevApiHandlePost_({ payload: {
  ...routeBase, action: 'work_createdetailtask', masterTaskCode: 'M1', taskName: 'Tạo mới'
} }).success, true);
assert.equal(Object.prototype.hasOwnProperty.call(createServicePayload, 'deptName'), false);
assert.equal(createServicePayload.taskName, 'Tạo mới');

assert.equal(routeContext.qltdDevApiHandlePost_({ payload: {
  ...routeBase, action: 'work_updatedetailtask', detailTaskId: 'DT-1', status: 'Đang làm', progress: 35
} }).success, true);
assert.equal(Object.prototype.hasOwnProperty.call(updateServicePayload, 'deptName'), false);
assert.equal(Object.prototype.hasOwnProperty.call(finalizedUpdatePayload, 'deptName'), false);
assert.equal(updateServicePayload.status, 'Đang làm');
assert.equal(updateServicePayload.progress, 35);

const editableFieldsDeclaration = serviceSource.slice(
  serviceSource.indexOf('const QLTD_PB_DETAIL_EDITABLE_FIELDS'),
  serviceSource.indexOf('function qltdWorkGetDetailTasks_')
);
const serviceSourceDeclaration = serviceSource.match(/const QLTD_PB_DETAIL_TASK_SOURCE\s*=.*;/)?.[0] || '';
const allowlistContext = vm.createContext({
  qltdWorkError_: (_source, _action, code, message, _meta, _warnings, extra) => ({ code, message, extra })
});
vm.runInContext(`${serviceSourceDeclaration}\n${editableFieldsDeclaration}\n${extractFunction(serviceSource, 'qltdPbDetailValidateAllowedPayloadFields_')}`, allowlistContext);
const unknownFieldError = allowlistContext.qltdPbDetailValidateAllowedPayloadFields_({
  action: 'work_createdetailtask', projectCode: 'P1', deptCode: 'BQLDA', masterTaskCode: 'M1', taskName: 'Tạo mới', unexpectedField: true
}, 'work_createDetailTask', { meta: {} }, []);
assert.deepEqual(Array.from(unknownFieldError.extra.unknownFields), ['unexpectedField']);
const deptNameError = allowlistContext.qltdPbDetailValidateAllowedPayloadFields_({
  action: 'work_createdetailtask', projectCode: 'P1', deptCode: 'BQLDA', masterTaskCode: 'M1', taskName: 'Tạo mới', deptName: 'Ban QLDA'
}, 'work_createDetailTask', { meta: {} }, []);
assert.deepEqual(Array.from(deptNameError.extra.unknownFields), ['deptName']);

const serviceConstants = [
  /const QLTD_PB_DETAIL_LAST_COLUMN\s*=.*;/,
  /const QLTD_PB_DETAIL_DEFAULT_STATUS\s*=.*;/,
  /const QLTD_PB_DETAIL_ROW_TYPE_DETAIL\s*=.*;/
].map((pattern) => serviceSource.match(pattern)?.[0] || '').join('\n');
const createContext = vm.createContext({
  Utilities: { getUuid: () => '12345678-ABCD-EF01-2345-6789ABCDEF01' },
  qltdWorkNormalizeCode_: (value) => String(value || '').trim().toUpperCase(),
  qltdWorkWarning_: (code, message) => ({ code, message })
});
vm.runInContext([
  serviceConstants,
  extractFunction(serviceSource, 'qltdPbDetailApplyCreateDefaults_'),
  extractFunction(serviceSource, 'qltdPbDetailIdPart_'),
  extractFunction(serviceSource, 'qltdPbDetailGenerateId_'),
  extractFunction(serviceSource, 'qltdPbDetailBuildNextWbs_'),
  extractFunction(serviceSource, 'qltdPbDetailApplyUpdates_'),
  extractFunction(serviceSource, 'qltdPbDetailBuildCreateRow_')
].join('\n'), createContext);

const defaults = { taskName: 'Tạo mới' };
createContext.qltdPbDetailApplyCreateDefaults_(defaults);
assert.deepEqual({ ...defaults }, {
  taskName: 'Tạo mới', status: 'Chưa bắt đầu', progress: 0, weight: '', budgetPlan: '', budgetActual: ''
});
assert.equal(createContext.qltdPbDetailGenerateId_({}, 'P1', 'BQLDA'), 'DT-P1-BQLDA-12345678');
const block = {
  masterRow: { values: ['II.1'] },
  rows: [
    { rowType: 'PB_DETAIL', values: ['II.1.D01'] },
    { rowType: 'PB_DETAIL', values: ['II.1.D03'] }
  ]
};
assert.equal(createContext.qltdPbDetailBuildNextWbs_(block, []), 'II.1.D02');
const columns = {
  stt: 0, taskName: 1, planStart: 2, planFinish: 3, budgetPlan: 4, status: 5,
  actualStart: 6, actualFinish: 7, budgetActual: 8, owner: 9, coordinator: 10,
  condition: 11, note: 12, masterTaskCode: 13, rowType: 14, detailTaskId: 15,
  progress: 16, weight: 17
};
const row = createContext.qltdPbDetailBuildCreateRow_({ columns }, { updates: defaults }, 'M1', 'DT-P1-BQLDA-12345678', 'II.1.D02');
assert.equal(row[columns.stt], 'II.1.D02');
assert.equal(row[columns.masterTaskCode], 'M1');
assert.equal(row[columns.rowType], 'PB_DETAIL');
assert.equal(row[columns.detailTaskId], 'DT-P1-BQLDA-12345678');
assert.equal(row[columns.status], 'Chưa bắt đầu');
assert.equal(row[columns.progress], 0);
createContext.qltdPbDetailApplyUpdates_(row, columns, { status: 'Đang làm', progress: 40, actualStart: '2026-07-21' });
assert.equal(row[columns.status], 'Đang làm');
assert.equal(row[columns.progress], 40);
assert.equal(row[columns.actualStart], '2026-07-21');

console.log('PB_DETAIL create payload, route sanitization and defaults tests: PASS');
