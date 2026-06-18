function menuTaoNhomWbsTongHopV1() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Tạo nhóm WBS tổng hợp',
    'Chức năng này sẽ xóa nhóm hàng WBS cũ trên Tien_do_tong_hop và tạo lại nhóm theo cột A. Tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return 'Đã hủy tạo nhóm WBS.';

  const message = taoNhomWbsTongHopV1_();
  SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Nhóm WBS tổng hợp', 5);
  return message;
}

function menuXoaNhomWbsTongHopV1() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Xóa nhóm WBS tổng hợp',
    'Chức năng này sẽ xóa toàn bộ group hàng hiện có trên Tien_do_tong_hop. Tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return 'Đã hủy xóa nhóm WBS.';

  const sheet = laySheetTienDoTongHopWbsGroupV1_();
  xoaTatCaNhomHangWbsTongHopV1_(sheet);

  const message = 'Đã xóa nhóm WBS trên Tien_do_tong_hop.';
  SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Nhóm WBS tổng hợp', 5);
  return message;
}

function taoNhomWbsTongHopV1_() {
  const sheet = laySheetTienDoTongHopWbsGroupV1_();
  const startRow = 5;
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return 'Không có dữ liệu để tạo nhóm WBS.';
  }

  xoaTatCaNhomHangWbsTongHopV1_(sheet);

  const values = sheet
    .getRange(startRow, 1, lastRow - startRow + 1, 1)
    .getDisplayValues()
    .map(function(row) {
      return String(row[0] || '').trim();
    });

  const levels = values.map(xacDinhCapWbsTongHopV1_);
  let groupCount = 0;

  // Tạo từ cấp sâu lên cấp nông để group lồng nhau ổn định hơn.
  for (let level = 4; level >= 1; level--) {
    for (let i = 0; i < levels.length; i++) {
      if (levels[i] !== level) continue;

      const parentRow = startRow + i;
      let endIndex = i;

      for (let j = i + 1; j < levels.length; j++) {
        const nextLevel = levels[j];

        // Gặp WBS cấp bằng hoặc nhỏ hơn thì kết thúc vùng con.
        if (nextLevel > 0 && nextLevel <= level) break;

        // Dòng WBS trống hoặc WBS cấp sâu hơn được xem là con của nhóm hiện tại.
        if (nextLevel === 0 || nextLevel > level) {
          endIndex = j;
        }
      }

      const firstChildRow = parentRow + 1;
      const lastChildRow = startRow + endIndex;

      if (lastChildRow >= firstChildRow) {
        sheet
          .getRange(firstChildRow, 1, lastChildRow - firstChildRow + 1, 1)
          .shiftRowGroupDepth(1);

        groupCount++;
      }
    }
  }

  const message = 'Đã tạo ' + groupCount + ' nhóm WBS trên Tien_do_tong_hop.';
  Logger.log(message);
  return message;
}

function laySheetTienDoTongHopWbsGroupV1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tien_do_tong_hop');

  if (!sheet) {
    throw new Error('Không tìm thấy sheet Tien_do_tong_hop.');
  }

  return sheet;
}

function xacDinhCapWbsTongHopV1_(wbs) {
  const text = String(wbs || '').trim();

  if (!text) return 0;
  if (!/^[IVXLCDM]+(\.\d+){0,3}$/.test(text)) return 0;

  return text.split('.').length;
}

function xoaTatCaNhomHangWbsTongHopV1_(sheet) {
  const maxRows = sheet.getMaxRows();

  // Xóa group depth hiện có. Lặp để dọn group lồng nhau.
  for (let i = 0; i < 6; i++) {
    try {
      sheet.getRange(1, 1, maxRows, 1).shiftRowGroupDepth(-1);
    } catch (err) {
      Logger.log('Dừng xóa group WBS tại vòng ' + (i + 1) + ': ' + err.message);
      break;
    }
  }
}
