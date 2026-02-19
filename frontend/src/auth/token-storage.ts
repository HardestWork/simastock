/** Safer token storage helper (session-scoped, with in-memory fallback). */

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  const storage = getSessionStorage();
  return memoryAccessToken ?? storage?.getItem(ACCESS_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  const storage = getSessionStorage();
  return memoryRefreshToken ?? storage?.getItem(REFRESH_KEY) ?? null;
}

export function setTokens(access: string, refresh: string): void {
  memoryAccessToken = access;
  memoryRefreshToken = refresh;
  const storage = getSessionStorage();
  storage?.setItem(ACCESS_KEY, access);
  storage?.setItem(REFRESH_KEY, refresh);
}

export function setAccessToken(access: string): void {
  memoryAccessToken = access;
  const storage = getSessionStorage();
  storage?.setItem(ACCESS_KEY, access);
}

export function clearTokens(): void {
  memoryAccessToken = null;
  memoryRefreshToken = null;
  const storage = getSessionStorage();
  storage?.removeItem(ACCESS_KEY);
  storage?.removeItem(REFRESH_KEY);
}
