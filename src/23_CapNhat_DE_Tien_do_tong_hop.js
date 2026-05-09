function capNhatSoNgayVaLienKet_TienDoTongHop_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const shCV = ss.getSheetByName('Cong_viec');
  const shTD = ss.getSheetByName('Tien_do_tong_hop');

  if (!shCV) throw new Error('Không tìm thấy sheet Cong_viec');
  if (!shTD) throw new Error('Không tìm thấy sheet Tien_do_tong_hop');

  const START_ROW = 5;

  const lastRowCV = shCV.getLastRow();
  const lastRowTD = shTD.getLastRow();

  if (lastRowCV < START_ROW || lastRowTD < START_ROW) return;

  // Cong_viec: G = Ref, J = Số ngày kế hoạch, K = Công việc liên kết
  const dataCV = shCV
    .getRange(START_ROW, 7, lastRowCV - START_ROW + 1, 5)
    .getValues();

  const mapCV = new Map();

  dataCV.forEach(row => {
    const ref = String(row[0] || '').trim(); // G
    if (!ref) return;

    const soNgayKeHoach = chuanHoaSoNgayKeHoach_(row[3]); // J
    const congViecLienKet = String(row[4] || '').trim();  // K

    mapCV.set(ref, [soNgayKeHoach, congViecLienKet]);
  });

  // Tien_do_tong_hop: A = Ref
  const refsTD = shTD
    .getRange(START_ROW, 1, lastRowTD - START_ROW + 1, 1)
    .getValues();

  const output = refsTD.map(row => {
    const ref = String(row[0] || '').trim();
    return mapCV.get(ref) || ['', ''];
  });

  // Ghi vào Tien_do_tong_hop: D:E
  shTD
    .getRange(START_ROW, 4, output.length, 2)
    .setValues(output);

  // D là số ngày, E là text liên kết
  shTD
    .getRange(START_ROW, 4, output.length, 1)
    .setNumberFormat('0');

  shTD
    .getRange(START_ROW, 5, output.length, 1)
    .setNumberFormat('@');
}


function chuanHoaSoNgayKeHoach_(value) {
  if (value === '' || value === null || value === undefined) return '';

  if (typeof value === 'number') return value;

  if (value instanceof Date) {
    const base = Date.UTC(1899, 11, 30);
    const current = Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    );

    return Math.round((current - base) / 86400000);
  }

  const text = String(value).trim();
  const number = Number(text.replace(',', '.'));

  return isNaN(number) ? text : number;
}