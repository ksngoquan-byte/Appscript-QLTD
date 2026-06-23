(() => {
  'use strict';

  function ensureBrandStyles() {
    if (document.getElementById('qltdBrandLogoStyles')) return;

    const style = document.createElement('style');
    style.id = 'qltdBrandLogoStyles';
    style.textContent = `
      #loginView .entiz-logo {
        object-fit: contain;
        filter: brightness(0) invert(1) drop-shadow(0 12px 28px rgba(8,45,124,.12));
      }

      .topbar-logo {
        object-fit: contain;
      }
    `;

    document.head.appendChild(style);
  }

  function applyBrandLogo() {
    ensureBrandStyles();

    document.querySelectorAll('.entiz-logo, .topbar-logo').forEach((image) => {
      image.src = './entiz-logo.svg?v=ENTIZ_SELF_CONTAINED_1';
      image.removeAttribute('srcset');
      image.dataset.qltdBrandLogo = 'self-contained-v1';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBrandLogo, { once: true });
  } else {
    applyBrandLogo();
  }
})();
