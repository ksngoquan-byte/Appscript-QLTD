# Release Manifest — QLTD Entiz v1.0.0-internal

## Định danh phát hành

- Version: `v1.0.0-internal`
- Ngày phát hành dự kiến: `2026-07-02`
- Repository nguồn: `ksngoquan-byte/Appscript-QLTD`
- Branch nguồn: `hotfix/pb-dashboard-dept-mapping-v1`
- Commit nguồn: `ef3d884124a178668552198137c74e64b2b2f848`
- Repository đích: `ksngoquan-byte/webapp_Tiendotongthe`
- Branch đích: `main`
- Commit repo đích: commit trên `main` chứa chính manifest này; xác định bằng `git rev-parse HEAD` sau khi commit.
- Apps Script Script ID: `1tFlFa4N7rlN2K7LkHS5Rsap9Pl-b_gqXbO-rEglvUFhWnZMc-U6JQ8PM`
- Apps Script rootDir: `apps-script-dev-api`
- Firebase project: `qltd-entiz-dev-208a3`
- Firebase Hosting URL: `https://qltd-entiz-dev-208a3.web.app`
- Central Data Spreadsheet ID: `1ZAZwSjGOvKEp8iLCqLsEiJyJSFBR-jeru0RL25Q4xMM`

## Module chính

- Backend/API Apps Script và dịch vụ dự án, người dùng, phân quyền.
- WBS, tiến độ, phụ thuộc, Gantt và mốc chính.
- Dashboard dự án, Dashboard phòng/ban và công việc `PB_DETAIL`.
- Báo cáo tuần, ngân sách, thông báo và xuất Excel/PNG.
- Frontend Firebase Hosting.
- Google Sheets mapping và mẫu Apps Script phòng/ban.

## File cấu hình quan trọng

- `.clasp.json`: Script ID DEV và `rootDir` Apps Script.
- `.claspignore`: phạm vi đồng bộ Apps Script.
- `apps-script-dev-api/appsscript.json`: manifest backend thực tế.
- `firebase-hosting-dev/firebase.json`: site/hosting DEV.
- `firebase-hosting-dev/package.json`: test và build frontend.
- `.gitignore`: loại cache, dependencies, log và file tạm khỏi Git.

Các file Apps Script tại root là code legacy/song song và nằm ngoài `rootDir`. Bốn file `activate-ui-polish.ps1`, `api-read-cache.hotfix.js`, `perf-hotfix-v3.js` và `index.ui-polish.preview.html` không có reference/import trong runtime hiện tại; chúng được giữ nguyên như tài sản legacy của snapshot, không được triển khai hoặc xóa trong đợt này.

## Kiểm tra đã chạy

- `npm test` trong `firebase-hosting-dev`: PASS.
- `npm run build` trong `firebase-hosting-dev`: PASS (`static hosting: no build step`).
- 16 repository test: 11 PASS, đúng 5 FAIL được phê duyệt.
- `gantt-data-concurrency.test.mjs`: PASS 9/9 sau khi thay baseline lịch sử Git bằng fixture ổn định.
- JavaScript syntax check, JSON validation, frontend import/assets, file rỗng, secret scan, duplicate function/constant, `doGet`/`doPost`, cấu hình `.clasp.json`, cache/dependency/nested `.git`, remote/branch và `git diff --check`: phải PASS trước commit và được xác nhận trong báo cáo bàn giao.

## Ngoại lệ phát hành

Phiên bản này được phát hành nội bộ có điều kiện.

Người dùng đã chấp thuận:

- Tạm hoãn xử lý các hạn chế bảo mật đã được audit.
- Tạm tách riêng 5 kiểm thử repository chưa đạt.
- Chỉ sử dụng trong phạm vi nội bộ có kiểm soát.
- Chưa sử dụng cho mục đích công khai hoặc thương mại hóa.

Năm kiểm thử ngoại lệ gồm bốn test budget do harness chưa nạp dependency `38_MASTER_DEPT_SERVICE.js`, và `main-milestone-live.test.mjs` do live trả 110 milestone trong khi kỳ vọng là 136. Không có ngoại lệ thứ sáu.

## Known limitations

- Apps Script Web App cho phép anonymous.
- Một số action ghi chưa xác thực đầy đủ Firebase ID token.
- Authorizer còn trường hợp fail-open.
- Một số luồng dựa vào email do client truyền lên.
- Test harness budget chưa đầy đủ.
- Chưa đối soát xong chênh lệch milestone 110/136.
- Chưa thực hiện tối ưu tải dữ liệu, dọn toàn bộ code legacy hoặc chuẩn hóa public production.

## Rollback

- Snapshot gốc luôn có thể đối chiếu tại commit nguồn `ef3d884124a178668552198137c74e64b2b2f848` trên branch nguồn đã nêu.
- Commit phát hành repo đích là commit `main` chứa manifest này; lấy SHA bằng `git rev-parse HEAD` hoặc xem trong GitHub Desktop.
- Trước khi push, có thể xem lại bằng `git show --stat HEAD`; sau khi đã có thêm commit, checkout bản phát hành bằng `git checkout <SHA-commit-phát-hành>` trong trạng thái phù hợp với quy trình Git của đội.
- Không rollback bằng cách đổi `.clasp.json` sang Script ID khác.
- Apps Script và Firebase chưa được deploy trong tác vụ đóng gói này; rollback mã nguồn không đồng nghĩa rollback deployment.
