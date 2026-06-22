const LEADERSHIP_GUIDE = Object.freeze({
  title: 'Tài liệu hướng dẫn nhanh cho Ban lãnh đạo',
  description: 'Hướng dẫn xem Dashboard công việc, Dashboard phòng/ban, Dashboard ngân sách và Gantt để nhận diện vấn đề và ra quyết định nhanh.',
  viewUrl: 'https://drive.google.com/file/d/1AqOxJb7o_BjY5oV0V4Ew-IwSYx1kIoMZ/view?usp=drivesdk',
  downloadUrl: 'https://drive.google.com/uc?export=download&id=1AqOxJb7o_BjY5oV0V4Ew-IwSYx1kIoMZ'
});

function enhanceHelpPanelWithLeadershipGuide() {
  const panel = document.getElementById('web07HelpPanel');
  if (!panel || panel.querySelector('[data-leadership-guide="true"]')) return;

  const hostCard = panel.querySelector('.web07-card') || panel;
  const section = document.createElement('section');
  section.className = 'help-document-section';
  section.dataset.leadershipGuide = 'true';
  section.innerHTML = `
    <div class="help-document-heading">
      <div>
        <p class="exec-eyebrow">Tài liệu hướng dẫn theo đối tượng</p>
        <h2>Hướng dẫn sử dụng WebApp</h2>
        <p>Trước mắt phát hành tài liệu dành cho Ban lãnh đạo. Các tài liệu dành cho Trưởng/Phó phòng ban và Cán bộ nhân viên sẽ được bổ sung sau.</p>
      </div>
    </div>
    <article class="help-document-card">
      <div class="help-document-icon" aria-hidden="true">PDF</div>
      <div class="help-document-content">
        <span class="help-document-audience">BAN LÃNH ĐẠO</span>
        <h3>${LEADERSHIP_GUIDE.title}</h3>
        <p>${LEADERSHIP_GUIDE.description}</p>
        <div class="help-document-meta">
          <span>Phiên bản 1.0</span>
          <span>06 trang</span>
          <span>Cập nhật 22/06/2026</span>
        </div>
      </div>
      <div class="help-document-actions">
        <a class="help-document-button is-primary" href="${LEADERSHIP_GUIDE.viewUrl}" target="_blank" rel="noopener noreferrer">Mở tài liệu PDF</a>
        <a class="help-document-button" href="${LEADERSHIP_GUIDE.downloadUrl}" target="_blank" rel="noopener noreferrer">Tải PDF</a>
      </div>
    </article>`;

  hostCard.appendChild(section);
}

function scheduleHelpPanelEnhancement() {
  window.requestAnimationFrame(enhanceHelpPanelWithLeadershipGuide);
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
