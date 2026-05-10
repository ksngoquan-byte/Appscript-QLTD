function capMaCongViec() {
  return chayCoKhoa_(() => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEET.CONG_VIEC);

      const lastRow = sheet.getLastRow();
      if (lastRow < CONFIG.SYSTEM.START_ROW) return;

      const numRows = lastRow - CONFIG.SYSTEM.START_ROW + 1;
      const numCols = Math.max(sheet.getLastColumn(), CONFIG.COLUMN.CONG_VIEC.LOI_TIEN_NHIEM);
      const data = sheet.getRange(CONFIG.SYSTEM.START_ROW, 1, numRows, numCols).getValues();
      const col = CONFIG.COLUMN.CONG_VIEC;

      const maCongViecCol = [];
      let newIdCount = 0;
      let lastId = Math.max(layMaCongViecCuoi_(), layMaCongViecLonNhatTuSheet_(data, col));

      for (let i = 0; i < data.length; i++) {
        const row = data[i];

        if (laDongCongViec_(row)) {
          let maCongViec = row[col.MA_CONG_VIEC - 1];
          if (!maCongViec) {
            lastId++;
            maCongViec = dinhDangMa_(lastId);
            newIdCount++;
          } else {
            maCongViec = chuanHoaMaCongViec_(maCongViec);
          }

          maCongViecCol.push([maCongViec]);
        } else {
          maCongViecCol.push(['']);
        }
      }

      if (!CONFIG.SYSTEM.DRY_RUN) {
        sheet.getRange(CONFIG.SYSTEM.START_ROW, col.MA_CONG_VIEC, numRows, 1).setValues(maCongViecCol);
        luuMaCongViecCuoi_(lastId);
      }

      ghiLogThongTin_('Cap ma xong. Ma moi: ' + newIdCount + ', so dong: ' + numRows);
    } catch (err) {
      ghiLogLoi_('capMaCongViec: ' + err);
      throw err;
    }
  });
}

function layMaCongViecLonNhatTuSheet_(data, col) {
  let maxId = 0;

  data.forEach(row => {
    const value = row[col.MA_CONG_VIEC - 1];
    if (!value) return;

    const numberValue = Number(String(value).trim());
    if (isFinite(numberValue) && numberValue > maxId) {
      maxId = numberValue;
    }
  });

  return maxId;
}

function chuanHoaMaCongViec_(value) {
  const text = String(value).trim();
  const numberValue = Number(text);

  if (!isFinite(numberValue) || numberValue <= 0) {
    return text;
  }

  return dinhDangMa_(Math.floor(numberValue));
}


// === DYNAMIC_PREDECESSOR_FORMULA_V1_START ===

/**
 * Muc tieu 4:
 * Chuyen Cong viec lien ket cot K tu text tinh sang cong thuc dong.
 * Vi du: 4SS;6FF -> =$G$8&"SS"&"; "&$G$10&"FF"
 * Khi them/bot dong, tham chieu $G$8/$G$10 tu cap nhat theo dong moi.
 */
function khoiTaoCongThucLienKetDongV1() {
  return chayCoKhoa_(() => {
    const ss = laySpreadsheetChoLienKetDongV1_();
    const sheet = ss.getSheetByName(CONFIG.SHEET.CONG_VIEC);
    if (!sheet) throw new Error('Khong tim thay sheet Cong_viec');

    const result = chuyenVungLienKetDongV1_(sheet, sheet.getRange(
      CONFIG.SYSTEM.START_ROW,
      CONFIG.COLUMN.CONG_VIEC.PREDECESSOR,
      Math.max(sheet.getLastRow() - CONFIG.SYSTEM.START_ROW + 1, 1),
      1
    ), true);

    ghiLogThongTin_(
      'Khoi tao cong thuc lien ket dong xong. Da chuyen: ' +
      result.converted + ', bo qua: ' + result.skipped + ', loi: ' + result.errors
    );

    return result;
  });
}

/**
 * Dung cho onEdit/installable trigger:
 * Neu nguoi dung nhap cot K thi tu dong doi thanh cong thuc dong.
 */
function chuyenVungNhapThanhCongThucLienKetDongV1_(sheet, editedRange, predecessorCol) {
  const targetCol = predecessorCol || CONFIG.COLUMN.CONG_VIEC.PREDECESSOR;
  const startCol = editedRange.getColumn();
  const endCol = startCol + editedRange.getNumColumns() - 1;

  if (targetCol < startCol || targetCol > endCol) {
    return { converted: 0, skipped: 0, errors: 0 };
  }

  const colOffset = targetCol - startCol + 1;
  const targetRange = sheet.getRange(
    editedRange.getRow(),
    targetCol,
    editedRange.getNumRows(),
    1
  );

  return chuyenVungLienKetDongV1_(sheet, targetRange, false);
}

function chuyenVungLienKetDongV1_(sheet, range, includeExistingText) {
  const startRow = CONFIG.SYSTEM.START_ROW;
  const predCol = CONFIG.COLUMN.CONG_VIEC.PREDECESSOR;

  const rowStart = range.getRow();
  const numRows = range.getNumRows();

  const values = range.getValues();
  const formulas = range.getFormulas();
  const refMap = taoBanDoSoThamChieuSangDongV1_(sheet);

  let converted = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < numRows; i++) {
    const rowIndex = rowStart + i;

    if (rowIndex < startRow) {
      skipped++;
      continue;
    }

    const currentFormula = formulas[i][0];
    const currentValue = values[i][0];

    // Khong doi lai o da la cong thuc, tru khi includeExistingText = true va cong thuc trong cot K dang rong.
    if (currentFormula) {
      skipped++;
      continue;
    }

    if (!coGiaTriLienKetDongV1_(currentValue)) {
      skipped++;
      continue;
    }

    const formula = taoCongThucLienKetDongTuTextV1_(String(currentValue), refMap);

    if (!formula) {
      errors++;
      continue;
    }

    sheet.getRange(rowIndex, predCol).setFormula(formula);
    converted++;
  }

  SpreadsheetApp.flush();

  return { converted, skipped, errors };
}

function taoBanDoSoThamChieuSangDongV1_(sheet) {
  const col = CONFIG.COLUMN.CONG_VIEC;
  const refCol = col.SO_THAM_CHIEU || col.REF;
  const maCongViecCol = col.MA_CONG_VIEC;
  const startRow = CONFIG.SYSTEM.START_ROW;
  const lastRow = sheet.getLastRow();

  const map = {};
  if (lastRow < startRow) return map;

  if (!refCol || !maCongViecCol) {
    throw new Error('Thieu cau hinh cot SO_THAM_CHIEU hoac MA_CONG_VIEC trong CONFIG.COLUMN.CONG_VIEC');
  }

  const numRows = lastRow - startRow + 1;
  const numCols = Math.max(refCol, maCongViecCol);
  const values = sheet.getRange(startRow, 1, numRows, numCols).getValues();

  for (let i = 0; i < values.length; i++) {
    const rowIndex = startRow + i;
    const row = values[i];
    const ref = chuanHoaSoThamChieuLienKetDongV1_(row[refCol - 1]);
    const maCongViec = row[maCongViecCol - 1];

    // Chi map cac dong co so tham chieu va ma cong viec de tranh dong nhom/blank.
    if (ref && maCongViec) {
      map[ref] = rowIndex;
    }
  }

  return map;
}

function taoCongThucLienKetDongTuTextV1_(text, refMap) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  // Neu nguoi dung nhap bang dau phay, van chap nhan; output chuan ve dau cham phay.
  const parts = raw.split(/[;,]/).map(p => p.trim()).filter(Boolean);
  if (!parts.length) return '';

  const formulaParts = [];

  for (let i = 0; i < parts.length; i++) {
    const token = parts[i];
    const match = token.match(/^(\d+)(FS|SS|FF|SF)?([+-]\d+)?$/i);

    if (!match) {
      // Neu co token khong dung cu phap, giu nguyen dang text de khong lam mat du lieu.
      formulaParts.push(quoteFormulaTextLienKetDongV1_(token));
      continue;
    }

    const ref = chuanHoaSoThamChieuLienKetDongV1_(match[1]);
    const type = match[2] ? String(match[2]).toUpperCase() : '';
    const lag = match[3] || '';
    const targetRow = refMap[ref];

    if (!targetRow) {
      // Khong tim thay ref dich thi giu nguyen token, tranh doi sai.
      formulaParts.push(quoteFormulaTextLienKetDongV1_(token));
      continue;
    }

    const suffix = type + lag;
    if (suffix) {
      formulaParts.push('$G$' + targetRow + '&' + quoteFormulaTextLienKetDongV1_(suffix));
    } else {
      formulaParts.push('$G$' + targetRow);
    }
  }

  if (!formulaParts.length) return '';

  return '=' + formulaParts.join('&"; "&');
}

function chuanHoaSoThamChieuLienKetDongV1_(value) {
  if (value === null || typeof value === 'undefined' || value === '') return '';
  const n = Number(value);
  if (!isFinite(n)) return String(value).trim();
  return String(Math.floor(n));
}

function quoteFormulaTextLienKetDongV1_(text) {
  return '"' + String(text || '').replace(/"/g, '""') + '"';
}

function coGiaTriLienKetDongV1_(value) {
  return value !== null && value !== '' && typeof value !== 'undefined';
}

function laySpreadsheetChoLienKetDongV1_() {
  if (typeof laySpreadsheetHienHanh_ === 'function') {
    return laySpreadsheetHienHanh_();
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

// === DYNAMIC_PREDECESSOR_FORMULA_V1_END ===


// === AUTO_TASK_ID_ON_EDIT_V1_START ===

/**
 * Tu dong cap Ma cong viec cho cac dong dang sua neu cot O dang trong.
 * Nguyen tac:
 * - Chi cap cho dong thieu ma.
 * - Khong doi ma da co.
 * - Khong cap cho dong blank/nhom neu chua co du dau hieu la dong cong viec.
 */
function capMaCongViecChoVungNeuThieuV1_(sheet, editedRange) {
  return chayCoKhoa_(() => {
    const col = CONFIG.COLUMN.CONG_VIEC;
    const startRow = CONFIG.SYSTEM.START_ROW;
    const lastRow = sheet.getLastRow();

    if (!sheet || !editedRange || lastRow < startRow) {
      return { assigned: 0, skipped: 0 };
    }

    const rangeStartRow = Math.max(editedRange.getRow(), startRow);
    const rangeEndRow = Math.min(editedRange.getLastRow(), lastRow);

    if (rangeEndRow < rangeStartRow) {
      return { assigned: 0, skipped: 0 };
    }

    const allNumRows = lastRow - startRow + 1;
    const maxCol = Math.max(
      col.MA_CONG_VIEC || 15,
      col.PREDECESSOR || 11,
      col.SO_NGAY || col.DURATION || 10,
      col.TEN_CV || col.TASK_NAME || 8,
      col.SO_THAM_CHIEU || col.REF || 7
    );

    const allData = sheet.getRange(startRow, 1, allNumRows, maxCol).getValues();
    let lastId = Math.max(layMaCongViecCuoi_(), layMaCongViecLonNhatTuSheet_(allData, col));

    const numRows = rangeEndRow - rangeStartRow + 1;
    const data = sheet.getRange(rangeStartRow, 1, numRows, maxCol).getValues();
    const maRange = sheet.getRange(rangeStartRow, col.MA_CONG_VIEC, numRows, 1);
    const maValues = maRange.getValues();

    let assigned = 0;
    let skipped = 0;
    let changed = false;

    for (let i = 0; i < data.length; i++) {
      const currentMa = maValues[i][0];
      const canAssign = laDongCanTuDongCapMaCongViecV1_(data[i], col);

      if (!canAssign) {
        if (currentMa) {
          maValues[i][0] = '';
          changed = true;
        }
        skipped++;
        continue;
      }

      if (currentMa) {
        skipped++;
        continue;
      }

      lastId++;
      maValues[i][0] = dinhDangMa_(lastId);
      assigned++;
      changed = true;
    }

    if (changed) {
      maRange.setValues(maValues);
      luuMaCongViecCuoi_(lastId);
      SpreadsheetApp.flush();
    }

    return { assigned, skipped };
  });
}

function laDongCanTuDongCapMaCongViecV1_(row, col) {
  const maCauTrucCol = col.MA_CAU_TRUC || 2;
  const tenCol = col.TEN_CV || col.TASK_NAME || 8;
  const soNgayCol = col.SO_NGAY || col.DURATION || 10;
  const refCol = col.SO_THAM_CHIEU || col.REF || 7;
  const maMauCol = col.MA_CV_MAU || col.MA_CONG_VIEC_MAU || 1;
  const phongBanCol = col.PHONG_BAN || 9;
  const predecessorCol = col.PREDECESSOR || 11;

  const maCauTruc = row[maCauTrucCol - 1];
  const ten = row[tenCol - 1];
  const soNgay = row[soNgayCol - 1];
  const predecessor = row[predecessorCol - 1];
  const ref = row[refCol - 1];
  const maMau = row[maMauCol - 1];
  const phongBan = row[phongBanCol - 1];

  if (typeof isDongNhomCauTrucV1_ === 'function' && isDongNhomCauTrucV1_(maCauTruc)) {
    return false;
  }

  if (typeof isDongCongViecChiTietV1_ === 'function') {
    return isDongCongViecChiTietV1_(maCauTruc, ten);
  }

  // Tranh cap ma cho dong nhom chi co tieu de.
  // Dong cong viec that thuong co ten + it nhat mot dau hieu van hanh: so ngay, lien ket, phong ban, ref, ma mau.
  if (coGiaTriAutoTaskIdV1_(ten) && (
    coGiaTriAutoTaskIdV1_(soNgay) ||
    coGiaTriAutoTaskIdV1_(predecessor) ||
    coGiaTriAutoTaskIdV1_(ref) ||
    coGiaTriAutoTaskIdV1_(maMau) ||
    coGiaTriAutoTaskIdV1_(phongBan)
  )) {
    return true;
  }

  // Truong hop paste du lieu thieu ten nhung da co so ngay/lien ket/ref thi van coi la dong cong viec can cap ma.
  return (
    coGiaTriAutoTaskIdV1_(soNgay) ||
    coGiaTriAutoTaskIdV1_(predecessor) ||
    coGiaTriAutoTaskIdV1_(ref) ||
    coGiaTriAutoTaskIdV1_(maMau)
  );
}

function coGiaTriAutoTaskIdV1_(value) {
  return value !== null && value !== '' && typeof value !== 'undefined';
}

// === AUTO_TASK_ID_ON_EDIT_V1_END ===


// === FIX_PREDECESSOR_TEXT_FORMULA_V1_START ===

/**
 * Sửa lỗi công thức liên kết động bị tách số dòng.
 *
 * Ví dụ lỗi:
 * =$G$1&""0&"FF"
 *
 * Sửa về:
 * =$G$10&"FF"
 *
 * Đồng thời bảo đảm công thức chỉ có số tiền nhiệm trả về text:
 * =$G$16&""
 */
function suaCongThucLienKetDongTraVeTextV1() {
  return chayCoKhoa_(() => {
    const ss = laySpreadsheetChoLienKetDongV1_();
    const sheet = ss.getSheetByName(CONFIG.SHEET.CONG_VIEC);
    if (!sheet) throw new Error('Khong tim thay sheet Cong_viec');

    const startRow = CONFIG.SYSTEM.START_ROW;
    const col = CONFIG.COLUMN.CONG_VIEC;
    const predCol = col.PREDECESSOR;
    const lastRow = sheet.getLastRow();

    if (lastRow < startRow) return 'Khong co du lieu de sua.';

    const numRows = lastRow - startRow + 1;
    const range = sheet.getRange(startRow, predCol, numRows, 1);
    const formulas = range.getFormulas();

    let changed = 0;

    for (let i = 0; i < formulas.length; i++) {
      const formula = formulas[i][0];
      if (!formula) continue;

      let newFormula = formula;

      // Sửa lỗi do regex cũ làm vỡ số dòng:
      // $G$1&""0 -> $G$10
      // $G$2&""8 -> $G$28
      // $G$10&""0 -> $G$100
      newFormula = newFormula.replace(/\$G\$(\d+)&""(\d+)/g, function(_, left, right) {
        return '$G$' + left + right;
      });

      // Nếu có dạng dư thừa $G$10&""&"FS" thì đưa về $G$10&"FS".
      newFormula = newFormula.replace(/(\$G\$\d+)&""&/g, '$1&');

      // Chỉ với công thức đơn thuần =$G$16 thì mới ép text thành =$G$16&"".
      if (/^=\$G\$\d+$/.test(newFormula)) {
        newFormula = newFormula + '&""';
      }

      if (newFormula !== formula) {
        sheet.getRange(startRow + i, predCol).setFormula(newFormula);
        changed++;
      }
    }

    range.setNumberFormat('@');

    SpreadsheetApp.flush();

    const message = 'Da sua cong thuc lien ket dong bi loi. So o da sua: ' + changed;
    Logger.log(message);
    return message;
  });
}

// === FIX_PREDECESSOR_TEXT_FORMULA_V1_END ===

