# Apps Script PB Template

Thư mục này chứa source chuẩn dùng chung cho Apps Script PB Utility của các file phòng/ban.

## Nguyên tắc

- Không chứa `.clasp.json`.
- Mỗi file PB thực tế có Apps Script project, binding và deploy riêng.
- Không `clasp push` trực tiếp từ thư mục này vào một file PB đang vận hành nếu chưa xác nhận đúng project.
- Người dùng deploy Apps Script PB thủ công sau khi review và test trên bản copy.
- Khi sửa PB template phải đánh giá rollout sang các dự án hiện hữu, không chỉ sửa riêng Cốc Lếu hoặc Nam Cấm.

## Version

- Schema hiện tại: `PB_DETAIL_V1`.
- Cột hiển thị vẫn là A:M.
- Cột hệ thống ẩn và bảo vệ: N:R.
- Cột mới:
  - P: `DetailTaskId`
  - Q: `% Hoàn thành`
  - R: `Trọng số`

## Rollout

File PB hiện hữu cần cập nhật Apps Script PB cùng version và chạy thủ công:

`nangCapSchemaPBDetailV1`

Chỉ chạy sau khi đã backup file PB và deploy Apps Script PB vào bản test/copy.

File PB dự án mới sẽ nhận schema P:R qua quy trình khởi tạo clone trong `09_PB_Init_Clone.js`.

REQUIRES_MASTER_PB_TEMPLATE_SYNC

| Hạng mục | Cốc Lếu | PB template | Master template | Dự án hiện hữu khác | Dự án mới |
|---|---|---|---|---|---|
| Đưa PB Utility vào monorepo | Cần cập nhật Apps Script PB | Đã có source chuẩn | Không | Cần cập nhật khi rollout | Có sẵn từ template |
| Schema N:R, P/Q/R | Cần chạy upgrade thủ công | Đã cập nhật | Không | Cần chạy upgrade thủ công | Có sẵn khi clone |
| `DetailTaskId` cho `PB_DETAIL` | Backfill thủ công bằng upgrade | Helper/schema có sẵn | Không | Backfill thủ công bằng upgrade | Sinh theo schema |
| Protection N:R | Cần chạy upgrade hoặc format lại | Đã cập nhật | Không | Cần rollout | Có sẵn khi clone |
| Master sync `PB_DETAIL` | Chỉ đọc/giữ logic MASTER | Không | Cần review nếu sửa Master sync | Cần rollout nếu Master sync đổi | Theo template Master mới |

## Deploy thủ công

1. Review diff local.
2. Deploy Apps Script PB vào bản copy/test của file PB.
3. Backup file PB.
4. Chạy `nangCapSchemaPBDetailV1` thủ công.
5. Kiểm tra P:R ẩn/bảo vệ, `PB_DETAIL` có `DetailTaskId`, Q/R chỉ nhận 0-100.
6. Sau khi test đạt, mới rollout sang file PB vận hành.
