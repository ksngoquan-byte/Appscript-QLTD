function taoMenu() {
  if (coHienThiMenuKhoiTaoFileV1_()) {
    taoMenuKhoiTaoVaCauHinhFileQltdV1_();
  }

  taoMenuNhapVaTinhTienDoQltdV1_();
  taoMenuTongHopVaGanttQltdV1_();
  taoMenuAnToanVaBaoTriQltdV1_();
}

function onOpen() {
  taoMenu();
}

const QLTD_SHOW_KHOI_TAO_MENU_PROP_V1 = 'QLTD_SHOW_KHOI_TAO_MENU_V1';

function coHienThiMenuKhoiTaoFileV1_() {
  const props = PropertiesService.getDocumentProperties();
  const value = props.getProperty(QLTD_SHOW_KHOI_TAO_MENU_PROP_V1);

  // Mặc định hiện menu khởi tạo để file mới/copy mới dễ dùng.
  return value !== '0';
}

function taoMenuKhoiTaoVaCauHinhFileQltdV1_() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🚀 1. Khởi tạo & cấu hình file')
    .addItem('🧭 Xem quy trình khởi tạo', 'menuXemQuyTrinhKhoiTaoFileV1')
    .addItem('1️⃣ Thiết lập nhanh bản sao mới', 'menuThietLapNhanhBanSaoMoiV1')
    .addSeparator()
    .addItem('🧩 Hoàn thiện TEMPLATE gốc', 'menuHoanThienTemplateGocQltdV1')
    .addItem('🌳 Thiết lập cột B/Z WBS', 'thietLapCotWbsCongViecV1')
    .addItem('🔗 Khởi tạo lại công thức cột K', 'menuKhoiTaoCongThucLienKetCotKV1')
    .addItem('📅 Tạo lại ngày nghỉ/lễ/tết', 'menuTaoLaiNgayNghiLeTetV1')
    .addItem('🆔 Cấp mã công việc còn thiếu', 'menuCapNhatMaCongViecV1')
    .addItem('🔧 Cài lại trigger tối ưu', 'menuCaiTriggerToiUuV1')
    .addItem('🧪 Kiểm tra trigger sau khởi tạo', 'kiemTraTriggerVanHanhTienDoV1')
    .addSeparator()
    .addItem('🗑️ Xóa sheet snapshot KH gốc cũ', 'menuXoaSheetSnapshotKeHoachGocCuV1')
    .addItem('⚠️ Xóa dữ liệu cũ và tạo lại từ TEMPLATE', 'menuXoaDuLieuCuVaTaoMoiTuTemplateV1')
    .addItem('👁️ Ẩn menu khởi tạo file', 'menuAnMenuKhoiTaoFileV1')
    .addToUi();
}

function menuXemQuyTrinhKhoiTaoFileV1() {
  const message =
    'QUY TRÌNH KHỞI TẠO FILE QL TIẾN ĐỘ\n\n' +
    'Bước 1: Tạo bản sao file mẫu.\n' +
    'Bước 2: Vào menu “🚀 1. Khởi tạo & cấu hình file”.\n' +
    'Bước 3: Bấm “1️⃣ Thiết lập nhanh bản sao mới”.\n' +
    'Bước 4: Kiểm tra trigger sau khởi tạo.\n' +
    'Bước 5: Kiểm tra sheet Cong_viec và Tien_do_tong_hop.\n' +
    'Bước 6: Nếu file đã sẵn sàng, bấm “Ẩn menu khởi tạo file” để tránh thao tác nhầm.\n\n' +
    'Lưu ý: Chức năng “Xóa dữ liệu cũ và tạo lại từ TEMPLATE” là thao tác reset mạnh, chỉ dùng khi cần tạo lại file vận hành từ template.';

  SpreadsheetApp.getUi().alert(
    'Quy trình khởi tạo file',
    message,
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return message;
}

function menuAnMenuKhoiTaoFileV1() {
  const props = PropertiesService.getDocumentProperties();
  props.setProperty(QLTD_SHOW_KHOI_TAO_MENU_PROP_V1, '0');

  const message =
    'Đã ẨN menu “🚀 1. Khởi tạo & cấu hình file”.\n' +
    'Vui lòng tải lại Google Sheet để áp dụng.\n\n' +
    'Khi cần bật lại, vào “🛡️ 4. An toàn & bảo trì” → “Bật/tắt menu khởi tạo file”.';

  SpreadsheetApp.getActiveSpreadsheet().toast(message, 'QLTD', 7);

  SpreadsheetApp.getUi().alert(
    'Ẩn menu khởi tạo file',
    message,
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return message;
}

function menuToggleMenuKhoiTaoFileV1() {
  const props = PropertiesService.getDocumentProperties();
  const current = coHienThiMenuKhoiTaoFileV1_();
  const next = !current;

  props.setProperty(QLTD_SHOW_KHOI_TAO_MENU_PROP_V1, next ? '1' : '0');

  const message = next
    ? 'Đã BẬT menu “🚀 1. Khởi tạo & cấu hình file”. Vui lòng tải lại Google Sheet để áp dụng.'
    : 'Đã TẮT menu “🚀 1. Khởi tạo & cấu hình file”. Vui lòng tải lại Google Sheet để áp dụng.';

  SpreadsheetApp.getActiveSpreadsheet().toast(message, 'QLTD', 7);

  SpreadsheetApp.getUi().alert(
    'Bật/tắt menu khởi tạo file',
    message,
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return message;
}

function taoMenuNhapVaTinhTienDoQltdV1_() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🧩 2. Nhập & tính tiến độ')
    .addItem('🔢 Cập nhật STT WBS', 'capNhatSttWbsCongViecV1')
    .addItem('🆔 Cấp mã công việc còn thiếu', 'menuCapNhatMaCongViecV1')
    .addSeparator()
    .addItem('👁️ Xem trạng thái cần tính lại', 'hienTrangThaiTinhLaiTienDoV1')
    .addItem('🔄 Chạy tính lại tiến độ J/L/M/Q', 'menuChayTinhLaiTienDoV1')
    .addItem('✅ Kiểm tra lỗi dữ liệu đầu vào', 'menuKiemTraDuLieuDauVaoV1')
    .addSeparator()
    .addItem('🔒 Lưu/khóa kế hoạch gốc', 'menuLuuKhoaKeHoachGocV1')
    .addToUi();
}

function taoMenuTongHopVaGanttQltdV1_() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('📊 3. Tổng hợp & Gantt')
    .addItem('📈 Cập nhật tổng hợp + Gantt', 'menuCapNhatTongHopGanttV1')
    .addItem('👁️ Hiện/ẩn kế hoạch gốc trên Gantt', 'menuToggleDuongGangKeHoachGocV1')
    .addSeparator()
    .addItem('🗂️ Tạo nhóm WBS tổng hợp', 'menuTaoNhomWbsTongHopV1')
    .addItem('🧹 Xóa nhóm WBS tổng hợp', 'menuXoaNhomWbsTongHopV1')
    .addToUi();
}

function taoMenuAnToanVaBaoTriQltdV1_() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🛡️ 4. An toàn & bảo trì')
    .addItem('👁️ Bật/tắt menu khởi tạo file', 'menuToggleMenuKhoiTaoFileV1')
    .addSeparator()
    .addItem('🧭 Chỉ hiện sheet vận hành', 'batCheDoChiHienSheetVanHanhV1')
    .addItem('🔓 Hiện lại toàn bộ sheet', 'hienLaiTatCaSheetV1')
    .addSeparator()
    .addItem('🟢 Bật trigger nền 10 phút', 'menuBatTriggerNenV1')
    .addItem('🔴 Tắt trigger nền 10 phút', 'menuTatTriggerNenV1')
    .addSeparator()
    .addItem('🛡️ Dọn cảnh báo bảo vệ Cong_viec', 'donCanhBaoBaoVeCongViecV1')
    .addItem('🧹 Dọn nền dòng trống', 'menuDonNenDongTrongV1')
    .addToUi();
}

function taoMenuThietLapQLTienDoV1_() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🚀 Thiết lập QL tiến độ')
    .addItem('🧨 0. Xóa dữ liệu cũ và tạo lại từ TEMPLATE', 'menuXoaDuLieuCuVaTaoMoiTuTemplateV1')
    .addItem('🗑️ 0.1 Xóa sheet snapshot KH gốc cũ', 'menuXoaSheetSnapshotKeHoachGocCuV1')
    .addSeparator()
    .addItem('1️⃣ Thiết lập nhanh bản sao mới', 'menuThietLapNhanhBanSaoMoiV1')
    .addItem('🧩 Hoàn thiện TEMPLATE gốc', 'menuHoanThienTemplateGocQltdV1')
    .addSeparator()
    .addItem('🔧 Cài lại trigger tối ưu', 'menuCaiTriggerToiUuV1')
    .addItem('🆔 Cấp mã công việc còn thiếu', 'menuCapNhatMaCongViecV1')
    .addItem('🔗 Khởi tạo lại công thức cột K', 'menuKhoiTaoCongThucLienKetCotKV1')
    .addItem('📅 Tạo lại ngày nghỉ/lễ/tết', 'menuTaoLaiNgayNghiLeTetV1')
    .addSeparator()
    .addItem('🟢 Bật trigger nền 10 phút', 'menuBatTriggerNenV1')
    .addItem('🔴 Tắt trigger nền 10 phút', 'menuTatTriggerNenV1')
    .addItem('🧪 Kiểm tra trigger', 'kiemTraTriggerVanHanhTienDoV1')
    .addToUi();
}

function taoMenuVanHanhQLTienDoV1_() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('📊 Vận hành QL tiến độ')
    .addItem('👁️ 1. Xem trạng thái cần tính lại', 'hienTrangThaiTinhLaiTienDoV1')
    .addItem('🔄 2. Chạy tính lại tiến độ J/L/M/Q', 'menuChayTinhLaiTienDoV1')
    .addItem('📈 3. Cập nhật tổng hợp + Gantt', 'menuCapNhatTongHopGanttV1')
    .addItem('✅ 4. Kiểm tra lỗi dữ liệu đầu vào', 'menuKiemTraDuLieuDauVaoV1')
    .addSeparator()
    .addItem('🔒 5. Lưu/khóa kế hoạch gốc', 'menuLuuKhoaKeHoachGocV1')
    .addItem('👁️ 6. Hiện/ẩn kế hoạch gốc trên Gantt', 'menuToggleDuongGangKeHoachGocV1')
    .addSeparator()
    .addItem('🧹 7. Dọn nền dòng trống', 'menuDonNenDongTrongV1')
    .addItem('🧭 8. Chỉ hiện sheet vận hành', 'batCheDoChiHienSheetVanHanhV1')
    .addItem('🔓 9. Hiện lại toàn bộ sheet', 'hienLaiTatCaSheetV1')
    .addToUi();
}

function taoMenuCayCongViecWbsV1_() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🌳 Cây công việc')
    .addItem('Thiết lập cột B/Z WBS', 'thietLapCotWbsCongViecV1')
    .addItem('Dọn cảnh báo bảo vệ Cong_viec', 'donCanhBaoBaoVeCongViecV1')
    .addItem('Cập nhật STT WBS', 'capNhatSttWbsCongViecV1')
    .addToUi();
}

function taoMenuNhomWbsTongHopV1_() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🗂️ Nhóm WBS tổng hợp')
    .addItem('1. Tạo nhóm WBS', 'menuTaoNhomWbsTongHopV1')
    .addItem('2. Xóa nhóm WBS', 'menuXoaNhomWbsTongHopV1')
    .addToUi();
}

function menuThietLapNhanhBanSaoMoiV1() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Thiết lập nhanh bản sao mới',
    'Chức năng này sẽ cài trigger tối ưu, cấp mã công việc còn thiếu, khởi tạo công thức cột K, tạo/cập nhật ngày nghỉ và chạy tính lại tiến độ. Tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Đang thiết lập bản sao mới...', 'Thiết lập QL tiến độ', 5);

  const results = [];

  results.push(menuChayHamBatBuocV1_(['taoSheetVanHanhTuTemplateV1'], 'Tạo/khôi phục sheet vận hành bị thiếu từ TEMPLATE'));

  results.push(menuChayHamBatBuocV1_(['caiTriggerScheduleEngineV1'], 'Cài trigger onEdit tối ưu'));
  results.push(menuChayHamBatBuocV1_(['caiTriggerThayDoiCauTrucScheduleV1'], 'Cài trigger onChange cấu trúc'));
  results.push(menuChayHamBatBuocV1_(['capNhatMaCongViecConThieuV1'], 'Cấp mã công việc còn thiếu'));
  results.push(menuChayHamNeuCoV1_(['khoiTaoCongThucLienKetDongV1'], 'Khởi tạo công thức cột K'));
  results.push(menuChayHamNeuCoV1_(['taoNgayNghiTuDong'], 'Tạo lại ngày nghỉ/lễ/tết'));
  results.push(menuChayHamBatBuocV1_(['chayTinhLaiTienDoThuCongV1'], 'Chạy tính lại tiến độ'));
  results.push(menuChayHamNeuCoV1_(['capNhatTrangThaiThucHienCongViecV1'], 'Cập nhật trạng thái thực hiện'));

  ss.toast('Đã thiết lập xong bản sao mới.', 'Thiết lập QL tiến độ', 5);
  return results.join('\n');
}

function menuCaiTriggerToiUuV1() {
  const results = [];

  results.push(menuChayHamBatBuocV1_(['taoSheetVanHanhTuTemplateV1'], 'Tạo/khôi phục sheet vận hành bị thiếu từ TEMPLATE'));
  results.push(menuChayHamBatBuocV1_(['caiTriggerScheduleEngineV1'], 'Cài trigger onEdit tối ưu'));
  results.push(menuChayHamBatBuocV1_(['caiTriggerThayDoiCauTrucScheduleV1'], 'Cài trigger onChange cấu trúc'));

  SpreadsheetApp.getActiveSpreadsheet().toast('Đã cài lại trigger tối ưu.', 'Thiết lập QL tiến độ', 5);
  return results.join('\n');
}

function menuDongBoMaCongViecCuoiV1() {
  return menuCapNhatMaCongViecV1();
}

function menuKhoiTaoCongThucLienKetCotKV1() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Khởi tạo lại công thức cột K',
    'Chỉ nên chạy khi thiết lập bản sao mới hoặc cần sửa hàng loạt công việc liên kết. Tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  return menuChayHamBatBuocV1_(['khoiTaoCongThucLienKetDongV1'], 'Khởi tạo công thức cột K');
}

function menuBatTriggerNenV1() {
  return menuChayHamBatBuocV1_(['caiTriggerTinhLaiTienDoNenV1'], 'Bật trigger nền 10 phút');
}

function menuTatTriggerNenV1() {
  return menuChayHamBatBuocV1_(['xoaTriggerTinhLaiTienDoNenV1'], 'Tắt trigger nền 10 phút');
}

function menuDonNenDongTrongV1() {
  return menuChayHamBatBuocV1_(['chayDonNenCongViecThuCongV1'], 'Dọn nền dòng trống');
}
function menuCapNhatMaCongViecV1() {
  const result = capNhatMaCongViecConThieuV1();
  const message = result && result.message ? result.message : String(result);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    message,
    'Cấp mã công việc',
    7
  );

  return message;
}

function menuChayTinhLaiTienDoV1() {
  const ui = SpreadsheetApp.getUi();
  const hasDirtyFlag = typeof coCanTinhLaiTienDoV1_ === 'function' && coCanTinhLaiTienDoV1_();

  if (!hasDirtyFlag) {
    const confirm = ui.alert(
      'Chạy tính lại tiến độ J/L/M/Q',
      'Hiện chưa ghi nhận thay đổi cần tính lại. Anh vẫn muốn chạy lại toàn bộ không?',
      ui.ButtonSet.YES_NO
    );

    if (confirm !== ui.Button.YES) return 'Đã hủy chạy tính lại tiến độ.';
  }

  const result = menuChayHamBatBuocV1_(['chayTinhLaiTienDoThuCongV1'], 'Chạy tính lại tiến độ J/L/M/Q');
  menuChayHamNeuCoV1_(['capNhatTrangThaiThucHienCongViecV1'], 'Cập nhật trạng thái thực hiện');
  SpreadsheetApp.getActiveSpreadsheet().toast('Đã chạy tính lại tiến độ.', 'Vận hành QL tiến độ', 5);
  return result;
}
function menuCapNhatTongHopGanttV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Đang cập nhật tổng hợp + Gantt...', 'Quản lý tiến độ', 5);

  const result = menuChayHamBatBuocV1_(
    ['capNhatTienDoTongHopV1'],
    'Cập nhật tổng hợp + Gantt'
  );

  ss.toast('Đã cập nhật tổng hợp + Gantt.', 'Quản lý tiến độ', 5);
  return result;
}

function menuLuuKhoaKeHoachGocV1() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Lưu/khóa kế hoạch gốc',
    'Chức năng này sẽ lưu kế hoạch hiện tại làm kế hoạch gốc/baseline ACTIVE. Nếu đã có baseline cũ, baseline cũ sẽ được chuyển vào lịch sử. Anh có chắc chắn tiếp tục không?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  const codeResult = capNhatMaCongViecConThieuV1();
  const hasDirtyFlag = typeof coCanTinhLaiTienDoV1_ === 'function' && coCanTinhLaiTienDoV1_();

  if (
    (codeResult && codeResult.updatedId > 0) ||
    hasDirtyFlag
  ) {
    menuChayHamBatBuocV1_(['chayTinhLaiTienDoThuCongV1'], 'Chạy tính lại tiến độ trước khi lưu baseline');
  }

  const result = menuChayHamBatBuocV1_(['chotKeHoachGocV1'], 'Lưu/khóa kế hoạch gốc');

  menuChayHamNeuCoV1_(['capNhatTienDoTongHopV1'], 'Cập nhật tổng hợp sau khi lưu baseline');

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Đã lưu/khóa kế hoạch gốc và cập nhật tổng hợp + Gantt.',
    'QLTD',
    5
  );

  return result;
}

function menuToggleDuongGangKeHoachGocV1() {
  const ui = SpreadsheetApp.getUi();

  const fn = menuLayHamTheoTenV1_([
    'toggleDuongGangKeHoachGocV1',
    'toggleHienThiBaselineGanttV1',
    'toggleHienThiKeHoachGocGanttV1'
  ]);

  if (!fn) {
    ui.alert(
      'Chức năng chưa được cài',
      'Menu đã được tạo, nhưng logic hiện/ẩn đường găng kế hoạch gốc chưa được cài ở file tô màu Gantt. Ta sẽ cài ở bước tiếp theo.',
      ui.ButtonSet.OK
    );
    return;
  }

  return fn.func();
}

function menuTaoLaiNgayNghiLeTetV1() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Tạo lại ngày nghỉ/lễ/tết',
    'Chức năng này sẽ tạo lại dữ liệu sheet Ngay_nghi theo ngày neo kế hoạch và số năm hiển thị Gantt. Anh có chắc chắn tiếp tục không?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  return menuChayHamBatBuocV1_(['taoNgayNghiTuDong'], 'Tạo lại ngày nghỉ/lễ/tết');
}

function menuCaiDatTriggerVanHanhTienDoV1() {
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    'Cài / cài lại trigger vận hành',
    'Chức năng này sẽ xóa các trigger vận hành cũ và cài lại trigger cần thiết cho phần mềm tiến độ. Anh có chắc chắn tiếp tục không?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  return menuChayHamBatBuocV1_(
    ['caiDatTriggerVanHanhTienDoV1'],
    'Cài / cài lại trigger vận hành'
  );
}

function kiemTraTriggerVanHanhTienDoV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const watchedHandlers = [
    'xuLySuaScheduleEngineV1',
    'xuLyThayDoiCauTrucScheduleV1',
    'chayTinhLaiTienDoNenV1'
  ];
  const counts = {};

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction();
    counts[handler] = (counts[handler] || 0) + 1;
  });

  const labels = {
    xuLySuaScheduleEngineV1: 'onEdit nhẹ - đánh dấu cần tính lại',
    xuLyThayDoiCauTrucScheduleV1: 'onChange cấu trúc hàng/cột',
    chayTinhLaiTienDoNenV1: 'trigger nền tính lại tiến độ'
  };

  const lines = watchedHandlers.map(function(handler) {
    return labels[handler] + ' (' + handler + '): ' + (counts[handler] || 0);
  });
  const message = 'Kiểm tra trigger vận hành:\n' + lines.join('\n');

  Logger.log(message);
  try {
    ss.toast('Đã kiểm tra trigger vận hành.', 'Quản trị hệ thống', 5);
  } catch (err) {
    Logger.log('Không hiển thị được toast: ' + err.message);
  }

  return message;
}

function menuKiemTraDuLieuDauVaoV1() {
  const results = [];

  results.push(menuChayHamBatBuocV1_(['taoSheetVanHanhTuTemplateV1'], 'Tạo/khôi phục sheet vận hành bị thiếu từ TEMPLATE'));

  const fn1 = menuLayHamTheoTenV1_(['kiemTraKeHoach']);
  if (fn1) results.push(fn1.func());

  const fn2 = menuLayHamTheoTenV1_(['kiemTraVongLapDependency']);
  if (fn2) results.push(fn2.func());

  const fn3 = menuLayHamTheoTenV1_([
    'capNhatCanhBaoTienDoCongViecV1',
    'capNhatCanhBaoTienDoV1',
    'capNhatCanhBaoTienDo'
  ]);
  if (fn3) results.push(fn3.func());

  SpreadsheetApp.getActiveSpreadsheet().toast('Đã chạy kiểm tra dữ liệu đầu vào.', 'Quản lý tiến độ', 5);
  return results.join('\n');
}

function menuChayHamBatBuocV1_(functionNames, label) {
  const ui = SpreadsheetApp.getUi();
  const fn = menuLayHamTheoTenV1_(functionNames);

  if (!fn) {
    ui.alert(
      'Thiếu hàm xử lý',
      'Không tìm thấy hàm để chạy: ' + label + '\n\nDanh sách đã thử: ' + functionNames.join(', '),
      ui.ButtonSet.OK
    );
    throw new Error('MENU_MISSING_FUNCTION: ' + label);
  }

  return fn.func();
}

function menuChayHamNeuCoV1_(functionNames, label) {
  const fn = menuLayHamTheoTenV1_(functionNames);

  if (!fn) {
    Logger.log('Bỏ qua bước "' + label + '" vì chưa tìm thấy hàm phù hợp: ' + functionNames.join(', '));
    return '';
  }

  return fn.func();
}

function menuLayHamTheoTenV1_(functionNames) {
  for (let i = 0; i < functionNames.length; i++) {
    const name = functionNames[i];

    try {
      if (typeof globalThis !== 'undefined' && typeof globalThis[name] === 'function') {
        return {
          name: name,
          func: globalThis[name]
        };
      }

      const fn = eval(name);
      if (typeof fn === 'function') {
        return {
          name: name,
          func: fn
        };
      }
    } catch (err) {
      // Bỏ qua hàm không tồn tại.
    }
  }

  return null;
}


