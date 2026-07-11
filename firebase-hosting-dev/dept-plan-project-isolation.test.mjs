import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const match = source.match(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.ok(match?.index !== undefined, `Missing function ${name}`);
  const start = match.index;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const enrichmentSource = [
  'let qltdGanttPayload = null;',
  extractFunction(appSource, 'normalizeTaskCode'),
  extractFunction(appSource, 'getDeptPlanProjectMasterKey'),
  extractFunction(appSource, 'getOfficialMasterMapFromGantt'),
  extractFunction(appSource, 'isOfficialMasterComplete'),
  extractFunction(appSource, 'enrichDeptPlanPayloadWithOfficialMasters')
].join('\n');

const enrichmentContext = vm.createContext({
  Map,
  Math,
  Number,
  String,
  normalizeWeeklyStatusKey: (value) => String(value || '').trim().toLowerCase()
});
vm.runInContext(`${enrichmentSource}\nthis.api = { enrichDeptPlanPayloadWithOfficialMasters, setGantt: (payload) => { qltdGanttPayload = payload; } };`, enrichmentContext);

function planPayload(projectCode, departments) {
  return { success: true, projectCode, departments };
}

function master(masterCode, taskName, officialWbs, planStart, planFinish) {
  return { masterCode, taskName, officialWbs, planStart, planFinish, progress: 0, status: 'Chưa bắt đầu' };
}

const cocLeuPlan = planPayload('24-1.ĐB', [
  { deptCode: 'Dauthau', masters: [master('CV-016', 'Đấu thầu Cốc Lếu', 'CL.DT.01', '2026-07-01', '2026-07-10')] },
  { deptCode: 'KinhDoanh', masters: [master('CV-017', 'Kinh doanh Cốc Lếu', 'CL.KD.01', '2026-07-02', '2026-07-11')] }
]);

enrichmentContext.api.setGantt({
  projectCode: '37-5.HL',
  data: [
    { code: 'CV-016', text: 'Kinh doanh Hưng Lộc', wbs: 'HL.KD.01', baselineStart: '2026-08-01', baselineEnd: '2026-08-10', percent: 80, status: 'Đang thực hiện' },
    { code: 'CV-017', text: 'Mục tiêu khác Hưng Lộc', wbs: 'HL.KD.02', baselineStart: '2026-08-02', baselineEnd: '2026-08-11', percent: 25, status: 'Đang thực hiện' }
  ]
});

let enriched = enrichmentContext.api.enrichDeptPlanPayloadWithOfficialMasters(cocLeuPlan);
assert.equal(enriched.departments[0].masters[0].taskName, 'Đấu thầu Cốc Lếu');
assert.equal(enriched.departments[0].masters[0].officialWbs, 'CL.DT.01');
assert.equal(enriched.departments[1].masters[0].taskName, 'Kinh doanh Cốc Lếu');
assert.equal(enriched.departments[1].masters[0].officialWbs, 'CL.KD.01');
assert.equal(enriched.departments[0].masters[0].officialSource, undefined);

enrichmentContext.api.setGantt({
  projectCode: '24-1.ĐB',
  data: [
    { projectCode: '37-5.HL', code: 'CV-016', text: 'Không được map chéo', wbs: 'HL.BAD', baselineStart: '2026-08-01', baselineEnd: '2026-08-10', percent: 99, status: 'Hoàn thành' },
    { projectCode: '24-1.ĐB', code: 'CV-016', text: 'Đấu thầu Cốc Lếu', wbs: 'CL.DT.01', baselineStart: '2026-07-01', baselineEnd: '2026-07-10', percent: 40, status: 'Đang thực hiện' },
    { projectCode: '24-1.ĐB', code: 'CV-017', text: 'Kinh doanh Cốc Lếu', wbs: 'CL.KD.01', baselineStart: '2026-07-02', baselineEnd: '2026-07-11', percent: 60, status: 'Đang thực hiện' }
  ]
});

enriched = enrichmentContext.api.enrichDeptPlanPayloadWithOfficialMasters(cocLeuPlan);
assert.equal(enriched.departments[0].masters[0].taskName, 'Đấu thầu Cốc Lếu');
assert.equal(enriched.departments[0].masters[0].officialWbs, 'CL.DT.01');
assert.equal(enriched.departments[0].masters[0].progress, 40);
assert.equal(enriched.departments[1].masters[0].taskName, 'Kinh doanh Cốc Lếu');
assert.equal(enriched.departments[1].masters[0].officialWbs, 'CL.KD.01');
assert.equal(enriched.departments[1].masters[0].progress, 60);

const hungLocPlan = planPayload('37-5.HL', [
  { deptCode: 'KinhDoanh', masters: [master('CV-016', 'Kinh doanh Hưng Lộc', 'HL.KD.01', '2026-08-01', '2026-08-10')] }
]);
enrichmentContext.api.setGantt({
  projectCode: '37-5.HL',
  data: [{ code: 'CV-016', text: 'Kinh doanh Hưng Lộc', wbs: 'HL.KD.01', baselineStart: '2026-08-01', baselineEnd: '2026-08-10', percent: 80, status: 'Đang thực hiện' }]
});
enriched = enrichmentContext.api.enrichDeptPlanPayloadWithOfficialMasters(hungLocPlan);
assert.equal(enriched.departments[0].masters[0].taskName, 'Kinh doanh Hưng Lộc');
assert.equal(enriched.departments[0].masters[0].officialWbs, 'HL.KD.01');
assert.equal(enriched.departments[0].masters[0].progress, 80);

const loaderSource = [
  'let qltdDeptPlanRequestSeq = 0;',
  extractFunction(appSource, 'loadDeptPlansForSelectedProject')
].join('\n');
const loadingElements = {
  deptPlanStatus: { textContent: '' },
  deptPlanContent: { innerHTML: '' },
  deptSelector: { disabled: false }
};
const loadResolvers = new Map();
const renderedPayloads = [];
const loaderContext = vm.createContext({
  document: { getElementById: (id) => loadingElements[id] || null },
  ensureDeptSelector() {},
  ensureDeptPlanPanel() {},
  resetDeptScopedClientState() {},
  fetchBackendJson: (_action, { projectCode }) => new Promise((resolve) => loadResolvers.set(projectCode, resolve)),
  renderDeptPlans: (payload) => renderedPayloads.push(payload),
  console: { error() {} }
});
vm.runInContext(`${loaderSource}\nthis.load = loadDeptPlansForSelectedProject;`, loaderContext);

const hungLocLoad = loaderContext.load('37-5.HL');
const cocLeuLoad = loaderContext.load('24-1.ĐB');
loadResolvers.get('24-1.ĐB')({ success: true, projectCode: '24-1.ĐB' });
await cocLeuLoad;
loadResolvers.get('37-5.HL')({ success: true, projectCode: '37-5.HL' });
await hungLocLoad;
assert.deepEqual(renderedPayloads, [{ success: true, projectCode: '24-1.ĐB' }]);

assert.match(
  appSource,
  /normalizeTaskCode\(qltdDeptPlanPayload\.projectCode\) !== normalizeTaskCode\(detail\.projectCode\)/,
  'PB_DETAIL event must not update the current project from a stale project event.'
);

console.log('Department plan project isolation and rapid-switch regression: PASS');
