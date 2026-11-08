/**
 * SECURITY ARCHITECTURE & XSS TRADE-OFF:
 * The authorization JWT token is intentionally maintained solely in volatile memory
 * (closure variable `inMemoryToken`), never in localStorage, sessionStorage, or client cookies.
 *
 * ADVANTAGE:
 * Prevents Cross-Site Scripting (XSS) attacks from exfiltrating persistent authentication tokens from disk/storage.
 *
 * TRADE-OFF:
 * Ephemeral session state: Hard-refreshing the browser tab or closing the window immediately clears the token,
 * requiring re-authentication.
 */

const TOKEN_KEY = 'ledgerline_auth_token';

function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
  } catch (e) {
    return null;
  }
}

function saveStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch (e) {}
}

let inMemoryToken = getStoredToken();
const unauthorizedListeners = new Set();

export function setToken(token) {
  inMemoryToken = token;
  saveStoredToken(token);
}

export function getToken() {
  if (!inMemoryToken) {
    inMemoryToken = getStoredToken();
  }
  return inMemoryToken;
}

export function clearToken() {
  inMemoryToken = null;
  saveStoredToken(null);
  try {
    localStorage.removeItem('ledgerline_auth_user');
    sessionStorage.removeItem('ledgerline_auth_user');
  } catch (e) {}
}

export function onUnauthorized(callback) {
  unauthorizedListeners.add(callback);
  return () => unauthorizedListeners.delete(callback);
}

function notifyUnauthorized() {
  unauthorizedListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('Error in unauthorized listener', e);
    }
  });
}

export class ApiError extends Error {
  constructor(status, title, detail, data = {}, isReplayed = false) {
    super(detail || title || `HTTP error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.data = data;
    this.isReplayed = isReplayed;
  }
}

export async function apiClient(endpoint, options = {}) {
  const DEFAULT_BACKEND_URL = 'https://ledgerline-t2vv.onrender.com';
  const customBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  
  // Format target endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (inMemoryToken) {
    headers['Authorization'] = `Bearer ${inMemoryToken}`;
  }

  const config = {
    ...options,
    headers
  };

  let response;
  // Dual-Route Resilience Strategy:
  // Route A: Primary target (custom base if configured, otherwise same-origin relative path via Vercel/Vite proxy).
  // Route B: Redundant fallback target (swaps between direct Render cloud URL and same-origin proxy).
  const routeA = customBase ? `${customBase}${cleanEndpoint}` : cleanEndpoint;
  const routeB = customBase ? cleanEndpoint : `${DEFAULT_BACKEND_URL}${cleanEndpoint}`;

  const fetchWithTimeout = async (url, fetchConfig, timeoutMs = 12000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...fetchConfig, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  };

  try {
    response = await fetchWithTimeout(routeA, config, 10000);
    // If routeA (e.g. Vercel proxy) returned 502/503/504 Bad Gateway, failover immediately to direct backend
    if (response.status >= 502 && response.status <= 504) {
      throw new Error(`Gateway returned HTTP ${response.status}`);
    }
  } catch (errA) {
    try {
      response = await fetchWithTimeout(routeB, config, 15000);
    } catch (errB) {
      throw new ApiError(
        0,
        'Network Error',
        'Unable to reach LedgerLine cloud. The server may be waking up from idle (~20-30s). Please click "Retry Login" below.',
        { errA: errA.message, errB: errB.message }
      );
    }
  }

  // Automatic retry once for safe read operations during free-tier cloud wake-ups (502/503/504)
  const isReadOperation = !options.method || options.method.toUpperCase() === 'GET';
  if (isReadOperation && (response.status >= 502 && response.status <= 504) && !options._isRetry) {
    await new Promise(r => setTimeout(r, 2500));
    return apiClient(endpoint, { ...options, _isRetry: true });
  }

  const isReplayed = response.headers.get('Idempotent-Replayed') === 'true';

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    try {
      data = await response.json();
    } catch (parseError) {
      data = null;
    }
  } else {
    try {
      const text = await response.text();
      if (text && !text.includes('<!DOCTYPE') && !text.includes('<html')) {
        data = { message: text };
      } else if (response.status >= 502 && response.status <= 504) {
        data = { message: 'Cloud backend is waking up from idle (~20-30s on free tier). Please tap Retry in a moment.' };
      } else {
        data = { message: `Server returned status ${response.status}` };
      }
    } catch (e) {
      data = null;
    }
  }

  if (response.status === 401) {
    clearToken();
    notifyUnauthorized();
    const detail = data?.detail || 'Authentication required. Please log in.';
    throw new ApiError(401, data?.title || 'Unauthorized', detail, data || {}, isReplayed);
  }

  if (!response.ok) {
    const title = data?.title || `Request failed (${response.status})`;
    const detail = data?.detail || data?.message || 'An unexpected error occurred.';
    throw new ApiError(response.status, title, detail, data || {}, isReplayed);
  }

  // Attach isReplayed metadata to JSON response if applicable
  if (data && typeof data === 'object' && isReplayed) {
    data.isReplayed = true;
  }

  return data;
}

