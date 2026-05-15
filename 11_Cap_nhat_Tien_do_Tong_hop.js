/*******************************************************
 * FILE: 11_Cap_nhat_Tien_do_Tong_hop.gs
 *
 * MỤC TIÊU
 * - Hàm tổng cho người dùng cuối cập nhật Tien_do_tong_hop.
 * - Chạy layout, đổ dữ liệu A:H, rồi tô Gantt bar.
 *******************************************************/

function capNhatTienDoTongHopV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getDocumentLock();
  let locked = false;

  try {
    ss.toast('Đang cập nhật tiến độ tổng hợp...', 'Quản lý tiến độ', 5);
    Logger.log('Bắt đầu cập nhật tiến độ tổng hợp');

    locked = lock.tryLock(30000);

    if (!locked) {
      const message = 'Đang có tác vụ cập nhật khác. Vui lòng chờ 1 phút rồi bấm lại.';
      Logger.log('Không lấy được DocumentLock khi cập nhật tiến độ tổng hợp. Có thể đang có tác vụ khác chạy.');
      ss.toast(message, 'Quản lý tiến độ', 8);
      return message;
    }

    kiemTraHamCapNhatTienDoTongHopV1_(
      'dinhDangTimelineGanttTongHopV1',
      'Thiếu hàm dinhDangTimelineGanttTongHopV1. Kiểm tra file 05_Dinh_dang_Timeline_Gantt_Tong_hop.gs'
    );
    dinhDangTimelineGanttTongHopV1();
    Logger.log('Xong layout');

    kiemTraHamCapNhatTienDoTongHopV1_(
      'doDuLieuBangTraiTienDoTongHopV1',
      'Thiếu hàm doDuLieuBangTraiTienDoTongHopV1. Kiểm tra file 06_Do_du_lieu_Tien_do_Tong_hop.gs'
    );
    doDuLieuBangTraiTienDoTongHopV1();
    Logger.log('Xong dữ liệu A:H');

    kiemTraHamCapNhatTienDoTongHopV1_(
      'toMauGanttBarTienDoTongHopV1',
      'Thiếu hàm toMauGanttBarTienDoTongHopV1. Kiểm tra file 10_To_mau_Gantt_Tong_hop.gs'
    );
    toMauGanttBarTienDoTongHopV1();
    Logger.log('Xong tô Gantt bar');

    SpreadsheetApp.flush();

    Logger.log('Hoàn tất cập nhật tiến độ tổng hợp');
    ss.toast('Đã cập nhật tiến độ tổng hợp.', 'Quản lý tiến độ', 5);

    return 'Đã cập nhật tiến độ tổng hợp.';
  } catch (err) {
    Logger.log('Lỗi cập nhật tiến độ tổng hợp: ' + err);
    ss.toast('Lỗi cập nhật tiến độ tổng hợp. Xem Nhật ký thực thi.', 'Quản lý tiến độ', 8);
    throw err;
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}


function kiemTraHamCapNhatTienDoTongHopV1_(functionName, message) {
  let fn = null;

  try {
    fn = eval(functionName);
  } catch (err) {
    fn = null;
  }

  if (typeof fn !== 'function') {
    throw new Error(message);
  }
}
