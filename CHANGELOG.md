# Changelog

## [Unreleased]

### Added

- Delegated `UPDATE_PROGRESS` theo `Email + ProjectCode + DeptCode` với kiểm tra backend fail-closed.
- Schema check và dry-run cho `User_Project_Dept_Access`; chưa apply Central Data live.
- Scope đọc/ghi BQLDA dự án `37-5.HL1` cho tài khoản được ủy quyền, không đổi phòng ban gốc.
- Whitelist tiến độ cho MASTER, `PB_DETAIL`, weekly task update, lưu nháp và gửi báo cáo tuần.
- Audit log phân biệt `HOME_DEPT`, `DELEGATED_ACCESS` và người thao tác thực tế.
- Regression test cho thời hạn, scope, field whitelist, thiếu sheet, báo cáo tuần và các action bị cấm.

### Security

- Email client được ghi đè bằng identity đã xác minh từ Firebase ID token trước kiểm tra quyền.
- Delegated payload có trường ngoài whitelist bị từ chối toàn bộ bằng `DELEGATED_PROGRESS_FIELDS_FORBIDDEN`.
- Delegated weekly update không đọc/ghi hoặc hiển thị dữ liệu ngân sách.

## [1.0.0-internal] - 2026-07-02

### Phát hành nội bộ

- Quản lý dự án.
- WBS và công việc nhiều cấp.
- Gantt, tiến độ và phụ thuộc.
- Dashboard dự án và Dashboard phòng/ban.
- Mốc chính.
- Công việc phòng/ban và công việc chi tiết `PB_DETAIL`.
- Báo cáo tuần.
- Ngân sách.
- Phân quyền và đăng ký người dùng.
- Thông báo.
- Xuất Excel/PNG.
- Firebase Hosting.
- Apps Script API.
- Google Sheets mapping.
