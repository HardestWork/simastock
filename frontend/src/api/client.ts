/** Axios instance with cookie-based JWT + CSRF support. */
import axios from 'axios';
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken } from '@/auth/token-storage';
import { clearCsrfToken, getCsrfToken, setCsrfToken } from '@/auth/csrf-storage';

const apiClient = axios.create({
  baseURL: '/api/v1/',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

const refreshClient = axios.create({
  baseURL: '/api/v1/',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

const csrfClient = axios.create({
  baseURL: '/api/v1/',
  withCredentials: true,
});

async function ensureCsrfToken(): Promise<string | null> {
  let token = getCsrfToken();
  if (token) {
    return token;
  }
  try {
    const { data } = await csrfClient.get<{ csrfToken: string }>('auth/csrf/');
    token = data?.csrfToken ?? null;
    if (token) {
      setCsrfToken(token);
    }
    return token;
  } catch {
    return null;
  }
}

function isUnsafeMethod(method?: string): boolean {
  const m = (method ?? 'get').toLowerCase();
  return ['post', 'put', 'patch', 'delete'].includes(m);
}

function shouldSkipAuthHeader(config: unknown): boolean {
  return Boolean((config as { _skipAuthHeader?: boolean })?._skipAuthHeader);
}

// Request interceptor: inject Bearer token and CSRF header when needed.
apiClient.interceptors.request.use(async (config) => {
  config.withCredentials = true;
  config.headers = config.headers ?? {};

  // If we're sending multipart FormData, let the browser set the correct
  // Content-Type with boundary. A hardcoded value breaks parsing server-side.
  const maybeAny = config as unknown as { data?: unknown };
  if (typeof FormData !== 'undefined' && maybeAny.data instanceof FormData) {
    delete (config.headers as Record<string, unknown>)['Content-Type'];
    delete (config.headers as Record<string, unknown>)['content-type'];
  }

  const accessToken = getAccessToken();
  if (accessToken && !shouldSkipAuthHeader(config)) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  } else if (config.headers?.Authorization && shouldSkipAuthHeader(config)) {
    delete config.headers.Authorization;
  }

  if (isUnsafeMethod(config.method)) {
    const csrfToken = (await ensureCsrfToken()) ?? getCsrfToken();
    if (csrfToken) {
      config.headers['X-CSRFToken'] = csrfToken;
    }
  }

  return config;
});

// Response interceptor: auto-refresh on 401.
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest || originalRequest.url?.includes('auth/token') || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Cookie auth is preferred; if a stale bearer token is present, retry once without it.
    if (originalRequest.headers?.Authorization && !originalRequest._retriedWithoutAuthHeader) {
      originalRequest._retriedWithoutAuthHeader = true;
      originalRequest._skipAuthHeader = true;
      delete originalRequest.headers.Authorization;
      return apiClient(originalRequest);
    }

    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string | null>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        if (token) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = getRefreshToken();
      const refreshPayload = refreshToken ? { refresh: refreshToken } : {};
      const { data } = await refreshClient.post<{ access?: string }>('auth/token/refresh/', refreshPayload);
      const newAccess: string | null = data?.access ?? null;

      if (newAccess) {
        setAccessToken(newAccess);
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      }

      // In cookie-only mode (newAccess is null), the refresh response
      // sets new HttpOnly cookies. Fetch a fresh CSRF token so that the
      // retried request (and future requests) have a valid CSRF pairing.
      clearCsrfToken();
      try {
        const { data: csrfData } = await csrfClient.get<{ csrfToken: string }>('auth/csrf/');
        if (csrfData?.csrfToken) {
          setCsrfToken(csrfData.csrfToken);
        }
      } catch { /* CSRF fetch is best-effort */ }

      processQueue(null, newAccess);
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      clearTokens();
      clearCsrfToken();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;
