import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User, MyStore } from '@/api/types';

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories are hoisted, so use vi.fn() inside the factory
// ---------------------------------------------------------------------------

vi.mock('@/api/endpoints', () => ({
  authApi: {
    login: vi.fn(),
    csrf: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
  storeApi: {
    myStores: vi.fn(),
  },
}));

vi.mock('@/auth/csrf-storage', () => ({
  setCsrfToken: vi.fn(),
  clearCsrfToken: vi.fn(),
}));

// Import after mocks
import { useAuthStore } from '@/auth/auth-store';
import { authApi, storeApi } from '@/api/endpoints';
import { getAccessToken, getRefreshToken, clearTokens } from '@/auth/token-storage';

const mockAuthApi = vi.mocked(authApi);
const mockStoreApi = vi.mocked(storeApi);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeUser: User = {
  id: 'u-1',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  phone: '+221770000000',
  role: 'ADMIN',
  custom_role: null,
  custom_role_name: null,
  is_active: true,
};

const fakeStores: MyStore[] = [
  {
    id: 's-1',
    name: 'Boutique 1',
    code: 'B1',
    address: '',
    phone: '',
    email: '',
    enterprise: 'e-1',
    currency: 'FCFA',
    vat_enabled: false,
    vat_rate: '0.00',
    is_active: true,
    is_default: true,
    enterprise_name: 'Acme',
    my_capabilities: ['CAN_SELL'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  clearTokens();
  sessionStorage.clear();
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    stores: [],
    isLoading: false,
    isAuthenticated: false,
    initialized: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('login success sets user, stores and isAuthenticated', async () => {
    mockAuthApi.csrf.mockResolvedValue({ csrfToken: 'csrf-tok' });
    mockAuthApi.login.mockResolvedValue({
      access: 'jwt-access',
      refresh: 'jwt-refresh',
      user: fakeUser,
    });
    mockAuthApi.me.mockResolvedValue(fakeUser);
    mockStoreApi.myStores.mockResolvedValue(fakeStores);

    await useAuthStore.getState().login('test@example.com', 'password123');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(fakeUser);
    expect(state.stores).toEqual(fakeStores);
    expect(state.isLoading).toBe(false);
    expect(state.initialized).toBe(true);

    expect(getAccessToken()).toBe('jwt-access');
    expect(getRefreshToken()).toBe('jwt-refresh');
  });

  it('login success without body tokens still marks authenticated', async () => {
    mockAuthApi.csrf.mockResolvedValue({ csrfToken: 'c' });
    mockAuthApi.login.mockResolvedValue({ user: fakeUser });
    mockAuthApi.me.mockResolvedValue(fakeUser);
    mockStoreApi.myStores.mockResolvedValue(fakeStores);

    await useAuthStore.getState().login('test@example.com', 'pw');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(fakeUser);
    expect(getAccessToken()).toBeNull();
  });

  it('login failure clears state and throws error', async () => {
    mockAuthApi.csrf.mockResolvedValue({ csrfToken: 'csrf-failure' });
    mockAuthApi.login.mockRejectedValue(new Error('Invalid credentials'));

    await expect(
      useAuthStore.getState().login('bad@example.com', 'wrong'),
    ).rejects.toThrow('Invalid credentials');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.stores).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.initialized).toBe(true);

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('logout clears tokens and resets state', () => {
    mockAuthApi.logout.mockResolvedValue(undefined);
    useAuthStore.setState({
      accessToken: 'a',
      refreshToken: 'r',
      user: fakeUser,
      stores: fakeStores,
      isAuthenticated: true,
      initialized: true,
    });

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.stores).toEqual([]);
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('loadUser fetches user profile and stores', async () => {
    mockAuthApi.csrf.mockResolvedValue({ csrfToken: 'csrf-2' });
    mockAuthApi.me.mockResolvedValue(fakeUser);
    mockStoreApi.myStores.mockResolvedValue(fakeStores);

    await useAuthStore.getState().loadUser();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(fakeUser);
    expect(state.stores).toEqual(fakeStores);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.initialized).toBe(true);
  });

  it('loadUser clears state on failure', async () => {
    mockAuthApi.csrf.mockRejectedValue(new Error('Network error'));

    await useAuthStore.getState().loadUser();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.stores).toEqual([]);
    expect(state.initialized).toBe(true);
  });
});
