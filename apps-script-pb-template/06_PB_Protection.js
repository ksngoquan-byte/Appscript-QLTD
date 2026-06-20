/**
 * PB Utility V1 - Ẩn/bảo vệ cột hệ thống
 */

function anVaBaoVeCotHeThongTatCaSheetPBV1() {
  const sheets = layDanhSachSheetPhongBanPBV1_();
  sheets.forEach(sheet => {
    anCotHeThongPBV1_(sheet);
    baoVeCotHeThongPBV1_(sheet);
  });
  SpreadsheetApp.getUi().alert(`Đã ẩn/bảo vệ cột N:R cho ${sheets.length} sheet phòng/ban.`);
}

function anCotHeThongPBV1_(sheet) {
  try {
    sheet.hideColumns(PBV1_CONFIG.SYSTEM_START_COL, PBV1_CONFIG.SYSTEM_COL_COUNT);
  } catch (err) {
    console.warn(`Không ẩn được cột N:R tại ${sheet.getName()}: ${err.message}`);
  }
}

function baoVeCotHeThongPBV1_(sheet) {
  const oldDesc = 'PBV1_PROTECT_SYSTEM_COLUMNS_N_O';
  const desc = 'PBV1_PROTECT_SYSTEM_COLUMNS_N_R';
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  protections.forEach(p => {
    if (p.getDescription() === desc || p.getDescription() === oldDesc) {
      try { p.remove(); } catch (err) {}
    }
  });

  const range = sheet.getRange(1, PBV1_CONFIG.SYSTEM_START_COL, sheet.getMaxRows(), PBV1_CONFIG.SYSTEM_COL_COUNT);
  const protection = range.protect();
  protection.setDescription(desc);
  protection.setWarningOnly(false);

  try { if (protection.canDomainEdit()) protection.setDomainEdit(false); } catch (err) {}
  try {
    const editors = protection.getEditors();
    if (editors && editors.length) protection.removeEditors(editors);
  } catch (err) {}
  try {
    protection.addEditors(PBV1_CONFIG.ADMIN_EMAILS);
  } catch (err) {
    console.warn(`Không thêm được admin editor cho protection tại ${sheet.getName()}: ${err.message}`);
  }
}
