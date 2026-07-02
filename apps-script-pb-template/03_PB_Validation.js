/**
 * PB Utility V1 - Validation va kiem tra du lieu nhap.
 */

function apDungValidationTrangThaiPBV1_(sheet) {
  const rowCount = Math.max(sheet.getMaxRows() - PBV1_CONFIG.DATA_START_ROW + 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(PBV1_CONFIG.STATUS_VALUES, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, PBV1_CONFIG.COLUMNS.TRANG_THAI, rowCount, 1)
    .setDataValidation(rule);
}

function apDungValidationTienDoTrongSoPBV1_(sheet) {
  const rowCount = Math.max(sheet.getMaxRows() - PBV1_CONFIG.DATA_START_ROW + 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireNumberBetween(0, 100)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, PBV1_CONFIG.COLUMNS.TIEN_DO, rowCount, 1)
    .setDataValidation(rule);
  sheet.getRange(PBV1_CONFIG.DATA_START_ROW, PBV1_CONFIG.COLUMNS.TRONG_SO, rowCount, 1)
    .setDataValidation(rule);
}

function kiemTraDuLieuNhapSheetHienTaiPBV1() {
  const sheet = laySheetHienTaiHopLePBV1_();
  if (!sheet) return;

  const result = kiemTraDuLieuNhapSheetPBV1_(sheet, false);
  ghiKetQuaKiemTraPBV1_([result]);

  SpreadsheetApp.getUi().alert(
    `Kiem tra du lieu sheet ${sheet.getName()} xong.\n` +
    `Loi: ${result.errorCount}\n` +
    `Canh bao: ${result.warningCount}\n\n` +
    `Xem chi tiet tai sheet ${PBV1_CONFIG.SHEET_LOI_KIEM_TRA}.`
  );
}

function kiemTraKyThuatToanBoFilePBV1() {
  const sheets = layDanhSachSheetPhongBanPBV1_();
  const results = sheets.map(sheet => kiemTraDuLieuNhapSheetPBV1_(sheet, true));
  ghiKetQuaKiemTraPBV1_(results);

  const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
  const warningCount = results.reduce((sum, r) => sum + r.warningCount, 0);

  SpreadsheetApp.getUi().alert(
    `Kiem tra ky thuat toan bo file PB xong.\n` +
    `So sheet: ${sheets.length}\n` +
    `Loi: ${errorCount}\n` +
    `Canh bao: ${warningCount}\n\n` +
    `Xem chi tiet tai sheet ${PBV1_CONFIG.SHEET_LOI_KIEM_TRA}.`
  );
}

function kiemTraDuLieuNhapSheetPBV1_(sheet, includeTechnical) {
  const lastRow = layLastDataRowPBV1_(sheet);
  const issues = [];

  if (lastRow < PBV1_CONFIG.DATA_START_ROW) {
    return { sheetName: sheet.getName(), issues, errorCount: 0, warningCount: 0 };
  }

  const rowCount = lastRow - PBV1_CONFIG.DATA_START_ROW + 1;
  const lastCol = layCotCuoiHeThongPBV1_();
  const values = sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 1, rowCount, lastCol).getValues();
  const displays = sheet.getRange(PBV1_CONFIG.DATA_START_ROW, 1, rowCount, lastCol).getDisplayValues();
  const masterCodeMap = {};
  const detailTaskIdMap = {};
  const detailWeightByMaster = {};

  values.forEach((row, i) => {
    const rowIndex = PBV1_CONFIG.DATA_START_ROW + i;
    const display = displays[i];
    const wbs = display[PBV1_CONFIG.COLUMNS.WBS - 1];
    const noiDung = display[PBV1_CONFIG.COLUMNS.NOI_DUNG - 1];
    const trangThai = display[PBV1_CONFIG.COLUMNS.TRANG_THAI - 1];
    const bdThucTe = row[PBV1_CONFIG.COLUMNS.BD_THUC_TE - 1];
    const htThucTe = row[PBV1_CONFIG.COLUMNS.HT_THUC_TE - 1];
    const bdThucTeDisplay = display[PBV1_CONFIG.COLUMNS.BD_THUC_TE - 1];
    const htThucTeDisplay = display[PBV1_CONFIG.COLUMNS.HT_THUC_TE - 1];
    const maMaster = display[PBV1_CONFIG.COLUMNS.MA_MASTER - 1];
    const loaiDong = display[PBV1_CONFIG.COLUMNS.LOAI_DONG - 1];
    const detailTaskId = display[PBV1_CONFIG.COLUMNS.DETAIL_TASK_ID - 1];
    const tienDo = row[PBV1_CONFIG.COLUMNS.TIEN_DO - 1];
    const trongSo = row[PBV1_CONFIG.COLUMNS.TRONG_SO - 1];
    const tienDoDisplay = display[PBV1_CONFIG.COLUMNS.TIEN_DO - 1];
    const trongSoDisplay = display[PBV1_CONFIG.COLUMNS.TRONG_SO - 1];

    const hasUserData = [
      noiDung,
      trangThai,
      bdThucTeDisplay,
      htThucTeDisplay,
      display[PBV1_CONFIG.COLUMNS.GHI_CHU - 1],
      detailTaskId
    ].some(v => v !== '' && v !== null);
    if (!hasUserData && !loaiDong) return;

    if (trangThai && PBV1_CONFIG.STATUS_VALUES.indexOf(trangThai) === -1) {
      themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Loi', `Trang thai "${trangThai}" khong dung danh muc.`, `Chi chon: ${PBV1_CONFIG.STATUS_VALUES.join(', ')}.`);
    }

    if (bdThucTeDisplay && !laNgayHopLePBV1_(bdThucTe)) {
      themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Loi', 'Bat dau thuc te khong phai ngay hop le.', 'Nhap ngay theo dinh dang dd/MM/yyyy.');
    }

    if (htThucTeDisplay && !laNgayHopLePBV1_(htThucTe)) {
      themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Loi', 'Hoan thanh thuc te khong phai ngay hop le.', 'Nhap ngay theo dinh dang dd/MM/yyyy.');
    }

    if (bdThucTeDisplay && htThucTeDisplay && laNgayHopLePBV1_(bdThucTe) && laNgayHopLePBV1_(htThucTe)) {
      const cmp = soSanhNgayPBV1_(bdThucTe, htThucTe);
      if (cmp !== null && cmp > 0) {
        themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Loi', 'Bat dau thuc te lon hon hoan thanh thuc te.', 'Ra soat lai cot G va H.');
      }
    }

    if (trangThai === 'Hoàn thành' && !htThucTeDisplay) {
      themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Canh bao', 'Cong viec da hoan thanh nhung chua co ngay hoan thanh thuc te.', 'Bo sung cot H neu da co ngay hoan thanh.');
    }

    if (trangThai === 'Chưa bắt đầu' && (bdThucTeDisplay || htThucTeDisplay)) {
      themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Canh bao', 'Trang thai la Chua bat dau nhung da co ngay thuc te.', 'Ra soat trang thai hoac xoa ngay thuc te neu nhap nham.');
    }

    if (tienDoDisplay && !laSoTrongKhoangPBV1_(tienDo, 0, 100)) {
      themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Loi', '% Hoan thanh phai la so tu 0 den 100.', 'Ra soat cot Q.');
    }

    if (trongSoDisplay && !laSoTrongKhoangPBV1_(trongSo, 0, 100)) {
      themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Loi', 'Trong so phai la so tu 0 den 100.', 'Ra soat cot R.');
    }

    if (includeTechnical && loaiDong === PBV1_CONFIG.ROW_TYPES.MASTER) {
      if (!maMaster) {
        themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Loi', 'Dong MASTER thieu ma cong viec Master.', 'Can dong bo lai tu Master.');
      } else {
        masterCodeMap[maMaster] = masterCodeMap[maMaster] || [];
        masterCodeMap[maMaster].push(rowIndex);
      }
      if (detailTaskId) {
        themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Canh bao', 'Dong MASTER khong can DetailTaskId.', 'De trong cot P cho dong MASTER.');
      }
    }

    if (includeTechnical && loaiDong === PBV1_CONFIG.ROW_TYPES.PB_DETAIL) {
      if (!maMaster) {
        themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Loi', 'Dong PB_DETAIL thieu ma cong viec Master.', 'Bo sung ma cha tai cot N.');
      }
      if (!detailTaskId) {
        themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Loi', 'Dong PB_DETAIL thieu DetailTaskId.', 'Chay ham nang cap schema hoac tao lai ma tai cot P.');
      } else {
        detailTaskIdMap[detailTaskId] = detailTaskIdMap[detailTaskId] || [];
        detailTaskIdMap[detailTaskId].push(rowIndex);
      }
      if (!noiDung) {
        themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Loi', 'Dong PB_DETAIL thieu noi dung cong viec.', 'Bo sung cot B.');
      }
      if (wbs && !/\.D\d{2}$/i.test(String(wbs))) {
        themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, wbs, maMaster, 'Canh bao', 'WBS cua PB_DETAIL chua theo dang .Dxx.', 'Dung dang vi du II.1.D01.');
      }
      if (trongSoDisplay && laSoTrongKhoangPBV1_(trongSo, 0, 100)) {
        detailWeightByMaster[maMaster] = (detailWeightByMaster[maMaster] || 0) + Number(trongSo);
      }
    }
  });

  if (includeTechnical) {
    Object.keys(masterCodeMap).forEach(code => {
      if (masterCodeMap[code].length > 1) {
        masterCodeMap[code].forEach(rowIndex => {
          themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, '', code, 'Loi', `Ma Master ${code} bi trung trong cung sheet.`, 'Can kiem tra lai du lieu dong bo.');
        });
      }
    });

    Object.keys(detailTaskIdMap).forEach(detailTaskId => {
      if (detailTaskIdMap[detailTaskId].length > 1) {
        detailTaskIdMap[detailTaskId].forEach(rowIndex => {
          themLoiKiemTraPBV1_(issues, sheet.getName(), rowIndex, '', detailTaskId, 'Loi', `DetailTaskId ${detailTaskId} bi trung trong file PB.`, 'Can sinh lai ma khong trung.');
        });
      }
    });

    Object.keys(detailWeightByMaster).forEach(maMaster => {
      if (detailWeightByMaster[maMaster] > 100) {
        themLoiKiemTraPBV1_(issues, sheet.getName(), '', '', maMaster, 'Canh bao', `Tong trong so PB_DETAIL cua ${maMaster} vuot 100.`, 'STEP 3B.1 chua bat buoc tong bang 100.');
      }
    });
  }

  return {
    sheetName: sheet.getName(),
    issues,
    errorCount: issues.filter(i => i.level === 'Loi').length,
    warningCount: issues.filter(i => i.level === 'Canh bao').length
  };
}

function themLoiKiemTraPBV1_(issues, sheetName, rowIndex, wbs, maMaster, level, message, suggestion) {
  issues.push({ time: new Date(), user: layEmailNguoiDungPBV1_(), sheetName, rowIndex, wbs, maMaster, level, message, suggestion });
}

function ghiKetQuaKiemTraPBV1_(results) {
  const headers = ['Thoi diem kiem tra', 'Nguoi kiem tra', 'Sheet', 'Dong', 'WBS', 'Ma Master/DetailTaskId', 'Muc loi', 'Noi dung loi/canh bao', 'Goi y xu ly'];
  const sheet = damBaoSheetVoiHeaderPBV1_(PBV1_CONFIG.SHEET_LOI_KIEM_TRA, headers);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const rows = [];
  results.forEach(result => {
    result.issues.forEach(issue => {
      rows.push([issue.time, issue.user, issue.sheetName, issue.rowIndex, issue.wbs, issue.maMaster, issue.level, issue.message, issue.suggestion]);
    });
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.getRange(2, 1, rows.length, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.autoResizeColumns(1, headers.length);
  }
}
