/**
 * PB Utility V1 - Email đề xuất điều chỉnh tiến độ
 */

function guiEmailYeuCauDieuChinhPBV1_(request) {
  const subject = `Đề xuất điều chỉnh tiến độ - ${request.wbs} - ${request.noiDung}`;

  const tenNguoiNhan = request.tenNguoiNhan || 'Mr Quân';
  const tenDayDuDuAn = request.tenDayDuDuAn || 'Dự án';
  const emailNhanDeXuat = request.emailNhanDeXuat || PBV1_CONFIG.ADJUST_REQUEST_TO;
  const trangThaiHienThi = request.trangThai || 'Chưa cập nhật';
  const bdKeHoachHienThi = dinhDangNgayVNPBV1_(request.bdKeHoach);
  const ktKeHoachHienThi = dinhDangNgayVNPBV1_(request.ktKeHoach);
  const bdDeXuatHienThi = dinhDangNgayVNPBV1_(request.bdDeXuat);
  const ktDeXuatHienThi = dinhDangNgayVNPBV1_(request.ktDeXuat);

  const body =
`Kính gửi: ${tenNguoiNhan},

Phòng/Ban: ${request.phongBan} gửi đề xuất điều chỉnh tiến độ công việc thuộc ${tenDayDuDuAn}, thông tin cụ thể như sau:

1. Thông tin công việc và nội dung đề xuất
- WBS: ${request.wbs}
- Nội dung công việc: ${request.noiDung}
- Mã công việc Master: ${request.maMaster}
- Ngày bắt đầu kế hoạch hiện tại: ${bdKeHoachHienThi}
- Ngày kết thúc kế hoạch hiện tại: ${ktKeHoachHienThi}
- Trạng thái hiện tại: ${trangThaiHienThi}
- Ngày bắt đầu đề xuất: ${bdDeXuatHienThi}
- Ngày kết thúc đề xuất: ${ktDeXuatHienThi}

2. Nguyên nhân/lý do điều chỉnh
${request.lyDo}

3. Ảnh hưởng nếu không điều chỉnh
${request.anhHuong}

4. Giải pháp/kiến nghị
${request.giaiPhap || 'Không có'}

Kính đề nghị ${tenNguoiNhan} xem xét, rà soát và báo cáo TGĐ chấp thuận nội dung điều chỉnh trên.

Trân trọng.`;

  const options = {
    to: emailNhanDeXuat,
    subject,
    body,
    htmlBody: taoHtmlEmailYeuCauDieuChinhPBV1_(request)
  };
  if (PBV1_CONFIG.ADJUST_REQUEST_CC) options.cc = PBV1_CONFIG.ADJUST_REQUEST_CC;
  MailApp.sendEmail(options);
}

function taoHtmlEmailYeuCauDieuChinhPBV1_(request) {
  const tenNguoiNhan = request.tenNguoiNhan || 'Mr Quân';
  const tenDayDuDuAn = request.tenDayDuDuAn || 'Dự án';
  const trangThaiHienThi = request.trangThai || 'Chưa cập nhật';
  const bdKeHoachHienThi = dinhDangNgayVNPBV1_(request.bdKeHoach);
  const ktKeHoachHienThi = dinhDangNgayVNPBV1_(request.ktKeHoach);
  const bdDeXuatHienThi = dinhDangNgayVNPBV1_(request.bdDeXuat);
  const ktDeXuatHienThi = dinhDangNgayVNPBV1_(request.ktDeXuat);

  const rows = [
    ['WBS', request.wbs],
    ['Nội dung công việc', request.noiDung],
    ['Mã công việc Master', request.maMaster],
    ['Ngày bắt đầu kế hoạch hiện tại', bdKeHoachHienThi],
    ['Ngày kết thúc kế hoạch hiện tại', ktKeHoachHienThi],
    ['Trạng thái hiện tại', trangThaiHienThi],
    ['Ngày bắt đầu đề xuất', bdDeXuatHienThi],
    ['Ngày kết thúc đề xuất', ktDeXuatHienThi]
  ];

  const trs = rows.map(r =>
    `<tr><td style="border:1px solid #ddd;padding:6px;font-weight:bold;width:220px;">${escapeHtmlPBV1_(r[0])}</td><td style="border:1px solid #ddd;padding:6px;">${escapeHtmlPBV1_(r[1])}</td></tr>`
  ).join('');

  return `
  <div style="font-family:Arial,sans-serif;font-size:13px;color:#222;line-height:1.5;">
    <p>Kính gửi: <b>${escapeHtmlPBV1_(tenNguoiNhan)}</b>,</p>
    <p>Phòng/Ban: <b>${escapeHtmlPBV1_(request.phongBan)}</b> gửi đề xuất điều chỉnh tiến độ công việc thuộc <b>${escapeHtmlPBV1_(tenDayDuDuAn)}</b>, thông tin cụ thể như sau:</p>
    <p><b>1. Thông tin công việc và nội dung đề xuất</b></p>
    <table style="border-collapse:collapse;border:1px solid #ddd;">${trs}</table>
    <p><b>2. Nguyên nhân/lý do điều chỉnh</b><br>${escapeHtmlPBV1_(request.lyDo).replace(/\n/g, '<br>')}</p>
    <p><b>3. Ảnh hưởng nếu không điều chỉnh</b><br>${escapeHtmlPBV1_(request.anhHuong).replace(/\n/g, '<br>')}</p>
    <p><b>4. Giải pháp/kiến nghị</b><br>${escapeHtmlPBV1_(request.giaiPhap || 'Không có').replace(/\n/g, '<br>')}</p>
    <p>Kính đề nghị ${escapeHtmlPBV1_(tenNguoiNhan)} xem xét, rà soát và báo cáo TGĐ chấp thuận nội dung điều chỉnh trên.</p>
    <p>Trân trọng.</p>
  </div>`;
}
