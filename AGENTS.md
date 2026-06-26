# AGENTS.md — Công cụ QL KH Tổng thể dự án (QLTD)

## 1. Vai trò và phạm vi
Repository này phục vụ Công cụ Quản lý Kế hoạch Tổng thể dự án, gồm Google Apps Script, Google Sheets và Firebase WebApp.

Codex/AI là trợ lý thực thi kỹ thuật. Không tự thay đổi logic nghiệp vụ chính, schema dữ liệu, trigger, quyền truy cập, môi trường deploy hoặc nhánh chính nếu chưa được người dùng chấp thuận.

## 2. Nguồn chuẩn
- Apps Script: bản code chính đang chạy.
- GitHub: bản đồng bộ để rà soát, lưu lịch sử, chỉnh sửa và rollback.
- Google Sheets/Central Data: nguồn dữ liệu vận hành.
- Sheet `Cong_viec`: nguồn chuẩn của WBS, công việc và dữ liệu tiến độ gốc, trừ khi tài liệu nghiệp vụ mới được phê duyệt quy định khác.

## 3. Trước khi sửa
Bắt buộc thực hiện theo thứ tự:
1. Đọc `AGENTS.md`.
2. Kiểm tra branch và trạng thái working tree.
3. Đọc README, changelog, tài liệu kiến trúc hoặc schema nếu tồn tại.
4. Đọc đầy đủ file liên quan trực tiếp và các caller/callee chính.
5. Nếu thay đổi dữ liệu/cột/sheet: đọc schema sheet, hàm đọc header, hàm ghi dữ liệu, cache và API liên quan.
6. Nêu mục tiêu, phạm vi, file/hàm dự kiến sửa, rủi ro, rollback và test bắt buộc trước khi chỉnh code.

Không đoán âm thầm. Khi thiếu dữ liệu, ghi rõ `[THIẾU DỮ LIỆU]` và phần cần người dùng cung cấp.

## 4. Nguyên tắc sửa code
- Ưu tiên sửa cục bộ, module nhỏ, diff nhỏ và dễ rollback.
- Không viết lại toàn bộ module khi có thể vá đúng nguyên nhân gốc.
- Không đổi business logic chính nếu chưa được duyệt.
- Chống trùng hàm, trùng constant, trùng endpoint và trùng event handler.
- Tái sử dụng hàm hiện có khi phù hợp; không tạo abstraction chỉ có một nơi dùng.
- Không thêm dependency nếu nền tảng hiện tại đã đáp ứng.
- Giữ tương thích ngược với API và dữ liệu đang chạy, trừ khi có migration được duyệt.
- Không xóa hàm chỉ vì không thấy caller tĩnh. Apps Script có thể gọi động qua menu, trigger, dispatcher, tên action dạng chuỗi hoặc global scope.

## 5. Google Apps Script
Ưu tiên:
- Batch read/write; tránh `getValue/setValue` trong vòng lặp lớn.
- Hạn chế `openById` trong vòng lặp.
- Có validate input, error handling và logging rõ.
- Dùng `LockService` cho luồng ghi có nguy cơ đồng thời.
- Có idempotency/mã giao dịch cho thao tác có thể retry.
- Không chạy tác vụ nặng trong `onEdit` hoặc `onOpen`.
- Không ghi đè dữ liệu thực tế do người dùng nhập nếu nghiệp vụ không cho phép.

Trigger:
- Có thể đề xuất tạo/xóa/đổi trigger.
- Không thực hiện hoặc hướng dẫn chạy thay đổi trigger cho đến khi người dùng xác nhận.

Deploy:
- Không tự `clasp push`, deploy Apps Script WebApp hoặc tạo phiên bản triển khai nếu chưa được yêu cầu rõ.
- Trước `clasp push`, phải kiểm tra đúng project path và Apps Script project ID.

## 6. Google Sheets và schema
Có thể đề xuất thêm/xóa/đổi tên cột hoặc sheet, nhưng trước khi thực hiện phải trình:
- Thay đổi cụ thể.
- Tác động đến code, công thức, dữ liệu, API, cache và dashboard.
- Rủi ro và phương án rollback.
- Migration dry-run và test cases.

Không xóa, đổi tên hoặc chèn giữa các cột đang dùng nếu chưa được duyệt. Ưu tiên append field mới và giữ tương thích ngược.

## 7. Firebase WebApp
- Không đổi ID DOM, tên action API, event binding hoặc cấu trúc quyền khi chỉ chỉnh giao diện.
- Không thêm animation hoặc thư viện UI không cần thiết.
- Dashboard phải ưu tiên tốc độ tải, khả năng quét nhanh và dữ liệu điều hành.
- Giữ nhãn tiếng Việt và trạng thái lỗi/cảnh báo/chờ duyệt rõ ràng.
- Frontend không được đọc trực tiếp nhiều file/sheet nếu backend đã có cache/API tổng hợp.

## 8. Git và GitHub
- Không tự merge vào `main`.
- Sửa trên branch riêng theo phạm vi nhiệm vụ.
- Không gom commit hoặc file ngoài phạm vi.
- Commit message phải mô tả đúng module và mục tiêu.
- Trước push: kiểm tra diff, file/hàm thay đổi, ảnh hưởng logic cũ, test và rollback point.
- Không đưa secret, token, cookie, credential, file `.clasp.json`, log nhạy cảm hoặc dữ liệu người dùng lên GitHub.

## 9. Mức kiểm thử
### Test chọn lọc
Áp dụng cho thay đổi cục bộ:
- Test API/hàm trực tiếp bị sửa.
- Test caller chính.
- Test dữ liệu đầu vào hợp lệ và lỗi.
- Test regression tối thiểu của module liên quan.

### Full regression
Bắt buộc khi thay đổi một trong các nhóm:
- Dispatcher/API nền.
- Quyền truy cập hoặc phân quyền.
- Schema sheet dùng chung.
- Cache/tổng hợp ảnh hưởng nhiều dashboard.
- Engine tiến độ, baseline, WBS hoặc logic dùng chung.
- Có dấu hiệu lỗi ảnh hưởng rộng.

## 10. Codebase Memory MCP
Khi công cụ này khả dụng:
- Dùng để lấy kiến trúc, call graph, impact analysis, near-duplicate và hotspot trước khi sửa module lớn.
- Luôn kiểm chứng dynamic entry point bằng tìm kiếm văn bản: menu, trigger, dispatcher, tên hàm dạng chuỗi và Apps Script global scope.
- Không kết luận dead code chỉ dựa trên zero inbound call.
- Không commit database/graph cục bộ vào repo này.

## 11. Skill `qltd-lean-review`
Chỉ dùng sau khi review correctness, security, performance và regression đã hoàn tất.

Skill này chỉ tìm phần over-engineering hoặc complexity thừa. Không được đề xuất xóa:
- Logging và audit trail.
- Validation và error handling cần thiết.
- `LockService` và idempotency.
- Dry-run, migration guard và rollback.
- Test tối thiểu.
- Hàm entry point động của Apps Script.

Skill chỉ đề xuất; không tự áp dụng sửa đổi.

## 12. Output bắt buộc sau mỗi lần sửa
Luôn trả về:
1. Tóm tắt thay đổi.
2. File/hàm đã sửa.
3. Rủi ro còn lại.
4. Việc cần test và kết quả test đã chạy.
5. Có cần push Apps Script không.
6. Có cần push GitHub không.
7. Có cần Codex/PowerShell không.
8. Rollback point hoặc cách hoàn tác.

## 13. Điều cấm
- Không sửa production theo cảm tính.
- Không tự thay đổi schema hoặc trigger.
- Không tự deploy/push Apps Script.
- Không tự merge `main`.
- Không xóa dữ liệu lịch sử hoặc raw data để sửa dashboard/cache.
- Không che giấu test chưa chạy hoặc giả định chưa kiểm chứng.
