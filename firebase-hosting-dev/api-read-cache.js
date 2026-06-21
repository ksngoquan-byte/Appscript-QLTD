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

function copy(entry) {
  return new Response(entry.body, { status: entry.status, headers: entry.headers });
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
        cache.set(key, {
          body,
          status: response.status,
          headers: Array.from(response.headers.entries()),
          expiresAt: Date.now() + (action === 'listProjects' ? 60000 : 15000)
        });
      }
      return response;
    }).finally(() => pending.delete(key));

    pending.set(key, request);
    return (await request).clone();
  };
}

if (typeof window !== 'undefined') installApiReadCache(window);
