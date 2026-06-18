import assert from 'node:assert/strict';
import {
  getMainMilestoneTaskKey,
  isMainMilestoneKeySelected,
  normalizeMainMilestoneTaskKeys,
  toggleMainMilestoneTaskKey
} from './main-milestone-logic.js';

const tasks = [
  { id: 'A-ID', code: 'A-CODE', text: 'A' },
  { id: 'B-ID', code: 'B-CODE', text: 'B', parent: 'A-ID' },
  { id: 'C-ID', code: 'C-CODE', text: 'C' },
  { id: 'PARENT-ID', code: 'PARENT', text: 'Parent' }
];

assert.equal(getMainMilestoneTaskKey(tasks[0]), 'A-ID');
const selected = normalizeMainMilestoneTaskKeys(['A-CODE'], tasks);
assert.deepEqual([...selected], ['A-ID'], 'legacy code is normalized to canonical id');
toggleMainMilestoneTaskKey(selected, tasks[0]);
assert.equal(selected.size, 0, 'second click removes the selected star');
toggleMainMilestoneTaskKey(selected, tasks[0]);
assert.equal(isMainMilestoneKeySelected(selected, tasks[0]), true, 'first click selects the star');

const exactThree = normalizeMainMilestoneTaskKeys(['A-ID', 'B-CODE', 'C-ID'], tasks);
const visible = tasks.filter((task) => isMainMilestoneKeySelected(exactThree, task));
assert.deepEqual(visible.map((task) => task.id), ['A-ID', 'B-ID', 'C-ID'], 'filter returns exactly starred rows');
assert.equal(visible.some((task) => task.id === 'PARENT-ID'), false, 'unstarred parent stays hidden');

const projectA = normalizeMainMilestoneTaskKeys(['A-ID'], tasks);
const projectB = normalizeMainMilestoneTaskKeys(['C-ID'], tasks);
assert.equal(isMainMilestoneKeySelected(projectA, tasks[2]), false, 'project states remain isolated');
assert.equal(isMainMilestoneKeySelected(projectB, tasks[0]), false, 'project states remain isolated');

console.log('Main milestone toggle/filter: all cases passed.');
