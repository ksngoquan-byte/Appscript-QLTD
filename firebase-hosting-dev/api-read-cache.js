const cache = new Map();
const pending = new Map();
const mutationWords = ['sync','save','update','create','delete','approve','reset','write','submit','confirm','cancel'];

function actionOf(url) {
  try { return new URL(url).searchParams.get('action') || ''; } catch { return ''; }
}

function isApi(url) {
  try { const u = new URL(url); return u.hostname === 'script.google.com' && u.pathname.includes('/macros/s/'); } catch { return false; }
}

function isMutation(action) {
  const value = String(action).toLowerCase();
  return mutationWords.some((word) => value.includes(word));
}

function ttlFor(action) {
  if (action === 'listProjects') return 60000;
  if (String(action).toLowerCase() === 'budget_getlivedashboard') return 120000;
  return 15000;
}

function copy(entry) {
  return new Response(entry.body, { status: entry.status, headers: entry.headers });
}

function seedDepartmentDashboards(url, body, status, headers) {
  try {
    const payload = JSON.parse(body);
    const data = payload && (payload.data || payload);
    const views = data && data.departmentViews;
    if (!views || typeof views !== 'object') return;

    Object.entries(views).forEach(([deptCode, departmentData]) => {
      const nextUrl = new URL(url);
      nextUrl.searchParams.set('deptCode', deptCode);
      nextUrl.searchParams.set('view', 'department');
      nextUrl.searchParams.set('force', '');
      const envelope = payload.data
        ? { ...payload, data: departmentData }
        : { ...payload, ...departmentData };
      const key = `GET:${nextUrl.toString()}`;
      cache.set(key, {
        body: JSON.stringify(envelope),
        status,
        headers,
        expiresAt: Date.now() + 120000
      });
    });
  } catch (_error) {
    // Ignore optional cache seeding and keep normal response flow.
  }
}

export function installApiReadCache(target = window) {
  if (target.__qltdReadCacheInstalled) return;
  target.__qltdReadCacheInstalled = true;
  const originalFetch = target.fetch.bind(target);

  target.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = String(init.method || input.method || 'GET').toUpperCase();
    if (!isApi(url)) return originalFetch(input, init);

    const action = actionOf(url);
    if (action === 'health') {
      return new Response(JSON.stringify({ success: true, service: 'QLTD_DEV_API', status: 'OK', clientBypass: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (method !== 'GET' || isMutation(action)) {
      cache.clear();
      return originalFetch(input, init);
    }

    const key = `${method}:${url}`;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return copy(hit);
    if (pending.has(key)) return (await pending.get(key)).clone();

    const request = originalFetch(input, init).then(async (response) => {
      if (response.ok) {
        const body = await response.clone().text();
        const headers = Array.from(response.headers.entries());
        cache.set(key, {
          body,
          status: response.status,
          headers,
          expiresAt: Date.now() + ttlFor(action)
        });
        if (String(action).toLowerCase() === 'budget_getlivedashboard') {
          seedDepartmentDashboards(url, body, response.status, headers);
        }
      }
      return response;
    }).finally(() => pending.delete(key));

    pending.set(key, request);
    return (await request).clone();
  };
}

if (typeof window !== 'undefined') installApiReadCache(window);
