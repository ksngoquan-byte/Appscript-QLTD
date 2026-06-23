(() => {
  'use strict';
  Promise.all([
    import('./brand-logo.js?v=ENTIZ_OFFICIAL_PNG_2'),
    import('./ui-polish-core.js?v=UI_KPI_ICON_1'),
    import('./registration-gate.js?v=AUTH_REGISTRATION_V3')
  ]).catch((error) => console.error('Cannot load UI extensions', error));
})();
