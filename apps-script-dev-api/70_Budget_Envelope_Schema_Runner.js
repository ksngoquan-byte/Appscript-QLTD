function qltdBudgetEnvelopeSchemaDryRunApi_(params) {
  const projectCode = String(params && params.projectCode || '').trim();
  const deptCode = String(params && params.deptCode || '').trim();
  return qltdBudgetEnvelopeSchemaDryRun(projectCode, deptCode);
}

/**
 * Hàm chạy thủ công trong Apps Script editor.
 * Chỉ đọc schema, không ghi hoặc append cột.
 *
 * Ví dụ:
 *   qltdBudgetEnvelopeRunPilotDryRun_('24-1.ĐB', 'PTDA')
 *   qltdBudgetEnvelopeRunPilotDryRun_('24-1.ĐB')
 */
function qltdBudgetEnvelopeRunPilotDryRun_(projectCode, deptCode) {
  const result = qltdBudgetEnvelopeSchemaDryRun(projectCode, deptCode);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Self-check nhẹ, không truy cập Google Sheet.
 * Dùng để xác nhận hằng số và cấu trúc module trước khi chạy dry-run thật.
 */
function qltdBudgetEnvelopeSchemaSelfCheck_() {
  const allocationHeaders = Array.isArray(QLTD_BUDGET_ENVELOPE_ALLOCATION_HEADERS)
    ? QLTD_BUDGET_ENVELOPE_ALLOCATION_HEADERS.slice()
    : [];
  const pbHeaders = Array.isArray(QLTD_BUDGET_ENVELOPE_PB_HEADERS)
    ? QLTD_BUDGET_ENVELOPE_PB_HEADERS.slice()
    : [];

  const errors = [];
  if (allocationHeaders.length !== 8) {
    errors.push('Allocation headers phải có đúng 8 cột.');
  }
  if (pbHeaders.length !== 5) {
    errors.push('PB headers phải có đúng 5 cột.');
  }
  if (new Set(allocationHeaders).size !== allocationHeaders.length) {
    errors.push('Allocation headers có giá trị trùng.');
  }
  if (new Set(pbHeaders).size !== pbHeaders.length) {
    errors.push('PB headers có giá trị trùng.');
  }

  const result = {
    success: errors.length === 0,
    allocationHeaders: allocationHeaders,
    pbHeaders: pbHeaders,
    errors: errors,
    checkedAt: new Date().toISOString()
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
