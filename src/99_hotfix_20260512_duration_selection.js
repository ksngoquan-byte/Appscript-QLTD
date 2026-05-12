/**
 * HOTFIX 2026-05-12
 * 1) Khong xoa cot J (So ngay ke hoach) khi vua nhap cong viec lien ket cot K.
 * 2) Highlight vung chon: chi to o dang tro, khong to ca hang A:W / A:H.
 *
 * File 99_* duoc dat cuoi de override cac function cung ten trong file goc.
 */

function ghiKetQuaScheduleV1_(sheet, tasks, numRows) {
  const cfg = SCHEDULE_ENGINE_V1;
  const taskByIndex = {};
  tasks.forEach(task => {
    taskByIndex[task.index] = task;
  });

  // Doc lai gia tri cot J hien co de bao toan so ngay nguoi dung vua nhap.
  // Loi cu: khi cot K thay doi ma cot J chua kip/khong co duration hop le,
  // engine ghi '' vao cot J => xoa so ngay, lan nhap thu hai moi nhan.
  const currentDurationValues = sheet
    .getRange(cfg.START_ROW, cfg.COL.DURATION, numRows, 1)
    .getValues();

  const durationValues = [];
  const startValues = [];
  const endValues = [];
  const errorValues = [];

  for (let i = 0; i < numRows; i++) {
    const task = taskByIndex[i];
    if (!task) {
      durationValues.push(['']);
      startValues.push(['']);
      endValues.push(['']);
      errorValues.push(['']);
      continue;
    }

    const oldDuration = currentDurationValues[i] ? currentDurationValues[i][0] : '';
    const nextDuration = task.duration || oldDuration || '';

    durationValues.push([nextDuration]);
    startValues.push([task.start || '']);
    endValues.push([task.end || '']);
    errorValues.push([layMaLoiDuyNhatV1_(task.errors).join('; ')]);
  }

  sheet.getRange(cfg.START_ROW, cfg.COL.DURATION, numRows, 1).setValues(durationValues);
  sheet.getRange(cfg.START_ROW, cfg.COL.START, numRows, 1).setValues(startValues);
  sheet.getRange(cfg.START_ROW, cfg.COL.END, numRows, 1).setValues(endValues);
  sheet.getRange(cfg.START_ROW, cfg.COL.ERROR, numRows, 1).setValues(errorValues);

  sheet.getRange(cfg.START_ROW, cfg.COL.START, numRows, 2).setNumberFormat('dd/MM/yyyy');
}

function xuLyDoiVungChon(e) {
  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    const row = e.range.getRow();
    const col = e.range.getColumn();
    const cache = layCache_ && typeof layCache_ === 'function' ? layCache_() : null;

    khoiPhucSelectionHighlightCuV1_(cache);

    if (row < CONFIG.SYSTEM.START_ROW) return;
    if (!laSheetDuocHighlightSelectionV1_(sheetName)) return;

    // Chi to dung o dang tro vao, khong to ca hang.
    const targetRange = sheet.getRange(row, col, 1, 1);
    const oldBackgrounds = targetRange.getBackgrounds();

    targetRange.setBackground(SELECTION_HIGHLIGHT_COLOR_V1);

    if (cache) {
      cache.setProperty(
        SELECTION_HIGHLIGHT_CACHE_KEY_V1,
        JSON.stringify({
          sheetName: sheetName,
          row: row,
          startColumn: col,
          numColumns: 1,
          backgrounds: oldBackgrounds
        })
      );
    }
  } catch (err) {
    Logger.log('xuLyDoiVungChon hotfix: ' + err);
  }
}

function laSheetDuocHighlightSelectionV1_(sheetName) {
  return sheetName === CONFIG.SHEET.CONG_VIEC || sheetName === 'Tien_do_tong_hop';
}

function onSelectionChange(e) {
  xuLyDoiVungChon(e);
}
