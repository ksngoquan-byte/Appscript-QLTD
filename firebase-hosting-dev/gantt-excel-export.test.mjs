import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const limitsDeclaration = appSource.match(/const QLTD_WEB07_GANTT_CAPTURE_LIMITS = Object\.freeze\(\{[\s\S]*?\}\);/);
assert.ok(limitsDeclaration, 'Missing capture limits');

const helpersSource = [
  limitsDeclaration[0],
  extractFunction(appSource, 'qltdWeb07GetVisibleGanttRows'),
  extractFunction(appSource, 'qltdWeb07MeasureGanttExportLayout'),
  extractFunction(appSource, 'qltdWeb07BuildGanttVerticalSlices'),
  extractFunction(appSource, 'qltdWeb07ChooseGanttCapturePlan'),
  extractFunction(appSource, 'qltdWeb07ExcelColumnName')
].join('\n');

const context = {
  console,
  Map,
  Math,
  Number,
  Object,
  String,
  Error,
  getComputedStyle: () => ({ font: '400 11px Arial' }),
  getTaskWbsLevel: (task) => String(task.wbs || '').split('.').length,
  document: {
    createElement: (tag) => {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          font: '',
          measureText: (text) => ({ width: String(text).length * 7 })
        })
      };
    }
  }
};
vm.createContext(context);
vm.runInContext(`${helpersSource}\nthis.api = { qltdWeb07MeasureGanttExportLayout, qltdWeb07ChooseGanttCapturePlan, qltdWeb07ExcelColumnName };`, context);

function createGantt(tasks) {
  return {
    config: {
      columns: [
        { name: 'wbs', width: 72 },
        { name: 'text', width: 300 },
        { name: 'owner', width: 120 },
        { name: 'duration', width: 74 },
        { name: 'start_plan', width: 86 },
        { name: 'end_plan', width: 86 }
      ],
      grid_width: 738,
      row_height: 32
    },
    eachTask: (callback) => tasks.forEach(callback),
    isTaskVisible: () => true
  };
}

test('full LK names remain source text and export column accounts for tree indentation', () => {
  const lkNames = [
    'LK 05', 'LK 14', 'LK 15', 'LK 19', 'LK 20', 'LK 21', 'LK01', 'LK02',
    'LK 02A', 'LK 03', 'LK 04', 'LK06', 'LK07', 'LK08', 'LK 09', 'LK 16',
    'LK18', 'LK10', 'LK11', 'LK12', 'LK13', 'LK 17'
  ];
  const tasks = lkNames.map((text, index) => ({ id: index + 1, text, wbs: `I.${index + 1}`, $level: 5 }));
  const layout = context.api.qltdWeb07MeasureGanttExportLayout(createGantt(tasks), {
    querySelector: () => ({})
  });

  assert.deepEqual(tasks.map((task) => task.text), lkNames);
  assert.ok(layout.nameWidth >= 300);
  assert.ok(layout.gridWidth > layout.nameWidth);
  assert.equal(layout.needsWrap, false);
  assert.doesNotMatch(appSource, /task\.text\s*=\s*.*(?:slice|substring|\.\.\.)/);
});

test('long names expand first, then use a synchronized two-line export row', () => {
  const expandable = createGantt([{ id: 1, text: 'Tên công việc dài '.repeat(4), wbs: 'I.1', $level: 2 }]);
  const expandedLayout = context.api.qltdWeb07MeasureGanttExportLayout(expandable, { querySelector: () => ({}) });
  assert.ok(expandedLayout.nameWidth > 300);
  assert.equal(expandedLayout.needsWrap, false);

  const veryLong = createGantt([{ id: 1, text: 'Tên công việc rất dài '.repeat(10), wbs: 'I.1.1', $level: 3 }]);
  const wrappedLayout = context.api.qltdWeb07MeasureGanttExportLayout(veryLong, { querySelector: () => ({}) });
  assert.equal(wrappedLayout.nameWidth, 640);
  assert.equal(wrappedLayout.needsWrap, true);
  assert.deepEqual(Array.from(wrappedLayout.wrappedTaskIds), [1]);
  assert.match(appSource, /task\.row_height = 46/);
  assert.match(appSource, /delete task\.row_height/);
});

test('sample-sized Gantt receives lossless high-resolution sliced PNG plan', () => {
  const plan = context.api.qltdWeb07ChooseGanttCapturePlan(3188, 4750, 32, 54);
  assert.equal(plan.pixelRatio, 3);
  assert.equal(plan.pixelWidth, 9564);
  assert.equal(plan.slices.reduce((sum, slice) => sum + slice.height, 0), 4750);
  assert.ok(plan.slices.length <= 4);
  assert.match(appSource, /toDataURL\('image\/png'\)/);
  assert.match(appSource, /imageSmoothingQuality = 'high'/);
  assert.doesNotMatch(extractFunction(appSource, 'qltdWeb07CaptureGanttPng'), /pixelRatio:\s*1[,\n]/);
});

test('200-row Gantt stays within canvas limits and keeps row-aligned slices', () => {
  const rowHeight = 46;
  const height = 200 * rowHeight + 174;
  const plan = context.api.qltdWeb07ChooseGanttCapturePlan(3500, height, rowHeight, 54);
  assert.ok(plan.pixelRatio >= 2);
  assert.ok(plan.slices.length <= 4);
  assert.ok(plan.slices.every((slice, index) => index === plan.slices.length - 1 || index === 0 || slice.height % rowHeight === 0));
  assert.ok(plan.slices.every((slice) => plan.pixelWidth * Math.ceil(slice.height * plan.pixelRatio) <= 48000000));
});

test('Excel embedding preserves PNGs, aspect ratio, print area and both sheet names', () => {
  const exportSource = extractFunction(appSource, 'qltdWeb07ExportGanttExcel');
  assert.match(exportSource, /addWorksheet\('Gantt_Print'/);
  assert.match(exportSource, /addWorksheet\('Gantt_Data'/);
  assert.match(exportSource, /capture\.images\.forEach/);
  assert.match(exportSource, /extension: 'png'/);
  assert.match(exportSource, /pageSetup\.printArea/);
  assert.doesNotMatch(exportSource, /extension: 'jpe?g'|image\/jpe?g/i);
  assert.equal(context.api.qltdWeb07ExcelColumnName(21), 'U');
});
