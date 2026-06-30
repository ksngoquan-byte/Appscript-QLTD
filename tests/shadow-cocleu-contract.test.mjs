import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync('apps-script-dev-api/70_Firestore_Shadow_CocLeu_Service.js', 'utf8');
const dispatcher = readFileSync('apps-script-dev-api/28_DEV_API.js', 'utf8');
const app = readFileSync('firebase-hosting-dev/app.js', 'utf8');
const manifest = readFileSync('apps-script-dev-api/appsscript.json', 'utf8');

assert.match(service, /SPREADSHEET_ID:\s*'1XQXeT92SjqHt4-UV3aVMNAmSioF9JVOhdjZqy7HhS90'/);
assert.match(service, /SHEET_NAME:\s*'Cong_viec'/);
assert.match(service, /HEADER_ROW:\s*4/);
assert.match(service, /DATA_START_ROW:\s*5/);
assert.match(service, /FIREBASE_PROJECT_ID:\s*'qltd-entiz-dev-208a3'/);
assert.match(service, /qltdUsersNormalizeRole_\(user\.role\)\s*!==\s*'ADMIN'/);
assert.match(service, /FORBIDDEN_ADMIN_ONLY/);
assert.doesNotMatch(service, /payload\.spreadsheetId/);
assert.match(service, /shadowRequests/);
assert.match(service, /shadowSnapshots/);
assert.match(service, /shadowState/);
assert.match(service, /ScriptApp\.getOAuthToken\(\)/);

['shadow_sync_cocleu', 'shadow_reconcile_cocleu', 'shadow_get_latest_status'].forEach((action) => {
  assert.match(dispatcher, new RegExp(action));
  assert.match(app, new RegExp(action));
});

assert.match(manifest, /https:\/\/www\.googleapis\.com\/auth\/datastore/);
assert.match(app, /SHADOW DEV – KHÔNG PHẢI DỮ LIỆU CHÍNH THỨC/);
assert.match(app, /function renderShadowPilotCard\(\)/);
assert.match(app, /if \(!canAdmin\(\)\) return '';/);

console.log('Shadow Cốc Lếu contract: PASS');
