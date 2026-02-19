/** Zustand store for authentication state. */
import { create } from 'zustand';
import { authApi, storeApi } from '@/api/endpoints';
import type { User, MyStore } from '@/api/types';
import {
  clearTokens as clearStoredTokens,
  getAccessToken,
  getRefreshToken,
  setTokens as setStoredTokens,
} from '@/auth/token-storage';
import { clearCsrfToken, setCsrfToken } from '@/auth/csrf-storage';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  stores: MyStore[];
  isLoading: boolean;
  isAuthenticated: boolean;
  initialized: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  setTokens: (access: string, refresh: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: getAccessToken(),
  refreshToken: getRefreshToken(),
  user: null,
  stores: [],
  isLoading: false,
  isAuthenticated: !!getAccessToken(),
  initialized: false,

  setTokens: (access, refresh) => {
    setStoredTokens(access, refresh);
    set({ accessToken: access, refreshToken: refresh, isAuthenticated: true });
  },

  login: async (email, password) => {
    // Clear potentially stale local tokens before a fresh login (cookie auth mode).
    clearStoredTokens();
    set({ isLoading: true });
    try {
      const csrfPayload = await authApi.csrf();
      if (csrfPayload?.csrfToken) {
        setCsrfToken(csrfPayload.csrfToken);
      }
      const data = await authApi.login({ email, password });
      // When JWT_RETURN_TOKENS_IN_BODY is True, tokens come in the body.
      // When False (cookie-only mode), tokens are HttpOnly cookies — we
      // still authenticate via cookies for all subsequent requests.
      if (data.access && data.refresh) {
        get().setTokens(data.access, data.refresh);
      }

      // Load user profile and stores
      const [user, stores] = await Promise.all([
        authApi.me(),
        storeApi.myStores(),
      ]);
      set({
        user: data.user ?? user,
        stores,
        isAuthenticated: true,
        isLoading: false,
        initialized: true,
      });
    } catch (error) {
      clearStoredTokens();
      clearCsrfToken();
      set({
        accessToken: null,
        refreshToken: null,
        user: null,
        stores: [],
        isAuthenticated: false,
        isLoading: false,
        initialized: true,
      });
      throw error;
    }
  },

  logout: () => {
    void authApi.logout().catch(() => undefined);
    clearStoredTokens();
    clearCsrfToken();
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      stores: [],
      isAuthenticated: false,
      initialized: true,
      isLoading: false,
    });
  },

  loadUser: async () => {
    set({ isLoading: true });
    try {
      const csrfPayload = await authApi.csrf();
      if (csrfPayload?.csrfToken) {
        setCsrfToken(csrfPayload.csrfToken);
      }
      const [user, stores] = await Promise.all([
        authApi.me(),
        storeApi.myStores(),
      ]);
      set({
        user,
        stores,
        isAuthenticated: true,
        isLoading: false,
        initialized: true,
      });
    } catch {
      clearStoredTokens();
      clearCsrfToken();
      set({
        accessToken: null,
        refreshToken: null,
        user: null,
        stores: [],
        isAuthenticated: false,
        isLoading: false,
        initialized: true,
      });
    }
  },
}));
