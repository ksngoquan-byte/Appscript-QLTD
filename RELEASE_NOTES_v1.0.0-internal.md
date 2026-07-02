# QLTD Entiz v1.0.0-internal

## Phạm vi phát hành

- Sử dụng nội bộ Entiz.
- Chưa phải bản public production.
- Chưa phải bản thương mại.
- Dữ liệu test `PB_DETAIL` đã được làm sạch.
- Tại thời điểm đóng gói không còn `PB_DETAIL` test.

## Chức năng chính

- Quản lý dự án, WBS và công việc nhiều cấp.
- Gantt, tiến độ, quan hệ phụ thuộc và mốc chính.
- Dashboard dự án và Dashboard phòng/ban.
- Công việc phòng/ban, công việc chi tiết `PB_DETAIL` và báo cáo tuần.
- Ngân sách, phân quyền, đăng ký người dùng và thông báo.
- Xuất Excel/PNG.
- Frontend Firebase Hosting, backend Apps Script API và Google Sheets mapping.

## Các ngoại lệ được chấp thuận khi phát hành

### 1. Hạn chế về bảo mật

Người dùng đã xác nhận tạm thời chưa xử lý đầy đủ các nội dung tăng cường bảo mật trong phiên bản này.

Phiên bản hiện tại chỉ được phát hành để sử dụng nội bộ trong phạm vi kiểm soát của Công ty, chưa phù hợp để công khai rộng rãi hoặc thương mại hóa.

Các hạn chế đã biết gồm:

- Web App Apps Script hiện cho phép truy cập ở chế độ anonymous.
- Một số action ghi dữ liệu chưa xác thực đầy đủ danh tính bằng Firebase ID token.
- Cơ chế phân quyền hiện còn trường hợp fail-open đối với action chưa được khai báo trong rule map.
- Một số luồng nghiệp vụ còn dựa vào email do phía client truyền lên.

Các nội dung trên được chuyển sang backlog và bắt buộc phải xử lý trước khi phát hành công khai hoặc thương mại hóa sản phẩm.

### 2. Các kiểm thử repository chưa đạt

Có 5 kiểm thử repository chưa đạt và được tạm thời loại khỏi điều kiện chặn phát hành V1 nội bộ:

1. Bốn kiểm thử ngân sách `budget-allocation.test.mjs`, `budget-live-dashboard.test.mjs`, `budget-sync-cong-viec.test.mjs` và `budget-write-allocation.test.mjs` lỗi vì test harness chưa nạp đầy đủ dependency `apps-script-dev-api/38_MASTER_DEPT_SERVICE.js` (hàm `qltdMasterDeptCanonicalCode_`).
2. Kiểm thử `main-milestone-live.test.mjs` có chênh lệch số lượng milestone: dữ liệu live trả về 110, trong khi test kỳ vọng 136.

Các lỗi này chưa được xác định là lỗi runtime của hệ thống đang vận hành và sẽ tiếp tục được rà soát trong giai đoạn sau. Test không bị xóa và kỳ vọng 136 không bị thay đổi.

Test harness `gantt-data-concurrency.test.mjs` đã được làm độc lập với lịch sử Git repo cũ bằng fixture tối thiểu ổn định; toàn bộ mục tiêu kiểm thử lock, cache, concurrency và projection Gantt vẫn được giữ nguyên. Đây không phải ngoại lệ phát hành.

### 3. Điều kiện kiểm thử vẫn bắt buộc

- Toàn bộ test Firebase Hosting phải PASS.
- `npm run build` phải PASS.
- JavaScript syntax check phải PASS.
- JSON validation phải PASS.
- Kiểm tra import và assets phải PASS.
- `git diff --check` phải PASS.
- Không phát hiện secret hoặc credential thật.
- `.clasp.json` phải đúng Apps Script DEV Script ID và `rootDir`.

## Tồn đọng sau V1

- Bảo mật endpoint ghi.
- Test harness ngân sách.
- Đối soát milestone 110/136.
- Tối ưu tốc độ tải dữ liệu.
- Làm sạch code legacy ở root.
- Chuẩn hóa cấu trúc public production.
- Chuẩn bị nền tảng thương mại hóa.
