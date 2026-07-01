import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rootSource = fs.readFileSync(new URL('../04_schedule_engine_v1.js', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../apps-script-dev-api/04_schedule_engine_v1.js', import.meta.url), 'utf8');
const calendarSource = fs.readFileSync(new URL('../15_Lich_lam_viec.js', import.meta.url), 'utf8');
const normalize = (value) => value.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

assert.equal(normalize(rootSource), normalize(apiSource), 'Root/API engine parity is required.');

function createRuntime(engineSource) {
  const context = {
    Logger: { log: () => {} },
    Utilities: {
      formatDate(value) {
        const date = new Date(value);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSpreadsheetTimeZone: () => 'Asia/Ho_Chi_Minh',
        getSheetByName: () => null
      })
    }
  };
  vm.createContext(context);
  vm.runInContext(`${calendarSource}\n${engineSource}\nthis.durationApi = {
    make(ref, duration, predecessor, actualStartMs, actualFinishMs, forecastStartMs, forecastEndMs, adjustLink, status) {
      const toDate = value => value === null || typeof value === 'undefined' ? null : new Date(value);
      return taoTaskTestScheduleV1_(ref, duration, predecessor, toDate(actualStartMs), toDate(actualFinishMs),
        toDate(forecastStartMs), toDate(forecastEndMs), adjustLink, status);
    },
    run(tasks) {
      const holidays = new Set();
      holidays.timeZone = 'Asia/Ho_Chi_Minh';
      SCHEDULE_ENGINE_V1_NGAY_NGHI_SET_CACHE_ = holidays;
      return chayTestMangScheduleEngineV1_(tasks, new Date(2026, 0, 1));
    }
  };`, context);
  return context.durationApi;
}

function date(day) {
  return new Date(2026, 0, day);
}

function timestamp(value) {
  return value ? value.getTime() : null;
}

function task(runtime, ref, duration, predecessor = '', options = {}) {
  return runtime.make(
    String(ref),
    duration,
    predecessor,
    timestamp(options.actualStart),
    timestamp(options.actualFinish),
    timestamp(options.forecastStart),
    timestamp(options.forecastEnd),
    options.adjustLink || '',
    options.status || ''
  );
}

function iso(value) {
  if (!value) return '';
  const result = new Date(value);
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}-${String(result.getDate()).padStart(2, '0')}`;
}

function snapshot(result, ref) {
  const value = result[String(ref)];
  return {
    duration: value.duration,
    start: iso(value.start),
    finish: iso(value.end),
    errors: Array.from(value.errors)
  };
}

const rootRuntime = createRuntime(rootSource);
const apiRuntime = createRuntime(apiSource);

// J hop le: giu nguyen J va tinh finish tu start manh nhat.
let result = rootRuntime.run([
  task(rootRuntime, 1, 5),
  task(rootRuntime, 2, 3, '1SS+1;1FF+2')
]);
assert.deepEqual(snapshot(result, 2), {
  duration: 3,
  start: '2026-01-05',
  finish: '2026-01-07',
  errors: []
});

// J trong + chi FS/SS/FF: mot dau khong du de suy duration, engine giu ERR_DURATION_EMPTY.
for (const predecessor of ['1FS', '1SS', '1FF']) {
  result = rootRuntime.run([
    task(rootRuntime, 1, 5),
    task(rootRuntime, 2, null, predecessor)
  ]);
  assert.equal(result['2'].duration, null, `J blank ${predecessor}: duration`);
  assert.equal(result['2'].start, null, `J blank ${predecessor}: start`);
  assert.equal(result['2'].end, null, `J blank ${predecessor}: finish`);
  assert.ok(Array.from(result['2'].errors).includes('ERR_DURATION_EMPTY'), `J blank ${predecessor}: error`);
}

// J trong + FS/FF: suy duration tu start/end constraints.
result = rootRuntime.run([
  task(rootRuntime, 1, 5),
  task(rootRuntime, 2, null, '1FS;1FF+3')
]);
assert.deepEqual(snapshot(result, 2), {
  duration: 3,
  start: '2026-01-06',
  finish: '2026-01-08',
  errors: []
});

// J trong + SS/FF: suy duration theo co che hien hanh.
result = rootRuntime.run([
  task(rootRuntime, 1, 5),
  task(rootRuntime, 2, null, '1SS+1;1FF+3')
]);
assert.deepEqual(snapshot(result, 2), {
  duration: 7,
  start: '2026-01-02',
  finish: '2026-01-08',
  errors: []
});

function actualFixture(runtime, adjustLink) {
  return [
    task(runtime, 1, 5, '', {
      actualStart: date(10),
      actualFinish: date(20),
      forecastStart: date(1),
      forecastEnd: date(5),
      adjustLink,
      status: 'Hoàn thành'
    }),
    task(runtime, 2, null, '1SS;1FF')
  ];
}

// J trong + W=Co: suy tu ActualStart/ActualFinish.
result = rootRuntime.run(actualFixture(rootRuntime, 'Có'));
assert.deepEqual(snapshot(result, 2), {
  duration: 11,
  start: '2026-01-10',
  finish: '2026-01-20',
  errors: []
});

// J trong + W=Khong/trong: suy tu L/M.
for (const adjustLink of ['Không', '']) {
  result = rootRuntime.run(actualFixture(rootRuntime, adjustLink));
  assert.deepEqual(snapshot(result, 2), {
    duration: 5,
    start: '2026-01-01',
    finish: '2026-01-05',
    errors: []
  });
}

// Root/API parity cho J trong.
const rootResult = rootRuntime.run(actualFixture(rootRuntime, 'Có'));
const apiResult = apiRuntime.run(actualFixture(apiRuntime, 'Có'));
assert.deepEqual(snapshot(rootResult, 2), snapshot(apiResult, 2));

console.log('Schedule Engine duration inference: PASS');
