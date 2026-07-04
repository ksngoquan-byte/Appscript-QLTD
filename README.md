# QLTD Entiz — Quản lý Tiến độ Tổng thể

QLTD Entiz là WebApp phục vụ quản lý tiến độ dự án trong phạm vi nội bộ Entiz. Phiên bản trong repository này chưa phải sản phẩm công khai hoặc thương mại.

## Kiến trúc tổng quát

- **Firebase Hosting** cung cấp giao diện WebApp tại `firebase-hosting-dev/`.
- **Apps Script** là backend/API đang chạy. Nguồn dùng cho `clasp` nằm tại `apps-script-dev-api/`.
- **Google Sheets** là nguồn dữ liệu vận hành và mapping của hệ thống.
- **GitHub** dùng để đồng bộ mã nguồn, audit, lưu lịch sử và hỗ trợ rollback; GitHub không thay thế môi trường thực thi Apps Script hay nguồn dữ liệu Google Sheets.

Các file Apps Script `.js` ở root là code legacy/song song, nằm ngoài `rootDir` và không được chỉnh sửa trong đợt phát hành này.

## Chức năng hiện có

Hệ thống gồm quản lý dự án; WBS và công việc nhiều cấp; Gantt, tiến độ và phụ thuộc; Dashboard dự án và phòng/ban; mốc chính; công việc phòng/ban và `PB_DETAIL`; báo cáo tuần; ngân sách; phân quyền, đăng ký người dùng và thông báo; xuất Excel/PNG; tích hợp Firebase Hosting, Apps Script API và Google Sheets mapping.

## Cấu trúc thư mục

- `apps-script-dev-api/`: backend Apps Script thực tế được `clasp` đồng bộ.
- `apps-script-pb-template/`: mã mẫu Apps Script cho phòng/ban.
- `firebase-hosting-dev/`: frontend Firebase Hosting và test frontend.
- `tests/`: repository test cho backend, tích hợp và dữ liệu live.
- `reports/`: kết quả audit và tài liệu kỹ thuật đã có.
- Các file Apps Script ở root: legacy/song song, không thuộc `rootDir`.

## Kiểm thử frontend

```powershell
cd firebase-hosting-dev
npm test
npm run build
```

Repository test có thể chạy riêng bằng `node tests/<tên-test>.test.mjs`. Năm test chưa đạt được ghi nhận có điều kiện trong Release Notes; không được tự ý đổi kỳ vọng hoặc xóa test.

## Kiểm tra cấu hình

Trước khi thao tác với môi trường DEV, kiểm tra:

```powershell
Get-Content .clasp.json
Get-Content firebase-hosting-dev/firebase.json
```

Cấu hình phát hành nội bộ này phải dùng Apps Script DEV Script ID `1tFlFa4N7rlN2K7LkHS5Rsap9Pl-b_gqXbO-rEglvUFhWnZMc-U6JQ8PM`, `rootDir` là `apps-script-dev-api`, và Firebase project `qltd-entiz-dev-208a3`.

> **Cảnh báo bắt buộc:** luôn kiểm tra `.clasp.json` ngay trước mọi lệnh `clasp push`. Không chạy `clasp push` nếu Script ID hoặc `rootDir` không khớp; không đổi Script ID để rollback và không push nhầm code Apps Script từ các file legacy ở root.

Repository phải được giữ ở chế độ **Private**. Mã nguồn và tài liệu thuộc phạm vi nội bộ Entiz.

## Ủy quyền cập nhật tiến độ theo dự án/phòng ban

Backend hỗ trợ quyền bổ sung `UPDATE_PROGRESS` theo khóa `Email + ProjectCode + DeptCode` qua sheet cấu hình đề xuất `User_Project_Dept_Access`. Quyền này cộng thêm vào quyền phòng ban gốc, không thay đổi `Users.DeptCode`, không cấp quyền quản trị, duyệt báo cáo, WBS, kế hoạch, baseline hoặc ngân sách.

Nếu sheet chưa tồn tại hoặc sai header, quyền phòng ban gốc tiếp tục hoạt động và mọi delegated access đều bị từ chối. Xem quy trình cấu hình, whitelist, rollback và test tại `docs/USER_PROJECT_DEPT_ACCESS_V1.md`.

Commit triển khai chỉ chứa code kiểm tra schema và dry-run. Không tự tạo sheet, không ghi dòng ủy quyền và không apply migration Central Data.
