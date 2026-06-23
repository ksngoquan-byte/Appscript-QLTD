# QLTD Mainline Integration Audit — 2026-06-23

## Branches

- Backup of original main: `backup/main-before-consolidation-20260623`
- Integration branch: `integration/qltd-mainline-performance-v1`
- Integration source: `feature/gantt-period-view-v1`
- Do not merge into `main` until the performance gates pass.

## Cleanup completed

- Removed tracked root `.clasp.json` from the integration branch.
- Removed generated `firebase-hosting-dev/.firebase/hosting..cache`.
- Added `firebase-hosting-dev/.firebase/` to `.gitignore`.
- Confirmed `perf-hotfix-v3.js` is not present on the integration branch.

## JavaScript loaded directly by index.html

1. `api-read-cache.js`
2. `app.js`
3. `pb-detail-ui.js`
4. `help-documents.js`
5. `ui-polish.js`

## Modules imported by app.js

- `dashboard-overdue.js`
- `main-milestone-logic.js`
- `department-dashboard.js`
- `weekly-periods.js`
- Firebase App/Auth/Firestore modules from gstatic

## Confirmed critical-path defects

1. `renderProjectOptions()` calls `loadGanttDataForSelectedProject()` immediately after selecting the default project.
2. Project change calls `loadGanttDataForSelectedProject()` regardless of the active view.
3. `loadProjectsForSelector()` remains available even though bootstrap can already return projects.
4. `app.js` is a large monolithic module and should be split only after request-graph fixes and regression tests.
5. No second fetch wrapper is allowed. Authentication, dedupe, cache and invalidation must stay in one API client layer.

## Required P0 changes before merge to main

- Dashboard must not call `ganttData`.
- Project change must call only the endpoint required by the active view.
- Bootstrap must run once per Firebase session.
- Use projects returned by bootstrap; `listProjects` is fallback only.
- Detail GET/POST must include verified Firebase ID token and retry once for required/invalid/expired token.
- `listDeptPlans` must accept and process the selected department only.
- Detail tasks must load only when the user opens a master task.

## Merge gates

- Syntax checks pass.
- Existing test suite passes.
- Network confirms no `ganttData` on Dashboard.
- No duplicate bootstrap/listProjects requests.
- No `ID_TOKEN_REQUIRED` for detail operations.
- Logout/login as another user does not reuse the former user's cache.
- Benchmark results are recorded before and after.

## Deployment status

- Apps Script push: not performed.
- Firebase DEV deploy: not performed.
- Merge to main: not performed.
