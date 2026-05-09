/***************************************
 * 16_Tao_ngay_nghi_tu_dong.js
 * Tự sinh dữ liệu sheet Ngay_nghi
 * Theo:
 * - NGAY_NEO_KE_HOACH trong sheet Cau_hinh
 * - GANTT_HORIZON_YEARS trong sheet Cau_hinh
 ***************************************/

const NN_SHEET_CAU_HINH = 'Cau_hinh';
const NN_SHEET_NGAY_NGHI = 'Ngay_nghi';

const NN_START_ROW = 5;
const NN_TIMEZONE = 'Asia/Ho_Chi_Minh';

// Tết âm lịch mặc định: 5 ngày, từ ngày trước Tết đến mùng 4.
// Muốn nghỉ dài hơn thì sửa mảng này, ví dụ [-2, -1, 0, 1, 2, 3, 4].
const NN_TET_OFFSETS = [-1, 0, 1, 2, 3];

function taoNgayNghiTuDong() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(NN_SHEET_NGAY_NGHI);

  if (!sh) {
    throw new Error('Không tìm thấy sheet Ngay_nghi');
  }

  const ngayNeo = nn_toDateOnly_(nn_getConfigValue_('NGAY_NEO_KE_HOACH')) || new Date();
  const soNam = Number(nn_getConfigValue_('GANTT_HORIZON_YEARS') || 5);

  // Sinh từ đầu năm của ngày neo đến hết năm cuối cùng của Gantt
  const startDate = new Date(ngayNeo.getFullYear(), 0, 1);
  const endDate = new Date(ngayNeo.getFullYear() + soNam, 11, 31);

  const ngayNghiMap = {};
  const holidayKeysForComp = new Set();

  // 1. Chủ nhật hằng tuần
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) {
      nn_addNgayNghi_(ngayNghiMap, d, 'Chủ nhật', 'Nghỉ tuần', 'Tự sinh theo lịch tuần');
    }
  }

  // 2. Lễ, Tết theo từng năm
  for (let y = startDate.getFullYear(); y <= endDate.getFullYear(); y++) {
    // Lễ / ngày nghỉ cố định theo năm dương lịch
    nn_addHoliday_(ngayNghiMap, holidayKeysForComp, new Date(y, 0, 1), 'Tết Dương lịch 01/01', 'Lễ dương lịch');
    nn_addHoliday_(ngayNghiMap, holidayKeysForComp, new Date(y, 3, 30), 'Ngày Giải phóng miền Nam 30/4', 'Lễ dương lịch');
    nn_addHoliday_(ngayNghiMap, holidayKeysForComp, new Date(y, 4, 1), 'Ngày Quốc tế Lao động 01/5', 'Lễ dương lịch');

    // Ngày nghỉ theo cấu hình nội bộ
    nn_addHoliday_(ngayNghiMap, holidayKeysForComp, new Date(y, 10, 24), 'Ngày Văn hóa Việt Nam 24/11', 'Ngày nghỉ theo cấu hình');

    // Quốc khánh: mặc định dùng 02/09 và 03/09.
    nn_addHoliday_(ngayNghiMap, holidayKeysForComp, new Date(y, 8, 2), 'Quốc khánh 02/9', 'Lễ dương lịch');
    nn_addHoliday_(ngayNghiMap, holidayKeysForComp, new Date(y, 8, 3), 'Nghỉ Quốc khánh ngày thứ hai', 'Lễ dương lịch');

    // Tết Âm lịch
    const tet = nn_lunarToSolarDate_(1, 1, y);
    if (tet) {
      NN_TET_OFFSETS.forEach(offset => {
        const d = nn_addCalendarDays_(tet, offset);
        nn_addHoliday_(ngayNghiMap, holidayKeysForComp, d, 'Tết Âm lịch', 'Tết âm lịch');
      });
    }

    // Giỗ Tổ Hùng Vương: 10/3 âm lịch
    const gioTo = nn_lunarToSolarDate_(10, 3, y);
    if (gioTo) {
      nn_addHoliday_(ngayNghiMap, holidayKeysForComp, gioTo, 'Giỗ Tổ Hùng Vương', 'Lễ âm lịch');
    }
  }

  // 3. Tự thêm ngày nghỉ bù nếu ngày lễ rơi vào Chủ nhật
  holidayKeysForComp.forEach(key => {
    const d = nn_dateFromKey_(key);

    if (d.getDay() !== 0) return;

    let comp = nn_addCalendarDays_(d, 1);

    // Nếu ngày nghỉ bù trùng ngày đã nghỉ thì đẩy tiếp
    while (ngayNghiMap[nn_dateKey_(comp)]) {
      comp = nn_addCalendarDays_(comp, 1);
    }

    nn_addNgayNghi_(
      ngayNghiMap,
      comp,
      'Nghỉ bù do ngày lễ trùng Chủ nhật',
      'Nghỉ bù',
      'Tự sinh'
    );
  });

  // 4. Ghi vào sheet Ngay_nghi
  const rows = Object.values(ngayNghiMap)
    .filter(item => item.date >= startDate && item.date <= endDate)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(item => [
      item.date,
      item.name,
      item.type,
      'Dùng',
      item.note || ''
    ]);

  const maxRows = sh.getMaxRows();

  if (maxRows >= NN_START_ROW) {
    sh.getRange(NN_START_ROW, 1, maxRows - NN_START_ROW + 1, 5).clearContent();
  }

  if (rows.length > 0) {
    sh.getRange(NN_START_ROW, 1, rows.length, 5).setValues(rows);
    sh.getRange(NN_START_ROW, 1, rows.length, 1).setNumberFormat('dd/MM/yyyy');
  }

  SpreadsheetApp.getUi().alert(
    'Đã tạo xong ' + rows.length + ' dòng ngày nghỉ từ ' +
    nn_formatDate_(startDate) + ' đến ' + nn_formatDate_(endDate)
  );
}

function nn_addHoliday_(map, holidayKeysForComp, dateValue, name, type) {
  const d = nn_toDateOnly_(dateValue);
  if (!d) return;

  nn_addNgayNghi_(map, d, name, type, 'Tự sinh');
  holidayKeysForComp.add(nn_dateKey_(d));
}

function nn_addNgayNghi_(map, dateValue, name, type, note) {
  const d = nn_toDateOnly_(dateValue);
  if (!d) return;

  const key = nn_dateKey_(d);

  if (!map[key]) {
    map[key] = {
      date: d,
      name: name,
      type: type,
      note: note
    };
    return;
  }

  if (!String(map[key].name).includes(name)) {
    map[key].name += ' / ' + name;
  }

  if (!String(map[key].type).includes(type)) {
    map[key].type += ' / ' + type;
  }
}

function nn_getConfigValue_(configCode) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(NN_SHEET_CAU_HINH);

  if (!sh) return '';

  const lastRow = sh.getLastRow();
  if (lastRow < 5) return '';

  const values = sh.getRange(5, 1, lastRow - 4, 8).getValues();

  for (let i = 0; i < values.length; i++) {
    const code = String(values[i][1] || '').trim();
    const use = String(values[i][7] || '').trim().toLowerCase();

    if (code === configCode && (use === '' || use === 'dùng' || use === 'dung')) {
      return values[i][3]; // Cột D = Giá trị 1
    }
  }

  return '';
}

function nn_toDateOnly_(value) {
  if (!value) return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'number') {
    const base = new Date(1899, 11, 30);
    const d = new Date(base.getTime() + value * 24 * 60 * 60 * 1000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  if (typeof value === 'string') {
    const text = value.trim();
    const m = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);

    if (m) {
      return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    }

    const d = new Date(text);
    if (!isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }

  return null;
}

function nn_addCalendarDays_(dateValue, days) {
  const d = nn_toDateOnly_(dateValue);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function nn_dateKey_(dateValue) {
  const d = nn_toDateOnly_(dateValue);
  return Utilities.formatDate(d, NN_TIMEZONE, 'yyyy-MM-dd');
}

function nn_dateFromKey_(key) {
  const parts = key.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function nn_formatDate_(dateValue) {
  const d = nn_toDateOnly_(dateValue);
  return Utilities.formatDate(d, NN_TIMEZONE, 'dd/MM/yyyy');
}

/*************************************************
 * PHẦN CHUYỂN ÂM LỊCH SANG DƯƠNG LỊCH
 * Dùng để tự sinh Tết Âm lịch và Giỗ Tổ Hùng Vương
 *************************************************/

function nn_INT_(d) {
  return Math.floor(d);
}

function nn_jdFromDate_(dd, mm, yy) {
  const a = nn_INT_((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;

  let jd = dd + nn_INT_((153 * m + 2) / 5) + 365 * y + nn_INT_(y / 4) - nn_INT_(y / 100) + nn_INT_(y / 400) - 32045;

  if (jd < 2299161) {
    jd = dd + nn_INT_((153 * m + 2) / 5) + 365 * y + nn_INT_(y / 4) - 32083;
  }

  return jd;
}

function nn_jdToDate_(jd) {
  let a, b, c;

  if (jd > 2299160) {
    a = jd + 32044;
    b = nn_INT_((4 * a + 3) / 146097);
    c = a - nn_INT_((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }

  const d = nn_INT_((4 * c + 3) / 1461);
  const e = c - nn_INT_((1461 * d) / 4);
  const m = nn_INT_((5 * e + 2) / 153);

  const day = e - nn_INT_((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * nn_INT_(m / 10);
  const year = b * 100 + d - 4800 + nn_INT_(m / 10);

  return [day, month, year];
}

function nn_newMoon_(k) {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = Math.PI / 180;

  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);

  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;

  const C1 =
    (0.1734 - 0.000393 * T) * Math.sin(M * dr) +
    0.0021 * Math.sin(2 * dr * M) -
    0.4068 * Math.sin(Mpr * dr) +
    0.0161 * Math.sin(2 * dr * Mpr) -
    0.0004 * Math.sin(3 * dr * Mpr) +
    0.0104 * Math.sin(2 * dr * F) -
    0.0051 * Math.sin((M + Mpr) * dr) -
    0.0074 * Math.sin((M - Mpr) * dr) +
    0.0004 * Math.sin((2 * F + M) * dr) -
    0.0004 * Math.sin((2 * F - M) * dr) -
    0.0006 * Math.sin((2 * F + Mpr) * dr) +
    0.0010 * Math.sin((2 * F - Mpr) * dr) +
    0.0005 * Math.sin((2 * Mpr + M) * dr);

  let deltat;

  if (T < -11) {
    deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
  } else {
    deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
  }

  return Jd1 + C1 - deltat;
}

function nn_getNewMoonDay_(k, timeZone) {
  return nn_INT_(nn_newMoon_(k) + 0.5 + timeZone / 24);
}

function nn_sunLongitude_(jdn) {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = Math.PI / 180;

  const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;

  const DL =
    (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * dr * M) +
    0.000290 * Math.sin(3 * dr * M);

  let L = L0 + DL;
  L = L * dr;
  L = L - Math.PI * 2 * nn_INT_(L / (Math.PI * 2));

  return L;
}

function nn_getSunLongitude_(dayNumber, timeZone) {
  return nn_INT_(nn_sunLongitude_(dayNumber - 0.5 - timeZone / 24) / Math.PI * 6);
}

function nn_getLunarMonth11_(yy, timeZone) {
  const off = nn_jdFromDate_(31, 12, yy) - 2415021;
  const k = nn_INT_(off / 29.530588853);
  let nm = nn_getNewMoonDay_(k, timeZone);
  const sunLong = nn_getSunLongitude_(nm, timeZone);

  if (sunLong >= 9) {
    nm = nn_getNewMoonDay_(k - 1, timeZone);
  }

  return nm;
}

function nn_getLeapMonthOffset_(a11, timeZone) {
  const k = nn_INT_((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = nn_getSunLongitude_(nn_getNewMoonDay_(k + i, timeZone), timeZone);

  do {
    last = arc;
    i++;
    arc = nn_getSunLongitude_(nn_getNewMoonDay_(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);

  return i - 1;
}

function nn_convertLunar2Solar_(lunarDay, lunarMonth, lunarYear, lunarLeap, timeZone) {
  let a11, b11;

  if (lunarMonth < 11) {
    a11 = nn_getLunarMonth11_(lunarYear - 1, timeZone);
    b11 = nn_getLunarMonth11_(lunarYear, timeZone);
  } else {
    a11 = nn_getLunarMonth11_(lunarYear, timeZone);
    b11 = nn_getLunarMonth11_(lunarYear + 1, timeZone);
  }

  const k = nn_INT_(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = lunarMonth - 11;

  if (off < 0) {
    off += 12;
  }

  if (b11 - a11 > 365) {
    const leapOff = nn_getLeapMonthOffset_(a11, timeZone);
    let leapMonth = leapOff - 2;

    if (leapMonth < 0) {
      leapMonth += 12;
    }

    if (lunarLeap !== 0 && lunarMonth !== leapMonth) {
      return [0, 0, 0];
    } else if (lunarLeap !== 0 || off >= leapOff) {
      off += 1;
    }
  }

  const monthStart = nn_getNewMoonDay_(k + off, timeZone);
  return nn_jdToDate_(monthStart + lunarDay - 1);
}

function nn_lunarToSolarDate_(lunarDay, lunarMonth, lunarYear) {
  const result = nn_convertLunar2Solar_(lunarDay, lunarMonth, lunarYear, 0, 7);

  if (!result || result[2] === 0) return null;

  return new Date(result[2], result[1] - 1, result[0]);
}