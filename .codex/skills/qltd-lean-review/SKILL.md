---
name: qltd-lean-review
description: >
  Rà soát diff của dự án QLTD để tìm over-engineering, abstraction thừa,
  dependency không cần thiết, code trùng hoặc phần có thể thu gọn mà không
  làm giảm correctness, logging, validation, rollback, idempotency và khả năng
  vận hành Apps Script. Chỉ dùng sau review correctness/security/performance.
---

# QLTD Lean Review

## Mục tiêu
Rà soát diff để tìm phần phức tạp không cần thiết và đề xuất cách thu gọn. Không tự sửa code.

Skill này được tinh chỉnh từ tinh thần của `ponytail-review` và áp dụng riêng cho Google Apps Script, Google Sheets và Firebase WebApp của QLTD.

## Điều kiện kích hoạt
Chỉ chạy khi:
1. Review correctness đã hoàn tất.
2. Review security/quyền đã hoàn tất nếu có liên quan.
3. Review performance đã hoàn tất nếu có liên quan.
4. Test tối thiểu của phần thay đổi đã có hoặc đã được xác định rõ.

Không dùng skill này để thay thế review lỗi logic.

## Phạm vi tìm kiếm
- `delete:` code chết đã được chứng minh không phải entry point động.
- `native:` code/dependency làm lại tính năng nền tảng đã có.
- `yagni:` abstraction, config hoặc layer chưa có nhu cầu thực tế.
- `duplicate:` logic gần trùng có thể tái sử dụng an toàn.
- `shrink:` cùng logic nhưng có thể viết ngắn và rõ hơn.
- `split:` hàm quá dài có thể tách cục bộ để dễ test, nhưng không tạo kiến trúc mới.

## Không được đề xuất xóa hoặc rút gọn mù quáng
- Logging, audit trail và `SYS_Sync_Log`.
- Validate dữ liệu đầu vào và kiểm tra schema/header.
- Error handling có thông tin truy vết.
- `LockService`, idempotency hoặc mã giao dịch chống ghi trùng.
- Dry-run, migration guard, backup và rollback.
- Test tối thiểu, smoke test hoặc assert tự kiểm tra.
- Hàm được gọi qua menu, trigger, dispatcher, chuỗi action, HTML template hoặc Apps Script global scope.
- Logic tương thích ngược với dữ liệu/API đang chạy.
- Cache hoặc batch logic phục vụ hiệu năng.

## Quy trình rà soát
1. Đọc `AGENTS.md`.
2. Đọc diff và file đầy đủ có thay đổi.
3. Xác định entry points tĩnh và động.
4. Xác định caller/callee và side effects.
5. Chỉ nêu finding khi có căn cứ cụ thể.
6. Không áp dụng fix; chỉ đề xuất.

## Định dạng đầu ra
Mỗi finding một dòng:

`<file>:L<dòng> — <tag> <phần có thể cắt/thu gọn>. <phương án thay thế>. Rủi ro: <rủi ro>.`

Cuối báo cáo ghi:

- `net: -<N> dòng có thể giảm.`
- `không được cắt: <các guardrail cần giữ>.`
- `test cần chạy lại: <danh sách test>.`

Nếu không có phần cần cắt, ghi:

`Đã gọn hợp lý. Không đề xuất thay đổi.`

## Ví dụ QLTD

`51_Budget_Report_Service.js:L120-L168 — duplicate: hai nhánh validate PLAN_MONTH và PLAN_WEEK lặp kiểm tra ProjectCode/DeptCode. Tách một helper validateCommonFields_ dùng nội bộ file. Rủi ro: phải giữ nguyên thông báo lỗi và thứ tự validate.`

`firebase-hosting-dev/app.js:L900-L930 — native: tự định dạng ngày bằng nối chuỗi nhiều nhánh. Dùng Intl.DateTimeFormat nếu không làm thay đổi timezone hiện hành. Rủi ro: cần test timezone Việt Nam.`

`04_schedule_engine_v1.js:L210-L245 — giữ nguyên: nhánh ưu tiên S/T rồi fallback L/M là quy tắc nghiệp vụ, không phải complexity thừa.`
