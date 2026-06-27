(() => {
  'use strict';

  const ACTIVE_CLASS = 'qltd-nav-active';
  const DEFAULT_NAV_LABEL = 'Dashboard công việc';
  let lastRequestedNavLabel = DEFAULT_NAV_LABEL;
  let scheduled = false;

  const ICONS = {
    total: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 4.5h6V7H9z"></path><path d="M9 11h6M9 15h6"></path></svg>',
    completed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8.2 12.2 2.5 2.5 5.4-5.6"></path></svg>',
    progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l2.4-7 4.2 14 2.5-7H21"></path></svg>',
    notStarted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.2 2"></path></svg>',
    overdue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.8a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4M12 17h.01"></path></svg>',
    dueSoon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="15" height="16" rx="2"></rect><path d="M7 2.5v4M14 2.5v4M3 9h15"></path><circle cx="18" cy="17" r="4"></circle><path d="M18 15v2.2l1.4.8"></path></svg>',
    milestone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"></path><path d="M5 5h10l-1.7 3L15 11H5"></path></svg>'
  };

  function normalizeText(value) {
    return String(value || '')
      .trim()
      .toLocaleLowerCase('vi-VN')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\s+/g, ' ');
  }

  function getIconKey(label) {
    const value = normalizeText(label);
    if (!value) return '';
    if (value.includes('den han 14 ngay') || value.includes('deadline 14 ngay')) return 'dueSoon';
    if (value.includes('moc lon')) return 'milestone';
    if (value === 'qua han' || value.startsWith('qua han ')) return 'overdue';
    if (value.includes('chua bat dau')) return 'notStarted';
    if (value.includes('dang thuc hien')) return 'progress';
    if (value === 'hoan thanh' || value.startsWith('hoan thanh ')) return 'completed';
    if (value.includes('tong cong viec') || value.includes('tong viec duoc giao')) return 'total';
    return '';
  }

  function getCardIconKey(card) {
    const labelNodes = card.querySelectorAll('[data-kpi-label], .kpi-label, .metric-label, span');
    for (const node of labelNodes) {
      const key = getIconKey(node.textContent);
      if (key) return key;
    }
    return getIconKey(card.textContent);
  }

  function ensureIconContainer(card) {
    let icon = card.querySelector('.exec-kpi-icon, .dept-kpi-icon, .department-kpi-icon, .kpi-icon, [data-kpi-icon]');
    if (!icon) {
      icon = document.createElement('div');
      icon.className = 'exec-kpi-icon';
      card.insertBefore(icon, card.firstChild);
    }
    icon.classList.add('qltd-kpi-icon');
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  function decorateKpiCard(card) {
    const iconKey = getCardIconKey(card);
    if (!iconKey || !ICONS[iconKey]) return;

    const icon = ensureIconContainer(card);
    if (icon.dataset.qltdIcon === iconKey) return;

    icon.dataset.qltdIcon = iconKey;
    icon.innerHTML = ICONS[iconKey];
    card.dataset.qltdKpiIcon = iconKey;
  }

  function decorateAllKpis() {
    document.querySelectorAll([
      '.exec-kpi-card',
      '.exec-kpi-grid > article',
      '.dept-kpi-card',
      '.department-kpi-card',
      '.dashboard-kpi-card',
      '[class*="kpi-card"]'
    ].join(',')).forEach(decorateKpiCard);
  }

  function isPanelVisible(selector) {
    const panel = document.querySelector(selector);
    if (!panel || panel.hidden || panel.classList.contains('hidden')) return false;
    return window.getComputedStyle(panel).display !== 'none';
  }

  function labelFromCurrentView() {
    if (isPanelVisible('#web07BudgetDashboardPanel')) return 'Dashboard ngân sách';
    if (isPanelVisible('#web07GanttPanel')) return 'Gantt';
    if (isPanelVisible('#web07HelpPanel')) return 'Hướng dẫn sử dụng';
    if (isPanelVisible('#deptPlanPanel')) return 'Lập & cập nhật công việc';
    if (isPanelVisible('#web07AdminPanel') || isPanelVisible('#adminApprovalPanel')) return 'Admin';
    if (isPanelVisible('#web07DashboardPanel')) return 'Dashboard công việc';

    const body = document.body.classList;
    if (body.contains('qltd-budget-mode')) return 'Dashboard ngân sách';
    if (body.contains('qltd-gantt-mode')) return 'Gantt';
    if (body.contains('qltd-help-mode')) return 'Hướng dẫn sử dụng';
    if (body.contains('qltd-report-mode')) return 'Lập & cập nhật công việc';
    if (body.contains('qltd-admin-mode')) return 'Admin';
    if (body.contains('qltd-dashboard-mode')) return 'Dashboard công việc';
    return lastRequestedNavLabel || DEFAULT_NAV_LABEL;
  }

  function syncMainNavigation() {
    const activeLabel = normalizeText(labelFromCurrentView());
    document.querySelectorAll('nav.tabs button').forEach((button) => {
      const isActive = normalizeText(button.textContent) === activeLabel;
      button.classList.toggle(ACTIVE_CLASS, isActive);
      button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }

  function runEnhancements() {
    scheduled = false;
    decorateAllKpis();
    syncMainNavigation();
  }

  function scheduleEnhancements() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(runEnhancements);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('nav.tabs button');
    if (!button) return;
    lastRequestedNavLabel = String(button.textContent || '').trim() || DEFAULT_NAV_LABEL;
    window.setTimeout(scheduleEnhancements, 0);
    window.setTimeout(scheduleEnhancements, 80);
  }, true);

  const observer = new MutationObserver(scheduleEnhancements);

  function start() {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden']
    });
    scheduleEnhancements();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
