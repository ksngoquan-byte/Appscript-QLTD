# QLTD Budget STEP 4B.3 Result

Ngày thực hiện: 2026-06-21

Repo thực tế: `C:\Users\ksngo\OneDrive\Documents\New project 2\Appscript-QLTD-feature-gantt-period-view-v1`

Nhánh: `feature/gantt-period-view-v1`

Apps Script project ID từ `.clasp.json`: `1tFlFa4N7rlN2K7LkHS5Rsap9Pl-b_gqXbO-rEglvUFhWnZMc-U6JQ8PM`

HEAD trước khi sửa: `94cfe83f10c962184130e847ca4d3f86dde1bef8`

Ghi chú đường dẫn prompt: `D:\Appscript\1.QLTD` không tồn tại trong môi trường hiện tại, nên báo cáo chi tiết được lưu tại repo thực tế này.

## A. Tóm tắt thay đổi

- Bổ sung cấu hình schema ngân sách Master cho `Cong_viec`: Z giữ `WBS_LEVEL_SYS`, AA là cột đệm, AB/AC/AD là ba cột ngân sách.
- Cập nhật hoàn thiện `_TEMPLATE_Cong_viec` từ 26 cột lên 30 cột, merge/format/zebra từ A:AD.
- Cập nhật setup sau copy template để `Cong_viec` có đủ A:AD, không mất AB:AD, vẫn chỉ ẩn cột Z.
- Thêm module `60_Budget_Master_Schema_Service.js` để inspect/dry-run/ensure schema Master ngân sách theo `spreadsheetId`, idempotent, không ghi dữ liệu mẫu, không tạo trigger.
- Thêm test Node mock cho schema service.
- Không sửa Central Data, Dashboard, Gantt, CPM, baseline, trigger, WebApp/Firebase.

## B. File/hàm đã sửa

- `apps-script-dev-api/00_config.js`
  - Thêm `CONFIG.SHEET.NS_KHONG_GAN_CV`.
  - Thêm `CONFIG.COLUMN.CONG_VIEC.WBS_LEVEL_SYS`, `BUDGET_SPACER`, `DIRECT_COST_CEILING`, `PLANNED_REVENUE`, `BUDGET_STATUS`.
- `apps-script-dev-api/13_Hoan_thien_Template_Goc.js`
  - Sửa `hoanThienTemplateCongViecQltdV1_`.
  - Chuẩn hóa header 30 cột, format AB:AC, dropdown AD, width AA:AD, vẫn `hideColumns(26)`.
- `apps-script-dev-api/08_setup_new_copy.js`
  - Sửa `dinhDangCongViecVanHanhSauCopyTemplateV1_`.
  - Đảm bảo sheet sau copy có 30 cột, header Z:AD, format/dropdown/width, không thêm `NS_Khong_Gan_CV` vào danh sách xóa/reset.
- `apps-script-dev-api/60_Budget_Master_Schema_Service.js`
  - Thêm `qltdBudgetMasterSchemaInspect_(spreadsheetId)`.
  - Thêm `qltdBudgetMasterSchemaDryRun_(spreadsheetId)`.
  - Thêm `qltdBudgetMasterSchemaEnsure_(spreadsheetId, options)`.
  - Các helper inspect/apply/log/validate schema.
- `tests/budget-master-schema.test.mjs`
  - Test mock idempotent và các tình huống schema thiếu/lệch.
- `reports/QLTD_BUDGET_STEP4B3_RESULT.md`
  - Báo cáo thực hiện.

## C. Kết quả static audit

Nhóm A - đã sửa:

- `00_config.js`: bổ sung constant cột Z/AA/AB/AC/AD và sheet `NS_Khong_Gan_CV`.
- `13_Hoan_thien_Template_Goc.js`: các range hard-code 26 cột ở `_TEMPLATE_Cong_viec` đã chuyển sang 30 cột khi cần A:AD.
- `08_setup_new_copy.js`: format/layout `Cong_viec` sau copy template đã chuyển sang 30 cột.
- Thêm module schema Master riêng để không trộn với `57_Budget_Schema_Service.js` của Central/two-layer budget.

Nhóm B - giữ nguyên:

- `hideColumns(26)` được giữ ở template/setup/WBS vì mục đích là ẩn đúng cột Z chứa `WBS_LEVEL_SYS`.
- `08_Chot_Ke_hoach_Goc.js` đọc A:Z để nhận diện task thật và `WBS_LEVEL_SYS`; không cần đọc AB:AD.
- `24_Dong_bo_phong_ban.js` đọc 26 cột và có comment không thêm cột mới trong đồng bộ phòng ban; giữ để không kéo ngân sách vào sync cũ.
- Các module WBS/Gantt/header parser dùng tên header hoặc cột cấu hình, không giả định cột cuối là `WBS_LEVEL_SYS` sau thay đổi này.
- Các module budget hiện có `40/50/51/54/55/57/58/59` không bị sửa để tránh thay đổi Central Data/Dashboard ngoài phạm vi.

Nhóm C - rủi ro đã ghi nhận:

- Một số hàm dùng `getDataRange()` hoặc `getLastColumn()` trong Gantt/viewer/parser cũ. Kiểm tra tĩnh cho thấy các hàm này đọc theo header hoặc map field, chưa cần sửa trong step này.
- Header A:W giữa template local và file vận hành có thể khác nhẹ theo lịch sử cập nhật, nên schema service không so khớp cứng A:W; chỉ validate các sentinel Z/AA/AB/AC/AD và sheet `NS_Khong_Gan_CV`.
- `19_Lam_sach_Dinh_dang_Cong_viec.js` vẫn thông báo khôi phục format A5:W; giữ nguyên vì chỉ phục vụ vùng dữ liệu vận hành cũ, không nên mở rộng lan man sang ngân sách trong step này.

## D. Kết quả test

Đã chạy:

- `node --check apps-script-dev-api/00_config.js` - PASS.
- `node --check apps-script-dev-api/08_setup_new_copy.js` - PASS.
- `node --check apps-script-dev-api/13_Hoan_thien_Template_Goc.js` - PASS.
- `node --check apps-script-dev-api/60_Budget_Master_Schema_Service.js` - PASS.
- `node --check tests/budget-master-schema.test.mjs` - PASS.
- `node tests/budget-master-schema.test.mjs` - PASS.
- `git diff --check` - PASS.
- `npx clasp status` - PASS, đúng `rootDir=apps-script-dev-api`, thấy module mới.
- `clasp push` - PASS, đã push 61 file lên Apps Script DEV.

Read-only live inspection trước khi sửa trên 2 file pilot:

- `1vvO54Lqimem-wpAD-O1UNtqcItBk-hDAnzbBVKtO2Js` - `Cong_viec`, `_TEMPLATE_Cong_viec`, `NS_Khong_Gan_CV` đã có schema dự kiến.
- `1EZk5YM-P132IkM9TWoKVHAqcajbiKs2O2hgjTWPe8K0` - `Cong_viec`, `_TEMPLATE_Cong_viec`, `NS_Khong_Gan_CV` đã có schema dự kiến.
- Không ghi dữ liệu vận hành trong quá trình kiểm tra live.

Chưa chạy full regression Firebase/WebApp vì không có thay đổi WebApp/API/Firebase trong phạm vi này.

Ghi chú dry-run qua Apps Script Execution API:

- Đã thử `clasp run qltdBudgetMasterSchemaDryRun_`.
- Môi trường local báo `Could not read API credentials. Are you logged in locally?`, nên không thể chạy dry-run qua `clasp run` trong phiên này.
- Trước khi sửa đã kiểm tra live read-only 2 file pilot bằng Google Sheets connector; schema hiện tại của cả hai file khớp kỳ vọng.

## E. Rủi ro còn lại

- Chưa gọi `qltdBudgetMasterSchemaEnsure_` trên file thật; chỉ kiểm tra read-only và test mock để tránh ghi ngoài ý muốn.
- Nếu sau này người dùng sửa header A:W thủ công, schema service vẫn không block nếu Z/AA/AB/AC/AD đúng. Đây là chủ ý để tránh false blocker với lịch sử header cũ.
- Nếu một module viewer cũ đọc toàn bộ `getDataRange()` rồi hiển thị tất cả cột thô, nó có thể thấy thêm AB:AD. Chưa phát hiện module đang dùng kiểu này cho output vận hành chính.

## F. Rollback

- Rollback code sau khi commit:
  - `git revert <commit-sha>`
  - `npx clasp push`
- Không cần rollback dữ liệu sheet vì step này không ghi dữ liệu nghiệp vụ và không chạy reset template trên file thật.
- Nếu cần rollback thủ công từng file: revert `00_config.js`, `08_setup_new_copy.js`, `13_Hoan_thien_Template_Goc.js`, xóa `60_Budget_Master_Schema_Service.js`, xóa test/report tương ứng.

## G. Trạng thái push Apps Script

- `clasp push` thành công.
- Không tạo deployment WebApp mới.

## H. Trạng thái push GitHub

- Sẽ commit và push lên `feature/gantt-period-view-v1` sau báo cáo này.
- Không merge `main`.

## I. Commit SHA

- Sẽ báo SHA cuối cùng trong phản hồi sau khi commit/push.

## J. Việc cần làm tiếp theo

- Sau khi push Apps Script, nếu muốn kiểm tra live bằng function mới, có thể chạy thủ công trong Apps Script editor:
  - `qltdBudgetMasterSchemaDryRun_('1vvO54Lqimem-wpAD-O1UNtqcItBk-hDAnzbBVKtO2Js')`
  - `qltdBudgetMasterSchemaDryRun_('1EZk5YM-P132IkM9TWoKVHAqcajbiKs2O2hgjTWPe8K0')`
- Không cần deploy Firebase/WebApp cho step này.
