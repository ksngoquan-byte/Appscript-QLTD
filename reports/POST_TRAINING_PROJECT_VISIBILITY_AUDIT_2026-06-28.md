# Audit hiển thị dự án sau đào tạo — 28/06/2026

## Kết luận
Lỗi không nằm ở trạng thái đăng nhập. Nguyên nhân chính là logic `listProjects` đang dùng `Project_Depts` để lọc danh sách dự án nhìn thấy đối với mọi role ngoài `ADMIN/PMO`.

## Bằng chứng dữ liệu DEV
### Projects
- `37-5.HL1` — C1 Hưng Lộc — ACTIVE
- `24-1.ĐB` — Cốc Lếu — ACTIVE
- `37-8.NC` — Nam Cấm — INACTIVE

### Project_Depts
- C1 Hưng Lộc chỉ có: QLDA, PTDA, GPMB, THIETKE, TIEUCHUAN, DAUTHAU, KEHOACH, KETOAN.
- Cốc Lếu có các phòng trên và thêm KINHDOANH.
- TROLY, HANHCHINH, CNTT, KYTHUAT, BIM và các phòng chưa có mapping sẽ nhận danh sách rỗng.
- KINHDOANH chỉ được mapping vào Cốc Lếu nên chỉ thấy Cốc Lếu.

## Bằng chứng source
- `qltdProjectsListForUser_()` trả toàn bộ dự án ACTIVE cho `ADMIN/PMO`.
- Với role khác, hàm gọi `qltdProjectDeptsGetAllowedProjectCodesForUser_()`; nếu không có mapping thì trả `[]`.
- `Project_Depts` đồng thời đang được dùng để kiểm soát phạm vi thao tác ghi qua `qltdDeptScopeAuthorizeWrite_()`.

## Rủi ro thiết kế hiện tại
Đang dùng cùng một bảng mapping cho hai mục tiêu khác nhau:
1. Quyền **xem danh sách dự án**.
2. Quyền **ghi dữ liệu theo phòng/ban trong dự án**.

Hệ quả là phòng không tham gia cập nhật dữ liệu dự án cũng không thể xem dashboard/Gantt tổng thể.

## Phương án đề xuất
Tách quyền xem và quyền ghi:
- Mọi tài khoản `ACTIVE` có role hợp lệ được xem tất cả dự án `ACTIVE`.
- `Project_Depts` tiếp tục giới hạn phòng/ban nào được lập/cập nhật dữ liệu trong từng dự án.
- `ADMIN/PMO` giữ quyền điều hành toàn bộ.
- Không cần thêm cột hoặc đổi schema trong hotfix.

## File dự kiến sửa
- `apps-script-dev-api/31_PROJECTS_SERVICE.js`
- Test quyền/listProjects liên quan.

## Test bắt buộc
- ADMIN/PMO/EDITOR/REPORTER/VIEWER đều thấy 2 dự án ACTIVE.
- Nam Cấm INACTIVE không hiển thị.
- EDITOR/REPORTER không thể ghi vào dự án/phòng không có mapping `Project_Depts`.
- KINHDOANH thấy cả C1 Hưng Lộc và Cốc Lếu nhưng chỉ được ghi Cốc Lếu nếu C1 chưa có mapping.

## Gate
Chưa sửa code cho đến khi người dùng xác nhận nguyên tắc hiển thị nêu trên.