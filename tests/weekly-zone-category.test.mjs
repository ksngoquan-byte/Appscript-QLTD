import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ganttSource = fs.readFileSync(new URL('../apps-script-dev-api/35_GANTT_DATA_SERVICE.js', import.meta.url), 'utf8');
const weeklySource = fs.readFileSync(new URL('../apps-script-dev-api/66_Weekly_Task_Update_Service.js', import.meta.url), 'utf8');

const ganttContext = vm.createContext({
  Utilities: { formatDate: () => '2026-07-06' },
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' }
});
vm.runInContext(ganttSource, ganttContext);

const headers = ['UID', 'WBS', 'ZONE', 'OWNER', 'STATUS', 'HANG_MUC', 'PARENT', 'TEN_CONG_VIEC'];
const headerIndex = ganttContext.qltdGanttBuildHeaderIndex_(headers);
const row = ['UID-1', '1.2', 'Zone 1', 'KinhDoanh', '', 'LK02', '0', 'Thi cong mong'];
assert.equal(ganttContext.qltdGanttCell_(row, headerIndex, 'zone'), 'Zone 1');
assert.equal(ganttContext.qltdGanttCell_(row, headerIndex, 'hangMuc'), 'LK02');
assert.equal(ganttContext.qltdGanttCell_(row, headerIndex, 'text'), 'Thi cong mong');
assert.notEqual(
  ganttContext.qltdGanttFindAliasIndex_(headerIndex, 'text'),
  ganttContext.qltdGanttFindAliasIndex_(headerIndex, 'hangMuc')
);
const builtTasks = ganttContext.qltdGanttBuildTasks_(
  [headers, row],
  { rowIndex: 0, headerIndex },
  [],
  'Cong_viec'
);
assert.equal(builtTasks.length, 1);
assert.equal(builtTasks[0].id, 'UID-1');
assert.equal(builtTasks[0].text, 'Thi cong mong');
assert.equal(builtTasks[0].congViecZone, 'Zone 1');
assert.equal(builtTasks[0].congViecHangMuc, 'LK02');

const weeklyContext = vm.createContext({
  qltdBudgetFormatDate_: (value) => String(value || '').slice(0, 10),
  qltdWeeklyTaskUpdatesIsOfficialComplete_: () => false,
  qltdWeeklyTaskUpdatesResolveCashFlowType_: () => ''
});
vm.runInContext(weeklySource, weeklyContext);

const official = {
  id: 'UID-1',
  code: 'CV-1',
  wbs: '1.2',
  text: 'Thi cong mong',
  congViecZone: 'Zone 1',
  congViecHangMuc: 'LK02',
  zone: 'Inherited Zone',
  hangMuc: 'Inherited category',
  baselineStart: '2026-07-01',
  baselineEnd: '2026-07-31',
  percent: 25
};
const dto = weeklyContext.qltdWeeklyTaskUpdatesBuildOfficialMasterDto_(official, {
  masterTaskCode: 'CV-1',
  taskName: 'Parent fallback',
  hangMuc: 'Parent category'
});
assert.equal(dto.zone, 'Zone 1');
assert.equal(dto.hangMuc, 'LK02');
assert.equal(dto.masterTaskCode, 'CV-1');
assert.equal(dto.wbs, '1.2');

const item = weeklyContext.qltdWeeklyTaskUpdatesBuildItem_(
  'MASTER',
  'CV-1',
  dto,
  '2026-07-01',
  '2026-07-31',
  'zone 1 lk02'
);
assert.equal(item.zone, 'Zone 1');
assert.equal(item.hangMuc, 'LK02');
assert.equal(item.itemId, 'CV-1');
assert.equal(item.masterTaskCode, 'CV-1');
assert.equal(item.wbs, '1.2');
assert.equal(item.eligible, true);

const blankCategory = weeklyContext.qltdWeeklyTaskUpdatesBuildOfficialMasterDto_(
  { ...official, congViecHangMuc: '' },
  { masterTaskCode: 'CV-1', hangMuc: 'Must not inherit' }
);
assert.equal(blankCategory.hangMuc, '');

assert.doesNotMatch(weeklySource, /hangMuc:\s*String\(official\.hangMuc/);
assert.doesNotMatch(ganttSource, /row\[5\]/);
assert.doesNotMatch(
  ganttSource.match(/text:\s*\[[^\]]+\]/)?.[0] || '',
  /hang_muc/
);

console.log('Weekly Cong_viec zone/category DTO tests: PASS');
