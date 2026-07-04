# User Project Department Access V1

## Mục tiêu

Cấp quyền bổ sung có giới hạn cho một user cập nhật tiến độ và lập/gửi báo cáo tuần của một phòng ban trong đúng một dự án, không thay đổi phòng ban gốc trong `Users`.

Cấu hình được phê duyệt:

- User: Phạm Trường Thi (`thipt.entiz@gmail.com`)
- Phòng ban gốc: `KYTHUAT`
- ProjectCode: `37-5.HL1`
- DeptCode được ủy quyền: `BQLDA`
- PermissionCode: `UPDATE_PROGRESS`
- Status: `ACTIVE`

Schema và dòng cấu hình trên chưa được apply vào Central Data trong commit này.

## Schema đề xuất

Sheet `User_Project_Dept_Access` trong Central Data gồm đúng 10 cột:

| # | Header | Quy tắc |
|---|---|---|
| 1 | Email | lowercase |
| 2 | ProjectCode | uppercase/trim |
| 3 | DeptCode | `Project_Depts.DeptCode`, uppercase/trim |
| 4 | PermissionCode | V1 chỉ hỗ trợ `UPDATE_PROGRESS` |
| 5 | Status | `ACTIVE` hoặc `INACTIVE` |
| 6 | EffectiveFrom | tùy chọn |
| 7 | EffectiveTo | tùy chọn; ngày không có giờ có hiệu lực đến cuối ngày |
| 8 | GrantedBy | người cấp quyền |
| 9 | GrantedAt | thời điểm cấp |
| 10 | Note | ghi chú |

`qltdUserProjectDeptAccessSetupDryRun_()` chỉ trả báo cáo dự kiến. Hàm không gọi `insertSheet`, `appendRow`, `setValue` hoặc `setValues`.

## Nguyên tắc quyền

Quyền hiệu lực bằng quyền phòng ban gốc cộng delegated access `ACTIVE` khớp chính xác email, project, dept và permission, đồng thời nằm trong khoảng hiệu lực nếu có.

Sheet thiếu, sai header, record không hợp lệ, `INACTIVE`, chưa tới hạn hoặc hết hạn đều fail-closed đối với delegated access. Quyền phòng ban gốc không phụ thuộc sheet này.

`BQLDA` được giữ là mã `Project_Depts.DeptCode`. Alias master department `QLDA` chỉ phục vụ so sánh phòng ban gốc, không làm delegated record áp dụng cho project khác.

## Action được ủy quyền

- `work_updatetask`
- `work_updatedetailtask`
- `weekly_taskupdates_save`
- `weekly_savedraft`
- `weekly_submit`
- Các API đọc cần cho plan, task, `PB_DETAIL`, weekly task update và báo cáo tuần trong cùng project/dept.

Không ủy quyền `weekly_review`, approval MASTER/PB_DETAIL, tạo `PB_DETAIL`, giao việc, WBS, dependency, baseline, ngân sách, cấu hình dự án, user hoặc permission administration.

## Whitelist

Các trường nghiệp vụ được phép: `status`, `taskStatus`, `progress`, `progressEnd`, `actualStart`, `actualFinish`, `updateNote`, `note`, `thisWeekResult`, `issue`, `recommendation`.

Metadata định tuyến/nhận diện như action, token, project/dept, task/item/report ID, week/period và idempotency key được phép nhưng không được dùng để thay đổi cấu trúc nguồn.

Mọi trường nghiệp vụ khác bị từ chối toàn bộ bằng `DELEGATED_PROGRESS_FIELDS_FORBIDDEN` trước lock hoặc thao tác ghi. Đặc biệt cấm task name, WBS/STT, kế hoạch, duration, dependency, owner/coordinator, weight, mọi trường ngân sách và baseline.

## Báo cáo tuần

`WEEKLY_REPORTS.UserEmail` lưu người thao tác thực tế (`PreparedBy`/`SubmittedBy`) và `DeptCode` lưu `ActingForDept`. `PermissionSource` được trả trong response và ghi audit log. Không thêm cột vào `WEEKLY_REPORTS`, vì schema được phê duyệt chỉ cho phép thêm sheet cấu hình mới.

Phạm Trường Thi có thể lưu nháp và gửi báo cáo BQLDA tại `37-5.HL1`, nhưng không thể tự duyệt. Review của trưởng/phó BQLDA và Admin/PMO giữ nguyên.

## Log

Delegated write log gồm email, display name, project, dept, action, task/report ID, period, permission code/source, phòng ban gốc, acting department, timestamp, result và error. Log luôn thể hiện người thao tác là nhân sự `KYTHUAT` đang acting for `BQLDA`.

## Cấp, thu hồi và rollback

1. Chạy dry-run và đối chiếu Spreadsheet ID/header/dòng dự kiến.
2. Sau phê duyệt live riêng, tạo sheet và dòng cấu hình bằng quy trình quản trị ngoài commit này.
3. Nghiệm thu các case scope đúng/sai và audit log.
4. Thu hồi bằng `Status = INACTIVE`; có thể xóa record nếu quy trình dữ liệu cho phép.
5. Cache quyền tối đa 60 giây; sau thu hồi cần chờ cache hết hạn hoặc xóa cache script.

Không thay đổi `Users.DeptCode`, `Users.DeptName`, `Project_Depts`, file dự án, sheet BQLDA, WBS, baseline hoặc ngân sách.

## Test

`firebase-hosting-dev/delegated-project-dept-access.test.mjs` kiểm tra quyền gốc, scope delegated đúng/sai, user khác, `INACTIVE`, thời hạn, thiếu sheet, action cấm, whitelist, ngân sách, draft/submit và metadata người thao tác.

Chạy:

```powershell
cd firebase-hosting-dev
npm test
npm run build
```

## Nghiệm thu live sau phê duyệt

- Thi thấy BQLDA chỉ tại `37-5.HL1`.
- Cập nhật tiến độ và draft/submit báo cáo thành công.
- BQLDA ở project khác và phòng khác bị từ chối.
- Payload ngân sách/kế hoạch/WBS bị từ chối không ghi một phần.
- Audit log có `DELEGATED_ACCESS`, home dept `KYTHUAT`, acting dept `BQLDA`.
- Review/approval vẫn không xuất hiện và bị backend từ chối.
