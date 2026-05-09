/****************************************************
 * 99_schedule_auto_trigger_v1.js
 * Bridge trigger tự động cho Schedule Engine V1
 *
 * Mục tiêu:
 * - Khi sửa H/J/K trên sheet Cong_viec → tự chạy chayScheduleEngineV1()
 * - Khi sửa sheet Cau_hinh → tự chạy chayScheduleEngineV1()
 * - Không phụ thuộc simple trigger onEdit(e)
 ****************************************************/

function scheduleAutoOnEditV1(e) {
  try {
    if (!e || !e.range) return;

    const range = e.range;
    const sheet = range.getSheet();
    const sheetName = sheet.getName();

    const TASK_SHEET = 'Cong_viec';
    const CONFIG_SHEET = 'Cau_hinh';
    const START_ROW = 5;

    // Các cột cần theo dõi trên Cong_viec
    const COL_NAME = 8;      // H - Tên công việc
    const COL_DURATION = 10; // J - Số ngày kế hoạch
    const COL_PRED = 11;     // K - Công việc tiền nhiệm

    if (sheetName === CONFIG_SHEET) {
      chayScheduleEngineV1();
      return;
    }

    if (sheetName !== TASK_SHEET) return;

    const rowStart = range.getRow();
    const rowEnd = rowStart + range.getNumRows() - 1;
    const colStart = range.getColumn();
    const colEnd = colStart + range.getNumColumns() - 1;

    if (rowEnd < START_ROW) return;

    const watchCols = [COL_NAME, COL_DURATION, COL_PRED];
    const touched = watchCols.some(col => col >= colStart && col <= colEnd);

    if (!touched) return;

    chayScheduleEngineV1();

  } catch (err) {
    Logger.log('scheduleAutoOnEditV1 error: ' + err);
  }
}

/**
 * Chạy hàm này 1 lần sau khi push code.
 * Hàm sẽ xóa các trigger cũ liên quan Schedule Engine rồi cài lại trigger mới.
 */
function caiTriggerScheduleAutoV1() {
  const ss = SpreadsheetApp.getActive();

  const handlersToRemove = [
    'scheduleAutoOnEditV1',
    'xuLySuaScheduleEngineV1',
    'scheduleEngineOnEditV1'
  ];

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlersToRemove.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('scheduleAutoOnEditV1')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  chayScheduleEngineV1();

  const message = 'Da cai trigger tu dong Schedule Engine V1. Khi sua cot H/J/K tren Cong_viec, he thong se tu tinh lai L/M/Q.';
  Logger.log(message);
  return message;
}

/**
 * Kiểm tra hiện có bao nhiêu trigger đang gọi scheduleAutoOnEditV1.
 */
function kiemTraTriggerScheduleAutoV1() {
  const triggers = ScriptApp.getProjectTriggers();
  const matched = triggers.filter(t => t.getHandlerFunction() === 'scheduleAutoOnEditV1');

  const message = 'So trigger scheduleAutoOnEditV1 hien co: ' + matched.length;
  Logger.log(message);
  return message;
}
