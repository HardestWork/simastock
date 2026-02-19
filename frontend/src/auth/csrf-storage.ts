/** CSRF token storage for API write requests. */

const CSRF_KEY = 'csrf_token';
let memoryCsrfToken: string | null = null;

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

export function getCsrfToken(): string | null {
  const storage = getSessionStorage();
  return memoryCsrfToken ?? storage?.getItem(CSRF_KEY) ?? null;
}

export function setCsrfToken(token: string): void {
  memoryCsrfToken = token;
  const storage = getSessionStorage();
  storage?.setItem(CSRF_KEY, token);
}

export function clearCsrfToken(): void {
  memoryCsrfToken = null;
  const storage = getSessionStorage();
  storage?.removeItem(CSRF_KEY);
}
