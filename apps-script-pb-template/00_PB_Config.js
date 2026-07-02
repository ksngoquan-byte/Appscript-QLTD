/**
 * PB Utility V1 - Cấu hình chung
 * Áp dụng cho PB template dùng chung và các file PB nhân bản sau này.
 */

const PBV1_CONFIG = {
  SCHEMA_VERSION: 'PB_DETAIL_V1',
  DATA_START_ROW: 5,
  HEADER_ROW: 4,
  DISPLAY_LAST_COL: 13, // A:M
  SYSTEM_START_COL: 14, // N
  SYSTEM_COL_COUNT: 5,  // N:R
  SYSTEM_LAST_COL: 18,  // R

  SHEET_NAMES: [
    'UBNCSP', 'PTDA', 'Kehoach', 'Phapche', 'KSXD', 'BQLDA',
    'MKT', 'KinhDoanh', 'VanHanh', 'TaiChinh', 'KeToan', 'NhanSu',
    'HanhChinh', 'CNTT', 'Troly', 'GPMB', 'Dauthau', 'Thietke',
    'Tieuchuan', 'Bim'
  ],

  EXCLUDE_SHEET_NAMES: [
    'Cau_hinh_PB',
    'Yeu_cau_dieu_chinh',
    'Loi_kiem_tra_PB',
    'Hang_doi_gui_Master',
    'Nhat_ky_gui_Master'
  ],

  SHEET_YEU_CAU_DIEU_CHINH: 'Yeu_cau_dieu_chinh',
  SHEET_LOI_KIEM_TRA: 'Loi_kiem_tra_PB',

  ADMIN_EMAILS: [
    'quannh.entiz@gmail.com',
    'ksngoquan@gmail.com'
  ],

  ADJUST_REQUEST_TO: 'quannh@entizgroup.com',
  ADJUST_REQUEST_CC: '',

  STATUS_VALUES: ['Hoàn thành', 'Chưa bắt đầu', 'Đang làm', 'Tạm dừng'],

  COLORS: {
    HEADER_BG: '#1F4E78',
    HEADER_FONT: '#FFFFFF',
    TITLE_BG: '#D9EAD3',
    SUBTITLE_BG: '#EAF2F8',
    MASTER_BG: '#D9EAD3',
    CONTEXT_BG: '#FCE4D6',
    DETAIL_BG: '#FFFFFF',
    ERROR_BG: '#F4CCCC',
    WARNING_BG: '#FFF2CC'
  },

  COLUMNS: {
    WBS: 1, NOI_DUNG: 2, BD_KE_HOACH: 3, KT_KE_HOACH: 4,
    NGAN_SACH_KH: 5, TRANG_THAI: 6, BD_THUC_TE: 7, HT_THUC_TE: 8,
    NGAN_SACH_TT: 9, NGUOI_CHU_TRI: 10, NGUOI_PHOI_HOP: 11,
    DIEU_KIEN_DAU_VAO: 12, GHI_CHU: 13, MA_MASTER: 14, LOAI_DONG: 15,
    DETAIL_TASK_ID: 16, TIEN_DO: 17, TRONG_SO: 18
  },

  ROW_TYPES: {
    MASTER: 'MASTER',
    CONTEXT: 'CONTEXT',
    DETAIL_SLOT: 'DETAIL_SLOT',
    PB_DETAIL: 'PB_DETAIL'
  }
};

function layCauHinhPBV1_(key, defaultValue) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Cau_hinh_PB');
  if (!sheet) return defaultValue;

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return defaultValue;

  const targetKey = String(key || '').trim();
  const values = sheet.getRange(1, 1, lastRow, 2).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() !== targetKey) continue;
    const value = String(values[i][1] || '').trim();
    return value || defaultValue;
  }
  return defaultValue;
}

function layTenDayDuDuAnPBV1_() {
  const tenDayDu = layCauHinhPBV1_('TEN_DAY_DU_DU_AN', '');
  if (tenDayDu) return tenDayDu;

  const tenDuAn = layCauHinhPBV1_('TEN_DU_AN', '');
  if (tenDuAn) return `Dự án ${tenDuAn}`;

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const title = String(sheet.getRange(1, 1).getDisplayValue() || '').trim();
    const tenTuTieuDe = title.replace(/^KẾ HOẠCH CHI TIẾT\s*/i, '').trim();
    if (tenTuTieuDe) return tenTuTieuDe;
  } catch (err) {}

  return 'Dự án';
}
