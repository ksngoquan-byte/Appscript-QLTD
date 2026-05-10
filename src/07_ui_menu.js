function taoMenu() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('Quản lý tiến độ dự án')
    .addSubMenu(
      ui.createMenu('1. Vận hành tiến độ')
        .addItem('Cấp/cập nhật mã công việc', 'menuCapNhatMaCongViecV1')
        .addItem('Chạy tính lại tiến độ', 'menuChayTinhLaiTienDoV1')
        .addItem('Cập nhật tổng hợp + Gantt', 'menuCapNhatTongHopGanttV1')
    )
    .addSubMenu(
      ui.createMenu('2. Kế hoạch gốc / Baseline')
        .addItem('Lưu/khóa kế hoạch gốc', 'menuLuuKhoaKeHoachGocV1')
        .addItem('Hiện/ẩn đường găng kế hoạch gốc', 'menuToggleDuongGangKeHoachGocV1')
    )
    .addSubMenu(
      ui.createMenu('3. Thiết lập hệ thống')
        .addItem('Tạo lại ngày nghỉ/lễ/tết', 'menuTaoLaiNgayNghiLeTetV1')
        .addItem('Cài / cài lại trigger vận hành', 'menuCaiDatTriggerVanHanhTienDoV1')
        .addItem('Chuẩn hóa nhập liệu mã cấu trúc', 'chuanHoaNhapLieuMaCauTrucV1')
        .addSubMenu(
          ui.createMenu('Thiết lập dự án mới từ mẫu chuẩn')
            .addItem('Bước 1 - Xóa dữ liệu dự án cũ', 'xoaDuLieuDuAnCuV1')
            .addItem('Bước 2 - Dựng sheet từ mẫu chuẩn', 'taoSheetVanHanhTuTemplateV1')
        )
    )
    .addSeparator()
    .addItem('Kiểm tra lỗi dữ liệu đầu vào', 'menuKiemTraDuLieuDauVaoV1')
    .addToUi();
}

function onOpen() {
  taoMenu();
}

function menuCapNhatMaCongViecV1() {
  return menuChayHamBatBuocV1_(['capMaCongViec'], 'Cấp/cập nhật mã công việc');
}

function menuChayTinhLaiTienDoV1() {
  return menuChayHamBatBuocV1_(['chayScheduleEngineV1'], 'Chạy tính lại tiến độ');
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

  menuChayHamBatBuocV1_(['chotKeHoachGocV1'], 'Lưu/khóa kế hoạch gốc');

  menuChayHamNeuCoV1_(['capNhatTienDoTongHopV1'], 'Cập nhật tổng hợp sau khi lưu baseline');
  menuChayHamNeuCoV1_([
    'toMauGanttTongHopV1',
    'toMauGanttTongHop',
    'toMauGanttTongHopV2',
    'toMauGanttTongHopTheoTuanV1'
  ], 'Tô màu Gantt sau khi lưu baseline');
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

function menuKiemTraDuLieuDauVaoV1() {
  const results = [];

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


// === FIX_LEFT_TABLE_TIEN_DO_TONG_HOP_V1_START ===

/**
 * Chuan hoa header va dinh dang bang trai sheet Tien_do_tong_hop.
 * A: Ref
 * B: Cong viec / Pham vi
 * C: Chu tri
 * D: So ngay ke hoach
 * E: Cong viec lien ket
 * F: Bat dau hien hanh
 * G: Ket thuc hien hanh
 * H: Canh bao
 */
function chuanHoaBangTraiTienDoTongHopV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tien_do_tong_hop');
  if (!sheet) throw new Error('Khong tim thay sheet Tien_do_tong_hop');

  const headerRow = 4;
  const dataStartRow = 5;
  const lastRow = Math.max(sheet.getLastRow(), dataStartRow);

  sheet.getRange(headerRow, 1, 1, 8).setValues([[
    'Ref',
    'Công việc / Phạm vi',
    'Chủ trì',
    'Số ngày kế hoạch',
    'Công việc liên kết',
    'Bắt đầu hiện hành',
    'Kết thúc hiện hành',
    'Cảnh báo'
  ]]);

  const numRows = lastRow - dataStartRow + 1;

  if (numRows > 0) {
    sheet.getRange(dataStartRow, 1, numRows, 1).setNumberFormat('0');             // A - Ref
    sheet.getRange(dataStartRow, 4, numRows, 1).setNumberFormat('0');             // D - So ngay ke hoach
    sheet.getRange(dataStartRow, 5, numRows, 1).setNumberFormat('@');             // E - Cong viec lien ket
    sheet.getRange(dataStartRow, 6, numRows, 2).setNumberFormat('dd/MM/yyyy');    // F:G - Ngay
    sheet.getRange(dataStartRow, 2, numRows, 1).setWrap(true);                    // B - Ten viec
    sheet.getRange(dataStartRow, 8, numRows, 1).setWrap(true);                    // H - Canh bao
  }

  SpreadsheetApp.flush();

  const message = 'Da chuan hoa header va dinh dang bang trai Tien_do_tong_hop.';
  Logger.log(message);
  return message;
}

// === FIX_LEFT_TABLE_TIEN_DO_TONG_HOP_V1_END ===


