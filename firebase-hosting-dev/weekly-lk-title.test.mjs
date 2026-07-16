import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const paramsStart = source.indexOf('(', start);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    if (source[index] === '(') paramsDepth += 1;
    if (source[index] === ')') paramsDepth -= 1;
    if (paramsDepth === 0) {
      paramsEnd = index;
      break;
    }
  }
  const brace = source.indexOf('{', paramsEnd);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const context = {};
vm.createContext(context);
vm.runInContext([
  extractFunction(app, 'qltdExactRowDisplayTitle'),
  extractFunction(app, 'qltdWeeklyDisplayTitle'),
  'this.exactTitle = qltdExactRowDisplayTitle;',
  'this.weeklyTitle = qltdWeeklyDisplayTitle;'
].join('\n'), context);

const title = 'Hoàn thành phê duyệt đ/c TKBVTC';
for (const [raw, expected] of [
  ['LK05', 'LK 05'],
  ['LK14', 'LK 14'],
  ['LK19', 'LK 19'],
  ['LK21', 'LK 21']
]) {
  assert.equal(context.exactTitle(title, raw), `${title} - ${expected}`);
}

assert.equal(context.exactTitle(title, ''), title);
assert.equal(context.exactTitle(title, '   '), title);
assert.equal(context.exactTitle(`${title} - LK05`, 'LK 05'), `${title} - LK05`);
assert.equal(context.exactTitle(`${title} - LK   14`, 'LK14'), `${title} - LK 14`);
assert.equal(context.exactTitle(`  ${title}\u00a0 `, '\tLK\u00a021  '), `${title} - LK 21`);
assert.equal(context.weeklyTitle({ taskName: title, ownHangMuc: 'LK19' }), `${title} - LK 19`);
assert.equal(context.weeklyTitle({ taskName: title, congViecHangMuc: 'LK21' }), `${title} - LK 21`);
assert.equal(context.weeklyTitle({ taskName: title, hangMuc: 'Inherited LK 05' }), title);

for (const renderer of [
  'renderWeeklyObjectiveList',
  'renderWeeklyTaskRow',
  'renderWeeklyReadonlySelection',
  'renderWeeklyNotificationSelection',
  'renderWeeklySelectedForm',
  'qltdWeeklyBuildExportModel'
]) {
  assert.match(extractFunction(app, renderer), /qltdWeeklyDisplayTitle/);
}

assert.equal((app.match(/function qltdExactRowDisplayTitle\s*\(/g) || []).length, 1);
assert.equal((app.match(/function qltdWeeklyDisplayTitle\s*\(/g) || []).length, 1);

console.log('Weekly LK title frontend tests: PASS');
