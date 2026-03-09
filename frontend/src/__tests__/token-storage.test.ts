import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  setAccessToken,
  clearTokens,
} from '@/auth/token-storage';

describe('token-storage', () => {
  beforeEach(() => {
    // Clear both in-memory and sessionStorage state between tests
    clearTokens();
    sessionStorage.clear();
  });

  it('setTokens stores both access and refresh tokens', () => {
    setTokens('acc-123', 'ref-456');

    expect(sessionStorage.getItem('access_token')).toBe('acc-123');
    expect(sessionStorage.getItem('refresh_token')).toBe('ref-456');
  });

  it('getAccessToken returns the stored access token', () => {
    setTokens('acc-abc', 'ref-xyz');

    expect(getAccessToken()).toBe('acc-abc');
  });

  it('getRefreshToken returns the stored refresh token', () => {
    setTokens('acc-abc', 'ref-xyz');

    expect(getRefreshToken()).toBe('ref-xyz');
  });

  it('clearTokens removes both tokens from memory and sessionStorage', () => {
    setTokens('acc-111', 'ref-222');
    clearTokens();

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(sessionStorage.getItem('access_token')).toBeNull();
    expect(sessionStorage.getItem('refresh_token')).toBeNull();
  });

  it('setAccessToken updates only the access token', () => {
    setTokens('old-acc', 'ref-keep');
    setAccessToken('new-acc');

    expect(getAccessToken()).toBe('new-acc');
    expect(getRefreshToken()).toBe('ref-keep');
    expect(sessionStorage.getItem('access_token')).toBe('new-acc');
  });

  it('reads from sessionStorage when in-memory value is null', () => {
    // Directly set sessionStorage (simulating a page reload where memory is cleared)
    sessionStorage.setItem('access_token', 'from-storage');
    sessionStorage.setItem('refresh_token', 'ref-from-storage');

    // clearTokens was called in beforeEach, so in-memory values are null.
    // The getters should fall back to sessionStorage.
    expect(getAccessToken()).toBe('from-storage');
    expect(getRefreshToken()).toBe('ref-from-storage');
  });

  it('returns null when no tokens are set', () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});
