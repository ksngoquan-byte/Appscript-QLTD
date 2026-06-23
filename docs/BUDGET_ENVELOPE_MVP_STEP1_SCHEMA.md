# BUDGET ENVELOPE MVP — STEP 1: CHỐT SCHEMA VÀ NGUYÊN TẮC TƯƠNG THÍCH

## 1. Mục tiêu

Chuẩn bị nền dữ liệu cho luồng:

`Mục tiêu Master → Trần phòng/ban → Công việc chi tiết → Báo cáo vượt trần`

Không viết lại module ngân sách hiện có. Không xóa, đổi tên hoặc chèn cột vào giữa cấu trúc đang chạy.

## 2. Nguyên tắc nghiệp vụ đã chốt

1. `Cong_viec!AB` là trần CHI Master hiện hành đã duyệt.
2. `Cong_viec!AC` là dự THU Master hiện hành đã duyệt.
3. `Cong_viec!AD` dùng trạng thái `Nháp / Đã chốt / Khóa`.
4. Công việc chi tiết có ngân sách thì số nhập là **tổng ngân sách dự kiến để hoàn thành công việc**, đã gồm VAT.
5. Mỗi dòng công việc chi tiết chỉ có một hướng `THU` hoặc `CHI`.
6. Công việc không có ngân sách vẫn được tạo bình thường.
7. Mapping MVP: `ProjectCode + MasterTaskCode + DeptCode + PBDetailTaskCode`.
8. Không yêu cầu người dùng chọn `BudgetItemCode` hoặc `AllocationCode` trên giao diện MVP.
9. Phong bì ngân sách được kiểm soát theo: `ProjectCode + MasterTaskCode + DeptCode + FlowType + BudgetStage + BudgetVersion`.
10. Phần Master chưa giao cho phòng/ban được gọi là **Chưa phân bổ**.
11. Nếu tổng ngân sách chi tiết vượt trần phòng/ban, công việc vẫn được lưu để không mất dữ liệu nhưng phần vượt chưa được tính chính thức; hệ thống phải tạo báo cáo xin điều chỉnh.
12. Lãnh đạo không duyệt “vượt trần” kéo dài. Kết quả phải là:
    - điều chỉnh/tăng trần; hoặc
    - yêu cầu phòng/ban giảm kế hoạch chi tiết.

## 3. Schema mở rộng `CENTRAL_NS_Allocations`

Chỉ append cuối sheet, không đổi cột cũ:

| Header mới | Ý nghĩa |
|---|---|
| `Ma cong viec Master` | Mục tiêu Master được giao ngân sách |
| `Giai doan FS` | FS0 / FS1 / FS2 / FS3 |
| `Phien ban` | Phiên bản trong giai đoạn FS |
| `Can cu` | Căn cứ lập hoặc phê duyệt |
| `Nguoi de xuat` | Người/phòng ban đề xuất |
| `Nguoi duyet` | Người phê duyệt |
| `Thoi diem duyet` | Thời điểm phê duyệt |
| `Hieu luc` | Phiên bản đang hiệu lực hay lịch sử |

### Quy tắc

- THU và CHI kiểm soát độc lập.
- Chỉ một phong bì cùng khóa nghiệp vụ được `Hieu luc = TRUE`.
- Tổng `Gia tri giao` theo mục tiêu và hướng dòng tiền không vượt trần Master đã duyệt.
- Không bắt buộc phân bổ hết trần Master.

## 4. Schema mở rộng sheet công việc phòng/ban

Chỉ append cuối các sheet phòng/ban, không đổi cột cũ:

| Header mới | Ý nghĩa |
|---|---|
| `Co ngan sach` | Có / Không |
| `Huong dong tien` | THU / CHI |
| `Can cu ngan sach` | Căn cứ hoặc ghi chú |
| `Trang thai ngan sach chi tiet` | Hợp lệ / Vượt trần chờ báo cáo / Đã gửi điều chỉnh |
| `Ma yeu cau dieu chinh` | Mã liên kết báo cáo vượt trần |

### Tương thích ngược

- Dòng cũ có `Ke hoach ngan sach > 0` nhưng chưa có `Co ngan sach` được hiểu tạm là `Có`.
- Dòng cũ không có ngân sách được hiểu là `Không`.
- Không suy đoán THU/CHI từ tên công việc. Dòng thiếu `Huong dong tien` không được tính vào KPI THU/CHI chính thức.

## 5. Quy tắc kiểm soát

### Công việc không có ngân sách

- `Co ngan sach = Không`
- `Ke hoach ngan sach = 0`
- `Huong dong tien` để trống

### Công việc có ngân sách

- `Co ngan sach = Có`
- `Huong dong tien = THU` hoặc `CHI`
- `Ke hoach ngan sach > 0`
- Có `Can cu ngan sach`

### Kiểm soát vượt trần

`Tổng ngân sách chi tiết hợp lệ theo Project + Master + Dept + FlowType <= Trần phòng/ban hiện hành`

Nếu vượt:

- lưu dữ liệu người dùng;
- gắn `Trang thai ngan sach chi tiet = Vượt trần chờ báo cáo`;
- không cộng phần vượt vào KPI chính thức;
- cho phép tạo/gửi báo cáo điều chỉnh;
- chỉ chuyển hợp lệ sau khi trần mới được duyệt hoặc số chi tiết được giảm.

## 6. Trạng thái MVP

### Phong bì Master/phòng ban

- `Nháp`
- `Chờ duyệt`
- `Đã chốt`
- `Khóa`

### Công việc chi tiết

- `Hợp lệ`
- `Vượt trần chờ báo cáo`
- `Đã gửi điều chỉnh`
- `Đang rà soát`
- `Được phê duyệt điều chỉnh`
- `Không được phê duyệt`

## 7. Dashboard MVP

Theo từng mục tiêu Master và THU/CHI:

1. Trần Master đã duyệt.
2. Đã giao phòng/ban.
3. Chưa phân bổ.
4. Đã lập chi tiết hợp lệ.
5. Còn chưa phân rã.
6. Nhu cầu vượt trần đang chờ duyệt.

## 8. Migration plan

1. Dry-run đọc header hiện tại.
2. Báo cáo cột thiếu.
3. Append header mới ở cuối sheet.
4. Không backfill tự động THU/CHI.
5. Backfill `Co ngan sach` chỉ khi có quy tắc rõ và có log.
6. Chạy test chọn lọc trên DEV trước.

## 9. Test bắt buộc

- Dòng không ngân sách vẫn tạo/sửa được.
- Dòng có ngân sách bắt buộc THU/CHI và số tiền > 0.
- Tổng chi tiết trong trần được xác nhận bình thường.
- Chi tiết vượt trần được lưu nhưng không tính chính thức.
- Tạo được mã yêu cầu điều chỉnh duy nhất.
- Duyệt tăng trần làm dòng chi tiết trở thành hợp lệ.
- Từ chối yêu cầu buộc phòng/ban điều chỉnh lại.
- THU và CHI không bù trừ cho nhau.
- Dữ liệu cũ không lỗi khi chưa có cột mới.
- Không ảnh hưởng Gantt, báo cáo tuần và PB_DETAIL hiện hành.

## 10. Rollback

- Branch riêng: `feature/budget-envelope-mvp`.
- Migration chỉ append; rollback bằng cách ngừng đọc cột mới, không xóa dữ liệu.
- Không merge vào nhánh chính khi chưa test và chưa được người dùng duyệt.
- Chưa deploy Apps Script hoặc Firebase trong STEP 1.
