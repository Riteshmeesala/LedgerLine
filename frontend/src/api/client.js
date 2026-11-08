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

let inMemoryToken = null;
const unauthorizedListeners = new Set();

export function setToken(token) {
  inMemoryToken = token;
}

export function getToken() {
  return inMemoryToken;
}

export function clearToken() {
  inMemoryToken = null;
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
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? DEFAULT_BACKEND_URL : '')).replace(/\/$/, '');
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

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
  try {
    response = await fetch(url, config);
  } catch (networkError) {
    throw new ApiError(0, 'Network Error', 'Unable to connect to server. Please check your network.', {});
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
      data = text ? { message: text } : null;
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

