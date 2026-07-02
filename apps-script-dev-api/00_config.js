const CONFIG = {
  SYSTEM: {
    HEADER_ROW: 4,
    START_ROW: 5,
    TZ: Session.getScriptTimeZone(),
    DRY_RUN: false,
    SPREADSHEET_ID: '',
  },

  SHEET: {
    CONG_VIEC: 'Cong_viec',
    NS_KHONG_GAN_CV: 'NS_Khong_Gan_CV',
    CAU_HINH: 'Cau_hinh',
  },

  COLUMN: {
    CONG_VIEC: {
      MA_CV_MAU: 1,         // A
      MA_CAU_TRUC: 2,       // B
      ZONE: 3,              // C
      LOAI_CT: 4,           // D
      CONG_TRINH: 5,        // E
      HANG_MUC: 6,          // F
      SO_THAM_CHIEU: 7,     // G
      TEN_CV: 8,            // H
      PHONG_BAN: 9,         // I
      SO_NGAY: 10,          // J
      PREDECESSOR: 11,      // K
      START: 12,            // L
      END: 13,              // M
      NOTE: 14,             // N
      MA_CONG_VIEC: 15,     // O
      MA_MOC: 16,           // P
      LOI_TIEN_NHIEM: 17,   // Q
      TRANG_THAI_THUC_HIEN: 18, // R
      BAT_DAU_THUC_TE: 19,  // S
      HOAN_THANH_THUC_TE: 20, // T
      GHI_CHU_CAP_NHAT: 21, // U
      NGAY_CAP_NHAT: 22,    // V
      DIEU_CHINH_LIEN_KET: 23, // W
      WBS_LEVEL_SYS: 26,       // Z
      BUDGET_SPACER: 27,       // AA - cột đệm, không dùng cho dữ liệu nghiệp vụ
      DIRECT_COST_CEILING: 28, // AB
      PLANNED_REVENUE: 29,     // AC
      BUDGET_STATUS: 30        // AD
    }
  },

  CONFIG_KEY: {
    LAST_TASK_ID: 'LAST_TASK_ID'
  }
};

/**
 * Lấy Spreadsheet hiện tại.
 * Ưu tiên dùng cho container-bound Apps Script gắn trực tiếp với Google Sheet.
 * Nếu chạy trong ngữ cảnh không có active spreadsheet thì fallback sang:
 * 1) ScriptProperties.SPREADSHEET_ID
 * 2) CONFIG.SYSTEM.SPREADSHEET_ID nếu có
 * 3) CONFIG.SPREADSHEET_ID nếu có, chỉ để tương thích cũ
 */
function getCurrentSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  const propId = PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID');

  if (propId) return SpreadsheetApp.openById(propId);

  if (
    typeof CONFIG !== 'undefined' &&
    CONFIG &&
    CONFIG.SYSTEM &&
    CONFIG.SYSTEM.SPREADSHEET_ID
  ) {
    return SpreadsheetApp.openById(CONFIG.SYSTEM.SPREADSHEET_ID);
  }

  if (
    typeof CONFIG !== 'undefined' &&
    CONFIG &&
    CONFIG.SPREADSHEET_ID
  ) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }

  throw new Error(
    'Không xác định được Spreadsheet. Hãy mở từ Google Sheet hoặc cấu hình SPREADSHEET_ID trong Script Properties.'
  );
}


/**
 * Lấy ID Spreadsheet hiện tại.
 */
function getCurrentSpreadsheetId_() {
  return getCurrentSpreadsheet_().getId();
}


/**
 * Chạy thủ công một lần nếu cần lưu ID file hiện tại vào Script Properties.
 * Không bắt buộc dùng trong vận hành thường ngày.
 */
function setupCurrentSpreadsheetIdForTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error('Không tìm thấy active spreadsheet.');
  }

  PropertiesService
    .getScriptProperties()
    .setProperty('SPREADSHEET_ID', ss.getId());

  SpreadsheetApp.getUi().alert(
    'Đã lưu SPREADSHEET_ID hiện tại:\n' + ss.getId()
  );
}


function test_getCurrentSpreadsheetContext() {
  const ss = getCurrentSpreadsheet_();
  Logger.log('Spreadsheet name: ' + ss.getName());
  Logger.log('Spreadsheet ID: ' + ss.getId());
}


