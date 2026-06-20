import assert from 'node:assert/strict';
import { getMonthWeekPeriods } from './weekly-periods.js';

const june = getMonthWeekPeriods('2026-06');
const july = getMonthWeekPeriods('2026-07');
const september = getMonthWeekPeriods('2026-09');
const january2027 = getMonthWeekPeriods('2027-01');
const december2026 = getMonthWeekPeriods('2026-12');

assert.equal(june.some((week) => week.weekId === 'WEEK-2026-06-29'), false);
assert.equal(july[0].weekId, 'WEEK-2026-06-29');
assert.equal(july[0].weekEnd, '2026-07-05');
assert.equal(july[0].ownerMonth, '2026-07');
assert.equal(july[0].coverageDays, 7);
assert.equal(july[0].crossMonthDescription, '2 ngày tháng 6 · 5 ngày tháng 7');
assert.equal(september[0].weekId, 'WEEK-2026-08-31');
assert.equal(december2026.at(-1).weekId, 'WEEK-2026-12-28');
assert.equal(december2026.at(-1).weekEnd, '2027-01-03');
assert.equal(january2027[0].weekId, 'WEEK-2027-01-04');
assert.equal(new Set([...june, ...july].map((week) => week.weekId)).size, june.length + july.length);
assert.equal([...june, ...july, ...september, ...january2027].every((week) => week.coverageDays === 7), true);
assert.equal([...june, ...july].every((week) => /^WEEK-\d{4}-\d{2}-\d{2}$/.test(week.weekId)), true);

console.log('Weekly ownership: 13/13 cases passed.');
