/**
 * PB Utility V1 - Filter và Freeze
 */

function apDungFilterFreezePBV1_(sheet) {
  sheet.setFrozenRows(PBV1_CONFIG.HEADER_ROW);
  const lastRow = Math.max(layLastDataRowPBV1_(sheet), PBV1_CONFIG.HEADER_ROW);
  const filterRange = sheet.getRange(PBV1_CONFIG.HEADER_ROW, 1, Math.max(lastRow - PBV1_CONFIG.HEADER_ROW + 1, 1), PBV1_CONFIG.DISPLAY_LAST_COL);
  const oldFilter = sheet.getFilter();
  if (oldFilter) oldFilter.remove();
  filterRange.createFilter();
}
