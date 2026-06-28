import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(repoRoot, 'apps-script-dev-api');
const sourceFiles = fs.readdirSync(sourceDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({
    name,
    source: fs.readFileSync(path.join(sourceDir, name), 'utf8')
  }));

const canonicalPattern = /^function\s+toggleDuongGangKeHoachGocV1\s*\(/gm;
const legacyPattern = /^function\s+toggleDuongGangKeHoachGocLegacyV1_\s*\(/gm;
const canonicalDefinitions = sourceFiles.flatMap((file) =>
  Array.from(file.source.matchAll(canonicalPattern), (match) => ({ file: file.name, index: match.index }))
);
const legacyDefinitions = sourceFiles.flatMap((file) =>
  Array.from(file.source.matchAll(legacyPattern), (match) => ({ file: file.name, index: match.index }))
);

assert.deepEqual(canonicalDefinitions.map((item) => item.file), ['11_Cap_nhat_Tien_do_Tong_hop.js']);
assert.deepEqual(legacyDefinitions.map((item) => item.file), ['10_To_mau_Gantt_Tong_hop.js']);

const menuSource = sourceFiles.find((file) => file.name === '07_ui_menu.js').source;
assert.match(menuSource, /function menuToggleDuongGangKeHoachGocV1\s*\(/);
assert.match(menuSource, /'toggleDuongGangKeHoachGocV1'/);
assert.doesNotMatch(menuSource, /'toggleDuongGangKeHoachGocLegacyV1_'/);

const canonicalSource = sourceFiles.find((file) => file.name === '11_Cap_nhat_Tien_do_Tong_hop.js').source;
assert.match(canonicalSource, /BASELINE_GANTT_PROP_KEY_V1/);
assert.match(canonicalSource, /capNhatTienDoTongHopV1\(\)/);

const periodSource = sourceFiles.find((file) => file.name === '25_Gantt_Period_View.js').source;
const currentReaderIndex = periodSource.indexOf("typeof coHienThiBaselineGanttV1_ === 'function'");
const legacyReaderIndex = periodSource.indexOf("typeof docHienThiDuongGangKeHoachGocV1_ === 'function'");
assert.ok(currentReaderIndex >= 0 && legacyReaderIndex > currentReaderIndex);

console.log('Gantt baseline toggle uniqueness/menu contract: PASS');
