const GOOGLE_SIGN_IN_ERROR_MESSAGES = {
  'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập. Hãy thử lại khi sẵn sàng.',
  'auth/cancelled-popup-request': 'Yêu cầu đăng nhập trước đã được hủy. Vui lòng thử lại.',
  'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép cửa sổ bật lên rồi thử lại.',
  'auth/network-request-failed': 'Không thể kết nối Google. Vui lòng kiểm tra mạng rồi thử lại.'
};

export function getGoogleSignInErrorMessage(error) {
  const code = String(error?.code || '').trim();
  return GOOGLE_SIGN_IN_ERROR_MESSAGES[code] || 'Đăng nhập Google không thành công. Vui lòng thử lại.';
}

export function createGoogleSignInHandler({
  getCurrentAuth,
  createProvider,
  signInWithPopup,
  setPending,
  setStatus,
  logger = console
}) {
  let inFlight = null;

  return function handleGoogleSignIn() {
    if (inFlight) return inFlight;

    const currentAuth = getCurrentAuth();
    if (!currentAuth) {
      setStatus('Chưa có cấu hình Firebase cho môi trường DEV.', 'warning');
      return Promise.resolve(null);
    }

    setPending(true);
    setStatus('Đang mở cửa sổ đăng nhập Google...', 'info');

    inFlight = Promise.resolve()
      .then(() => {
        const provider = createProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return signInWithPopup(currentAuth, provider);
      })
      .catch((error) => {
        const code = String(error?.code || 'auth/unknown');
        logger.warn('[QLTD] Google sign-in failed', { code });
        setStatus(getGoogleSignInErrorMessage(error), 'error');
        return null;
      })
      .finally(() => {
        inFlight = null;
        setPending(false);
      });

    return inFlight;
  };
}

export function bindClickOnce(element, bindingName, handler) {
  if (!element) return false;
  const key = `qltdBound${bindingName}`;
  if (element.dataset[key] === '1') return false;
  element.dataset[key] = '1';
  element.addEventListener('click', handler);
  return true;
}
