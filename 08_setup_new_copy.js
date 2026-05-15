/*******************************************************
 * FILE: 08_setup_new_copy.js
 *
 * MUC TIEU
 * - Khi tao ban sao moi:
 *   1) Xoa sheet van hanh/du lieu du an cu.
 *   2) Tao lai sheet van hanh moi tu cac sheet _TEMPLATE_.
 *   3) Giu nguyen cac sheet _TEMPLATE_ de sau nay tiep tuc nhan ban.
 *   4) Khong anh huong Apps Script/ham trong file.
 *******************************************************/

const SETUP_TEMPLATE_SHEETS_V1 = [
  { templateName: '_TEMPLATE_Cong_viec', targetName: 'Cong_viec' },
  { templateName: '_TEMPLATE_Tien_do_tong_hop', targetName: 'Tien_do_tong_hop' },
  { templateName: '_TEMPLATE_Ke_hoach_goc', targetName: 'Ke_hoach_goc' },
  { templateName: '_TEMPLATE_Ke_hoach_goc_history', targetName: 'Ke_hoach_goc_history' }
];

function menuXoaDuLieuCuVaTaoMoiTuTemplateV1() {
  const ui = SpreadsheetApp.getUi();

  const confirm1 = ui.alert(
    'Xóa dữ liệu cũ và tạo lại từ TEMPLATE',
    'Chức năng này sẽ:\n\n' +
    '1. XÓA các sheet vận hành cũ nếu đang tồn tại:\n' +
    '- Cong_viec\n' +
    '- Tien_do_tong_hop\n' +
    '- Ke_hoach_goc\n' +
    '- Ke_hoach_goc_history\n\n' +
    '2. TẠO LẠI các sheet này từ sheet _TEMPLATE_ tương ứng.\n\n' +
    'Các sheet _TEMPLATE_ và Apps Script sẽ được giữ nguyên.\n\n' +
    'Chỉ chạy sau khi đã tạo bản sao file mẫu. Tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (confirm1 !== ui.Button.YES) return 'Người dùng hủy xác nhận lần 1.';

  const prompt = ui.prompt(
    'Xác nhận lần 2',
    'Nhập chính xác: TAO MOI TU TEMPLATE',
    ui.ButtonSet.OK_CANCEL
  );

  if (prompt.getSelectedButton() !== ui.Button.OK) return 'Người dùng hủy xác nhận lần 2.';

  const input = String(prompt.getResponseText() || '').trim().toUpperCase();

  if (input !== 'TAO MOI TU TEMPLATE') {
    ui.alert(
      'Không thực hiện',
      'Nội dung xác nhận không đúng. Hệ thống chưa xóa/tạo lại sheet.',
      ui.ButtonSet.OK
    );
    return 'Xác nhận không đúng. Không thực hiện.';
  }

  const result = xoaDuLieuCuVaTaoMoiTuTemplateV1();

  ui.alert('Đã hoàn thành', result, ui.ButtonSet.OK);

  return result;
}

function xoaDuLieuCuVaTaoMoiTuTemplateV1() {
  const result = taoSheetVanHanhTuTemplateCoreV1_(true);

  xoaTrangThaiTinhLaiSauKhiXoaDuLieuSetupV1_();

  const message =
    result + '\n\n' +
    'Đã xóa trạng thái cần tính lại nếu có.\n' +
    'Các sheet _TEMPLATE_ được giữ nguyên. Apps Script/hàm trong file không bị ảnh hưởng.';

  Logger.log(message);
  return message;
}

function taoSheetVanHanhTuTemplateV1() {
  return taoSheetVanHanhTuTemplateCoreV1_(false);
}

function taoSheetVanHanhTuTemplateCoreV1_(replaceExisting) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logs = [];

  SETUP_TEMPLATE_SHEETS_V1.forEach(function(item) {
    const templateSheet = ss.getSheetByName(item.templateName);

    if (!templateSheet) {
      logs.push('- Thiếu template: ' + item.templateName);
      return;
    }

    const existingTarget = ss.getSheetByName(item.targetName);

    if (existingTarget && replaceExisting) {
      ss.deleteSheet(existingTarget);
      logs.push('- Đã xóa sheet vận hành cũ: ' + item.targetName);
    }

    if (existingTarget && !replaceExisting) {
      logs.push('- Đã có sheet "' + item.targetName + '", bỏ qua tạo mới.');
      return;
    }

    const newSheet = templateSheet.copyTo(ss);
    newSheet.setName(item.targetName);

    ss.setActiveSheet(newSheet);
    ss.moveActiveSheet(templateSheet.getIndex() + 1);

    logs.push('- Đã tạo sheet "' + item.targetName + '" từ "' + item.templateName + '".');
  });

  const message = logs.join('\n');
  Logger.log(message);
  return message;
}

function menuXoaSheetSnapshotKeHoachGocCuV1() {
  const ui = SpreadsheetApp.getUi();
  const snapshots = layDanhSachSheetSnapshotKeHoachGocV1_();

  if (snapshots.length === 0) {
    ui.alert(
      'Không có sheet snapshot',
      'Không tìm thấy sheet snapshot kế hoạch gốc có tiền tố KH_goc_BL.',
      ui.ButtonSet.OK
    );
    return 'Không có sheet snapshot để xóa.';
  }

  const confirm1 = ui.alert(
    'Xóa sheet snapshot kế hoạch gốc cũ',
    'Sẽ xóa các sheet snapshot sau:\n\n' +
    snapshots.join('\n') +
    '\n\nThao tác này không thể hoàn tác. Tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (confirm1 !== ui.Button.YES) return 'Người dùng hủy xóa snapshot.';

  const prompt = ui.prompt(
    'Xác nhận xóa snapshot',
    'Nhập chính xác: XOA SNAPSHOT',
    ui.ButtonSet.OK_CANCEL
  );

  if (prompt.getSelectedButton() !== ui.Button.OK) return 'Người dùng hủy xác nhận xóa snapshot.';

  const input = String(prompt.getResponseText() || '').trim().toUpperCase();

  if (input !== 'XOA SNAPSHOT') {
    ui.alert('Không xóa snapshot', 'Nội dung xác nhận không đúng.', ui.ButtonSet.OK);
    return 'Xác nhận không đúng. Không xóa snapshot.';
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const deleted = [];

  snapshots.forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      ss.deleteSheet(sheet);
      deleted.push(name);
    }
  });

  const message = 'Đã xóa sheet snapshot:\n' + deleted.join('\n');
  Logger.log(message);
  ui.alert('Đã xóa snapshot', message, ui.ButtonSet.OK);

  return message;
}

function layDanhSachSheetSnapshotKeHoachGocV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  return ss.getSheets()
    .map(function(sheet) { return sheet.getName(); })
    .filter(function(name) {
      return name.indexOf('KH_goc_BL') === 0;
    });
}

function xoaTrangThaiTinhLaiSauKhiXoaDuLieuSetupV1_() {
  if (typeof xoaCoTinhLaiTienDoV1_ === 'function') {
    xoaCoTinhLaiTienDoV1_();
    return;
  }

  const props = PropertiesService.getDocumentProperties();
  props.deleteProperty('SCHEDULE_NEED_RECALC_V1');
  props.deleteProperty('SCHEDULE_NEED_RECALC_REASON_V1');
  props.deleteProperty('SCHEDULE_NEED_RECALC_MARKED_AT_V1');
}

function kiemTraSheetBatBuocQLTDV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const required = [
    'Cong_viec',
    'Tien_do_tong_hop',
    'Ke_hoach_goc',
    'Ke_hoach_goc_history',
    'Cau_hinh'
  ];

  const missing = required.filter(function(name) {
    return !ss.getSheetByName(name);
  });

  const message = missing.length
    ? 'Thiếu sheet bắt buộc:\n' + missing.join('\n')
    : 'Đủ sheet bắt buộc.';

  Logger.log(message);
  SpreadsheetApp.getUi().alert(
    'Kiểm tra sheet bắt buộc',
    message,
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return message;
}
