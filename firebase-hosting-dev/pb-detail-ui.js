const QLTD_PB_DETAIL_UI_VERSION = 'STEP_3B2D_WEEKLY_FULLSCREEN';
const QLTD_PB_DETAIL_API_URL = 'https://script.google.com/macros/s/AKfycbx6iHCEf6Ba05h6u6DiBcqv3kxV79T6RvktzoFsdBJXeQjBaCNMyGQL5akptlX8jGtxpg/exec';

const qltdPbDetailState = {
  contextKey: '',
  panel: null,
  masterTask: null,
  detailTasks: [],
  formMode: '',
  editingId: '',
  loading: false,
  requestSeq: 0,
  assigneeRequestSeq: 0,
  assigneeKey: '',
  assigneeLoading: false,
  assignees: [],
  assigneeError: '',
  formDraft: null,
  contextMeta: {},
  message: '',
  messageType: 'info'
};

const qltdPbDetailAssigneeCache = new Map();

function qltdPbDetailDevPerf(label, startedAt) {
  if (!['localhost', '127.0.0.1'].includes(window.location.hostname) && !new URLSearchParams(window.location.search).has('debugPerf')) return;
  console.info(`[QLTD PERF] ${label}: ${Math.round(performance.now() - startedAt)}ms`);
}

function qltdPbDetailEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function qltdPbDetailNormalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function qltdPbDetailCanWrite(roleText) {
  const role = qltdPbDetailNormalize(roleText).replace(/[^a-z0-9]/g, '');
  return ['admin', 'pmo', 'editor', 'reporter'].includes(role);
}

function qltdPbDetailGetContext() {
  const meta = qltdPbDetailState.contextMeta || {};
  const projectCode = meta.projectCode || document.getElementById('projectSelector')?.value || '';
  const deptCode = meta.deptCode || document.getElementById('deptSelector')?.value || '';
  const masterTaskCode = meta.masterTaskCode || document.getElementById('weeklyMasterSelector')?.value || '';
  const email = document.getElementById('userEmail')?.textContent?.trim() || '';
  const role = document.getElementById('userRole')?.textContent?.trim() || '';

  return {
    projectCode,
    deptCode,
    masterTaskCode,
    masterWbs: meta.masterWbs || '',
    masterTaskName: meta.masterTaskName || '',
    email,
    role,
    canWrite: qltdPbDetailCanWrite(role),
    key: [projectCode, deptCode, masterTaskCode, email].join('::')
  };
}

function qltdPbDetailEnsureStyles() {
  if (document.getElementById('qltdPbDetailUiStyles')) return;

  const style = document.createElement('style');
  style.id = 'qltdPbDetailUiStyles';
  style.textContent = `
    .pb-detail-panel {
      margin: 14px 0 18px;
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 8px 22px rgba(15, 23, 42, .06);
      overflow: hidden;
    }

    .pb-detail-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
      border-bottom: 1px solid #e2e8f0;
    }

    .pb-detail-header h3 {
      margin: 0;
      color: #0f172a;
      font-size: 17px;
    }

    .pb-detail-subtitle {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 12px;
    }

    .pb-detail-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pb-detail-button {
      min-height: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 7px 11px;
      background: #fff;
      color: #0f172a;
      font: inherit;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }

    .pb-detail-button:hover { background: #f8fafc; }
    .pb-detail-button:disabled { opacity: .55; cursor: not-allowed; }
    .pb-detail-button.primary { background: #0f766e; border-color: #0f766e; color: #fff; }
    .pb-detail-button.primary:hover { background: #0d665f; }
    .pb-detail-button.danger { color: #b91c1c; }

    .pb-detail-message {
      margin: 12px 16px 0;
      padding: 9px 11px;
      border-radius: 10px;
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 12px;
      font-weight: 700;
    }

    .pb-detail-message.success { background: #ecfdf5; color: #047857; }
    .pb-detail-message.error { background: #fef2f2; color: #b91c1c; }
    .pb-detail-message.warning { background: #fff7ed; color: #9a3412; }

    .pb-detail-content { padding: 14px 16px 16px; }
    .pb-detail-empty { margin: 0; padding: 18px; text-align: center; color: #64748b; }

    .pb-detail-table-wrap {
      width: 100%;
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
    }

    .pb-detail-table {
      width: 100%;
      min-width: 940px;
      border-collapse: collapse;
      font-size: 12px;
    }

    .pb-detail-table th,
    .pb-detail-table td {
      padding: 9px 8px;
      border-bottom: 1px solid #edf2f7;
      text-align: left;
      vertical-align: top;
    }

    .pb-detail-table th {
      position: sticky;
      top: 0;
      background: #f8fafc;
      color: #334155;
      font-weight: 900;
      white-space: nowrap;
    }

    .pb-detail-table tr:last-child td { border-bottom: 0; }
    .pb-detail-table .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .pb-detail-table .task-name { min-width: 250px; color: #0f172a; font-weight: 800; }
    .pb-detail-table .note { min-width: 220px; color: #475569; }
    .pb-detail-progress { white-space: nowrap; font-weight: 800; }

    .pb-detail-status {
      display: inline-flex;
      border-radius: 999px;
      padding: 4px 8px;
      background: #e2e8f0;
      color: #334155;
      font-weight: 800;
      white-space: nowrap;
    }

    .pb-detail-status.is-active { background: #dbeafe; color: #1d4ed8; }
    .pb-detail-status.is-done { background: #dcfce7; color: #15803d; }
    .pb-detail-status.is-paused { background: #fff7ed; color: #c2410c; }

    .pb-detail-form {
      margin-top: 14px;
      padding: 14px;
      border: 1px solid #bae6fd;
      border-radius: 14px;
      background: #f8fcff;
    }

    .pb-detail-form-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }

    .pb-detail-form-header h4 { margin: 0; color: #0f172a; }

    .pb-detail-parent {
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #ecfdf5;
      color: #065f46;
      font-size: 12px;
      line-height: 1.6;
    }

    .pb-detail-form-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(150px, 1fr));
      gap: 10px;
    }

    .pb-detail-field {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .pb-detail-field.span-2 { grid-column: span 2; }
    .pb-detail-field.span-4 { grid-column: span 4; }

    .pb-detail-field label {
      color: #334155;
      font-size: 11px;
      font-weight: 900;
    }

    .pb-detail-field input,
    .pb-detail-field select,
    .pb-detail-field textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #cbd5e1;
      border-radius: 9px;
      background: #fff;
      color: #0f172a;
      padding: 8px 9px;
      font: inherit;
      font-size: 12px;
    }

    .pb-detail-field textarea { min-height: 68px; resize: vertical; }

    .pb-detail-budget-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #334155;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }

    .pb-detail-field .pb-detail-budget-toggle input { width: auto; }
    .pb-detail-field.hidden { display: none; }

    .pb-detail-assignee-list {
      max-height: 150px;
      overflow: auto;
      padding: 7px;
      border: 1px solid #cbd5e1;
      border-radius: 9px;
      background: #fff;
    }
    .pb-detail-assignee-option { display: flex; gap: 7px; align-items: flex-start; padding: 5px; font-size: 12px; }
    .pb-detail-assignee-option input { width: auto; margin-top: 2px; }
    .pb-detail-assignee-option.is-disabled { color: #94a3b8; }
    .pb-detail-assignee-help { margin: 0; color: #64748b; font-size: 11px; }

    .pb-detail-form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }

    .pb-detail-readonly-note {
      margin: 0;
      padding: 10px 16px;
      border-top: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #64748b;
      font-size: 12px;
    }

    @media (max-width: 980px) {
      .pb-detail-form-grid { grid-template-columns: repeat(2, minmax(140px, 1fr)); }
      .pb-detail-field.span-4 { grid-column: span 2; }
    }

    @media (max-width: 620px) {
      .pb-detail-header { flex-direction: column; }
      .pb-detail-form-grid { grid-template-columns: 1fr; }
      .pb-detail-field.span-2,
      .pb-detail-field.span-4 { grid-column: span 1; }
    }
  `;
  document.head.appendChild(style);
}

function qltdPbDetailEnsurePanel() {
  const host = document.getElementById('pbDetailMount');
  if (!host) return null;

  let panel = document.getElementById('pbDetailPanel');
  if (panel && panel.parentElement === host) {
    qltdPbDetailState.panel = panel;
    return panel;
  }

  panel = document.createElement('section');
  panel.id = 'pbDetailPanel';
  panel.className = 'pb-detail-panel';
  panel.dataset.version = QLTD_PB_DETAIL_UI_VERSION;

  host.appendChild(panel);

  panel.addEventListener('click', qltdPbDetailHandleClick);
  panel.addEventListener('change', qltdPbDetailHandleChange);
  qltdPbDetailState.panel = panel;
  return panel;
}

function qltdPbDetailGetStatusClass(status) {
  const normalized = qltdPbDetailNormalize(status);
  if (normalized.includes('hoan thanh')) return 'is-done';
  if (normalized.includes('dang')) return 'is-active';
  if (normalized.includes('tam dung')) return 'is-paused';
  return '';
}

function qltdPbDetailFormatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return value === 0 ? '0' : '';
  return new Intl.NumberFormat('vi-VN').format(number);
}

function qltdPbDetailRender() {
  const panel = qltdPbDetailEnsurePanel();
  if (!panel) return;

  const context = qltdPbDetailGetContext();
  const master = qltdPbDetailState.masterTask;
  const details = Array.isArray(qltdPbDetailState.detailTasks) ? qltdPbDetailState.detailTasks : [];

  const messageHtml = qltdPbDetailState.message
    ? `<div class="pb-detail-message ${qltdPbDetailEscapeHtml(qltdPbDetailState.messageType)}">${qltdPbDetailEscapeHtml(qltdPbDetailState.message)}</div>`
    : '';

  const rowsHtml = details.map((task) => `
    <tr>
      <td class="mono">${qltdPbDetailEscapeHtml(task.wbs || '')}</td>
      <td class="task-name" title="${qltdPbDetailEscapeHtml(task.taskName || '')}">${qltdPbDetailEscapeHtml(task.taskName || '')}</td>
      <td>${qltdPbDetailEscapeHtml(task.planStart || '')}<br>${task.planFinish ? `→ ${qltdPbDetailEscapeHtml(task.planFinish)}` : ''}</td>
      <td><span class="pb-detail-status ${qltdPbDetailGetStatusClass(task.status)}">${qltdPbDetailEscapeHtml(task.status || 'Chưa bắt đầu')}</span></td>
      <td class="pb-detail-progress">${qltdPbDetailEscapeHtml(task.progress ?? 0)}%</td>
      <td>${qltdPbDetailEscapeHtml(task.owner || '')}</td>
      <td>${qltdPbDetailFormatNumber(task.budgetPlan)}</td>
      <td class="note" title="${qltdPbDetailEscapeHtml(task.note || '')}">${qltdPbDetailEscapeHtml(task.note || '')}</td>
      <td>
        ${context.canWrite ? `<button type="button" class="pb-detail-button" data-pb-detail-action="edit" data-detail-task-id="${qltdPbDetailEscapeHtml(task.detailTaskId || '')}">Sửa</button>` : ''}
      </td>
    </tr>
  `).join('');

  panel.innerHTML = `
    <div class="pb-detail-header">
      <div>
        <h3>Việc chi tiết phòng/ban</h3>
        <p class="pb-detail-subtitle">
          ${qltdPbDetailEscapeHtml(context.deptCode)} · ${qltdPbDetailEscapeHtml(context.masterWbs)}
          ${context.masterTaskName || master?.taskName ? ` · ${qltdPbDetailEscapeHtml(context.masterTaskName || master?.taskName)}` : ''}
          · ${details.length} việc chi tiết
        </p>
      </div>
      <div class="pb-detail-actions">
        <button type="button" class="pb-detail-button" data-pb-detail-action="reload" ${qltdPbDetailState.loading ? 'disabled' : ''}>Tải lại</button>
        ${context.canWrite ? `<button type="button" class="pb-detail-button primary" data-pb-detail-action="add" ${qltdPbDetailState.loading ? 'disabled' : ''}>+ Thêm việc chi tiết</button>` : ''}
      </div>
    </div>
    ${messageHtml}
    <div class="pb-detail-content">
      ${qltdPbDetailState.loading ? '<p class="pb-detail-empty">Đang tải dữ liệu việc chi tiết...</p>' : ''}
      ${!qltdPbDetailState.loading && !details.length ? '<p class="pb-detail-empty">Chưa có việc chi tiết dưới mục tiêu này.</p>' : ''}
      ${!qltdPbDetailState.loading && details.length ? `
        <div class="pb-detail-table-wrap">
          <table class="pb-detail-table">
            <thead>
              <tr>
                <th>WBS</th>
                <th>Việc chi tiết</th>
                <th>Kế hoạch</th>
                <th>Trạng thái</th>
                <th>Tiến độ</th>
                <th>Chủ trì</th>
                <th>NS kế hoạch</th>
                <th>Ghi chú</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      ` : ''}
      ${qltdPbDetailRenderForm(context)}
    </div>
    ${context.canWrite ? '' : '<p class="pb-detail-readonly-note">Tài khoản hiện tại chỉ được xem. Backend vẫn kiểm tra quyền ở mọi thao tác ghi.</p>'}
  `;
}

function qltdPbDetailRenderForm(context) {
  if (!qltdPbDetailState.formMode || !context.canWrite) return '';

  const isEdit = qltdPbDetailState.formMode === 'edit';
  const task = isEdit
    ? qltdPbDetailState.detailTasks.find((item) => item.detailTaskId === qltdPbDetailState.editingId) || {}
    : {};
  const formValue = qltdPbDetailState.formDraft || task;
  const hasBudgetPlan = formValue.hasBudgetPlan !== undefined
    ? !!formValue.hasBudgetPlan
    : formValue.budgetPlan !== '' && formValue.budgetPlan !== null && formValue.budgetPlan !== undefined;
  const ownerEmail = qltdPbDetailExtractEmails(formValue.owner || '')[0] || '';
  const coordinatorEmails = new Set(qltdPbDetailExtractEmails(formValue.coordinator || ''));
  const assigneeDisabled = qltdPbDetailState.assigneeLoading || !!qltdPbDetailState.assigneeError;
  const assigneeHelp = qltdPbDetailState.assigneeLoading
    ? 'Đang tải nhân sự từ HR...'
    : (qltdPbDetailState.assigneeError || 'Danh sách tự tải theo phòng/ban đang hiển thị trên kế hoạch tổng thể.');
  const ownerOptions = qltdPbDetailState.assignees.map((person) => {
    const label = [person.displayName, person.position].filter(Boolean).join(' — ');
    return `<option value="${qltdPbDetailEscapeHtml(person.email || '')}" ${person.email === ownerEmail ? 'selected' : ''} ${person.assignable ? '' : 'disabled'}>${qltdPbDetailEscapeHtml(label)}${person.assignable ? '' : ' — thiếu email'}</option>`;
  }).join('');
  const currentOwnerOption = ownerEmail && !qltdPbDetailState.assignees.some((person) => person.email === ownerEmail)
    ? `<option value="${qltdPbDetailEscapeHtml(ownerEmail)}" selected>${qltdPbDetailEscapeHtml(ownerEmail)} — không còn trong danh sách hợp lệ</option>`
    : '';
  const coordinatorOptions = qltdPbDetailState.assignees.map((person) => {
    const label = [person.displayName, person.position].filter(Boolean).join(' — ');
    return `<label class="pb-detail-assignee-option ${person.assignable ? '' : 'is-disabled'}"><input type="checkbox" name="coordinator" value="${qltdPbDetailEscapeHtml(person.email || '')}" ${coordinatorEmails.has(person.email) ? 'checked' : ''} ${person.assignable ? '' : 'disabled'}><span>${qltdPbDetailEscapeHtml(label)}${person.assignable ? '' : ' — thiếu email'}</span></label>`;
  }).join('');
  const unavailableCoordinators = Array.from(coordinatorEmails)
    .filter((email) => !qltdPbDetailState.assignees.some((person) => person.email === email))
    .map((email) => `<label class="pb-detail-assignee-option is-disabled"><input type="checkbox" name="coordinator" value="${qltdPbDetailEscapeHtml(email)}" checked><span>${qltdPbDetailEscapeHtml(email)} — không còn trong danh sách hợp lệ</span></label>`)
    .join('');

  return `
    <form id="pbDetailForm" class="pb-detail-form" novalidate>
      <div class="pb-detail-form-header">
        <h4>${isEdit ? `Cập nhật ${qltdPbDetailEscapeHtml(task.wbs || task.detailTaskId || '')}` : 'Thêm việc chi tiết mới'}</h4>
        <span class="pb-detail-subtitle">${isEdit ? qltdPbDetailEscapeHtml(task.detailTaskId || '') : 'DetailTaskId và WBS sẽ được backend tự sinh'}</span>
      </div>

      <p class="pb-detail-parent">
        <strong>Mục tiêu gốc:</strong> ${qltdPbDetailEscapeHtml(context.masterWbs || 'Chưa có WBS')} · ${qltdPbDetailEscapeHtml(context.masterTaskName || qltdPbDetailState.masterTask?.taskName || '')}<br>
        <strong>Phòng/ban:</strong> ${qltdPbDetailEscapeHtml(context.deptCode)}
      </p>

      <div class="pb-detail-form-grid">
        <div class="pb-detail-field span-4">
          <label for="pbDetailTaskName">Nội dung việc chi tiết *</label>
          <input id="pbDetailTaskName" name="taskName" type="text" maxlength="500" required value="${qltdPbDetailEscapeHtml(formValue.taskName || '')}">
        </div>

        <div class="pb-detail-field span-2">
          <label for="pbDetailPlanStart">Bắt đầu kế hoạch${isEdit ? '' : ' *'}</label>
          <input id="pbDetailPlanStart" name="planStart" type="date" ${isEdit ? '' : 'required'} value="${qltdPbDetailEscapeHtml(formValue.planStart || '')}">
        </div>

        <div class="pb-detail-field span-2">
          <label for="pbDetailPlanFinish">Kết thúc kế hoạch${isEdit ? '' : ' *'}</label>
          <input id="pbDetailPlanFinish" name="planFinish" type="date" ${isEdit ? '' : 'required'} value="${qltdPbDetailEscapeHtml(formValue.planFinish || '')}">
        </div>

        <div class="pb-detail-field span-2">
          <label for="pbDetailOwnerSearch">Người chủ trì</label>
          <input id="pbDetailOwnerSearch" type="search" placeholder="Tìm theo tên hoặc vị trí" ${assigneeDisabled ? 'disabled' : ''}>
          <select id="pbDetailOwner" name="owner" ${assigneeDisabled ? 'disabled' : ''}>
            <option value="">Chưa phân công</option>${currentOwnerOption}${ownerOptions}
          </select>
          <p class="pb-detail-assignee-help">${qltdPbDetailEscapeHtml(assigneeHelp)}</p>
        </div>

        <div class="pb-detail-field span-2">
          <label>Người phối hợp</label>
          <div id="pbDetailCoordinator" class="pb-detail-assignee-list">${coordinatorOptions}${unavailableCoordinators}${coordinatorOptions || unavailableCoordinators ? '' : '<span class="pb-detail-assignee-help">Không có nhân sự phù hợp.</span>'}</div>
        </div>

        <div class="pb-detail-field span-2">
          <label for="pbDetailCondition">Điều kiện đầu vào/phụ thuộc</label>
          <textarea id="pbDetailCondition" name="condition">${qltdPbDetailEscapeHtml(formValue.condition || '')}</textarea>
        </div>

        <div class="pb-detail-field span-2">
          <label for="pbDetailNote">Ghi chú kế hoạch</label>
          <textarea id="pbDetailNote" name="note">${qltdPbDetailEscapeHtml(formValue.note || '')}</textarea>
        </div>

        <div class="pb-detail-field span-4">
          <label class="pb-detail-budget-toggle" for="pbDetailHasBudgetPlan">
            <input id="pbDetailHasBudgetPlan" name="hasBudgetPlan" type="checkbox" ${hasBudgetPlan ? 'checked' : ''}>
            Có ngân sách kế hoạch
          </label>
        </div>

        <div id="pbDetailBudgetPlanField" class="pb-detail-field span-2 ${hasBudgetPlan ? '' : 'hidden'}">
          <label for="pbDetailBudgetPlan">Ngân sách kế hoạch (VNĐ)</label>
          <input id="pbDetailBudgetPlan" name="budgetPlan" type="number" min="0" step="1" value="${qltdPbDetailEscapeHtml(formValue.budgetPlan || '')}">
        </div>
      </div>

      <div class="pb-detail-form-actions">
        <button type="button" class="pb-detail-button" data-pb-detail-action="cancel">Hủy</button>
        <button type="button" class="pb-detail-button primary" data-pb-detail-action="save">${isEdit ? 'Lưu cập nhật' : 'Tạo việc chi tiết'}</button>
      </div>
    </form>
  `;
}

async function qltdPbDetailFetchGet(context) {
  const url = new URL(QLTD_PB_DETAIL_API_URL);
  url.searchParams.set('action', 'work_getdetailtasks');
  url.searchParams.set('email', context.email);
  url.searchParams.set('projectCode', context.projectCode);
  url.searchParams.set('deptCode', context.deptCode);
  url.searchParams.set('masterTaskCode', context.masterTaskCode);

  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
    redirect: 'follow'
  });

  if (!response.ok) throw new Error(`GET PB_DETAIL thất bại: HTTP ${response.status}`);
  return response.json();
}

async function qltdPbDetailFetchAssignees(context) {
  const url = new URL(QLTD_PB_DETAIL_API_URL);
  url.searchParams.set('action', 'work_listassignees');
  url.searchParams.set('email', context.email);
  url.searchParams.set('projectCode', context.projectCode);
  url.searchParams.set('deptCode', context.deptCode);
  const response = await fetch(url.toString(), { method: 'GET', cache: 'no-store', redirect: 'follow' });
  if (!response.ok) throw new Error(`GET assignee thất bại: HTTP ${response.status}`);
  return response.json();
}

async function qltdPbDetailLoadAssignees(context, force = false) {
  const key = [context.projectCode, context.deptCode].join('::');
  if (!context.projectCode || !context.deptCode || !context.email) return;
  if (!force && qltdPbDetailAssigneeCache.has(key)) {
    qltdPbDetailState.assigneeKey = key;
    qltdPbDetailState.assignees = qltdPbDetailAssigneeCache.get(key);
    qltdPbDetailState.assigneeError = '';
    qltdPbDetailRender();
    return;
  }
  if (!force && qltdPbDetailState.assigneeKey === key && qltdPbDetailState.assigneeLoading) return;
  qltdPbDetailCaptureFormDraft();
  qltdPbDetailState.assigneeKey = key;
  qltdPbDetailState.assigneeLoading = true;
  qltdPbDetailState.assigneeError = '';
  qltdPbDetailState.assignees = [];
  qltdPbDetailRender();
  const requestSeq = ++qltdPbDetailState.assigneeRequestSeq;
  const startedAt = performance.now();
  try {
    const payload = await qltdPbDetailFetchAssignees(context);
    if (requestSeq !== qltdPbDetailState.assigneeRequestSeq) return;
    if (!payload?.success) throw new Error(qltdPbDetailExtractError(payload));
    qltdPbDetailState.assignees = Array.isArray(payload.data?.assignees) ? payload.data.assignees : [];
    qltdPbDetailAssigneeCache.set(key, qltdPbDetailState.assignees);
    const mappingWarning = (payload.warnings || []).find((item) => item.code === 'HR_DEPT_MAPPING_MISSING');
    if (mappingWarning) qltdPbDetailState.assigneeError = mappingWarning.message;
  } catch (error) {
    if (requestSeq !== qltdPbDetailState.assigneeRequestSeq) return;
    qltdPbDetailState.assigneeError = error.message || String(error);
  } finally {
    if (requestSeq === qltdPbDetailState.assigneeRequestSeq) {
      qltdPbDetailState.assigneeLoading = false;
      qltdPbDetailDevPerf('HR assignee', startedAt);
      qltdPbDetailRender();
    }
  }
}

function qltdPbDetailExtractEmails(value) {
  return String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)?.map((email) => email.toLowerCase()) || [];
}

function qltdPbDetailCaptureFormDraft() {
  const form = document.getElementById('pbDetailForm');
  if (!form || !qltdPbDetailState.formMode) return;
  const data = new FormData(form);
  qltdPbDetailState.formDraft = {
    taskName: String(data.get('taskName') || ''),
    planStart: String(data.get('planStart') || ''),
    planFinish: String(data.get('planFinish') || ''),
    owner: String(data.get('owner') || ''),
    coordinator: data.getAll('coordinator').join(';'),
    condition: String(data.get('condition') || ''),
    note: String(data.get('note') || ''),
    hasBudgetPlan: data.get('hasBudgetPlan') === 'on',
    budgetPlan: String(data.get('budgetPlan') || '')
  };
}

async function qltdPbDetailFetchPost(payload) {
  const response = await fetch(QLTD_PB_DETAIL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8'
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    redirect: 'follow'
  });

  if (!response.ok) throw new Error(`POST PB_DETAIL thất bại: HTTP ${response.status}`);
  return response.json();
}

function qltdPbDetailExtractError(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (errors.length) {
    return errors.map((item) => item.message || item.code || 'Lỗi không xác định').join(' · ');
  }
  return payload?.message || payload?.error || 'API không trả success=true';
}

async function qltdPbDetailLoad(force = false, providedContext = null) {
  const panel = qltdPbDetailEnsurePanel();
  const context = providedContext || qltdPbDetailGetContext();
  if (!panel || !context.projectCode || !context.deptCode || !context.masterTaskCode || !context.email) return;

  if (!force && qltdPbDetailState.contextKey === context.key) {
    if (qltdPbDetailState.loading) return;
    qltdPbDetailRender();
    return;
  }

  qltdPbDetailState.contextKey = context.key;
  qltdPbDetailState.loading = true;
  qltdPbDetailState.formMode = '';
  qltdPbDetailState.editingId = '';
  qltdPbDetailState.formDraft = null;
  qltdPbDetailState.message = '';
  qltdPbDetailState.masterTask = null;
  qltdPbDetailState.detailTasks = [];
  qltdPbDetailRender();

  const requestSeq = ++qltdPbDetailState.requestSeq;
  const startedAt = performance.now();

  try {
    const payload = await qltdPbDetailFetchGet(context);
    if (requestSeq !== qltdPbDetailState.requestSeq) return;
    if (!payload?.success) throw new Error(qltdPbDetailExtractError(payload));

    qltdPbDetailState.masterTask = payload.data?.masterTask || null;
    qltdPbDetailState.detailTasks = Array.isArray(payload.data?.detailTasks) ? payload.data.detailTasks : [];
    qltdPbDetailState.message = '';
  } catch (error) {
    if (requestSeq !== qltdPbDetailState.requestSeq) return;
    qltdPbDetailState.message = error.message || String(error);
    qltdPbDetailState.messageType = 'error';
  } finally {
    if (requestSeq === qltdPbDetailState.requestSeq) {
      qltdPbDetailState.loading = false;
      qltdPbDetailDevPerf('PB_DETAIL', startedAt);
      qltdPbDetailRender();
    }
  }
}

function qltdPbDetailReadFormPayload(context, isEdit) {
  const form = document.getElementById('pbDetailForm');
  if (!form) throw new Error('Không tìm thấy biểu mẫu việc chi tiết.');

  const data = new FormData(form);
  const payload = {
    email: context.email,
    projectCode: context.projectCode,
    deptCode: context.deptCode,
    taskName: String(data.get('taskName') || '').trim(),
    planStart: String(data.get('planStart') || '').trim(),
    planFinish: String(data.get('planFinish') || '').trim(),
    owner: String(data.get('owner') || '').trim(),
    coordinator: data.getAll('coordinator').map((value) => String(value || '').trim()).filter(Boolean).join(';'),
    budgetPlan: data.get('hasBudgetPlan') === 'on' ? String(data.get('budgetPlan') || '').trim() : '',
    condition: String(data.get('condition') || '').trim(),
    note: String(data.get('note') || '').trim()
  };

  if (!payload.taskName) throw new Error('Nội dung việc chi tiết là bắt buộc.');
  if (!isEdit && (!payload.planStart || !payload.planFinish)) {
    throw new Error('Bắt đầu và kết thúc kế hoạch là bắt buộc.');
  }

  if (payload.budgetPlan !== '') {
    const number = Number(payload.budgetPlan);
    if (!Number.isFinite(number) || number < 0) {
      throw new Error('Ngân sách kế hoạch phải là số không âm.');
    }
    payload.budgetPlan = number;
  }

  if (payload.planStart && payload.planFinish && payload.planFinish < payload.planStart) {
    throw new Error('Ngày kết thúc kế hoạch không được trước ngày bắt đầu kế hoạch.');
  }

  if (!isEdit) {
    Object.assign(payload, {
      status: 'Chưa bắt đầu',
      progress: 0,
      actualStart: '',
      actualFinish: '',
      budgetActual: '',
      weight: ''
    });
  }

  return payload;
}

async function qltdPbDetailSave() {
  const context = qltdPbDetailGetContext();
  if (!context.canWrite) return;

  const isEdit = qltdPbDetailState.formMode === 'edit';
  let payload;
  qltdPbDetailCaptureFormDraft();
  try {
    payload = qltdPbDetailReadFormPayload(context, isEdit);
  } catch (error) {
    qltdPbDetailState.message = error.message || String(error);
    qltdPbDetailState.messageType = 'error';
    qltdPbDetailRender();
    return;
  }

  if (isEdit) {
    payload.action = 'work_updatedetailtask';
    payload.detailTaskId = qltdPbDetailState.editingId;
  } else {
    payload.action = 'work_createdetailtask';
    payload.masterTaskCode = context.masterTaskCode;
  }

  qltdPbDetailState.loading = true;
  qltdPbDetailState.message = isEdit ? 'Đang cập nhật việc chi tiết...' : 'Đang tạo việc chi tiết...';
  qltdPbDetailState.messageType = 'info';
  qltdPbDetailRender();

  try {
    const result = await qltdPbDetailFetchPost(payload);
    if (!result?.success) throw new Error(qltdPbDetailExtractError(result));

    const detailTaskId = result.data?.detailTaskId || payload.detailTaskId || '';
    qltdPbDetailState.formMode = '';
    qltdPbDetailState.editingId = '';
    qltdPbDetailState.formDraft = null;
    qltdPbDetailState.message = `${isEdit ? 'Đã cập nhật' : 'Đã tạo'} việc chi tiết ${detailTaskId}.`;
    qltdPbDetailState.messageType = 'success';
    qltdPbDetailState.masterTask = null;
    qltdPbDetailState.loading = false;
    await qltdPbDetailLoad(true);
    qltdPbDetailState.message = `${isEdit ? 'Đã cập nhật' : 'Đã tạo'} việc chi tiết ${detailTaskId}.`;
    qltdPbDetailState.messageType = 'success';
    qltdPbDetailRender();
    document.dispatchEvent(new CustomEvent('qltd:pb-detail-changed', {
      detail: {
        projectCode: context.projectCode,
        deptCode: context.deptCode,
        masterTaskCode: context.masterTaskCode,
        detailTasks: qltdPbDetailState.detailTasks.slice()
      }
    }));
  } catch (error) {
    qltdPbDetailState.loading = false;
    qltdPbDetailState.message = error.message || String(error);
    qltdPbDetailState.messageType = 'error';
    qltdPbDetailRender();
  }
}

function qltdPbDetailHandleClick(event) {
  const button = event.target.closest('[data-pb-detail-action]');
  if (!button) return;

  const action = button.dataset.pbDetailAction;
  if (action === 'reload') {
    qltdPbDetailLoad(true);
    if (qltdPbDetailState.formMode) qltdPbDetailLoadAssignees(qltdPbDetailGetContext(), true);
    return;
  }

  if (action === 'add') {
    qltdPbDetailState.formMode = 'create';
    qltdPbDetailState.editingId = '';
    qltdPbDetailState.message = '';
    qltdPbDetailState.formDraft = null;
    qltdPbDetailRender();
    qltdPbDetailLoadAssignees(qltdPbDetailGetContext());
    document.getElementById('pbDetailTaskName')?.focus();
    return;
  }

  if (action === 'edit') {
    qltdPbDetailState.formMode = 'edit';
    qltdPbDetailState.editingId = button.dataset.detailTaskId || '';
    qltdPbDetailState.message = '';
    qltdPbDetailState.formDraft = null;
    qltdPbDetailRender();
    qltdPbDetailLoadAssignees(qltdPbDetailGetContext());
    document.getElementById('pbDetailTaskName')?.focus();
    return;
  }

  if (action === 'cancel') {
    qltdPbDetailState.formMode = '';
    qltdPbDetailState.editingId = '';
    qltdPbDetailState.message = '';
    qltdPbDetailState.formDraft = null;
    qltdPbDetailRender();
    return;
  }

  if (action === 'save') {
    qltdPbDetailSave();
  }
}

function qltdPbDetailHandleChange(event) {
  if (event.target?.id !== 'pbDetailHasBudgetPlan') return;
  const budgetField = document.getElementById('pbDetailBudgetPlanField');
  if (budgetField) budgetField.classList.toggle('hidden', !event.target.checked);
}

function qltdPbDetailHandleInput(event) {
  if (event.target?.id !== 'pbDetailOwnerSearch') return;
  const query = qltdPbDetailNormalize(event.target.value);
  document.querySelectorAll('#pbDetailOwner option').forEach((option, index) => {
    if (index === 0) return;
    option.hidden = !!query && !qltdPbDetailNormalize(option.textContent).includes(query);
  });
}

function qltdPbDetailHandleDeptPlanRendered(event) {
  const detail = event.detail || {};
  qltdPbDetailState.contextMeta = {
    projectCode: detail.projectCode || '',
    deptCode: detail.deptCode || '',
    masterTaskCode: detail.masterTaskCode || '',
    masterWbs: detail.masterWbs || detail.masterTaskCode || '',
    masterTaskName: detail.masterTaskName || ''
  };

  const context = qltdPbDetailGetContext();
  if (!context.projectCode || !context.deptCode || !context.masterTaskCode || !context.email) {
    qltdPbDetailState.requestSeq += 1;
    qltdPbDetailState.assigneeRequestSeq += 1;
    qltdPbDetailState.contextKey = '';
    qltdPbDetailState.assigneeKey = '';
    qltdPbDetailState.assignees = [];
    qltdPbDetailState.assigneeError = '';
    qltdPbDetailState.formMode = '';
    qltdPbDetailState.editingId = '';
    qltdPbDetailState.formDraft = null;
    qltdPbDetailState.masterTask = null;
    qltdPbDetailState.detailTasks = [];
    qltdPbDetailState.loading = false;
    return;
  }

  const panel = qltdPbDetailEnsurePanel();
  if (!panel) return;

  if (qltdPbDetailState.contextKey === context.key) {
    qltdPbDetailRender();
    return;
  }

  qltdPbDetailState.requestSeq += 1;
  qltdPbDetailState.formMode = '';
  qltdPbDetailState.editingId = '';
  qltdPbDetailState.formDraft = null;
  qltdPbDetailState.masterTask = null;
  qltdPbDetailState.detailTasks = [];
  qltdPbDetailLoad(false, context);
}

function qltdPbDetailBoot() {
  qltdPbDetailEnsureStyles();
  document.addEventListener('qltd:dept-plan-rendered', qltdPbDetailHandleDeptPlanRendered);
  document.addEventListener('input', qltdPbDetailHandleInput);
  console.info(`[QLTD] PB_DETAIL UI loaded: ${QLTD_PB_DETAIL_UI_VERSION}`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', qltdPbDetailBoot, { once: true });
} else {
  qltdPbDetailBoot();
}
