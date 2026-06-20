/**
 * PB Utility V1 - Tạo/xóa nhóm WBS
 */

function taoLaiNhomWbsSheetHienTaiPBV1() {
  const sheet = laySheetHienTaiHopLePBV1_();
  if (!sheet) return;
  taoLaiNhomWbsSheetPBV1_(sheet, true);
}

function taoLaiNhomWbsTatCaSheetPhongBanPBV1() {
  const sheets = layDanhSachSheetPhongBanPBV1_();
  sheets.forEach(sheet => taoLaiNhomWbsSheetPBV1_(sheet, false));
  SpreadsheetApp.getUi().alert(`Đã tạo lại nhóm WBS cho ${sheets.length} sheet phòng/ban.`);
}

function xoaNhomWbsSheetHienTaiPBV1() {
  const sheet = laySheetHienTaiHopLePBV1_();
  if (!sheet) return;
  xoaNhomWbsSheetPBV1_(sheet);
  SpreadsheetApp.getUi().alert(`Đã xóa nhóm WBS sheet: ${sheet.getName()}`);
}

function xoaNhomWbsTatCaSheetPhongBanPBV1() {
  const sheets = layDanhSachSheetPhongBanPBV1_();
  sheets.forEach(sheet => xoaNhomWbsSheetPBV1_(sheet));
  SpreadsheetApp.getUi().alert(`Đã xóa nhóm WBS cho ${sheets.length} sheet phòng/ban.`);
}

function taoLaiNhomWbsSheetPBV1_(sheet, showAlert) {
  const lastRow = layLastDataRowPBV1_(sheet);
  xoaNhomWbsSheetPBV1_(sheet, lastRow);
  if (lastRow < PBV1_CONFIG.DATA_START_ROW) {
    if (showAlert) SpreadsheetApp.getUi().alert('Sheet hiện tại chưa có dữ liệu để tạo nhóm WBS.');
    return;
  }

  const wbsValues = sheet.getRange(PBV1_CONFIG.DATA_START_ROW, PBV1_CONFIG.COLUMNS.WBS, lastRow - PBV1_CONFIG.DATA_START_ROW + 1, 1)
    .getDisplayValues()
    .map(r => r[0]);

  const rows = wbsValues.map((wbs, idx) => ({ row: PBV1_CONFIG.DATA_START_ROW + idx, wbs, level: layCapWbsPBV1_(wbs) }));
  const groups = [];

  rows.forEach((item, idx) => {
    if (!item.level) return;
    let endRow = lastRow;
    for (let j = idx + 1; j < rows.length; j++) {
      const next = rows[j];
      if (next.level && next.level <= item.level) {
        endRow = next.row - 1;
        break;
      }
    }
    const startGroupRow = item.row + 1;
    const numRows = endRow - startGroupRow + 1;
    if (numRows > 0) groups.push({ startRow: startGroupRow, numRows, level: item.level });
  });

  groups.sort((a, b) => a.level - b.level || a.startRow - b.startRow).forEach(g => {
    try {
      sheet.getRange(g.startRow, 1, g.numRows, sheet.getMaxColumns()).shiftRowGroupDepth(1);
    } catch (err) {
      console.warn(`Không tạo được group tại ${sheet.getName()} row ${g.startRow}, numRows ${g.numRows}: ${err.message}`);
    }
  });

  try { sheet.expandRowGroupsUpToDepth(8); } catch (err) {}
  if (showAlert) SpreadsheetApp.getUi().alert(`Đã tạo lại ${groups.length} nhóm WBS cho sheet: ${sheet.getName()}`);
}

function xoaNhomWbsSheetPBV1_(sheet, lastDataRow) {
  try { sheet.expandRowGroupsUpToDepth(8); } catch (err) {}
  const lastRow = lastDataRow || layLastDataRowPBV1_(sheet);
  if (lastRow < PBV1_CONFIG.DATA_START_ROW) return;
  const numRows = lastRow - PBV1_CONFIG.DATA_START_ROW + 1;
  const dataRange = sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 1, numRows, sheet.getMaxColumns());
  for (let depth = 8; depth >= 1; depth--) {
    try { dataRange.shiftRowGroupDepth(-1); } catch (err) {}
  }
}
