import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';

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
let qltdMainMilestoneIds = new Set();
let qltdMainMilestoneSelectMode = false;
const qltdWeeklyDrafts = {};

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
  if (role === 'EDITOR') return 'Editor';
  if (role === 'REPORTER') return 'Reporter';
  if (role === 'VIEWER') return 'Viewer';
  return role || 'Kh\u00f4ng x\u00e1c \u0111\u1ecbnh';
}

function normalizePermissions(permissions = {}) {
  return {
    dashboard: !!permissions.dashboard,
    gantt: !!permissions.gantt,
    lookup: !!permissions.lookup,
    reportUpdate: !!permissions.reportUpdate,
    admin: !!permissions.admin
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
  currentPermissions = normalizePermissions(profile.permissions || DEFAULT_PERMISSIONS);

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
    if (status) status.textContent = 'Ch\u01b0a c\u00f3 d\u1ef1 \u00e1n';
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
  loadDeptPlansForSelectedProject(selector.value);
  loadGanttDataForSelectedProject(selector.value);

  if (status) status.textContent = '';

  selector.disabled = false;
  selector.onchange = () => {
    setStoredProjectCode(selector.value);
    loadDeptPlansForSelectedProject(selector.value);
    loadGanttDataForSelectedProject(selector.value);
  };
}

async function loadProjectsForSelector() {
  try {
    const payload = await fetchBackendJson('listProjects', { email: currentUserProfile && currentUserProfile.email });
    if (!payload.success) {
      throw new Error(payload.message || 'listProjects failed');
    }
    renderProjectOptions(payload.projects || []);
  } catch (error) {
    console.error('Cannot load project registry', error);
    ensureProjectSelector();
    const status = document.getElementById('projectSelectorStatus');
    if (status) status.textContent = 'Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c danh s\u00e1ch d\u1ef1 \u00e1n';
  }
}



// WEB-04B.2 compact UI overrides
let qltdDeptPlanPayload = null;
let qltdSelectedDeptCode = '';

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
  let wrapper = document.getElementById('deptSelectorPanel');
  if (wrapper) return wrapper;

  wrapper = document.createElement('div');
  wrapper.id = 'deptSelectorPanel';
  wrapper.className = 'nav-control nav-dept-control';
  wrapper.innerHTML = `
    <label class="nav-control-label" for="deptSelector">Ph\u00f2ng/ban</label>
    <select id="deptSelector" class="nav-control-select" disabled>
      <option value="">Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u</option>
    </select>
  `;

  const nav = findPrimaryNavContainer();
  if (nav) {
    nav.appendChild(wrapper);
  }

  return wrapper;
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
      <div id="deptPlanContent" class="dept-plan-content"></div>
    </div>
  `;

  const container = document.querySelector('.app-main') ||
    document.querySelector('main') ||
    els.appShell;

  if (container) {
    container.appendChild(panel);
  }

  return panel;
}

function ensureWeb07InlineStyles() {
  if (document.getElementById('web07InlineStyles')) return;

  const style = document.createElement('style');
  style.id = 'web07InlineStyles';
  style.textContent = `
    .web07-panel {
      width: min(1160px, calc(100vw - 48px));
      margin: 18px auto 40px;
    }

    body.qltd-gantt-mode .web07-panel {
      width: min(1160px, calc(100vw - 48px));
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
}

function showWeb07View(viewName) {
  qltdActiveView = viewName;
  ensureWeb07Panels();
  document.body.classList.toggle('qltd-gantt-mode', viewName === 'gantt');

  const dashboard = document.getElementById('web07DashboardPanel');
  const ganttPanel = document.getElementById('web07GanttPanel');
  const deptPanel = document.getElementById('deptPlanPanel');
  const placeholder = document.querySelector('.placeholder-panel');
  const summary = document.querySelector('.content-grid');

  if (summary) summary.classList.toggle('hidden', viewName === 'gantt' || viewName === 'report');
  if (placeholder) placeholder.classList.add('hidden');
  if (dashboard) dashboard.classList.toggle('hidden', viewName !== 'dashboard');
  if (ganttPanel) ganttPanel.classList.toggle('hidden', viewName !== 'gantt');
  if (deptPanel) deptPanel.classList.toggle('hidden', viewName !== 'report');

  ['Dashboard', 'Gantt', 'Báo cập nhật'].forEach((label) => {
    const button = getNavButtonByLabel(label);
    if (button) button.classList.toggle('active', (
      (label === 'Dashboard' && viewName === 'dashboard') ||
      (label === 'Gantt' && viewName === 'gantt') ||
      (label === 'Báo cập nhật' && viewName === 'report')
    ));
  });

  if (viewName === 'gantt') {
    setTimeout(() => {
      const gantt = getDhtmlxGanttInstance();
      if (gantt && gantt.setSizes) gantt.setSizes();
      if (qltdGanttPayload) renderGanttPanel(qltdGanttPayload);
    }, 80);
  }
}

function bindWeb07Navigation() {
  const bindings = [
    ['Dashboard', 'dashboard'],
    ['Gantt', 'gantt'],
    ['Báo cập nhật', 'report']
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

function parseMonthCode(monthCode) {
  const match = String(monthCode || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!year || month < 1 || month > 12) return null;

  return {
    year,
    month,
    monthIndex: month - 1
  };
}

function toIsoDateLocal(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatDateViShort(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function getMondayOfWeek(date) {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = current.getDay(); // 0 = Sunday, 1 = Monday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  current.setDate(current.getDate() + diffToMonday);
  return current;
}

function getMonthWeekPeriods(monthCode) {
  const parsed = parseMonthCode(monthCode) || parseMonthCode(getDefaultMonthCode());
  if (!parsed) return [];

  const monthStart = new Date(parsed.year, parsed.monthIndex, 1);
  const monthEnd = new Date(parsed.year, parsed.monthIndex + 1, 0);

  let cursor = getMondayOfWeek(monthStart);
  const periods = [];
  let weekNo = 1;

  while (cursor <= monthEnd) {
    const weekStartDate = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    const weekEndDate = addDays(weekStartDate, 6);

    const periodStartDate = weekStartDate < monthStart ? monthStart : weekStartDate;
    const periodEndDate = weekEndDate > monthEnd ? monthEnd : weekEndDate;
    const coverageDays = Math.round((periodEndDate - periodStartDate) / 86400000) + 1;

    periods.push({
      weekNoInMonth: weekNo,
      weekId: `WEEK-${toIsoDateLocal(weekStartDate)}`,
      weekStart: toIsoDateLocal(weekStartDate),
      weekEnd: toIsoDateLocal(weekEndDate),
      periodStart: toIsoDateLocal(periodStartDate),
      periodEnd: toIsoDateLocal(periodEndDate),
      coverageDays,
      label: `Tuần ${weekNo}: ${formatDateViShort(periodStartDate)}–${formatDateViShort(periodEndDate)}`
    });

    cursor = addDays(cursor, 7);
    weekNo += 1;
  }

  return periods;
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
      border: 1px solid #e5edf5;
      border-radius: 14px;
      background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
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
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      background: #f8fafc;
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

    .week-period-card.is-partial {
      border-color: #fdba74;
      background: linear-gradient(180deg, #fff7ed 0%, #ffffff 72%);
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

    .weekly-update-panel {
      margin: 14px 0 18px;
      padding: 14px;
      border: 1px solid #dbeafe;
      border-radius: 16px;
      background: linear-gradient(180deg, #eff6ff 0%, #ffffff 78%);
    }

    .weekly-update-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

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
      grid-template-columns: minmax(240px, 1.2fr) minmax(180px, .8fr);
      gap: 10px;
      margin: 0 0 12px;
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      background: #ffffff;
    }

    @media (max-width: 760px) {
      .weekly-update-grid,
      .weekly-target-toolbar {
        grid-template-columns: 1fr;
      }
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

  const fullWeekCount = periods.filter((period) => Number(period.coverageDays) === 7).length;
  const partialWeekCount = periods.length - fullWeekCount;

  return `
    <section class="week-period-section">
      <div class="week-period-section-header">
        <div>
          <div class="week-period-kicker">WEB-05A · Kỳ báo cáo động</div>
          <div class="week-period-title-main">${periods.length} kỳ tuần trong tháng đang xem</div>
        </div>
        <div class="week-period-legend">
          <span class="week-period-chip">${fullWeekCount} tuần đủ 7 ngày</span>
          ${partialWeekCount ? `<span class="week-period-chip partial">${partialWeekCount} tuần giao tháng</span>` : ''}
        </div>
      </div>

      <div class="week-period-grid">
        ${periods.map((period) => {
          const isPartial = Number(period.coverageDays) < 7;
          return `
            <article class="week-period-card ${isPartial ? 'is-partial' : ''}">
              <div class="week-period-card-top">
                <span class="week-period-badge">Tuần ${escapeHtml(period.weekNoInMonth)}</span>
                <span class="week-period-days">${escapeHtml(period.coverageDays)} / 7 ngày</span>
              </div>

              <div class="week-period-range">
                ${escapeHtml(formatIsoDateVi(period.periodStart))} – ${escapeHtml(formatIsoDateVi(period.periodEnd))}
              </div>

              <div class="week-period-row">
                <span>Tuần chuẩn</span>
                <strong>${escapeHtml(formatIsoDateVi(period.weekStart))} → ${escapeHtml(formatIsoDateVi(period.weekEnd))}</strong>
              </div>

              <div class="week-period-row">
                <span>Phần trong tháng</span>
                <strong>${escapeHtml(formatIsoDateVi(period.periodStart))} → ${escapeHtml(formatIsoDateVi(period.periodEnd))}</strong>
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
  qltdDeptPlanPayload = payload || null;
  ensureDeptSelector();
  ensureDeptPlanPanel();

  const deptSelector = document.getElementById('deptSelector');
  const status = document.getElementById('deptPlanStatus');
  const content = document.getElementById('deptPlanContent');

  if (!content || !deptSelector) return;

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
    option.value = dept.deptCode || dept.sheetName || '';
    option.textContent = dept.deptCode || dept.sheetName || 'Ph\u00f2ng/ban';
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

function renderSelectedDeptPlan() {
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
        <label for="weeklyMasterSelector">Mục tiêu/công việc gốc</label>
        <select id="weeklyMasterSelector">
          ${masters.map((master) => `
            <option value="${escapeHtml(master.masterCode || '')}" ${master.masterCode === qltdSelectedMasterCode ? 'selected' : ''}>
              ${escapeHtml(master.masterCode || '')} · ${escapeHtml(master.taskName || '')}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="weekly-update-field">
        <label for="weeklyPeriodSelector">Kỳ tuần</label>
        <select id="weeklyPeriodSelector">
          ${weekPeriods.map((period) => `
            <option value="${escapeHtml(period.weekId)}" ${period.weekId === qltdSelectedWeekId ? 'selected' : ''}>
              Tuần ${escapeHtml(period.weekNoInMonth)} · ${escapeHtml(formatIsoDateVi(period.periodStart))}–${escapeHtml(formatIsoDateVi(period.periodEnd))}
            </option>
          `).join('')}
        </select>
      </div>
    </div>
  ` : '';

  if (!masters.length) {
    content.innerHTML = `
      ${periodToolbarHtml}
      <p class="empty-state">Phòng/ban này chưa có mục tiêu/công việc gốc.</p>
    `;
    bindDeptPlanInteractiveControls();
    return;
  }

  content.innerHTML = `
    ${periodToolbarHtml}
    ${weeklyTargetToolbarHtml}
    ${renderWeeklyUpdatePanel(payload, dept, selectedMaster, selectedWeek)}

    <div class="dept-plan-table-wrap">
      <table class="dept-plan-table">
        <thead>
          <tr>
            <th>Mã</th>
            <th>Mục tiêu/công việc gốc</th>
            <th>Deadline</th>
            <th>Slot chi tiết</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          ${masters.map((master) => {
            const slots = master.detailSlots || [];
            return `
              <tr>
                <td class="mono">${escapeHtml(master.masterCode || '')}</td>
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
  `;

  bindDeptPlanInteractiveControls();
}

function getWeeklyDraftKey(projectCode, deptCode, masterCode, weekId) {
  return [projectCode || '', deptCode || '', masterCode || '', weekId || ''].join('::');
}

function renderWeeklyUpdatePanel(payload, dept, master, week) {
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
            ${escapeHtml(deptCode)} · ${escapeHtml(master.masterCode || '')} · ${escapeHtml(formatIsoDateVi(week.periodStart))}–${escapeHtml(formatIsoDateVi(week.periodEnd))}
          </div>
        </div>
        <span class="week-period-chip partial">Mock frontend · chưa ghi Sheet</span>
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

function bindDeptPlanInteractiveControls() {
  const monthSelector = document.getElementById('reportMonthSelector');
  if (monthSelector) {
    monthSelector.onchange = () => {
      qltdSelectedMonthCode = monthSelector.value || getDefaultMonthCode();
      qltdSelectedWeekId = '';
      renderSelectedDeptPlan();
    };
  }

  const masterSelector = document.getElementById('weeklyMasterSelector');
  if (masterSelector) {
    masterSelector.onchange = () => {
      qltdSelectedMasterCode = masterSelector.value || '';
      renderSelectedDeptPlan();
    };
  }

  const weekSelector = document.getElementById('weeklyPeriodSelector');
  if (weekSelector) {
    weekSelector.onchange = () => {
      qltdSelectedWeekId = weekSelector.value || '';
      renderSelectedDeptPlan();
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

async function loadGanttDataForSelectedProject(projectCode) {
  if (!projectCode) return;
  ensureWeb07Panels();
  renderGanttLoading(projectCode);
  renderDashboardLoading(projectCode);

  try {
    const payload = await fetchBackendJson('ganttData', { projectCode });
    qltdGanttPayload = payload;
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

  const model = buildExecutiveDashboardModel(payload);

  panel.innerHTML = `
    <div class="exec-dashboard">
      <section class="exec-hero">
        <div>
          <p class="exec-eyebrow">Dashboard điều hành</p>
          <h2>${escapeHtml(payload.projectName || payload.projectCode || 'Dự án')}</h2>
          <p class="exec-subtitle">${escapeHtml(payload.projectCode || '')} · ${escapeHtml(payload.sourceSheet || '')}</p>
        </div>
        <div class="exec-progress">
          <strong>${escapeHtml(model.completionPercent)}%</strong>
          <span>Hoàn thành dự án</span>
        </div>
        <div class="exec-hero-grid">
          ${renderExecutiveMetric('Việc đang mở', model.openTasks, 'blue')}
          ${renderExecutiveMetric('Quá hạn', model.overdue.length, 'red')}
          ${renderExecutiveMetric('Milestone mở', model.openMilestones, 'green')}
          ${renderExecutiveNextMilestone(model.nextMilestone)}
        </div>
      </section>

      <section class="exec-grid">
        ${renderExecutiveListSection('Top 5 quá hạn', ['Hạng mục', 'Công việc', 'Chủ trì', 'Ngày kết thúc', 'Số ngày trễ'], model.overdue, renderExecutiveOverdueRow, 'Không có việc quá hạn.', 'red')}
        ${renderExecutiveListSection('Mốc lớn đang thực hiện', ['Hạng mục/Mốc lớn', 'Công việc/Mốc', 'Chủ trì', 'Ngày kết thúc', 'Còn lại hoặc trễ'], model.activeMilestones, renderExecutiveMilestoneRow, 'Không có mốc lớn đang thực hiện.', 'blue')}
        ${renderExecutiveListSection('Deadline 14 ngày tới', ['Hạng mục', 'Công việc', 'Chủ trì', 'Ngày kết thúc', 'Còn lại'], model.upcoming, renderExecutiveUpcomingRow, 'Không có deadline trong 14 ngày tới.', 'blue')}
        ${renderExecutiveCompletedSection(model.completedThisMonth)}
      </section>
    </div>
  `;

  bindDashboardTaskLinks();
}

function buildExecutiveDashboardModel(payload) {
  const today = parseIsoDate(toIsoDateLocal(new Date()));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const upcomingLimit = addDays(today, 14);
  const enriched = buildExecutiveTaskContext(Array.isArray(payload.data) ? payload.data : []);
  const realTasks = enriched.filter((task) => task.isRealTask);
  const completed = realTasks.filter((task) => task.isCompleted);
  const openTasks = realTasks.filter((task) => !task.isCompleted);
  const hasStrictMilestones = enriched.some((task) => task.isMilestone);
  const milestoneTasks = enriched.filter((task) => task.isMilestone || (!hasStrictMilestones && task.isMilestoneFallback));

  const overdue = openTasks
    .filter((task) => task.endDate && task.endDate < today)
    .map((task) => ({ ...task, lateDays: qltdDateDiffDays(task.endDate, today) }))
    .sort((a, b) => compareExecutivePriority(a, b) || b.lateDays - a.lateDays)
    .slice(0, 5);

  const upcoming = openTasks
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

  return {
    completionPercent: realTasks.length ? Math.round((completed.length / realTasks.length) * 100) : 0,
    openTasks: openTasks.length,
    openMilestones: milestoneTasks.filter((task) => task.isRealTask && !task.isCompleted).length,
    overdue,
    upcoming,
    activeMilestones,
    completedThisMonth,
    nextMilestone,
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
    item.startDate = qltdFirstValidDate(task.start_date, task.baselineStart);
    item.endDate = qltdFirstValidDate(task.end_date, task.deadline, task.baselineEnd);
    item.actualStartDate = qltdFirstValidDate(task.actualStart);
    item.actualFinishDate = qltdFirstValidDate(task.actualFinish, task.actualEnd);
    item.hasAnyDate = !!(item.startDate || item.endDate || item.actualStartDate || item.actualFinishDate);
    item.normalizedStatus = normalizeStatusForFilter(task.status);
    item.hasActionStatus = item.normalizedStatus !== 'unknown';
    item.isCompleted = Number(task.progress || 0) >= 1 || item.normalizedStatus === 'completed';
    item.isCategoryRow = !item.hasAnyDate;
    item.isRealTask = !!String(task.text || '').trim() && (item.hasAnyDate || item.hasActionStatus);
    item.isMilestone = isExecutiveStrictMilestone(task);
    item.isMilestoneFallback = item.wbsLevel >= 1 && item.wbsLevel <= 3;
    item.priorityIcon = getExecutivePriorityIcon(item);
    byId[String(item.id || '')] = item;
    if (item.wbsText) byWbs[item.wbsText] = item;
  });

  return tasks.map((task) => {
    const item = byId[String(task.id || '')] || task;
    const path = buildExecutiveParentPath(item, byWbs);
    return {
      ...item,
      parentPath: path.join(' > '),
      parentLevel1: path[0] || '',
      parentLevel2: path[1] || '',
      parentLevel3: path[2] || '',
      contextLabel: path.join(' > ') || item.parentLevel1 || item.wbsText || 'Chưa phân nhóm'
    };
  });
}

function isExecutiveStrictMilestone(task) {
  if (task.type === 'milestone' || isMainMilestoneTask(task.id)) return true;
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
  if (task.isMilestone) return '🚩';
  if (task.wbsLevel === 1) return '🎯';
  if (task.wbsLevel === 2) return '📌';
  return '✓';
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
      <td class="exec-context" title="${escapeHtml(task.parentPath || task.contextLabel)}">${escapeHtml(task.contextLabel)}</td>
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
      <td class="exec-context" title="${escapeHtml(task.parentPath || task.contextLabel)}">${escapeHtml(task.contextLabel)}</td>
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
      <td class="exec-context" title="${escapeHtml(task.parentPath || task.contextLabel)}">${escapeHtml(task.contextLabel)}</td>
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
                  <td class="exec-context" title="${escapeHtml(task.parentPath || task.contextLabel)}">${escapeHtml(task.contextLabel)}</td>
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
    row.onclick = () => {
      const taskId = row.getAttribute('data-task-id');
      showWeb07View('gantt');
      if (qltdGanttPayload) renderGanttPanel(qltdGanttPayload);
      setTimeout(() => focusGanttTask(taskId), 120);
    };
  });
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
  loadMainMilestonesForProject(payload.projectCode);

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
        <button id="ganttMilestoneModeButton" type="button" class="${qltdMainMilestoneSelectMode ? 'active' : ''}">Chọn mốc chính${qltdMainMilestoneIds.size ? ` (${qltdMainMilestoneIds.size})` : ''}</button>
        <button id="ganttMilestoneResetButton" type="button">Reset mốc</button>
        <span id="ganttMilestoneBadge" class="web07-muted">Mốc chính: ${qltdMainMilestoneIds.size}</span>
        <button id="ganttLinksToggle" type="button" class="${qltdGanttShowLinks ? 'active' : ''}">Mũi tên</button>
        <span id="ganttLinkLegend" class="web07-link-legend ${qltdGanttShowLinks ? '' : 'is-muted'}">
          <span class="web07-link-sample"></span>FS
          <span class="web07-link-sample ss"></span>SS
          <span class="web07-link-sample ff"></span>FF
        </span>
        <button id="ganttDatesToggle" type="button" class="${qltdGanttShowDates ? 'active' : ''}">Ngày trên bar</button>
        <button id="ganttExcelButton" type="button">Xuất Excel</button>
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
      qltdMainMilestoneSelectMode = !qltdMainMilestoneSelectMode;
      renderGanttPanel(qltdGanttPayload);
    };
  }

  const milestoneResetButton = document.getElementById('ganttMilestoneResetButton');
  if (milestoneResetButton) {
    milestoneResetButton.onclick = () => {
      qltdMainMilestoneIds = new Set();
      saveMainMilestonesForProject(payload.projectCode || getStoredProjectCode());
      renderGanttPanel(qltdGanttPayload);
      renderDashboardFromGanttData(qltdGanttPayload);
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
  const tasks = (qltdGanttPayload.data || []).filter((task) => {
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
  if (depthFilter === 'main-milestones') return isMainMilestoneTask(task.id) || task.type === 'milestone';
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
        const selected = isMainMilestoneTask(task.id);
        return `<span class="main-milestone-cell ${selected ? 'is-selected' : ''}" title="${selected ? 'Bỏ chọn mốc chính' : 'Chọn mốc chính'}">${selected ? '&#9733;' : '&#9734;'}</span>`;
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

    if (isMainMilestoneTask(task.id)) classes.push('main-milestone-row');
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

function getMainMilestoneStorageKey(projectCode = getStoredProjectCode()) {
  return `qltd.mainMilestones.${projectCode || 'unknown'}`;
}

function loadMainMilestonesForProject(projectCode) {
  try {
    const raw = localStorage.getItem(getMainMilestoneStorageKey(projectCode));
    const ids = raw ? JSON.parse(raw) : [];
    qltdMainMilestoneIds = new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch (error) {
    console.warn('Cannot load main milestone ids', error);
    qltdMainMilestoneIds = new Set();
  }
}

function saveMainMilestonesForProject(projectCode = getStoredProjectCode()) {
  try {
    localStorage.setItem(getMainMilestoneStorageKey(projectCode), JSON.stringify(Array.from(qltdMainMilestoneIds)));
  } catch (error) {
    console.warn('Cannot save main milestone ids', error);
  }
}

function isMainMilestoneTask(taskId) {
  return qltdMainMilestoneIds.has(String(taskId));
}

function toggleMainMilestone(taskId) {
  const id = String(taskId);
  if (qltdMainMilestoneIds.has(id)) {
    qltdMainMilestoneIds.delete(id);
  } else {
    qltdMainMilestoneIds.add(id);
  }
  saveMainMilestonesForProject(qltdGanttPayload && qltdGanttPayload.projectCode);
  renderGanttPanel(qltdGanttPayload);
  renderDashboardFromGanttData(qltdGanttPayload);
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
    renderDeptPlans(payload);
  } catch (error) {
    console.error('Cannot load department plan', error);
    renderDeptPlans({ success: false });
  }
}
async function fetchBackendJson(action, params = {}) {
  const url = new URL(APPS_SCRIPT_DEV_URL);
  url.searchParams.set('action', action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Apps Script API ${action} failed: ${response.status}`);
  }

  return response.json();
}

async function fetchBackendProfile(email) {
  await fetchBackendJson('health');
  return fetchBackendJson('profile', { email });
}

function renderApp(user, role, profile = {}) {
  showOnly(els.appShell);
  const displayRole = formatRole(role);
  applyPermissions(profile);
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
  renderApp(user, null, { apiStatus: 'ERROR', permissions: DEFAULT_PERMISSIONS });
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

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      renderSignedOut();
      return;
    }

    try {
      const profile = await fetchBackendProfile(user.email);

      if (!profile.success) {
        renderDenied(user);
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





