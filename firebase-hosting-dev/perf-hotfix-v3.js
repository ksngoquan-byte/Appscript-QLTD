import { getApp, getApps } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';

const VERSION = 'PERF_DEPT_DETAIL_BUDGET_3';
const readCache = new Map();
const inFlight = new Map();
const prefetched = new Set();
const protectedReads = new Set(['work_getdetailtasks', 'work_listassignees']);
const cachedReads = new Set([
  'listdeptplans',
  'work_getdetailtasks',
  'work_listassignees',
  'budget_gettaskbudgetmap'
]);

function isAppsScriptApi(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'script.google.com' && parsed.pathname.includes('/macros/s/');
  } catch {
    return false;
  }
}

function actionOf(url) {
  try { return String(new URL(url).searchParams.get('action') || '').trim().toLowerCase(); } catch { return ''; }
}

function canonicalKey(method, url) {
  const parsed = new URL(url);
  const ignored = new Set(['idtoken', 'token', '_', 'cachebuster', 'force']);
  const entries = Array.from(parsed.searchParams.entries())
    .filter(([key, value]) => !ignored.has(String(key).toLowerCase()) && String(value || '').trim() !== '')
    .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || String(av).localeCompare(String(bv)));
  parsed.search = '';
  entries.forEach(([key, value]) => parsed.searchParams.append(key, value));
  return `${method}:${parsed.toString()}`;
}

function ttlFor(action) {
  if (action === 'work_getdetailtasks') return 60 * 1000;
  if (action === 'work_listassignees') return 10 * 60 * 1000;
  if (action === 'budget_gettaskbudgetmap') return 5 * 60 * 1000;
  if (action === 'listdeptplans') return 2 * 60 * 1000;
  return 15 * 1000;
}

function cloneStored(entry) {
  return new Response(entry.body, { status: entry.status, statusText: entry.statusText, headers: entry.headers });
}

async function storeResponse(key, action, response) {
  if (!response?.ok) return;
  const body = await response.clone().text();
  readCache.set(key, {
    body,
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers.entries()),
    expiresAt: Date.now() + ttlFor(action)
  });
}

function currentUser() {
  try {
    if (!getApps().length) return null;
    return getAuth(getApp()).currentUser || null;
  } catch {
    return null;
  }
}

async function addAuth(input, init, action, forceRefresh = false) {
  const user = currentUser();
  if (!user) return { input, init };
  const method = String(init?.method || input?.method || 'GET').toUpperCase();
  const needsAuth = protectedReads.has(action) || (method !== 'GET' && action.startsWith('work_'));
  if (!needsAuth) return { input, init };

  const idToken = await user.getIdToken(forceRefresh);
  if (method === 'GET') {
    const nextUrl = new URL(typeof input === 'string' ? input : input.url);
    nextUrl.searchParams.set('email', user.email || nextUrl.searchParams.get('email') || '');
    nextUrl.searchParams.set('idToken', idToken);
    return { input: nextUrl.toString(), init };
  }

  let payload = {};
  try {
    const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : '');
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return { input, init };
  }
  payload.email = user.email || payload.email || '';
  payload.idToken = idToken;
  return {
    input: typeof input === 'string' ? input : input.url,
    init: {
      ...(init || {}),
      method,
      headers: { ...(init?.headers || {}), 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    }
  };
}

async function tokenError(response) {
  try {
    const payload = await response.clone().json();
    const code = String(payload?.errorCode || payload?.message || payload?.errors?.[0]?.code || '').toUpperCase();
    return code.includes('ID_TOKEN_INVALID') || code.includes('ID_TOKEN_EXPIRED');
  } catch {
    return false;
  }
}

async function fetchWithAuth(fetchImpl, input, init, action) {
  let request = await addAuth(input, init, action, false);
  let response = await fetchImpl(request.input, request.init);
  if (await tokenError(response)) {
    request = await addAuth(input, init, action, true);
    response = await fetchImpl(request.input, request.init);
  }
  return response;
}

function siblingUrl(url, action) {
  const next = new URL(url);
  next.searchParams.set('action', action);
  next.searchParams.delete('force');
  next.searchParams.delete('_');
  return next.toString();
}

function prefetch(fetchImpl, sourceUrl, action, delayMs = 0) {
  const url = siblingUrl(sourceUrl, action);
  const key = canonicalKey('GET', url);
  const marker = `${action}:${key}`;
  if (prefetched.has(marker) || inFlight.has(key) || (readCache.get(key)?.expiresAt || 0) > Date.now()) return;
  prefetched.add(marker);

  const run = async () => {
    const promise = fetchWithAuth(fetchImpl, url, { method: 'GET', cache: 'no-store' }, action)
      .then(async (response) => {
        await storeResponse(key, action, response);
        return response;
      })
      .catch(() => null)
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    await promise;
  };

  if (delayMs > 0) setTimeout(run, delayMs);
  else run();
}

function install() {
  if (window.__qltdPerfDeptDetailBudgetV3) return;
  window.__qltdPerfDeptDetailBudgetV3 = VERSION;
  const wrappedFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input.url;
    if (!isAppsScriptApi(rawUrl)) return wrappedFetch(input, init);

    const method = String(init.method || input.method || 'GET').toUpperCase();
    const action = actionOf(rawUrl);

    if (method !== 'GET') {
      const response = await fetchWithAuth(wrappedFetch, input, init, action);
      if (response.ok) {
        readCache.clear();
        prefetched.clear();
      }
      return response;
    }

    if (action === 'ganttdata') {
      prefetch(wrappedFetch, rawUrl, 'budget_gettaskbudgetmap', 0);
    }

    if (!cachedReads.has(action)) {
      const response = await fetchWithAuth(wrappedFetch, input, init, action);
      if (action === 'ganttdata' && response.ok) prefetch(wrappedFetch, rawUrl, 'listdeptplans', 1200);
      return response;
    }

    const authenticated = await addAuth(input, init, action, false);
    const authenticatedUrl = typeof authenticated.input === 'string' ? authenticated.input : authenticated.input.url;
    const key = canonicalKey('GET', authenticatedUrl);
    const hit = readCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return cloneStored(hit);
    if (inFlight.has(key)) {
      const shared = await inFlight.get(key);
      return shared ? shared.clone() : fetchWithAuth(wrappedFetch, input, init, action);
    }

    const promise = fetchWithAuth(wrappedFetch, input, init, action)
      .then(async (response) => {
        await storeResponse(key, action, response);
        return response;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return (await promise).clone();
  };

  console.info(`[QLTD PERF] ${VERSION} active`);
}

install();
