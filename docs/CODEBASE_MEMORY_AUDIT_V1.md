# Codebase Memory Audit V1 — QLTD

## Mục tiêu
Sau khi Codebase Memory MCP được cài và repository được index, chạy 05 truy vấn dưới đây để kiểm tra công cụ có hiểu đúng codebase QLTD hay không.

Phạm vi audit: chỉ đọc và phân tích. Không sửa code, không thay đổi schema, không push Apps Script, không deploy Firebase và không merge nhánh.

## Điều kiện trước khi chạy
- Codex đã đọc `AGENTS.md`.
- Đang đứng đúng repository QLTD.
- Branch cần audit đã được pull mới nhất.
- Working tree sạch hoặc mọi thay đổi chưa commit đã được ghi nhận rõ.
- Codebase Memory MCP đã index repository hiện tại.

---

## Audit 1 — Kiến trúc và điểm nóng

### Prompt
```text
Đọc AGENTS.md.
Dùng Codebase Memory MCP lấy architecture overview của toàn repository QLTD.

Chỉ audit, không sửa code.

Xuất:
1. Các lớp chính: Apps Script backend, Firebase frontend, cấu hình, test và tài liệu.
2. Entry point chính của từng lớp.
3. 10 file/hàm có độ kết nối hoặc phạm vi ảnh hưởng cao nhất.
4. Các module nghiệp vụ nhận diện được: WBS/Gantt, tiến độ, dashboard, quyền, báo cáo tuần/tháng, ngân sách.
5. Các vùng có coupling cao hoặc khó rollback.
6. Các điểm Codebase Memory chưa chắc chắn vì lời gọi động.
```

### Gate đạt
- Phân biệt đúng frontend và backend.
- Nhận diện được dispatcher/API, các service chính và vùng Gantt/ngân sách.
- Không gọi nhầm file tài liệu hoặc backup là entry point production.

---

## Audit 2 — Truy vết API và luồng ghi dữ liệu

### Prompt
```text
Đọc AGENTS.md.
Dùng Codebase Memory MCP truy vết các action ngân sách từ dispatcher/API đến service, validate, ghi dữ liệu, rebuild cache và response frontend.

Ưu tiên tìm các action/hàm có tên chứa:
budget, Budget, CENTRAL_NS, submitPlan, submitActual, submitCash, rebuild, dashboard.

Không sửa code.

Xuất bảng:
Action/API | Dispatcher | Service | Hàm validate | Sheet/nguồn ghi | Cache/tổng hợp | Frontend caller | Side effect | Mức chắc chắn.

Đánh dấu riêng các lời gọi bằng chuỗi action hoặc dynamic dispatch mà graph có thể bỏ sót.
```

### Gate đạt
- Xác định được luồng đọc/ghi thực tế thay vì chỉ liệt kê tên file.
- Phân biệt raw transaction với cache/dashboard.
- Không kết luận thiếu caller khi action được gọi bằng chuỗi.

---

## Audit 3 — Entry point động Apps Script

### Prompt
```text
Đọc AGENTS.md.
Dùng Codebase Memory MCP kết hợp tìm kiếm văn bản để lập inventory entry point động của Apps Script.

Tìm:
- onOpen, onEdit, doGet, doPost.
- installable trigger handler.
- menu callback.
- dispatcher/action map.
- google.script.run.
- tên hàm được lưu hoặc gọi bằng chuỗi.
- hàm global có thể được gọi từ HTML/template hoặc trigger.

Không sửa hoặc xóa hàm.

Xuất:
Tên hàm | File | Cơ chế gọi | Caller tĩnh | Caller động | Có được phép coi là dead code không | Bằng chứng.
```

### Gate đạt
- Không đánh dấu entry point động là dead code.
- Chỉ ra được các vùng cần grep/tìm kiếm bổ sung ngoài graph.

---

## Audit 4 — Trùng hàm và near-duplicate

### Prompt
```text
Đọc AGENTS.md.
Dùng Codebase Memory MCP để tìm:
1. Hàm trùng tên.
2. Hàm gần trùng logic.
3. Constant/action/endpoint trùng hoặc xung đột.
4. Hàm có zero inbound call.

Sau đó kiểm chứng từng finding bằng tìm kiếm văn bản và entry point động.
Không sửa hoặc xóa code.

Phân loại:
- Xung đột thật cần xử lý.
- Trùng hợp có chủ đích/tương thích ngược.
- Có thể hợp nhất nhưng chưa nên làm.
- Không đủ căn cứ.

Mỗi finding phải có file, dòng/hàm, bằng chứng và rủi ro nếu hợp nhất/xóa.
```

### Gate đạt
- Không đề xuất xóa chỉ vì zero inbound call.
- Có tách biệt duplicate thật với wrapper tương thích ngược.

---

## Audit 5 — Kiểm tra tác động thay đổi

### Prompt
```text
Đọc AGENTS.md.
Không sửa code.

Giả lập impact analysis cho hai thay đổi độc lập:
A. Bổ sung một field mới vào schema giao dịch ngân sách CENTRAL_NS_Raw.
B. Thay đổi cách tính ngày hiện hành của Gantt, vẫn phải ưu tiên ngày thực tế S/T và fallback ngày kế hoạch L/M.

Dùng Codebase Memory MCP để xác định:
- File/hàm bị ảnh hưởng trực tiếp.
- Caller/callee gián tiếp.
- API/frontend/cache/dashboard liên quan.
- Dynamic entry point cần kiểm tra thủ công.
- Test chọn lọc và trường hợp phải full regression.
- Rollback point.

Không giả định tên cột hoặc hàm chưa được xác minh từ source.
```

### Gate đạt
- Hai phạm vi ngân sách và Gantt không bị trộn.
- Nêu đúng điều kiện cần xác nhận trước thay đổi schema.
- Giữ nguyên nguyên tắc không ghi đè dữ liệu thực tế S/T.

---

## Mẫu tổng hợp kết quả

```text
AUDIT: <1-5>
Branch:
Commit SHA:
Thời điểm index:
Số file/nút/quan hệ được index:
Kết quả chính:
Điểm đúng đã kiểm chứng:
Điểm chưa chắc chắn:
Dynamic calls cần kiểm tra tay:
Rủi ro:
Gate: PASS / PASS CÓ ĐIỀU KIỆN / FAIL
Hành động tiếp theo:
```

## Tiêu chí chấp nhận Giai đoạn 1
Giai đoạn 1 chỉ được coi là hoàn thành khi:
- `AGENTS.md` được Codex đọc và tuân thủ.
- Skill `qltd-lean-review` được nhận diện.
- Codebase Memory MCP index đúng branch QLTD.
- Cả 05 audit đã chạy và có báo cáo.
- Không có finding nào dẫn đến sửa/xóa tự động.
- Các dynamic entry point được đánh dấu để kiểm tra thủ công.
