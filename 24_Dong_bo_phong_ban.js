/*******************************************************
 * FILE: 24_Dong_bo_phong_ban.js
 *
 * MỤC TIÊU
 * - Đồng bộ mục tiêu từ Cong_viec về file phòng/ban dự án.
 * - Cập nhật kết quả từ file phòng/ban về Cong_viec.
 *
 * NGUYÊN TẮC
 * - Không thêm cột mới trong Cong_viec.
 * - Dùng Cong_viec!O:O - Mã công việc làm khóa đồng bộ.
 * - Dùng Cong_viec!I:I - Phòng ban chủ trì để phân bổ sheet.
 * - Sheet phòng/ban: A:M hiển thị; N:O là cột hệ thống ẩn.
 * - Chỉ dòng có cột O = MASTER tại sheet phòng/ban mới cập nhật về Master.
 * - Không ghi cột V Ngày cập nhật trong MVP.
 *******************************************************/

const DBPB_V1 = {
  SHEET: {
    CONG_VIEC: 'Cong_viec',
    CAU_HINH_DONG_BO: 'Cau_hinh_dong_bo',
    LOI_DONG_BO: 'Loi_dong_bo',
    NHAT_KY_DONG_BO: 'Nhat_ky_dong_bo',
  },

  MASTER: {
    HEADER_ROW: 4,
    DATA_START_ROW: 5,

    COL: {
      MA_CAU_TRUC: 2,          // B
      TEN_CONG_VIEC: 8,        // H
      PHONG_BAN_CHU_TRI: 9,    // I
      NGAY_BD_KH: 12,          // L
      NGAY_KT_KH: 13,          // M
      MA_CONG_VIEC: 15,        // O
      TRANG_THAI: 18,          // R
      BD_THUC_TE: 19,          // S
      HT_THUC_TE: 20,          // T
      GHI_CHU_CAP_NHAT: 21,    // U
      WBS_LEVEL_SYS: 26,       // Z
    },
  },

  PB: {
    HEADER_ROW: 4,
    DATA_START_ROW: 5,

    COL: {
      STT: 1,                  // A
      NOI_DUNG: 2,             // B
      NGAY_BD_KH: 3,           // C
      NGAY_KT_KH: 4,           // D
      KE_HOACH_NGAN_SACH: 5,   // E
      TRANG_THAI: 6,           // F
      BD_THUC_TE: 7,           // G
      HT_THUC_TE: 8,           // H
      NGAN_SACH_THUC_TE: 9,    // I
      NGUOI_CHU_TRI: 10,       // J
      NGUOI_PHOI_HOP: 11,      // K
      DIEU_KIEN_DAU_VAO: 12,   // L
      GHI_CHU_CAP_NHAT: 13,    // M
      MA_CV_MASTER: 14,        // N
      LOAI_DONG: 15,           // O
    },
  },

  STATUS: {
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    MASTER: 'MASTER',
    CHI_TIET: 'CHI_TIET',
  },

  COLOR: {
    MASTER_ROW: '#FFF2CC',
    NORMAL_ROW: '#FFFFFF',
  },
};


/**
 * Mapping tạm để đọc được dữ liệu hiện tại trong Cong_viec.
 * Sau khi chuẩn hóa cột I theo đúng mã phòng ban mới thì mapping này vẫn không ảnh hưởng.
 */
const DBPB_DEPT_ALIAS_V1 = {
  'UBNCSP': 'UBNCSP',
  'ỦY BAN R&D': 'UBNCSP',
  'UY BAN R&D': 'UBNCSP',

  'PTDA': 'PTDA',

  'KHDT': 'Kehoach',
  'KẾ HOẠCH': 'Kehoach',
  'KE HOACH': 'Kehoach',
  'KEHOACH': 'Kehoach',

  'PHAPCHE': 'Phapche',
  'PHÁP CHẾ': 'Phapche',
  'PHAP CHE': 'Phapche',

  'KYTHUAT': 'KSXD',
  'KỸ THUẬT': 'KSXD',
  'KY THUAT': 'KSXD',
  'KSXD': 'KSXD',

  'BQLDA': 'BQLDA',
  'QLDA': 'BQLDA',

  'MKT': 'MKT',
  'MKT-TRUYỀN THÔNG': 'MKT',
  'MKT-TRUYEN THONG': 'MKT',

  'KINHDOANH': 'KinhDoanh',
  'KINH DOANH': 'KinhDoanh',
  'QUẢN LÝ KINH DOANH': 'KinhDoanh',
  'QUAN LY KINH DOANH': 'KinhDoanh',

  'VANHANH': 'VanHanh',
  'VẬN HÀNH': 'VanHanh',
  'VAN HANH': 'VanHanh',
  'QUẢN LÝ & KHAI THÁC BĐS': 'VanHanh',
  'QUAN LY & KHAI THAC BDS': 'VanHanh',

  'TAICHINH': 'TaiChinh',
  'TÀI CHÍNH': 'TaiChinh',
  'TAI CHINH': 'TaiChinh',

  'KETOAN': 'KeToan',
  'KẾ TOÁN': 'KeToan',
  'KE TOAN': 'KeToan',

  'NHANSU': 'NhanSu',
  'NHÂN SỰ': 'NhanSu',
  'NHAN SU': 'NhanSu',

  'HANHCHINH': 'HanhChinh',
  'HÀNH CHÍNH': 'HanhChinh',
  'HANH CHINH': 'HanhChinh',

  'CNTT': 'CNTT',
  'QUẢN TRỊ HỆ THỐNG': 'CNTT',
  'QUAN TRI HE THONG': 'CNTT',

  'TROLY': 'Troly',
  'TRỢ LÝ - THƯ KÝ': 'Troly',
  'TRO LY - THU KY': 'Troly',
  'THƯ KÝ/TRỢ LÝ TGĐ': 'Troly',
  'THU KY/TRO LY TGD': 'Troly',

  'GPMB': 'GPMB',

  'DAUTHAU': 'Dauthau',
  'ĐẤU THẦU': 'Dauthau',
  'DAU THAU': 'Dauthau',
  'BP ĐẤU THẦU': 'Dauthau',
  'BP DAU THAU': 'Dauthau',

  'THIETKE': 'Thietke',
  'THIẾT KẾ KỸ THUẬT': 'Thietke',
  'THIET KE KY THUAT': 'Thietke',

  'TIEUCHUAN': 'Tieuchuan',
  'TIÊU CHUẨN': 'Tieuchuan',
  'TIEU CHUAN': 'Tieuchuan',

  'BIM': 'Bim',
};


/** =========================
 * MENU WRAPPERS
 * ========================= */

function taoMenuDongBoPhongBanV1_() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🔄 5. Đồng bộ phòng/ban')
    .addItem('✅ Kiểm tra dữ liệu đồng bộ', 'menuKiemTraDuLieuDongBoPhongBanV1')
    .addSeparator()
    .addItem('⬇️ Đẩy mục tiêu xuống phòng/ban', 'menuDongBoMucTieuVePhongBanV1')
    .addItem('⬆️ Cập nhật kết quả về Master', 'menuCapNhatKetQuaPhongBanVeMasterV1')
    .addSeparator()
    .addItem('📋 Xem nhật ký/lỗi đồng bộ', 'menuXemNhatKyLoiDongBoV1')
    .addToUi();
}

function menuKiemTraDuLieuDongBoPhongBanV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Đang kiểm tra dữ liệu đồng bộ...', 'Đồng bộ phòng/ban', 5);

  const result = kiemTraDuLieuDongBoPhongBanV1_();

  const message =
    'Đã kiểm tra dữ liệu đồng bộ.\n\n' +
    `Tổng lỗi: ${result.totalErrors}\n` +
    `Lỗi nghiêm trọng: ${result.criticalErrors}\n` +
    `Lỗi trung bình/nhẹ: ${result.totalErrors - result.criticalErrors}\n\n` +
    'Xem chi tiết tại sheet Loi_dong_bo.';

  ss.toast(message, 'Đồng bộ phòng/ban', 7);
  SpreadsheetApp.getUi().alert('Kiểm tra dữ liệu đồng bộ', message, SpreadsheetApp.getUi().ButtonSet.OK);

  return result;
}


function menuDongBoMucTieuVePhongBanV1() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const confirm = ui.alert(
    'Đẩy mục tiêu xuống phòng/ban',
    'Hệ thống sẽ đẩy/cập nhật các dòng từ Cong_viec xuống file phòng/ban theo Cau_hinh_dong_bo.\n\n' +
    'Nguyên tắc: chỉ cập nhật dòng MASTER theo Mã công việc; không xóa dòng con phòng/ban tự thêm.\n\n' +
    'Tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return 'Người dùng đã hủy thao tác.';

  ss.toast('Đang kiểm tra dữ liệu trước khi đồng bộ...', 'Đồng bộ phòng/ban', 5);

  const check = kiemTraDuLieuDongBoPhongBanV1_();

  if (check.criticalErrors > 0) {
    const message =
      'Không thể đồng bộ vì còn lỗi nghiêm trọng.\n\n' +
      `Số lỗi nghiêm trọng: ${check.criticalErrors}\n` +
      'Vui lòng xử lý tại sheet Loi_dong_bo trước khi chạy lại.';

    ui.alert('Dừng đồng bộ', message, ui.ButtonSet.OK);
    return message;
  }

  ss.toast('Đang đẩy mục tiêu xuống phòng/ban...', 'Đồng bộ phòng/ban', 5);

  const result = dongBoMucTieuVePhongBanV1_();

  const message =
    'Đã hoàn thành đẩy mục tiêu xuống phòng/ban.\n\n' +
    `Tổng dòng quét: ${result.scannedRows}\n` +
    `Dòng cập nhật/thêm mới: ${result.updatedRows}\n` +
    `Dòng lỗi: ${result.errorRows}\n\n` +
    'Xem nhật ký tại Nhat_ky_dong_bo.';

  ss.toast(message, 'Đồng bộ phòng/ban', 7);
  ui.alert('Đồng bộ hoàn tất', message, ui.ButtonSet.OK);

  return result;
}


function menuCapNhatKetQuaPhongBanVeMasterV1() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const confirm = ui.alert(
    'Cập nhật kết quả phòng/ban về Master',
    'Hệ thống sẽ đọc các sheet phòng/ban và cập nhật về Cong_viec.\n\n' +
    'Chỉ ghi các cột R:S:T:U.\n' +
    'Không ghi cột V Ngày cập nhật.\n' +
    'Không xử lý dòng con phòng/ban tự thêm.\n\n' +
    'Tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return 'Người dùng đã hủy thao tác.';

  ss.toast('Đang cập nhật kết quả về Master...', 'Đồng bộ phòng/ban', 5);

  const result = capNhatKetQuaPhongBanVeMasterV1_();

  const message =
    'Đã cập nhật kết quả phòng/ban về Master.\n\n' +
    `Tổng dòng quét: ${result.scannedRows}\n` +
    `Dòng cập nhật: ${result.updatedRows}\n` +
    `Dòng lỗi: ${result.errorRows}\n\n` +
    'Xem nhật ký tại Nhat_ky_dong_bo.';

  ss.toast(message, 'Đồng bộ phòng/ban', 7);
  ui.alert('Cập nhật hoàn tất', message, ui.ButtonSet.OK);

  return result;
}


function menuXemNhatKyLoiDongBoV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DBPB_V1.SHEET.NHAT_KY_DONG_BO)
    || ss.getSheetByName(DBPB_V1.SHEET.LOI_DONG_BO);

  if (sheet) {
    ss.setActiveSheet(sheet);
    return 'Đã mở sheet nhật ký/lỗi đồng bộ.';
  }

  SpreadsheetApp.getUi().alert(
    'Không tìm thấy sheet',
    'Không tìm thấy Nhat_ky_dong_bo hoặc Loi_dong_bo.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return 'Không tìm thấy sheet nhật ký/lỗi đồng bộ.';
}


/** =========================
 * CORE: KIỂM TRA DỮ LIỆU
 * ========================= */

function kiemTraDuLieuDongBoPhongBanV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = laySheetBatBuocDongBoV1_(ss, DBPB_V1.SHEET.CONG_VIEC);
  const loiSheet = laySheetBatBuocDongBoV1_(ss, DBPB_V1.SHEET.LOI_DONG_BO);

  xoaDuLieuCuSheetV1_(loiSheet, 2);

  const configList = docCauHinhDongBoV1_();
  const configByDept = taoMapCauHinhTheoPhongBanV1_(configList);

  const errors = [];
  const activeConfigList = configList.filter(item => item.trangThai === DBPB_V1.STATUS.ACTIVE);

  // 1. Kiểm tra cấu hình file/sheet phòng ban
  activeConfigList.forEach(cfg => {
    if (!cfg.idFilePhongBan) {
      errors.push(taoLoiDongBoV1_({
        row: '',
        maCongViec: '',
        maPhongBan: cfg.maPhongBan,
        loaiLoi: 'Thiếu cấu hình',
        mucLoi: 'Nghiêm trọng',
        noiDung: `Thiếu ID file phòng ban dự án cho mã phòng ban ${cfg.maPhongBan}.`,
        huongXuLy: 'Điền ID file phòng ban dự án trong Cau_hinh_dong_bo.',
      }));
      return;
    }

    if (!cfg.tenSheetPhongBan) {
      errors.push(taoLoiDongBoV1_({
        row: '',
        maCongViec: '',
        maPhongBan: cfg.maPhongBan,
        loaiLoi: 'Thiếu cấu hình',
        mucLoi: 'Nghiêm trọng',
        noiDung: `Thiếu tên sheet phòng ban cho mã phòng ban ${cfg.maPhongBan}.`,
        huongXuLy: 'Điền tên sheet phòng ban trong Cau_hinh_dong_bo.',
      }));
      return;
    }

    try {
      const pbFile = SpreadsheetApp.openById(cfg.idFilePhongBan);
      const pbSheet = pbFile.getSheetByName(cfg.tenSheetPhongBan);

      if (!pbSheet) {
        errors.push(taoLoiDongBoV1_({
          row: '',
          maCongViec: '',
          maPhongBan: cfg.maPhongBan,
          loaiLoi: 'Không tìm thấy sheet',
          mucLoi: 'Nghiêm trọng',
          noiDung: `Không tìm thấy sheet ${cfg.tenSheetPhongBan} trong file phòng ban.`,
          huongXuLy: 'Kiểm tra lại tên sheet phòng ban hoặc tạo sheet còn thiếu.',
        }));
      }
    } catch (err) {
      errors.push(taoLoiDongBoV1_({
        row: '',
        maCongViec: '',
        maPhongBan: cfg.maPhongBan,
        loaiLoi: 'Không mở được file',
        mucLoi: 'Nghiêm trọng',
        noiDung: `Không mở được file phòng ban: ${err.message}`,
        huongXuLy: 'Kiểm tra quyền truy cập và ID file phòng ban dự án.',
      }));
    }
  });

  // 2. Kiểm tra dữ liệu Cong_viec
  const values = layDuLieuMasterCongViecV1_(masterSheet);
  const maCongViecCount = {};

  values.forEach(item => {
    const row = item.rowIndex;
    const maCongViec = item.maCongViec;
    const phongBanRaw = item.phongBanChuTri;
    const phongBan = chuanHoaMaPhongBanDongBoV1_(phongBanRaw);
    const tenCongViec = item.tenCongViec;

    if (!tenCongViec && !maCongViec && !phongBanRaw) return;

    if (maCongViec) {
      maCongViecCount[maCongViec] = (maCongViecCount[maCongViec] || 0) + 1;
    }

    if (phongBanRaw) {
      if (!maCongViec) {
        errors.push(taoLoiDongBoV1_({
          row,
          maCongViec,
          maPhongBan: phongBanRaw,
          loaiLoi: 'Thiếu mã công việc',
          mucLoi: 'Nghiêm trọng',
          noiDung: `Dòng ${row} có phòng ban chủ trì nhưng thiếu Mã công việc tại cột O.`,
          huongXuLy: 'Chạy chức năng cấp mã công việc còn thiếu hoặc nhập mã công việc.',
        }));
      }

      if (!phongBan || !configByDept[phongBan]) {
        errors.push(taoLoiDongBoV1_({
          row,
          maCongViec,
          maPhongBan: phongBanRaw,
          loaiLoi: 'Sai mã phòng ban',
          mucLoi: 'Nghiêm trọng',
          noiDung: `Phòng ban chủ trì "${phongBanRaw}" không khớp Cau_hinh_dong_bo.`,
          huongXuLy: 'Chuẩn hóa cột I hoặc bổ sung mapping trong code nếu là tên cũ.',
        }));
      }
    }
  });

  Object.keys(maCongViecCount).forEach(ma => {
    if (maCongViecCount[ma] > 1) {
      errors.push(taoLoiDongBoV1_({
        row: '',
        maCongViec: ma,
        maPhongBan: '',
        loaiLoi: 'Trùng mã công việc',
        mucLoi: 'Nghiêm trọng',
        noiDung: `Mã công việc "${ma}" đang bị trùng ${maCongViecCount[ma]} lần trong Cong_viec.`,
        huongXuLy: 'Kiểm tra và cấp lại mã công việc duy nhất.',
      }));
    }
  });

  if (errors.length > 0) {
    ghiDanhSachLoiDongBoV1_(errors);
  }

  const criticalErrors = errors.filter(e => e.mucLoi === 'Nghiêm trọng').length;

  ghiNhatKyDongBoV1_({
    hanhDong: 'Kiểm tra dữ liệu đồng bộ',
    maDuAn: '37-8.NC',
    maPhongBan: '',
    sheetNguon: DBPB_V1.SHEET.CONG_VIEC,
    sheetDich: DBPB_V1.SHEET.LOI_DONG_BO,
    tongDongQuet: values.length,
    dongCapNhat: 0,
    dongLoi: errors.length,
    trangThai: errors.length ? 'Có lỗi' : 'Thành công',
    ghiChu: `Lỗi nghiêm trọng: ${criticalErrors}`,
  });

  return {
    totalErrors: errors.length,
    criticalErrors,
  };
}


/** =========================
 * CORE: ĐẨY MỤC TIÊU XUỐNG PHÒNG/BAN
 * ========================= */

function dongBoMucTieuVePhongBanV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = laySheetBatBuocDongBoV1_(ss, DBPB_V1.SHEET.CONG_VIEC);

  const configList = docCauHinhDongBoV1_();
  const configByDept = taoMapCauHinhTheoPhongBanV1_(configList);
  const masterRows = layDuLieuMasterCongViecV1_(masterSheet);

  let scannedRows = 0;
  let updatedRows = 0;
  let errorRows = 0;
  const errors = [];

  const rowsByDept = {};

  masterRows.forEach(item => {
    if (!item.tenCongViec && !item.maCongViec && !item.phongBanChuTri) return;

    scannedRows++;

    const deptCode = chuanHoaMaPhongBanDongBoV1_(item.phongBanChuTri);

    if (!deptCode) return;

    const cfg = configByDept[deptCode];

    if (!cfg) {
      errorRows++;
      errors.push(taoLoiDongBoV1_({
        row: item.rowIndex,
        maCongViec: item.maCongViec,
        maPhongBan: item.phongBanChuTri,
        loaiLoi: 'Không có cấu hình',
        mucLoi: 'Nghiêm trọng',
        noiDung: `Không tìm thấy cấu hình Active cho phòng ban ${item.phongBanChuTri}.`,
        huongXuLy: 'Kiểm tra Cau_hinh_dong_bo.',
      }));
      return;
    }

    if (!item.maCongViec) {
      errorRows++;
      errors.push(taoLoiDongBoV1_({
        row: item.rowIndex,
        maCongViec: item.maCongViec,
        maPhongBan: item.phongBanChuTri,
        loaiLoi: 'Thiếu mã công việc',
        mucLoi: 'Nghiêm trọng',
        noiDung: `Dòng ${item.rowIndex} thiếu Mã công việc tại cột O.`,
        huongXuLy: 'Cấp mã công việc trước khi đồng bộ.',
      }));
      return;
    }

    if (!rowsByDept[deptCode]) rowsByDept[deptCode] = [];
    rowsByDept[deptCode].push(item);
  });

  Object.keys(rowsByDept).forEach(deptCode => {
    const cfg = configByDept[deptCode];

    try {
      const pbFile = SpreadsheetApp.openById(cfg.idFilePhongBan);
      const pbSheet = pbFile.getSheetByName(cfg.tenSheetPhongBan);

      if (!pbSheet) throw new Error(`Không tìm thấy sheet ${cfg.tenSheetPhongBan}`);

      const result = upsertMucTieuVaoSheetPhongBanV1_(pbSheet, rowsByDept[deptCode]);
      updatedRows += result.updatedRows;
      errorRows += result.errorRows;
      errors.push(...result.errors);

      ghiNhatKyDongBoV1_({
        hanhDong: 'Đẩy mục tiêu xuống phòng/ban',
        maDuAn: cfg.maDuAn,
        maPhongBan: deptCode,
        sheetNguon: DBPB_V1.SHEET.CONG_VIEC,
        sheetDich: cfg.tenSheetPhongBan,
        tongDongQuet: rowsByDept[deptCode].length,
        dongCapNhat: result.updatedRows,
        dongLoi: result.errorRows,
        trangThai: result.errorRows ? 'Có lỗi' : 'Thành công',
        ghiChu: cfg.tenFilePhongBan,
      });
    } catch (err) {
      errorRows += rowsByDept[deptCode].length;
      errors.push(taoLoiDongBoV1_({
        row: '',
        maCongViec: '',
        maPhongBan: deptCode,
        loaiLoi: 'Lỗi ghi file phòng ban',
        mucLoi: 'Nghiêm trọng',
        noiDung: err.message,
        huongXuLy: 'Kiểm tra file ID, quyền truy cập và tên sheet phòng ban.',
      }));

      ghiNhatKyDongBoV1_({
        hanhDong: 'Đẩy mục tiêu xuống phòng/ban',
        maDuAn: cfg ? cfg.maDuAn : '37-8.NC',
        maPhongBan: deptCode,
        sheetNguon: DBPB_V1.SHEET.CONG_VIEC,
        sheetDich: cfg ? cfg.tenSheetPhongBan : '',
        tongDongQuet: rowsByDept[deptCode].length,
        dongCapNhat: 0,
        dongLoi: rowsByDept[deptCode].length,
        trangThai: 'Thất bại',
        ghiChu: err.message,
      });
    }
  });

  if (errors.length > 0) {
    ghiDanhSachLoiDongBoV1_(errors);
  }

  return { scannedRows, updatedRows, errorRows };
}


function upsertMucTieuVaoSheetPhongBanV1_(pbSheet, rows) {
  const errors = [];
  let updatedRows = 0;
  let errorRows = 0;

  const existingMap = layMapMaCongViecMasterTrongSheetPBV1_(pbSheet);

  rows.forEach(item => {
    const ma = item.maCongViec;
    const rowData = [
      item.maCauTruc,
      item.tenCongViec,
      item.ngayBdKh || '',
      item.ngayKtKh || '',
    ];

    try {
      let targetRow = existingMap[ma];

      if (targetRow) {
        // Cập nhật A:D, giữ nguyên E:M, cập nhật N:O.
        pbSheet.getRange(targetRow, DBPB_V1.PB.COL.STT, 1, 4).setValues([rowData]);
        pbSheet.getRange(targetRow, DBPB_V1.PB.COL.MA_CV_MASTER, 1, 2)
          .setValues([[ma, DBPB_V1.STATUS.MASTER]]);
      } else {
        targetRow = timDongThemMoiSheetPBV1_(pbSheet);

        const fullRow = new Array(15).fill('');
        fullRow[DBPB_V1.PB.COL.STT - 1] = item.maCauTruc;
        fullRow[DBPB_V1.PB.COL.NOI_DUNG - 1] = item.tenCongViec;
        fullRow[DBPB_V1.PB.COL.NGAY_BD_KH - 1] = item.ngayBdKh || '';
        fullRow[DBPB_V1.PB.COL.NGAY_KT_KH - 1] = item.ngayKtKh || '';
        fullRow[DBPB_V1.PB.COL.MA_CV_MASTER - 1] = ma;
        fullRow[DBPB_V1.PB.COL.LOAI_DONG - 1] = DBPB_V1.STATUS.MASTER;

        pbSheet.getRange(targetRow, 1, 1, 15).setValues([fullRow]);
        existingMap[ma] = targetRow;
      }

      dinhDangDongMasterPhongBanV1_(pbSheet, targetRow);
      updatedRows++;
    } catch (err) {
      errorRows++;
      errors.push(taoLoiDongBoV1_({
        row: item.rowIndex,
        maCongViec: item.maCongViec,
        maPhongBan: item.phongBanChuTri,
        loaiLoi: 'Lỗi upsert phòng ban',
        mucLoi: 'Nghiêm trọng',
        noiDung: err.message,
        huongXuLy: 'Kiểm tra sheet phòng ban và vùng cột hệ thống N:O.',
      }));
    }
  });

  SpreadsheetApp.flush();

  return { updatedRows, errorRows, errors };
}


/** =========================
 * CORE: CẬP NHẬT KẾT QUẢ VỀ MASTER
 * ========================= */

function capNhatKetQuaPhongBanVeMasterV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = laySheetBatBuocDongBoV1_(ss, DBPB_V1.SHEET.CONG_VIEC);

  const configList = docCauHinhDongBoV1_();
  const activeConfigList = configList.filter(item => item.trangThai === DBPB_V1.STATUS.ACTIVE);

  const masterMap = layMapMaCongViecMasterV1_(masterSheet);

  let scannedRows = 0;
  let updatedRows = 0;
  let errorRows = 0;
  const errors = [];

  activeConfigList.forEach(cfg => {
    try {
      const pbFile = SpreadsheetApp.openById(cfg.idFilePhongBan);
      const pbSheet = pbFile.getSheetByName(cfg.tenSheetPhongBan);

      if (!pbSheet) throw new Error(`Không tìm thấy sheet ${cfg.tenSheetPhongBan}`);

      const pbValues = layDuLieuSheetPBV1_(pbSheet);

      pbValues.forEach(item => {
        scannedRows++;

        if (!item.maCongViecMaster) return;
        if (item.loaiDong !== DBPB_V1.STATUS.MASTER) return;

        const masterRow = masterMap[item.maCongViecMaster];

        if (!masterRow) {
          errorRows++;
          errors.push(taoLoiDongBoV1_({
            row: '',
            maCongViec: item.maCongViecMaster,
            maPhongBan: cfg.maPhongBan,
            loaiLoi: 'Không tìm thấy mã Master',
            mucLoi: 'Nghiêm trọng',
            noiDung: `Không tìm thấy Mã công việc ${item.maCongViecMaster} trong Cong_viec.`,
            huongXuLy: 'Kiểm tra cột O của Cong_viec và cột N của sheet phòng/ban.',
          }));
          return;
        }

        // Nếu phòng/ban chưa nhập gì ở F/G/H/M thì bỏ qua, tránh ghi rỗng về Master.
        const coDuLieuCapNhat =
          item.trangThai || item.bdThucTe || item.htThucTe || item.ghiChuCapNhat;

        if (!coDuLieuCapNhat) return;

        const currentMaster = masterSheet
          .getRange(masterRow, DBPB_V1.MASTER.COL.TRANG_THAI, 1, 4)
          .getValues()[0];

        const nextMaster = [
          item.trangThai || currentMaster[0],
          item.bdThucTe || currentMaster[1],
          item.htThucTe || currentMaster[2],
          item.ghiChuCapNhat || currentMaster[3],
        ];

        masterSheet
          .getRange(masterRow, DBPB_V1.MASTER.COL.TRANG_THAI, 1, 4)
          .setValues([nextMaster]);

        updatedRows++;
      });

      ghiNhatKyDongBoV1_({
        hanhDong: 'Cập nhật kết quả phòng/ban về Master',
        maDuAn: cfg.maDuAn,
        maPhongBan: cfg.maPhongBan,
        sheetNguon: cfg.tenSheetPhongBan,
        sheetDich: DBPB_V1.SHEET.CONG_VIEC,
        tongDongQuet: pbValues.length,
        dongCapNhat: updatedRows,
        dongLoi: errorRows,
        trangThai: errorRows ? 'Có lỗi' : 'Thành công',
        ghiChu: 'Chỉ ghi R:S:T:U, không ghi V.',
      });
    } catch (err) {
      errorRows++;
      errors.push(taoLoiDongBoV1_({
        row: '',
        maCongViec: '',
        maPhongBan: cfg.maPhongBan,
        loaiLoi: 'Lỗi cập nhật về Master',
        mucLoi: 'Nghiêm trọng',
        noiDung: err.message,
        huongXuLy: 'Kiểm tra quyền truy cập file phòng/ban và cấu hình sheet.',
      }));

      ghiNhatKyDongBoV1_({
        hanhDong: 'Cập nhật kết quả phòng/ban về Master',
        maDuAn: cfg.maDuAn,
        maPhongBan: cfg.maPhongBan,
        sheetNguon: cfg.tenSheetPhongBan,
        sheetDich: DBPB_V1.SHEET.CONG_VIEC,
        tongDongQuet: 0,
        dongCapNhat: 0,
        dongLoi: 1,
        trangThai: 'Thất bại',
        ghiChu: err.message,
      });
    }
  });

  if (errors.length > 0) {
    ghiDanhSachLoiDongBoV1_(errors);
  }

  SpreadsheetApp.flush();

  return { scannedRows, updatedRows, errorRows };
}


/** =========================
 * ĐỌC CẤU HÌNH
 * ========================= */

function docCauHinhDongBoV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = laySheetBatBuocDongBoV1_(ss, DBPB_V1.SHEET.CAU_HINH_DONG_BO);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  const values = sheet.getRange(1, 1, lastRow, 11).getValues();
  const header = values[0].map(v => String(v).trim());
  const map = taoHeaderMapDongBoV1_(header);

  return values.slice(1)
    .filter(row => row.join('').trim() !== '')
    .map(row => ({
      maDuAn: getByHeaderDongBoV1_(row, map, 'Mã dự án'),
      tenDuAn: getByHeaderDongBoV1_(row, map, 'Tên dự án'),
      maPhongBan: getByHeaderDongBoV1_(row, map, 'Mã phòng ban'),
      tenFilePhongBan: getByHeaderDongBoV1_(row, map, 'Tên file phòng ban dự án'),
      idFilePhongBan: getByHeaderDongBoV1_(row, map, 'ID file phòng ban dự án'),
      tenSheetPhongBan: getByHeaderDongBoV1_(row, map, 'Tên sheet phòng ban'),
      tenFileKeHoachThang: getByHeaderDongBoV1_(row, map, 'Tên file kế hoạch tháng'),
      idFileKeHoachThang: getByHeaderDongBoV1_(row, map, 'ID file kế hoạch tháng'),
      tenSheetKeHoachThang: getByHeaderDongBoV1_(row, map, 'Tên sheet kế hoạch tháng'),
      trangThai: getByHeaderDongBoV1_(row, map, 'Trạng thái'),
      ghiChu: getByHeaderDongBoV1_(row, map, 'Ghi chú'),
    }));
}


function taoMapCauHinhTheoPhongBanV1_(configList) {
  const map = {};

  configList.forEach(cfg => {
    if (cfg.trangThai !== DBPB_V1.STATUS.ACTIVE) return;
    if (!cfg.maPhongBan) return;

    map[cfg.maPhongBan] = cfg;
  });

  return map;
}


/** =========================
 * ĐỌC DỮ LIỆU MASTER / PB
 * ========================= */

function layDuLieuMasterCongViecV1_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < DBPB_V1.MASTER.DATA_START_ROW) return [];

  const numRows = lastRow - DBPB_V1.MASTER.DATA_START_ROW + 1;
  const values = sheet.getRange(DBPB_V1.MASTER.DATA_START_ROW, 1, numRows, 26).getValues();

  return values.map((row, i) => ({
    rowIndex: DBPB_V1.MASTER.DATA_START_ROW + i,
    maCauTruc: row[DBPB_V1.MASTER.COL.MA_CAU_TRUC - 1],
    tenCongViec: row[DBPB_V1.MASTER.COL.TEN_CONG_VIEC - 1],
    phongBanChuTri: row[DBPB_V1.MASTER.COL.PHONG_BAN_CHU_TRI - 1],
    ngayBdKh: row[DBPB_V1.MASTER.COL.NGAY_BD_KH - 1],
    ngayKtKh: row[DBPB_V1.MASTER.COL.NGAY_KT_KH - 1],
    maCongViec: String(row[DBPB_V1.MASTER.COL.MA_CONG_VIEC - 1] || '').trim(),
    wbsLevel: row[DBPB_V1.MASTER.COL.WBS_LEVEL_SYS - 1],
  }));
}


function layMapMaCongViecMasterV1_(masterSheet) {
  const values = layDuLieuMasterCongViecV1_(masterSheet);
  const map = {};

  values.forEach(item => {
    if (item.maCongViec) {
      map[item.maCongViec] = item.rowIndex;
    }
  });

  return map;
}


function layDuLieuSheetPBV1_(pbSheet) {
  const lastRow = pbSheet.getLastRow();

  if (lastRow < DBPB_V1.PB.DATA_START_ROW) return [];

  const numRows = lastRow - DBPB_V1.PB.DATA_START_ROW + 1;
  const values = pbSheet.getRange(DBPB_V1.PB.DATA_START_ROW, 1, numRows, 15).getValues();

  return values.map((row, i) => ({
    rowIndex: DBPB_V1.PB.DATA_START_ROW + i,
    trangThai: row[DBPB_V1.PB.COL.TRANG_THAI - 1],
    bdThucTe: row[DBPB_V1.PB.COL.BD_THUC_TE - 1],
    htThucTe: row[DBPB_V1.PB.COL.HT_THUC_TE - 1],
    ghiChuCapNhat: row[DBPB_V1.PB.COL.GHI_CHU_CAP_NHAT - 1],
    maCongViecMaster: String(row[DBPB_V1.PB.COL.MA_CV_MASTER - 1] || '').trim(),
    loaiDong: String(row[DBPB_V1.PB.COL.LOAI_DONG - 1] || '').trim(),
  }));
}


function layMapMaCongViecMasterTrongSheetPBV1_(pbSheet) {
  const map = {};
  const lastRow = pbSheet.getLastRow();

  if (lastRow < DBPB_V1.PB.DATA_START_ROW) return map;

  const numRows = lastRow - DBPB_V1.PB.DATA_START_ROW + 1;
  const values = pbSheet
    .getRange(DBPB_V1.PB.DATA_START_ROW, DBPB_V1.PB.COL.MA_CV_MASTER, numRows, 2)
    .getValues();

  values.forEach((row, i) => {
    const ma = String(row[0] || '').trim();
    const loaiDong = String(row[1] || '').trim();

    if (ma && loaiDong === DBPB_V1.STATUS.MASTER && !map[ma]) {
      map[ma] = DBPB_V1.PB.DATA_START_ROW + i;
    }
  });

  return map;
}


/** =========================
 * GHI LOG / LỖI
 * ========================= */

function ghiDanhSachLoiDongBoV1_(errors) {
  if (!errors || errors.length === 0) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = laySheetBatBuocDongBoV1_(ss, DBPB_V1.SHEET.LOI_DONG_BO);

  const rows = errors.map(e => ([
    new Date(),
    e.sheetNguon || DBPB_V1.SHEET.CONG_VIEC,
    e.row || '',
    e.maCongViec || '',
    e.maPhongBan || '',
    e.loaiLoi || '',
    e.mucLoi || 'Nghiêm trọng',
    e.noiDung || '',
    e.huongXuLy || '',
    'Mới ghi nhận',
  ]));

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 10).setValues(rows);
}


function ghiNhatKyDongBoV1_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DBPB_V1.SHEET.NHAT_KY_DONG_BO);

  if (!sheet) return;

  const userEmail = layEmailNguoiDungDongBoV1_();

  sheet.appendRow([
    new Date(),
    userEmail,
    payload.hanhDong || '',
    payload.maDuAn || '',
    payload.maPhongBan || '',
    payload.sheetNguon || '',
    payload.sheetDich || '',
    payload.tongDongQuet || 0,
    payload.dongCapNhat || 0,
    payload.dongLoi || 0,
    payload.trangThai || '',
    payload.ghiChu || '',
  ]);
}


function taoLoiDongBoV1_(payload) {
  return {
    sheetNguon: payload.sheetNguon || DBPB_V1.SHEET.CONG_VIEC,
    row: payload.row || '',
    maCongViec: payload.maCongViec || '',
    maPhongBan: payload.maPhongBan || '',
    loaiLoi: payload.loaiLoi || '',
    mucLoi: payload.mucLoi || 'Nghiêm trọng',
    noiDung: payload.noiDung || '',
    huongXuLy: payload.huongXuLy || '',
  };
}


/** =========================
 * TIỆN ÍCH
 * ========================= */

function laySheetBatBuocDongBoV1_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Không tìm thấy sheet ${sheetName}`);
  return sheet;
}


function xoaDuLieuCuSheetV1_(sheet, startRow) {
  const lastRow = sheet.getLastRow();
  if (lastRow >= startRow) {
    sheet.getRange(startRow, 1, lastRow - startRow + 1, sheet.getMaxColumns()).clearContent();
  }
}


function taoHeaderMapDongBoV1_(header) {
  const map = {};
  header.forEach((name, i) => {
    if (name) map[name] = i;
  });
  return map;
}


function getByHeaderDongBoV1_(row, map, headerName) {
  const index = map[headerName];
  if (index === undefined || index === null) return '';
  return String(row[index] || '').trim();
}


function chuanHoaMaPhongBanDongBoV1_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Nếu dữ liệu đã là mã chuẩn trong Cau_hinh_dong_bo thì trả về luôn.
  const chuan = [
    'UBNCSP', 'PTDA', 'Kehoach', 'Phapche', 'KSXD', 'BQLDA', 'MKT',
    'KinhDoanh', 'VanHanh', 'TaiChinh', 'KeToan', 'NhanSu',
    'HanhChinh', 'CNTT', 'Troly', 'GPMB', 'Dauthau', 'Thietke',
    'Tieuchuan', 'Bim'
  ];

  if (chuan.indexOf(raw) >= 0) return raw;

  const key = raw
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

  return DBPB_DEPT_ALIAS_V1[key] || '';
}


function timDongThemMoiSheetPBV1_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), DBPB_V1.PB.HEADER_ROW);
  return Math.max(lastRow + 1, DBPB_V1.PB.DATA_START_ROW);
}


function dinhDangDongMasterPhongBanV1_(sheet, row) {
  sheet.getRange(row, 1, 1, 13)
    .setBackground(DBPB_V1.COLOR.MASTER_ROW)
    .setVerticalAlignment('middle')
    .setWrap(true);

  sheet.getRange(row, 1, 1, 2).setFontWeight('bold');
}


function layEmailNguoiDungDongBoV1_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}
