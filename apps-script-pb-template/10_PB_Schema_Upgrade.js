/**
 * PB Utility V1 - Nang cap schema PB_DETAIL.
 *
 * Ham nay chi duoc chay thu cong boi Admin sau khi da backup file PB.
 * Khong tao trigger va khong tu dong chay khi mo file.
 */

function nangCapSchemaPBDetailV1() {
  if (!laAdminPBV1_()) {
    throw new Error('Ban khong co quyen Admin de nang cap schema PB.');
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  const summary = {
    schemaVersion: PBV1_CONFIG.SCHEMA_VERSION,
    processedSheets: 0,
    insertedColumns: 0,
    backfilledIds: 0,
    errors: []
  };

  try {
    const sheets = layDanhSachSheetPhongBanPBV1_();
    const detailTaskIdSet = taoTapDetailTaskIdPBV1_(sheets, summary);

    if (summary.errors.length) {
      throwUpgradeSchemaErrorPBV1_(summary);
    }

    sheets.forEach(sheet => {
      try {
        const beforeCols = sheet.getMaxColumns();
        damBaoDuCotHeThongPBV1_(sheet);
        const afterCols = sheet.getMaxColumns();
        summary.insertedColumns += Math.max(afterCols - beforeCols, 0);

        damBaoHeaderCotHeThongPBV1_(sheet);
        dinhDangNgayTienPBV1_(sheet);
        apDungValidationTrangThaiPBV1_(sheet);
        apDungValidationTienDoTrongSoPBV1_(sheet);
        anCotHeThongPBV1_(sheet);
        baoVeCotHeThongPBV1_(sheet);

        summary.backfilledIds += backfillDetailTaskIdSheetPBV1_(sheet, detailTaskIdSet, summary);
        summary.processedSheets += 1;
      } catch (error) {
        summary.errors.push({
          code: error && error.code ? error.code : 'SHEET_UPGRADE_FAILED',
          sheetName: sheet.getName(),
          message: error && error.message ? error.message : String(error)
        });
      }
    });

    if (summary.errors.length) {
      throwUpgradeSchemaErrorPBV1_(summary);
    }

    capNhatSchemaVersionPBV1_();
    console.log(JSON.stringify(summary));
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Da nang cap schema ${summary.schemaVersion}. Sheet: ${summary.processedSheets}, ID backfill: ${summary.backfilledIds}.`,
      'PB schema',
      8
    );

    return summary;
  } finally {
    lock.releaseLock();
  }
}

function taoTapDetailTaskIdPBV1_(sheets, summary) {
  const idSet = {};
  (sheets || []).forEach(sheet => {
    const lastRow = layLastDataRowPBV1_(sheet);
    if (lastRow < PBV1_CONFIG.DATA_START_ROW) return;

    const rowCount = lastRow - PBV1_CONFIG.DATA_START_ROW + 1;
    const values = sheet.getRange(PBV1_CONFIG.DATA_START_ROW, PBV1_CONFIG.COLUMNS.DETAIL_TASK_ID, rowCount, 1).getDisplayValues();
    values.forEach((row, index) => {
      const detailTaskId = String(row[0] || '').trim();
      if (!detailTaskId) return;
      const rowNumber = PBV1_CONFIG.DATA_START_ROW + index;
      if (idSet[detailTaskId]) {
        summary.errors.push({
          code: 'DETAIL_TASK_ID_DUPLICATED',
          detailTaskId,
          first: idSet[detailTaskId],
          duplicate: {
            sheetName: sheet.getName(),
            rowNumber
          }
        });
        return;
      }
      idSet[detailTaskId] = {
        sheetName: sheet.getName(),
        rowNumber
      };
    });
  });
  return idSet;
}

function backfillDetailTaskIdSheetPBV1_(sheet, detailTaskIdSet, summary) {
  const lastRow = layLastDataRowPBV1_(sheet);
  if (lastRow < PBV1_CONFIG.DATA_START_ROW) return 0;

  const rowCount = lastRow - PBV1_CONFIG.DATA_START_ROW + 1;
  const lastCol = layCotCuoiHeThongPBV1_();
  const values = sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 1, rowCount, lastCol).getValues();
  const detailTaskIdValues = sheet.getRange(PBV1_CONFIG.DATA_START_ROW, PBV1_CONFIG.COLUMNS.DETAIL_TASK_ID, rowCount, 1).getValues();
  const progressValues = sheet.getRange(PBV1_CONFIG.DATA_START_ROW, PBV1_CONFIG.COLUMNS.TIEN_DO, rowCount, 1).getValues();
  const projectCode = layCauHinhPBV1_('MA_DU_AN', 'PROJECT');
  const deptCode = layTenPhongBanTuSheetPBV1_(sheet) || sheet.getName();
  let changed = 0;

  values.forEach((row, index) => {
    const rowType = String(row[PBV1_CONFIG.COLUMNS.LOAI_DONG - 1] || '').trim();
    const parentMasterCode = String(row[PBV1_CONFIG.COLUMNS.MA_MASTER - 1] || '').trim();
    const detailTaskId = String(row[PBV1_CONFIG.COLUMNS.DETAIL_TASK_ID - 1] || '').trim();
    if (rowType !== PBV1_CONFIG.ROW_TYPES.PB_DETAIL || detailTaskId) return;

    const rowNumber = PBV1_CONFIG.DATA_START_ROW + index;
    if (!parentMasterCode) {
      summary.errors.push({
        code: 'PB_DETAIL_PARENT_REQUIRED',
        sheetName: sheet.getName(),
        rowNumber,
        message: 'PB_DETAIL thieu Ma cong viec Master tai cot N.'
      });
      return;
    }

    const nextId = taoDetailTaskIdKhongTrungPBV1_(projectCode, deptCode, detailTaskIdSet, sheet.getName(), rowNumber);
    detailTaskIdValues[index][0] = nextId;
    if (row[PBV1_CONFIG.COLUMNS.TIEN_DO - 1] === '' || row[PBV1_CONFIG.COLUMNS.TIEN_DO - 1] === null) {
      progressValues[index][0] = 0;
    }
    changed += 1;
  });

  if (changed && !summary.errors.length) {
    sheet.getRange(PBV1_CONFIG.DATA_START_ROW, PBV1_CONFIG.COLUMNS.DETAIL_TASK_ID, rowCount, 1).setValues(detailTaskIdValues);
    sheet.getRange(PBV1_CONFIG.DATA_START_ROW, PBV1_CONFIG.COLUMNS.TIEN_DO, rowCount, 1).setValues(progressValues);
  }
  return changed;
}

function taoDetailTaskIdKhongTrungPBV1_(projectCode, deptCode, detailTaskIdSet, sheetName, rowNumber) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const nextId = taoDetailTaskIdPBV1_(projectCode, deptCode);
    if (detailTaskIdSet[nextId]) continue;
    detailTaskIdSet[nextId] = {
      sheetName,
      rowNumber
    };
    return nextId;
  }
  const error = new Error('Khong sinh duoc DetailTaskId khong trung sau 5 lan thu.');
  error.code = 'DETAIL_TASK_ID_GENERATE_FAILED';
  throw error;
}

function capNhatSchemaVersionPBV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Cau_hinh_PB');
  if (!sheet) {
    const error = new Error('PB_CONFIG_SHEET_NOT_FOUND');
    error.code = 'PB_CONFIG_SHEET_NOT_FOUND';
    throw error;
  }

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const keys = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues() : [];
  let targetRow = 0;
  keys.forEach((row, index) => {
    if (String(row[0] || '').trim() === 'PB_SCHEMA_VERSION') targetRow = index + 2;
  });
  if (!targetRow) targetRow = sheet.getLastRow() + 1;

  sheet.getRange(targetRow, 1, 1, 2).setValues([[
    'PB_SCHEMA_VERSION',
    PBV1_CONFIG.SCHEMA_VERSION
  ]]);

  if (sheet.getMaxColumns() >= 4) {
    sheet.getRange(targetRow, 3, 1, 2).setValues([[
      'Phien ban schema PB',
      'Cap nhat boi nangCapSchemaPBDetailV1'
    ]]);
  }
}

function throwUpgradeSchemaErrorPBV1_(summary) {
  console.error(JSON.stringify(summary));
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Nang cap schema PB_DETAIL loi. So loi: ${summary.errors.length}. Xem Apps Script log.`,
      'PB schema',
      10
    );
  } catch (toastError) {}
  throw new Error(`Nang cap schema PB_DETAIL that bai. So loi: ${summary.errors.length}. Khong ghi PB_SCHEMA_VERSION.`);
}
