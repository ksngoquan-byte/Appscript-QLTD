const QLTD_PB_DETAIL_UI_VERSION = 'STEP_3B2B_V1_1';
const QLTD_PB_DETAIL_API_URL = 'https://script.google.com/macros/s/AKfycbx6iHCEf6Ba05h6u6DiBcqv3kxV79T6RvktzoFsdBJXeQjBaCNMyGQL5akptlX8jGtxpg/exec';

const QLTD_PB_DETAIL_STATUS_OPTIONS = [
  'Chưa bắt đầu',
  'Đang làm',
  'Tạm dừng',
  'Hoàn thành'
];

const qltdPbDetailState = {
  contextKey: '',
  panel: null,
  masterTask: null,
  detailTasks: [],
  formMode: '',
  editingId: '',
  loading: false,
  requestSeq: 0,
  message: '',
  messageType: 'info'
};

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
  const projectCode = document.getElementById('projectSelector')?.value || '';
  const deptCode = document.getElementById('deptSelector')?.value || '';
  const masterTaskCode = document.getElementById('weeklyMasterSelector')?.value || '';
  const email = document.getElementById('userEmail')?.textContent?.trim() || '';
  const role = document.getElementById('userRole')?.textContent?.trim() || '';

  return {
    projectCode,
    deptCode,
    masterTaskCode,
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
  const host = document.getElementById('deptPlanContent');
  const masterSelector = document.getElementById('weeklyMasterSelector');
  if (!host || !masterSelector) return null;

  let panel = document.getElementById('pbDetailPanel');
  if (panel && panel.parentElement === host) {
    qltdPbDetailState.panel = panel;
    return panel;
  }

  panel = document.createElement('section');
  panel.id = 'pbDetailPanel';
  panel.className = 'pb-detail-panel';
  panel.dataset.version = QLTD_PB_DETAIL_UI_VERSION;

  const anchor = host.querySelector('.weekly-update-panel') || host.querySelector('.dept-plan-table-wrap');
  if (anchor) host.insertBefore(panel, anchor);
  else host.appendChild(panel);

  panel.addEventListener('click', qltdPbDetailHandleClick);
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
          ${qltdPbDetailEscapeHtml(context.deptCode)} · ${qltdPbDetailEscapeHtml(context.masterTaskCode)}
          ${master?.taskName ? ` · ${qltdPbDetailEscapeHtml(master.taskName)}` : ''}
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
    : { status: 'Chưa bắt đầu', progress: 0 };

  const statusOptions = QLTD_PB_DETAIL_STATUS_OPTIONS.map((status) => `
    <option value="${qltdPbDetailEscapeHtml(status)}" ${status === (task.status || 'Chưa bắt đầu') ? 'selected' : ''}>${qltdPbDetailEscapeHtml(status)}</option>
  `).join('');

  return `
    <form id="pbDetailForm" class="pb-detail-form" novalidate>
      <div class="pb-detail-form-header">
        <h4>${isEdit ? `Cập nhật ${qltdPbDetailEscapeHtml(task.wbs || task.detailTaskId || '')}` : 'Thêm việc chi tiết mới'}</h4>
        <span class="pb-detail-subtitle">${isEdit ? qltdPbDetailEscapeHtml(task.detailTaskId || '') : 'DetailTaskId và WBS sẽ được backend tự sinh'}</span>
      </div>

      <div class="pb-detail-form-grid">
        <div class="pb-detail-field span-2">
          <label for="pbDetailTaskName">Nội dung công việc *</label>
          <input id="pbDetailTaskName" name="taskName" type="text" maxlength="500" required value="${qltdPbDetailEscapeHtml(task.taskName || '')}">
        </div>

        <div class="pb-detail-field">
          <label for="pbDetailStatus">Trạng thái</label>
          <select id="pbDetailStatus" name="status">${statusOptions}</select>
        </div>

        <div class="pb-detail-field">
          <label for="pbDetailProgress">% hoàn thành</label>
          <input id="pbDetailProgress" name="progress" type="number" min="0" max="100" step="1" value="${qltdPbDetailEscapeHtml(task.progress ?? 0)}">
        </div>

        <div class="pb-detail-field">
          <label for="pbDetailPlanStart">Bắt đầu kế hoạch</label>
          <input id="pbDetailPlanStart" name="planStart" type="date" value="${qltdPbDetailEscapeHtml(task.planStart || '')}">
        </div>

        <div class="pb-detail-field">
          <label for="pbDetailPlanFinish">Kết thúc kế hoạch</label>
          <input id="pbDetailPlanFinish" name="planFinish" type="date" value="${qltdPbDetailEscapeHtml(task.planFinish || '')}">
        </div>

        <div class="pb-detail-field">
          <label for="pbDetailActualStart">Bắt đầu thực tế</label>
          <input id="pbDetailActualStart" name="actualStart" type="date" value="${qltdPbDetailEscapeHtml(task.actualStart || '')}">
        </div>

        <div class="pb-detail-field">
          <label for="pbDetailActualFinish">Hoàn thành thực tế</label>
          <input id="pbDetailActualFinish" name="actualFinish" type="date" value="${qltdPbDetailEscapeHtml(task.actualFinish || '')}">
        </div>

        <div class="pb-detail-field span-2">
          <label for="pbDetailOwner">Người chủ trì</label>
          <input id="pbDetailOwner" name="owner" type="text" value="${qltdPbDetailEscapeHtml(task.owner || '')}" placeholder="Để trống nếu chưa phân công">
        </div>

        <div class="pb-detail-field span-2">
          <label for="pbDetailCoordinator">Người phối hợp</label>
          <input id="pbDetailCoordinator" name="coordinator" type="text" value="${qltdPbDetailEscapeHtml(task.coordinator || '')}">
        </div>

        <div class="pb-detail-field">
          <label for="pbDetailBudgetPlan">Ngân sách kế hoạch</label>
          <input id="pbDetailBudgetPlan" name="budgetPlan" type="number" min="0" step="1" value="${qltdPbDetailEscapeHtml(task.budgetPlan || '')}">
        </div>

        <div class="pb-detail-field">
          <label for="pbDetailBudgetActual">Ngân sách thực tế</label>
          <input id="pbDetailBudgetActual" name="budgetActual" type="number" min="0" step="1" value="${qltdPbDetailEscapeHtml(task.budgetActual || '')}">
        </div>

        <div class="pb-detail-field">
          <label for="pbDetailWeight">Trọng số (%)</label>
          <input id="pbDetailWeight" name="weight" type="number" min="0" max="100" step="1" value="${qltdPbDetailEscapeHtml(task.weight || '')}">
        </div>

        <div class="pb-detail-field span-2">
          <label for="pbDetailCondition">Điều kiện đầu vào</label>
          <textarea id="pbDetailCondition" name="condition">${qltdPbDetailEscapeHtml(task.condition || '')}</textarea>
        </div>

        <div class="pb-detail-field span-4">
          <label for="pbDetailNote">Ghi chú cập nhật</label>
          <textarea id="pbDetailNote" name="note">${qltdPbDetailEscapeHtml(task.note || '')}</textarea>
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

async function qltdPbDetailLoad(force = false) {
  const panel = qltdPbDetailEnsurePanel();
  const context = qltdPbDetailGetContext();
  if (!panel || !context.projectCode || !context.deptCode || !context.masterTaskCode || !context.email) return;

  if (!force && qltdPbDetailState.contextKey === context.key) {
    if (qltdPbDetailState.loading) return;
    if (qltdPbDetailState.masterTask) {
      qltdPbDetailRender();
      return;
    }
  }

  qltdPbDetailState.contextKey = context.key;
  qltdPbDetailState.loading = true;
  qltdPbDetailState.formMode = '';
  qltdPbDetailState.editingId = '';
  qltdPbDetailState.message = '';
  qltdPbDetailState.masterTask = null;
  qltdPbDetailState.detailTasks = [];
  qltdPbDetailRender();

  const requestSeq = ++qltdPbDetailState.requestSeq;

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
      qltdPbDetailRender();
    }
  }
}

function qltdPbDetailReadFormPayload(context) {
  const form = document.getElementById('pbDetailForm');
  if (!form) throw new Error('Không tìm thấy biểu mẫu việc chi tiết.');

  const data = new FormData(form);
  const payload = {
    email: context.email,
    projectCode: context.projectCode,
    deptCode: context.deptCode,
    taskName: String(data.get('taskName') || '').trim(),
    status: String(data.get('status') || '').trim(),
    progress: String(data.get('progress') || '').trim(),
    planStart: String(data.get('planStart') || '').trim(),
    planFinish: String(data.get('planFinish') || '').trim(),
    actualStart: String(data.get('actualStart') || '').trim(),
    actualFinish: String(data.get('actualFinish') || '').trim(),
    owner: String(data.get('owner') || '').trim(),
    coordinator: String(data.get('coordinator') || '').trim(),
    budgetPlan: String(data.get('budgetPlan') || '').trim(),
    budgetActual: String(data.get('budgetActual') || '').trim(),
    weight: String(data.get('weight') || '').trim(),
    condition: String(data.get('condition') || '').trim(),
    note: String(data.get('note') || '').trim()
  };

  if (!payload.taskName) throw new Error('Nội dung công việc là bắt buộc.');

  const progress = payload.progress === '' ? 0 : Number(payload.progress);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new Error('% hoàn thành phải từ 0 đến 100.');
  }
  payload.progress = progress;

  if (payload.weight !== '') {
    const weight = Number(payload.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new Error('Trọng số phải từ 0 đến 100.');
    }
    payload.weight = weight;
  }

  ['budgetPlan', 'budgetActual'].forEach((field) => {
    if (payload[field] === '') return;
    const number = Number(payload[field]);
    if (!Number.isFinite(number) || number < 0) {
      throw new Error(`${field === 'budgetPlan' ? 'Ngân sách kế hoạch' : 'Ngân sách thực tế'} phải là số không âm.`);
    }
    payload[field] = number;
  });

  if (payload.planStart && payload.planFinish && payload.planFinish < payload.planStart) {
    throw new Error('Ngày kết thúc kế hoạch không được trước ngày bắt đầu kế hoạch.');
  }
  if (payload.actualStart && payload.actualFinish && payload.actualFinish < payload.actualStart) {
    throw new Error('Ngày hoàn thành thực tế không được trước ngày bắt đầu thực tế.');
  }

  return payload;
}

async function qltdPbDetailSave() {
  const context = qltdPbDetailGetContext();
  if (!context.canWrite) return;

  let payload;
  try {
    payload = qltdPbDetailReadFormPayload(context);
  } catch (error) {
    qltdPbDetailState.message = error.message || String(error);
    qltdPbDetailState.messageType = 'error';
    qltdPbDetailRender();
    return;
  }

  const isEdit = qltdPbDetailState.formMode === 'edit';
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
    qltdPbDetailState.message = `${isEdit ? 'Đã cập nhật' : 'Đã tạo'} việc chi tiết ${detailTaskId}.`;
    qltdPbDetailState.messageType = 'success';
    qltdPbDetailState.masterTask = null;
    qltdPbDetailState.loading = false;
    await qltdPbDetailLoad(true);
    qltdPbDetailState.message = `${isEdit ? 'Đã cập nhật' : 'Đã tạo'} việc chi tiết ${detailTaskId}.`;
    qltdPbDetailState.messageType = 'success';
    qltdPbDetailRender();
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
    return;
  }

  if (action === 'add') {
    qltdPbDetailState.formMode = 'create';
    qltdPbDetailState.editingId = '';
    qltdPbDetailState.message = '';
    qltdPbDetailRender();
    document.getElementById('pbDetailTaskName')?.focus();
    return;
  }

  if (action === 'edit') {
    qltdPbDetailState.formMode = 'edit';
    qltdPbDetailState.editingId = button.dataset.detailTaskId || '';
    qltdPbDetailState.message = '';
    qltdPbDetailRender();
    document.getElementById('pbDetailTaskName')?.focus();
    return;
  }

  if (action === 'cancel') {
    qltdPbDetailState.formMode = '';
    qltdPbDetailState.editingId = '';
    qltdPbDetailState.message = '';
    qltdPbDetailRender();
    return;
  }

  if (action === 'save') {
    qltdPbDetailSave();
  }
}

let qltdPbDetailMountTimer = null;

function qltdPbDetailScheduleMount(delay = 80) {
  window.clearTimeout(qltdPbDetailMountTimer);
  qltdPbDetailMountTimer = window.setTimeout(() => {
    const panel = qltdPbDetailEnsurePanel();
    if (!panel) return;

    const context = qltdPbDetailGetContext();
    if (!context.projectCode || !context.deptCode || !context.masterTaskCode || !context.email) return;

    if (qltdPbDetailState.contextKey !== context.key) {
      qltdPbDetailLoad(false);
    } else if (!qltdPbDetailState.loading) {
      qltdPbDetailRender();
    }
  }, delay);
}

function qltdPbDetailBoot() {
  qltdPbDetailEnsureStyles();

  const observer = new MutationObserver(() => qltdPbDetailScheduleMount());
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  document.addEventListener('change', (event) => {
    const id = event.target?.id || '';
    if (['projectSelector', 'deptSelector', 'weeklyMasterSelector'].includes(id)) {
      qltdPbDetailState.requestSeq += 1;
      qltdPbDetailState.contextKey = '';
      qltdPbDetailState.masterTask = null;
      qltdPbDetailState.detailTasks = [];
      qltdPbDetailScheduleMount(180);
    }
  }, true);

  qltdPbDetailScheduleMount(120);
  console.info(`[QLTD] PB_DETAIL UI loaded: ${QLTD_PB_DETAIL_UI_VERSION}`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', qltdPbDetailBoot, { once: true });
} else {
  qltdPbDetailBoot();
}
