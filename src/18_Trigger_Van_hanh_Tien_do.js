/*******************************************************
 * FILE: 18_Trigger_Van_hanh_Tien_do.js
 *
 * MUC TIEU
 * - Cai/cai lai trigger van hanh sau khi tao ban sao file.
 * - Khong cai trung trigger cung muc dich.
 *******************************************************/

const TRIGGER_VAN_HANH_TIEN_DO_V1 = {
  HANDLERS_TO_REMOVE: [
    'scheduleLinkFormulaOnEditV1',
    'scheduleLinkFormulaOnChangeV1',
    'xuLyCapNhatThucTeTienDoOnEditV1',
    'scheduleAutoOnEditV1',
    'xuLySuaScheduleEngineV1',
    'scheduleEngineOnEditV1',
    'runScheduler',
    'runScheduleEngineV1',
    'validatePlanning',
    'checkDependencyGraph',
    'runFullPipeline',
    'refRelinkOnChangeV1',
    'refSnapshotOnEditV1'
  ]
};

function caiDatTriggerVanHanhTienDoV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Khong tim thay spreadsheet hien tai.');

  const removed = xoaTriggerVanHanhTienDoV1_(
    TRIGGER_VAN_HANH_TIEN_DO_V1.HANDLERS_TO_REMOVE
  );
  const installed = [];
  const skipped = [];

  Logger.log('[TRIGGER] Da xoa trigger cu: ' + (removed.length ? removed.join(', ') : 'khong co'));

  if (typeof caiTriggerLinkFormulaConverterV1 === 'function') {
    Logger.log('[TRIGGER] Cai Link Formula Converter V1.');
    caiTriggerLinkFormulaConverterV1();
    installed.push('scheduleLinkFormulaOnEditV1:onEdit');
    installed.push('scheduleLinkFormulaOnChangeV1:onChange');
  } else {
    skipped.push('caiTriggerLinkFormulaConverterV1: khong ton tai');
  }

  if (typeof taoTriggerCapNhatThucTeTienDoV1 === 'function') {
    Logger.log('[TRIGGER] Cai trigger cap nhat thuc te tien do.');
    taoTriggerCapNhatThucTeTienDoV1();
    installed.push('xuLyCapNhatThucTeTienDoOnEditV1:onEdit');
  } else {
    skipped.push('taoTriggerCapNhatThucTeTienDoV1: khong ton tai');
  }

  const message =
    'Da cai/cai lai trigger van hanh tien do.\n' +
    'Da xoa: ' + (removed.length ? removed.join(', ') : 'khong co') + '\n' +
    'Da cai: ' + (installed.length ? installed.join(', ') : 'khong co') + '\n' +
    'Bo qua: ' + (skipped.length ? skipped.join(', ') : 'khong co') + '\n' +
    'Khong cai scheduleAutoOnEditV1/xuLySuaScheduleEngineV1 de tranh trung onEdit voi Link Formula Converter.';

  Logger.log(message);
  return message;
}

function xoaTriggerVanHanhTienDoV1_(handlersToRemove) {
  const removed = [];
  const handlerSet = {};

  handlersToRemove.forEach(function(handler) {
    handlerSet[handler] = true;
  });

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction();
    if (!handlerSet[handler]) return;

    ScriptApp.deleteTrigger(trigger);
    removed.push(handler);
  });

  return removed;
}
