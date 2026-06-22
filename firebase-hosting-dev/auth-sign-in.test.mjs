import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bindClickOnce, createGoogleSignInHandler, getGoogleSignInErrorMessage } from './auth-sign-in.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function testSingleRequestWhilePending() {
  const request = deferred();
  const pendingStates = [];
  let popupCalls = 0;
  const handler = createGoogleSignInHandler({
    getCurrentAuth: () => ({ languageCode: 'vi' }),
    createProvider: () => ({ setCustomParameters() {} }),
    signInWithPopup: () => { popupCalls += 1; return request.promise; },
    setPending: (value) => pendingStates.push(value),
    setStatus() {}
  });

  const first = handler();
  const second = handler();
  await Promise.resolve();
  assert.equal(popupCalls, 1, 'consecutive clicks must share one popup request');
  assert.deepEqual(pendingStates, [true], 'button must remain pending while popup is open');
  request.resolve({ user: { email: 'user@example.com' } });
  await Promise.all([first, second]);
  assert.deepEqual(pendingStates, [true, false], 'button must be restored after auth completes');
}

async function testPopupErrorDoesNotRetry() {
  let popupCalls = 0;
  const statuses = [];
  const handler = createGoogleSignInHandler({
    getCurrentAuth: () => ({}),
    createProvider: () => ({ setCustomParameters() {} }),
    signInWithPopup: async () => {
      popupCalls += 1;
      throw { code: 'auth/popup-closed-by-user' };
    },
    setPending() {},
    setStatus: (...args) => statuses.push(args),
    logger: { warn() {} }
  });

  await handler();
  assert.equal(popupCalls, 1, 'popup errors must not trigger automatic retry');
  assert.match(statuses.at(-1)[0], /đóng cửa sổ đăng nhập/i);
}

function testListenerBoundOnce() {
  const listeners = [];
  const element = { dataset: {}, addEventListener: (type, handler) => listeners.push([type, handler]) };
  const handler = () => {};
  assert.equal(bindClickOnce(element, 'SignIn', handler), true);
  assert.equal(bindClickOnce(element, 'SignIn', handler), false);
  assert.equal(listeners.length, 1, 'the same listener binding must only be installed once');
}

assert.match(getGoogleSignInErrorMessage({ code: 'auth/popup-blocked' }), /chặn cửa sổ đăng nhập/i);
assert.match(getGoogleSignInErrorMessage({ code: 'auth/network-request-failed' }), /kiểm tra mạng/i);
assert.match(getGoogleSignInErrorMessage({ code: 'auth/cancelled-popup-request' }), /đã được hủy/i);
await testSingleRequestWhilePending();
await testPopupErrorDoesNotRetry();
testListenerBoundOnce();

const appSource = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const registrationSource = await readFile(new URL('./self-registration.js', import.meta.url), 'utf8');
const backendSource = await readFile(new URL('../apps-script-dev-api/37_SELF_REGISTRATION_SCOPE.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('./index.html', import.meta.url), 'utf8');
assert.equal((appSource.match(/onAuthStateChanged\(auth/g) || []).length, 1, 'app must own the only Firebase auth observer');
assert.doesNotMatch(registrationSource, /onAuthStateChanged/, 'registration module must consume the shared auth event');
assert.match(appSource, /auth\.languageCode\s*=\s*['"]vi['"]/, 'Firebase Auth language must be Vietnamese');
assert.match(registrationSource, /let registrationInFlight = false;/, 'registration submit must have an in-flight guard');
assert.match(indexSource, /<html lang="vi">/);
assert.match(indexSource, /<meta charset="utf-8">/);
for (const phrase of ['Hoàn tất thông tin tài khoản', 'Đăng xuất', 'Đã xác thực Google', 'Họ và tên', 'Hoàn tất đăng ký']) {
  assert.ok(registrationSource.includes(phrase), `missing Vietnamese registration phrase: ${phrase}`);
}
for (const phrase of ['Ban lãnh đạo', 'Trưởng/Phó phòng, ban', 'Chuyên viên/Nhân viên']) {
  assert.ok(backendSource.includes(phrase), `missing Vietnamese backend label: ${phrase}`);
}
assert.doesNotMatch(`${registrationSource}\n${backendSource}`, /Ã|Â|Æ|á»|Î|Γ¶/, 'localized files must not contain mojibake');
assert.match(backendSource, /code: 'EXECUTIVE',[\s\S]*?role: 'PMO'/);
assert.match(backendSource, /code: 'DEPT_MANAGER',[\s\S]*?role: 'EDITOR'/);
assert.match(backendSource, /code: 'SPECIALIST',[\s\S]*?role: 'REPORTER'/);
console.log('auth-sign-in tests passed');
