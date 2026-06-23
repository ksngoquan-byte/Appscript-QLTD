(() => {
  'use strict';
  Promise.all([
    import('./brand-logo.js?v=ENTIZ_LOGO_SELF_CONTAINED_1'),
    import('./ui-polish-core.js?v=UI_KPI_ICON_1'),
    import('./registration-gate.js?v=AUTH_REGISTRATION_V2')
  ]).catch((error) => console.error('Cannot load UI extensions', error));
})();
