# User_Project_Dept_Access — Schema Dry-run

Status: `DRY_RUN_ONLY`

Live applied: `NO`
Target Central Data Spreadsheet ID: `1ZAZwSjGOvKEp8iLCqLsEiJyJSFBR-jeru0RL25Q4xMM`

## Thay đổi dự kiến

Thêm sheet `User_Project_Dept_Access` với 10 header:

```text
Email | ProjectCode | DeptCode | PermissionCode | Status | EffectiveFrom | EffectiveTo | GrantedBy | GrantedAt | Note
```

Dòng dự kiến sau khi có phê duyệt apply live riêng:

```text
thipt.entiz@gmail.com | 37-5.HL1 | BQLDA | UPDATE_PROGRESS | ACTIVE | <blank> | <blank> | <granted-by> | <granted-at> | Ủy quyền cập nhật tiến độ BQLDA dự án C1 Hưng Lộc
```

## Code phụ thuộc

- `71_User_Project_Dept_Access_Service.js`: schema check, dry-run, batch read, thời hạn, effective scopes, whitelist và audit log.
- `37_SELF_REGISTRATION_SCOPE.js`: identity, target project/dept và authorization trước dispatch.
- Task, PB_DETAIL, weekly update/report và read APIs chỉ nhận delegated scope khi record chính xác đang hiệu lực.

## Tác động khi sheet chưa tồn tại

- Quyền phòng ban gốc: không đổi.
- Delegated access: deny.
- Runtime: không crash, ghi warning.
- Không tự tạo sheet hoặc header.

## Không thay đổi

- `Users`, gồm `DeptCode`/`DeptName` của Phạm Trường Thi.
- `Project_Depts`.
- File dự án, sheet BQLDA và dữ liệu công việc.
- WBS, Gantt, baseline, dependency hoặc ngân sách.
- Header `WEEKLY_REPORTS`.

## Rủi ro và kiểm soát

- Sai project/dept: so khớp chính xác với `Project_Depts.DeptCode`; deny nếu không khớp.
- Payload vượt quyền: whitelist fail-closed trước lock/write.
- Cache: record thay đổi có độ trễ tối đa 60 giây; schema thiếu/sai được kiểm tra trước cache và deny ngay.
- Identity giả mạo: email client bị ghi đè bằng Firebase identity đã xác minh.

## Rollback

Đặt `Status = INACTIVE` hoặc xóa record. Code tự fallback về quyền phòng ban gốc.

## Nghiệm thu

1. Đối chiếu Spreadsheet ID và 10 header.
2. Kiểm tra duy nhất record email/project/dept/permission được phê duyệt.
3. Chạy test scope đúng, project/dept sai, inactive/thời hạn, missing sheet và field whitelist.
4. Kiểm tra log `DELEGATED_ACCESS` thể hiện home dept `KYTHUAT`, acting dept `BQLDA`.
5. Xác nhận review/approval, create/assign, WBS, baseline và budget tiếp tục bị chặn.
