(() => {
  'use strict';

  function ensureBrandStyles() {
    if (document.getElementById('qltdBrandLogoStyles')) return;

    const style = document.createElement('style');
    style.id = 'qltdBrandLogoStyles';
    style.textContent = `
      #loginView .entiz-logo {
        object-fit: contain;
        filter: none;
      }

      .topbar-logo {
        object-fit: contain;
        filter: none;
      }
    `;

    document.head.appendChild(style);
  }

  function applyBrandLogo() {
    ensureBrandStyles();

    document.querySelectorAll('.entiz-logo, .topbar-logo').forEach((image) => {
      image.src = './entiz-logo.png?v=ENTIZ_OFFICIAL_PNG_1';
      image.removeAttribute('srcset');
      image.alt = '';
      image.dataset.qltdBrandLogo = 'official-png-v1';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBrandLogo, { once: true });
  } else {
    applyBrandLogo();
  }
})();
