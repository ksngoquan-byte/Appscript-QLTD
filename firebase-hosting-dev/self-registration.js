import { getApps } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import {
  getAuth,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';

const APPS_SCRIPT_DEV_URL = 'https://script.google.com/macros/s/AKfycbx6iHCEf6Ba05h6u6DiBcqv3kxV79T6RvktzoFsdBJXeQjBaCNMyGQL5akptlX8jGtxpg/exec';
const REGISTRATION_OVERLAY_ID = 'qltdSelfRegistrationOverlay';
const SCOPE_NOTICE_ID = 'qltdDeptScopeNotice';
const SCOPED_ROLES = new Set(['EDITOR', 'REPORTER']);
const FULL_SCOPE_ROLES = new Set(['ADMIN', 'PMO']);

let auth = null;
let activeProfile = null;
let scopeObserver = null;
const originalFetch = window.fetch.bind(window);

function normalizeRole(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeDept(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

async function getJson(action, params = {}) {
  const url = new URL(APPS_SCRIPT_DEV_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });

  const response = await originalFetch(url.toString(), { method: 'GET', cache: 'no-store' });
  if (!response.ok) throw new Error(`API ${action} failed: ${response.status}`);
  return response.json();
}

async function postJson(payload) {
  const response = await window.fetch(APPS_SCRIPT_DEV_URL, {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`API POST failed: ${response.status}`);
  return response.json();
}

function installAuthenticatedPostBridge() {
  if (window.__QLTD_AUTHENTICATED_FETCH_V1__) return;
  window.__QLTD_AUTHENTICATED_FETCH_V1__ = true;

  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : (input && input.url) || '';
    const method = String(init.method || (input && input.method) || 'GET').toUpperCase();
    const isAppsScriptPost = method === 'POST' && requestUrl.startsWith(APPS_SCRIPT_DEV_URL);

    if (!isAppsScriptPost || !auth || !auth.currentUser) {
      return originalFetch(input, init);
    }

    let parsedBody = null;
    if (typeof init.body === 'string' && init.body.trim()) {
      try {
        parsedBody = JSON.parse(init.body);
      } catch (_error) {
        parsedBody = null;
      }
    }

    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return originalFetch(input, init);
    }

    try {
      const idToken = await auth.currentUser.getIdToken();
      const enrichedBody = {
        ...parsedBody,
        email: auth.currentUser.email || parsedBody.email || '',
        idToken
      };
      return originalFetch(input, { ...init, body: JSON.stringify(enrichedBody) });
    } catch (error) {
      console.warn('[QLTD] Cannot attach Firebase ID token', error);
      return originalFetch(input, init);
    }
  };
}

function removeOverlay() {
  document.getElementById(REGISTRATION_OVERLAY_ID)?.remove();
  document.body.classList.remove('qltd-registration-open');
}

function renderBlockingState({ title, message, allowSignOut = true }) {
  removeOverlay();
  const overlay = document.createElement('div');
  overlay.id = REGISTRATION_OVERLAY_ID;
  overlay.className = 'qltd-registration-overlay';
  overlay.innerHTML = `
    <section class="qltd-registration-card qltd-registration-card--compact" role="dialog" aria-modal="true" aria-labelledby="qltdRegistrationTitle">
      <div class="qltd-registration-brand">QLTD ENTIZ</div>
      <div class="qltd-registration-state-icon">!</div>
      <h1 id="qltdRegistrationTitle">${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${allowSignOut ? '<button type="button" class="qltd-registration-secondary" data-action="signout">Đăng xuất</button>' : ''}
    </section>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('qltd-registration-open');
  overlay.querySelector('[data-action="signout"]')?.addEventListener('click', () => auth ? signOut(auth) : Promise.resolve());
}

function renderRegistration(user, options) {
  removeOverlay();
  const jobGroups = Array.isArray(options.jobGroups) ? options.jobGroups : [];
  const departments = Array.isArray(options.departments) ? options.departments : [];
  const defaultGroup = jobGroups.find((item) => item.code === 'SPECIALIST') || jobGroups[0];

  const overlay = document.createElement('div');
  overlay.id = REGISTRATION_OVERLAY_ID;
  overlay.className = 'qltd-registration-overlay';
  overlay.innerHTML = `
    <section class="qltd-registration-card" role="dialog" aria-modal="true" aria-labelledby="qltdRegistrationTitle">
      <header class="qltd-registration-header">
        <div>
          <span class="qltd-registration-brand">QLTD ENTIZ</span>
          <h1 id="qltdRegistrationTitle">Hoàn tất thông tin tài khoản</h1>
          <p>Thông tin này được dùng để cấp quyền và xác định phạm vi phòng/ban. Bạn chỉ khai báo một lần.</p>
        </div>
        <button type="button" class="qltd-registration-signout" data-action="signout">Đăng xuất</button>
      </header>

      <div class="qltd-registration-identity">
        <img src="${escapeAttribute(user.photoURL || '')}" alt="" class="qltd-registration-avatar">
        <div>
          <strong>${escapeHtml(user.displayName || 'Người dùng QLTD')}</strong>
          <span>${escapeHtml(user.email || '')}</span>
        </div>
        <span>Đã xác thực Google</span>
      </div>

      <form id="qltdSelfRegistrationForm" novalidate>
        <div class="qltd-registration-grid">
          <label class="qltd-registration-field">
            <span>Họ và tên <b>*</b></span>
            <input name="displayName" type="text" maxlength="120" required value="${escapeAttribute(user.displayName || '')}" autocomplete="name">
          </label>

          <label class="qltd-registration-field">
            <span>Email Google</span>
            <input type="email" readonly value="${escapeAttribute(user.email || '')}">
          </label>
        </div>

        <fieldset class="qltd-registration-role-fieldset">
          <legend>Chọn nhóm chức vụ <b>*</b></legend>
          <div class="qltd-registration-role-grid">
            ${jobGroups.map((item) => `
              <label class="qltd-registration-role-card">
                <input type="radio" name="jobGroup" value="${escapeAttribute(item.code)}" ${item.code === defaultGroup?.code ? 'checked' : ''}>
                <span class="qltd-registration-role-check"></span>
                <strong>${escapeHtml(item.label)}</strong>
                <small>${escapeHtml(item.description || '')}</small>
              </label>
            `).join('')}
          </div>
        </fieldset>

        <div class="qltd-registration-grid">
          <label class="qltd-registration-field" data-field="department">
            <span>Phòng/ban <b>*</b></span>
            <select name="deptCode" required>
              <option value="">-- Chọn phòng/ban --</option>
              ${departments.map((item) => `<option value="${escapeAttribute(item.code)}">${escapeHtml(item.name)}</option>`).join('')}
            </select>
            <small>Quyền lập công việc và báo cáo sẽ giới hạn trong phòng/ban này.</small>
          </label>

          <label class="qltd-registration-field">
            <span>Chức danh cụ thể <b>*</b></span>
            <input name="jobTitle" type="text" maxlength="160" required placeholder="Ví dụ: Trưởng phòng Thiết kế; Chuyên viên Kế hoạch">
          </label>
        </div>

        <label class="qltd-registration-confirm">
          <input type="checkbox" name="confirmed" required>
          <span>Tôi xác nhận thông tin chức vụ và phòng/ban khai báo là chính xác.</span>
        </label>

        <div id="qltdRegistrationMessage" class="qltd-registration-message" role="status"></div>

        <footer class="qltd-registration-actions">
          <span>Quản trị viên có thể điều chỉnh quyền sau trong sheet <b>Users</b>.</span>
          <button type="submit" class="qltd-registration-primary">Hoàn tất đăng ký</button>
        </footer>
      </form>
    </section>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add('qltd-registration-open');

  const form = overlay.querySelector('#qltdSelfRegistrationForm');
  const departmentField = overlay.querySelector('[data-field="department"]');
  const deptSelect = form.elements.deptCode;
  const message = overlay.querySelector('#qltdRegistrationMessage');
  const submitButton = form.querySelector('button[type="submit"]');
  let registrationInFlight = false;

  const syncDepartmentRequirement = () => {
    const selectedCode = form.elements.jobGroup.value;
    const selectedGroup = jobGroups.find((item) => item.code === selectedCode);
    const requiresDept = selectedGroup ? selectedGroup.requiresDept !== false : true;
    departmentField.classList.toggle('hidden', !requiresDept);
    deptSelect.required = requiresDept;
    deptSelect.disabled = !requiresDept;
    if (!requiresDept) deptSelect.value = '';
  };

  form.querySelectorAll('input[name="jobGroup"]').forEach((input) => {
    input.addEventListener('change', syncDepartmentRequirement);
  });
  syncDepartmentRequirement();

  overlay.querySelector('[data-action="signout"]')?.addEventListener('click', () => auth ? signOut(auth) : Promise.resolve());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (registrationInFlight) return;
    message.textContent = '';
    message.dataset.type = '';

    if (!form.reportValidity()) return;

    registrationInFlight = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Đang tạo tài khoản...';

    try {
      const result = await postJson({
        action: 'user_register',
        email: user.email || '',
        displayName: form.elements.displayName.value,
        jobGroup: form.elements.jobGroup.value,
        deptCode: deptSelect.disabled ? '' : deptSelect.value,
        jobTitle: form.elements.jobTitle.value
      });

      if (!result.success) {
        throw new Error(result.errorMessage || result.message || 'Đăng ký không thành công.');
      }

      message.textContent = 'Đăng ký thành công. Hệ thống đang tải quyền của bạn...';
      message.dataset.type = 'success';
      setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      message.textContent = error.message || 'Không thể hoàn tất đăng ký.';
      message.dataset.type = 'error';
      registrationInFlight = false;
      submitButton.disabled = false;
      submitButton.textContent = 'Hoàn tất đăng ký';
    }
  });
}

function applyDepartmentScope(profile) {
  activeProfile = profile;
  const role = normalizeRole(profile.role);

  if (FULL_SCOPE_ROLES.has(role)) {
    stopScopeObserver();
    document.getElementById(SCOPE_NOTICE_ID)?.remove();
    return;
  }
  if (!SCOPED_ROLES.has(role) || !profile.deptCode) return;

  const enforce = () => {
    const selector = document.getElementById('deptSelector');
    if (!selector || !selector.options?.length) return;

    const targetDept = normalizeDept(profile.deptCode);
    const option = Array.from(selector.options).find((item) => normalizeDept(item.value) === targetDept);
    if (!option) return;

    const changed = selector.value !== option.value;
    selector.value = option.value;
    selector.disabled = true;
    selector.setAttribute('aria-disabled', 'true');
    selector.dataset.qltdDeptScopeLocked = '1';

    if (changed) selector.dispatchEvent(new Event('change', { bubbles: true }));

    const panel = document.getElementById('deptSelectorPanel') || selector.parentElement;
    if (panel && !document.getElementById(SCOPE_NOTICE_ID)) {
      const notice = document.createElement('span');
      notice.id = SCOPE_NOTICE_ID;
      notice.className = 'qltd-dept-scope-notice';
      notice.textContent = `Phạm vi thao tác: ${profile.deptName || profile.deptCode}`;
      panel.appendChild(notice);
    }
  };

  enforce();
  stopScopeObserver();
  scopeObserver = new MutationObserver(() => window.requestAnimationFrame(enforce));
  scopeObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

  document.addEventListener('change', preventCrossDepartmentChange, true);
}

function preventCrossDepartmentChange(event) {
  if (!activeProfile || !SCOPED_ROLES.has(normalizeRole(activeProfile.role))) return;
  const control = event.target;
  if (!(control instanceof HTMLSelectElement)) return;
  const isScopedWriteControl = control.id === 'deptSelector' || control.matches('[data-qltd-write-dept], select[name="deptCode"]');
  if (!isScopedWriteControl) return;

  const targetDept = normalizeDept(activeProfile.deptCode);
  const option = Array.from(control.options).find((item) => normalizeDept(item.value) === targetDept);
  if (!option) return;
  if (control.value !== option.value) {
    event.stopImmediatePropagation();
    control.value = option.value;
  }
  control.disabled = true;
}

function stopScopeObserver() {
  if (scopeObserver) scopeObserver.disconnect();
  scopeObserver = null;
  document.removeEventListener('change', preventCrossDepartmentChange, true);
}

async function handleAuthenticatedUser(user) {
  if (!user || !user.email) {
    removeOverlay();
    stopScopeObserver();
    activeProfile = null;
    return;
  }

  try {
    const profile = await getJson('profile', { email: user.email });
    if (profile.success) {
      removeOverlay();
      applyDepartmentScope(profile);
      return;
    }

    if (profile.message === 'USER_NOT_FOUND') {
      const options = await getJson('registration_options');
      if (!options.success) throw new Error(options.errorMessage || options.message || 'Không tải được danh mục đăng ký.');
      renderRegistration(user, options);
      return;
    }

    if (profile.message === 'USER_INACTIVE') {
      renderBlockingState({ title: 'Tài khoản đang bị khóa', message: 'Vui lòng liên hệ quản trị hệ thống để được kiểm tra quyền truy cập.' });
      return;
    }

    renderBlockingState({ title: 'Chưa xác định được quyền', message: 'Thông tin vai trò trên hệ thống chưa hợp lệ. Vui lòng liên hệ quản trị.' });
  } catch (error) {
    console.error('[QLTD] Registration bootstrap failed', error);
    renderBlockingState({
      title: 'Không tải được thông tin quyền',
      message: 'Hệ thống chưa kết nối được nguồn phân quyền. Vui lòng tải lại trang hoặc liên hệ quản trị.'
    });
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

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function bootSelfRegistration() {
  const apps = getApps();
  if (!apps.length) {
    console.warn('[QLTD] Firebase app has not been initialized yet.');
    setTimeout(bootSelfRegistration, 100);
    return;
  }

  auth = getAuth(apps[0]);
  installAuthenticatedPostBridge();
  if (!window.__QLTD_SELF_REGISTRATION_AUTH_BOUND__) {
    window.__QLTD_SELF_REGISTRATION_AUTH_BOUND__ = true;
    window.addEventListener('qltd:auth-state-changed', (event) => {
      handleAuthenticatedUser(event.detail?.user || null);
    });
  }
  if (window.__QLTD_AUTH_STATE_READY__) {
    handleAuthenticatedUser(window.__QLTD_CURRENT_AUTH_USER__ || null);
  }
}

bootSelfRegistration();
