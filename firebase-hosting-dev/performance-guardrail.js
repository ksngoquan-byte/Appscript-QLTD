(function () {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const CACHE_NAME = 'qltd-api-read-cache-v1';
  const USER_KEY = 'qltd.perf.currentUser.v1';
  const DEBUG = new URLSearchParams(window.location.search).has('debugPerf');
  const inFlight = new Map();
  const memoryCache = new Map();

  const ACTION_POLICY = {
    profile: { ttlMs: 5 * 60 * 1000, maxStaleMs: 30 * 60 * 1000 },
    listprojects: { ttlMs: 5 * 60 * 1000, maxStaleMs: 30 * 60 * 1000 },
    ganttdata: { ttlMs: 60 * 1000, maxStaleMs: 10 * 60 * 1000 },
    listdeptplans: { ttlMs: 60 * 1000, maxStaleMs: 10 * 60 * 1000 },
    budget_getprojects: { ttlMs: 5 * 60 * 1000, maxStaleMs: 30 * 60 * 1000 },
    budget_getprojectdepts: { ttlMs: 2 * 60 * 1000, maxStaleMs: 15 * 60 * 1000 },
    budget_getdepttasks: { ttlMs: 60 * 1000, maxStaleMs: 10 * 60 * 1000 },
    budget_getdashboard: { ttlMs: 30 * 1000, maxStaleMs: 5 * 60 * 1000 },
    budget_getsummary: { ttlMs: 30 * 1000, maxStaleMs: 5 * 60 * 1000 },
    budget_getbudgetitems: { ttlMs: 60 * 1000, maxStaleMs: 10 * 60 * 1000 }
  };

  const MUTATING_GET_ACTIONS = new Set([
    'savemainmilestones',
    'resetmainmilestones',
    'setupprojectdepts',
    'web06bseedregistry'
  ]);

  let currentUser = readSessionUser();

  function log() {
    if (!DEBUG || !window.console) return;
    console.info('[QLTD PERF]', ...arguments);
  }

  function readSessionUser() {
    try {
      return String(sessionStorage.getItem(USER_KEY) || 'anonymous').trim().toLowerCase();
    } catch (error) {
      return 'anonymous';
    }
  }

  function setSessionUser(value) {
    const normalized = String(value || 'anonymous').trim().toLowerCase() || 'anonymous';
    currentUser = normalized;
    try {
      sessionStorage.setItem(USER_KEY, normalized);
    } catch (error) {
      // Session storage may be unavailable in hardened browser modes.
    }
  }

  function isAppsScriptApi(url) {
    return url.hostname === 'script.google.com' && url.pathname.includes('/macros/s/');
  }

  function getAction(url) {
    return String(url.searchParams.get('action') || '').trim().toLowerCase();
  }

  function getUserNamespace() {
    return currentUser || 'anonymous';
  }

  function getCacheUrl(url, userNamespace) {
    const cacheUrl = new URL(url.toString());
    cacheUrl.searchParams.set('__qltd_cache_user', userNamespace || 'anonymous');
    return cacheUrl.toString();
  }

  async function openApiCache() {
    if (!('caches' in window)) return null;
    try {
      return await caches.open(CACHE_NAME);
    } catch (error) {
      log('Cache Storage unavailable', error);
      return null;
    }
  }

  function responseWithCacheHeaders(response, cachedAt, state) {
    return response.clone().blob().then((body) => {
      const headers = new Headers(response.headers);
      headers.set('x-qltd-cached-at', String(cachedAt));
      headers.set('x-qltd-cache', state || 'stored');
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    });
  }

  async function putCachedResponse(url, userNamespace, response) {
    if (!response || !response.ok) return;
    const cachedAt = Date.now();
    const cacheKey = getCacheUrl(url, userNamespace);
    const storedResponse = await responseWithCacheHeaders(response, cachedAt, 'stored');
    memoryCache.set(cacheKey, storedResponse.clone());
    const cache = await openApiCache();
    if (cache) await cache.put(cacheKey, storedResponse.clone());
  }

  async function getCachedResponse(url, userNamespace) {
    const cacheKey = getCacheUrl(url, userNamespace);
    let response = memoryCache.get(cacheKey);
    if (response) response = response.clone();

    if (!response) {
      const cache = await openApiCache();
      if (cache) response = await cache.match(cacheKey);
    }

    if (!response) return null;
    const cachedAt = Number(response.headers.get('x-qltd-cached-at') || 0);
    if (!cachedAt) return null;
    return {
      response: response.clone(),
      cachedAt,
      ageMs: Math.max(0, Date.now() - cachedAt)
    };
  }

  async function deleteCurrentUserCache() {
    const namespace = getUserNamespace();
    memoryCache.clear();
    const cache = await openApiCache();
    if (!cache) return;
    const requests = await cache.keys();
    await Promise.all(requests.map((request) => {
      const requestUrl = new URL(request.url);
      return requestUrl.searchParams.get('__qltd_cache_user') === namespace
        ? cache.delete(request)
        : Promise.resolve(false);
    }));
    log('Invalidated API cache for', namespace);
  }

  function emitMetric(detail) {
    window.dispatchEvent(new CustomEvent('qltd:performance', { detail }));
    log(detail);
  }

  async function networkFetchAndCache(request, url, userNamespace, action) {
    const dedupeKey = `${request.method}:${url.toString()}:${userNamespace}`;
    if (inFlight.has(dedupeKey)) {
      const sharedResponse = await inFlight.get(dedupeKey);
      return sharedResponse.clone();
    }

    const startedAt = performance.now();
    const promise = nativeFetch(request)
      .then(async (response) => {
        if (response.ok) await putCachedResponse(url, userNamespace, response.clone());
        emitMetric({
          action,
          source: 'network',
          durationMs: Math.round(performance.now() - startedAt),
          ok: response.ok
        });
        return response;
      })
      .finally(() => inFlight.delete(dedupeKey));

    inFlight.set(dedupeKey, promise);
    const response = await promise;
    return response.clone();
  }

  async function backgroundRefresh(request, url, userNamespace, action) {
    try {
      const response = await networkFetchAndCache(request, url, userNamespace, action);
      window.dispatchEvent(new CustomEvent('qltd:background-data-refreshed', {
        detail: { action, url: url.toString(), ok: response.ok }
      }));
    } catch (error) {
      log('Background refresh failed', action, error);
    }
  }

  async function syntheticMainMilestones(url, userNamespace) {
    const projectCode = url.searchParams.get('projectCode') || '';
    if (!projectCode) return null;

    const ganttUrl = new URL(url.toString());
    ganttUrl.searchParams.set('action', 'ganttData');
    ganttUrl.searchParams.set('projectCode', projectCode);
    ganttUrl.searchParams.delete('email');

    const cached = await getCachedResponse(ganttUrl, userNamespace);
    if (!cached) return null;

    try {
      const payload = await cached.response.clone().json();
      const ids = Array.isArray(payload.mainMilestoneIds) ? payload.mainMilestoneIds : [];
      const codes = Array.isArray(payload.mainMilestoneCodes) ? payload.mainMilestoneCodes : [];
      return new Response(JSON.stringify({
        success: true,
        ids,
        codes,
        mainMilestoneIds: ids,
        mainMilestoneCodes: codes,
        source: 'gantt_payload_cache'
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'x-qltd-cache': 'synthetic-gantt-milestones'
        }
      });
    } catch (error) {
      return null;
    }
  }

  window.fetch = async function qltdPerformanceFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url, window.location.href);

    if (!isAppsScriptApi(url)) return nativeFetch(request);

    const action = getAction(url);
    const method = String(request.method || 'GET').toUpperCase();

    if (action === 'profile') {
      const profileEmail = url.searchParams.get('email');
      if (profileEmail) setSessionUser(profileEmail);
    }

    if (method !== 'GET') {
      const response = await nativeFetch(request);
      if (response.ok) await deleteCurrentUserCache();
      return response;
    }

    if (action === 'health') {
      emitMetric({ action, source: 'synthetic', durationMs: 0, ok: true });
      return new Response(JSON.stringify({
        success: true,
        service: 'QLTD_DEV_API',
        status: 'OK',
        source: 'client_guardrail'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'x-qltd-cache': 'synthetic-health' }
      });
    }

    const userNamespace = getUserNamespace();

    if (action === 'getmainmilestones') {
      const synthetic = await syntheticMainMilestones(url, userNamespace);
      if (synthetic) {
        emitMetric({ action, source: 'synthetic-gantt-cache', durationMs: 0, ok: true });
        backgroundRefresh(request.clone(), url, userNamespace, action);
        return synthetic;
      }
    }

    if (MUTATING_GET_ACTIONS.has(action)) {
      const response = await nativeFetch(request);
      if (response.ok) await deleteCurrentUserCache();
      return response;
    }

    const policy = ACTION_POLICY[action];
    if (!policy) return nativeFetch(request);

    const cached = await getCachedResponse(url, userNamespace);
    if (cached && cached.ageMs <= policy.maxStaleMs) {
      const startedAt = performance.now();
      backgroundRefresh(request.clone(), url, userNamespace, action);
      const response = await responseWithCacheHeaders(cached.response, cached.cachedAt, cached.ageMs <= policy.ttlMs ? 'hit-fresh' : 'hit-stale');
      emitMetric({
        action,
        source: cached.ageMs <= policy.ttlMs ? 'cache-fresh' : 'cache-stale',
        durationMs: Math.round(performance.now() - startedAt),
        cacheAgeMs: cached.ageMs,
        ok: true
      });
      return response;
    }

    try {
      return await networkFetchAndCache(request, url, userNamespace, action);
    } catch (error) {
      if (cached) {
        emitMetric({ action, source: 'cache-fallback', durationMs: 0, cacheAgeMs: cached.ageMs, ok: true });
        return responseWithCacheHeaders(cached.response, cached.cachedAt, 'fallback');
      }
      throw error;
    }
  };

  window.__QLTD_PERFORMANCE_GUARDRAIL__ = {
    version: 'PERF_GUARDRAIL_V1',
    clearCurrentUserCache: deleteCurrentUserCache,
    getCurrentUser: () => getUserNamespace()
  };
})();
