const CONFIG = {
  SYSTEM: {
    HEADER_ROW: 4,
    START_ROW: 5,
    TZ: Session.getScriptTimeZone(),
    DRY_RUN: false,
    SPREADSHEET_ID: '1XolJ5b2JGKcUYnoOTCUcK1S28d9fqpBhC4_VqCAQEl8',
  },

  SHEET: {
    CONG_VIEC: 'Cong_viec',
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
      LOI_TIEN_NHIEM: 17    // Q
    }
  },

  CONFIG_KEY: {
    LAST_TASK_ID: 'LAST_TASK_ID'
  }
};


