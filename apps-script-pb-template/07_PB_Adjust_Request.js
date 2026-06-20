/**
 * PB Utility V1 - Đề xuất điều chỉnh tiến độ
 */

function moFormDeXuatDieuChinhTienDoPBV1() {
  const sheet = laySheetHienTaiHopLePBV1_();
  if (!sheet) return;

  const activeRange = sheet.getActiveRange();
  if (!activeRange) {
    SpreadsheetApp.getUi().alert('Vui lòng chọn 01 dòng công việc cần đề xuất điều chỉnh.');
    return;
  }

  const rowIndex = activeRange.getRow();
  if (rowIndex < PBV1_CONFIG.DATA_START_ROW) {
    SpreadsheetApp.getUi().alert('Vui lòng chọn dòng công việc trong vùng dữ liệu, từ dòng 5 trở xuống.');
    return;
  }

  const displays = layDisplayDongPBV1_(sheet, rowIndex);
  const maMaster = displays[PBV1_CONFIG.COLUMNS.MA_MASTER - 1];
  const loaiDong = displays[PBV1_CONFIG.COLUMNS.LOAI_DONG - 1];

  if (loaiDong !== PBV1_CONFIG.ROW_TYPES.MASTER || !maMaster) {
    SpreadsheetApp.getUi().alert('Dòng đang chọn không phải dòng công việc chính thức.\nVui lòng chọn dòng công việc có WBS được phân bổ từ Master, thường là dòng màu xanh.');
    return;
  }

  const ctx = {
    spreadsheetId: laySpreadsheetPBV1_().getId(),
    sheetName: sheet.getName(),
    phongBan: layTenPhongBanTuSheetPBV1_(sheet),
    rowIndex,
    wbs: displays[PBV1_CONFIG.COLUMNS.WBS - 1],
    noiDung: displays[PBV1_CONFIG.COLUMNS.NOI_DUNG - 1],
    bdKeHoach: displays[PBV1_CONFIG.COLUMNS.BD_KE_HOACH - 1],
    ktKeHoach: displays[PBV1_CONFIG.COLUMNS.KT_KE_HOACH - 1],
    trangThai: displays[PBV1_CONFIG.COLUMNS.TRANG_THAI - 1],
    bdThucTe: displays[PBV1_CONFIG.COLUMNS.BD_THUC_TE - 1],
    htThucTe: displays[PBV1_CONFIG.COLUMNS.HT_THUC_TE - 1],
    ghiChu: displays[PBV1_CONFIG.COLUMNS.GHI_CHU - 1],
    maMaster,
    loaiDong
  };

  const template = HtmlService.createTemplateFromFile('PB_Adjust_Form');
  template.ctxJson = JSON.stringify(ctx);
  const html = template.evaluate().setWidth(720).setHeight(660);
  SpreadsheetApp.getUi().showModalDialog(html, 'Đề xuất điều chỉnh tiến độ');
}

function guiDeXuatDieuChinhTienDoPBV1(formData) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const ctx = JSON.parse(formData.ctxJson || '{}');
    const sheet = laySpreadsheetPBV1_().getSheetByName(ctx.sheetName);
    if (!sheet) throw new Error('Không tìm thấy sheet nguồn đề xuất.');

    const displays = layDisplayDongPBV1_(sheet, Number(ctx.rowIndex));
    const maMaster = displays[PBV1_CONFIG.COLUMNS.MA_MASTER - 1];
    const loaiDong = displays[PBV1_CONFIG.COLUMNS.LOAI_DONG - 1];

    if (loaiDong !== PBV1_CONFIG.ROW_TYPES.MASTER || !maMaster || String(maMaster) !== String(ctx.maMaster)) {
      throw new Error('Dòng nguồn không còn là dòng công việc chính thức hợp lệ. Vui lòng chọn lại dòng và gửi lại.');
    }

    const bdDeXuat = String(formData.bdDeXuat || '').trim();
    const ktDeXuat = String(formData.ktDeXuat || '').trim();
    const lyDo = String(formData.lyDo || '').trim();
    const anhHuong = String(formData.anhHuong || '').trim();
    const giaiPhap = String(formData.giaiPhap || '').trim();

    if (!bdDeXuat || !ktDeXuat || !lyDo || !anhHuong) {
      throw new Error('Vui lòng nhập đầy đủ: ngày bắt đầu đề xuất, ngày kết thúc đề xuất, lý do và ảnh hưởng.');
    }
    if (!parseNgayVNPBV1_(bdDeXuat) || !parseNgayVNPBV1_(ktDeXuat)) {
      throw new Error('Ngày đề xuất phải nhập theo định dạng dd/MM/yyyy.');
    }
    if (soSanhNgayPBV1_(bdDeXuat, ktDeXuat) > 0) {
      throw new Error('Ngày bắt đầu đề xuất không được lớn hơn ngày kết thúc đề xuất.');
    }

    const request = {
      maYeuCau: taoMaYeuCauDieuChinhPBV1_(),
      thoiDiem: new Date(),
      nguoiGui: layEmailNguoiDungPBV1_(),
      sheetName: ctx.sheetName,
      phongBan: ctx.phongBan,
      tenDayDuDuAn: layTenDayDuDuAnPBV1_(),
      tenNguoiNhan: layCauHinhPBV1_('TEN_NGUOI_NHAN', 'Mr Quân'),
      emailNhanDeXuat: layCauHinhPBV1_('EMAIL_NHAN_DE_XUAT', PBV1_CONFIG.ADJUST_REQUEST_TO),
      wbs: displays[PBV1_CONFIG.COLUMNS.WBS - 1],
      noiDung: displays[PBV1_CONFIG.COLUMNS.NOI_DUNG - 1],
      maMaster,
      bdKeHoach: dinhDangNgayVNPBV1_(displays[PBV1_CONFIG.COLUMNS.BD_KE_HOACH - 1]),
      ktKeHoach: dinhDangNgayVNPBV1_(displays[PBV1_CONFIG.COLUMNS.KT_KE_HOACH - 1]),
      trangThai: displays[PBV1_CONFIG.COLUMNS.TRANG_THAI - 1] || 'Chưa cập nhật',
      bdDeXuat: dinhDangNgayVNPBV1_(bdDeXuat),
      ktDeXuat: dinhDangNgayVNPBV1_(ktDeXuat),
      lyDo,
      anhHuong,
      giaiPhap,
      trangThaiXuLy: 'Chờ xem xét'
    };

    const maYeuCau = request.maYeuCau;
    ghiLogYeuCauDieuChinhPBV1_(request);
    guiEmailYeuCauDieuChinhPBV1_(request);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Đã gửi đề xuất điều chỉnh tiến độ. Mã yêu cầu: ' + maYeuCau,
      'Thành công',
      6
    );

    return {
      success: true,
      maYeuCau,
      message: 'Đã gửi đề xuất điều chỉnh tiến độ.'
    };
  } finally {
    lock.releaseLock();
  }
}

function ghiLogYeuCauDieuChinhPBV1_(request) {
  const headers = layHeadersYeuCauDieuChinhPBV1_();

  const sheet = damBaoSheetYeuCauDieuChinhPBV1_(headers);
  sheet.appendRow([
    request.maYeuCau, request.thoiDiem, request.nguoiGui, request.phongBan,
    request.wbs, request.noiDung, request.maMaster, request.bdKeHoach,
    request.ktKeHoach, request.trangThai, request.bdDeXuat, request.ktDeXuat,
    request.lyDo, request.anhHuong, request.giaiPhap, 'Mới ghi nhận', '', ''
  ]);

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 2).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  sheet.getRange(lastRow, 8, 1, 2).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(lastRow, 11, 1, 2).setNumberFormat('dd/MM/yyyy');
  sheet.autoResizeColumns(1, headers.length);
}

function layHeadersYeuCauDieuChinhPBV1_() {
  return [
    'Mã yêu cầu', 'Thời điểm gửi', 'Người gửi', 'Phòng/Ban',
    'WBS', 'Nội dung công việc', 'Mã công việc Master',
    'Ngày bắt đầu kế hoạch hiện tại', 'Ngày kết thúc kế hoạch hiện tại',
    'Trạng thái hiện tại', 'Ngày bắt đầu đề xuất', 'Ngày kết thúc đề xuất',
    'Nguyên nhân/lý do điều chỉnh', 'Ảnh hưởng nếu không điều chỉnh',
    'Giải pháp/kiến nghị', 'Trạng thái xử lý', 'Ý kiến xử lý', 'Ngày xử lý'
  ];
}

function damBaoSheetYeuCauDieuChinhPBV1_(headers) {
  const ss = laySpreadsheetPBV1_();
  let sheet = ss.getSheetByName(PBV1_CONFIG.SHEET_YEU_CAU_DIEU_CHINH);
  if (!sheet) sheet = ss.insertSheet(PBV1_CONFIG.SHEET_YEU_CAU_DIEU_CHINH);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground(PBV1_CONFIG.COLORS.HEADER_BG)
    .setFontColor(PBV1_CONFIG.COLORS.HEADER_FONT);
  sheet.setFrozenRows(1);

  if (sheet.getMaxRows() < 2) sheet.insertRowsAfter(1, 1);
  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 2, maxRows, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  sheet.getRange(2, 18, maxRows, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  sheet.getRange(2, 8, maxRows, 2).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(2, 11, maxRows, 2).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(2, 6, maxRows, 1).setWrap(true);
  sheet.getRange(2, 13, maxRows, 3).setWrap(true);
  sheet.getRange(2, 17, maxRows, 1).setWrap(true);

  sheet.getRange(2, 5, maxRows, 1).clearDataValidations();
  sheet.getRange(2, 13, maxRows, 2).clearDataValidations();

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      'Mới ghi nhận',
      'Đang xem xét',
      'Đồng ý điều chỉnh',
      'Không đồng ý',
      'Cần bổ sung thông tin',
      'Đã cập nhật Master'
    ], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 16, maxRows, 1).setDataValidation(statusRule);

  const filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).createFilter();

  return sheet;
}
