/**
 * STEP4B3 - Budget Master schema helpers.
 *
 * Phạm vi:
 * - Chỉ kiểm tra/sửa schema ngân sách trên file Master/PB được truyền bằng spreadsheetId.
 * - Không chạy registry-wide, không tạo trigger, không ghi dữ liệu mẫu.
 * - Không sửa WEEKLY/Central/Dashboard/Gantt/CPM/baseline logic.
 */

const QLTD_BUDGET_MASTER_SCHEMA_V1 = {
  HEADER_ROW: 4,
  START_ROW: 5,
  TASK_MIN_COLUMNS: 30,
  TASK_SHEETS: ['Cong_viec', '_TEMPLATE_Cong_viec'],
  TASK_TAIL_HEADERS: {
    26: 'WBS_LEVEL_SYS',
    27: '',
    28: 'Trần chi phí trực tiếp',
    29: 'Dự thu kế hoạch',
    30: 'Trạng thái ngân sách'
  },
  TASK_WIDTHS: {
    26: { value: 120, min: 100, max: 140 },
    27: { value: 14, min: 1, max: 24 },
    28: { value: 150, min: 135, max: 165 },
    29: { value: 135, min: 120, max: 150 },
    30: { value: 145, min: 130, max: 160 }
  },
  BUDGET_STATUS_VALUES: ['Nháp', 'Đã chốt', 'Khóa'],
  FLOW_VALUES: ['THU', 'CHI'],
  NS_SHEET: 'NS_Khong_Gan_CV',
  NS_HEADERS: [
    'STT',
    'Mã nguồn ngân sách',
    'Tên nguồn ngân sách',
    'Nhóm ngân sách',
    'Phòng/Ban chủ trì',
    'Hướng dòng tiền',
    'Giá trị kế hoạch',
    'Trạng thái ngân sách',
    'Ghi chú'
  ],
  NS_WIDTHS: {
    1: { value: 55, min: 40, max: 80 },
    2: { value: 145, min: 115, max: 180 },
    3: { value: 260, min: 180, max: 320 },
    4: { value: 150, min: 110, max: 190 },
    5: { value: 160, min: 120, max: 210 },
    6: { value: 125, min: 90, max: 150 },
    7: { value: 150, min: 115, max: 180 },
    8: { value: 145, min: 110, max: 180 },
    9: { value: 260, min: 160, max: 340 }
  }
};

function qltdBudgetMasterSchemaInspect_(spreadsheetId) {
  qltdBudgetMasterSchemaLog_('INSPECT start spreadsheetId=' + spreadsheetId);
  return qltdBudgetMasterSchemaInspectCore_(spreadsheetId);
}

function qltdBudgetMasterSchemaDryRun_(spreadsheetId) {
  qltdBudgetMasterSchemaLog_('DRY_RUN start spreadsheetId=' + spreadsheetId);
  const inspection = qltdBudgetMasterSchemaInspectCore_(spreadsheetId);
  qltdBudgetMasterSchemaLog_('DRY_RUN done status=' + inspection.status + ' actions=' + inspection.actions.length + ' errors=' + inspection.errors.length);
  return qltdBudgetMasterSchemaResponse_('budget_master_schema_dry_run', true, inspection);
}

function qltdBudgetMasterSchemaEnsure_(spreadsheetId, options) {
  const opts = options || {};
  qltdBudgetMasterSchemaLog_('ENSURE start spreadsheetId=' + spreadsheetId + ' dryRun=' + (opts.dryRun === true));
  const before = qltdBudgetMasterSchemaInspectCore_(spreadsheetId);
  if (!before.success) {
    qltdBudgetMasterSchemaLog_('ENSURE blocked before apply errors=' + before.errors.length);
    return qltdBudgetMasterSchemaResponse_('budget_master_schema_ensure', false, before);
  }

  if (!before.actions.length) {
    qltdBudgetMasterSchemaLog_('ENSURE no change spreadsheetId=' + spreadsheetId);
    return qltdBudgetMasterSchemaResponse_('budget_master_schema_ensure', false, before);
  }

  if (opts.dryRun === true) {
    qltdBudgetMasterSchemaLog_('ENSURE dryRun actions=' + before.actions.length);
    return qltdBudgetMasterSchemaResponse_('budget_master_schema_ensure', true, before);
  }

  const ss = qltdBudgetMasterSchemaOpenSpreadsheet_(spreadsheetId);
  const appliedActions = [];
  let current = before;
  for (let pass = 0; pass < 3 && current.success && current.actions.length; pass++) {
    qltdBudgetMasterSchemaApplyActions_(ss, current.actions);
    appliedActions.push.apply(appliedActions, current.actions);
    SpreadsheetApp.flush();
    current = qltdBudgetMasterSchemaInspectCore_(spreadsheetId);
  }

  const after = qltdBudgetMasterSchemaInspectCore_(spreadsheetId);
  qltdBudgetMasterSchemaLog_('ENSURE done status=' + after.status + ' appliedActions=' + appliedActions.length + ' remainingActions=' + after.actions.length + ' errors=' + after.errors.length);
  return qltdBudgetMasterSchemaResponse_('budget_master_schema_ensure', false, after, appliedActions);
}

function qltdBudgetMasterSchemaInspectCore_(spreadsheetId) {
  const result = {
    success: true,
    status: 'NO_CHANGE',
    spreadsheetId: spreadsheetId,
    spreadsheetName: '',
    generatedAt: new Date().toISOString(),
    actions: [],
    errors: [],
    warnings: [],
    sheets: {}
  };

  let ss;
  try {
    ss = qltdBudgetMasterSchemaOpenSpreadsheet_(spreadsheetId);
    result.spreadsheetName = ss.getName();
  } catch (err) {
    result.success = false;
    result.status = 'BLOCKED';
    result.errors.push(qltdBudgetMasterSchemaError_('OPEN_SPREADSHEET_FAILED', String(err && err.message ? err.message : err)));
    return result;
  }

  QLTD_BUDGET_MASTER_SCHEMA_V1.TASK_SHEETS.forEach(function(sheetName) {
    qltdBudgetMasterSchemaInspectTaskSheet_(ss, sheetName, result);
  });

  qltdBudgetMasterSchemaInspectNsSheet_(ss, result);

  if (result.errors.length) {
    result.success = false;
    result.status = 'BLOCKED';
  } else if (result.actions.length) {
    result.status = 'CHANGE_REQUIRED';
  }

  return result;
}

function qltdBudgetMasterSchemaInspectTaskSheet_(ss, sheetName, result) {
  const schema = QLTD_BUDGET_MASTER_SCHEMA_V1;
  const sheet = ss.getSheetByName(sheetName);
  const sheetResult = {
    exists: !!sheet,
    maxColumns: 0,
    maxRows: 0,
    actions: [],
    errors: []
  };
  result.sheets[sheetName] = sheetResult;

  if (!sheet) {
    sheetResult.errors.push(qltdBudgetMasterSchemaError_('TASK_SHEET_MISSING', sheetName + ' không tồn tại.'));
    result.errors = result.errors.concat(sheetResult.errors);
    return;
  }

  sheetResult.maxColumns = sheet.getMaxColumns();
  sheetResult.maxRows = sheet.getMaxRows();

  if (sheetResult.maxColumns < 26) {
    sheetResult.errors.push(qltdBudgetMasterSchemaError_('TASK_TOO_FEW_COLUMNS', sheetName + ' có ít hơn 26 cột, không thể xác nhận Z=WBS_LEVEL_SYS.'));
    result.errors = result.errors.concat(sheetResult.errors);
    return;
  }

  if (sheetResult.maxColumns < schema.TASK_MIN_COLUMNS) {
    qltdBudgetMasterSchemaAddAction_(result, sheetResult, {
      type: 'TASK_INSERT_COLUMNS',
      sheetName: sheetName,
      afterColumn: sheetResult.maxColumns,
      count: schema.TASK_MIN_COLUMNS - sheetResult.maxColumns
    });
  }

  const headerWidth = Math.max(schema.TASK_MIN_COLUMNS, sheetResult.maxColumns);
  const headers = qltdBudgetMasterSchemaReadHeaderRow_(sheet, headerWidth);
  const duplicateErrors = qltdBudgetMasterSchemaFindDuplicateHeaders_(headers, sheetName);
  sheetResult.errors = sheetResult.errors.concat(duplicateErrors);

  const wbsPositions = qltdBudgetMasterSchemaFindHeaderPositions_(headers, 'WBS_LEVEL_SYS');
  if (wbsPositions.length !== 1 || wbsPositions[0] !== 26) {
    sheetResult.errors.push(qltdBudgetMasterSchemaError_(
      'WBS_LEVEL_SYS_NOT_AT_Z',
      sheetName + ' phải có WBS_LEVEL_SYS duy nhất tại cột Z. Hiện tại: ' + JSON.stringify(wbsPositions)
    ));
  }

  qltdBudgetMasterSchemaValidateExpectedTaskHeader_(headers, sheetName, 27, '', sheetResult);
  qltdBudgetMasterSchemaValidateExpectedTaskHeader_(headers, sheetName, 28, 'Trần chi phí trực tiếp', sheetResult);
  qltdBudgetMasterSchemaValidateExpectedTaskHeader_(headers, sheetName, 29, 'Dự thu kế hoạch', sheetResult);
  qltdBudgetMasterSchemaValidateExpectedTaskHeader_(headers, sheetName, 30, 'Trạng thái ngân sách', sheetResult);

  if (sheetResult.errors.length) {
    result.errors = result.errors.concat(sheetResult.errors);
    return;
  }

  Object.keys(schema.TASK_TAIL_HEADERS).forEach(function(colText) {
    const col = Number(colText);
    const expected = schema.TASK_TAIL_HEADERS[col];
    const current = qltdBudgetMasterSchemaNormalizeText_(headers[col - 1]);
    if (current !== qltdBudgetMasterSchemaNormalizeText_(expected)) {
      qltdBudgetMasterSchemaAddAction_(result, sheetResult, {
        type: 'TASK_SET_HEADER',
        sheetName: sheetName,
        row: schema.HEADER_ROW,
        column: col,
        value: expected
      });
    }
  });

  if (sheetResult.maxColumns < schema.TASK_MIN_COLUMNS) {
    return;
  }

  qltdBudgetMasterSchemaInspectTaskBody_(sheet, sheetName, result, sheetResult);
}

function qltdBudgetMasterSchemaInspectTaskBody_(sheet, sheetName, result, sheetResult) {
  const schema = QLTD_BUDGET_MASTER_SCHEMA_V1;
  const bodyRows = Math.max(0, sheet.getMaxRows() - schema.START_ROW + 1);
  if (!bodyRows) {
    return;
  }

  const invalidStatus = qltdBudgetMasterSchemaFindInvalidValues_(sheet, schema.START_ROW, 30, bodyRows, schema.BUDGET_STATUS_VALUES);
  if (invalidStatus.length) {
    sheetResult.errors.push(qltdBudgetMasterSchemaError_(
      'TASK_BUDGET_STATUS_INVALID_VALUES',
      sheetName + '!AD có giá trị ngoài danh sách Nháp/Đã chốt/Khóa: ' + invalidStatus.slice(0, 10).join(', ')
    ));
    result.errors = result.errors.concat(sheetResult.errors);
    return;
  }

  if (!qltdBudgetMasterSchemaColumnHidden_(sheet, 26)) {
    qltdBudgetMasterSchemaAddAction_(result, sheetResult, {
      type: 'TASK_HIDE_COLUMN',
      sheetName: sheetName,
      column: 26
    });
  }

  qltdBudgetMasterSchemaInspectNumberFormat_(sheet, sheetName, sheetResult, result, schema.START_ROW, 28, bodyRows, 2, '#,##0', 'TASK_FORMAT_NUMBER');
  qltdBudgetMasterSchemaInspectAlignment_(sheet, sheetName, sheetResult, result, schema.START_ROW, 28, bodyRows, 2, 'right', 'TASK_SET_ALIGNMENT');
  qltdBudgetMasterSchemaInspectValidationList_(sheet, sheetName, sheetResult, result, schema.START_ROW, 30, bodyRows, schema.BUDGET_STATUS_VALUES, 'TASK_SET_VALIDATION_LIST');
  qltdBudgetMasterSchemaInspectAlignment_(sheet, sheetName, sheetResult, result, schema.START_ROW, 30, bodyRows, 1, 'center', 'TASK_SET_ALIGNMENT');
  qltdBudgetMasterSchemaInspectWidths_(sheet, sheetName, sheetResult, result, schema.TASK_WIDTHS, 'TASK_SET_COLUMN_WIDTH');
}

function qltdBudgetMasterSchemaInspectNsSheet_(ss, result) {
  const schema = QLTD_BUDGET_MASTER_SCHEMA_V1;
  const sheet = ss.getSheetByName(schema.NS_SHEET);
  const sheetResult = {
    exists: !!sheet,
    maxColumns: 0,
    maxRows: 0,
    actions: [],
    errors: []
  };
  result.sheets[schema.NS_SHEET] = sheetResult;

  if (!sheet) {
    qltdBudgetMasterSchemaAddAction_(result, sheetResult, {
      type: 'NS_CREATE_SHEET',
      sheetName: schema.NS_SHEET
    });
    return;
  }

  sheetResult.maxColumns = sheet.getMaxColumns();
  sheetResult.maxRows = sheet.getMaxRows();

  if (sheetResult.maxColumns < schema.NS_HEADERS.length) {
    qltdBudgetMasterSchemaAddAction_(result, sheetResult, {
      type: 'NS_INSERT_COLUMNS',
      sheetName: schema.NS_SHEET,
      afterColumn: sheetResult.maxColumns,
      count: schema.NS_HEADERS.length - sheetResult.maxColumns
    });
  }

  const headers = qltdBudgetMasterSchemaReadHeaderRow_(sheet, Math.max(schema.NS_HEADERS.length, sheetResult.maxColumns));
  const isCompletelyBlank = headers.every(function(value) {
    return !qltdBudgetMasterSchemaNormalizeText_(value);
  });

  if (!isCompletelyBlank) {
    const duplicateErrors = qltdBudgetMasterSchemaFindDuplicateHeaders_(headers, schema.NS_SHEET);
    sheetResult.errors = sheetResult.errors.concat(duplicateErrors);

    schema.NS_HEADERS.forEach(function(expected, index) {
      const col = index + 1;
      const current = qltdBudgetMasterSchemaNormalizeText_(headers[index]);
      const normalizedExpected = qltdBudgetMasterSchemaNormalizeText_(expected);
      if (current && current !== normalizedExpected) {
        sheetResult.errors.push(qltdBudgetMasterSchemaError_(
          'NS_HEADER_INCOMPATIBLE',
          schema.NS_SHEET + '!' + qltdBudgetMasterSchemaColumnLetter_(col) + schema.HEADER_ROW + ' đang là "' + headers[index] + '", cần "' + expected + '".'
        ));
      }
    });
  }

  if (sheetResult.errors.length) {
    result.errors = result.errors.concat(sheetResult.errors);
    return;
  }

  schema.NS_HEADERS.forEach(function(expected, index) {
    const col = index + 1;
    const current = qltdBudgetMasterSchemaNormalizeText_(headers[index]);
    if (current !== qltdBudgetMasterSchemaNormalizeText_(expected)) {
      qltdBudgetMasterSchemaAddAction_(result, sheetResult, {
        type: 'NS_SET_HEADER',
        sheetName: schema.NS_SHEET,
        row: schema.HEADER_ROW,
        column: col,
        value: expected
      });
    }
  });

  if (sheetResult.maxColumns < schema.NS_HEADERS.length) {
    return;
  }

  qltdBudgetMasterSchemaInspectNsBody_(sheet, result, sheetResult);
}

function qltdBudgetMasterSchemaInspectNsBody_(sheet, result, sheetResult) {
  const schema = QLTD_BUDGET_MASTER_SCHEMA_V1;
  const bodyRows = Math.max(0, sheet.getMaxRows() - schema.START_ROW + 1);

  if (bodyRows) {
    const invalidFlow = qltdBudgetMasterSchemaFindInvalidValues_(sheet, schema.START_ROW, 6, bodyRows, schema.FLOW_VALUES);
    const invalidStatus = qltdBudgetMasterSchemaFindInvalidValues_(sheet, schema.START_ROW, 8, bodyRows, schema.BUDGET_STATUS_VALUES);

    if (invalidFlow.length) {
      sheetResult.errors.push(qltdBudgetMasterSchemaError_(
        'NS_FLOW_INVALID_VALUES',
        schema.NS_SHEET + '!F có giá trị ngoài danh sách THU/CHI: ' + invalidFlow.slice(0, 10).join(', ')
      ));
    }

    if (invalidStatus.length) {
      sheetResult.errors.push(qltdBudgetMasterSchemaError_(
        'NS_STATUS_INVALID_VALUES',
        schema.NS_SHEET + '!H có giá trị ngoài danh sách Nháp/Đã chốt/Khóa: ' + invalidStatus.slice(0, 10).join(', ')
      ));
    }

    if (sheetResult.errors.length) {
      result.errors = result.errors.concat(sheetResult.errors);
      return;
    }

    qltdBudgetMasterSchemaInspectNumberFormat_(sheet, schema.NS_SHEET, sheetResult, result, schema.START_ROW, 7, bodyRows, 1, '#,##0', 'NS_FORMAT_NUMBER');
    qltdBudgetMasterSchemaInspectValidationList_(sheet, schema.NS_SHEET, sheetResult, result, schema.START_ROW, 6, bodyRows, schema.FLOW_VALUES, 'NS_SET_VALIDATION_LIST');
    qltdBudgetMasterSchemaInspectValidationList_(sheet, schema.NS_SHEET, sheetResult, result, schema.START_ROW, 8, bodyRows, schema.BUDGET_STATUS_VALUES, 'NS_SET_VALIDATION_LIST');
  }

  if (sheet.getFrozenRows() < schema.HEADER_ROW) {
    qltdBudgetMasterSchemaAddAction_(result, sheetResult, {
      type: 'NS_FREEZE_ROWS',
      sheetName: schema.NS_SHEET,
      frozenRows: schema.HEADER_ROW
    });
  }

  qltdBudgetMasterSchemaInspectWidths_(sheet, schema.NS_SHEET, sheetResult, result, schema.NS_WIDTHS, 'NS_SET_COLUMN_WIDTH');
}

function qltdBudgetMasterSchemaApplyActions_(ss, actions) {
  actions.forEach(function(action) {
    qltdBudgetMasterSchemaLog_('APPLY ' + action.type + ' sheet=' + action.sheetName);
    switch (action.type) {
      case 'TASK_INSERT_COLUMNS':
      case 'NS_INSERT_COLUMNS':
        qltdBudgetMasterSchemaGetSheetOrThrow_(ss, action.sheetName).insertColumnsAfter(action.afterColumn, action.count);
        break;

      case 'TASK_SET_HEADER':
      case 'NS_SET_HEADER':
        qltdBudgetMasterSchemaGetSheetOrThrow_(ss, action.sheetName).getRange(action.row, action.column).setValue(action.value);
        break;

      case 'TASK_FORMAT_NUMBER':
      case 'NS_FORMAT_NUMBER':
        qltdBudgetMasterSchemaGetSheetOrThrow_(ss, action.sheetName)
          .getRange(action.startRow, action.column, action.numRows, action.numColumns)
          .setNumberFormat(action.numberFormat);
        break;

      case 'TASK_SET_ALIGNMENT':
        qltdBudgetMasterSchemaGetSheetOrThrow_(ss, action.sheetName)
          .getRange(action.startRow, action.column, action.numRows, action.numColumns)
          .setHorizontalAlignment(action.alignment);
        break;

      case 'TASK_SET_VALIDATION_LIST':
      case 'NS_SET_VALIDATION_LIST':
        qltdBudgetMasterSchemaGetSheetOrThrow_(ss, action.sheetName)
          .getRange(action.startRow, action.column, action.numRows, action.numColumns)
          .setDataValidation(qltdBudgetMasterSchemaBuildListValidation_(action.values));
        break;

      case 'TASK_SET_COLUMN_WIDTH':
      case 'NS_SET_COLUMN_WIDTH':
        qltdBudgetMasterSchemaGetSheetOrThrow_(ss, action.sheetName).setColumnWidth(action.column, action.width);
        break;

      case 'TASK_HIDE_COLUMN':
        qltdBudgetMasterSchemaGetSheetOrThrow_(ss, action.sheetName).hideColumns(action.column);
        break;

      case 'NS_FREEZE_ROWS':
        qltdBudgetMasterSchemaGetSheetOrThrow_(ss, action.sheetName).setFrozenRows(action.frozenRows);
        break;

      case 'NS_CREATE_SHEET':
        qltdBudgetMasterSchemaSetupNsSheet_(ss.insertSheet(action.sheetName));
        break;

      default:
        throw new Error('Không hỗ trợ action schema ngân sách: ' + action.type);
    }
  });
}

function qltdBudgetMasterSchemaSetupNsSheet_(sheet) {
  const schema = QLTD_BUDGET_MASTER_SCHEMA_V1;
  if (sheet.getMaxColumns() < schema.NS_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), schema.NS_HEADERS.length - sheet.getMaxColumns());
  }
  if (sheet.getMaxRows() < schema.START_ROW) {
    sheet.insertRowsAfter(sheet.getMaxRows(), schema.START_ROW - sheet.getMaxRows());
  }

  sheet.getRange(1, 1, 1, schema.NS_HEADERS.length)
    .breakApart()
    .mergeAcross()
    .setValue('NGÂN SÁCH KHÔNG GẮN CÔNG VIỆC')
    .setFontWeight('bold')
    .setFontSize(14)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground('#d9ead3');

  sheet.getRange(2, 1, 1, schema.NS_HEADERS.length)
    .mergeAcross()
    .setValue('Các nguồn ngân sách cấp Master không gắn trực tiếp với WBS/công việc.')
    .setFontStyle('italic')
    .setFontColor('#666666')
    .setHorizontalAlignment('center');

  sheet.getRange(schema.HEADER_ROW, 1, 1, schema.NS_HEADERS.length)
    .setValues([schema.NS_HEADERS])
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#274e13')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  const bodyRows = Math.max(1, sheet.getMaxRows() - schema.START_ROW + 1);
  sheet.getRange(schema.START_ROW, 7, bodyRows, 1).setNumberFormat('#,##0');
  sheet.getRange(schema.START_ROW, 6, bodyRows, 1).setDataValidation(qltdBudgetMasterSchemaBuildListValidation_(schema.FLOW_VALUES));
  sheet.getRange(schema.START_ROW, 8, bodyRows, 1).setDataValidation(qltdBudgetMasterSchemaBuildListValidation_(schema.BUDGET_STATUS_VALUES));
  sheet.setFrozenRows(schema.HEADER_ROW);

  Object.keys(schema.NS_WIDTHS).forEach(function(colText) {
    const col = Number(colText);
    sheet.setColumnWidth(col, schema.NS_WIDTHS[col].value);
  });
}

function qltdBudgetMasterSchemaInspectNumberFormat_(sheet, sheetName, sheetResult, result, startRow, column, numRows, numColumns, expected, actionType) {
  const formats = sheet.getRange(startRow, column, numRows, numColumns).getNumberFormats();
  const allOk = formats.every(function(row) {
    return row.every(function(value) {
      return value === expected;
    });
  });
  if (!allOk) {
    qltdBudgetMasterSchemaAddAction_(result, sheetResult, {
      type: actionType,
      sheetName: sheetName,
      startRow: startRow,
      column: column,
      numRows: numRows,
      numColumns: numColumns,
      numberFormat: expected
    });
  }
}

function qltdBudgetMasterSchemaInspectAlignment_(sheet, sheetName, sheetResult, result, startRow, column, numRows, numColumns, expected, actionType) {
  const alignments = sheet.getRange(startRow, column, numRows, numColumns).getHorizontalAlignments();
  const allOk = alignments.every(function(row) {
    return row.every(function(value) {
      return value === expected;
    });
  });
  if (!allOk) {
    qltdBudgetMasterSchemaAddAction_(result, sheetResult, {
      type: actionType,
      sheetName: sheetName,
      startRow: startRow,
      column: column,
      numRows: numRows,
      numColumns: numColumns,
      alignment: expected
    });
  }
}

function qltdBudgetMasterSchemaInspectValidationList_(sheet, sheetName, sheetResult, result, startRow, column, numRows, values, actionType) {
  const rules = sheet.getRange(startRow, column, numRows, 1).getDataValidations();
  const allOk = rules.every(function(row) {
    const rule = row[0];
    return qltdBudgetMasterSchemaRuleMatchesList_(rule, values);
  });
  if (!allOk) {
    qltdBudgetMasterSchemaAddAction_(result, sheetResult, {
      type: actionType,
      sheetName: sheetName,
      startRow: startRow,
      column: column,
      numRows: numRows,
      numColumns: 1,
      values: values.slice()
    });
  }
}

function qltdBudgetMasterSchemaInspectWidths_(sheet, sheetName, sheetResult, result, widthConfig, actionType) {
  Object.keys(widthConfig).forEach(function(colText) {
    const col = Number(colText);
    const config = widthConfig[col];
    const width = sheet.getColumnWidth(col);
    if (width < config.min || width > config.max) {
      qltdBudgetMasterSchemaAddAction_(result, sheetResult, {
        type: actionType,
        sheetName: sheetName,
        column: col,
        width: config.value,
        currentWidth: width
      });
    }
  });
}

function qltdBudgetMasterSchemaValidateExpectedTaskHeader_(headers, sheetName, column, expected, sheetResult) {
  const normalizedExpected = qltdBudgetMasterSchemaNormalizeText_(expected);
  const current = qltdBudgetMasterSchemaNormalizeText_(headers[column - 1]);

  if (normalizedExpected === '') {
    if (current !== '') {
      sheetResult.errors.push(qltdBudgetMasterSchemaError_(
        'TASK_SPACER_AA_NOT_BLANK',
        sheetName + '!AA phải là cột đệm trống, hiện đang là "' + headers[column - 1] + '".'
      ));
    }
    return;
  }

  const positions = qltdBudgetMasterSchemaFindHeaderPositions_(headers, expected);
  if (positions.length > 1 || (positions.length === 1 && positions[0] !== column)) {
    sheetResult.errors.push(qltdBudgetMasterSchemaError_(
      'TASK_BUDGET_HEADER_SHIFTED',
      sheetName + ' header "' + expected + '" phải ở cột ' + qltdBudgetMasterSchemaColumnLetter_(column) + ', hiện tại: ' + JSON.stringify(positions)
    ));
  }
}

function qltdBudgetMasterSchemaReadHeaderRow_(sheet, width) {
  const readWidth = Math.min(width, sheet.getMaxColumns());
  const row = sheet.getRange(QLTD_BUDGET_MASTER_SCHEMA_V1.HEADER_ROW, 1, 1, readWidth).getDisplayValues()[0];
  while (row.length < width) {
    row.push('');
  }
  return row;
}

function qltdBudgetMasterSchemaFindHeaderPositions_(headers, expected) {
  const normalizedExpected = qltdBudgetMasterSchemaNormalizeText_(expected);
  const positions = [];
  headers.forEach(function(value, index) {
    if (qltdBudgetMasterSchemaNormalizeText_(value) === normalizedExpected) {
      positions.push(index + 1);
    }
  });
  return positions;
}

function qltdBudgetMasterSchemaFindDuplicateHeaders_(headers, sheetName) {
  const seen = {};
  const errors = [];
  headers.forEach(function(value, index) {
    const key = qltdBudgetMasterSchemaNormalizeText_(value);
    if (!key) {
      return;
    }
    if (seen[key]) {
      errors.push(qltdBudgetMasterSchemaError_(
        'DUPLICATE_HEADER',
        sheetName + ' có header trùng "' + value + '" tại cột ' + qltdBudgetMasterSchemaColumnLetter_(seen[key]) + ' và ' + qltdBudgetMasterSchemaColumnLetter_(index + 1) + '.'
      ));
      return;
    }
    seen[key] = index + 1;
  });
  return errors;
}

function qltdBudgetMasterSchemaFindInvalidValues_(sheet, startRow, column, numRows, allowedValues) {
  const allowed = {};
  allowedValues.forEach(function(value) {
    allowed[qltdBudgetMasterSchemaNormalizeText_(value)] = true;
  });

  const values = sheet.getRange(startRow, column, numRows, 1).getDisplayValues();
  const invalid = [];
  values.forEach(function(row, index) {
    const raw = row[0];
    const key = qltdBudgetMasterSchemaNormalizeText_(raw);
    if (key && !allowed[key]) {
      invalid.push(qltdBudgetMasterSchemaColumnLetter_(column) + (startRow + index) + '="' + raw + '"');
    }
  });
  return invalid;
}

function qltdBudgetMasterSchemaRuleMatchesList_(rule, expectedValues) {
  if (!rule) {
    return false;
  }

  let criteria;
  let values;
  try {
    criteria = rule.getCriteriaType();
    values = rule.getCriteriaValues();
  } catch (err) {
    return false;
  }

  if (criteria !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    return false;
  }

  const actualList = values && values[0] ? values[0] : [];
  const expected = expectedValues.map(qltdBudgetMasterSchemaNormalizeText_);
  const actual = actualList.map(qltdBudgetMasterSchemaNormalizeText_);
  if (actual.length !== expected.length) {
    return false;
  }
  return expected.every(function(value, index) {
    return actual[index] === value;
  });
}

function qltdBudgetMasterSchemaBuildListValidation_(values) {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
}

function qltdBudgetMasterSchemaOpenSpreadsheet_(spreadsheetId) {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    throw new Error('Thiếu spreadsheetId.');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function qltdBudgetMasterSchemaGetSheetOrThrow_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Không tìm thấy sheet: ' + sheetName);
  }
  return sheet;
}

function qltdBudgetMasterSchemaColumnHidden_(sheet, column) {
  try {
    return sheet.isColumnHiddenByUser(column);
  } catch (err) {
    return false;
  }
}

function qltdBudgetMasterSchemaAddAction_(result, sheetResult, action) {
  result.actions.push(action);
  sheetResult.actions.push(action);
}

function qltdBudgetMasterSchemaError_(code, message) {
  return {
    code: code,
    message: message
  };
}

function qltdBudgetMasterSchemaResponse_(operation, dryRun, inspection, appliedActions) {
  return {
    success: inspection.success,
    operation: operation,
    dryRun: dryRun,
    status: inspection.status,
    spreadsheetId: inspection.spreadsheetId,
    spreadsheetName: inspection.spreadsheetName,
    generatedAt: inspection.generatedAt,
    appliedActions: appliedActions || [],
    actions: inspection.actions,
    errors: inspection.errors,
    warnings: inspection.warnings,
    sheets: inspection.sheets
  };
}

function qltdBudgetMasterSchemaNormalizeText_(value) {
  return String(value === null || typeof value === 'undefined' ? '' : value).trim().replace(/\s+/g, ' ');
}

function qltdBudgetMasterSchemaColumnLetter_(column) {
  let letter = '';
  let temp = column;
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

function qltdBudgetMasterSchemaLog_(message) {
  try {
    if (typeof Logger !== 'undefined' && Logger && typeof Logger.log === 'function') {
      Logger.log('[BudgetMasterSchema] ' + message);
    }
  } catch (err) {
    // Không để lỗi log làm hỏng dry-run/ensure.
  }
}
