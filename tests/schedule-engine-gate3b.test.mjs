import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rootEngineSource = fs.readFileSync(new URL('../04_schedule_engine_v1.js', import.meta.url), 'utf8');
const apiEngineSource = fs.readFileSync(new URL('../apps-script-dev-api/04_schedule_engine_v1.js', import.meta.url), 'utf8');
const calendarSource = fs.readFileSync(new URL('../15_Lich_lam_viec.js', import.meta.url), 'utf8');
const normalizeSource = (source) => source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

assert.equal(
  normalizeSource(rootEngineSource),
  normalizeSource(apiEngineSource),
  'Root/API Schedule Engine must stay identical for combined SS/FF constraints.'
);

function date(day) {
  return new Date(2026, 0, day);
}

function iso(value) {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function createRuntime(engineSource) {
  const activeSpreadsheet = {
    getSpreadsheetTimeZone: () => 'Asia/Ho_Chi_Minh',
    getSheetByName: () => null
  };
  const context = {
    Logger: { log: () => {} },
    Utilities: {
      formatDate(value) {
        return iso(value);
      }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => activeSpreadsheet
    }
  };

  vm.createContext(context);
  vm.runInContext(`${calendarSource}\n${engineSource}\nthis.gate3b = {
    make(ref, duration, predecessor, actualStartMs, actualFinishMs, forecastStartMs, forecastEndMs, adjustLink, status) {
      const toDate = value => value === null || typeof value === 'undefined' ? null : new Date(value);
      return taoTaskTestScheduleV1_(
        ref,
        duration,
        predecessor,
        toDate(actualStartMs),
        toDate(actualFinishMs),
        toDate(forecastStartMs),
        toDate(forecastEndMs),
        adjustLink,
        status
      );
    },
    run(tasks, anchorMs, holidayKeys) {
      const holidaySet = new Set(holidayKeys || []);
      holidaySet.timeZone = 'Asia/Ho_Chi_Minh';
      SCHEDULE_ENGINE_V1_NGAY_NGHI_SET_CACHE_ = holidaySet;
      return chayTestMangScheduleEngineV1_(tasks, new Date(anchorMs));
    },
    embedded() {
      const holidaySet = new Set();
      holidaySet.timeZone = 'Asia/Ho_Chi_Minh';
      SCHEDULE_ENGINE_V1_NGAY_NGHI_SET_CACHE_ = holidaySet;
      return testScheduleEngineV1();
    }
  };`, context);
  return context.gate3b;
}

const rootRuntime = createRuntime(rootEngineSource);
const apiRuntime = createRuntime(apiEngineSource);

function task(runtime, ref, duration, predecessor = '', options = {}) {
  const toTimestamp = value => value ? value.getTime() : null;
  return runtime.make(
    String(ref),
    duration,
    predecessor,
    toTimestamp(options.actualStart),
    toTimestamp(options.actualFinish),
    toTimestamp(options.forecastStart),
    toTimestamp(options.forecastEnd),
    options.adjustLink || '',
    options.status || ''
  );
}

function run(runtime, buildTasks, holidays = []) {
  return runtime.run(buildTasks(runtime), date(1).getTime(), holidays);
}

function expectSchedule(result, ref, start, finish, duration, label) {
  assert.equal(iso(result[String(ref)].start), iso(start), `${label}: start`);
  assert.equal(iso(result[String(ref)].end), iso(finish), `${label}: finish`);
  assert.equal(result[String(ref)].duration, duration, `${label}: fixed duration`);
  assert.deepEqual(Array.from(result[String(ref)].errors), [], `${label}: errors`);
}

// 1. Chi SS.
let result = run(rootRuntime, (rt) => [
  task(rt, 1, 5),
  task(rt, 2, 3, '1SS+2')
]);
expectSchedule(result, 2, date(3), date(5), 3, 'SS only');

// 2. Chi FF.
result = run(rootRuntime, (rt) => [
  task(rt, 1, 5),
  task(rt, 2, 3, '1FF+2')
]);
expectSchedule(result, 2, date(5), date(7), 3, 'FF only');

// 3. SS + FF cung mot tien nhiem; FF manh hon.
result = run(rootRuntime, (rt) => [
  task(rt, 1, 5),
  task(rt, 2, 3, '1SS+1;1FF+2')
]);
expectSchedule(result, 2, date(5), date(7), 3, 'same predecessor FF stronger');

// 4. SS + FF khac tien nhiem.
result = run(rootRuntime, (rt) => [
  task(rt, 1, 10),
  task(rt, 2, 3, '1FS'),
  task(rt, 3, 4, '1SS+2;2FF+1')
]);
expectSchedule(result, 3, date(11), date(14), 4, 'different predecessors');

// 5. SS manh hon FF.
result = run(rootRuntime, (rt) => [
  task(rt, 1, 10),
  task(rt, 2, 3, '1SS+8;1FF-5')
]);
expectSchedule(result, 2, date(9), date(11), 3, 'SS stronger');

// 6. FF manh hon SS da duoc bao ve o fixture so 3.

// 7. SS va FF quy ve cung mot ngay bat dau.
result = run(rootRuntime, (rt) => [
  task(rt, 1, 5),
  task(rt, 2, 3, '1SS+2;1FF')
]);
expectSchedule(result, 2, date(3), date(5), 3, 'equal constraints');

// 8. Lag duong va Case 6 goc: max(1FS=07, 3SS+2=09, 5FF-1=>05) = 09.
const case6Builder = (rt) => [
  task(rt, 1, 6),
  task(rt, 3, 30, '1FS'),
  task(rt, 5, 3, '1FS'),
  task(rt, 6, 4, '1FS;3SS+2;5FF-1')
];
result = run(rootRuntime, case6Builder);
expectSchedule(result, 6, date(9), date(12), 4, 'embedded Case 6');

// 9. Lag am.
result = run(rootRuntime, (rt) => [
  task(rt, 1, 5),
  task(rt, 2, 3, '1SS-2;1FF-1')
]);
expectSchedule(result, 2, date(2), date(4), 3, 'negative lag');

// 10. Cuoi tuan/ngay nghi duoc khai bao trong Ngay_nghi.
result = run(rootRuntime, (rt) => [
  task(rt, 1, 2),
  task(rt, 2, 2, '1SS+1;1FF+2')
], ['2026-01-03', '2026-01-04']);
expectSchedule(result, 2, date(5), date(6), 2, 'configured weekend holidays');

function actualFixture(rt, adjustLink, status = 'Hoàn thành', actualStart = date(10), actualFinish = date(20)) {
  return [
    task(rt, 1, 5, '', {
      actualStart,
      actualFinish,
      forecastStart: date(1),
      forecastEnd: date(5),
      adjustLink,
      status
    }),
    task(rt, 2, 3, '1SS;1FF')
  ];
}

// 11. Hoan thanh + W=Co: SS dung ActualStart, FF dung ActualFinish.
result = run(rootRuntime, (rt) => actualFixture(rt, 'Có'));
expectSchedule(result, 2, date(18), date(20), 3, 'W Co actual anchors');

// 12. Hoan thanh + W=Khong: dung L/M.
result = run(rootRuntime, (rt) => actualFixture(rt, 'Không'));
expectSchedule(result, 2, date(3), date(5), 3, 'W Khong planned anchors');

// 13. W trong: dung L/M.
result = run(rootRuntime, (rt) => actualFixture(rt, ''));
expectSchedule(result, 2, date(3), date(5), 3, 'blank W planned anchors');

// 14. ActualStart hop le, ActualFinish trong: SS actual; FF fallback M.
result = run(rootRuntime, (rt) => actualFixture(rt, 'Có', 'Hoàn thành', date(10), null));
expectSchedule(result, 2, date(10), date(12), 3, 'missing ActualFinish fallback');

// 15. ActualFinish hop le, ActualStart trong: FF actual; SS fallback L.
result = run(rootRuntime, (rt) => actualFixture(rt, 'Có', 'Hoàn thành', null, date(20)));
expectSchedule(result, 2, date(18), date(20), 3, 'missing ActualStart fallback');

// 16. Chua Hoan thanh + W=Co van dung L/M.
result = run(rootRuntime, (rt) => actualFixture(rt, 'Có', 'Đang làm'));
expectSchedule(result, 2, date(3), date(5), 3, 'incomplete ignores W');

// 17. Moi fixture tren deu assert J khong bi thay doi.

// 18. Ham ghi ket qua chi truyen J/L/M/Q vao helper setValues.
const writeFunction = rootEngineSource.match(
  /function ghiKetQuaScheduleV1_[\s\S]*?function ghiCotTheoCumNeuKhacScheduleV1_/
)[0];
const writeColumns = Array.from(
  writeFunction.matchAll(/ghiCotTheoCumNeuKhacScheduleV1_\(sheet,\s*cfg\.COL\.([A-Z_]+)/g),
  (match) => match[1]
);
assert.deepEqual(writeColumns, ['DURATION', 'START', 'END', 'ERROR']);

// 19. Root/API parity tren fixture SS+FF co W/ActualDate.
const rootParity = run(rootRuntime, (rt) => actualFixture(rt, 'Có'));
const apiParity = run(apiRuntime, (rt) => actualFixture(rt, 'Có'));
for (const ref of ['1', '2']) {
  assert.deepEqual(
    {
      duration: rootParity[ref].duration,
      start: iso(rootParity[ref].start),
      finish: iso(rootParity[ref].end),
      errors: Array.from(rootParity[ref].errors)
    },
    {
      duration: apiParity[ref].duration,
      start: iso(apiParity[ref].start),
      finish: iso(apiParity[ref].end),
      errors: Array.from(apiParity[ref].errors)
    }
  );
}

rootRuntime.embedded();
apiRuntime.embedded();

console.log('Schedule Engine Gate 3B: PASS');
