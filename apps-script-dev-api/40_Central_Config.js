const QLTD_BUDGET_SOURCE = 'budget_readonly_v1';
const QLTD_BUDGET_DRY_RUN_SOURCE = 'budget_dryrun_v1';
const QLTD_BUDGET_ITEMS_SOURCE = 'budget_items_v1';
const QLTD_BUDGET_SCHEMA_SOURCE = 'budget_schema_v1';

const QLTD_BUDGET_TYPE = {
  TASK_LINKED: 'TASK_LINKED',
  DEPT_STANDALONE: 'DEPT_STANDALONE'
};

const QLTD_BUDGET_SHEET = {
  PROJECTS: 'Projects',
  PROJECT_DEPTS: 'Project_Depts',
  USERS: 'Users',
  CENTRAL_RAW: 'CENTRAL_NS_Raw',
  CENTRAL_ITEMS: 'CENTRAL_NS_Items',
  CENTRAL_DASHBOARD: 'CENTRAL_NS_Dashboard',
  CENTRAL_SUMMARY: 'CENTRAL_NS_Tong_hop'
};

const QLTD_BUDGET_PROJECT_HEADERS = [
  'ProjectCode',
  'ProjectName',
  'MasterSpreadsheetId',
  'DeptSpreadsheetId',
  'DefaultTaskSheet',
  'DefaultDeptSheet',
  'Status',
  'SortOrder',
  'Note'
];

const QLTD_BUDGET_PROJECT_DEPT_HEADERS = [
  'ProjectCode',
  'DeptCode',
  'ProjectUnitCode',
  'DeptName',
  'Status',
  'SortOrder',
  'Note'
];

const QLTD_BUDGET_DEPT_TASK_REQUIRED_HEADERS = [
  'STT',
  'Noi dung cong viec',
  'Ke hoach ngan sach',
  'Ngan sach thuc te',
  'Ghi chu cap nhat',
  'Ma cong viec Master',
  'Loai dong'
];

const QLTD_BUDGET_CENTRAL_RAW_HEADERS = [
  'Report ID',
  'Ma du an',
  'Ten du an',
  'Phong/Ban',
  'Loai ky',
  'Ma ky',
  'Ma cong viec Master',
  'WBS/STT',
  'Noi dung cong viec',
  'Ke hoach ngan sach ky',
  'Gia tri thuc hien ky nay',
  'Trang thai xac nhan',
  'Can cu',
  'Vuong mac/Ghi chu',
  'Nguoi gui',
  'Thoi diem gui',
  'Nguon file PB',
  'Sync status',
  'Sync at',
  'Sync error',
  'Ma khoan ngan sach',
  'Ten khoan ngan sach',
  'Loai ngan sach',
  'Nhom ngan sach',
  'Giai doan ngan sach',
  'Yeu cau ma cong viec Master'
];

const QLTD_BUDGET_CENTRAL_RAW_TWO_LAYER_HEADERS = [
  'Ma khoan ngan sach',
  'Ten khoan ngan sach',
  'Loai ngan sach',
  'Nhom ngan sach',
  'Giai doan ngan sach',
  'Yeu cau ma cong viec Master'
];

const QLTD_BUDGET_ITEMS_HEADERS = [
  'Ma khoan ngan sach',
  'Ma du an',
  'Ten du an',
  'Ma phong/ban',
  'Ten phong/ban',
  'Ten khoan ngan sach',
  'Loai ngan sach',
  'Ma cong viec Master',
  'Nhom ngan sach',
  'Giai doan ngan sach',
  'Ngan sach duoc duyet',
  'Trang thai',
  'Ghi chu'
];

function qltdBudgetResponse_(success, action, data, warnings, errors, meta) {
  return {
    success: !!success,
    apiStatus: success ? 'OK' : 'ERROR',
    source: QLTD_BUDGET_SOURCE,
    data: success ? (data || {}) : (data === undefined ? null : data),
    warnings: warnings || [],
    errors: errors || [],
    meta: Object.assign({
      action: action || '',
      generatedAt: qltdBudgetNowIso_()
    }, meta || {})
  };
}

function qltdBudgetOk_(action, data, warnings, meta) {
  return qltdBudgetResponse_(true, action, data || {}, warnings || [], [], meta || {});
}

function qltdBudgetError_(action, code, message, meta, warnings) {
  return qltdBudgetResponse_(false, action, null, warnings || [], [{
    code: code,
    message: message || code
  }], meta || {});
}

function qltdBudgetWarning_(code, message, extra) {
  return Object.assign({
    code: code,
    message: message || code
  }, extra || {});
}

function qltdBudgetNowIso_() {
  return new Date().toISOString();
}

function qltdBudgetNormalizeKey_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function qltdBudgetNormalizeCode_(value) {
  return String(value || '').trim().toUpperCase();
}

function qltdBudgetNormalizeStatus_(value) {
  return String(value || 'ACTIVE').trim().toUpperCase();
}

function qltdBudgetBuildHeaderMap_(headerRowValues) {
  const map = {};
  (headerRowValues || []).forEach(function(header, index) {
    const raw = String(header || '').trim();
    const key = qltdBudgetNormalizeKey_(raw);
    if (key && map[key] === undefined) {
      map[key] = index;
    }
  });
  return map;
}

function qltdBudgetFindHeaderIndex_(headerMap, headerName) {
  const key = qltdBudgetNormalizeKey_(headerName);
  return Object.prototype.hasOwnProperty.call(headerMap, key) ? headerMap[key] : -1;
}

function qltdBudgetGetCell_(row, headerMap, headerName, fallback) {
  const index = qltdBudgetFindHeaderIndex_(headerMap, headerName);
  if (index < 0) return fallback === undefined ? '' : fallback;
  const value = row[index];
  return value === undefined || value === null ? (fallback === undefined ? '' : fallback) : value;
}

function qltdBudgetReadSheetAsObjects_(sheet, headerRowIndex) {
  const values = sheet.getDataRange().getValues();
  const zeroIndex = Math.max(Number(headerRowIndex || 1) - 1, 0);
  if (!values || values.length <= zeroIndex) {
    return {
      headers: [],
      headerMap: {},
      rows: []
    };
  }

  const headers = values[zeroIndex].map(function(value) {
    return String(value || '').trim();
  });
  const headerMap = qltdBudgetBuildHeaderMap_(headers);
  const rows = [];

  for (let rowIndex = zeroIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const hasValue = row.some(function(value) {
      return String(value || '').trim() !== '';
    });
    if (!hasValue) continue;

    const object = {
      rowNumber: rowIndex + 1,
      raw: row
    };
    headers.forEach(function(header, index) {
      if (header) object[header] = row[index];
    });
    rows.push(object);
  }

  return {
    headers: headers,
    headerMap: headerMap,
    rows: rows
  };
}

function qltdBudgetGetReadonlySheet_(sheetName) {
  const ss = getCurrentSpreadsheet_();
  return ss.getSheetByName(sheetName);
}

function qltdBudgetReadRequiredCentralSheet_(sheetName, action) {
  const sheet = qltdBudgetGetReadonlySheet_(sheetName);
  if (!sheet) {
    return {
      sheet: null,
      error: qltdBudgetError_(action, 'SHEET_NOT_FOUND', 'Khong tim thay sheet: ' + sheetName, {
        sheetName: sheetName
      })
    };
  }
  return {
    sheet: sheet,
    error: null
  };
}

function qltdBudgetFormatDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  }
  return String(value || '').trim();
}

function qltdBudgetToNumber_(value) {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const text = String(value || '').replace(/[,\s]/g, '').trim();
  if (!text) return 0;
  const number = Number(text);
  return isNaN(number) ? 0 : number;
}
