(() => {
  'use strict';

  const APP_MODULE = './app.js?v=PERF_LAZY_GANTT_1';
  const FIREBASE_APP_MODULE = 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
  const FIREBASE_AUTH_MODULE = 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
  const GATE_ID = 'qltdRegistrationGate';
  const BODY_STATES = ['qltd-registration-checking', 'qltd-registration-required', 'qltd-registration-blocked'];
  const TOKEN_RETRY_MESSAGES = new Set(['ID_TOKEN_INVALID', 'ID_TOKEN_EXPIRED']);
  const EXECUTIVE_GROUP = 'BAN_LANH_DAO';
  const DEPT_REQUIRED_GROUPS = new Set(['DEPT_MANAGER', 'EMPLOYEE']);

  let auth = null;
  let signInWithPopup = null;
  let GoogleAuthProvider = null;
  let signOut = null;
  let apiUrl = '';
  let currentUser = null;

  function setBodyState(state) {
    BODY_STATES.forEach((name) => document.body.classList.remove(name));
    if (state) document.body.classList.add(state);
  }

  function removeGate() {
    const gate = document.getElementById(GATE_ID);
    if (gate) gate.remove();
    setBodyState('');
  }

  function ensureStyles() {
    if (document.getElementById('qltdRegistrationStyles')) return;
    const style = document.createElement('style');
    style.id = 'qltdRegistrationStyles';
    style.textContent = `
      body.qltd-registration-checking #appShell,
      body.qltd-registration-required #appShell,
      body.qltd-registration-blocked #appShell,
      body.qltd-registration-required #loginView,
      body.qltd-registration-blocked #loginView,
      body.qltd-registration-required #deniedView,
      body.qltd-registration-blocked #deniedView { display:none!important; }
      .qltd-registration-gate{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#dfeafd,#78a2ed 65%,#4d7ed8)}
      .qltd-registration-card{width:min(680px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:30px;border-radius:22px;background:#fff;box-shadow:0 28px 70px rgba(15,23,42,.25);font-family:Inter,"Segoe UI",Arial,sans-serif;color:#0f172a}
      .qltd-registration-card h2{margin:4px 0 8px;font-size:28px}
      .qltd-registration-card p{color:#64748b;line-height:1.55}
      .qltd-registration-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
      .qltd-registration-field{display:grid;gap:7px;margin-top:14px}
      .qltd-registration-field label,.qltd-registration-label{font-weight:700;font-size:14px}
      .qltd-registration-field input,.qltd-registration-field select{min-height:44px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;background:#fff}
      .qltd-registration-field input[readonly]{background:#f1f5f9}
      .qltd-registration-field.hidden{display:none}
      .qltd-registration-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}
      .qltd-registration-actions button{min-height:44px;padding:0 18px;border-radius:10px;border:0;font-weight:700;cursor:pointer}
      .qltd-registration-primary{background:#0b3ea8;color:#fff}
      .qltd-registration-secondary{background:#e2e8f0;color:#0f172a}
      .qltd-registration-status{min-height:22px;margin:14px 0 0!important;font-weight:600}
      .qltd-registration-status.error{color:#b91c1c}
      .qltd-registration-status.success{color:#047857}
      @media(max-width:640px){.qltd-registration-grid{grid-template-columns:1fr}.qltd-registration-card{padding:22px}.qltd-registration-actions{flex-direction:column}.qltd-registration-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function createGate() {
    let gate = document.getElementById(GATE_ID);
    if (!gate) {
      gate = document.createElement('section');
      gate.id = GATE_ID;
      gate.className = 'qltd-registration-gate';
      gate.setAttribute('aria-live', 'polite');
      document.body.appendChild(gate);
    }
    return gate;
  }

  function renderMessage(title, message, options = {}) {
    setBodyState(options.blocked ? 'qltd-registration-blocked' : 'qltd-registration-required');
    const gate = createGate();
    gate.innerHTML = '<div class="qltd-registration-card"><p>Entiz Project 360</p><h2></h2><p class="qltd-message"></p><div class="qltd-registration-actions"></div></div>';
    gate.querySelector('h2').textContent = title;
    gate.querySelector('.qltd-message').textContent = message;
    const actions = gate.querySelector('.qltd-registration-actions');

    if (options.retry) {
      const retry = document.createElement('button');
      retry.className = 'qltd-registration-primary';
      retry.textContent = 'Thử lại';
      retry.addEventListener('click', () => currentUser ? checkUser(currentUser) : window.location.reload());
      actions.appendChild(retry);
    }
    if (options.signOut) {
      const exit = document.createElement('button');
      exit.className = 'qltd-registration-secondary';
      exit.textContent = 'Đăng xuất';
      exit.addEventListener('click', () => auth && signOut && signOut(auth));
      actions.appendChild(exit);
    }
  }

  function getApiErrorMessage(result, fallbackMessage) {
    return String(
      result && (
        result.errorCode ||
        result.errorMessage ||
        result.message
      ) || fallbackMessage || 'Không tải được dữ liệu đăng ký.'
    ).trim();
  }

  function getCurrentAuthUser() {
    return auth && auth.currentUser ? auth.currentUser : currentUser;
  }

  function isTokenErrorResult(result) {
    const message = String(result && (result.errorCode || result.message) || '').trim().toUpperCase();
    return TOKEN_RETRY_MESSAGES.has(message);
  }

  async function withFreshIdToken(forceRefresh = false) {
    const user = getCurrentAuthUser();
    if (!user) throw new Error('Chưa có phiên đăng nhập Google.');
    return user.getIdToken(forceRefresh);
  }

  async function requestJson(method, action, payload = {}, options = {}) {
    const includeToken = options.includeToken !== false;
    let retryWithFreshToken = !!options.retryWithFreshToken;
    const basePayload = payload && typeof payload === 'object' ? payload : {};

    while (true) {
      const token = includeToken ? await withFreshIdToken(retryWithFreshToken) : '';

      if (method === 'GET') {
        const url = new URL(apiUrl);
        url.searchParams.set('action', action);
        Object.entries(basePayload).forEach(([key, value]) => {
          if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
        });
        if (token) url.searchParams.set('idToken', token);

        const response = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
        if (!response.ok) throw new Error(`API ${action} lỗi ${response.status}`);
        const result = await response.json();

        if (retryWithFreshToken && isTokenErrorResult(result)) {
          retryWithFreshToken = false;
          continue;
        }
        return result;
      }

      const requestBody = {
        ...basePayload,
        action
      };
      if (token) requestBody.idToken = token;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) throw new Error(`API ghi dữ liệu lỗi ${response.status}`);
      const result = await response.json();

      if (retryWithFreshToken && isTokenErrorResult(result)) {
        retryWithFreshToken = false;
        continue;
      }
      return result;
    }
  }

  async function getJson(action, params = {}) {
    return requestJson('GET', action, params, { retryWithFreshToken: true });
  }

  async function postJson(payload) {
    return requestJson('POST', String(payload && payload.action || '').trim(), payload, { retryWithFreshToken: true });
  }

  function syncDepartmentField(form, groups) {
    const selectedGroup = String(form.querySelector('#qltdRegGroup').value || '').trim().toUpperCase();
    const deptField = form.querySelector('[data-field="department"]');
    const deptSelect = form.querySelector('#qltdRegDept');
    const requiresDepartment = DEPT_REQUIRED_GROUPS.has(selectedGroup);

    deptField.classList.toggle('hidden', !requiresDepartment);
    deptSelect.required = requiresDepartment;
    deptSelect.disabled = !requiresDepartment;
    if (!requiresDepartment) {
      deptSelect.value = '';
    }

    const selectedOption = groups.find((item) => String(item.code || '').trim().toUpperCase() === selectedGroup);
    const status = form.querySelector('#qltdRegStatus');
    if (status && selectedOption && selectedGroup === EXECUTIVE_GROUP) {
      status.className = 'qltd-registration-status';
      status.textContent = 'Ban lãnh đạo sẽ được tự gán Phòng/ban nội bộ: BLD - Ban lãnh đạo.';
    } else if (status && !status.classList.contains('error') && !status.classList.contains('success')) {
      status.textContent = '';
    }
  }

  function renderForm(user, options) {
    setBodyState('qltd-registration-required');
    const groups = Array.isArray(options && options.groups) ? options.groups : [];
    const departments = Array.isArray(options && options.departments) ? options.departments : [];
    const gate = createGate();
    gate.innerHTML = `
      <form class="qltd-registration-card" id="qltdRegistrationForm">
        <p>Thiết lập tài khoản lần đầu</p><h2>Khai báo thông tin người dùng</h2>
        <p>Email được lấy tự động từ tài khoản Google. Thông tin này chỉ khai báo một lần và có thể được quản trị viên kiểm tra tại sheet Users.</p>
        <div class="qltd-registration-grid">
          <div class="qltd-registration-field"><label>Email Google</label><input id="qltdRegEmail" readonly></div>
          <div class="qltd-registration-field"><label>Họ và tên *</label><input id="qltdRegName" maxlength="160" required></div>
          <div class="qltd-registration-field"><label>Chức danh *</label><input id="qltdRegTitle" maxlength="160" required></div>
          <div class="qltd-registration-field"><label>Nhóm người dùng *</label><select id="qltdRegGroup" required><option value="">Chọn nhóm</option></select></div>
          <div class="qltd-registration-field" data-field="department"><label>Phòng/ban *</label><select id="qltdRegDept"><option value="">Chọn phòng/ban</option></select></div>
        </div>
        <div class="qltd-registration-actions"><button class="qltd-registration-primary" id="qltdRegSubmit" type="submit">Hoàn tất và vào hệ thống</button><button class="qltd-registration-secondary" id="qltdRegSignOut" type="button">Đăng xuất</button></div>
        <p class="qltd-registration-status" id="qltdRegStatus" role="status"></p>
      </form>`;

    const form = gate.querySelector('#qltdRegistrationForm');
    const groupSelect = form.querySelector('#qltdRegGroup');
    const deptSelect = form.querySelector('#qltdRegDept');
    form.querySelector('#qltdRegEmail').value = user.email || '';
    form.querySelector('#qltdRegName').value = user.displayName || '';

    groups.forEach((item) => {
      const option = document.createElement('option');
      option.value = String(item.code || '').trim();
      option.textContent = String(item.name || item.label || item.code || '').trim();
      if (option.value) groupSelect.appendChild(option);
    });

    departments.forEach((item) => {
      const option = document.createElement('option');
      option.value = String(item.deptCode || item.code || '').trim();
      option.textContent = String(item.deptName || item.name || item.deptCode || item.code || '').trim();
      if (option.value) deptSelect.appendChild(option);
    });

    groupSelect.addEventListener('change', () => syncDepartmentField(form, groups));
    syncDepartmentField(form, groups);

    form.querySelector('#qltdRegSignOut').addEventListener('click', () => auth && signOut && signOut(auth));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = form.querySelector('#qltdRegStatus');
      const submit = form.querySelector('#qltdRegSubmit');
      const userGroup = String(groupSelect.value || '').trim().toUpperCase();
      const requiresDepartment = DEPT_REQUIRED_GROUPS.has(userGroup);
      const payload = {
        action: 'user_register',
        email: user.email || '',
        displayName: form.querySelector('#qltdRegName').value.trim(),
        title: form.querySelector('#qltdRegTitle').value.trim(),
        userGroup: userGroup,
        deptCode: requiresDepartment ? deptSelect.value : '',
        deptName: ''
      };

      status.className = 'qltd-registration-status';
      if (!payload.displayName || !payload.title || !payload.userGroup || (requiresDepartment && !payload.deptCode)) {
        status.classList.add('error');
        status.textContent = 'Vui lòng nhập đầy đủ các trường bắt buộc.';
        return;
      }

      submit.disabled = true;
      status.textContent = 'Đang lưu thông tin...';
      try {
        const result = await postJson(payload);
        if (!result || !result.success) {
          throw new Error(result && (result.errorMessage || result.message || (result.errors || []).join(', ')) || 'Không lưu được thông tin.');
        }
        status.classList.add('success');
        status.textContent = 'Đã lưu. Hệ thống đang mở lại theo đúng quyền được phân cấp...';
        window.setTimeout(() => window.location.reload(), 450);
      } catch (error) {
        status.classList.add('error');
        status.textContent = error.message || 'Không lưu được thông tin.';
        submit.disabled = false;
      }
    });
  }

  async function checkUser(user) {
    currentUser = user;
    if (!user) {
      removeGate();
      return;
    }

    setBodyState('qltd-registration-checking');
    try {
      const profile = await getJson('profile', { email: user.email || '' });
      if (profile && profile.success) {
        removeGate();
        return;
      }
      if (profile && profile.message === 'USER_NOT_FOUND') {
        const options = await getJson('user_getregistrationoptions', { email: user.email || '' });
        if (!options || options.success !== true) {
          console.error('user_getregistrationoptions failed', options);
          throw new Error(getApiErrorMessage(options, 'Không tải được danh mục đăng ký.'));
        }
        if (!Array.isArray(options.groups) || options.groups.length === 0) {
          console.error('user_getregistrationoptions returned empty groups', options);
          throw new Error(getApiErrorMessage({
            errorCode: 'REGISTRATION_GROUPS_EMPTY',
            errorMessage: 'Danh sách nhóm người dùng đang rỗng.'
          }));
        }
        renderForm(user, options);
        return;
      }
      if (profile && profile.message === 'USER_INACTIVE') {
        renderMessage('Tài khoản đang bị khóa', 'Tài khoản đang ở trạng thái INACTIVE. Vui lòng liên hệ quản trị hệ thống.', { blocked: true, signOut: true });
        return;
      }
      if (profile && profile.message === 'INVALID_ROLE') {
        renderMessage('Vai trò chưa hợp lệ', 'Vai trò trong sheet Users chưa đúng cấu hình. Vui lòng liên hệ quản trị hệ thống.', { blocked: true, signOut: true });
        return;
      }
      throw new Error(profile && (profile.errorMessage || profile.message) || 'Không kiểm tra được hồ sơ người dùng.');
    } catch (error) {
      renderMessage('Chưa kết nối được dữ liệu', error.message || 'Không kiểm tra được hồ sơ người dùng.', { blocked: true, retry: true, signOut: true });
    }
  }

  function overrideGoogleLogin(initPromise) {
    const button = document.getElementById('signInButton');
    if (!button || button.dataset.qltdSignInOverride === '1') return;
    button.dataset.qltdSignInOverride = '1';
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const status = document.getElementById('loginStatus');
      try {
        if (status) status.textContent = 'Đang mở Google Login...';
        await initPromise;
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } catch (error) {
        if (status) status.textContent = error.message || 'Đăng nhập thất bại.';
      }
    }, true);
  }

  async function init() {
    ensureStyles();
    const [appModule, firebaseApp, firebaseAuth] = await Promise.all([
      import(APP_MODULE),
      import(FIREBASE_APP_MODULE),
      import(FIREBASE_AUTH_MODULE)
    ]);
    apiUrl = appModule.APPS_SCRIPT_DEV_URL || '';
    if (!apiUrl) throw new Error('Thiếu địa chỉ Apps Script API.');
    auth = firebaseAuth.getAuth(firebaseApp.getApp());
    signInWithPopup = firebaseAuth.signInWithPopup;
    GoogleAuthProvider = firebaseAuth.GoogleAuthProvider;
    signOut = firebaseAuth.signOut;
    firebaseAuth.onAuthStateChanged(auth, checkUser);
  }

  const initPromise = init().catch((error) => {
    console.error('Cannot initialize registration gate', error);
    renderMessage('Không khởi tạo được đăng nhập', error.message || 'Vui lòng tải lại trang.', { blocked: true, retry: true });
    throw error;
  });
  overrideGoogleLogin(initPromise);
})();
