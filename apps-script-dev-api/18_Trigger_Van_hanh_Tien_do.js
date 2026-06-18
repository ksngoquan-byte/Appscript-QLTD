/*******************************************************
 * FILE: 18_Trigger_Van_hanh_Tien_do.js
 *
 * MUC TIEU
 * - Wrapper tuong thich nguoc cho menu/ham cu.
 * - Tu nay chi cai trigger toi uu:
 *   1) onEdit nhe: xuLySuaScheduleEngineV1
 *   2) onChange cau truc: xuLyThayDoiCauTrucScheduleV1
 * - Khong cai cac trigger cu co the chay engine truc tiep.
 *******************************************************/

function caiDatTriggerVanHanhTienDoV1() {
  const results = [];

  if (typeof caiTriggerScheduleEngineV1 === 'function') {
    results.push(caiTriggerScheduleEngineV1());
  } else {
    results.push('Thieu ham caiTriggerScheduleEngineV1');
  }

  if (typeof caiTriggerThayDoiCauTrucScheduleV1 === 'function') {
    results.push(caiTriggerThayDoiCauTrucScheduleV1());
  } else {
    results.push('Thieu ham caiTriggerThayDoiCauTrucScheduleV1');
  }

  const message =
    'Da cai trigger van hanh tien do theo kien truc toi uu.\n' +
    '- onEdit nhe: danh dau dirty flag, khong chay engine truc tiep.\n' +
    '- onChange cau truc: bat them/bot hang/cot va danh dau can tinh lai.\n' +
    '- Trigger nen 10 phut khong tu bat; bat rieng neu can.\n\n' +
    results.join('\n');

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
