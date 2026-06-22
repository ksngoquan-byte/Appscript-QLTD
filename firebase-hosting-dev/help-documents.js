const HELP_GUIDES = Object.freeze([
  Object.freeze({
    audience: 'BAN LÃNH ĐẠO',
    title: 'Tài liệu hướng dẫn nhanh cho Ban lãnh đạo',
    description: 'Hướng dẫn xem Dashboard công việc, Dashboard phòng/ban, Dashboard ngân sách và Gantt để nhận diện vấn đề và ra quyết định nhanh.',
    version: '1.0',
    pages: '06 trang',
    updatedAt: '22/06/2026',
    viewUrl: 'https://drive.google.com/file/d/1AqOxJb7o_BjY5oV0V4Ew-IwSYx1kIoMZ/view?usp=drivesdk',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=1AqOxJb7o_BjY5oV0V4Ew-IwSYx1kIoMZ'
  }),
  Object.freeze({
    audience: 'TRƯỞNG/PHÓ PHÒNG BAN',
    title: 'Tài liệu hướng dẫn nhanh cho Trưởng/Phó phòng ban',
    description: 'Hướng dẫn nhận mục tiêu Master, phân rã và giao công việc chi tiết, theo dõi Dashboard/Gantt, cập nhật báo cáo tuần và kiểm soát ngân sách gắn công việc.',
    version: '2.1',
    pages: '11 trang',
    updatedAt: '22/06/2026',
    viewUrl: 'https://drive.google.com/file/d/1x8F6n0tpNuNKfJDSO4RKiDFRmjqdbnvH/view?usp=drivesdk',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=1x8F6n0tpNuNKfJDSO4RKiDFRmjqdbnvH'
  })
]);

function renderHelpGuideCard(guide) {
  return `
    <article class="help-document-card">
      <div class="help-document-icon" aria-hidden="true">PDF</div>
      <div class="help-document-content">
        <span class="help-document-audience">${guide.audience}</span>
        <h3>${guide.title}</h3>
        <p>${guide.description}</p>
        <div class="help-document-meta">
          <span>Phiên bản ${guide.version}</span>
          <span>${guide.pages}</span>
          <span>Cập nhật ${guide.updatedAt}</span>
        </div>
      </div>
      <div class="help-document-actions">
        <a class="help-document-button is-primary" href="${guide.viewUrl}" target="_blank" rel="noopener noreferrer">Mở tài liệu PDF</a>
        <a class="help-document-button" href="${guide.downloadUrl}" target="_blank" rel="noopener noreferrer">Tải PDF</a>
      </div>
    </article>`;
}

function enhanceHelpPanelWithAudienceGuides() {
  const panel = document.getElementById('web07HelpPanel');
  if (!panel || panel.querySelector('[data-help-guides="true"]')) return;

  const hostCard = panel.querySelector('.web07-card') || panel;
  const section = document.createElement('section');
  section.className = 'help-document-section';
  section.dataset.helpGuides = 'true';
  section.innerHTML = `
    <div class="help-document-heading">
      <div>
        <p class="exec-eyebrow">Tài liệu hướng dẫn theo đối tượng</p>
        <h2>Hướng dẫn sử dụng WebApp</h2>
        <p>Hiện có tài liệu dành cho Ban lãnh đạo và Trưởng/Phó phòng ban. Tài liệu dành cho Cán bộ nhân viên sẽ được bổ sung sau.</p>
      </div>
    </div>
    <div class="help-document-list">
      ${HELP_GUIDES.map(renderHelpGuideCard).join('')}
    </div>`;

  hostCard.appendChild(section);
}

function scheduleHelpPanelEnhancement() {
  window.requestAnimationFrame(enhanceHelpPanelWithAudienceGuides);
}

document.addEventListener('DOMContentLoaded', scheduleHelpPanelEnhancement);
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('button, a, [role="button"]')) scheduleHelpPanelEnhancement();
});

const helpPanelObserver = new MutationObserver(scheduleHelpPanelEnhancement);
helpPanelObserver.observe(document.documentElement, { childList: true, subtree: true });

scheduleHelpPanelEnhancement();
