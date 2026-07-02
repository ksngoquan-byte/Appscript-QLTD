import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rootEngineSource = fs.readFileSync(new URL('../04_schedule_engine_v1.js', import.meta.url), 'utf8');
const apiEngineSource = fs.readFileSync(new URL('../apps-script-dev-api/04_schedule_engine_v1.js', import.meta.url), 'utf8');
const rootCalendarSource = fs.readFileSync(new URL('../15_Lich_lam_viec.js', import.meta.url), 'utf8');
const apiCalendarSource = fs.readFileSync(new URL('../apps-script-dev-api/15_Lich_lam_viec.js', import.meta.url), 'utf8');

const normalizeSource = (source) => source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
assert.equal(normalizeSource(rootEngineSource), normalizeSource(apiEngineSource), 'Root/API Schedule Engine must stay identical.');
assert.equal(normalizeSource(rootCalendarSource), normalizeSource(apiCalendarSource), 'Root/API working-calendar helper must stay identical.');

const wrapperSource = rootEngineSource.match(/function chayScheduleEngineV1\(options\)[\s\S]*?function chayScheduleEngineV1NoLockForSpreadsheet_/)[0];
const coreSource = rootEngineSource.match(/function chayScheduleEngineV1NoLockForSpreadsheet_[\s\S]*?function taoLoiScheduleEngineV1_/)[0];
assert.match(wrapperSource, /SpreadsheetApp\.getActiveSpreadsheet\(\)/);
assert.match(wrapperSource, /chayCoKhoa_/);
assert.doesNotMatch(coreSource, /SpreadsheetApp\.getActive|getScriptLock|chayCoKhoa_/);

function date(day) {
  return new Date(2026, 0, day);
}

function taskRow(ref, duration, predecessor, plannedStart, plannedFinish, status, actualStart, actualFinish, adjustLink) {
  const row = new Array(23).fill('');
  row[1] = `WBS-${ref}`;
  row[6] = String(ref);
  row[7] = `Task ${ref}`;
  row[9] = duration;
  row[10] = predecessor || '';
  row[11] = plannedStart || '';
  row[12] = plannedFinish || '';
  row[17] = status || '';
  row[18] = actualStart || '';
  row[19] = actualFinish || '';
  row[22] = adjustLink ?? '';
  return row;
}

function buildBehaviorRows() {
  return [
    taskRow(1, 3, '', date(1), date(3), 'Hoàn thành', date(10), date(20), 'Có'),
    taskRow(2, 2, '1FS'),
    taskRow(3, 3, '', date(1), date(3), 'Hoàn thành', date(10), date(20), 'Không'),
    taskRow(4, 2, '3FS'),
    taskRow(5, 3, '', date(1), date(3), 'Hoàn thành', date(10), date(20), ''),
    taskRow(6, 2, '5FS'),
    taskRow(7, 3, '', date(1), date(3), 'Đang làm', date(10), date(20), 'Có'),
    taskRow(8, 2, '7FS'),
    taskRow(9, 3, '', date(1), date(3), 'Hoàn thành', date(10), date(20), 'YES'),
    taskRow(10, 2, '9FS'),
    taskRow(11, 3, '', date(1), date(3), 'Hoàn thành', date(10), '', 'Có'),
    taskRow(12, 2, '11FS'),
    taskRow(13, 3, '', date(1), date(3), 'Hoàn thành', date(10), date(20), 'Có'),
    taskRow(14, 2, '13SS'),
    taskRow(15, 3, '', date(1), date(3), 'Hoàn thành', date(10), date(20), ''),
    taskRow(16, 2, '15SS'),
    taskRow(17, 3, '', date(1), date(3), 'Hoàn thành', '', date(20), 'Có'),
    taskRow(18, 2, '17SS'),
    taskRow(19, 3, '', date(1), date(3), 'Hoàn thành', date(10), date(20), 'Có'),
    taskRow(20, 2, '19FF'),
    taskRow(21, 3, '', date(1), date(3), 'Hoàn thành', date(10), date(20), 'Không'),
    taskRow(22, 2, '21FF'),
    taskRow(23, 3, '', date(1), date(3), 'Hoàn thành', date(10), date(20), ''),
    taskRow(24, 2, '23FF'),
    taskRow(25, 3, '', date(1), date(3), 'Hoàn thành', date(10), '', 'Có'),
    taskRow(26, 2, '25FF'),
    taskRow(27, 2, '3FS+2'),
    taskRow(28, 2, '3FS-1'),
    taskRow(29, 2, '999FS')
  ];
}

function cloneRows(rows) {
  return rows.map((row) => row.map((value) => value instanceof Date ? new Date(value.getTime()) : value));
}

function createSpreadsheet(initialRows, holidayDates = []) {
  const rows = [[], [], [], [], ...cloneRows(initialRows)];
  const writes = [];
  const formats = [];

  function range(row, column, rowCount = 1, columnCount = 1) {
    return {
      getValues() {
        return Array.from({ length: rowCount }, (_, rowOffset) =>
          Array.from({ length: columnCount }, (_, columnOffset) =>
            rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? ''
          )
        );
      },
      setValues(values) {
        writes.push({ row, column, rowCount, columnCount });
        values.forEach((sourceRow, rowOffset) => {
          const target = rows[row - 1 + rowOffset] || [];
          sourceRow.forEach((value, columnOffset) => {
            target[column - 1 + columnOffset] = value;
          });
          rows[row - 1 + rowOffset] = target;
        });
        return this;
      },
      setNumberFormat(format) {
        formats.push({ row, column, rowCount, columnCount, format });
        return this;
      },
      getValue() {
        return rows[row - 1]?.[column - 1] ?? '';
      }
    };
  }

  const taskSheet = {
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(23, ...rows.map((row) => row.length)),
    getRange: range
  };
  const configSheet = {
    getDataRange: () => ({ getValues: () => [['NGAY_NEO_KE_HOACH', date(1)]] }),
    getRange: () => ({ getValue: () => date(1) })
  };
  const holidayRows = holidayDates.map((holiday) => [
    `${String(holiday.getDate()).padStart(2, '0')}/${String(holiday.getMonth() + 1).padStart(2, '0')}/${holiday.getFullYear()}`,
    '',
    '',
    'Dùng'
  ]);
  const holidaySheet = {
    getLastRow: () => holidayRows.length ? holidayRows.length + 4 : 0,
    getRange: (_row, _column, rowCount, columnCount) => ({
      getValues: () => Array.from({ length: rowCount }, (_, index) =>
        Array.from({ length: columnCount }, (_, columnIndex) => holidayRows[index]?.[columnIndex] ?? '')
      )
    })
  };
  const spreadsheet = {
    getSpreadsheetTimeZone: () => 'Asia/Ho_Chi_Minh',
    getSheetByName(name) {
      if (name === 'Cong_viec') return taskSheet;
      if (name === 'Cau_hinh') return configSheet;
      if (name === 'Ngay_nghi') return holidaySheet;
      return null;
    }
  };
  return { spreadsheet, rows, writes, formats };
}

function createRuntime(engineSource, calendarSource, activeSpreadsheet) {
  let activeCalls = 0;
  let lockCalls = 0;
  const context = {
    console,
    Logger: { log: () => {} },
    Utilities: {
      formatDate(value) {
        const d = new Date(value);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        activeCalls += 1;
        return activeSpreadsheet;
      },
      getActive() {
        activeCalls += 1;
        return activeSpreadsheet;
      }
    },
    chayCoKhoa_(fn) {
      lockCalls += 1;
      return fn();
    }
  };
  vm.createContext(context);
  vm.runInContext(`${calendarSource}\n${engineSource}\nthis.api = {
    wrapper: chayScheduleEngineV1,
    core: chayScheduleEngineV1NoLockForSpreadsheet_,
    shouldUseActual: scheduleShouldUseActualForDependency_,
    resolveAnchor: scheduleResolvePredecessorAnchor_
  };`, context);
  return {
    api: context.api,
    counts: () => ({ activeCalls, lockCalls }),
    resetCounts: () => { activeCalls = 0; lockCalls = 0; }
  };
}

function iso(value) {
  if (!(value instanceof Date) && Object.prototype.toString.call(value) !== '[object Date]') return String(value || '');
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function outputSnapshot(model) {
  return model.rows.slice(4).map((row) => ({
    duration: row[9],
    predecessor: row[10],
    start: iso(row[11]),
    finish: iso(row[12]),
    error: row[16],
    status: row[17],
    actualStart: iso(row[18]),
    actualFinish: iso(row[19]),
    adjustLink: row[22]
  }));
}

function runCore(engineSource, calendarSource, rows, holidays = []) {
  const model = createSpreadsheet(rows, holidays);
  const runtime = createRuntime(engineSource, calendarSource, model.spreadsheet);
  runtime.resetCounts();
  const summary = runtime.api.core(model.spreadsheet, { normalizeFormat: true });
  assert.deepEqual(runtime.counts(), { activeCalls: 0, lockCalls: 0 });
  assert.equal(summary.ok, true);
  assert.equal(summary.processedTaskCount, rows.length);
  for (const field of ['changedDurationCount', 'changedStartCount', 'changedFinishCount', 'changedErrorCount']) {
    assert.equal(typeof summary[field], 'number');
  }
  assert.ok(summary.durationMs >= 0);
  assert.ok(model.writes.length > 0);
  assert.ok(model.writes.every((write) => [10, 12, 13, 17].includes(write.column)), 'Engine may write only J/L/M/Q.');
  assert.ok(model.formats.every((format) => format.column === 12 && format.columnCount === 2));
  return { model, runtime, summary, snapshot: outputSnapshot(model) };
}

const fixture = buildBehaviorRows();
const rootRun = runCore(rootEngineSource, rootCalendarSource, fixture);
const apiRun = runCore(apiEngineSource, apiCalendarSource, fixture);
assert.throws(
  () => rootRun.runtime.api.core(null, {}),
  (error) => error && error.stage === 'VALIDATION'
);
assert.deepEqual(rootRun.snapshot, apiRun.snapshot);
assert.deepEqual(
  { ...rootRun.summary, durationMs: 0 },
  { ...apiRun.summary, durationMs: 0 }
);

const output = rootRun.snapshot;
assert.equal(output[1].start, '2026-01-21', 'FS complete + W Co uses T.');
assert.equal(output[3].start, '2026-01-04', 'FS W Khong uses M.');
assert.equal(output[5].start, '2026-01-04', 'FS blank W uses M.');
assert.equal(output[7].start, '2026-01-04', 'Incomplete + W Co uses M.');
assert.equal(output[9].start, '2026-01-04', 'Unknown W uses M.');
assert.equal(output[11].start, '2026-01-04', 'FS missing T falls back to M.');
assert.equal(output[13].start, '2026-01-10', 'SS complete + W Co uses S.');
assert.equal(output[15].start, '2026-01-01', 'SS blank W uses L.');
assert.equal(output[17].start, '2026-01-01', 'SS missing S falls back to L.');
assert.equal(output[19].finish, '2026-01-20', 'FF complete + W Co uses T.');
assert.equal(output[21].finish, '2026-01-03', 'FF W Khong uses M.');
assert.equal(output[23].finish, '2026-01-03', 'FF blank W uses M.');
assert.equal(output[25].finish, '2026-01-03', 'FF missing T falls back to M.');
assert.equal(output[26].start, '2026-01-06', 'Positive lag remains supported.');
assert.equal(output[27].start, '2026-01-03', 'Negative lag remains supported.');
assert.match(output[28].error, /ERR_REF_NOT_FOUND: 999/);

fixture.forEach((input, index) => {
  assert.equal(output[index].predecessor, input[10], 'Predecessor K must not change.');
  assert.equal(output[index].status, input[17], 'Status R must not change.');
  assert.equal(output[index].actualStart, iso(input[18]), 'Actual S must not change.');
  assert.equal(output[index].actualFinish, iso(input[19]), 'Actual T must not change.');
  assert.equal(output[index].adjustLink, input[22], 'Decision W must not change.');
});

const wrapperModel = createSpreadsheet(buildBehaviorRows());
const wrapperRuntime = createRuntime(rootEngineSource, rootCalendarSource, wrapperModel.spreadsheet);
wrapperRuntime.resetCounts();
const wrapperSummary = wrapperRuntime.api.wrapper({ normalizeFormat: false });
assert.equal(wrapperSummary.ok, true);
assert.deepEqual(wrapperRuntime.counts(), { activeCalls: 1, lockCalls: 1 });

const holidayFixture = [
  taskRow(1, 3, '', date(1), date(3), 'Hoàn thành', date(10), date(20), 'Không'),
  taskRow(2, 2, '1FS')
];
const holidayRun = runCore(rootEngineSource, rootCalendarSource, holidayFixture, [date(4)]);
assert.equal(holidayRun.snapshot[1].start, '2026-01-05', 'Configured holiday must remain excluded.');

assert.equal(rootRun.runtime.api.shouldUseActual({ status: 'Hoàn thành', adjustLink: 'Có' }), true);
for (const candidate of [
  { status: 'Hoàn thành', adjustLink: 'Không' },
  { status: 'Hoàn thành', adjustLink: '' },
  { status: 'Đang làm', adjustLink: 'Có' },
  { status: 'Hoàn thành', adjustLink: 'YES' }
]) {
  assert.equal(rootRun.runtime.api.shouldUseActual(candidate), false);
}

console.log('Schedule Engine Gate 3: PASS');
