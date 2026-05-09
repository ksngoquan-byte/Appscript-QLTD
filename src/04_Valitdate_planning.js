function kiemTraKeHoach() {
  try {
    chayScheduleEngineV1();
    SpreadsheetApp.getUi().alert('Da validate Schedule Engine V1. Xem loi tai cot Q.');
  } catch (err) {
    ghiLogLoi_('kiemTraKeHoach: ' + err);
    throw err;
  }
}

function kiemTraTatCaTienNhiem_() {
  chayScheduleEngineV1();
  return [];
}

function kiemTraVongLapDependency() {
  try {
    chayScheduleEngineV1();
    SpreadsheetApp.getUi().alert('Da kiem tra dependency. Neu co vong lap, ma ERR_CYCLE se nam o cot Q.');
  } catch (err) {
    ghiLogLoi_('kiemTraVongLapDependency: ' + err);
    throw err;
  }
}

function chayToanBo() {
  try {
    ghiLogThongTin_('Start full pipeline V1');

    capMaCongViec();
    chayScheduleEngineV1();

    ghiLogThongTin_('Done full pipeline V1');
  } catch (err) {
    ghiLogLoi_('chayToanBo: ' + err);
    throw err;
  }
}
