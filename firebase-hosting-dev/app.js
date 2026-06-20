import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import {
  getExecutiveTaskDueDate,
  isExecutiveCategoryRow,
  isExecutiveTaskCompleted,
  isExecutiveTaskOverdue
} from './dashboard-overdue.js';
import {
  getMainMilestoneTaskKey,
  isMainMilestoneKeySelected,
  normalizeMainMilestoneTaskKeys,
  toggleMainMilestoneTaskKey
} from './main-milestone-logic.js';
import { buildDepartmentDashboardModel } from './department-dashboard.js';
import { getMonthWeekPeriods } from './weekly-periods.js?v=STEP_3B2E4_ACTUAL_DATE_LIFECYCLE';

window.__QLTD_GANTT_PATCH_ROUND__ = 'ROUND5_EXCEL_GANTT_EXPORT';

const firebaseConfig = {
  apiKey: 'AIzaSyBWQoAi2VwMG0Aygckuv1H3CrlNgn_MJQY',
  authDomain: 'qltd-entiz-dev-208a3.firebaseapp.com',
  projectId: 'qltd-entiz-dev-208a3',
  storageBucket: 'qltd-entiz-dev-208a3.firebasestorage.app',
  messagingSenderId: '515073275488',
  appId: '1:515073275488:web:d598b3ee1ac939a85e7505',
  measurementId: 'G-Z6FVGBST37'
};

const ADMIN_EMAILS = ['ksngoquan@gmail.com'];
const APPS_SCRIPT_DEV_URL = 'https://script.google.com/macros/s/AKfycbx6iHCEf6Ba05h6u6DiBcqv3kxV79T6RvktzoFsdBJXeQjBaCNMyGQL5akptlX8jGtxpg/exec';

const DEFAULT_PERMISSIONS = {
  dashboard: false,
  gantt: false,
  lookup: false,
  reportUpdate: false,
  admin: false
};

const PROJECT_STORAGE_KEY = 'qltd.selectedProjectCode.v1';
let qltdSelectedMonthCode = getDefaultMonthCode();
let qltdSelectedMasterCode = '';
let qltdSelectedWeekId = '';
let qltdGanttPayload = null;
let qltdGanttZoom = 'month';
let qltdGanttShowLinks = true;
let qltdGanttShowDates = true;
let qltdActiveView = 'dashboard';
let qltdDhtmlxLoadPromise = null;
let qltdExcelJsLoadPromise = null;
let qltdHtmlToImageLoadPromise = null;
let qltdDhtmlxGanttInitialized = false;
let qltdDhtmlxGanttRenderSeq = 0;
let qltdProjectRegistry = [];
let qltdCurrentMainMilestoneProjectKey = '';
let qltdMainMilestoneIds = new Set();
let qltdMainMilestoneSelectMode = false;
let qltdMainMilestoneGanttClickEventId = null;
let qltdDashboardMode = 'project';
let qltdDepartmentDashboardDeptCode = '';
let qltdDepartmentDashboardProjectCode = '';
const qltdDepartmentDashboardCache = new Map();
const qltdWeeklyDrafts = {};
const qltdWeeklyTaskCache = new Map();
let qltdWeeklyTaskRequestSeq = 0;
let qltdWeeklyTaskView = { key: '', items: [], updates: [], nextItems: [], standaloneBudgetItems: [], loading: false, error: '' };
let qltdSelectedWeeklyItemKey = '';
let qltdReportSubTab = 'plan';
let qltdWeeklyForcedItem = null;
const qltdDetailPopupCache = new Map();
let qltdDetailPopupRequestSeq = 0;
let qltdAdminApprovalRequestSeq = 0;
let qltdAdminApprovalView = { loading: false, error: '', approvals: [] };

document.addEventListener('qltd:pb-detail-changed', (event) => {
  const detail = event.detail || {};
  const cacheKey = [detail.projectCode || '', detail.deptCode || '', detail.masterTaskCode || ''].join('::');
  qltdDetailPopupCache.delete(cacheKey);
  Array.from(qltdWeeklyTaskCache.keys()).forEach((key) => {
    if (key.startsWith(`${detail.projectCode || ''}::${detail.deptCode || ''}::`)) qltdWeeklyTaskCache.delete(key);
  });
  const dept = (qltdDeptPlanPayload?.departments || []).find((item) => (item.deptCode || item.sheetName) === detail.deptCode);
  const master = (dept?.masters || []).find((item) => item.masterCode === detail.masterTaskCode);
  if (master && Array.isArray(detail.detailTasks)) master.details = detail.detailTasks;
  if (qltdReportSubTab === 'plan' && detail.deptCode === qltdSelectedDeptCode && detail.masterTaskCode === qltdSelectedMasterCode) renderSelectedDeptPlan();
});

const els = {
  loginView: document.getElementById('loginView'),
  deniedView: document.getElementById('deniedView'),
  appShell: document.getElementById('appShell'),
  signInButton: document.getElementById('signInButton'),
  signOutButton: document.getElementById('signOutButton'),
  deniedSignOutButton: document.getElementById('deniedSignOutButton'),
  loginStatus: document.getElementById('loginStatus'),
  deniedEmail: document.getElementById('deniedEmail'),
  userAvatar: document.getElementById('userAvatar'),
  userName: document.getElementById('userName'),
  userEmail: document.getElementById('userEmail'),
  userRole: document.getElementById('userRole'),
  accessStatus: document.getElementById('accessStatus'),
  roleStatus: document.getElementById('roleStatus'),
  apiStatus: document.getElementById('apiStatus')
};

let auth = null;
let db = null;
let currentUserProfile = null;
let currentPermissions = { ...DEFAULT_PERMISSIONS };

function getLocalRoleForEmail(email) {
  const normalizedEmail = String(email || '').toLowerCase();

  if (ADMIN_EMAILS.includes(normalizedEmail)) return 'Admin';
  return null;
}

function hasFirebaseConfig(config) {
  return Boolean(
    config.apiKey &&
    config.authDomain &&
    config.projectId &&
    config.messagingSenderId &&
    config.appId
  );
}

function setStatus(message, type = 'info') {
  if (!els.loginStatus) return;
  els.loginStatus.textContent = message;
  els.loginStatus.dataset.type = type;
}

function showOnly(view) {
  [els.loginView, els.deniedView, els.appShell].forEach((el) => {
    if (!el) return;
    el.classList.toggle('hidden', el !== view);
  });
}

function renderSignedOut() {
  showOnly(els.loginView);
  setStatus(
    hasFirebaseConfig(firebaseConfig)
      ? 'S\u1eb5n s\u00e0ng \u0111\u0103ng nh\u1eadp b\u1eb1ng Google.'
      : 'Thi\u1ebfu Firebase web config DEV.',
    hasFirebaseConfig(firebaseConfig) ? 'success' : 'warning'
  );
}

function renderDenied(user) {
  showOnly(els.deniedView);

  if (els.deniedEmail) {
    els.deniedEmail.textContent = `${user.email || 'Email n\u00e0y'} ch\u01b0a n\u1eb1m trong allowlist DEV.`;
  }
}

function formatRole(role) {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'PMO') return 'PMO';
  if (role === 'EDITOR') return 'Editor';
  if (role === 'REPORTER') return 'Reporter';
  if (role === 'VIEWER') return 'Viewer';
  if (role === 'GUEST_VIEWER') return 'Guest Viewer';
  return role || 'Kh\u00f4ng x\u00e1c \u0111\u1ecbnh';
}

function normalizeRoleKey(role) {
  return String(role || '').trim().toUpperCase();
}

function isReadOnlyViewer(profile = currentUserProfile) {
  const role = normalizeRoleKey(profile && profile.role);
  return role === 'VIEWER' || role === 'GUEST_VIEWER' || !canEditPlanning(profile);
}

function isAuthenticatedUser(profile = currentUserProfile) {
  return !!(profile && profile.email);
}

function canViewMainMilestoneColumn(profile = currentUserProfile) {
  return isAuthenticatedUser(profile);
}

function canSelectMainMilestone(profile = currentUserProfile) {
  return canEditPlanning(profile);
}

function canResetMainMilestone(profile = currentUserProfile) {
  return canEditPlanning(profile);
}

function canExportExcel(profile = currentUserProfile) {
  return isAuthenticatedUser(profile);
}

function canApprove(profile = currentUserProfile) {
  const role = normalizeRoleKey(profile && profile.role);
  return ['ADMIN', 'PMO'].includes(role);
}

function canAdmin(profile = currentUserProfile) {
  return normalizeRoleKey(profile && profile.role) === 'ADMIN';
}

function canEditPlanning(profile = currentUserProfile) {
  const role = normalizeRoleKey(profile && profile.role);
  return ['ADMIN', 'PMO', 'EDITOR'].includes(role);
}

function normalizePermissions(permissions = {}, role = '') {
  const roleKey = normalizeRoleKey(role);
  const canViewCore = ['ADMIN', 'PMO', 'EDITOR', 'REPORTER', 'VIEWER', 'GUEST_VIEWER'].includes(roleKey);

  return {
    dashboard: !!permissions.dashboard || canViewCore,
    gantt: !!permissions.gantt || canViewCore,
    lookup: !!permissions.lookup || canViewCore,
    reportUpdate: roleKey !== 'VIEWER' && !!permissions.reportUpdate,
    admin: canAdmin({ role }) || !!permissions.admin
  };
}

function setApiStatus(message) {
  if (els.apiStatus) els.apiStatus.textContent = message;
}

function getNavButtonByLabel(label) {
  const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
  return candidates.find((el) => String(el.textContent || '').trim().toLowerCase() === label.toLowerCase());
}

function setNavVisibility(label, allowed) {
  const el = getNavButtonByLabel(label);
  if (!el) return;

  el.classList.toggle('hidden', !allowed);
  el.hidden = !allowed;
  el.disabled = !allowed;
  el.setAttribute('aria-hidden', allowed ? 'false' : 'true');
}

function applyPermissions(profile = {}) {
  currentUserProfile = profile;
  currentPermissions = normalizePermissions(profile.permissions || DEFAULT_PERMISSIONS, profile.role);

  setNavVisibility('Dashboard', currentPermissions.dashboard);
  setNavVisibility('Gantt', currentPermissions.gantt);
  setNavVisibility('Tra c\u1ee9u', currentPermissions.lookup);
  setNavVisibility('B\u00e1o c\u1eadp nh\u1eadt', currentPermissions.reportUpdate);
  setNavVisibility('Admin', currentPermissions.admin);
}


function getStoredProjectCode() {
  try {
    return localStorage.getItem(PROJECT_STORAGE_KEY) || '';
  } catch (error) {
    console.warn('Cannot read selected project from localStorage', error);
    return '';
  }
}

function setStoredProjectCode(projectCode) {
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, projectCode || '');
  } catch (error) {
    console.warn('Cannot save selected project to localStorage', error);
  }
}

function findAppHeaderContainer() {
  return document.querySelector('.app-main') ||
    document.querySelector('main') ||
    els.appShell;
}

function renderProjectOptions(projects = []) {
  ensureProjectSelector();
  qltdProjectRegistry = Array.isArray(projects) ? projects : [];

  const selector = document.getElementById('projectSelector');
  const status = document.getElementById('projectSelectorStatus');
  if (!selector) return;

  const storedProjectCode = getStoredProjectCode();
  selector.innerHTML = '';

  if (!projects.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Ch\u01b0a c\u00f3 d\u1ef1 \u00e1n ACTIVE';
    selector.appendChild(option);
    selector.disabled = true;
    qltdGanttPayload = null;
    if (status) {
      status.textContent = 'Ch\u01b0a c\u00f3 d\u1ef1 \u00e1n';
      status.classList.remove('hidden');
    }
    renderNoProjectDashboardState();
    renderNoProjectGanttState();
    return;
  }

  projects.forEach((project) => {
    const option = document.createElement('option');
    option.value = project.projectCode;
    option.textContent = `${project.projectCode} - ${project.projectName}`;
    selector.appendChild(option);
  });

  const hasStoredProject = projects.some((project) => project.projectCode === storedProjectCode);
  selector.value = hasStoredProject ? storedProjectCode : projects[0].projectCode;
  setStoredProjectCode(selector.value);
  loadGanttDataForSelectedProject(selector.value);

  if (status) {
    status.textContent = '';
    status.classList.add('hidden');
  }

  selector.disabled = false;
  selector.onchange = () => {
    setStoredProjectCode(selector.value);
    if (qltdActiveView === 'report') loadDeptPlansForSelectedProject(selector.value);
    loadGanttDataForSelectedProject(selector.value);
  };
}

async function loadProjectsForSelector() {
  try {
    const payload = await fetchBackendJson('listProjects');
    if (!payload.success) {
      throw new Error(payload.message || 'listProjects failed');
    }
    renderProjectOptions(payload.projects || []);
  } catch (error) {
    console.error('Cannot load project registry', error);
    ensureProjectSelector();
    const status = document.getElementById('projectSelectorStatus');
    if (status) {
      status.textContent = 'Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c danh s\u00e1ch d\u1ef1 \u00e1n';
      status.classList.remove('hidden');
    }
    renderDashboardError(error);
    renderGanttError(error);
  }
}



// WEB-04B.2 compact UI overrides
let qltdDeptPlanPayload = null;
let qltdSelectedDeptCode = '';
let qltdDeptPlanRequestSeq = 0;
const qltdDeptPlanCache = new Map();
const QLTD_DEPT_PLAN_CACHE_MS = 120000;

function qltdDevPerfEnabled() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname) || new URLSearchParams(window.location.search).has('debugPerf');
}

function findPrimaryNavContainer() {
  const labels = ['Dashboard', 'Gantt', 'Tra c\u1ee9u', 'B\u00e1o c\u1eadp nh\u1eadt', 'Admin'];
  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
  const dashboardButton = buttons.find((el) => String(el.textContent || '').trim() === labels[0]);

  if (dashboardButton && dashboardButton.parentElement) {
    return dashboardButton.parentElement;
  }

  return document.querySelector('nav') || document.querySelector('.nav') || els.appShell;
}

function ensureProjectSelector() {
  if (!els.appShell) return null;

  let wrapper = document.getElementById('projectSelectorPanel');
  if (wrapper) return wrapper;

  wrapper = document.createElement('div');
  wrapper.id = 'projectSelectorPanel';
  wrapper.className = 'nav-control nav-project-control';
  wrapper.innerHTML = `
    <label class="nav-control-label" for="projectSelector">D\u1ef1 \u00e1n</label>
    <select id="projectSelector" class="nav-control-select">
      <option value="">\u0110ang t\u1ea3i...</option>
    </select>
    <span id="projectSelectorStatus" class="nav-control-status hidden"></span>
  `;

  const nav = findPrimaryNavContainer();
  if (nav) {
    nav.appendChild(wrapper);
  }

  return wrapper;
}

function ensureDeptSelector() {
  ensureDeptPlanPanel();
  return document.getElementById('deptSelectorPanel');
}

function ensureDeptPlanPanel() {
  if (!els.appShell) return null;

  let panel = document.getElementById('deptPlanPanel');
  if (panel) return panel;

  panel = document.createElement('section');
  panel.id = 'deptPlanPanel';
  panel.className = `dept-plan-panel compact ${qltdActiveView === 'report' ? '' : 'hidden'}`;
  panel.innerHTML = `
    <div class="dept-plan-card">
      <div class="dept-plan-header">
        <div>
          <h2>Ph\u00e2n b\u1ed5 ph\u00f2ng/ban theo d\u1ef1 \u00e1n</h2>
          <p id="deptPlanSubTitle" class="dept-plan-subtitle">Ch\u1ecdn d\u1ef1 \u00e1n v\u00e0 ph\u00f2ng/ban \u0111\u1ec3 xem danh s\u00e1ch m\u1ee5c ti\u00eau.</p>
        </div>
        <span id="deptPlanStatus" class="dept-plan-status">Ch\u01b0a t\u1ea3i d\u1eef li\u1ec7u</span>
      </div>
      <div id="deptSelectorPanel" class="dept-plan-filter">
        <label for="deptSelector">Ph\u00f2ng/ban</label>
        <select id="deptSelector" disabled>
          <option value="">Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u</option>
        </select>
      </div>
      <div id="deptPlanContent" class="dept-plan-content"></div>
    </div>
  `;

  els.appShell.appendChild(panel);

  return panel;
}

function ensureWeb07InlineStyles() {
  if (document.getElementById('web07InlineStyles')) return;

  const style = document.createElement('style');
  style.id = 'web07InlineStyles';
  style.textContent = `
    .web07-panel {
      width: min(1800px, calc(100vw - 48px));
      max-width: none;
      margin: 18px auto 40px;
    }

    body.qltd-dashboard-mode #web07DashboardPanel {
      width: calc(100vw - 56px);
      max-width: none;
      margin: 18px auto 40px;
    }

    body.qltd-gantt-mode .web07-panel {
      width: min(1800px, calc(100vw - 48px));
      max-width: none;
    }

    body.qltd-gantt-mode #web07GanttPanel {
      width: calc(100vw - 32px);
      max-width: none;
      margin: 12px auto;
    }

    body.qltd-gantt-mode #web07GanttPanel .web07-card {
      padding: 14px;
    }

    .web07-card {
      border: 1px solid #d7e0ea;
      border-radius: 14px;
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(16, 32, 51, .06);
      padding: 20px;
    }

    .web07-header,
    .web07-toolbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }

    .web07-toolbar-group,
    .web07-link-legend {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
    }

    .web07-header h2 {
      margin: 0 0 5px;
      color: #102033;
      font-size: 20px;
    }

    .web07-subtitle,
    .web07-muted {
      margin: 0;
      color: #67738a;
      font-size: 13px;
    }

    .web07-chip {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border-radius: 999px;
      background: #e8f4f1;
      color: #0c7164;
      font-size: 12px;
      font-weight: 800;
      padding: 5px 10px;
      white-space: nowrap;
    }

    .web07-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .web07-table th,
    .web07-table td {
      border-bottom: 1px solid #edf1f5;
      padding: 8px 7px;
      text-align: left;
      vertical-align: top;
    }

    .web07-toolbar input,
    .web07-toolbar select {
      height: 32px;
      border: 1px solid #cbd6e2;
      border-radius: 8px;
      padding: 0 9px;
      background: #ffffff;
      color: #102033;
      font: inherit;
      font-size: 13px;
    }

    .web07-toolbar button {
      height: 32px;
      border: 1px solid #cbd6e2;
      border-radius: 8px;
      padding: 0 10px;
      background: #ffffff;
      color: #102033;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }

    .web07-toolbar button.active {
      border-color: #0f766e;
      background: #0f766e;
      color: #ffffff;
    }

    .web07-link-legend {
      color: #475569;
      font-size: 12px;
      font-weight: 700;
    }

    .web07-link-legend.is-muted {
      opacity: .45;
    }

    .web07-link-sample {
      width: 20px;
      height: 3px;
      border-radius: 999px;
      display: inline-block;
      background: #64748b;
    }

    .web07-link-sample.ss { background: #2563eb; }
    .web07-link-sample.ff { background: #7c3aed; }
    .web07-link-sample.sf { background: #ef4444; }

    .web07-gantt-box {
      width: 100%;
      height: calc(100vh - 260px);
      min-height: 620px;
      border: 1px solid #d7e0ea;
      border-radius: 10px;
      overflow: hidden;
    }

    body.qltd-gantt-mode .web07-gantt-box {
      height: calc(100vh - 230px);
      min-height: 680px;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-done {
      background: #16a34a;
      border-color: #15803d;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-active {
      background: #0f766e;
      border-color: #0f766e;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-overdue {
      background: #dc2626;
      border-color: #b91c1c;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-paused {
      background: #a16207;
      border-color: #854d0e;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-not-started {
      background: #64748b;
      border-color: #475569;
    }

    #web07GanttContainer .gantt_task_line.qltd-gantt-milestone {
      background: #7c3aed;
      border-color: #6d28d9;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-unknown {
      background: #98a2b3;
      border-color: #667085;
    }

    #web07GanttContainer .gantt_row.main-milestone-row .gantt_cell,
    #web07GanttContainer .gantt_task_row.main-milestone-row {
      background: #fff7ed !important;
    }

    .main-milestone-cell {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      color: #64748b;
      font-size: 15px;
      cursor: pointer;
      user-select: none;
    }

    .main-milestone-cell.is-selected {
      color: #d97706;
    }

    .main-milestone-cell.is-readonly {
      cursor: default;
    }

    #web07GanttContainer .gantt_task_progress {
      background: rgba(255, 255, 255, .28);
    }

    .web07-alert-row {
      cursor: pointer;
    }

    .web07-alert-row:hover td {
      background: #f8fafc;
    }

    .web07-gantt-box.is-fallback {
      height: min(68vh, 720px);
      min-height: 480px;
    }

    #web07GanttContainer .gantt_task_link {
      --dependency-link-color: #64748b;
      opacity: .68 !important;
    }

    #web07GanttContainer .gantt_task_link.qltd-link-fs { --dependency-link-color: #64748b; }
    #web07GanttContainer .gantt_task_link.qltd-link-ss { --dependency-link-color: #2563eb; }
    #web07GanttContainer .gantt_task_link.qltd-link-ff { --dependency-link-color: #7c3aed; }
    #web07GanttContainer .gantt_task_link.qltd-link-sf { --dependency-link-color: #ef4444; }

    #web07GanttContainer .gantt_task_link .gantt_line_wrapper {
      background: transparent !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_line_wrapper div {
      background-color: var(--dependency-link-color) !important;
      border-color: var(--dependency-link-color) !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_link_arrow_right {
      border-left-color: var(--dependency-link-color) !important;
      border-right-color: transparent !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_link_arrow_left {
      border-right-color: var(--dependency-link-color) !important;
      border-left-color: transparent !important;
    }

    body.qltd-printing > :not(.qltd-gantt-print-root) {
      display: none !important;
    }

    @media print {
      @page {
        size: A4 landscape;
        margin: 8mm;
      }

      body.qltd-printing > :not(.qltd-gantt-print-root) {
        display: none !important;
      }

      body.qltd-printing {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }

      .qltd-gantt-print-root {
        display: block !important;
        position: static !important;
        width: max-content !important;
        min-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        page-break-before: avoid !important;
        break-before: avoid !important;
      }

      .qltd-gantt-print-title {
        margin: 0 0 8px !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        line-height: 1.25 !important;
        color: #111827 !important;
      }

      .qltd-gantt-print-root .web07-toolbar {
        display: none !important;
      }

      .qltd-gantt-print-root #web07GanttPanel,
      .qltd-gantt-print-root #web07GanttContainer {
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
    }

    .web07-fallback-table-wrap {
      max-height: 520px;
      overflow: auto;
      border: 1px solid #e1e8ef;
      border-radius: 10px;
    }

    .web07-warning-list {
      margin: 10px 0 0;
      padding-left: 18px;
      color: #a15c07;
      font-size: 13px;
    }

    @media (max-width: 900px) {
      .web07-panel {
        width: calc(100vw - 28px);
      }

      .web07-gantt-box {
        min-height: 420px;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureWeb07Panels() {
  if (!els.appShell) return;
  ensureWeb07InlineStyles();

  let dashboard = document.getElementById('web07DashboardPanel');
  if (!dashboard) {
    dashboard = document.createElement('section');
    dashboard.id = 'web07DashboardPanel';
    dashboard.className = 'web07-panel';
    dashboard.innerHTML = '<div class="web07-card"><p class="empty-state">Đang chuẩn bị Dashboard...</p></div>';
    els.appShell.appendChild(dashboard);
  }

  let ganttPanel = document.getElementById('web07GanttPanel');
  if (!ganttPanel) {
    ganttPanel = document.createElement('section');
    ganttPanel.id = 'web07GanttPanel';
    ganttPanel.className = 'web07-panel hidden';
    ganttPanel.innerHTML = '<div class="web07-card"><p class="empty-state">Đang chuẩn bị Gantt...</p></div>';
    els.appShell.appendChild(ganttPanel);
  }

  let adminPanel = document.getElementById('web07AdminPanel');
  if (!adminPanel) {
    adminPanel = document.createElement('section');
    adminPanel.id = 'web07AdminPanel';
    adminPanel.className = 'web07-panel admin-panel hidden';
    adminPanel.innerHTML = '<div class="web07-card"><p class="empty-state">Đang chuẩn bị Admin...</p></div>';
    els.appShell.appendChild(adminPanel);
  }
}

function showWeb07View(viewName) {
  qltdActiveView = viewName;
  ensureWeb07Panels();
  if (viewName === 'report') ensureDeptPlanPanel();
  document.body.classList.toggle('qltd-dashboard-mode', viewName === 'dashboard');
  document.body.classList.toggle('qltd-gantt-mode', viewName === 'gantt');
  document.body.classList.toggle('qltd-report-mode', viewName === 'report');
  document.body.classList.toggle('qltd-admin-mode', viewName === 'admin');

  const dashboard = document.getElementById('web07DashboardPanel');
  const ganttPanel = document.getElementById('web07GanttPanel');
  const adminPanel = document.getElementById('web07AdminPanel');
  const deptPanel = document.getElementById('deptPlanPanel');
  const placeholder = document.querySelector('.placeholder-panel');
  const summary = document.querySelector('.content-grid');

  if (summary) summary.classList.add('hidden');
  if (placeholder) placeholder.classList.add('hidden');
  if (dashboard) dashboard.classList.toggle('hidden', viewName !== 'dashboard');
  if (ganttPanel) ganttPanel.classList.toggle('hidden', viewName !== 'gantt');
  if (adminPanel) adminPanel.classList.toggle('hidden', viewName !== 'admin');
  if (deptPanel) deptPanel.classList.toggle('hidden', viewName !== 'report');

  ['Dashboard', 'Gantt', 'Báo cập nhật', 'Admin'].forEach((label) => {
    const button = getNavButtonByLabel(label);
    if (button) button.classList.toggle('active', (
      (label === 'Dashboard' && viewName === 'dashboard') ||
      (label === 'Gantt' && viewName === 'gantt') ||
      (label === 'Báo cập nhật' && viewName === 'report') ||
      (label === 'Admin' && viewName === 'admin')
    ));
  });

  if (viewName === 'gantt') {
    setTimeout(() => {
      const gantt = getDhtmlxGanttInstance();
      if (gantt && gantt.setSizes) gantt.setSizes();
      if (qltdGanttPayload) renderGanttPanel(qltdGanttPayload);
    }, 80);
  }

  if (viewName === 'report') {
    const projectCode = document.getElementById('projectSelector')?.value || '';
    if (projectCode) loadDeptPlansForSelectedProject(projectCode);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  if (viewName === 'admin') {
    renderAdminPanel();
    loadAdminMasterApprovals();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

function bindWeb07Navigation() {
  const bindings = [
    ['Dashboard', 'dashboard'],
    ['Gantt', 'gantt'],
    ['Báo cập nhật', 'report'],
    ['Admin', 'admin']
  ];

  bindings.forEach(([label, viewName]) => {
    const button = getNavButtonByLabel(label);
    if (!button || button.dataset.web07Bound === '1') return;
    button.dataset.web07Bound = '1';
    button.addEventListener('click', () => {
      showWeb07View(viewName);
    });
  });
}

function renderAdminPanel() {
  const panel = document.getElementById('web07AdminPanel');
  if (!panel) return;
  if (!canAdmin()) {
    panel.innerHTML = '<div class="web07-card"><p class="empty-state">Bạn không có quyền Admin.</p></div>';
    return;
  }
  const state = qltdAdminApprovalView;
  panel.innerHTML = `<div class="web07-card admin-approval-card">
    <div class="admin-approval-heading">
      <div><span>Weekly workflow</span><h2>YÊU CẦU CẬP NHẬT HOÀN THÀNH MASTER</h2><p>Admin chỉ duyệt/không duyệt yêu cầu. Hệ thống không tự cập nhật Cong_viec, cột W hoặc tính lại tiến độ.</p></div>
      <button type="button" class="secondary-button" id="reloadMasterApprovalsButton">${state.loading ? 'Đang tải...' : 'Tải lại'}</button>
    </div>
    ${state.error ? `<p class="weekly-update-note is-error">${escapeHtml(state.error)}</p>` : ''}
    ${renderAdminMasterApprovals(state.approvals || [])}
  </div>`;
  const reload = document.getElementById('reloadMasterApprovalsButton');
  if (reload) reload.onclick = () => loadAdminMasterApprovals({ force: true });
  document.querySelectorAll('[data-master-approval-approve]').forEach((button) => {
    button.onclick = () => reviewMasterApproval(button.dataset.masterApprovalApprove || '', 'APPROVED');
  });
  document.querySelectorAll('[data-master-approval-reject]').forEach((button) => {
    button.onclick = () => {
      const updateId = button.dataset.masterApprovalReject || '';
      const reason = window.prompt('Nhập lý do không duyệt yêu cầu hoàn thành MASTER:');
      if (!String(reason || '').trim()) return;
      reviewMasterApproval(updateId, 'REJECTED', reason);
    };
  });
}

function renderAdminMasterApprovals(approvals) {
  if (!approvals.length) return '<p class="empty-state">Không có yêu cầu PENDING.</p>';
  return `<div class="admin-approval-table-wrap"><table class="dept-plan-table admin-approval-table"><thead><tr><th>Dự án</th><th>Phòng/Ban</th><th>WBS</th><th>Công việc</th><th>Trạng thái đề xuất</th><th>Ngày HT đề xuất</th><th>Người gửi</th><th>Trạng thái duyệt</th><th>Thao tác</th></tr></thead><tbody>${approvals.map((item) => `<tr><td>${escapeHtml(item.projectCode || '')}</td><td>${escapeHtml(item.deptCode || '')}</td><td class="mono">${escapeHtml(item.wbs || '')}</td><td>${escapeHtml(item.taskName || item.itemId || '')}</td><td>${escapeHtml(item.taskStatus || '')} · ${escapeHtml(item.progressEnd ?? '')}%</td><td>${escapeHtml(formatIsoDateVi(item.actualFinish || '') || '—')}</td><td>${escapeHtml(item.updatedBy || '')}</td><td><span class="approval-status-badge is-${escapeHtml(String(item.approvalStatus || '').toLowerCase())}">${escapeHtml(formatApprovalStatus(item.approvalStatus))}</span></td><td><div class="admin-approval-actions"><button type="button" class="weekly-update-button" data-master-approval-approve="${escapeHtml(item.updateId || '')}">Duyệt</button><button type="button" class="secondary-button" data-master-approval-reject="${escapeHtml(item.updateId || '')}">Không duyệt</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function formatApprovalStatus(status) {
  const code = String(status || '').toUpperCase();
  if (code === 'PENDING') return 'Chờ Admin duyệt';
  if (code === 'APPROVED') return 'Admin đã duyệt, chờ cập nhật Cong_viec';
  if (code === 'REJECTED') return 'Không duyệt';
  return '—';
}

async function loadAdminMasterApprovals() {
  if (!canAdmin()) return;
  const seq = ++qltdAdminApprovalRequestSeq;
  qltdAdminApprovalView = { loading: true, error: '', approvals: qltdAdminApprovalView.approvals || [] };
  renderAdminPanel();
  try {
    const projectCode = document.getElementById('projectSelector')?.value || getStoredProjectCode() || '';
    const result = await fetchBackendJson('weekly_masterapprovals_get', { email: currentUserProfile?.email || '', projectCode, status: 'PENDING' });
    if (seq !== qltdAdminApprovalRequestSeq) return;
    if (!result.success) throw new Error(result.message || result.error?.message || result.code || result.error?.code || 'Không tải được yêu cầu duyệt.');
    const data = result.data || result;
    qltdAdminApprovalView = { loading: false, error: '', approvals: Array.isArray(data.approvals) ? data.approvals : [] };
  } catch (error) {
    if (seq !== qltdAdminApprovalRequestSeq) return;
    qltdAdminApprovalView = { loading: false, error: error.message || 'Không tải được yêu cầu duyệt.', approvals: [] };
  }
  renderAdminPanel();
}

async function reviewMasterApproval(updateId, approvalStatus, reviewReason = '') {
  if (!updateId) return;
  if (approvalStatus === 'APPROVED') {
    const ok = window.confirm('Sau khi duyệt, Admin cần tự cập nhật Cong_viec và cột W. Hệ thống sẽ không tự cập nhật Master. Tiếp tục?');
    if (!ok) return;
  }
  try {
    const result = await postBackendJson({ action: 'weekly_masterapproval_review', email: currentUserProfile?.email || '', updateId, approvalStatus, reviewReason });
    if (!result.success) throw new Error(result.message || result.error?.message || result.code || result.error?.code || 'Không cập nhật được trạng thái duyệt.');
    await loadAdminMasterApprovals({ force: true });
  } catch (error) {
    window.alert(error.message || 'Không cập nhật được trạng thái duyệt.');
  }
}


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getDefaultMonthCode(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function toIsoDateLocal(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function ensureDeptPlanInlineStyles() {
  if (document.getElementById('deptPlanInlineStyles')) return;

  const style = document.createElement('style');
  style.id = 'deptPlanInlineStyles';
  style.textContent = `
    .dept-plan-period-toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin: 12px 0 14px;
      padding: 10px 12px;
      border: 1px solid #bfdbfe;
      border-left: 4px solid var(--qltd-period-accent);
      border-radius: 14px;
      background: #f8fbff;
    }

    .dept-plan-period-toolbar input[type="month"] {
      min-width: 170px;
      height: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 0 10px;
      background: #ffffff;
      font-weight: 600;
      color: #0f172a;
    }

    .week-period-section {
      margin: 8px 0 18px;
      padding: 14px;
      border: 1px solid #bfdbfe;
      border-left: 4px solid var(--qltd-period-accent);
      border-radius: 16px;
      background: #f8fbff;
    }

    .week-period-section-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .week-period-kicker {
      font-size: 11px;
      color: #64748b;
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
    }

    .week-period-title-main {
      margin-top: 3px;
      color: #0f172a;
      font-weight: 800;
      font-size: 15px;
    }

    .week-period-legend {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .week-period-chip {
      display: inline-flex;
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 12px;
      font-weight: 700;
      background: #e0f2fe;
      color: #075985;
      border: 1px solid #bae6fd;
      white-space: nowrap;
    }

    .week-period-chip.partial {
      background: #fff7ed;
      color: #9a3412;
      border-color: #fed7aa;
    }

    .week-period-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 10px;
    }

    .week-period-card {
      border: 1px solid #dbe6f1;
      border-radius: 14px;
      background: #ffffff;
      padding: 12px;
      box-shadow: 0 6px 16px rgba(15, 23, 42, .05);
    }

    .week-period-card.is-selected {
      border-color: var(--qltd-period-accent);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, .12);
    }

    .week-period-card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .week-period-badge {
      display: inline-flex;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      font-weight: 800;
      background: #ecfeff;
      color: #0f766e;
      border: 1px solid #99f6e4;
    }

    .week-period-days {
      font-size: 12px;
      color: #64748b;
      font-weight: 700;
    }

    .week-period-range {
      font-size: 18px;
      line-height: 1.25;
      color: #0f172a;
      font-weight: 900;
      margin-bottom: 10px;
    }

    .week-period-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      border-top: 1px dashed #e2e8f0;
      padding-top: 7px;
      margin-top: 7px;
      font-size: 12px;
      color: #64748b;
    }

    .week-period-row strong {
      color: #334155;
      font-weight: 700;
      text-align: right;
    }

    .week-cross-month { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #92400e; font-size: 11px; }

    .weekly-update-panel {
      margin: 14px 0 18px;
      padding: 14px;
      border: 1px solid #fde68a;
      border-left: 4px solid var(--qltd-weekly-accent);
      border-radius: 16px;
      background: #fffbeb;
    }

    .weekly-update-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .weekly-period-control { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .weekly-period-control label { color: #78350f; font-size: 12px; font-weight: 900; }
    .weekly-period-control select { min-width: 230px; min-height: 36px; border: 1px solid #fbbf24; border-radius: 10px; background: #fff; padding: 0 10px; font: inherit; font-weight: 700; }

    .weekly-update-title {
      font-size: 16px;
      font-weight: 900;
      color: #0f172a;
    }

    .weekly-update-meta {
      margin-top: 4px;
      font-size: 12px;
      color: #64748b;
    }

    .weekly-update-grid {
      display: grid;
      grid-template-columns: 1fr 180px;
      gap: 12px;
      margin-bottom: 12px;
    }

    .weekly-update-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .weekly-update-field label {
      font-size: 12px;
      font-weight: 800;
      color: #334155;
    }

    .weekly-update-field textarea,
    .weekly-update-field input,
    .weekly-update-field select {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 10px 11px;
      font: inherit;
      color: #0f172a;
      background: #ffffff;
      box-sizing: border-box;
    }

    .weekly-update-field textarea {
      min-height: 74px;
      resize: vertical;
    }

    .weekly-update-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      border-top: 1px dashed #bfdbfe;
      padding-top: 12px;
    }

    .weekly-update-button {
      border: 0;
      border-radius: 999px;
      padding: 9px 14px;
      font-weight: 800;
      cursor: pointer;
      background: #0f766e;
      color: #ffffff;
      box-shadow: 0 8px 18px rgba(15, 118, 110, .18);
    }

    .weekly-update-note {
      font-size: 12px;
      color: #64748b;
    }

    .weekly-target-toolbar {
      display: grid;
      grid-template-columns: minmax(300px, 2fr) minmax(220px, 1fr);
      gap: 10px;
      margin: 0 0 12px;
      padding: 12px;
      border: 1px solid #ddd6fe;
      border-left: 4px solid var(--qltd-master-accent);
      border-radius: 16px;
      background: #faf8ff;
    }

    .master-plan-period { display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 8px 12px; border-radius: 12px; background: #fff; border: 1px solid #ede9fe; }
    .master-plan-period span { color: #6d28d9; font-size: 12px; font-weight: 800; }
    .master-plan-period strong { color: #312e81; font-size: 14px; }
    .report-summary-section { margin: 14px 0 0; border: 1px solid #cbd5e1; border-left: 4px solid var(--qltd-summary-accent); border-radius: 14px; overflow: hidden; background: #fff; }
    .report-section-heading { padding: 11px 14px; background: #f8fafc; color: #334155; font-size: 14px; font-weight: 900; border-bottom: 1px solid #e2e8f0; }

    @media (max-width: 760px) {
      .weekly-update-grid,
      .weekly-target-toolbar {
        grid-template-columns: 1fr;
      }
      .weekly-update-header { flex-direction: column; }
      .weekly-period-control { width: 100%; justify-content: flex-start; }
      .weekly-period-control select { width: 100%; }
    }

    .week-period-id {
      margin-top: 8px;
      padding: 7px 8px;
      border-radius: 10px;
      background: #f1f5f9;
      color: #475569;
      font-size: 11px;
      word-break: break-all;
    }
  `;

  document.head.appendChild(style);
}

function formatIsoDateVi(isoDate) {
  if (isoDate instanceof Date && !isNaN(isoDate.getTime())) {
    return `${pad2(isoDate.getDate())}/${pad2(isoDate.getMonth() + 1)}/${isoDate.getFullYear()}`;
  }
  const parts = String(isoDate || '').split('-');
  if (parts.length !== 3) return isoDate || '';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function renderWeekPeriodsHtml(periods) {
  ensureDeptPlanInlineStyles();

  if (!Array.isArray(periods) || !periods.length) {
    return '<p class="empty-state">Không sinh được kỳ tuần cho tháng đang chọn.</p>';
  }

  const crossMonthCount = periods.filter((period) => period.isCrossMonth).length;

  return `
    <section class="week-period-section">
      <div class="week-period-section-header">
        <div>
          <div class="week-period-kicker">WEB-05A · Kỳ báo cáo động</div>
          <div class="week-period-title-main">${periods.length} kỳ tuần trong tháng đang xem</div>
        </div>
        <div class="week-period-legend">
          <span class="week-period-chip">${periods.length} tuần đủ 7 ngày</span>
          ${crossMonthCount ? `<span class="week-period-chip partial">${crossMonthCount} tuần giao tháng</span>` : ''}
        </div>
      </div>

      <div class="week-period-grid">
        ${periods.map((period) => {
          const isCrossMonth = !!period.isCrossMonth;
          return `
            <article class="week-period-card ${period.weekId === qltdSelectedWeekId ? 'is-selected' : ''}" data-week-id="${escapeHtml(period.weekId)}">
              <div class="week-period-card-top">
                <span class="week-period-badge">Tuần ${escapeHtml(period.weekNoInMonth)}</span>
                <span class="week-period-days">7 / 7 ngày</span>
              </div>

              <div class="week-period-range">
                ${escapeHtml(formatIsoDateVi(period.weekStart))} – ${escapeHtml(formatIsoDateVi(period.weekEnd))}
              </div>

              ${isCrossMonth ? `<div class="week-cross-month"><span class="week-period-chip partial">Tuần giao tháng</span><span>${escapeHtml(period.crossMonthDescription)}</span></div>` : ''}

              <div class="week-period-row">
                <span>Thứ Hai → Chủ nhật</span>
                <strong>${escapeHtml(formatIsoDateVi(period.weekStart))} → ${escapeHtml(formatIsoDateVi(period.weekEnd))}</strong>
              </div>

              <div class="week-period-id mono">
                ${escapeHtml(period.weekId)}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderDeptPlans(payload) {
  qltdDeptPlanPayload = enrichDeptPlanPayloadWithOfficialMasters(payload || null);
  ensureDeptSelector();
  ensureDeptPlanPanel();

  const deptSelector = document.getElementById('deptSelector');
  const status = document.getElementById('deptPlanStatus');
  const content = document.getElementById('deptPlanContent');

  if (!content || !deptSelector) return;

  payload = qltdDeptPlanPayload;

  if (!payload || !payload.success) {
    if (status) status.textContent = 'Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c d\u1eef li\u1ec7u';
    deptSelector.innerHTML = '<option value="">Kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u</option>';
    deptSelector.disabled = true;
    content.innerHTML = '';
    return;
  }

  const departments = payload.departments || [];
  deptSelector.innerHTML = '';

  if (!departments.length) {
    deptSelector.innerHTML = '<option value="">Ch\u01b0a c\u00f3 ph\u00f2ng/ban</option>';
    deptSelector.disabled = true;
    if (status) status.textContent = '0 ph\u00f2ng/ban';
    content.innerHTML = '<p class="empty-state">Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u ph\u00f2ng/ban cho d\u1ef1 \u00e1n n\u00e0y.</p>';
    return;
  }

  departments.forEach((dept) => {
    const option = document.createElement('option');
    const deptCode = dept.deptCode || dept.sheetName || '';
    const deptName = dept.deptName || '';
    option.value = deptCode;
    option.textContent = deptName && deptName !== deptCode ? `${deptName} (${deptCode})` : deptCode || 'Ph\u00f2ng/ban';
    deptSelector.appendChild(option);
  });

  const hasSelected = departments.some((dept) => (dept.deptCode || dept.sheetName) === qltdSelectedDeptCode);
  qltdSelectedDeptCode = hasSelected ? qltdSelectedDeptCode : (departments[0].deptCode || departments[0].sheetName || '');
  deptSelector.value = qltdSelectedDeptCode;
  deptSelector.disabled = false;
  deptSelector.onchange = () => {
    qltdSelectedDeptCode = deptSelector.value;
    renderSelectedDeptPlan();
  };

  renderSelectedDeptPlan();
}

function renderMasterPlanPeriod(master) {
  const start = formatIsoDateVi(master?.planStart || '');
  const finish = formatIsoDateVi(master?.planFinish || '');
  return `BĐ: ${escapeHtml(start || 'Chưa xác định')} · KT: ${escapeHtml(finish || 'Chưa xác định')}`;
}

function getDeptPlanMasterWbs(master) {
  return String(master?.officialWbs || master?.stt || master?.wbs || '').trim();
}

function normalizeTaskCode(value) {
  return String(value || '').trim().toUpperCase();
}

function getOfficialMasterMapFromGantt(payload = qltdGanttPayload) {
  const map = new Map();
  (payload?.data || []).forEach((task) => {
    [task.code, task.id].forEach((value) => {
      const key = normalizeTaskCode(value);
      if (key && !map.has(key)) map.set(key, task);
    });
  });
  return map;
}

function isOfficialMasterComplete(task) {
  const progress = Number(task?.percent ?? Math.round(Number(task?.progress || 0) * 100));
  const status = String(task?.status || '').toLocaleLowerCase('vi-VN');
  return progress >= 100 || !!(task?.actualFinish || task?.actualEnd) || status.includes('hoàn thành') || status.includes('complete') || status.includes('done');
}

function enrichDeptPlanPayloadWithOfficialMasters(payload) {
  if (!payload?.success || !Array.isArray(payload.departments) || !qltdGanttPayload?.data?.length) return payload;
  const officialMap = getOfficialMasterMapFromGantt();
  return {
    ...payload,
    departments: payload.departments.map((dept) => ({
      ...dept,
      masters: (dept.masters || []).map((master) => {
        const official = officialMap.get(normalizeTaskCode(master.masterCode));
        if (!official) return master;
        const progress = Number(official.percent ?? Math.round(Number(official.progress || 0) * 100));
        return {
          ...master,
          taskName: official.text || master.taskName || '',
          officialWbs: official.wbs || master.stt || '',
          planStart: official.baselineStart || official.start_date || master.planStart || '',
          planFinish: official.baselineEnd || official.end_date || official.deadline || master.planFinish || '',
          actualStart: official.actualStart || master.actualStart || '',
          actualFinish: official.actualFinish || official.actualEnd || master.actualFinish || '',
          progress: isNaN(progress) ? Number(master.progress || 0) : Math.max(0, Math.min(100, progress)),
          status: isOfficialMasterComplete(official) ? 'Hoàn thành' : (official.status || master.status || ''),
          officialSource: 'GANTT_CONG_VIEC',
          officialComplete: isOfficialMasterComplete(official)
        };
      })
    }))
  };
}

function dispatchDeptPlanRendered(payload, dept, master) {
  document.dispatchEvent(new CustomEvent('qltd:dept-plan-rendered', {
    detail: {
      projectCode: payload?.projectCode || '',
      deptCode: dept?.deptCode || dept?.sheetName || '',
      masterTaskCode: master?.masterCode || '',
      masterWbs: getDeptPlanMasterWbs(master),
      masterTaskName: master?.taskName || ''
    }
  }));
}

function renderSelectedDeptPlanLegacy() {
  const payload = qltdDeptPlanPayload;
  const status = document.getElementById('deptPlanStatus');
  const subtitle = document.getElementById('deptPlanSubTitle');
  const content = document.getElementById('deptPlanContent');

  if (!payload || !payload.success || !content) return;

  const departments = payload.departments || [];
  const dept = departments.find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || departments[0];

  if (!dept) {
    content.innerHTML = '<p class="empty-state">Chưa chọn phòng/ban.</p>';
    return;
  }

  const masters = dept.masters || [];
  const monthCode = qltdSelectedMonthCode || getDefaultMonthCode();
  const weekPeriods = getMonthWeekPeriods(monthCode);

  if (!masters.some((master) => master.masterCode === qltdSelectedMasterCode)) {
    qltdSelectedMasterCode = masters[0] ? masters[0].masterCode : '';
  }

  if (!weekPeriods.some((period) => period.weekId === qltdSelectedWeekId)) {
    qltdSelectedWeekId = weekPeriods[0] ? weekPeriods[0].weekId : '';
  }

  const selectedMaster = masters.find((master) => master.masterCode === qltdSelectedMasterCode) || masters[0] || null;
  const selectedWeek = weekPeriods.find((period) => period.weekId === qltdSelectedWeekId) || weekPeriods[0] || null;

  if (status) {
    status.textContent = `${departments.length} phòng/ban · đang xem ${dept.deptCode || dept.sheetName} · ${masters.length} mục tiêu · ${weekPeriods.length} kỳ tuần`;
  }

  if (subtitle) {
    subtitle.textContent = `${payload.projectCode || ''} - ${payload.projectName || ''}`;
  }

  const periodToolbarHtml = `
    <div class="dept-plan-period-toolbar">
      <label class="nav-control-label" for="reportMonthSelector">Tháng báo cáo</label>
      <input id="reportMonthSelector" class="nav-control-select" type="month" value="${escapeHtml(monthCode)}">
      <span class="dept-plan-subtitle">Tuần vận hành: Thứ 2–Chủ nhật. Tháng chỉ là lát cắt hiển thị.</span>
    </div>
    ${renderWeekPeriodsHtml(weekPeriods)}
  `;

  const weeklyTargetToolbarHtml = masters.length && weekPeriods.length ? `
    <div class="weekly-target-toolbar">
      <div class="weekly-update-field">
        <label for="weeklyMasterSelector">Mục tiêu/Công việc gốc</label>
        <select id="weeklyMasterSelector">
          ${masters.map((master) => `
            <option value="${escapeHtml(master.masterCode || '')}" ${master.masterCode === qltdSelectedMasterCode ? 'selected' : ''}>
              ${getDeptPlanMasterWbs(master) ? `${escapeHtml(getDeptPlanMasterWbs(master))} · ` : ''}${escapeHtml(master.taskName || '')}
            </option>
          `).join('')}
        </select>
      </div>
      <div class="master-plan-period">
        <span>Thời gian kế hoạch</span>
        <strong>${renderMasterPlanPeriod(selectedMaster)}</strong>
      </div>
    </div>
  ` : '';

  if (!masters.length) {
    content.innerHTML = `
      ${periodToolbarHtml}
      <p class="empty-state">Phòng/ban này chưa có mục tiêu/công việc gốc.</p>
    `;
    bindDeptPlanInteractiveControls();
    dispatchDeptPlanRendered(payload, dept, null);
    return;
  }

  content.innerHTML = `
    ${periodToolbarHtml}
    ${weeklyTargetToolbarHtml}
    <div id="pbDetailMount" class="pb-detail-mount" aria-live="polite"></div>
    <div id="weeklyUpdateMount">${renderWeeklyTaskUpdatePanel(payload, dept, selectedMaster, selectedWeek, weekPeriods)}</div>

    <section class="report-summary-section">
      <div class="report-section-heading">Tổng hợp mục tiêu phòng/ban</div>
      <div class="dept-plan-table-wrap">
      <table class="dept-plan-table">
        <thead>
          <tr>
            <th>WBS</th>
            <th>Mục tiêu/công việc gốc</th>
            <th>Hạn hoàn thành</th>
            <th>Slot chi tiết</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          ${masters.map((master) => {
            const slots = master.detailSlots || [];
            return `
              <tr>
                <td class="mono" title="Mã kỹ thuật: ${escapeHtml(master.masterCode || '')}">${escapeHtml(getDeptPlanMasterWbs(master))}</td>
                <td>
                  <div class="task-title">${escapeHtml(master.taskName || '')}</div>
                  ${master.contextName ? `<div class="task-context">${escapeHtml(master.contextName)}</div>` : ''}
                </td>
                <td>${escapeHtml(master.planFinish || '')}</td>
                <td>${escapeHtml(slots.length || 0)}</td>
                <td>${escapeHtml(master.status || 'Chưa cập nhật')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      </div>
    </section>
  `;

  bindDeptPlanInteractiveControls();
  bindWeeklyTaskUpdateControls();
  loadWeeklyTaskData(payload, dept, selectedWeek, weekPeriods);
  dispatchDeptPlanRendered(payload, dept, selectedMaster);
}

function getWeeklyDraftKey(projectCode, deptCode, masterCode, weekId) {
  return [projectCode || '', deptCode || '', masterCode || '', weekId || ''].join('::');
}

function renderWeeklyUpdatePanel(payload, dept, master, week, weekPeriods = []) {
  if (!master || !week) {
    return '<p class="empty-state">Chưa đủ dữ liệu để mở khung cập nhật tuần.</p>';
  }

  const deptCode = dept.deptCode || dept.sheetName || '';
  const draftKey = getWeeklyDraftKey(payload.projectCode, deptCode, master.masterCode, week.weekId);
  const draft = qltdWeeklyDrafts[draftKey] || {};

  return `
    <section class="weekly-update-panel">
      <div class="weekly-update-header">
        <div>
          <div class="weekly-update-title">Cập nhật kết quả tuần</div>
          <div class="weekly-update-meta">
            ${escapeHtml(deptCode)} · ${getDeptPlanMasterWbs(master) ? `${escapeHtml(getDeptPlanMasterWbs(master))} · ` : ''}${escapeHtml(master.taskName || '')}
          </div>
        </div>
        <div class="weekly-period-control">
          <label for="weeklyPeriodSelector">Kỳ tuần</label>
          <select id="weeklyPeriodSelector">
            ${weekPeriods.map((period) => `
              <option value="${escapeHtml(period.weekId)}" ${period.weekId === qltdSelectedWeekId ? 'selected' : ''}>
                Tuần ${escapeHtml(period.weekNoInMonth)} · ${escapeHtml(formatIsoDateVi(period.weekStart))}–${escapeHtml(formatIsoDateVi(period.weekEnd))}
              </option>
            `).join('')}
          </select>
          <span class="week-period-chip partial">Mock frontend · chưa ghi Sheet</span>
        </div>
      </div>

      <div class="weekly-update-grid">
        <div class="weekly-update-field">
          <label for="weeklyResultInput">Kết quả tuần</label>
          <textarea id="weeklyResultInput" placeholder="Nhập kết quả đã thực hiện trong kỳ tuần...">${escapeHtml(draft.result || '')}</textarea>
        </div>

        <div class="weekly-update-field">
          <label for="weeklyPercentInput">% hoàn thành</label>
          <input id="weeklyPercentInput" type="number" min="0" max="100" step="1" value="${escapeHtml(draft.percent || '')}" placeholder="0–100">
        </div>

        <div class="weekly-update-field">
          <label for="weeklyIssueInput">Vướng mắc/rủi ro</label>
          <textarea id="weeklyIssueInput" placeholder="Nêu vướng mắc, nguyên nhân, tác động nếu có...">${escapeHtml(draft.issue || '')}</textarea>
        </div>

        <div class="weekly-update-field">
          <label for="weeklyNextPlanInput">Kế hoạch tuần sau</label>
          <textarea id="weeklyNextPlanInput" placeholder="Nêu việc trọng tâm tuần sau...">${escapeHtml(draft.nextPlan || '')}</textarea>
        </div>
      </div>

      <div class="weekly-update-actions">
        <button id="saveWeeklyDraftButton" type="button" class="weekly-update-button">Lưu nháp trên giao diện</button>
        <span id="weeklyDraftStatus" class="weekly-update-note">Chưa ghi Google Sheet. Bước này chỉ kiểm tra UX và cấu trúc dữ liệu.</span>
      </div>
    </section>
  `;
}

function captureWeeklyDraft() {
  if (!qltdSelectedMasterCode || !qltdSelectedWeekId) return;
  const payload = qltdDeptPlanPayload || {};
  const departments = payload.departments || [];
  const dept = departments.find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || departments[0] || {};
  const deptCode = dept.deptCode || dept.sheetName || '';
  const hasFields = document.getElementById('weeklyResultInput');
  if (!hasFields) return;
  qltdWeeklyDrafts[getWeeklyDraftKey(payload.projectCode, deptCode, qltdSelectedMasterCode, qltdSelectedWeekId)] = {
    result: document.getElementById('weeklyResultInput')?.value || '',
    percent: document.getElementById('weeklyPercentInput')?.value || '',
    issue: document.getElementById('weeklyIssueInput')?.value || '',
    nextPlan: document.getElementById('weeklyNextPlanInput')?.value || ''
  };
}

function renderWeeklyUpdateRegion() {
  const mount = document.getElementById('weeklyUpdateMount');
  const payload = qltdDeptPlanPayload;
  if (!mount || !payload?.success) return;
  const departments = payload.departments || [];
  const dept = departments.find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || departments[0];
  const masters = dept?.masters || [];
  const master = masters.find((item) => item.masterCode === qltdSelectedMasterCode) || masters[0] || null;
  const periods = getMonthWeekPeriods(qltdSelectedMonthCode || getDefaultMonthCode());
  const week = periods.find((item) => item.weekId === qltdSelectedWeekId) || periods[0] || null;
  mount.innerHTML = renderWeeklyUpdatePanel(payload, dept || {}, master, week, periods);
  bindWeeklyUpdateControls();
}

function bindDeptPlanInteractiveControls() {
  const monthSelector = document.getElementById('reportMonthSelector');
  if (monthSelector) {
    monthSelector.onchange = () => {
      captureWeeklyDraft();
      qltdSelectedMonthCode = monthSelector.value || getDefaultMonthCode();
      qltdSelectedWeekId = '';
      renderSelectedDeptPlan();
    };
  }

  const masterSelector = document.getElementById('weeklyMasterSelector');
  if (masterSelector) {
    masterSelector.onchange = () => {
      captureWeeklyDraft();
      qltdSelectedMasterCode = masterSelector.value || '';
      renderSelectedDeptPlan();
    };
  }

  bindWeeklyTaskUpdateControls();
}

function bindWeeklyUpdateControls() {
  const weekSelector = document.getElementById('weeklyPeriodSelector');
  if (weekSelector) {
    weekSelector.onchange = () => {
      captureWeeklyDraft();
      qltdSelectedWeekId = weekSelector.value || '';
      document.querySelectorAll('.week-period-card[data-week-id]').forEach((card) => {
        card.classList.toggle('is-selected', card.getAttribute('data-week-id') === qltdSelectedWeekId);
      });
      renderWeeklyUpdateRegion();
    };
  }

  const saveButton = document.getElementById('saveWeeklyDraftButton');
  if (saveButton) {
    saveButton.onclick = () => {
      const payload = qltdDeptPlanPayload || {};
      const departments = payload.departments || [];
      const dept = departments.find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || departments[0] || {};
      const deptCode = dept.deptCode || dept.sheetName || '';
      const draftKey = getWeeklyDraftKey(payload.projectCode, deptCode, qltdSelectedMasterCode, qltdSelectedWeekId);

      qltdWeeklyDrafts[draftKey] = {
        result: document.getElementById('weeklyResultInput')?.value || '',
        percent: document.getElementById('weeklyPercentInput')?.value || '',
        issue: document.getElementById('weeklyIssueInput')?.value || '',
        nextPlan: document.getElementById('weeklyNextPlanInput')?.value || '',
        savedAt: new Date().toISOString()
      };

      const draftStatus = document.getElementById('weeklyDraftStatus');
      if (draftStatus) {
        draftStatus.textContent = `Đã lưu nháp trên giao diện lúc ${new Date().toLocaleTimeString('vi-VN')}. Chưa ghi Google Sheet.`;
      }
    };
  }
}

function getWeeklyTaskCacheKey(projectCode, deptCode, weekCode) {
  return [projectCode || '', deptCode || '', weekCode || ''].join('::');
}

function renderWeeklyTaskUpdatePanelLegacy(payload, dept, master, week, periods = []) {
  if (!master || !week) return '<p class="empty-state">Chưa đủ dữ liệu để mở khung cập nhật tuần.</p>';
  const deptCode = dept.deptCode || dept.sheetName || '';
  const key = getWeeklyTaskCacheKey(payload.projectCode, deptCode, week.weekId);
  const state = qltdWeeklyTaskView.key === key ? qltdWeeklyTaskView : { items: [], updates: [], nextItems: [], loading: true, error: '' };
  const selected = state.items.find((item) => `${item.itemType}:${item.itemId}` === qltdSelectedWeeklyItemKey) || state.items[0] || null;
  if (selected) qltdSelectedWeeklyItemKey = `${selected.itemType}:${selected.itemId}`;
  const saved = selected ? state.updates.find((update) => update.itemType === selected.itemType && update.itemId === selected.itemId) : null;
  const masterItems = state.items.filter((item) => item.itemType === 'MASTER');
  const detailItems = state.items.filter((item) => item.itemType === 'PB_DETAIL');
  const itemOptions = (items) => items.map((item) => `<option value="${escapeHtml(`${item.itemType}:${item.itemId}`)}" ${selected && item.itemType === selected.itemType && item.itemId === selected.itemId ? 'selected' : ''}>${escapeHtml(item.wbs ? `${item.wbs} · ${item.taskName}` : item.taskName)}</option>`).join('');
  return `
    <section class="weekly-update-panel">
      <div class="weekly-update-header"><div><div class="weekly-update-title">Cập nhật kết quả tuần</div><div class="weekly-update-meta">${escapeHtml(deptCode)} · cập nhật theo từng công việc</div></div>
        <div class="weekly-period-control"><label for="weeklyTaskPeriodSelector">Kỳ tuần</label><select id="weeklyTaskPeriodSelector">${periods.map((period) => `<option value="${escapeHtml(period.weekId)}" ${period.weekId === week.weekId ? 'selected' : ''}>Tuần ${escapeHtml(period.weekNoInMonth)} · ${escapeHtml(formatIsoDateVi(period.weekStart))}–${escapeHtml(formatIsoDateVi(period.weekEnd))}</option>`).join('')}</select><span class="week-period-chip ${state.error ? 'partial' : ''}">${state.loading ? 'Đang tải...' : state.error ? 'Có lỗi tải dữ liệu' : `${state.items.length} công việc`}</span></div>
      </div>
      ${state.error ? `<p class="weekly-update-note">${escapeHtml(state.error)}</p>` : ''}
      <div class="weekly-filter-row"><input id="weeklyTaskSearch" type="search" placeholder="Tìm WBS, tên hoặc mã..."><select id="weeklyTaskGroup"><option value="ALL">Tất cả</option><option value="OVERDUE">Quá hạn</option><option value="IN_PROGRESS">Đang thực hiện</option><option value="PLANNED">Trong kế hoạch tuần</option><option value="COMPLETED_THIS_WEEK">Hoàn thành trong tuần</option></select><select id="weeklyTaskItemSelector" ${!state.items.length ? 'disabled' : ''}>${masterItems.length ? `<optgroup label="MỤC TIÊU/CÔNG VIỆC GỐC">${itemOptions(masterItems)}</optgroup>` : ''}${detailItems.length ? `<optgroup label="VIỆC CHI TIẾT PHÒNG/BAN">${itemOptions(detailItems)}</optgroup>` : ''}</select></div>
      ${selected ? `<div class="weekly-selected-summary"><strong>${escapeHtml(selected.wbs ? `${selected.wbs} · ${selected.taskName}` : selected.taskName)}</strong><span>${renderMasterPlanPeriod(selected)}</span><span>${escapeHtml(selected.eligibleReason)}</span></div>` : '<p class="empty-state">Không có công việc cần cập nhật trong tuần này.</p>'}
      <div class="weekly-update-grid">
        <div class="weekly-update-field"><label for="weeklyTaskResult">Kết quả thực hiện trong tuần</label><textarea id="weeklyTaskResult" ${!selected ? 'disabled' : ''}>${escapeHtml(saved?.thisWeekResult || '')}</textarea></div>
        <div class="weekly-update-field"><label for="weeklyTaskProgress">Tiến độ lũy kế cuối tuần</label><input id="weeklyTaskProgress" type="number" min="0" max="100" value="${escapeHtml(saved?.progressEnd ?? selected?.progress ?? '')}" ${selected?.progressReadonly || !selected ? 'readonly' : ''}>${selected?.progressReadonly ? '<small>Readonly: MASTER có PB_DETAIL.</small>' : ''}</div>
        <div class="weekly-update-field"><label for="weeklyTaskStatus">Trạng thái</label><input id="weeklyTaskStatus" value="${escapeHtml(saved?.taskStatus || selected?.status || '')}" ${!selected ? 'disabled' : ''}></div>
        <div class="weekly-update-field"><label for="weeklyTaskIssue">Vướng mắc/Rủi ro</label><textarea id="weeklyTaskIssue" ${!selected ? 'disabled' : ''}>${escapeHtml(saved?.issue || '')}</textarea></div>
        <div class="weekly-update-field"><label for="weeklyTaskRecommendation">Giải pháp/Đề xuất</label><textarea id="weeklyTaskRecommendation" ${!selected ? 'disabled' : ''}>${escapeHtml(saved?.recommendation || '')}</textarea></div>
        <div class="weekly-update-field"><label for="weeklyTaskActualStart">Ngày bắt đầu thực tế</label><input id="weeklyTaskActualStart" type="date" value="${escapeHtml(saved?.actualStart || selected?.actualStart || '')}" ${!selected ? 'disabled' : ''}></div>
        <div class="weekly-update-field"><label for="weeklyTaskActualFinish">Ngày hoàn thành thực tế</label><input id="weeklyTaskActualFinish" type="date" value="${escapeHtml(saved?.actualFinish || selected?.actualFinish || '')}" ${!selected ? 'disabled' : ''}></div>
        ${selected?.hasBudget ? `<div class="weekly-budget-block"><div><span>Ngân sách kế hoạch</span><strong>${formatWeeklyCurrency(selected.plannedBudget)}</strong></div><div class="weekly-update-field"><label for="weeklyTaskBudget">Ngân sách tuần</label><input id="weeklyTaskBudget" type="number" min="0" value="${escapeHtml(saved?.budgetThisWeek || '')}"></div><div class="weekly-update-field"><label for="weeklyTaskBudgetNote">Ghi chú ngân sách</label><input id="weeklyTaskBudgetNote" value="${escapeHtml(saved?.budgetNote || '')}"></div><div><span>Lũy kế thực hiện</span><strong>${formatWeeklyCurrency(saved?.budgetCumulative || 0)}</strong></div></div>` : ''}
      </div>
      <div class="weekly-update-actions"><button id="saveWeeklyTaskUpdateButton" type="button" class="weekly-update-button" ${!selected ? 'disabled' : ''}>Lưu cập nhật tuần</button><span id="weeklyTaskSaveStatus" class="weekly-update-note">Không có form kế hoạch tuần sau.</span></div>
      ${renderWeeklySavedUpdates(state.updates, state.items)}
      ${renderWeeklyNextItems(state.nextItems)}
    </section>`;
}

function renderWeeklySavedUpdates(updates, items) {
  if (!updates.length) return '<section class="weekly-saved-section"><h3>Các cập nhật đã lưu trong tuần</h3><p class="empty-state">Chưa có cập nhật trong tuần.</p></section>';
  return `<section class="weekly-saved-section"><h3>Các cập nhật đã lưu trong tuần</h3><div class="dept-plan-table-wrap"><table class="dept-plan-table"><thead><tr><th>Loại</th><th>WBS</th><th>Công việc</th><th>Kết quả tuần</th><th>Tiến độ</th><th>Trạng thái</th><th>Duyệt</th><th>Ngân sách tuần</th><th>Người cập nhật</th><th>Thời điểm</th><th>Sửa</th></tr></thead><tbody>${updates.map((update) => { const item = items.find((candidate) => candidate.itemType === update.itemType && candidate.itemId === update.itemId) || {}; return `<tr><td>${escapeHtml(update.itemType)}</td><td>${escapeHtml(item.wbs || '')}</td><td>${escapeHtml(item.taskName || update.itemId)}</td><td>${escapeHtml(update.thisWeekResult)}</td><td>${escapeHtml(update.progressEnd)}%</td><td>${escapeHtml(update.taskStatus)}</td><td>${update.approvalStatus ? `<span class="approval-status-badge is-${escapeHtml(String(update.approvalStatus).toLowerCase())}">${escapeHtml(formatApprovalStatus(update.approvalStatus))}</span>${update.reviewReason ? `<small class="review-reason">${escapeHtml(update.reviewReason)}</small>` : ''}` : '—'}</td><td>${formatWeeklyCurrency(update.budgetThisWeek)}</td><td>${escapeHtml(update.updatedBy)}</td><td>${escapeHtml(formatWeeklyDateTime(update.updatedAt))}</td><td><button class="weekly-edit-button" type="button" data-weekly-item="${escapeHtml(`${update.itemType}:${update.itemId}`)}">Sửa</button></td></tr>`; }).join('')}</tbody></table></div></section>`;
}

function renderWeeklyNextItems(items) {
  return `<section class="weekly-next-section"><h3>Công việc dự kiến tuần tới</h3>${items.length ? `<div class="weekly-next-grid">${items.map((item) => `<article><span class="week-period-chip">${escapeHtml(item.eligibleReason === 'OVERDUE' ? 'Quá hạn' : item.eligibleReason === 'IN_PROGRESS' ? 'Tiếp tục' : 'Bắt đầu trong tuần')}</span><strong>${escapeHtml(item.wbs ? `${item.wbs} · ${item.taskName}` : item.taskName)}</strong><small>${renderMasterPlanPeriod(item)} · ${escapeHtml(item.progress)}% · ${escapeHtml(item.status || 'Chưa cập nhật')}</small><small>${escapeHtml(item.owner || '')}${item.hasBudget ? ` · ${formatWeeklyCurrency(item.plannedBudget)}` : ''}</small></article>`).join('')}</div>` : '<p class="empty-state">Không có công việc dự kiến.</p>'}</section>`;
}

function bindWeeklyTaskUpdateControlsLegacy() {
  const weekSelector = document.getElementById('weeklyTaskPeriodSelector');
  if (weekSelector) weekSelector.onchange = () => {
    qltdSelectedWeekId = weekSelector.value;
    qltdSelectedWeeklyItemKey = '';
    document.querySelectorAll('.week-period-card[data-week-id]').forEach((card) => {
      card.classList.toggle('is-selected', card.getAttribute('data-week-id') === qltdSelectedWeekId);
    });
    renderWeeklyTaskRegion();
    loadWeeklyTaskDataForCurrent();
  };
  const itemSelector = document.getElementById('weeklyTaskItemSelector');
  if (itemSelector) itemSelector.onchange = () => { qltdSelectedWeeklyItemKey = itemSelector.value; renderWeeklyTaskRegion(); };
  document.querySelectorAll('[data-weekly-item]').forEach((button) => { button.onclick = () => { qltdSelectedWeeklyItemKey = button.dataset.weeklyItem || ''; renderWeeklyTaskRegion(); }; });
  const search = document.getElementById('weeklyTaskSearch'); const group = document.getElementById('weeklyTaskGroup');
  const filter = () => loadWeeklyTaskDataForCurrent({ search: search?.value || '', group: group?.value || 'ALL', force: true });
  if (search) search.onchange = filter; if (group) group.onchange = filter;
  const progress = document.getElementById('weeklyTaskProgress');
  if (progress) progress.onchange = () => { if (Number(progress.value) === 100) { const finish = document.getElementById('weeklyTaskActualFinish'); const status = document.getElementById('weeklyTaskStatus'); if (finish && !finish.value) finish.value = new Date().toISOString().slice(0, 10); if (status) status.value = 'Hoàn thành'; } };
  const save = document.getElementById('saveWeeklyTaskUpdateButton'); if (save) save.onclick = saveWeeklyTaskUpdate;
}

function renderWeeklyTaskRegionLegacy() {
  const mount = document.getElementById('weeklyUpdateMount'); const payload = qltdDeptPlanPayload; if (!mount || !payload?.success) return;
  const dept = (payload.departments || []).find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || (payload.departments || [])[0] || {};
  const master = (dept.masters || []).find((item) => item.masterCode === qltdSelectedMasterCode) || (dept.masters || [])[0] || null;
  const periods = getMonthWeekPeriods(qltdSelectedMonthCode || getDefaultMonthCode()); const week = periods.find((item) => item.weekId === qltdSelectedWeekId) || periods[0];
  mount.innerHTML = renderWeeklyTaskUpdatePanel(payload, dept, master, week, periods); bindWeeklyTaskUpdateControls();
}

async function loadWeeklyTaskDataLegacy(payload, dept, week, periods, filters = {}) {
  if (!payload?.projectCode || !dept || !week) return;
  const deptCode = dept.deptCode || dept.sheetName || ''; const key = getWeeklyTaskCacheKey(payload.projectCode, deptCode, week.weekId); const cached = qltdWeeklyTaskCache.get(key);
  if (cached && !filters.force) { qltdWeeklyTaskView = cached; renderWeeklyTaskRegion(); return; }
  const seq = ++qltdWeeklyTaskRequestSeq; qltdWeeklyTaskView = { key, items: [], updates: [], nextItems: [], standaloneBudgetItems: [], loading: true, error: '' }; renderWeeklyTaskRegion();
  const currentIndex = periods.findIndex((period) => period.weekId === week.weekId); const next = periods[currentIndex + 1] || getNextWeeklyPeriod(week);
  const common = { email: currentUserProfile?.email || '', projectCode: payload.projectCode, deptCode, weekCode: week.weekId };
  try {
    const [itemsResult, updatesResult, nextResult] = await Promise.all([
      fetchBackendJson('work_listweeklyitems', { ...common, weekStart: week.weekStart, weekEnd: week.weekEnd, search: filters.search || '', group: filters.group || 'ALL' }),
      fetchBackendJson('weekly_taskupdates_get', common),
      fetchBackendJson('work_listweeklyitems', { ...common, weekCode: next.weekId, weekStart: next.weekStart, weekEnd: next.weekEnd })
    ]);
    if (seq !== qltdWeeklyTaskRequestSeq) return;
    if (!itemsResult.success || !updatesResult.success) throw new Error(itemsResult.message || updatesResult.message || 'Không tải được dữ liệu Weekly.');
    qltdWeeklyTaskView = { key, items: itemsResult.items || [], updates: updatesResult.updates || [], nextItems: nextResult.items || [], loading: false, error: '' };
    if (!filters.force) qltdWeeklyTaskCache.set(key, qltdWeeklyTaskView);
  } catch (error) {
    if (seq !== qltdWeeklyTaskRequestSeq) return;
    qltdWeeklyTaskView = { key, items: [], updates: [], nextItems: [], loading: false, error: error.message || 'Không tải được dữ liệu Weekly.' };
  }
  renderWeeklyTaskRegion();
}

function qltdWeekPeriodFromId(weekId) {
  const match = String(weekId || '').match(/^WEEK-(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const iso = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return { weekId: `WEEK-${iso(start)}`, weekStart: iso(start), weekEnd: iso(end) };
}

function qltdCurrentWeekPeriod() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  monday.setDate(monday.getDate() + (monday.getDay() === 0 ? -6 : 1 - monday.getDay()));
  const iso = `${monday.getFullYear()}-${pad2(monday.getMonth() + 1)}-${pad2(monday.getDate())}`;
  return qltdWeekPeriodFromId(`WEEK-${iso}`);
}

function qltdGetSelectedWeekPeriod() {
  let period = qltdWeekPeriodFromId(qltdSelectedWeekId);
  if (!period) {
    period = qltdCurrentWeekPeriod();
    qltdSelectedWeekId = period.weekId;
  }
  return period;
}

function qltdShiftSelectedWeek(days) {
  const current = qltdGetSelectedWeekPeriod();
  const date = new Date(`${current.weekStart}T12:00:00`); date.setDate(date.getDate() + days);
  qltdSelectedWeekId = `WEEK-${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  qltdSelectedWeeklyItemKey = '';
  qltdWeeklyForcedItem = null;
}

function renderSelectedDeptPlan() {
  const payload = qltdDeptPlanPayload;
  const content = document.getElementById('deptPlanContent');
  if (!payload?.success || !content) return;
  const departments = payload.departments || [];
  const dept = departments.find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || departments[0];
  if (!dept) { content.innerHTML = '<p class="empty-state">Chưa chọn phòng/ban.</p>'; return; }
  const masters = dept.masters || [];
  if (!masters.some((master) => master.masterCode === qltdSelectedMasterCode)) qltdSelectedMasterCode = masters[0]?.masterCode || '';
  const selectedMaster = masters.find((master) => master.masterCode === qltdSelectedMasterCode) || masters[0] || null;
  const week = qltdGetSelectedWeekPeriod();
  const status = document.getElementById('deptPlanStatus');
  const subtitle = document.getElementById('deptPlanSubTitle');
  if (status) status.textContent = `${departments.length} phòng/ban · đang xem ${dept.deptCode || dept.sheetName} · ${masters.length} mục tiêu`;
  if (subtitle) subtitle.textContent = `${payload.projectCode || ''} - ${payload.projectName || ''}`;

  content.innerHTML = `
    <div class="report-subtabs" role="tablist" aria-label="Báo cập nhật">
      <button type="button" role="tab" data-report-tab="plan" aria-selected="${qltdReportSubTab === 'plan'}" class="${qltdReportSubTab === 'plan' ? 'is-active' : ''}">KẾ HOẠCH PHÒNG/BAN</button>
      <button type="button" role="tab" data-report-tab="weekly" aria-selected="${qltdReportSubTab === 'weekly'}" class="${qltdReportSubTab === 'weekly' ? 'is-active' : ''}">CẬP NHẬT TUẦN</button>
    </div>
    ${qltdReportSubTab === 'plan'
      ? renderDeptPlanTab(payload, dept, masters, selectedMaster)
      : `<div id="weeklyUpdateMount">${renderWeeklyTaskUpdatePanel(payload, dept, selectedMaster, week)}</div>`}
  `;
  bindReportSubTabControls(payload, dept, selectedMaster, week);
}

function renderDeptPlanTab(payload, dept, masters, selectedMaster) {
  if (!masters.length) return '<p class="empty-state">Phòng/ban này chưa có mục tiêu/công việc gốc.</p>';
  return `
    <div class="weekly-target-toolbar">
      <div class="weekly-update-field"><label for="weeklyMasterSelector">Mục tiêu/Công việc gốc</label><select id="weeklyMasterSelector">${masters.map((master) => `<option value="${escapeHtml(master.masterCode || '')}" ${master.masterCode === qltdSelectedMasterCode ? 'selected' : ''}>${escapeHtml(getDeptPlanMasterWbs(master) ? `${getDeptPlanMasterWbs(master)} · ${master.taskName || ''}` : master.taskName || '')}</option>`).join('')}</select></div>
      <div class="master-plan-period"><span>Thời gian kế hoạch</span><strong>${renderMasterPlanPeriod(selectedMaster)}</strong><small>${escapeHtml(selectedMaster?.status || 'Chưa cập nhật')} · ${escapeHtml(selectedMaster?.progress ?? 0)}%</small></div>
    </div>
    ${renderMasterCompletionWarning(selectedMaster)}
    <div id="pbDetailMount" class="pb-detail-mount" aria-live="polite"></div>
    <section class="report-summary-section"><div class="report-section-heading">Tổng hợp mục tiêu phòng/ban</div><div class="dept-plan-table-wrap"><table class="dept-plan-table report-master-table"><thead><tr><th>WBS</th><th>Mục tiêu/Công việc gốc</th><th>Bắt đầu KH</th><th>Kết thúc KH</th><th>Việc chi tiết</th><th>Tiến độ</th><th>Trạng thái</th></tr></thead><tbody>
      ${masters.map((master) => `<tr data-master-select="${escapeHtml(master.masterCode || '')}" class="report-master-row"><td class="mono">${escapeHtml(getDeptPlanMasterWbs(master))}</td><td><div class="task-title">${escapeHtml(master.taskName || '')}</div>${master.contextName ? `<div class="task-context">${escapeHtml(master.contextName)}</div>` : ''}${renderMasterCompletionWarning(master, true)}</td><td>${escapeHtml(formatIsoDateVi(master.planStart || '') || '—')}</td><td>${escapeHtml(formatIsoDateVi(master.planFinish || '') || '—')}</td><td><button type="button" class="detail-count-button" data-detail-popup="${escapeHtml(master.masterCode || '')}">${renderMasterDetailCount(master)}</button></td><td>${escapeHtml(master.progress ?? 0)}%</td><td>${escapeHtml(master.status || 'Chưa cập nhật')}</td></tr>`).join('')}
    </tbody></table></div></section>`;
}

function renderMasterDetailCount(master) {
  const details = Array.isArray(master.details) ? master.details : [];
  const total = details.length || (master.detailSlots || []).length;
  if (!details.length) return `${total} việc`;
  const completed = details.filter((item) => Number(item.progress || 0) >= 100).length;
  const overdue = details.filter((item) => Number(item.progress || 0) < 100 && item.planFinish && item.planFinish < new Date().toISOString().slice(0, 10)).length;
  return overdue ? `${completed}/${total} hoàn thành · ${overdue} quá hạn` : `${completed}/${total} hoàn thành`;
}

function countIncompleteDetails(master) {
  return (Array.isArray(master?.details) ? master.details : []).filter((item) => Number(item.progress || 0) < 100 && !String(item.status || '').toLocaleLowerCase('vi-VN').includes('hoàn thành') && !item.actualFinish).length;
}

function renderMasterCompletionWarning(master, compact = false) {
  if (!master?.officialComplete) return '';
  const count = countIncompleteDetails(master);
  if (!count) return '';
  const text = `Mục tiêu gốc đã hoàn thành nhưng còn ${count} việc chi tiết chưa hoàn thành.`;
  return compact ? `<div class="master-completion-warning compact">${escapeHtml(text)}</div>` : `<div class="master-completion-warning">${escapeHtml(text)}</div>`;
}

function bindReportSubTabControls(payload, dept, selectedMaster, week) {
  document.querySelectorAll('[data-report-tab]').forEach((button) => {
    button.onclick = () => { qltdReportSubTab = button.dataset.reportTab || 'plan'; renderSelectedDeptPlan(); };
  });
  const selector = document.getElementById('weeklyMasterSelector');
  if (selector) selector.onchange = () => { qltdSelectedMasterCode = selector.value || ''; renderSelectedDeptPlan(); };
  document.querySelectorAll('[data-master-select]').forEach((row) => {
    row.onclick = (event) => { if (event.target.closest('[data-detail-popup]')) return; qltdSelectedMasterCode = row.dataset.masterSelect || ''; renderSelectedDeptPlan(); };
  });
  document.querySelectorAll('[data-detail-popup]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); openDetailStatusPopup(payload, dept, button.dataset.detailPopup || ''); };
  });
  if (qltdReportSubTab === 'weekly') {
    bindWeeklyTaskUpdateControls();
    loadWeeklyTaskData(payload, dept, week, [week]);
  } else {
    dispatchDeptPlanRendered(payload, dept, selectedMaster);
  }
}

function ensureDetailStatusPopup() {
  let modal = document.getElementById('detailStatusPopup');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'detailStatusPopup';
  modal.className = 'detail-status-overlay';
  modal.hidden = true;
  modal.innerHTML = '<div class="detail-status-dialog" role="dialog" aria-modal="true" aria-labelledby="detailStatusTitle"><div id="detailStatusContent"></div></div>';
  modal.onclick = (event) => { if (event.target === modal) closeDetailStatusPopup(); };
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeDetailStatusPopup(); });
  document.body.appendChild(modal);
  return modal;
}

function closeDetailStatusPopup() {
  const modal = document.getElementById('detailStatusPopup');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('has-detail-status-popup');
}

function getDetailTaskVisualState(task) {
  const progress = Number(task.progress || 0);
  const status = String(task.status || '').toLocaleLowerCase('vi-VN');
  const today = new Date().toISOString().slice(0, 10);
  if (progress >= 100 || status.includes('hoàn thành')) return { code: 'completed', label: 'Hoàn thành' };
  if (task.planFinish && task.planFinish < today) return { code: 'overdue', label: 'Quá hạn' };
  if (status.includes('tạm dừng') || status.includes('vướng') || status.includes('rủi ro')) return { code: 'paused', label: task.status || 'Có vướng mắc' };
  if (progress > 0 || task.actualStart) return { code: 'in-progress', label: task.status || 'Đang thực hiện' };
  return { code: 'not-started', label: task.status || 'Chưa bắt đầu' };
}

function buildDetailStatusSummary(tasks) {
  const summary = { total: tasks.length, completed: 0, inProgress: 0, notStarted: 0, overdue: 0, progress: 0, budgetPlan: 0, budgetActual: 0 };
  let weightedProgress = 0;
  tasks.forEach((task) => {
    const visual = getDetailTaskVisualState(task);
    if (visual.code === 'completed') summary.completed += 1;
    else if (visual.code === 'overdue') summary.overdue += 1;
    else if (visual.code === 'not-started') summary.notStarted += 1;
    else summary.inProgress += 1;
    weightedProgress += Number(task.progress || 0);
    summary.budgetPlan += Number(task.budgetPlan || 0);
    summary.budgetActual += Number(task.budgetActual || 0);
  });
  summary.progress = tasks.length ? Math.round(weightedProgress / tasks.length) : 0;
  return summary;
}

function renderDetailStatusPopup(payload, dept, masterCode, result) {
  const modal = ensureDetailStatusPopup();
  const content = modal.querySelector('#detailStatusContent');
  const data = result.data || result;
  const master = (dept.masters || []).find((item) => item.masterCode === masterCode) || data.masterTask || {};
  const tasks = Array.isArray(data.detailTasks) ? data.detailTasks : [];
  const summary = buildDetailStatusSummary(tasks);
  content.innerHTML = `<div class="detail-status-header"><div><span>Chi tiết công việc thuộc mục tiêu</span><h2 id="detailStatusTitle">${escapeHtml(getDeptPlanMasterWbs(master) ? `${getDeptPlanMasterWbs(master)} · ${master.taskName || ''}` : master.taskName || masterCode)}</h2><small>BĐ KH: ${escapeHtml(formatIsoDateVi(master.planStart) || '—')} · KT KH: ${escapeHtml(formatIsoDateVi(master.planFinish) || '—')}</small></div><button type="button" class="detail-status-close" data-detail-close aria-label="Đóng">×</button></div>
    <div class="detail-status-summary"><div><span>Tổng số việc</span><strong>${summary.total}</strong></div><div><span>Đã hoàn thành</span><strong>${summary.completed}</strong></div><div><span>Đang thực hiện</span><strong>${summary.inProgress}</strong></div><div><span>Chưa bắt đầu</span><strong>${summary.notStarted}</strong></div><div><span>Quá hạn</span><strong>${summary.overdue}</strong></div><div><span>Tiến độ tổng hợp</span><strong>${summary.progress}%</strong></div><div><span>Ngân sách kế hoạch</span><strong>${formatWeeklyCurrency(summary.budgetPlan)}</strong></div><div><span>Ngân sách thực hiện</span><strong>${formatWeeklyCurrency(summary.budgetActual)}</strong></div></div>
    ${tasks.length ? `<div class="detail-status-table-wrap"><table class="detail-status-table"><thead><tr><th>WBS</th><th>Công việc chi tiết</th><th>Chủ trì</th><th>BĐ KH</th><th>KT KH</th><th>Tiến độ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${tasks.map((task) => { const visual = getDetailTaskVisualState(task); return `<tr><td class="mono">${escapeHtml(task.wbs || '')}</td><td>${escapeHtml(task.taskName || '')}</td><td>${escapeHtml(task.owner || '—')}</td><td>${escapeHtml(formatIsoDateVi(task.planStart) || '—')}</td><td>${escapeHtml(formatIsoDateVi(task.planFinish) || '—')}</td><td>${escapeHtml(task.progress ?? 0)}%</td><td><span class="detail-status-badge is-${escapeHtml(visual.code)}">${escapeHtml(visual.label)}</span></td><td><div class="detail-status-actions"><button type="button" data-detail-view="${escapeHtml(masterCode)}">Xem</button><button type="button" class="primary" data-detail-update="${escapeHtml(task.detailTaskId || '')}">Chọn để cập nhật</button></div></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty-state">Mục tiêu này chưa có việc chi tiết.</p>'}`;
  content.querySelector('[data-detail-close]').onclick = closeDetailStatusPopup;
  content.querySelectorAll('[data-detail-view]').forEach((button) => { button.onclick = () => { qltdSelectedMasterCode = button.dataset.detailView || masterCode; qltdReportSubTab = 'plan'; closeDetailStatusPopup(); renderSelectedDeptPlan(); }; });
  content.querySelectorAll('[data-detail-update]').forEach((button) => {
    button.onclick = () => {
      const task = tasks.find((item) => item.detailTaskId === button.dataset.detailUpdate);
      if (!task) return;
      const deptCode = dept.deptCode || dept.sheetName || '';
      const selectedWeek = qltdGetSelectedWeekPeriod();
      qltdWeeklyForcedItem = { projectCode: payload.projectCode, deptCode, weekCode: selectedWeek.weekId, itemType: 'PB_DETAIL', itemId: task.detailTaskId, detailTaskId: task.detailTaskId, masterTaskCode: task.masterTaskCode || masterCode, parentMasterTaskCode: task.masterTaskCode || masterCode, wbs: task.wbs || '', taskName: task.taskName || '', planStart: task.planStart || '', planFinish: task.planFinish || '', actualStart: task.actualStart || '', actualFinish: task.actualFinish || '', progress: Number(task.progress || 0), status: task.status || '', owner: task.owner || '', plannedBudget: Number(task.budgetPlan || 0), actualBudget: Number(task.budgetActual || 0), hasBudget: Number(task.budgetPlan || 0) > 0 || Number(task.budgetActual || 0) > 0, hasDetails: false, progressReadonly: false, eligibleReason: 'PLANNED', eligible: true };
      qltdWeeklyTaskCache.delete(getWeeklyTaskCacheKey(payload.projectCode, deptCode, selectedWeek.weekId));
      qltdSelectedWeeklyItemKey = `PB_DETAIL:${task.detailTaskId}`;
      qltdSelectedMasterCode = task.masterTaskCode || masterCode;
      qltdReportSubTab = 'weekly';
      closeDetailStatusPopup();
      renderSelectedDeptPlan();
    };
  });
}

async function openDetailStatusPopup(payload, dept, masterCode) {
  if (!payload?.projectCode || !masterCode) return;
  const deptCode = dept.deptCode || dept.sheetName || '';
  const cacheKey = [payload.projectCode, deptCode, masterCode].join('::');
  const modal = ensureDetailStatusPopup();
  const content = modal.querySelector('#detailStatusContent');
  modal.hidden = false;
  document.body.classList.add('has-detail-status-popup');
  if (qltdDetailPopupCache.has(cacheKey)) {
    renderDetailStatusPopup(payload, dept, masterCode, qltdDetailPopupCache.get(cacheKey));
    return;
  }
  content.innerHTML = '<div class="detail-status-loading">Đang tải việc chi tiết...</div>';
  const seq = ++qltdDetailPopupRequestSeq;
  try {
    const result = await fetchBackendJson('work_getdetailtasks', { email: currentUserProfile?.email || '', projectCode: payload.projectCode, deptCode, masterTaskCode: masterCode });
    if (seq !== qltdDetailPopupRequestSeq || modal.hidden) return;
    if (!result.success) throw new Error(result.message || result.error?.message || result.code || result.error?.code || 'Không tải được việc chi tiết.');
    qltdDetailPopupCache.set(cacheKey, result);
    renderDetailStatusPopup(payload, dept, masterCode, result);
  } catch (error) {
    if (seq !== qltdDetailPopupRequestSeq) return;
    content.innerHTML = `<div class="detail-status-error"><p>${escapeHtml(error.message || 'Không tải được việc chi tiết.')}</p><button type="button" data-detail-close>Đóng</button></div>`;
    content.querySelector('[data-detail-close]').onclick = closeDetailStatusPopup;
  }
}

function renderWeeklyTaskUpdatePanel(payload, dept, master, week) {
  const key = getWeeklyTaskCacheKey(payload.projectCode, dept.deptCode || dept.sheetName || '', week.weekId);
  const state = qltdWeeklyTaskView.key === key ? qltdWeeklyTaskView : { items: [], updates: [], standaloneBudgetItems: [], loading: true, error: '' };
  const selected = state.items.find((item) => `${item.itemType}:${item.itemId}` === qltdSelectedWeeklyItemKey) || null;
  const saved = selected ? state.updates.find((update) => update.itemType === selected.itemType && update.itemId === selected.itemId) : null;
  const deptName = dept.deptName || dept.displayName || dept.name || dept.deptCode || dept.sheetName || '';
  const projectName = payload.projectName || payload.projectCode || '';
  return `<section class="weekly-update-panel" aria-label="Cập nhật kết quả tuần">
    <header class="weekly-page-header">
      <div>
        <p class="weekly-eyebrow">Báo cập nhật</p>
        <h2>CẬP NHẬT KẾT QUẢ TUẦN</h2>
        <span>${escapeHtml(projectName)}${deptName ? ` · ${escapeHtml(deptName)}` : ''}</span>
      </div>
      <div class="single-week-toolbar">
        <button type="button" data-week-nav="prev" aria-label="Tuần trước">← Tuần trước</button>
        <div><span>Tuần</span><strong>${escapeHtml(formatIsoDateVi(week.weekStart))} – ${escapeHtml(formatIsoDateVi(week.weekEnd))}</strong><small>Thứ Hai – Chủ nhật</small></div>
        <button type="button" data-week-nav="today">Tuần hiện tại</button>
        <button type="button" data-week-nav="next" aria-label="Tuần sau">Tuần sau →</button>
      </div>
    </header>
    ${state.error ? `<p class="weekly-update-note is-error">${escapeHtml(state.error)}</p>` : ''}
    <div class="weekly-split-view">
      <aside class="weekly-list-panel" aria-label="Danh sách công việc cần cập nhật">
        <div class="weekly-list-toolbar"><div><h3>DANH SÁCH CÔNG VIỆC</h3><span>${state.loading ? 'Đang tải...' : `${state.items.length} công việc`}</span></div><input id="weeklyTaskSearch" type="search" placeholder="Tìm WBS, tên hoặc mã..."><select id="weeklyTaskGroup"><option value="ALL">Tất cả</option><option value="OVERDUE">Quá hạn</option><option value="IN_PROGRESS">Đang thực hiện</option><option value="PLANNED">Đã bắt đầu theo kế hoạch</option><option value="COMPLETED_THIS_WEEK">Hoàn thành trong tuần</option></select></div>
        ${renderWeeklyTaskList(state.items, state.updates)}
      </aside>
      <main class="weekly-detail-panel" aria-label="Chi tiết công việc">
        ${selected ? renderWeeklySelectedForm(selected, saved) : '<div class="weekly-form-placeholder"><strong>CHI TIẾT CÔNG VIỆC</strong><span>Chọn “Cập nhật” tại một công việc để mở biểu mẫu.</span></div>'}
        ${renderStandaloneBudgetWeeklyBlock(state.standaloneBudgetItems || [])}
        ${renderWeeklySavedUpdates(state.updates, state.items)}
      </main>
    </div>
  </section>`;
}

function renderWeeklyTaskList(items, updates) {
  if (!items.length) return '<p class="empty-state">Không có công việc cần cập nhật trong kỳ này.</p>';
  const groups = [
    ['OVERDUE', 'Quá hạn chưa hoàn thành'], ['IN_PROGRESS', 'Đang thực hiện'], ['PLANNED', 'Đã bắt đầu theo kế hoạch'],
    ['UPDATED', 'Đã cập nhật tuần này'], ['COMPLETED_THIS_WEEK', 'Hoàn thành trong tuần'], ['UNSCHEDULED', 'Chưa có lịch']
  ];
  const updateKeys = new Set(updates.map((update) => `${update.itemType}:${update.itemId}`));
  return `<div class="weekly-task-groups">${groups.map(([code, label]) => {
    const rows = items.filter((item) => {
      const isUpdated = updateKeys.has(`${item.itemType}:${item.itemId}`);
      if (code === 'UPDATED') return isUpdated && item.eligibleReason !== 'COMPLETED_THIS_WEEK';
      if (code === 'COMPLETED_THIS_WEEK') return item.eligibleReason === code;
      return !isUpdated && item.eligibleReason === code;
    });
    if (!rows.length) return '';
    return `<section class="weekly-task-group"><h4>${escapeHtml(label)} <span>${rows.length}</span></h4>${rows.map((item) => renderWeeklyTaskRow(item, updateKeys.has(`${item.itemType}:${item.itemId}`))).join('')}</section>`;
  }).join('')}</div>`;
}

function renderWeeklyTaskRow(item, updated) {
  const overdueDays = item.eligibleReason === 'OVERDUE' && item.planFinish ? Math.max(1, Math.floor((Date.now() - new Date(`${item.planFinish}T00:00:00`).getTime()) / 86400000)) : 0;
  const statusText = item.officialComplete ? 'Hoàn thành — 100%' : (item.status || 'Chưa cập nhật');
  const badge = updated ? 'Đã cập nhật tuần này' : overdueDays ? `Quá hạn ${overdueDays} ngày` : item.eligibleReason === 'IN_PROGRESS' ? 'Đang thực hiện' : item.eligibleReason === 'COMPLETED_THIS_WEEK' ? 'Hoàn thành trong tuần' : 'Theo kế hoạch';
  const key = `${item.itemType}:${item.itemId}`;
  const ownerDisplay = getWeeklyPersonDisplay(item.owner);
  const rowClass = [
    'weekly-task-row',
    item.progressReadonly ? 'is-summary' : '',
    key === qltdSelectedWeeklyItemKey ? 'is-selected' : ''
  ].filter(Boolean).join(' ');
  return `<article class="${rowClass}"><div class="weekly-task-main"><div class="weekly-task-kicker"><span class="weekly-item-type">${escapeHtml(item.itemType)}</span>${renderBudgetFlowBadge(item)}</div><strong>${escapeHtml(item.wbs ? `${item.wbs} · ${item.taskName}` : item.taskName)}</strong><small>BĐ KH: ${escapeHtml(formatIsoDateVi(item.planStart) || '—')} · KT KH: ${escapeHtml(formatIsoDateVi(item.planFinish) || '—')}</small><small title="${escapeHtml(item.owner || '')}">Chủ trì: ${escapeHtml(ownerDisplay)}</small></div><div class="weekly-task-state"><span>${escapeHtml(item.officialComplete ? 100 : item.progress)}%</span><small>${escapeHtml(statusText)}</small><em class="weekly-task-badge ${escapeHtml(getWeeklyTaskBadgeClass(item, updated, overdueDays))}">${escapeHtml(badge)}</em></div><div class="weekly-task-actions">${item.progressReadonly ? `<button type="button" class="secondary-button" data-weekly-master-details="${escapeHtml(item.masterTaskCode)}">Xem chi tiết</button><button type="button" class="weekly-update-button" data-weekly-select="${escapeHtml(key)}">Đề xuất HT</button>` : `<button type="button" class="weekly-update-button" data-weekly-select="${escapeHtml(key)}">${updated ? 'Sửa cập nhật' : 'Cập nhật'}</button>`}</div></article>`;
}

function getWeeklyTaskBadgeClass(item, updated, overdueDays) {
  if (updated) return 'is-updated';
  if (overdueDays) return 'is-overdue';
  if (item.eligibleReason === 'IN_PROGRESS') return 'is-in-progress';
  if (item.eligibleReason === 'COMPLETED_THIS_WEEK') return 'is-completed';
  return 'is-planned';
}

function getWeeklyPersonDisplay(value) {
  const text = String(value || '').trim();
  if (!text) return '—';
  const withoutAngles = text.replace(/\s*<[^>]*>/g, '');
  const withoutEmails = withoutAngles.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '');
  return withoutEmails.replace(/\s{2,}/g, ' ').replace(/\s+[,;]\s*$/g, '').trim() || '—';
}

function getBudgetFlowType(item) {
  const raw = String(item?.budgetFlowType || item?.cashFlowType || item?.flowType || item?.budgetGroup || item?.budgetStage || item?.budgetItemName || '').trim().toUpperCase();
  if (raw.includes('THU') || raw.includes('DOANH')) return 'THU';
  if (raw.includes('CHI') || raw.includes('PHÍ') || raw.includes('PHI')) return 'CHI';
  return '';
}

function getBudgetFlowLabels(item) {
  const flow = getBudgetFlowType(item);
  if (flow === 'THU') {
    return { flow, badge: 'KHOẢN THU', plan: 'Kế hoạch thu', actual: 'Thu thực tế trong tuần', cumulative: 'Lũy kế đã thu', remaining: 'Còn phải thu', note: 'Giải trình/Ghi chú khoản thu' };
  }
  if (flow === 'CHI') {
    return { flow, badge: 'KHOẢN CHI', plan: 'Kế hoạch chi', actual: 'Chi thực tế trong tuần', cumulative: 'Lũy kế đã chi', remaining: 'Ngân sách còn lại', note: 'Giải trình/Ghi chú khoản chi' };
  }
  return { flow: '', badge: 'CHƯA PHÂN LOẠI THU/CHI', plan: 'Kế hoạch ngân sách', actual: 'Giá trị thực tế trong tuần', cumulative: 'Lũy kế thực hiện', remaining: 'Còn lại', note: 'Giải trình/Ghi chú ngân sách' };
}

function renderBudgetFlowBadge(item) {
  if (!item?.hasBudget && !item?.approvedBudget) return '';
  const labels = getBudgetFlowLabels(item);
  return `<span class="budget-flow-badge ${labels.flow ? `is-${labels.flow.toLowerCase()}` : 'is-unknown'}">${escapeHtml(labels.badge)}</span>`;
}

function renderWeeklyBudgetBlock(selected, saved) {
  if (!selected.hasBudget && !selected.approvedBudget) return '';
  const labels = getBudgetFlowLabels(selected);
  const plan = Number(selected.plannedBudget || selected.approvedBudget || 0);
  const cumulative = Number(saved?.budgetCumulative || selected.actualBudget || 0);
  const remaining = Math.max(0, plan - cumulative);
  const delta = Number(saved?.budgetThisWeek || 0);
  return `<section class="weekly-form-section weekly-budget-section" data-budget-plan="${escapeHtml(plan)}"><div class="weekly-form-section-title"><span>NGÂN SÁCH CÔNG VIỆC</span>${renderBudgetFlowBadge(selected)}</div>${labels.flow ? '' : '<p class="weekly-update-note is-warning">Khoản ngân sách chưa có loại dòng tiền THU/CHI trong dữ liệu hiện có. Không đổi schema ngân sách ở bước này.</p>'}<div class="weekly-budget-grid"><div><span>${escapeHtml(labels.plan)}</span><strong>${formatWeeklyCurrency(plan)}</strong></div><div class="weekly-update-field"><label for="weeklyTaskBudget">${escapeHtml(labels.actual)}</label><input id="weeklyTaskBudget" type="number" inputmode="decimal" min="0" step="1000" value="${escapeHtml(saved?.budgetThisWeek || '')}"></div><div><span>${escapeHtml(labels.cumulative)}</span><strong>${formatWeeklyCurrency(cumulative)}</strong></div><div><span>${escapeHtml(labels.remaining)}</span><strong>${formatWeeklyCurrency(remaining)}</strong></div></div>${delta > plan && plan > 0 ? '<p class="budget-warning-badge">Cảnh báo: thực tế tuần vượt kế hoạch.</p>' : ''}<p id="weeklyBudgetLiveWarning" class="weekly-update-note is-warning" hidden></p><div class="weekly-update-field"><label for="weeklyTaskBudgetNote">${escapeHtml(labels.note)}</label><textarea id="weeklyTaskBudgetNote">${escapeHtml(saved?.budgetNote || '')}</textarea></div></section>`;
}

function renderStandaloneBudgetWeeklyBlock(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return `<section class="weekly-standalone-budget"><h3>Ngân sách độc lập phòng/ban trong tuần</h3><div class="weekly-standalone-budget-grid">${items.map((item) => { const labels = getBudgetFlowLabels(item); return `<article>${renderBudgetFlowBadge(item)}<strong>${escapeHtml(item.budgetItemName || item.budgetItemCode || '')}</strong><span>${escapeHtml(labels.plan)}: ${formatWeeklyCurrency(item.approvedBudget || 0)}</span><small>${escapeHtml(item.budgetGroup || item.budgetStage || '')}</small></article>`; }).join('')}</div></section>`;
}

function normalizeWeeklyStatusKey(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

function isWeeklyCompletionValue(progress, status, actualFinish = '') {
  const key = normalizeWeeklyStatusKey(status);
  return Number(progress || 0) >= 100 || !!actualFinish || key.includes('hoanthanh') || key.includes('complete') || key.includes('done');
}

function renderWeeklyStatusSelect(currentStatus) {
  const options = ['Chưa bắt đầu', 'Đang thực hiện', 'Tạm dừng', 'Hoàn thành'];
  const current = String(currentStatus || '').trim();
  const values = current && !options.includes(current) ? options.concat([current]) : options;
  return `<select id="weeklyTaskStatus">${values.map((status) => `<option value="${escapeHtml(status)}" ${status === current ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select>`;
}

function renderWeeklyActualDateLifecycle(selected, saved, progressValue, statusValue) {
  const actualStart = saved?.actualStart || selected.actualStart || '';
  const actualFinish = saved?.actualFinish || selected.actualFinish || '';
  const isCompleted = selected.officialComplete || isWeeklyCompletionValue(progressValue, statusValue, actualFinish);
  return `<div id="weeklyActualDateLifecycle" class="weekly-actual-date-lifecycle" data-existing-start="${escapeHtml(actualStart)}" data-existing-finish="${escapeHtml(actualFinish)}" data-completed="${isCompleted ? '1' : '0'}">
    <input id="weeklyTaskActualStartEdit" type="hidden" value="">
    <input id="weeklyTaskActualFinishEdit" type="hidden" value="">
    <div id="weeklyActualStartNotStarted" class="weekly-actual-state">
      <div><strong>Công việc chưa bắt đầu thực tế</strong><span>Chỉ xác nhận khi công việc đã bắt đầu.</span></div>
      <button type="button" class="secondary-button" data-actual-start-confirm>Xác nhận bắt đầu công việc</button>
    </div>
    <div id="weeklyActualStartReadonly" class="weekly-actual-state" hidden>
      <div><strong>Đã bắt đầu từ ${escapeHtml(formatIsoDateVi(actualStart) || '—')}</strong><span>Tuần sau không cần nhập lại ngày bắt đầu.</span></div>
      ${actualStart && !isCompleted ? '<button type="button" class="secondary-button" data-actual-start-edit>Sửa ngày</button>' : ''}
    </div>
    <div id="weeklyActualStartInputWrap" class="weekly-update-field" hidden>
      <label for="weeklyTaskActualStart">Ngày bắt đầu thực tế *</label>
      <input id="weeklyTaskActualStart" type="date" value="${escapeHtml(actualStart)}">
      <small>Chỉ ghi khi chưa có ngày hoặc bạn chủ động bấm “Sửa ngày”.</small>
    </div>
    <div id="weeklyActualFinishHidden" class="weekly-actual-state is-muted">
      <div><strong>Ngày hoàn thành thực tế chưa mở</strong><span>Chỉ xuất hiện khi tiến độ đạt 100% hoặc trạng thái là Hoàn thành.</span></div>
    </div>
    <div id="weeklyActualFinishReadonly" class="weekly-actual-state" hidden>
      <div><strong>Đã hoàn thành từ ${escapeHtml(formatIsoDateVi(actualFinish) || '—')}</strong><span>Ngày hoàn thành đang ở chế độ chỉ đọc.</span></div>
    </div>
    <div id="weeklyActualFinishInputWrap" class="weekly-update-field" hidden>
      <label for="weeklyTaskActualFinish">Ngày hoàn thành thực tế *</label>
      <input id="weeklyTaskActualFinish" type="date" value="${escapeHtml(actualFinish)}">
      <small>Bắt buộc khi báo hoàn thành 100%.</small>
    </div>
  </div>`;
}

function renderWeeklySelectedForm(selected, saved) {
  const completionHint = selected.itemType === 'MASTER' ? '<p class="weekly-approval-hint">Nếu đề xuất 100%, trạng thái Hoàn thành hoặc có ngày hoàn thành thực tế, hệ thống chỉ gửi Admin duyệt. Không tự cập nhật Cong_viec hoặc cột W.</p>' : '';
  const progressValue = saved?.progressEnd ?? selected.progress ?? 0;
  const statusValue = saved?.taskStatus || selected.status || (Number(progressValue) >= 100 ? 'Hoàn thành' : 'Chưa bắt đầu');
  const ownerDisplay = getWeeklyPersonDisplay(selected.owner);
  return `<section class="weekly-inline-form"><div class="weekly-form-topbar"><div><div class="weekly-update-title">${escapeHtml(selected.wbs ? `${selected.wbs} · ${selected.taskName}` : selected.taskName)}</div><div class="weekly-update-meta">${escapeHtml(selected.itemType)} · ${renderMasterPlanPeriod(selected)}</div></div><button type="button" class="weekly-form-close" data-weekly-close-form aria-label="Đóng">×</button></div>
    <section class="weekly-form-section weekly-task-info"><div class="weekly-form-section-title"><span>THÔNG TIN CÔNG VIỆC</span>${renderBudgetFlowBadge(selected)}</div><div class="weekly-info-grid"><div><span>Loại</span><strong>${escapeHtml(selected.itemType)}</strong></div><div title="${escapeHtml(selected.owner || '')}"><span>Chủ trì</span><strong>${escapeHtml(ownerDisplay)}</strong></div><div><span>Kế hoạch</span><strong>${escapeHtml(formatIsoDateVi(selected.planStart) || '—')} – ${escapeHtml(formatIsoDateVi(selected.planFinish) || '—')}</strong></div><div><span>Trạng thái hiện tại</span><strong>${escapeHtml(selected.officialComplete ? 'Hoàn thành — 100%' : (selected.status || 'Chưa cập nhật'))}</strong></div><div><span>Ngân sách kế hoạch</span><strong>${selected.hasBudget ? formatWeeklyCurrency(selected.plannedBudget) : '—'}</strong></div></div>${completionHint}</section>
    <section class="weekly-form-section weekly-result-section"><div class="weekly-form-section-title"><span>KẾT QUẢ THỰC HIỆN TRONG TUẦN</span></div><div class="weekly-update-field"><label for="weeklyTaskResult">Kết quả thực hiện trong tuần</label><textarea id="weeklyTaskResult" placeholder="Nêu kết quả đã hoàn thành, sản phẩm đầu ra, mốc đã chốt...">${escapeHtml(saved?.thisWeekResult || '')}</textarea></div></section>
    <section class="weekly-form-section"><div class="weekly-form-section-title"><span>TÌNH TRẠNG CÔNG VIỆC</span></div><div class="weekly-update-grid"><div class="weekly-update-field"><label for="weeklyTaskProgress">Mức hoàn thành đến hết tuần (%)</label><input id="weeklyTaskProgress" type="number" min="0" max="100" step="1" value="${escapeHtml(progressValue)}"></div><div class="weekly-update-field"><label for="weeklyTaskStatus">Trạng thái công việc</label>${renderWeeklyStatusSelect(statusValue)}</div>${renderWeeklyActualDateLifecycle(selected, saved, progressValue, statusValue)}</div></section>
    <section class="weekly-form-section weekly-issue-section"><div class="weekly-form-section-title"><span>VƯỚNG MẮC VÀ XỬ LÝ</span></div><div class="weekly-update-grid"><div class="weekly-update-field"><label for="weeklyTaskIssue">Vướng mắc/Rủi ro</label><textarea id="weeklyTaskIssue" placeholder="Nêu vướng mắc, nguyên nhân, tác động nếu có...">${escapeHtml(saved?.issue || '')}</textarea></div><div class="weekly-update-field"><label for="weeklyTaskRecommendation">Giải pháp/Đề xuất</label><textarea id="weeklyTaskRecommendation" placeholder="Nêu hướng xử lý, người/phòng cần phối hợp, đề xuất quyết định...">${escapeHtml(saved?.recommendation || '')}</textarea></div></div></section>
    ${renderWeeklyBudgetBlock(selected, saved)}
    <div class="weekly-update-actions"><button type="button" class="secondary-button" data-weekly-close-form>Hủy thay đổi</button><div><button id="saveWeeklyTaskUpdateButton" type="button" class="weekly-update-button">Lưu báo cáo tuần</button><span id="weeklyTaskSaveStatus" class="weekly-update-note"></span></div></div></section>`;
}

function bindWeeklyTaskUpdateControls() {
  document.querySelectorAll('[data-week-nav]').forEach((button) => {
    button.onclick = () => { if (button.dataset.weekNav === 'today') { qltdSelectedWeekId = qltdCurrentWeekPeriod().weekId; qltdSelectedWeeklyItemKey = ''; qltdWeeklyForcedItem = null; } else qltdShiftSelectedWeek(button.dataset.weekNav === 'prev' ? -7 : 7); renderWeeklyTaskRegion(); loadWeeklyTaskDataForCurrent(); };
  });
  document.querySelectorAll('[data-weekly-select]').forEach((button) => { button.onclick = () => { qltdSelectedWeeklyItemKey = button.dataset.weeklySelect || ''; renderWeeklyTaskRegion(); }; });
  document.querySelectorAll('[data-weekly-master-details]').forEach((button) => { button.onclick = () => { const payload = qltdDeptPlanPayload || {}; const dept = (payload.departments || []).find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || {}; openDetailStatusPopup(payload, dept, button.dataset.weeklyMasterDetails || ''); }; });
  document.querySelectorAll('[data-weekly-item]').forEach((button) => { button.onclick = () => { qltdSelectedWeeklyItemKey = button.dataset.weeklyItem || ''; renderWeeklyTaskRegion(); }; });
  const close = document.querySelector('[data-weekly-close-form]'); if (close) close.onclick = () => { qltdSelectedWeeklyItemKey = ''; renderWeeklyTaskRegion(); };
  const search = document.getElementById('weeklyTaskSearch'); const group = document.getElementById('weeklyTaskGroup'); const filter = () => loadWeeklyTaskDataForCurrent({ search: search?.value || '', group: group?.value || 'ALL', force: true }); if (search) search.onchange = filter; if (group) group.onchange = filter;
  const progress = document.getElementById('weeklyTaskProgress');
  const status = document.getElementById('weeklyTaskStatus');
  if (progress) progress.oninput = () => { if (Number(progress.value) >= 100 && status && !isWeeklyCompletionValue(progress.value, status.value)) status.value = 'Hoàn thành'; syncWeeklyActualDateLifecycle(); syncWeeklyBudgetValidation(); };
  if (status) status.onchange = syncWeeklyActualDateLifecycle;
  document.querySelectorAll('[data-actual-start-confirm]').forEach((button) => {
    button.onclick = () => {
      const edit = document.getElementById('weeklyTaskActualStartEdit');
      const input = document.getElementById('weeklyTaskActualStart');
      if (edit) edit.value = 'confirm';
      if (progress && Number(progress.value || 0) <= 0) progress.value = '1';
      if (input && !input.value) input.value = getTodayIsoLocal();
      syncWeeklyActualDateLifecycle();
      input?.focus();
    };
  });
  document.querySelectorAll('[data-actual-start-edit]').forEach((button) => {
    button.onclick = () => {
      const edit = document.getElementById('weeklyTaskActualStartEdit');
      const input = document.getElementById('weeklyTaskActualStart');
      if (edit) edit.value = 'edit';
      syncWeeklyActualDateLifecycle();
      input?.focus();
    };
  });
  const budget = document.getElementById('weeklyTaskBudget');
  if (budget) budget.oninput = syncWeeklyBudgetValidation;
  syncWeeklyActualDateLifecycle();
  syncWeeklyBudgetValidation();
  const save = document.getElementById('saveWeeklyTaskUpdateButton'); if (save) save.onclick = saveWeeklyTaskUpdate;
}

function getTodayIsoLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function setElementHidden(element, hidden) {
  if (element) element.hidden = hidden;
}

function syncWeeklyActualDateLifecycle() {
  const root = document.getElementById('weeklyActualDateLifecycle');
  if (!root) return;
  const progress = Number(document.getElementById('weeklyTaskProgress')?.value || 0);
  const status = document.getElementById('weeklyTaskStatus')?.value || '';
  const existingStart = root.dataset.existingStart || '';
  const existingFinish = root.dataset.existingFinish || '';
  const startEdit = document.getElementById('weeklyTaskActualStartEdit')?.value || '';
  const finishEdit = document.getElementById('weeklyTaskActualFinishEdit')?.value || '';
  const complete = isWeeklyCompletionValue(progress, status, existingFinish);
  const startInput = document.getElementById('weeklyTaskActualStart');
  const finishInput = document.getElementById('weeklyTaskActualFinish');
  const showStartInput = !!startEdit || (!existingStart && progress > 0);
  const showStartReadonly = !!existingStart && !startEdit;
  const showNotStarted = !existingStart && !showStartInput && progress <= 0;
  const showFinishInput = complete && (!existingFinish || !!finishEdit);
  const showFinishReadonly = complete && !!existingFinish && !finishEdit;
  setElementHidden(document.getElementById('weeklyActualStartNotStarted'), !showNotStarted);
  setElementHidden(document.getElementById('weeklyActualStartReadonly'), !showStartReadonly);
  setElementHidden(document.getElementById('weeklyActualStartInputWrap'), !showStartInput);
  setElementHidden(document.getElementById('weeklyActualFinishHidden'), complete);
  setElementHidden(document.getElementById('weeklyActualFinishReadonly'), !showFinishReadonly);
  setElementHidden(document.getElementById('weeklyActualFinishInputWrap'), !showFinishInput);
  if (startInput) {
    startInput.disabled = !showStartInput;
    startInput.required = showStartInput && progress > 0;
    if (showStartInput && existingStart && !startInput.value) startInput.value = existingStart;
  }
  if (finishInput) {
    finishInput.disabled = !showFinishInput;
    finishInput.required = showFinishInput;
    if (showFinishInput && existingFinish && !finishInput.value) finishInput.value = existingFinish;
  }
}

function getWeeklyActualDatePayload() {
  const root = document.getElementById('weeklyActualDateLifecycle');
  const startInput = document.getElementById('weeklyTaskActualStart');
  const finishInput = document.getElementById('weeklyTaskActualFinish');
  const startEdit = document.getElementById('weeklyTaskActualStartEdit')?.value || '';
  const finishEdit = document.getElementById('weeklyTaskActualFinishEdit')?.value || '';
  const existingStart = root?.dataset.existingStart || '';
  const existingFinish = root?.dataset.existingFinish || '';
  return {
    actualStart: startInput && !startInput.disabled ? startInput.value : existingStart,
    actualFinish: finishInput && !finishInput.disabled ? finishInput.value : existingFinish,
    actualStartEdit: startEdit,
    actualFinishEdit: finishEdit
  };
}

function syncWeeklyBudgetValidation() {
  const input = document.getElementById('weeklyTaskBudget');
  const warning = document.getElementById('weeklyBudgetLiveWarning');
  if (!input || !warning) return true;
  const raw = String(input.value || '').trim();
  const plan = Number(document.querySelector('.weekly-budget-section')?.dataset.budgetPlan || 0);
  let message = '';
  if (raw && isNaN(Number(raw))) message = 'Giá trị ngân sách không đúng định dạng.';
  else if (raw && Number(raw) < 0) message = 'Giá trị ngân sách không được âm.';
  else if (raw && plan > 0 && Number(raw) > plan) message = 'Cảnh báo: giá trị thực tế trong tuần vượt kế hoạch ngân sách.';
  warning.textContent = message;
  warning.hidden = !message;
  return !message || message.startsWith('Cảnh báo');
}

function validateWeeklyTaskForm(item) {
  const progressEnd = Number(document.getElementById('weeklyTaskProgress')?.value || 0);
  const status = document.getElementById('weeklyTaskStatus')?.value || '';
  const dates = getWeeklyActualDatePayload();
  if (isNaN(progressEnd) || progressEnd < 0 || progressEnd > 100) return { error: 'Mức hoàn thành phải nằm trong khoảng 0–100%.' };
  if (progressEnd > 0 && progressEnd < 100 && !dates.actualStart) return { error: 'Vui lòng nhập ngày bắt đầu thực tế một lần khi công việc đã bắt đầu.' };
  if (isWeeklyCompletionValue(progressEnd, status) && !dates.actualFinish) return { error: 'Vui lòng nhập ngày hoàn thành thực tế khi báo hoàn thành.' };
  if (!syncWeeklyBudgetValidation()) return { error: 'Vui lòng kiểm tra lại ngân sách tuần.' };
  const budgetRaw = String(document.getElementById('weeklyTaskBudget')?.value || '').trim();
  if (budgetRaw && (isNaN(Number(budgetRaw)) || Number(budgetRaw) < 0)) return { error: 'Ngân sách tuần phải là số không âm.' };
  return { error: '', progressEnd, status, dates, item };
}

function renderWeeklyTaskRegion() {
  const mount = document.getElementById('weeklyUpdateMount'); const payload = qltdDeptPlanPayload; if (!mount || !payload?.success) return;
  const dept = (payload.departments || []).find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || (payload.departments || [])[0] || {};
  const master = (dept.masters || []).find((item) => item.masterCode === qltdSelectedMasterCode) || (dept.masters || [])[0] || null;
  mount.innerHTML = renderWeeklyTaskUpdatePanel(payload, dept, master, qltdGetSelectedWeekPeriod()); bindWeeklyTaskUpdateControls();
}

async function loadWeeklyTaskData(payload, dept, week, periods, filters = {}) {
  if (!payload?.projectCode || !dept || !week) return;
  const deptCode = dept.deptCode || dept.sheetName || ''; const key = getWeeklyTaskCacheKey(payload.projectCode, deptCode, week.weekId); const cached = qltdWeeklyTaskCache.get(key);
  if (cached && !filters.force) { qltdWeeklyTaskView = cached; renderWeeklyTaskRegion(); return; }
  const seq = ++qltdWeeklyTaskRequestSeq; qltdWeeklyTaskView = { key, items: [], updates: [], nextItems: [], loading: true, error: '' }; renderWeeklyTaskRegion();
  const common = { email: currentUserProfile?.email || '', projectCode: payload.projectCode, deptCode, weekCode: week.weekId };
  try {
    const [itemsResult, updatesResult] = await Promise.all([
      fetchBackendJson('work_listweeklyitems', { ...common, weekStart: week.weekStart, weekEnd: week.weekEnd, search: filters.search || '', group: filters.group || 'ALL' }),
      fetchBackendJson('weekly_taskupdates_get', common)
    ]);
    if (seq !== qltdWeeklyTaskRequestSeq) return;
    if (!itemsResult.success || !updatesResult.success) throw new Error(itemsResult.message || updatesResult.message || 'Không tải được dữ liệu Weekly.');
    const itemData = itemsResult.data || itemsResult; const updateData = updatesResult.data || updatesResult;
    const items = Array.isArray(itemData.items) ? itemData.items.slice() : [];
    if (qltdWeeklyForcedItem && qltdWeeklyForcedItem.projectCode === payload.projectCode && qltdWeeklyForcedItem.deptCode === deptCode && qltdWeeklyForcedItem.weekCode === week.weekId && !items.some((item) => item.itemType === qltdWeeklyForcedItem.itemType && item.itemId === qltdWeeklyForcedItem.itemId)) items.push(qltdWeeklyForcedItem);
    qltdWeeklyTaskView = { key, items, updates: updateData.updates || [], nextItems: [], standaloneBudgetItems: itemData.standaloneBudgetItems || [], loading: false, error: '' };
    if (!filters.force) qltdWeeklyTaskCache.set(key, qltdWeeklyTaskView);
  } catch (error) {
    if (seq !== qltdWeeklyTaskRequestSeq) return;
    qltdWeeklyTaskView = { key, items: [], updates: [], nextItems: [], standaloneBudgetItems: [], loading: false, error: error.message || 'Không tải được dữ liệu Weekly.' };
  }
  renderWeeklyTaskRegion();
}

function loadWeeklyTaskDataForCurrent(filters = {}) {
  const payload = qltdDeptPlanPayload || {}; const dept = (payload.departments || []).find((item) => (item.deptCode || item.sheetName) === qltdSelectedDeptCode) || (payload.departments || [])[0];
  const week = qltdGetSelectedWeekPeriod();
  return loadWeeklyTaskData(payload, dept, week, [week], filters);
}

async function saveWeeklyTaskUpdate() {
  const item = qltdWeeklyTaskView.items.find((candidate) => `${candidate.itemType}:${candidate.itemId}` === qltdSelectedWeeklyItemKey); if (!item) return;
  const payload = qltdDeptPlanPayload || {}; const dept = (payload.departments || []).find((candidate) => (candidate.deptCode || candidate.sheetName) === qltdSelectedDeptCode) || {};
  const status = document.getElementById('weeklyTaskSaveStatus');
  const button = document.getElementById('saveWeeklyTaskUpdateButton');
  if (button?.dataset.saving === '1') return;
  const validation = validateWeeklyTaskForm(item);
  if (validation.error) { if (status) status.textContent = validation.error; return; }
  const progressEnd = validation.progressEnd; let confirmProgressDecrease = false;
  if (progressEnd < Number(item.progress || 0)) { confirmProgressDecrease = window.confirm(`Tiến độ mới ${progressEnd}% thấp hơn tiến độ hiện tại ${item.progress}%. Bạn có xác nhận?`); if (!confirmProgressDecrease) return; }
  const body = { action: 'weekly_taskupdates_save', email: currentUserProfile?.email || '', projectCode: payload.projectCode, deptCode: dept.deptCode || dept.sheetName || '', weekCode: qltdSelectedWeekId, itemType: item.itemType, itemId: item.itemId, thisWeekResult: document.getElementById('weeklyTaskResult')?.value || '', progressEnd, taskStatus: validation.status || '', actualStart: validation.dates.actualStart || '', actualFinish: validation.dates.actualFinish || '', actualStartEdit: validation.dates.actualStartEdit || '', actualFinishEdit: validation.dates.actualFinishEdit || '', issue: document.getElementById('weeklyTaskIssue')?.value || '', recommendation: document.getElementById('weeklyTaskRecommendation')?.value || '', budgetThisWeek: document.getElementById('weeklyTaskBudget')?.value || '', budgetNote: document.getElementById('weeklyTaskBudgetNote')?.value || '', confirmProgressDecrease };
  if (button) { button.disabled = true; button.dataset.saving = '1'; button.textContent = 'Đang lưu...'; }
  if (status) status.textContent = 'Đang lưu...';
  try {
    const result = await postBackendJson(body);
    if (!result.success) throw new Error(result.message || result.error?.message || result.code || result.error?.code || 'Lưu thất bại.');
    const data = result.data || result;
    qltdWeeklyForcedItem = null;
    qltdWeeklyTaskCache.delete(qltdWeeklyTaskView.key);
    const message = data.update?.approvalStatus === 'PENDING' ? 'Đã gửi Admin phê duyệt cập nhật hoàn thành MASTER.' : 'Đã lưu cập nhật tuần.';
    if (status) status.textContent = message;
    showWeeklyToast(message);
    await loadWeeklyTaskDataForCurrent({ force: true });
  } catch (error) {
    if (status) status.textContent = error.message || 'Không lưu được cập nhật.';
    if (button) { button.disabled = false; button.dataset.saving = ''; button.textContent = 'Lưu báo cáo tuần'; }
  }
}

function showWeeklyToast(message) {
  const toast = document.createElement('div');
  toast.className = 'weekly-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.classList.add('is-visible'), 20);
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}

async function postBackendJson(payload) {
  const response = await fetch(APPS_SCRIPT_DEV_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Apps Script API POST failed: ${response.status}`); return response.json();
}

function getNextWeeklyPeriod(week) { const start = new Date(`${week.weekStart}T12:00:00`); start.setDate(start.getDate() + 7); const end = new Date(start); end.setDate(end.getDate() + 6); const iso = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; return { weekId: `WEEK-${iso(start)}`, weekStart: iso(start), weekEnd: iso(end) }; }
function formatWeeklyCurrency(value) { return Number(value || 0).toLocaleString('vi-VN') + ' ₫'; }
function formatWeeklyDateTime(value) { if (!value) return ''; const date = new Date(value); return isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN'); }

async function loadGanttDataForSelectedProject(projectCode) {
  if (!projectCode) return;
  ensureWeb07Panels();
  renderGanttLoading(projectCode);
  renderDashboardLoading(projectCode);

  try {
    const payload = await fetchBackendJson('ganttData', { projectCode });
    qltdGanttPayload = payload;
    if (qltdActiveView === 'report' && qltdDeptPlanPayload?.success) renderDeptPlans(qltdDeptPlanPayload);
    await loadMainMilestonesForProject(projectCode, payload);
    renderDashboardFromGanttData(payload);
    renderGanttPanel(payload);
  } catch (error) {
    console.error('Cannot load gantt data', error);
    qltdGanttPayload = null;
    renderDashboardError(error);
    renderGanttError(error);
  }
}

function renderDashboardLoading(projectCode) {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Đang tải Dashboard cho ${escapeHtml(projectCode)}...</p>
    </div>
  `;
}

function renderNoProjectDashboardState() {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Chưa có dự án ACTIVE.</p>
    </div>
  `;
}

function renderNoProjectGanttState() {
  const panel = document.getElementById('web07GanttPanel');
  if (!panel) return;
  resetWeb07DhtmlxGantt('renderNoProjectGanttState');
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Chưa có dự án ACTIVE.</p>
    </div>
  `;
}

function resetWeb07DhtmlxGantt(reason = '') {
  qltdDhtmlxGanttRenderSeq += 1;
  const gantt = getDhtmlxGanttInstance();
  if (!gantt) {
    qltdDhtmlxGanttInitialized = false;
    return;
  }

  try {
    if (typeof gantt.clearAll === 'function') {
      gantt.clearAll();
    }
  } catch (error) {
    console.warn('WEB07F: ignored gantt.clearAll during reset', reason, error);
  }

  qltdDhtmlxGanttInitialized = false;
}

function getGanttScrollState() {
  const gantt = getDhtmlxGanttInstance();
  if (!gantt || typeof gantt.getScrollState !== 'function') return null;

  try {
    return gantt.getScrollState();
  } catch (error) {
    console.warn('Cannot read gantt scroll state', error);
    return null;
  }
}

function restoreGanttScrollState(scroll) {
  if (!scroll) return;

  const gantt = getDhtmlxGanttInstance();
  if (!gantt || typeof gantt.scrollTo !== 'function') return;

  requestAnimationFrame(() => {
    try {
      gantt.scrollTo(scroll.x || 0, scroll.y || 0);
    } catch (error) {
      console.warn('Cannot restore gantt scroll state', error);
    }
  });
}

function ensureVisibleGanttContainer(container) {
  if (!container) return false;
  container.classList.remove('is-fallback');
  container.hidden = false;
  if (!container.style.height) {
    container.style.height = 'calc(100vh - 245px)';
  }
  if (!container.style.minHeight) {
    container.style.minHeight = '640px';
  }
  return true;
}

function qltdWeb07NextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

async function qltdWeb07WaitForRenderableGanttContainer(container) {
  ensureVisibleGanttContainer(container);

  for (let i = 0; i < 4; i += 1) {
    await qltdWeb07NextFrame();
    const rect = container.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 120) {
      return true;
    }
    container.style.height = 'calc(100vh - 230px)';
    container.style.minHeight = '680px';
  }

  return false;
}
function renderGanttLoading(projectCode) {
  const panel = document.getElementById('web07GanttPanel');
  if (!panel) return;
  resetWeb07DhtmlxGantt('renderGanttLoading');
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Đang tải Gantt cho ${escapeHtml(projectCode)}...</p>
    </div>
  `;
}

function renderDashboardError(error) {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Không tải được Dashboard từ Apps Script API.</p>
      <p class="web07-muted">${escapeHtml(error.message || error)}</p>
    </div>
  `;
}

function renderGanttError(error) {
  const panel = document.getElementById('web07GanttPanel');
  if (!panel) return;
  resetWeb07DhtmlxGantt('renderGanttError');
  panel.innerHTML = `
    <div class="web07-card">
      <p class="empty-state">Không tải được Gantt từ Apps Script API.</p>
      <p class="web07-muted">${escapeHtml(error.message || error)}</p>
    </div>
  `;
}

function renderDashboardFromGanttData(payload) {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;

  if (!payload || !payload.success) {
    panel.innerHTML = `
      <div class="web07-card">
        <p class="empty-state">Endpoint ganttData chưa trả dữ liệu hợp lệ.</p>
        <p class="web07-muted">${escapeHtml(payload && (payload.message || payload.error) || '')}</p>
      </div>
    `;
    return;
  }

  if (payload.projectCode) qltdDepartmentDashboardCache.set(String(payload.projectCode), payload);
  if (qltdDashboardMode === 'department') {
    loadAndRenderDepartmentDashboard();
    return;
  }

  const model = buildExecutiveDashboardModel(payload);

  panel.innerHTML = `
    <div class="exec-dashboard">
      ${renderDashboardModeSwitch('project')}
      <section class="exec-header">
        <div>
          <p class="exec-eyebrow">Dashboard điều hành dự án</p>
          <h2>${escapeHtml(payload.projectName || payload.projectCode || 'Dự án')}</h2>
          <p class="exec-subtitle">
            ${escapeHtml(payload.projectCode || '')}
            ${payload.sourceSheet ? ` · ${escapeHtml(payload.sourceSheet)}` : ''}
            · Cập nhật ${escapeHtml(model.updatedAtLabel)}
          </p>
        </div>
        <button id="execRefreshButton" class="exec-refresh" type="button">Refresh</button>
      </section>

      <section class="exec-kpi-grid" aria-label="KPI điều hành">
        ${renderExecutiveKpiCard('Tổng công việc', model.kpis.totalTasks, '100% dữ liệu thật', 'info')}
        ${renderExecutiveKpiCard('Hoàn thành', model.kpis.completed, `${model.completionPercent}% tổng số`, 'green')}
        ${renderExecutiveKpiCard('Đang thực hiện', model.kpis.inProgress, `${model.inProgressPercent}% tổng số`, 'blue')}
        ${renderExecutiveKpiCard('Chưa bắt đầu', model.kpis.notStarted, `${model.notStartedPercent}% tổng số`, 'gray')}
        ${renderExecutiveKpiCard('Quá hạn', model.kpis.overdue, `${model.overduePercent}% tổng số`, 'red')}
        ${renderExecutiveKpiCard('Mốc lớn đang thực hiện', model.kpis.activeMilestones, model.usedMilestoneFallback ? 'WBS cấp I/II/III' : 'Mốc lớn hệ thống', 'blue')}
      </section>

      ${renderExecutiveAlerts(model.alerts)}

      <section class="exec-grid">
        ${renderExecutiveListSection('Top 5 quá hạn', ['Hạng mục', 'Công việc', 'Chủ trì', 'Ngày kết thúc', 'Số ngày trễ'], model.overdue, renderExecutiveOverdueRow, 'Không có việc quá hạn.', 'red')}
        ${renderExecutiveListSection('Mốc lớn đang thực hiện', ['Hạng mục/Mốc lớn', 'Công việc/Mốc', 'Chủ trì', 'Ngày kết thúc', 'Còn lại hoặc trễ'], model.activeMilestones, renderExecutiveMilestoneRow, 'Không có mốc lớn đang thực hiện.', 'blue')}
        ${renderExecutiveListSection('Đến hạn trong 14 ngày tới', ['Hạng mục', 'Công việc', 'Chủ trì', 'Ngày kết thúc', 'Còn lại'], model.upcoming, renderExecutiveUpcomingRow, 'Không có việc đến hạn trong 14 ngày tới.', 'blue')}
        ${renderExecutiveCompletedSection(model.completedThisMonth)}
      </section>
    </div>
  `;

  bindDashboardTaskLinks();
  bindDashboardModeSwitch();
  const refreshButton = document.getElementById('execRefreshButton');
  if (refreshButton) {
    refreshButton.onclick = () => loadGanttDataForSelectedProject(payload.projectCode || getStoredProjectCode());
  }
}

function renderDashboardModeSwitch(activeMode) {
  return `<nav class="dept-dashboard-switch" aria-label="Chế độ Dashboard">
    <button type="button" data-dashboard-mode="project" class="${activeMode === 'project' ? 'active' : ''}">Dashboard dự án</button>
    <button type="button" data-dashboard-mode="department" class="${activeMode === 'department' ? 'active' : ''}">Dashboard phòng/ban</button>
  </nav>`;
}

function bindDashboardModeSwitch() {
  document.querySelectorAll('[data-dashboard-mode]').forEach((button) => {
    button.onclick = () => {
      const mode = button.dataset.dashboardMode;
      if (mode === qltdDashboardMode) return;
      qltdDashboardMode = mode;
      if (mode === 'department') loadAndRenderDepartmentDashboard();
      else if (qltdGanttPayload) renderDashboardFromGanttData(qltdGanttPayload);
    };
  });
}

async function getDepartmentDashboardPayloads(projectCode, forceRefresh) {
  const projects = projectCode
    ? qltdProjectRegistry.filter((project) => String(project.projectCode) === String(projectCode))
    : qltdProjectRegistry;
  const warnings = [];
  const payloads = (await Promise.all(projects.map(async (project) => {
    const code = String(project.projectCode || '');
    if (!forceRefresh && qltdDepartmentDashboardCache.has(code)) return qltdDepartmentDashboardCache.get(code);
    try {
      const payload = await fetchBackendJson('ganttData', { projectCode: code });
      if (!payload || payload.success === false) throw new Error(payload && (payload.message || payload.error) || 'INVALID_PAYLOAD');
      qltdDepartmentDashboardCache.set(code, payload);
      return payload;
    } catch (error) {
      warnings.push(`${code}: ${error.message || error}`);
      return null;
    }
  }))).filter(Boolean);
  return { payloads, warnings };
}

async function loadAndRenderDepartmentDashboard(forceRefresh = false) {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;
  qltdDashboardMode = 'department';
  panel.innerHTML = `<div class="exec-dashboard">${renderDashboardModeSwitch('department')}<section class="exec-section"><p class="exec-empty">Đang tổng hợp dữ liệu phòng/ban...</p></section></div>`;
  bindDashboardModeSwitch();
  const result = await getDepartmentDashboardPayloads(qltdDepartmentDashboardProjectCode, forceRefresh);
  renderDepartmentDashboard(result.payloads, result.warnings);
}

function renderDepartmentDashboard(payloads, warnings = []) {
  const panel = document.getElementById('web07DashboardPanel');
  if (!panel) return;
  let model = buildDepartmentDashboardModel(payloads, { deptCode: qltdDepartmentDashboardDeptCode, projectCode: qltdDepartmentDashboardProjectCode });
  if (qltdDepartmentDashboardDeptCode && !model.departments.some((dept) => dept.code === qltdDepartmentDashboardDeptCode)) {
    qltdDepartmentDashboardDeptCode = '';
    model = buildDepartmentDashboardModel(payloads, { deptCode: '', projectCode: qltdDepartmentDashboardProjectCode });
  }
  const deptLabel = model.departments.find((dept) => dept.code === qltdDepartmentDashboardDeptCode)?.name || 'Tất cả phòng/ban';
  panel.innerHTML = `<div class="exec-dashboard dept-dashboard">
    ${renderDashboardModeSwitch('department')}
    <section class="exec-header"><div><p class="exec-eyebrow">Dashboard Phòng/Ban</p><h2>${escapeHtml(deptLabel)}</h2><p class="exec-subtitle">${qltdDepartmentDashboardProjectCode ? 'Một dự án' : 'Toàn bộ dự án ACTIVE'} · ${model.tasks.length} công việc</p></div><button id="deptDashboardRefresh" class="exec-refresh" type="button">Refresh</button></section>
    <section class="dept-dashboard-filters"><label>Phòng/Ban<select id="deptDashboardDeptFilter"><option value="">Tất cả phòng/ban</option>${model.departments.map((dept) => `<option value="${escapeHtml(dept.code)}" ${dept.code === qltdDepartmentDashboardDeptCode ? 'selected' : ''}>${escapeHtml(dept.code)} - ${escapeHtml(dept.name)}</option>`).join('')}</select></label>
    <label>Dự án<select id="deptDashboardProjectFilter"><option value="">Tất cả dự án</option>${qltdProjectRegistry.map((project) => `<option value="${escapeHtml(project.projectCode)}" ${String(project.projectCode) === qltdDepartmentDashboardProjectCode ? 'selected' : ''}>${escapeHtml(project.projectCode)} - ${escapeHtml(project.projectName)}</option>`).join('')}</select></label></section>
    ${warnings.length ? `<div class="dept-dashboard-warning">Không tải được ${warnings.length} dự án: ${escapeHtml(warnings.join(' · '))}</div>` : ''}
    <section class="exec-kpi-grid dept-kpi-grid">
      ${renderExecutiveKpiCard('Tổng việc được giao', model.kpis.total, 'Theo đơn vị chủ trì', 'info')}${renderExecutiveKpiCard('Hoàn thành', model.kpis.completed, 'Đã có kết quả thực tế', 'green')}
      ${renderExecutiveKpiCard('Đang thực hiện', model.kpis.inProgress, 'Chưa hoàn thành', 'blue')}${renderExecutiveKpiCard('Chưa bắt đầu', model.kpis.notStarted, 'Chưa hoàn thành', 'gray')}
      ${renderExecutiveKpiCard('Quá hạn', model.kpis.overdue, 'Không phụ thuộc trạng thái', 'red')}${renderExecutiveKpiCard('Đến hạn 14 ngày', model.kpis.upcoming, 'Không gồm việc quá hạn', 'blue')}
      ${renderExecutiveKpiCard('Mốc chính liên quan', model.kpis.milestones, 'Theo sao vàng global', 'info')}
    </section>
    <section class="exec-grid">${renderDepartmentList('Top 5 quá hạn', model.overdue, 'overdue')}${renderDepartmentList('Đến hạn trong 14 ngày tới', model.upcoming, 'upcoming')}${renderDepartmentList('Kết quả tháng này', model.completedThisMonth, 'completed')}${renderDepartmentList('Mốc chính liên quan', model.milestones, 'milestone')}${!qltdDepartmentDashboardProjectCode ? renderDepartmentProjectSummary(model.projectSummary) : ''}${renderDepartmentEfficiency(model.departmentEfficiency)}</section>
  </div>`;
  bindDashboardModeSwitch();
  bindDashboardTaskLinks();
  bindDepartmentEfficiencyRows(payloads, warnings);
  document.getElementById('deptDashboardRefresh').onclick = () => loadAndRenderDepartmentDashboard(true);
  document.getElementById('deptDashboardDeptFilter').onchange = (event) => { qltdDepartmentDashboardDeptCode = event.target.value; renderDepartmentDashboard(payloads, warnings); };
  document.getElementById('deptDashboardProjectFilter').onchange = (event) => { qltdDepartmentDashboardProjectCode = event.target.value; loadAndRenderDepartmentDashboard(); };
}

function renderDepartmentList(title, rows, type) {
  const completed = type === 'completed';
  const columns = completed
    ? [
      { label: 'Dự án', className: 'is-text' },
      { label: 'Hạng mục', className: 'is-text' },
      { label: 'Công việc', className: 'is-text' },
      { label: 'Chủ trì', className: 'is-text' },
      { label: 'Hoàn thành thực tế', className: 'is-date' }
    ]
    : [
      { label: 'Dự án', className: 'is-text' },
      { label: 'Hạng mục', className: 'is-text' },
      { label: 'Công việc', className: 'is-text' },
      { label: 'Chủ trì', className: 'is-text' },
      { label: 'Ngày kết thúc', className: 'is-date' },
      { label: 'Còn lại/Trễ', className: 'is-status' }
    ];
  const body = rows.map((task) => {
    const finish = completed ? task.actualFinishDate : task.endDate;
    const dueBadge = getDepartmentDueBadge(task);
    const categoryLabel = task.contextLabel || '—';
    return `<tr class="web07-alert-row" data-project-code="${escapeHtml(task.projectCode || '')}" data-task-id="${escapeHtml(getDepartmentTaskLinkId(task))}"><td class="is-text" title="${escapeHtml(task.projectName || task.projectCode || '')}">${escapeHtml(task.projectName || task.projectCode)}</td><td class="exec-context is-text" title="${escapeHtml(task.contextLabel || '')}">${escapeHtml(categoryLabel)}</td><td class="exec-task is-text" title="${escapeHtml(task.text || '')}">${escapeHtml(task.text)}</td><td class="is-text" title="${escapeHtml(task.owner || 'Chưa rõ')}">${escapeHtml(task.owner || 'Chưa rõ')}</td><td class="is-date">${escapeHtml(finish ? formatIsoDateVi(toIsoDateLocal(finish)) : '')}</td>${completed ? '' : `<td class="is-status"><span class="exec-badge ${dueBadge.className}">${escapeHtml(dueBadge.text)}</span></td>`}</tr>`;
  }).join('');
  return `<article class="exec-section ${type === 'overdue' ? 'is-red' : completed ? 'is-green' : 'is-blue'}"><header><h3>${escapeHtml(title)}</h3><span>${rows.length}</span></header>${rows.length ? `<div class="exec-table-wrap"><table class="exec-table dept-table"><thead><tr>${columns.map((column) => `<th class="${column.className}">${column.label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>` : '<p class="exec-empty">Không có dữ liệu phù hợp.</p>'}</article>`;
}

function renderDepartmentProjectSummary(rows) {
  const columns = [
    { label: 'Dự án', className: 'is-text' },
    { label: 'Tổng việc', className: 'is-number' },
    { label: 'Hoàn thành', className: 'is-number' },
    { label: 'Đang thực hiện', className: 'is-number' },
    { label: 'Chưa bắt đầu', className: 'is-number' },
    { label: 'Quá hạn', className: 'is-number' },
    { label: 'Đến hạn 14 ngày', className: 'is-number' },
    { label: 'Tỷ lệ hoàn thành', className: 'is-status' }
  ];
  return `<article class="exec-section dept-project-summary"><header><h3>Tổng hợp theo dự án</h3><span>${rows.length}</span></header>${rows.length ? `<div class="exec-table-wrap"><table class="exec-table dept-summary-table"><thead><tr>${columns.map((column) => `<th class="${column.className}">${column.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr><td class="exec-task is-text" title="${escapeHtml(row.projectName || row.projectCode || '')}">${escapeHtml(row.projectName)}</td><td class="is-number">${row.total}</td><td class="is-number">${row.completed}</td><td class="is-number">${row.inProgress}</td><td class="is-number">${row.notStarted}</td><td class="is-number">${row.overdue}</td><td class="is-number">${row.upcoming}</td><td class="is-status"><span class="exec-badge is-blue">${row.completionPercent}%</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="exec-empty">Không có dự án phù hợp.</p>'}</article>`;
}

function renderDepartmentEfficiency(rows = []) {
  const columns = [
    { label: 'Phòng/Ban', className: 'is-text' },
    { label: 'Tổng việc', className: 'is-number' },
    { label: 'Hoàn thành', className: 'is-number' },
    { label: 'Đang thực hiện', className: 'is-number' },
    { label: 'Chưa bắt đầu', className: 'is-number' },
    { label: 'Quá hạn', className: 'is-status' },
    { label: 'Tỷ lệ hoàn thành', className: 'is-progress' }
  ];
  const body = rows.map((row) => {
    const overdueClass = row.overdue > 0 ? 'is-red' : 'is-green';
    const overdueText = `${row.overdue > 0 ? '⚠' : '✓'} ${row.overdue}`;
    return `<tr class="dept-efficiency-row" data-dept-code="${escapeHtml(row.deptCode)}"><td class="exec-task is-text" title="${escapeHtml(row.deptName || row.deptCode)}">${escapeHtml(row.deptCode)} - ${escapeHtml(row.deptName || row.deptCode)}</td><td class="is-number">${row.total}</td><td class="is-number">${row.completed}</td><td class="is-number">${row.inProgress}</td><td class="is-number">${row.notStarted}</td><td class="is-status"><span class="exec-badge ${overdueClass}">${escapeHtml(overdueText)}</span></td><td class="is-progress">${renderDepartmentProgressBar(row.completionPercent)}</td></tr>`;
  }).join('');
  return `<article class="exec-section dept-efficiency-summary"><header><h3>Hiệu quả phòng/ban</h3><span>${rows.length}</span></header>${rows.length ? `<div class="exec-table-wrap"><table class="exec-table dept-efficiency-table"><thead><tr>${columns.map((column) => `<th class="${column.className}">${column.label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>` : '<p class="exec-empty">Không có phòng/ban phù hợp.</p>'}</article>`;
}

function renderDepartmentProgressBar(percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<div class="dept-progress" aria-label="${safePercent}%"><span style="width: ${safePercent}%"></span><strong>${safePercent}%</strong></div>`;
}

function bindDepartmentEfficiencyRows(payloads, warnings) {
  document.querySelectorAll('.dept-efficiency-row[data-dept-code]').forEach((row) => {
    row.onclick = () => {
      qltdDepartmentDashboardDeptCode = row.getAttribute('data-dept-code') || '';
      const selector = document.getElementById('deptDashboardDeptFilter');
      if (selector) selector.value = qltdDepartmentDashboardDeptCode;
      renderDepartmentDashboard(payloads, warnings);
    };
  });
}

function getDepartmentTaskLinkId(task) {
  return task && (task.id || task.code || task.wbs || task.rawRowNumber || '');
}

function getDepartmentDueBadge(task) {
  if (task && task.isCompleted) return { text: 'Hoàn thành', className: 'is-green' };
  if (!task || !task.endDate) return { text: 'Chưa có hạn', className: 'is-gray' };
  if (task.lateDays > 0 || task.isOverdue) return { text: `Trễ ${task.lateDays} ngày`, className: 'is-red' };
  const remainingDays = task.remainingDays ?? 0;
  if (remainingDays === 0) return { text: 'Hôm nay', className: 'is-yellow' };
  return { text: `Còn ${remainingDays} ngày`, className: 'is-blue' };
}

function buildExecutiveDashboardModel(payload) {
  const today = parseIsoDate(toIsoDateLocal(new Date()));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const upcomingLimit = addDays(today, 14);
  const enriched = buildExecutiveTaskContext(Array.isArray(payload.data) ? payload.data : []);
  const realTasks = enriched.filter((task) => task.isRealTask);
  const dashboardTasks = realTasks.filter((task) => task.highestVisibleTask);
  const completed = realTasks.filter((task) => task.isCompleted);
  const openTasks = dashboardTasks.filter((task) => !task.isCompleted);
  const allOpenTasks = realTasks.filter((task) => !task.isCompleted);
  const inProgress = realTasks.filter((task) => !task.isCompleted && task.normalizedStatus === 'in-progress');
  const notStarted = realTasks.filter((task) => !task.isCompleted && task.normalizedStatus === 'not-started');
  const hasStrictMilestones = enriched.some((task) => task.isMilestone);
  const milestoneTasks = dashboardTasks.filter((task) => task.isMilestone || (!hasStrictMilestones && task.isMilestoneFallback));

  const allOverdue = allOpenTasks
    .filter((task) => isExecutiveTaskOverdue(task, today))
    .map((task) => ({ ...task, lateDays: qltdDateDiffDays(task.endDate, today) }))
    .sort((a, b) => compareExecutivePriority(a, b) || b.lateDays - a.lateDays);

  const overdue = allOverdue.slice(0, 5);

  const upcoming = allOpenTasks
    .filter((task) => task.endDate && task.endDate >= today && task.endDate <= upcomingLimit)
    .map((task) => ({ ...task, remainingDays: qltdDateDiffDays(today, task.endDate) }))
    .sort((a, b) => compareExecutivePriority(a, b) || a.endDate - b.endDate)
    .slice(0, 10);

  const activeMilestones = milestoneTasks
    .filter((task) => task.isRealTask && !task.isCompleted)
    .map((task) => ({
      ...task,
      lateDays: task.endDate && task.endDate < today ? qltdDateDiffDays(task.endDate, today) : 0,
      remainingDays: task.endDate && task.endDate >= today ? qltdDateDiffDays(today, task.endDate) : null
    }))
    .sort((a, b) => compareExecutivePriority(a, b) || (a.endDate || new Date(8640000000000000)) - (b.endDate || new Date(8640000000000000)))
    .slice(0, 10);

  const completedThisMonth = completed
    .filter((task) => task.actualFinishDate && task.actualFinishDate >= monthStart && task.actualFinishDate < nextMonthStart)
    .sort((a, b) => compareExecutivePriority(a, b) || b.actualFinishDate - a.actualFinishDate)
    .slice(0, 10);

  const nextMilestone = activeMilestones
    .filter((task) => task.endDate && task.endDate >= today)
    .sort((a, b) => a.endDate - b.endDate)[0] || null;

  const severeOverdue = overdue.filter((task) => task.lateDays > 14);
  const deadline3Days = upcoming.filter((task) => task.remainingDays <= 3);
  const lateMilestones = activeMilestones.filter((task) => task.lateDays > 0);
  const lateManagementTasks = overdue.filter((task) => task.wbsLevel <= 2);
  const alerts = [
    ...severeOverdue.map((task) => ({
      tone: 'red',
      taskId: task.id,
      title: 'Việc quá hạn trên 14 ngày',
      text: `${task.text || 'Công việc'} · trễ ${task.lateDays} ngày`
    })),
    ...lateMilestones.map((task) => ({
      tone: 'red',
      taskId: task.id,
      title: 'Mốc lớn quá hạn',
      text: `${task.text || 'Mốc lớn'} · trễ ${task.lateDays} ngày`
    })),
    ...deadline3Days.map((task) => ({
      tone: 'blue',
      taskId: task.id,
      title: 'Đến hạn trong 3 ngày',
      text: `${task.text || 'Công việc'} · còn ${task.remainingDays} ngày`
    })),
    ...lateManagementTasks.map((task) => ({
      tone: 'red',
      taskId: task.id,
      title: 'Công việc cấp I/II quá hạn',
      text: `${task.text || 'Công việc'}${task.contextLabel ? ` · ${task.contextLabel}` : ''}`
    }))
  ].slice(0, 6);

  return {
    completionPercent: realTasks.length ? Math.round((completed.length / realTasks.length) * 100) : 0,
    inProgressPercent: realTasks.length ? Math.round((inProgress.length / realTasks.length) * 100) : 0,
    notStartedPercent: realTasks.length ? Math.round((notStarted.length / realTasks.length) * 100) : 0,
    overduePercent: realTasks.length ? Math.round((allOverdue.length / realTasks.length) * 100) : 0,
    kpis: {
      totalTasks: realTasks.length,
      completed: completed.length,
      inProgress: inProgress.length,
      notStarted: notStarted.length,
      overdue: allOverdue.length,
      activeMilestones: milestoneTasks.filter((task) => !task.isCompleted).length
    },
    updatedAtLabel: getDashboardUpdatedAtLabel(payload),
    openTasks: openTasks.length,
    openMilestones: milestoneTasks.filter((task) => task.isRealTask && !task.isCompleted).length,
    overdue,
    upcoming,
    activeMilestones,
    completedThisMonth,
    nextMilestone,
    alerts,
    usedMilestoneFallback: !hasStrictMilestones
  };
}

function buildExecutiveTaskContext(tasks) {
  const byWbs = {};
  const byId = {};

  tasks.forEach((task) => {
    const item = { ...task };
    item.wbsText = String(task.wbs || task.code || task.id || '').trim();
    item.wbsLevel = Number(task.wbsLevel || getExecutiveWbsLevel(item.wbsText));
    const raw = task.raw || {};
    item.startDate = qltdFirstValidDate(task.start_date, task.planned_start, task.baselineStart, task.planStart);
    item.endDate = getExecutiveTaskDueDate(task);
    item.actualStartDate = qltdFirstValidDate(task.actualStart);
    item.actualFinishDate = qltdFirstValidDate(task.actualFinish, task.actualEnd);
    item.hasAnyDate = !!(item.startDate || item.endDate || item.actualStartDate || item.actualFinishDate);
    item.normalizedStatus = normalizeStatusForFilter(task.status);
    item.hasActionStatus = item.normalizedStatus !== 'unknown';
    item.isCompleted = isExecutiveTaskCompleted(item);
    item.durationDays = Number(task.duration || task.durationDays || task.planDays || task.plannedDays || task.soNgayKeHoach || 0);
    item.isCategoryRow = isExecutiveCategoryRow(task, item, raw);
    item.isRealTask = !item.isCategoryRow && !!String(task.text || '').trim() && (item.hasAnyDate || item.hasActionStatus);
    item.isMilestone = isExecutiveStrictMilestone(task);
    item.isMilestoneFallback = item.wbsLevel >= 1 && item.wbsLevel <= 2;
    item.priorityIcon = getExecutivePriorityIcon(item);
    byId[String(item.id || '')] = item;
    if (item.wbsText) byWbs[item.wbsText] = item;
  });

  return tasks.map((task) => {
    const item = byId[String(task.id || '')] || task;
    const path = buildExecutiveParentPath(item, byWbs);
    const incompleteRealAncestor = findIncompleteRealAncestor(item, byWbs);
    return {
      ...item,
      parentPath: path.join(' > '),
      parentLevel1: path[0] || '',
      parentLevel2: path[1] || '',
      parentLevel3: path[2] || '',
      contextLabel: getExecutiveTaskCategoryFromColF(item),
      highestVisibleTask: !incompleteRealAncestor
    };
  });
}

function getExecutiveTaskCategoryFromColF(task) {
  const raw = task && task.raw || {};
  const values = [
    task && task.hangMuc,
    raw['Hạng mục'],
    raw['Hang muc'],
    raw['HANG_MUC'],
    raw.hang_muc,
    raw.hangMuc,
    raw.COL_6
  ];
  const value = values.find((item) => String(item || '').trim());
  return value === undefined ? '' : String(value).trim();
}

function findIncompleteRealAncestor(task, byWbs) {
  const wbs = String(task.wbsText || '').trim();
  if (!wbs || !wbs.includes('.')) return null;

  const parts = wbs.split('.');
  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const parentWbs = parts.slice(0, index).join('.');
    const parent = byWbs[parentWbs];
    if (parent && parent.isRealTask && !parent.isCompleted) return parent;
  }

  return null;
}

function getDashboardUpdatedAtLabel(payload) {
  const raw = payload.updatedAt || payload.lastUpdatedAt || payload.generatedAt || payload.timestamp || '';
  const parsed = raw ? new Date(raw) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleString('vi-VN');
  return parsed.toLocaleString('vi-VN');
}

function isExecutiveStrictMilestone(task) {
  if (task.type === 'milestone' || isMainMilestoneSelectedTask(task)) return true;
  const raw = task.raw || {};
  const values = [
    task.is_milestone,
    task.milestone,
    task.ma_moc,
    task.loai_cong_viec,
    raw.is_milestone,
    raw.milestone,
    raw.ma_moc,
    raw.loai_cong_viec,
    raw.Moc_chinh,
    raw['Mốc chính'],
    raw['Loại công việc']
  ];
  return values.some((value) => {
    const normalized = normalizeSearchText(value).replace(/[^a-z0-9]/g, '');
    return ['1', 'true', 'yes', 'x', 'co', 'milestone', 'moc', 'mocchinh'].includes(normalized) || normalized.includes('milestone') || normalized.includes('moc');
  });
}

function buildExecutiveParentPath(task, byWbs) {
  const wbs = String(task.wbsText || '').trim();
  if (!wbs || !wbs.includes('.')) return [];

  const parts = wbs.split('.');
  const path = [];
  for (let index = 1; index < parts.length; index += 1) {
    const parentWbs = parts.slice(0, index).join('.');
    const parent = byWbs[parentWbs];
    if (parent && parent.text && parent.text !== task.text) {
      path.push(parent.text);
    }
  }
  return path.slice(0, 3);
}

function getExecutiveWbsLevel(wbs) {
  const text = String(wbs || '').trim();
  if (!text) return 999;
  return text.split('.').length;
}

function getExecutivePriorityIcon(task) {
  if (task.isMilestone) return 'M';
  if (task.wbsLevel === 1) return 'I';
  if (task.wbsLevel === 2) return 'II';
  return '';
}

function compareExecutivePriority(a, b) {
  if (!!b.isMilestone !== !!a.isMilestone) return Number(b.isMilestone) - Number(a.isMilestone);
  if ((a.wbsLevel || 999) !== (b.wbsLevel || 999)) return (a.wbsLevel || 999) - (b.wbsLevel || 999);
  return String(a.wbsText || '').localeCompare(String(b.wbsText || ''), 'vi');
}

function qltdFirstValidDate(...values) {
  for (const value of values) {
    const date = parseIsoDate(value);
    if (date) return date;
  }
  return null;
}

function qltdDateDiffDays(start, end) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function renderExecutiveMetric(label, value, tone) {
  return `
    <article class="exec-metric ${tone ? `is-${tone}` : ''}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? 0)}</strong>
    </article>
  `;
}

function renderExecutiveKpiCard(label, value, subtext, tone) {
  return `
    <article class="exec-kpi-card ${tone ? `is-${tone}` : ''}">
      <div class="exec-kpi-icon" aria-hidden="true"></div>
      <div>
        <strong>${escapeHtml(value ?? 0)}</strong>
        <span>${escapeHtml(label)}</span>
        <em>${escapeHtml(subtext || '')}</em>
      </div>
    </article>
  `;
}

function renderExecutiveAlerts(alerts = []) {
  if (!alerts.length) {
    return `
      <section class="exec-alerts is-ok">
        <header>
          <h3>Cảnh báo điều hành</h3>
          <span>Không có cảnh báo nghiêm trọng</span>
        </header>
      </section>
    `;
  }

  return `
    <section class="exec-alerts">
      <header>
        <h3>Cảnh báo điều hành</h3>
        <span>${escapeHtml(alerts.length)} cảnh báo cần theo dõi</span>
      </header>
      <div class="exec-alert-list">
        ${alerts.map((alert) => `
          <button type="button" class="exec-alert ${alert.tone ? `is-${alert.tone}` : ''}" data-task-id="${escapeHtml(alert.taskId || '')}">
            <strong>${escapeHtml(alert.title)}</strong>
            <span title="${escapeHtml(alert.text || '')}">${escapeHtml(alert.text || '')}</span>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function renderExecutiveNextMilestone(task) {
  return `
    <article class="exec-metric is-blue">
      <span>Mốc gần nhất</span>
      <strong title="${escapeHtml(task ? task.text : '')}">${escapeHtml(task ? formatIsoDateVi(toIsoDateLocal(task.endDate)) : 'Không có')}</strong>
      <em>${escapeHtml(task ? task.text : 'Không có mốc sắp tới')}</em>
    </article>
  `;
}

function renderExecutiveListSection(title, headers, rows, rowRenderer, emptyText, tone) {
  return `
    <article class="exec-section ${tone ? `is-${tone}` : ''}">
      <header>
        <h3>${escapeHtml(title)}</h3>
        <span>${escapeHtml(rows.length)}</span>
      </header>
      ${rows.length ? `
        <div class="exec-table-wrap">
          <table class="exec-table">
            <thead>
              <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
            </thead>
            <tbody>${rows.map(rowRenderer).join('')}</tbody>
          </table>
        </div>
      ` : `<p class="exec-empty">${escapeHtml(emptyText)}</p>`}
    </article>
  `;
}

function renderExecutiveOverdueRow(task) {
  return `
    <tr class="web07-alert-row" data-task-id="${escapeHtml(task.id || '')}">
      <td class="exec-context" title="${escapeHtml(task.contextLabel || '')}">${escapeHtml(task.contextLabel || '')}</td>
      <td class="exec-task" title="${escapeHtml(task.text || '')}"><span>${escapeHtml(task.priorityIcon)}</span>${escapeHtml(task.text || '')}</td>
      <td>${escapeHtml(task.owner || 'Chưa rõ')}</td>
      <td>${escapeHtml(formatIsoDateVi(toIsoDateLocal(task.endDate)))}</td>
      <td class="exec-days"><span class="exec-badge is-red">${escapeHtml(task.lateDays)} ngày</span></td>
    </tr>
  `;
}

function renderExecutiveMilestoneRow(task) {
  const timeText = task.lateDays > 0 ? `Trễ ${task.lateDays} ngày` : `Còn ${task.remainingDays ?? 0} ngày`;
  const badgeClass = task.lateDays > 0 ? 'is-red' : 'is-blue';
  return `
    <tr class="web07-alert-row" data-task-id="${escapeHtml(task.id || '')}">
      <td class="exec-context" title="${escapeHtml(task.contextLabel || '')}">${escapeHtml(task.contextLabel || '')}</td>
      <td class="exec-task" title="${escapeHtml(task.text || '')}"><span>${escapeHtml(task.priorityIcon)}</span>${escapeHtml(task.text || '')}</td>
      <td>${escapeHtml(task.owner || 'Chưa rõ')}</td>
      <td>${escapeHtml(task.endDate ? formatIsoDateVi(toIsoDateLocal(task.endDate)) : '')}</td>
      <td class="exec-days"><span class="exec-badge ${badgeClass}">${escapeHtml(timeText)}</span></td>
    </tr>
  `;
}

function renderExecutiveUpcomingRow(task) {
  return `
    <tr class="web07-alert-row" data-task-id="${escapeHtml(task.id || '')}">
      <td class="exec-context" title="${escapeHtml(task.contextLabel || '')}">${escapeHtml(task.contextLabel || '')}</td>
      <td class="exec-task" title="${escapeHtml(task.text || '')}"><span>${escapeHtml(task.priorityIcon)}</span>${escapeHtml(task.text || '')}</td>
      <td>${escapeHtml(task.owner || 'Chưa rõ')}</td>
      <td>${escapeHtml(formatIsoDateVi(toIsoDateLocal(task.endDate)))}</td>
      <td class="exec-days"><span class="exec-badge is-blue">Còn ${escapeHtml(task.remainingDays)} ngày</span></td>
    </tr>
  `;
}

function renderExecutiveCompletedSection(rows) {
  return `
    <article class="exec-section is-green">
      <header>
        <h3>Kết quả tháng này</h3>
        <span>${escapeHtml(rows.length)}</span>
      </header>
      ${rows.length ? `
        <div class="exec-table-wrap">
          <table class="exec-table">
            <thead>
              <tr>
                <th>Hạng mục</th>
                <th>Công việc</th>
                <th>Chủ trì</th>
                <th>Ngày hoàn thành thực tế</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((task) => `
                <tr class="web07-alert-row" data-task-id="${escapeHtml(task.id || '')}">
                  <td class="exec-context" title="${escapeHtml(task.contextLabel || '')}">${escapeHtml(task.contextLabel || '')}</td>
                  <td class="exec-task" title="${escapeHtml(task.text || '')}"><span>${escapeHtml(task.priorityIcon)}</span>${escapeHtml(task.text || '')}</td>
                  <td>${escapeHtml(task.owner || 'Chưa rõ')}</td>
                  <td>${escapeHtml(formatIsoDateVi(toIsoDateLocal(task.actualFinishDate)))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="exec-empty">Không có việc hoàn thành trong tháng.</p>'}
    </article>
  `;
}

function bindDashboardTaskLinks() {
  document.querySelectorAll('.web07-alert-row[data-task-id]').forEach((row) => {
    row.onclick = async () => {
      const taskId = row.getAttribute('data-task-id');
      const projectCode = row.getAttribute('data-project-code') || '';
      await openDashboardTaskInGantt(taskId, projectCode);
    };
  });

  document.querySelectorAll('.exec-alert[data-task-id]').forEach((button) => {
    button.onclick = async () => {
      const taskId = button.getAttribute('data-task-id');
      const projectCode = button.getAttribute('data-project-code') || '';
      await openDashboardTaskInGantt(taskId, projectCode);
    };
  });
}

async function openDashboardTaskInGantt(taskId, projectCode = '') {
  if (!taskId) return;
  const targetProjectCode = String(projectCode || '').trim();
  const currentProjectCode = String(qltdGanttPayload && qltdGanttPayload.projectCode || getStoredProjectCode() || '').trim();

  if (targetProjectCode && targetProjectCode !== currentProjectCode) {
    const selector = document.getElementById('projectSelector');
    if (selector) selector.value = targetProjectCode;
    setStoredProjectCode(targetProjectCode);
    loadDeptPlansForSelectedProject(targetProjectCode);
    await loadGanttDataForSelectedProject(targetProjectCode);
  }

  showWeb07View('gantt');
  if (qltdGanttPayload) renderGanttPanel(qltdGanttPayload);
  setTimeout(() => focusGanttTask(taskId), 140);
}

function renderBreakdown(map = {}) {
  const entries = Object.entries(map || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (!entries.length) return '<p class="web07-muted">Chưa có dữ liệu.</p>';

  return `
    <table class="web07-table">
      <tbody>
        ${entries.slice(0, 10).map(([key, value]) => `
          <tr>
            <td>${escapeHtml(key)}</td>
            <td><strong>${escapeHtml(value)}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderWarnings(warnings) {
  if (!warnings.length) return '';
  const labels = {
    MISSING_TASK_START_DATE: 'Thiếu ngày bắt đầu',
    MISSING_TASK_END_DATE: 'Thiếu ngày kết thúc',
    MISSING_IMPORTANT_COLUMN: 'Thiếu cột quan trọng',
    DUPLICATE_TASK_ID_SKIPPED: 'Trùng ID công việc',
    LINK_SOURCE_NOT_FOUND: 'Liên kết thiếu công việc nguồn',
    LINK_PARSE_FAILED: 'Liên kết chưa đúng định dạng',
    WBS_PARENT_NOT_FOUND: 'Không tìm thấy WBS cha',
    MISSING_TASK_TEXT_USING_ID: 'Thiếu tên công việc'
  };
  const counts = {};
  warnings.forEach((warning) => {
    const label = labels[warning.type] || 'Cảnh báo dữ liệu';
    counts[label] = (counts[label] || 0) + 1;
  });

  return `
    <ul class="web07-warning-list">
      ${Object.entries(counts).slice(0, 8).map(([label, count]) => `
        <li>${escapeHtml(label)}: ${escapeHtml(count)} dòng</li>
      `).join('')}
    </ul>
  `;
}

function renderGanttPanel(payload) {
  const panel = document.getElementById('web07GanttPanel');
  if (!panel) return;
  resetWeb07DhtmlxGantt('renderGanttPanel');

  if (!payload || !payload.success) {
    panel.innerHTML = `
      <div class="web07-card">
        <p class="empty-state">Endpoint ganttData chưa trả dữ liệu hợp lệ.</p>
        <p class="web07-muted">${escapeHtml(payload && (payload.message || payload.error) || '')}</p>
      </div>
    `;
    return;
  }

  const owners = getUniqueTaskValues(payload.data || [], 'owner');
  const canViewMilestoneColumn = canViewMainMilestoneColumn();
  const canResetMilestone = canResetMainMilestone();
  const canExport = canExportExcel();
  if (!canViewMilestoneColumn) qltdMainMilestoneSelectMode = false;
  const milestoneModeLabel = canSelectMainMilestone() ? 'Chọn mốc chính' : 'Hiện sao mốc chính';

  panel.innerHTML = `
    <div class="web07-card">
      <div class="web07-header">
        <div>
          <h2>Gantt điều hành</h2>
          <p class="web07-subtitle">${escapeHtml(payload.projectCode)} - ${escapeHtml(payload.projectName || '')} · ${escapeHtml(payload.sourceSheet || '')}</p>
        </div>
        <span class="web07-chip">${escapeHtml((payload.data || []).length)} công việc · ${escapeHtml((payload.links || []).length)} liên kết</span>
      </div>

      <div class="web07-toolbar">
        <input id="ganttSearchInput" type="search" placeholder="Tìm công việc/WBS">
        <select id="ganttOwnerFilter">
          <option value="">Tất cả</option>
          ${owners.map((owner) => `<option value="${escapeHtml(owner || '__blank__')}">${escapeHtml(owner || 'Chưa rõ')}</option>`).join('')}
        </select>
        <select id="ganttStatusFilter">
          <option value="all">Tất cả</option>
          <option value="not-started">Chưa bắt đầu</option>
          <option value="in-progress">Đang làm</option>
          <option value="completed">Hoàn thành</option>
          <option value="paused">Tạm dừng</option>
          <option value="unknown">Không xác định</option>
        </select>
        <select id="ganttProgressFilter">
          <option value="all">Tất cả</option>
          <option value="overdue">Quá hạn</option>
          <option value="in-progress-on-time">Đang làm trong hạn</option>
          <option value="not-started-on-time">Chưa bắt đầu trong hạn</option>
          <option value="completed-on-time">Hoàn thành đúng hạn</option>
          <option value="completed-late">Hoàn thành trễ</option>
          <option value="paused-on-time">Tạm dừng trong hạn</option>
          <option value="paused-overdue">Tạm dừng quá hạn</option>
          <option value="unknown">Không xác định</option>
        </select>
        <select id="ganttDepthFilter">
          <option value="all">Tất cả</option>
          <option value="wbs-1-2">Cấp 1-2</option>
          <option value="wbs-1-3">Cấp 1-3</option>
          <option value="wbs-1-4">Cấp 1-4</option>
          <option value="main-milestones">Chỉ mốc chính</option>
        </select>
        ${canViewMilestoneColumn ? `
          <button id="ganttMilestoneModeButton" type="button" class="${qltdMainMilestoneSelectMode ? 'active' : ''}" data-label="${escapeHtml(milestoneModeLabel)}">${escapeHtml(milestoneModeLabel)}${qltdMainMilestoneIds.size ? ` (${qltdMainMilestoneIds.size})` : ''}</button>
          ${canResetMilestone ? '<button id="ganttMilestoneResetButton" type="button">Reset mốc</button>' : ''}
          <span id="ganttMilestoneBadge" class="web07-muted">Mốc chính: ${qltdMainMilestoneIds.size}</span>
        ` : ''}
        <button id="ganttLinksToggle" type="button" class="${qltdGanttShowLinks ? 'active' : ''}">Mũi tên</button>
        <span id="ganttLinkLegend" class="web07-link-legend ${qltdGanttShowLinks ? '' : 'is-muted'}">
          <span class="web07-link-sample"></span>FS
          <span class="web07-link-sample ss"></span>SS
          <span class="web07-link-sample ff"></span>FF
        </span>
        <button id="ganttDatesToggle" type="button" class="${qltdGanttShowDates ? 'active' : ''}">Ngày trên bar</button>
        ${canExport ? '<button id="ganttExcelButton" type="button">Xuất Excel</button>' : ''}
        <select id="ganttZoomSelect">
          <option value="day" ${qltdGanttZoom === 'day' ? 'selected' : ''}>Ngày</option>
          <option value="week" ${qltdGanttZoom === 'week' ? 'selected' : ''}>Tuần</option>
          <option value="month" ${qltdGanttZoom === 'month' ? 'selected' : ''}>Tháng</option>
          <option value="quarter" ${qltdGanttZoom === 'quarter' ? 'selected' : ''}>Quý</option>
          <option value="year" ${qltdGanttZoom === 'year' ? 'selected' : ''}>Năm</option>
        </select>
        <button id="ganttReloadButton" type="button">Reload</button>
      </div>

      ${payload.links && payload.links.length ? '' : '<p class="web07-muted">Chưa có mũi tên dependency: không có liên kết hoặc chưa parse được cột Công việc liên kết.</p>'}
      <div id="web07GanttContainer" class="web07-gantt-box"></div>
    </div>
  `;

  if (payload.warnings && payload.warnings.length) {
    console.warn('ganttData warnings', payload.warnings);
  }

  qltdWeb07EnsureGanttPolishStyles();
  qltdWeb07DecorateGanttToolbar();
  bindGanttToolbar(payload);
  qltdWeb07BindExcelButton();
  if (qltdActiveView !== 'gantt') {
    return;
  }

  applyGanttFilters();
}

function bindGanttToolbar(payload) {
  const controls = ['ganttSearchInput', 'ganttOwnerFilter', 'ganttStatusFilter', 'ganttProgressFilter', 'ganttDepthFilter'];
  controls.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.oninput = applyGanttFilters;
    if (el) el.onchange = applyGanttFilters;
  });

  const linksToggle = document.getElementById('ganttLinksToggle');
  if (linksToggle) {
    linksToggle.onclick = () => {
      qltdGanttShowLinks = !qltdGanttShowLinks;
      linksToggle.classList.toggle('active', qltdGanttShowLinks);
      document.getElementById('ganttLinkLegend')?.classList.toggle('is-muted', !qltdGanttShowLinks);
      applyGanttFilters();
    };
  }

  const datesToggle = document.getElementById('ganttDatesToggle');
  if (datesToggle) {
    datesToggle.onclick = () => {
      qltdGanttShowDates = !qltdGanttShowDates;
      datesToggle.classList.toggle('active', qltdGanttShowDates);
      applyGanttFilters();
    };
  }

  const zoomSelect = document.getElementById('ganttZoomSelect');
  if (zoomSelect) {
    zoomSelect.onchange = () => {
      qltdGanttZoom = zoomSelect.value || 'month';
      applyGanttFilters();
    };
  }

  const reloadButton = document.getElementById('ganttReloadButton');
  if (reloadButton) {
    reloadButton.onclick = () => loadGanttDataForSelectedProject(payload.projectCode || getStoredProjectCode());
  }

  const milestoneModeButton = document.getElementById('ganttMilestoneModeButton');
  if (milestoneModeButton) {
    milestoneModeButton.onclick = () => {
      if (!canViewMainMilestoneColumn()) return;
      qltdMainMilestoneSelectMode = !qltdMainMilestoneSelectMode;
      renderGanttPanel(qltdGanttPayload);
    };
  }

  const milestoneResetButton = document.getElementById('ganttMilestoneResetButton');
  if (milestoneResetButton) {
    milestoneResetButton.onclick = async () => {
      if (!canResetMainMilestone()) return;
      const scroll = getGanttScrollState();
      qltdMainMilestoneIds = new Set();
      await resetMainMilestonesForProject(payload.projectCode || getStoredProjectCode());
      const depthFilter = document.getElementById('ganttDepthFilter');
      if (depthFilter && depthFilter.value === 'main-milestones') {
        depthFilter.value = 'all';
      }
      renderGanttPanel(qltdGanttPayload);
      renderDashboardFromGanttData(qltdGanttPayload);
      restoreGanttScrollState(scroll);
    };
  }
}

function applyGanttFilters() {
  if (!qltdGanttPayload) return;
  const search = normalizeSearchText(document.getElementById('ganttSearchInput')?.value || '');
  const owner = document.getElementById('ganttOwnerFilter')?.value || '';
  const status = document.getElementById('ganttStatusFilter')?.value || 'all';
  const progressFilter = document.getElementById('ganttProgressFilter')?.value || 'all';
  const depthFilter = document.getElementById('ganttDepthFilter')?.value || 'all';
  const allTasks = qltdGanttPayload.data || [];
  const tasks = allTasks.filter((task) => {
    const matchSearch = !search || normalizeSearchText(`${task.wbs || ''} ${task.id || ''} ${task.code || ''} ${task.text || ''}`).includes(search);
    const taskOwner = task.owner || '__blank__';
    const matchOwner = !owner || taskOwner === owner;
    const matchStatus = status === 'all' || normalizeStatusForFilter(task.status) === status;
    const matchProgress = progressFilter === 'all' || getScheduleState(task) === progressFilter;
    const matchDepth = shouldShowByDepth(task, depthFilter);
    return matchSearch && matchOwner && matchStatus && matchProgress && matchDepth;
  });

  const visibleIds = {};
  tasks.forEach((task) => { visibleIds[String(task.id)] = true; });
  const links = qltdGanttShowLinks
    ? (qltdGanttPayload.links || []).filter((link) => visibleIds[String(link.source)] && visibleIds[String(link.target)])
    : [];
  const safeTasks = tasks.map((task) => {
    const parent = String(task.parent || '0');
    return visibleIds[parent] ? task : { ...task, parent: '0' };
  });

  initDhtmlxGantt(safeTasks, links);
}

function shouldShowByDepth(task, depthFilter) {
  if (depthFilter === 'main-milestones') {
    return isMainMilestoneKeySelected(qltdMainMilestoneIds, task);
  }
  if (depthFilter === 'wbs-1-2') return getTaskWbsLevel(task) <= 2;
  if (depthFilter === 'wbs-1-3') return getTaskWbsLevel(task) <= 3;
  if (depthFilter === 'wbs-1-4') return getTaskWbsLevel(task) <= 4;
  return true;
}

function getTaskWbsLevel(task) {
  const explicit = Number(task && task.wbsLevel);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const wbs = String(task && task.wbs || '').trim();
  if (!wbs) return 999;
  if (/^[IVXLCDM]+(\.\d+)*$/i.test(wbs) || /^\d+(\.\d+)*$/.test(wbs)) return wbs.split('.').length;
  return 999;
}

function qltdWeb07FormatDdMmYy(value) {
  if (!value) return '';
  let date = value;

  if (!(date instanceof Date)) {
    date = new Date(value);
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return escapeHtml(String(value || ''));
  }

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function qltdWeb07FormatDdMm(value) {
  if (!value) return '';
  let date = value;

  if (!(date instanceof Date)) {
    date = new Date(value);
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function qltdWeb07GetTaskDuration(task) {
  if (!task) return '';

  const explicit = Number(task.duration);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.round(explicit);
  }

  const start = parseIsoDate(task.start_date || task.baselineStart);
  const end = parseIsoDate(task.end_date || task.baselineEnd);

  if (!start || !end) return '';

  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return days > 0 ? days : '';
}

function qltdWeb07EnsureGanttPolishStyles() {
  if (document.getElementById('web07GanttUiPolishStyles')) return;

  const style = document.createElement('style');
  style.id = 'web07GanttUiPolishStyles';
  style.textContent = `
    :root {
      --qltd-web07-link-y-shift: 0px;
    }

    .qltd-web07-toolbar-field {
      display: inline-flex;
      flex-direction: column;
      gap: 4px;
      margin-right: 10px;
      vertical-align: top;
    }

    .qltd-web07-toolbar-label {
      font-size: 12px;
      font-weight: 700;
      color: #475467;
      line-height: 1.2;
      white-space: nowrap;
    }

    #web07GanttContainer .gantt_task_line {
      height: 16px !important;
      line-height: 16px !important;
      border-radius: 4px !important;
      margin-top: 0 !important;
      box-sizing: border-box !important;
    }

    #web07GanttContainer .gantt_task_content {
      line-height: 16px !important;
    }

    #web07GanttContainer .gantt_task_progress {
      background: rgba(255, 255, 255, .28) !important;
    }

    #web07GanttContainer .gantt_grid_scale .gantt_grid_head_cell,
    #web07GanttContainer .gantt_grid_data .gantt_cell {
      border-right: 1px solid #d9e1ea !important;
      box-sizing: border-box !important;
    }

    #web07GanttContainer .gantt_grid_data .gantt_row,
    #web07GanttContainer .gantt_grid_scale {
      border-bottom: 1px solid #e5eaf0 !important;
    }

    #web07GanttContainer .gantt_grid,
    #web07GanttContainer .gantt_grid_scale,
    #web07GanttContainer .gantt_grid_data {
      background: #fff !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_line_wrapper,
    #web07GanttContainer .gantt_line_wrapper {
      transform: translateY(var(--qltd-web07-link-y-shift)) !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_link_arrow_right {
      border-left-color: var(--dependency-link-color, #64748b) !important;
      border-right-color: transparent !important;
    }

    #web07GanttContainer .gantt_task_link .gantt_link_arrow_left {
      border-right-color: var(--dependency-link-color, #64748b) !important;
      border-left-color: transparent !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-overdue,
    #web07GanttContainer .gantt_task_line.qltd-task-overdue .gantt_task_content {
      background: #dc2626 !important;
      border-color: #b91c1c !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-done,
    #web07GanttContainer .gantt_task_line.qltd-task-done .gantt_task_content {
      background: #16a34a !important;
      border-color: #15803d !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-active,
    #web07GanttContainer .gantt_task_line.qltd-task-active .gantt_task_content {
      background: #2563eb !important;
      border-color: #1d4ed8 !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-not-started,
    #web07GanttContainer .gantt_task_line.qltd-task-not-started .gantt_task_content {
      background: #f4b400 !important;
      border-color: #d97706 !important;
      color: #1f2937 !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-paused,
    #web07GanttContainer .gantt_task_line.qltd-task-paused .gantt_task_content {
      background: #98a2b3 !important;
      border-color: #667085 !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_task_line.qltd-task-unknown,
    #web07GanttContainer .gantt_task_line.qltd-task-unknown .gantt_task_content {
      background: #94a3b8 !important;
      border-color: #64748b !important;
      color: #fff !important;
    }

    #web07GanttContainer .gantt_side_content,
    #web07GanttContainer .gantt_task_content {
      font-size: 11px !important;
      font-weight: 600;
    }

    body.qltd-printing > :not(.qltd-gantt-print-root) {
      display: none !important;
    }

    .qltd-gantt-print-root {
      display: none;
    }

    .qltd-gantt-print-root .web07-toolbar {
      display: none !important;
    }

    .qltd-gantt-print-root #web07GanttPanel,
    .qltd-gantt-print-root #web07GanttContainer,
    .qltd-gantt-print-root #web07GanttContainer .gantt_container,
    .qltd-gantt-print-root #web07GanttContainer .gantt_layout,
    .qltd-gantt-print-root #web07GanttContainer .gantt_grid,
    .qltd-gantt-print-root #web07GanttContainer .gantt_task,
    .qltd-gantt-print-root #web07GanttContainer .gantt_data_area,
    .qltd-gantt-print-root #web07GanttContainer .gantt_task_bg {
      overflow: visible !important;
    }

    @media print {
      @page {
        size: A4 landscape;
        margin: 8mm;
      }

      html,
      body.qltd-printing {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }

      body.qltd-printing > :not(.qltd-gantt-print-root) {
        display: none !important;
      }

      .qltd-gantt-print-root {
        display: block !important;
        position: static !important;
        width: var(--qltd-web07-print-width, 100%) !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        page-break-before: avoid !important;
        break-before: avoid !important;
      }

      .qltd-gantt-print-title {
        margin: 0 0 8px !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        line-height: 1.25 !important;
        color: #111827 !important;
      }

      .qltd-gantt-print-root #web07GanttPanel,
      .qltd-gantt-print-root #web07GanttContainer {
        width: var(--qltd-web07-print-width, 100%) !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function qltdWeb07WrapToolbarControl(control, labelText) {
  if (!control) return;
  if (control.closest('.qltd-web07-toolbar-field') || control.closest('.qltd-toolbar-field')) return;

  const parent = control.parentNode;
  if (!parent) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'qltd-web07-toolbar-field';

  const label = document.createElement('span');
  label.className = 'qltd-web07-toolbar-label';
  label.textContent = labelText;

  parent.insertBefore(wrapper, control);
  wrapper.appendChild(label);
  wrapper.appendChild(control);
}

function qltdWeb07DecorateGanttToolbar() {
  const panel = document.getElementById('web07GanttPanel');
  if (!panel) return;

  const toolbar = panel.querySelector('.web07-toolbar');
  if (!toolbar) return;

  const searchInput = toolbar.querySelector('#ganttSearchInput');
  if (searchInput) qltdWeb07WrapToolbarControl(searchInput, 'Tìm kiếm');

  const owner = toolbar.querySelector('#ganttOwnerFilter');
  if (owner) qltdWeb07WrapToolbarControl(owner, 'Chủ trì');

  const status = toolbar.querySelector('#ganttStatusFilter');
  if (status) qltdWeb07WrapToolbarControl(status, 'Trạng thái thực hiện');

  const progress = toolbar.querySelector('#ganttProgressFilter');
  if (progress) qltdWeb07WrapToolbarControl(progress, 'Tiến độ');

  const depth = toolbar.querySelector('#ganttDepthFilter');
  if (depth) qltdWeb07WrapToolbarControl(depth, 'Hiển thị đến');

  const zoom = toolbar.querySelector('#ganttZoomSelect');
  if (zoom) qltdWeb07WrapToolbarControl(zoom, 'Zoom');
}

function qltdWeb07GetVisibleGanttTasks(gantt) {
  const tasks = [];
  if (!gantt || typeof gantt.eachTask !== 'function') return tasks;

  gantt.eachTask((task) => {
    if (!task || task.$no_bar || !task.start_date || !task.end_date) return;
    if (typeof gantt.isTaskVisible === 'function' && !gantt.isTaskVisible(task.id)) return;
    tasks.push(task);
  });

  return tasks;
}

function qltdWeb07GetGanttExportRange(gantt) {
  const tasks = qltdWeb07GetVisibleGanttTasks(gantt);
  let minDate = null;
  let maxDate = null;

  tasks.forEach((task) => {
    const start = task.start_date instanceof Date ? task.start_date : new Date(task.start_date);
    const end = task.end_date instanceof Date ? task.end_date : new Date(task.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    if (!minDate || start < minDate) minDate = start;
    if (!maxDate || end > maxDate) maxDate = end;
  });

  if (!minDate || !maxDate) {
    const state = typeof gantt.getState === 'function' ? gantt.getState() : {};
    minDate = state.min_date || new Date();
    maxDate = state.max_date || addDays(minDate, 30);
  }

  return {
    start: gantt.date && typeof gantt.date.add === 'function' ? gantt.date.add(minDate, -7, 'day') : addDays(minDate, -7),
    end: gantt.date && typeof gantt.date.add === 'function' ? gantt.date.add(maxDate, 7, 'day') : addDays(maxDate, 7)
  };
}

function qltdWeb07GetFullGanttExportSize(gantt, range) {
  const tasks = qltdWeb07GetVisibleGanttTasks(gantt);
  const rowHeight = Number(gantt.config.row_height || 32);
  const gridWidth = Number(gantt.config.grid_width || 552);
  let timelineWidthByDate = 0;

  if (range && range.end && typeof gantt.posFromDate === 'function') {
    try {
      timelineWidthByDate = Math.ceil(gantt.posFromDate(range.end));
    } catch (error) {
      timelineWidthByDate = 0;
    }
  }

  const taskWidth = Math.max(
    timelineWidthByDate,
    gantt.$task_data ? gantt.$task_data.scrollWidth : 0,
    gantt.$task ? gantt.$task.scrollWidth : 0,
    1200
  );
  const height = Math.max(760, (tasks.length + 3) * rowHeight + Number(gantt.config.scale_height || 54) + 120);

  return {
    width: Math.max(1280, gridWidth + taskWidth + 120),
    height
  };
}

async function qltdWeb07PrepareGanttPrint() {
  const gantt = getDhtmlxGanttInstance();
  const container = document.getElementById('web07GanttContainer');
  const panel = document.getElementById('web07GanttPanel');
  if (!gantt || !container) return null;

  const range = qltdWeb07GetGanttExportRange(gantt);
  const prev = {
    startDate: gantt.config.start_date,
    endDate: gantt.config.end_date,
    smartRendering: gantt.config.smart_rendering,
    fitTasks: gantt.config.fit_tasks,
    autofit: gantt.config.autofit,
    autosize: gantt.config.autosize,
    scroll: typeof gantt.getScrollState === 'function' ? gantt.getScrollState() : null,
    panelWidth: panel ? panel.style.width : '',
    panelMaxWidth: panel ? panel.style.maxWidth : '',
    containerWidth: container.style.width,
    containerHeight: container.style.height,
    containerMinWidth: container.style.minWidth,
    containerMinHeight: container.style.minHeight,
    containerOverflow: container.style.overflow,
    printWidth: document.documentElement.style.getPropertyValue('--qltd-web07-print-width')
  };

  gantt.config.start_date = range.start;
  gantt.config.end_date = range.end;
  gantt.config.smart_rendering = false;
  gantt.config.fit_tasks = false;
  gantt.config.autofit = false;
  gantt.config.autosize = 'xy';
  gantt.render();
  await qltdWeb07NextFrame();

  const full = qltdWeb07GetFullGanttExportSize(gantt, range);
  document.documentElement.style.setProperty('--qltd-web07-print-width', `${full.width}px`);

  if (panel) {
    panel.style.width = `${full.width}px`;
    panel.style.maxWidth = 'none';
  }

  container.style.width = `${full.width}px`;
  container.style.minWidth = `${full.width}px`;
  container.style.height = `${full.height}px`;
  container.style.minHeight = `${full.height}px`;
  container.style.overflow = 'visible';

  if (typeof gantt.setSizes === 'function') gantt.setSizes();
  gantt.render();
  await qltdWeb07NextFrame();

  if (typeof gantt.scrollTo === 'function') {
    gantt.scrollTo(0, 0);
    await qltdWeb07NextFrame();
  }

  return { gantt, container, panel, prev, full };
}

function qltdWeb07RemoveGanttPrintRoots() {
  document.querySelectorAll('.qltd-gantt-print-root').forEach((root) => root.remove());
}

function qltdWeb07LoadBrowserScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);

  return new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((script) => script.src === src);
    if (existing) {
      existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Không tải được thư viện: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(globalName ? window[globalName] : true);
    script.onerror = () => reject(new Error(`Không tải được thư viện: ${src}`));
    document.head.appendChild(script);
  });
}

function qltdWeb07LoadExcelJs() {
  if (!qltdExcelJsLoadPromise) {
    qltdExcelJsLoadPromise = qltdWeb07LoadBrowserScript(
      'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
      'ExcelJS'
    );
  }
  return qltdExcelJsLoadPromise;
}

function qltdWeb07LoadHtmlToImage() {
  if (!qltdHtmlToImageLoadPromise) {
    qltdHtmlToImageLoadPromise = qltdWeb07LoadBrowserScript(
      'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js',
      'htmlToImage'
    );
  }
  return qltdHtmlToImageLoadPromise;
}

function qltdWeb07BuildGanttPrintRoot(ctx) {
  if (!ctx || !ctx.container) return null;

  qltdWeb07RemoveGanttPrintRoots();

  const root = document.createElement('section');
  root.className = 'qltd-gantt-print-root';
  root.setAttribute('aria-hidden', 'true');
  root.style.width = `${ctx.full.width}px`;

  const title = document.createElement('h1');
  title.className = 'qltd-gantt-print-title';
  const projectName = qltdGanttPayload && (qltdGanttPayload.projectName || qltdGanttPayload.projectCode);
  title.textContent = projectName ? `Gantt - ${projectName}` : 'Gantt tiến độ';
  root.appendChild(title);

  const ganttClone = ctx.container.cloneNode(true);
  ganttClone.style.width = `${ctx.full.width}px`;
  ganttClone.style.minWidth = `${ctx.full.width}px`;
  ganttClone.style.height = `${ctx.full.height}px`;
  ganttClone.style.minHeight = `${ctx.full.height}px`;
  ganttClone.style.overflow = 'visible';
  root.appendChild(ganttClone);

  document.body.appendChild(root);
  return root;
}

function qltdWeb07CollectGanttLinks(gantt) {
  const links = [];

  if (gantt && typeof gantt.eachLink === 'function') {
    try {
      gantt.eachLink((link) => {
        links.push({ ...link });
      });
    } catch (error) {
      console.warn('Cannot read DHTMLX links for Excel export', error);
    }
  }

  if (!links.length && qltdGanttPayload && Array.isArray(qltdGanttPayload.links)) {
    return qltdGanttPayload.links.map((link) => ({ ...link }));
  }

  return links;
}

function qltdWeb07BuildLinkTextByTarget(gantt) {
  const links = qltdWeb07CollectGanttLinks(gantt);
  const sourceNameById = {};

  qltdWeb07GetVisibleGanttTasks(gantt).forEach((task) => {
    sourceNameById[String(task.id)] = task.wbs || task.code || task.text || task.id;
  });

  const byTarget = {};
  links.forEach((link) => {
    const targetId = String(link.target || '');
    const sourceId = String(link.source || '');
    if (!targetId || !sourceId) return;

    const relation = String(link.relation || relationFromDhtmlxType(link.type) || 'FS').toUpperCase();
    const sourceLabel = sourceNameById[sourceId] || sourceId;
    if (!byTarget[targetId]) byTarget[targetId] = { predecessors: [], relations: [] };
    byTarget[targetId].predecessors.push(sourceLabel);
    byTarget[targetId].relations.push(relation);
  });

  return byTarget;
}

function qltdWeb07BuildGanttDataRows(gantt) {
  const linkTextByTarget = qltdWeb07BuildLinkTextByTarget(gantt);

  return qltdWeb07GetVisibleGanttTasks(gantt).map((task) => {
    const linkInfo = linkTextByTarget[String(task.id)] || {};
    return {
      wbs: task.wbs || task.id || '',
      text: task.text || '',
      owner: task.owner || '',
      duration: qltdWeb07GetTaskDuration(task),
      start: qltdWeb07FormatDdMmYy(task.start_date || task.baselineStart || ''),
      end: qltdWeb07FormatDdMmYy(task.end_date || task.baselineEnd || ''),
      predecessors: (linkInfo.predecessors || []).join(', ') || task.predecessorRaw || '',
      relation: Array.from(new Set(linkInfo.relations || [])).join(', '),
      status: task.status || '',
      note: task.updateNote || task.note || ''
    };
  });
}

function qltdWeb07SafeFilename(value) {
  return String(value || 'gantt')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'gantt';
}

function qltdWeb07DownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function qltdWeb07CaptureGanttPng(ctx) {
  const htmlToImage = await qltdWeb07LoadHtmlToImage();
  if (!htmlToImage || typeof htmlToImage.toPng !== 'function') {
    throw new Error('Thư viện html-to-image chưa sẵn sàng.');
  }

  const width = Math.ceil(ctx.full.width);
  const height = Math.ceil(ctx.full.height);

  return htmlToImage.toPng(ctx.container, {
    width,
    height,
    cacheBust: true,
    pixelRatio: 1,
    backgroundColor: '#ffffff',
    style: {
      width: `${width}px`,
      minWidth: `${width}px`,
      height: `${height}px`,
      minHeight: `${height}px`,
      overflow: 'visible'
    }
  });
}

async function qltdWeb07ExportGanttExcel() {
  if (!canExportExcel()) {
    alert('Bạn cần đăng nhập để xuất Excel.');
    return;
  }

  const button = document.getElementById('ganttExcelButton');
  const prevText = button ? button.textContent : '';

  if (button) {
    button.disabled = true;
    button.textContent = 'Đang xuất...';
  }

  let ctx = null;
  try {
    const ExcelJS = await qltdWeb07LoadExcelJs();
    ctx = await qltdWeb07PrepareGanttPrint();

    if (!ExcelJS || !ctx) {
      throw new Error('Chưa thể chuẩn bị Gantt để xuất Excel.');
    }

    const imageDataUrl = await qltdWeb07CaptureGanttPng(ctx);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QLTD Firebase WebApp';
    workbook.created = new Date();
    workbook.modified = new Date();

    const printSheet = workbook.addWorksheet('Gantt_Print', {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        verticalCentered: false,
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 }
      },
      properties: { defaultRowHeight: 18 }
    });

    const maxExcelImageWidth = 2600;
    const imageScale = Math.min(1, maxExcelImageWidth / Math.max(ctx.full.width, 1));
    const imageWidth = Math.round(ctx.full.width * imageScale);
    const imageHeight = Math.round(ctx.full.height * imageScale);
    const imageId = workbook.addImage({ base64: imageDataUrl, extension: 'png' });

    for (let col = 1; col <= 18; col += 1) {
      printSheet.getColumn(col).width = 18;
    }
    for (let row = 1; row <= Math.max(1, Math.ceil(imageHeight / 24)); row += 1) {
      printSheet.getRow(row).height = 18;
    }
    printSheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: imageWidth, height: imageHeight },
      editAs: 'oneCell'
    });

    const dataSheet = workbook.addWorksheet('Gantt_Data', {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 }
      },
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    dataSheet.columns = [
      { header: 'WBS', key: 'wbs', width: 16 },
      { header: 'Công việc', key: 'text', width: 48 },
      { header: 'Chủ trì', key: 'owner', width: 20 },
      { header: 'Số ngày', key: 'duration', width: 12 },
      { header: 'BĐ', key: 'start', width: 14 },
      { header: 'KT', key: 'end', width: 14 },
      { header: 'Tiền nhiệm', key: 'predecessors', width: 26 },
      { header: 'Loại liên kết', key: 'relation', width: 16 },
      { header: 'Trạng thái', key: 'status', width: 18 },
      { header: 'Ghi chú', key: 'note', width: 36 }
    ];
    dataSheet.addRows(qltdWeb07BuildGanttDataRows(ctx.gantt));
    dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dataSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    dataSheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9E1EA' } },
          left: { style: 'thin', color: { argb: 'FFD9E1EA' } },
          bottom: { style: 'thin', color: { argb: 'FFD9E1EA' } },
          right: { style: 'thin', color: { argb: 'FFD9E1EA' } }
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const projectCode = qltdGanttPayload && (qltdGanttPayload.projectCode || qltdGanttPayload.projectName);
    const filename = `${qltdWeb07SafeFilename(projectCode)}_gantt_${toIsoDateLocal(new Date())}.xlsx`;
    qltdWeb07DownloadBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      filename
    );
  } catch (error) {
    console.error('Cannot export Gantt Excel', error);
    alert(`Không xuất được Excel: ${error.message || error}`);
  } finally {
    if (ctx) {
      try {
        await qltdWeb07RestoreGanttPrint(ctx);
      } catch (restoreError) {
        console.warn('Cannot restore Gantt after Excel export', restoreError);
      }
    }

    if (button) {
      button.disabled = false;
      button.textContent = prevText || 'Xuất Excel';
    }
  }
}

async function qltdWeb07RestoreGanttPrint(ctx) {
  if (!ctx || !ctx.gantt || !ctx.container) return;

  const { gantt, container, panel, prev } = ctx;
  document.body.classList.remove('qltd-printing');
  qltdWeb07RemoveGanttPrintRoots();
  document.documentElement.style.setProperty('--qltd-web07-print-width', prev.printWidth || '');
  if (!prev.printWidth) document.documentElement.style.removeProperty('--qltd-web07-print-width');

  if (panel) {
    panel.style.width = prev.panelWidth || '';
    panel.style.maxWidth = prev.panelMaxWidth || '';
  }

  container.style.width = prev.containerWidth || '';
  container.style.height = prev.containerHeight || '';
  container.style.minWidth = prev.containerMinWidth || '';
  container.style.minHeight = prev.containerMinHeight || '';
  container.style.overflow = prev.containerOverflow || '';

  gantt.config.start_date = prev.startDate;
  gantt.config.end_date = prev.endDate;
  gantt.config.smart_rendering = prev.smartRendering;
  gantt.config.fit_tasks = prev.fitTasks;
  gantt.config.autofit = prev.autofit;
  gantt.config.autosize = prev.autosize;
  gantt.render();
  await qltdWeb07NextFrame();

  if (typeof gantt.scrollTo === 'function' && prev.scroll) {
    gantt.scrollTo(prev.scroll.x || 0, prev.scroll.y || 0);
  }
  if (typeof gantt.setSizes === 'function') gantt.setSizes();
}



function qltdWeb07BindExcelButton() {
  const button = document.getElementById('ganttExcelButton');
  if (!button) return;

  button.onclick = qltdWeb07ExportGanttExcel;
}

async function initDhtmlxGantt(tasks, links) {
  const container = document.getElementById('web07GanttContainer');
  if (!container) return;

  qltdWeb07EnsureGanttPolishStyles();
  qltdWeb07DecorateGanttToolbar();
  qltdWeb07BindExcelButton();
  const renderSeq = ++qltdDhtmlxGanttRenderSeq;

  const datedIds = {};
  tasks.filter((task) => task.start_date && task.end_date).forEach((task) => {
    datedIds[String(task.id)] = true;
  });

  const datedTasks = tasks
    .filter((task) => task.start_date && task.end_date)
    .map((task) => {
      const parent = String(task.parent || '0');
      return datedIds[parent] ? task : { ...task, parent: '0' };
    });

  const ganttInstance = await ensureDhtmlxGanttLoaded();

  if (renderSeq !== qltdDhtmlxGanttRenderSeq) {
    return;
  }

  if (!datedTasks.length || !ganttInstance) {
    renderGanttFallback(
      container,
      tasks,
      !ganttInstance ? 'DHTMLX chưa load được, đang hiển thị bảng fallback.' : 'Chưa có công việc đủ ngày bắt đầu/kết thúc.'
    );
    return;
  }

  const canRenderGantt = await qltdWeb07WaitForRenderableGanttContainer(container);
  if (!canRenderGantt) {
    renderGanttFallback(container, tasks, 'Khung Gantt chưa có chiều cao hợp lệ, đang hiển thị bảng fallback.');
    return;
  }

  const gantt = ganttInstance;

  try {
    gantt.plugins({ tooltip: true });
  } catch (error) {
    console.warn('WEB07F: tooltip plugin ignored', error);
  }

  gantt.config.readonly = true;
  gantt.config.drag_move = false;
  gantt.config.drag_resize = false;
  gantt.config.drag_progress = false;
  gantt.config.drag_links = false;
  gantt.config.details_on_dblclick = false;
  gantt.config.open_tree_initially = true;
  gantt.config.show_links = qltdGanttShowLinks;
  gantt.config.grid_resize = true;
  gantt.config.grid_width = qltdMainMilestoneSelectMode ? 596 : 552;
  gantt.config.row_height = 32;
  gantt.config.bar_height = 16;
  gantt.config.fit_tasks = true;
  gantt.config.show_errors = false;
  gantt.config.date_format = '%Y-%m-%d';

  const columns = [
    { name: 'wbs', label: 'WBS', width: 72, align: 'left' },
    { name: 'text', label: 'Công việc', tree: true, width: 300, resize: true },
    { name: 'owner', label: 'Chủ trì', width: 120, align: 'center' },
    {
      name: 'duration',
      label: 'Số ngày',
      width: 74,
      align: 'center',
      template: (task) => escapeHtml(String(qltdWeb07GetTaskDuration(task)))
    },
    {
      name: 'start_plan',
      label: 'BĐ',
      width: 86,
      align: 'center',
      template: (task) => qltdWeb07FormatDdMmYy(task.start_date || task.baselineStart || '')
    },
    {
      name: 'end_plan',
      label: 'KT',
      width: 86,
      align: 'center',
      template: (task) => qltdWeb07FormatDdMmYy(task.end_date || task.baselineEnd || '')
    }
  ];
  if (qltdMainMilestoneSelectMode) {
    columns.unshift({
      name: 'mainMilestone',
      label: 'Mốc',
      width: 44,
      align: 'center',
      resize: false,
      template: (task) => {
        const selected = isMainMilestoneSelectedTask(task);
        const canEditMilestone = canSelectMainMilestone();
        const title = canEditMilestone
          ? (selected ? 'Bỏ chọn mốc chính' : 'Chọn mốc chính')
          : 'Mốc chính do PMO thiết lập';
        return `<span class="main-milestone-cell ${selected ? 'is-selected' : ''} ${canEditMilestone ? '' : 'is-readonly'}" title="${escapeHtml(title)}">${selected ? '&#9733;' : '&#9734;'}</span>`;
      }
    });
  }

  gantt.config.columns = columns;

  setGanttZoom(gantt, qltdGanttZoom);

  gantt.templates.tooltip_text = function(start, end, task) {
    return `
      <strong>${escapeHtml(task.text || '')}</strong><br>
      WBS: ${escapeHtml(task.wbs || task.id || '')}<br>
      Mã công việc: ${escapeHtml(task.code || '')}<br>
      Chủ trì: ${escapeHtml(task.owner || '')}<br>
      Trạng thái: ${escapeHtml(task.status || '')}<br>
      Bắt đầu kế hoạch: ${escapeHtml(formatIsoDateVi(task.baselineStart || task.start_date || ''))}<br>
      Kết thúc kế hoạch: ${escapeHtml(formatIsoDateVi(task.baselineEnd || task.end_date || ''))}<br>
      Bắt đầu thực tế: ${escapeHtml(formatIsoDateVi(task.actualStart || ''))}<br>
      Hoàn thành thực tế: ${escapeHtml(formatIsoDateVi(task.actualEnd || ''))}<br>
      Công việc liên kết: ${escapeHtml(task.predecessorRaw || '')}<br>
      Ghi chú cập nhật: ${escapeHtml(task.updateNote || task.note || '')}
    `;
  };

  gantt.templates.task_text = function() {
    return '';
  };

  gantt.templates.task_class = function(start, end, task) {
    const classes = [];

    if (isMainMilestoneSelectedTask(task)) classes.push('main-milestone-row');
    if (task.type === 'milestone') classes.push('qltd-gantt-milestone');

    const status = normalizeStatusForFilter(task.status);
    const scheduleState = getScheduleState(task);

    if (status === 'completed') {
      classes.push('qltd-task-done');
    } else if (scheduleState === 'overdue' || task.isOverdue) {
      classes.push('qltd-task-overdue');
    } else if (status === 'in-progress') {
      classes.push('qltd-task-active');
    } else if (status === 'not-started') {
      classes.push('qltd-task-not-started');
    } else if (status === 'paused') {
      classes.push('qltd-task-paused');
    } else {
      classes.push('qltd-task-unknown');
    }

    return classes.join(' ');
  };

  gantt.templates.link_class = function(link) {
    const relation = String(link.relation || relationFromDhtmlxType(link.type) || 'FS').toUpperCase();
    if (relation === 'SS') return 'qltd-link-ss';
    if (relation === 'FF') return 'qltd-link-ff';
    if (relation === 'SF') return 'qltd-link-sf';
    return 'qltd-link-fs';
  };

  gantt.templates.rightside_text = function(start, end, task) {
    return qltdGanttShowDates ? qltdWeb07FormatDdMm(task.end_date || end) : '';
  };

  gantt.templates.leftside_text = function(start, end, task) {
    return qltdGanttShowDates ? qltdWeb07FormatDdMm(task.start_date || start) : '';
  };

  bindMainMilestoneGanttEvents(gantt);

  try {
    const hasGanttDom = !!container.querySelector('.gantt_container');
    if (!qltdDhtmlxGanttInitialized || !hasGanttDom) {
      container.innerHTML = '';
      gantt.init(container);
      qltdDhtmlxGanttInitialized = true;
    }
  } catch (error) {
    console.warn('WEB07F: gantt.init retry', error);
    try {
      container.innerHTML = '';
      gantt.init(container);
      qltdDhtmlxGanttInitialized = true;
    } catch (retryError) {
      console.error('WEB07F: gantt.init failed', retryError);
      renderGanttFallback(container, tasks, 'DHTMLX gặp lỗi khi khởi tạo, đang hiển thị bảng fallback.');
      return;
    }
  }

  try {
    gantt.clearAll();
  } catch (error) {
    console.warn('WEB07F: ignored gantt.clearAll before parse', error);
    try {
      container.innerHTML = '';
      gantt.init(container);
      qltdDhtmlxGanttInitialized = true;
    } catch (retryError) {
      console.error('WEB07F: gantt re-init failed after clearAll error', retryError);
      renderGanttFallback(container, tasks, 'DHTMLX gặp lỗi khi làm mới dữ liệu, đang hiển thị bảng fallback.');
      return;
    }
  }

  try {
    gantt.parse({ data: datedTasks, links: links || [] });
  } catch (error) {
    console.error('WEB07F: gantt.parse failed', error);
    renderGanttFallback(container, tasks, 'DHTMLX gặp lỗi khi đọc dữ liệu, đang hiển thị bảng fallback.');
    return;
  }

  requestAnimationFrame(() => {
    try {
      if (gantt.setSizes) gantt.setSizes();
      if (gantt.render) gantt.render();
    } catch (error) {
      console.warn('WEB07F: gantt final render ignored', error);
    }
  });
}

function bindMainMilestoneGanttEvents(gantt) {
  if (!gantt || typeof gantt.attachEvent !== 'function') return;

  if (qltdMainMilestoneGanttClickEventId && typeof gantt.detachEvent === 'function') {
    try {
      gantt.detachEvent(qltdMainMilestoneGanttClickEventId);
    } catch (error) {
      console.warn('Cannot detach previous main milestone event', error);
    }
  }

  qltdMainMilestoneGanttClickEventId = gantt.attachEvent('onTaskClick', (taskId, event) => {
    const target = event && event.target;
    const star = target && typeof target.closest === 'function'
      ? target.closest('.main-milestone-cell')
      : null;

    if (!star) return true;
    if (!canSelectMainMilestone()) return false;

    toggleMainMilestone(taskId);
    return false;
  });
}

function getDhtmlxGanttInstance() {
  return window.gantt || (window.dhtmlxgantt && window.dhtmlxgantt.gantt) || null;
}

function ensureDhtmlxGanttLoaded() {
  const current = getDhtmlxGanttInstance();
  if (current) return Promise.resolve(current);
  if (qltdDhtmlxLoadPromise) return qltdDhtmlxLoadPromise;

  qltdDhtmlxLoadPromise = new Promise((resolve) => {
    const appendScript = () => {
      const script = document.createElement('script');
      script.src = 'https://cdn.dhtmlx.com/gantt/edge/dhtmlxgantt.js';
      script.onload = () => resolve(getDhtmlxGanttInstance());
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    };
    const existing = Array.from(document.scripts).some((script) => script.src.includes('dhtmlxgantt.js'));
    if (!existing) {
      appendScript();
      return;
    }
    setTimeout(() => {
      const loaded = getDhtmlxGanttInstance();
      if (loaded) {
        resolve(loaded);
      } else {
        appendScript();
      }
    }, 500);
  });

  return qltdDhtmlxLoadPromise;
}

function setGanttZoom(gantt, zoom) {
  if (zoom === 'day') {
    gantt.config.scale_height = 54;
    gantt.config.scales = [{ unit: 'day', step: 1, format: '%d/%m' }];
    return;
  }
  if (zoom === 'week') {
    gantt.config.scale_height = 54;
    gantt.config.scales = [
      { unit: 'month', step: 1, format: '%m/%Y' },
      {
        unit: 'week',
        step: 1,
        format: function(date) {
          const week = gantt.date && typeof gantt.date.getWeek === 'function' ? gantt.date.getWeek(date) : 0;
          return String(week).padStart(2, '0');
        }
      }
    ];
    return;
  }
  if (zoom === 'quarter') {
    gantt.config.scale_height = 54;
    gantt.config.scales = [
      { unit: 'year', step: 1, format: '%Y' },
      {
        unit: 'month',
        step: 3,
        format: function(date) {
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          return `Quý ${quarter}`;
        }
      }
    ];
    return;
  }
  if (zoom === 'year') {
    gantt.config.scale_height = 54;
    gantt.config.scales = [{ unit: 'year', step: 1, format: '%Y' }];
    return;
  }
  gantt.config.scale_height = 54;
  gantt.config.scales = [
    { unit: 'year', step: 1, format: '%Y' },
    { unit: 'month', step: 1, format: '%m' }
  ];
}

function renderGanttFallback(container, tasks, message) {
  container.classList.add('is-fallback');
  container.innerHTML = `
    <div class="web07-card">
      <p class="web07-muted">${escapeHtml(message)}</p>
      <div class="web07-fallback-table-wrap">
        <table class="web07-table">
          <thead>
            <tr>
              <th>WBS</th>
              <th>Công việc</th>
              <th>Chủ trì</th>
              <th>Trạng thái</th>
              <th>BĐ</th>
              <th>KT</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map((task) => `
              <tr>
                <td>${escapeHtml(task.wbs || task.id || '')}</td>
                <td>${escapeHtml(task.text || '')}</td>
                <td>${escapeHtml(task.owner || '')}</td>
                <td>${escapeHtml(task.status || '')}</td>
                <td>${escapeHtml(formatIsoDateVi(task.start_date || ''))}</td>
                <td>${escapeHtml(formatIsoDateVi(task.end_date || ''))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function focusGanttTask(taskId) {
  const gantt = getDhtmlxGanttInstance();
  if (!taskId || !gantt) return;
  try {
    if (!gantt.isTaskExists(taskId)) return;
    gantt.selectTask(taskId);
    gantt.showTask(taskId);
  } catch (error) {
    console.warn('Cannot focus gantt task', error);
  }
}

function normalizeMainMilestoneProjectKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const exact = qltdProjectRegistry.find((project) => String(project.projectCode || '').trim() === raw);
  if (exact && exact.projectCode) return String(exact.projectCode).trim();

  const displayMatch = raw.match(/^(.+?)\s+-\s+.+$/);
  const displayCode = displayMatch ? displayMatch[1].trim() : '';
  if (displayCode) {
    const registryMatch = qltdProjectRegistry.find((project) => String(project.projectCode || '').trim() === displayCode);
    if (registryMatch && registryMatch.projectCode) return String(registryMatch.projectCode).trim();
    return displayCode;
  }

  return raw;
}

function getMainMilestoneProjectKey(projectCode = getStoredProjectCode(), payload = qltdGanttPayload) {
  const candidates = [
    projectCode,
    payload && payload.projectCode,
    getStoredProjectCode()
  ];

  for (const candidate of candidates) {
    const key = normalizeMainMilestoneProjectKey(candidate);
    if (key) return key;
  }

  return '';
}

function getMainMilestoneProjectKeyAliases(projectCode = getStoredProjectCode(), payload = qltdGanttPayload) {
  const candidates = [
    getMainMilestoneProjectKey(projectCode, payload),
    projectCode,
    payload && payload.projectCode,
    payload && payload.projectName,
    payload && payload.projectCode && payload.projectName ? `${payload.projectCode} - ${payload.projectName}` : '',
    getStoredProjectCode()
  ];

  const aliases = [];
  candidates.forEach((candidate) => {
    const raw = String(candidate || '').trim();
    if (raw && !aliases.includes(raw)) aliases.push(raw);

    const normalized = normalizeMainMilestoneProjectKey(raw);
    if (normalized && !aliases.includes(normalized)) aliases.push(normalized);
  });

  return aliases;
}

function getMainMilestoneStorageKey(projectCode = getStoredProjectCode(), payload = qltdGanttPayload) {
  const projectKey = getMainMilestoneProjectKey(projectCode, payload);
  return `qltd.mainMilestones.${projectKey || 'unknown'}`;
}

function getMainMilestoneDocRef(projectKey = qltdCurrentMainMilestoneProjectKey || getMainMilestoneProjectKey()) {
  if (!db || !projectKey) return null;
  return doc(db, 'qltdMainMilestones', String(projectKey));
}

function readCachedMainMilestones(projectCode, payload = qltdGanttPayload) {
  try {
    const raw = localStorage.getItem(getMainMilestoneStorageKey(projectCode, payload));
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch (error) {
    console.warn('Cannot read cached main milestone ids', error);
    return [];
  }
}

function cacheMainMilestonesForProject(projectCode = getStoredProjectCode(), payload = qltdGanttPayload) {
  try {
    localStorage.setItem(getMainMilestoneStorageKey(projectCode, payload), JSON.stringify(Array.from(qltdMainMilestoneIds)));
  } catch (error) {
    console.warn('Cannot cache main milestone ids', error);
  }
}

function getMainMilestonesFromApiPayload(payload) {
  if (!payload) return [];
  const directValues = [
    ...(Array.isArray(payload.ids) ? payload.ids : []),
    ...(Array.isArray(payload.codes) ? payload.codes : []),
    ...(Array.isArray(payload.mainMilestoneIds) ? payload.mainMilestoneIds : []),
    ...(Array.isArray(payload.mainMilestoneCodes) ? payload.mainMilestoneCodes : []),
    ...(Array.isArray(payload.mainMilestones) ? payload.mainMilestones : []),
    ...(Array.isArray(payload.items) ? payload.items.flatMap((item) => [item && item.id, item && item.code]) : [])
  ];
  const taskValues = (Array.isArray(payload.data) ? payload.data : []).flatMap((task) => {
    const raw = task.raw || {};
    const marker = task.mainMilestone ?? task.isMainMilestone ?? raw.Moc_chinh ?? raw['Mốc chính'];
    const normalized = normalizeSearchText(marker).replace(/[^a-z0-9]/g, '');
    if (!['1', 'true', 'yes', 'x', 'co', 'mocchinh'].includes(normalized)) return [];
    return [task.id, task.code].filter(Boolean);
  });
  return [...directValues, ...taskValues].map(String).filter(Boolean);
}

function hasMainMilestoneApiSource(payload) {
  if (!payload) return false;
  const source = String(payload.mainMilestoneSource || '').toUpperCase();
  return source === 'APPS_SCRIPT' || source === 'GOOGLE_SHEET' ||
    Object.prototype.hasOwnProperty.call(payload, 'mainMilestoneIds') ||
    Object.prototype.hasOwnProperty.call(payload, 'mainMilestoneCodes') ||
    Object.prototype.hasOwnProperty.call(payload, 'mainMilestones');
}

async function loadMainMilestonesForProject(projectCode, payload = qltdGanttPayload) {
  const projectKey = getMainMilestoneProjectKey(projectCode, payload);
  const aliases = getMainMilestoneProjectKeyAliases(projectCode, payload);
  qltdCurrentMainMilestoneProjectKey = projectKey;
  const payloadIds = getMainMilestonesFromApiPayload(payload);
  qltdMainMilestoneIds = normalizeMainMilestoneTaskKeys(
    payloadIds.length ? payloadIds : readCachedMainMilestones(projectKey, payload),
    payload && payload.data
  );

  try {
    const response = await fetchBackendJson('getMainMilestones', {
      projectCode: projectKey,
      email: currentUserProfile && currentUserProfile.email || ''
    });
    if (response && response.success !== false) {
      const backendIds = getMainMilestonesFromApiPayload(response);
      qltdMainMilestoneIds = normalizeMainMilestoneTaskKeys(backendIds, payload && payload.data);
      cacheMainMilestonesForProject(projectKey, payload);
      console.log('[mainMilestone] loaded from Apps Script API', backendIds);
      return;
    }
    console.warn('Apps Script main milestone API rejected read; trying compatibility source', response);
  } catch (error) {
    console.warn('Apps Script main milestone API unavailable; trying compatibility source', error);
  }

  if (hasMainMilestoneApiSource(payload)) {
    qltdMainMilestoneIds = normalizeMainMilestoneTaskKeys(payloadIds, payload && payload.data);
    cacheMainMilestonesForProject(projectKey, payload);
    console.log('[mainMilestone] loaded from Apps Script API payload', payloadIds);
    return;
  }

  if (!db || !aliases.length) return;

  try {
    let matchedSnapshot = null;
    let matchedKey = '';

    for (const alias of aliases) {
      const snapshot = await getDoc(getMainMilestoneDocRef(alias));
      if (snapshot.exists()) {
        matchedSnapshot = snapshot;
        matchedKey = alias;
        break;
      }
    }

    if (!matchedSnapshot) {
      qltdMainMilestoneIds = new Set();
      cacheMainMilestonesForProject(projectKey, payload);
      console.log('[mainMilestone] projectKey', projectKey);
      console.log('[mainMilestone] loaded ids', []);
      console.log('[mainMilestone] role/canSelect', currentUserProfile && currentUserProfile.role, canSelectMainMilestone());
      return;
    }

    const data = matchedSnapshot.data() || {};
    const ids = Array.isArray(data.milestoneIds) ? data.milestoneIds : [];
    const codes = Array.isArray(data.milestoneCodes) ? data.milestoneCodes : [];
    qltdMainMilestoneIds = normalizeMainMilestoneTaskKeys([...ids, ...codes], payload && payload.data);
    cacheMainMilestonesForProject(projectKey, payload);
    console.log('[mainMilestone] projectKey', projectKey);
    if (matchedKey && matchedKey !== projectKey) console.log('[mainMilestone] matched legacy key', matchedKey);
    console.log('[mainMilestone] loaded ids', Array.from(qltdMainMilestoneIds));
    console.log('[mainMilestone] role/canSelect', currentUserProfile && currentUserProfile.role, canSelectMainMilestone());
  } catch (error) {
    console.warn('Cannot load global main milestone ids; using local cache', error);
  }
}

async function saveMainMilestonesForProject(projectCode = getStoredProjectCode(), payload = qltdGanttPayload) {
  const projectKey = getMainMilestoneProjectKey(projectCode, payload);
  qltdCurrentMainMilestoneProjectKey = projectKey;
  cacheMainMilestonesForProject(projectKey, payload);

  try {
    const response = await fetchBackendJson('saveMainMilestones', {
      projectCode: projectKey,
      ids: JSON.stringify(Array.from(qltdMainMilestoneIds)),
      codes: JSON.stringify([]),
      email: currentUserProfile && currentUserProfile.email || ''
    });
    if (response && response.success !== false) {
      console.log('[mainMilestone] saved to Apps Script API', Array.from(qltdMainMilestoneIds));
      return;
    }
    console.error('Apps Script rejected main milestone save', response);
    alert('Không lưu được mốc chính: ' + String(response && (response.message || response.error) || 'API_ERROR'));
    return;
  } catch (error) {
    console.warn('Apps Script main milestone save unavailable; trying Firestore compatibility source', error);
  }

  const ref = getMainMilestoneDocRef(projectKey);
  if (!ref) return;

  try {
    await setDoc(ref, {
      projectCode: String(projectKey || ''),
      milestoneIds: Array.from(qltdMainMilestoneIds),
      milestoneCodes: [],
      updatedBy: currentUserProfile && currentUserProfile.email || '',
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Cannot save global main milestone ids', error);
    alert('Không lưu được mốc chính dùng chung. Vui lòng kiểm tra quyền Firebase/Firestore.');
  }
}

async function resetMainMilestonesForProject(projectCode = getStoredProjectCode(), payload = qltdGanttPayload) {
  const projectKey = getMainMilestoneProjectKey(projectCode, payload);
  qltdCurrentMainMilestoneProjectKey = projectKey;
  qltdMainMilestoneIds = new Set();
  cacheMainMilestonesForProject(projectKey, payload);

  try {
    const response = await fetchBackendJson('resetMainMilestones', {
      projectCode: projectKey,
      email: currentUserProfile && currentUserProfile.email || ''
    });
    if (response && response.success !== false) {
      console.log('[mainMilestone] reset through Apps Script API', projectKey);
      return;
    }
    console.error('Apps Script rejected main milestone reset', response);
    alert('Không reset được mốc chính: ' + String(response && (response.message || response.error) || 'API_ERROR'));
    return;
  } catch (error) {
    console.warn('Apps Script main milestone reset unavailable; saving empty Firestore fallback', error);
  }

  const ref = getMainMilestoneDocRef(projectKey);
  if (!ref) return;
  try {
    await setDoc(ref, {
      projectCode: String(projectKey || ''),
      milestoneIds: [],
      milestoneCodes: [],
      updatedBy: currentUserProfile && currentUserProfile.email || '',
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Cannot reset global main milestone ids', error);
    alert('Không reset được mốc chính dùng chung.');
  }
}

function isMainMilestoneTask(taskId) {
  const task = (qltdGanttPayload && qltdGanttPayload.data || []).find((item) => String(item.id) === String(taskId));
  return task ? isMainMilestoneSelectedTask(task) : qltdMainMilestoneIds.has(String(taskId));
}

function isMainMilestoneSelectedTask(task) {
  return isMainMilestoneKeySelected(qltdMainMilestoneIds, task);
}

function updateMainMilestoneToolbarState() {
  const badge = document.getElementById('ganttMilestoneBadge');
  if (badge) badge.textContent = `Mốc chính: ${qltdMainMilestoneIds.size}`;

  const button = document.getElementById('ganttMilestoneModeButton');
  if (button) {
    const label = button.dataset.label || (canSelectMainMilestone() ? 'Chọn mốc chính' : 'Hiện sao mốc chính');
    button.textContent = `${label}${qltdMainMilestoneIds.size ? ` (${qltdMainMilestoneIds.size})` : ''}`;
  }
}

async function toggleMainMilestone(taskId) {
  if (!canSelectMainMilestone()) return;

  const gantt = getDhtmlxGanttInstance();
  const scroll = getGanttScrollState();
  let task = null;

  try {
    task = gantt && typeof gantt.getTask === 'function' ? gantt.getTask(taskId) : null;
  } catch (error) {
    task = null;
  }

  const sourceTask = task || (qltdGanttPayload && qltdGanttPayload.data || [])
    .find((item) => String(item.id) === String(taskId)) || { id: taskId };
  toggleMainMilestoneTaskKey(qltdMainMilestoneIds, sourceTask);

  await saveMainMilestonesForProject(qltdGanttPayload && qltdGanttPayload.projectCode);
  updateMainMilestoneToolbarState();
  renderDashboardFromGanttData(qltdGanttPayload);

  const depthFilter = document.getElementById('ganttDepthFilter')?.value || 'all';
  if (depthFilter === 'main-milestones') {
    applyGanttFilters();
    restoreGanttScrollState(scroll);
    return;
  }

  if (gantt && task) {
    try {
      if (typeof gantt.refreshTask === 'function') {
        gantt.refreshTask(task.id);
      } else if (typeof gantt.refreshData === 'function') {
        gantt.refreshData();
      } else if (typeof gantt.render === 'function') {
        gantt.render();
      }
    } catch (error) {
      console.warn('Cannot refresh main milestone star', error);
    }
  }

  restoreGanttScrollState(scroll);
}


function getUniqueTaskValues(tasks, key) {
  return Array.from(new Set((tasks || []).map((task) => String(task[key] || '').trim()).filter(Boolean))).sort();
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function normalizeStatusKey(status) {
  const normalized = normalizeSearchText(status).replace(/[^a-z0-9]/g, '');
  if (normalized.includes('hoanthanh') || normalized.includes('done') || normalized.includes('complete')) return 'hoan-thanh';
  if (normalized.includes('tamdung') || normalized.includes('paused')) return 'tam-dung';
  if (normalized.includes('quahan') || normalized.includes('overdue')) return 'qua-han';
  if (normalized.includes('dang') || normalized.includes('progress')) return 'dang-lam';
  return 'chua-bat-dau';
}

function normalizeStatusForFilter(status) {
  const normalized = normalizeSearchText(status).replace(/[^a-z0-9]/g, '');
  if (normalized.includes('hoanthanh') || normalized.includes('done') || normalized.includes('complete')) return 'completed';
  if (normalized.includes('tamdung') || normalized.includes('paused')) return 'paused';
  if (normalized.includes('dang') || normalized.includes('progress')) return 'in-progress';
  if (normalized.includes('chuabatdau') || normalized.includes('notstarted')) return 'not-started';
  if (normalized.includes('chuaro') || normalized.includes('khongxacdinh') || normalized.includes('unknown')) return 'unknown';
  return normalized ? 'unknown' : 'unknown';
}

function getScheduleState(task) {
  const status = normalizeStatusForFilter(task.status);
  const deadline = parseIsoDate(task.end_date || task.deadline);
  const actualFinish = parseIsoDate(task.actualFinish || task.actualEnd);
  const today = parseIsoDate(toIsoDateLocal(new Date()));

  if (!deadline && status !== 'completed') return 'unknown';
  if (status === 'completed') {
    if (actualFinish && deadline && actualFinish > deadline) return 'completed-late';
    return 'completed-on-time';
  }
  if (status === 'paused') {
    return deadline && deadline < today ? 'paused-overdue' : 'paused-on-time';
  }
  if (deadline && deadline < today) return 'overdue';
  if (status === 'in-progress') return 'in-progress-on-time';
  if (status === 'not-started') return 'not-started-on-time';
  return 'unknown';
}

function parseIsoDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(`${text.slice(0, 10)}T00:00:00`);
  return isNaN(date.getTime()) ? null : date;
}

function relationFromDhtmlxType(type) {
  const map = { 0: 'FS', 1: 'SS', 2: 'FF', 3: 'SF' };
  return map[String(type)] || 'FS';
}

function formatDateObjectViShort(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
}

async function loadDeptPlansForSelectedProject(projectCode) {
  if (!projectCode) return;
  const requestSeq = ++qltdDeptPlanRequestSeq;

  const cached = qltdDeptPlanCache.get(projectCode);
  if (cached && Date.now() - cached.cachedAt < QLTD_DEPT_PLAN_CACHE_MS) {
    renderDeptPlans(cached.payload);
    return;
  }

  ensureDeptSelector();
  ensureDeptPlanPanel();

  const status = document.getElementById('deptPlanStatus');
  const content = document.getElementById('deptPlanContent');
  const deptSelector = document.getElementById('deptSelector');

  if (status) status.textContent = '\u0110ang t\u1ea3i...';
  if (content) content.innerHTML = '<p class="empty-state">\u0110ang t\u1ea3i d\u1eef li\u1ec7u ph\u00f2ng/ban...</p>';
  if (deptSelector) deptSelector.disabled = true;

  try {
    const payload = await fetchBackendJson('listDeptPlans', { projectCode });
    if (requestSeq !== qltdDeptPlanRequestSeq) return;
    qltdDeptPlanCache.set(projectCode, { payload, cachedAt: Date.now() });
    renderDeptPlans(payload);
  } catch (error) {
    if (requestSeq !== qltdDeptPlanRequestSeq) return;
    console.error('Cannot load department plan', error);
    renderDeptPlans({ success: false });
  }
}
async function fetchBackendJson(action, params = {}) {
  const startedAt = performance.now();
  const url = new URL(APPS_SCRIPT_DEV_URL);
  url.searchParams.set('action', action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Apps Script API ${action} failed: ${response.status}`);
  }

  const payload = await response.json();
  if (qltdDevPerfEnabled()) console.info(`[QLTD PERF] ${action}: ${Math.round(performance.now() - startedAt)}ms`);
  return payload;
}

async function fetchBackendProfile(email) {
  await fetchBackendJson('health');
  return fetchBackendJson('profile', { email });
}

function buildAuthenticatedViewerProfile(user, base = {}) {
  return {
    ...base,
    success: true,
    email: user && user.email,
    role: 'GUEST_VIEWER',
    apiStatus: base.apiStatus || 'CONNECTED',
    permissions: {
      dashboard: true,
      gantt: true,
      lookup: true,
      reportUpdate: false,
      admin: false
    }
  };
}

function renderApp(user, role, profile = {}) {
  showOnly(els.appShell);
  const effectiveProfile = {
    ...profile,
    email: profile.email || (user && user.email),
    role: profile.role || role || 'GUEST_VIEWER'
  };
  const displayRole = formatRole(effectiveProfile.role);
  applyPermissions(effectiveProfile);
  ensureWeb07Panels();
  bindWeb07Navigation();
  showWeb07View('dashboard');
  loadProjectsForSelector();

  if (els.userAvatar) {
    els.userAvatar.src = user.photoURL || '';
    els.userAvatar.classList.toggle('empty', !user.photoURL);
  }

  if (els.userName) els.userName.textContent = user.displayName || 'Ng\u01b0\u1eddi d\u00f9ng QLTD';
  if (els.userEmail) els.userEmail.textContent = user.email || '';
  if (els.userRole) els.userRole.textContent = displayRole;
  if (els.accessStatus) els.accessStatus.textContent = '\u0110\u00e3 x\u00e1c th\u1ef1c Google';
  if (els.roleStatus) els.roleStatus.textContent = displayRole;
  setApiStatus(profile.apiStatus === 'CONNECTED' ? '\u0110\u00e3 k\u1ebft n\u1ed1i API' : 'Kh\u00f4ng k\u1ebft n\u1ed1i \u0111\u01b0\u1ee3c API');
}

function renderApiError(user, error) {
  console.error('Apps Script DEV API connection failed', error);
  renderApp(user, 'GUEST_VIEWER', buildAuthenticatedViewerProfile(user, { apiStatus: 'ERROR' }));
}

async function handleSignIn() {
  if (!auth) {
    setStatus('Ch\u01b0a c\u00f3 Firebase web config DEV.', 'warning');
    return;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    setStatus('\u0110ang m\u1edf Google Login...', 'info');
    await signInWithPopup(auth, provider);
  } catch (error) {
    setStatus(error.message || '\u0110\u0103ng nh\u1eadp th\u1ea5t b\u1ea1i.', 'error');
  }
}

async function handleSignOut() {
  if (!auth) return;

  await signOut(auth);
  renderSignedOut();
}

function boot() {
  if (!hasFirebaseConfig(firebaseConfig)) {
    if (els.signInButton) els.signInButton.disabled = true;
    renderSignedOut();
    return;
  }

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      renderSignedOut();
      return;
    }

    try {
      const profile = await fetchBackendProfile(user.email);

      if (!profile.success) {
        renderApp(user, 'GUEST_VIEWER', buildAuthenticatedViewerProfile(user, {
          apiStatus: profile.apiStatus || 'CONNECTED',
          profileMessage: profile.message || ''
        }));
        return;
      }

      renderApp(user, profile.role, profile);
    } catch (error) {
      renderApiError(user, error);
    }
  });
}

if (els.signInButton) els.signInButton.addEventListener('click', handleSignIn);
if (els.signOutButton) els.signOutButton.addEventListener('click', handleSignOut);
if (els.deniedSignOutButton) els.deniedSignOutButton.addEventListener('click', handleSignOut);
window.addEventListener('resize', () => {
  const gantt = getDhtmlxGanttInstance();
  if (qltdActiveView === 'gantt' && gantt && gantt.setSizes) gantt.setSizes();
});

boot();

export {
  ADMIN_EMAILS,
  APPS_SCRIPT_DEV_URL,
  fetchBackendProfile,
  getLocalRoleForEmail
};





