/** Top navigation bar with store switcher, alerts badge, and user menu. */
import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, Moon, PanelLeft, Search, Sun, User as UserIcon, Store, ShoppingCart } from 'lucide-react';
import { useAuthStore } from '@/auth/auth-store';
import { useThemeStore } from '@/lib/theme-store';
import { useStoreStore } from '@/store-context/store-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS } from '@/lib/roles';
import { OfflineSyncIndicator } from '@/components/pwa/OfflineSyncIndicator';
import { alertApi } from '@/api/endpoints';

const POS_ROLES = ['ADMIN', 'MANAGER', 'SALES', 'SALES_CASHIER'] as const;

interface TopbarProps {
  onMenuToggle?: () => void;
  onSidebarToggle?: () => void;
  sidebarHidden?: boolean;
}

export default function Topbar({ onMenuToggle, onSidebarToggle, sidebarHidden }: TopbarProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, stores, logout } = useAuthStore();
  const { currentStore, setCurrentStore } = useStoreStore();
  const { theme, toggleTheme } = useThemeStore();

  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const storeRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Unread alert badge count — poll every 30s
  const { data: unreadData } = useQuery({
    queryKey: ['alerts', 'unread-count'],
    queryFn: () => alertApi.unreadCount(),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const unreadCount = unreadData?.unread_count ?? 0;

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (storeRef.current && !storeRef.current.contains(e.target as Node)) {
        setStoreMenuOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleStoreSwitch(store: typeof stores[number]) {
    setCurrentStore(store);
    setStoreMenuOpen(false);
    // Refresh business data only for the new store context.
    queryClient.invalidateQueries({
      predicate: (query) => {
        const rootKey = String(query.queryKey[0] ?? '');
        return !['auth', 'stores', 'enterprises'].includes(rootKey);
      },
    });
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="h-[65px] bg-white dark:bg-gray-800 border-b border-[#E6EAED] dark:border-gray-700 flex items-center justify-between px-4 sm:px-6 print:hidden">
      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors md:hidden shrink-0"
          aria-label="Menu"
        >
          <Menu size={22} className="text-gray-600 dark:text-gray-300" />
        </button>

        {/* Desktop sidebar toggle */}
        <button
          onClick={onSidebarToggle}
          className="hidden md:flex p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
          title={sidebarHidden ? 'Afficher le menu (\\)' : 'Masquer le menu (\\)'}
        >
          <PanelLeft size={20} className={sidebarHidden ? 'text-primary' : 'text-gray-600 dark:text-gray-300'} />
        </button>

        {/* POS quick-link — visible on desktop for sales roles */}
        {user && (POS_ROLES as readonly string[]).includes(user.role) && (
          <Link
            to="/pos"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sidebar text-white text-xs font-bold hover:bg-sidebar-hover transition-colors shrink-0"
          >
            <ShoppingCart size={14} />
            POS
          </Link>
        )}

        {/* Offline sync badge */}
        <OfflineSyncIndicator />

        {/* Store switcher */}
        <div className="relative min-w-0" ref={storeRef}>
          <button
            onClick={() => setStoreMenuOpen(!storeMenuOpen)}
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm dark:text-gray-200 min-w-0"
          >
            <Store size={18} className="text-primary shrink-0" />
            <span className="font-medium truncate">
              {currentStore?.name ?? 'Magasin'}
            </span>
            <ChevronDown size={16} className="shrink-0" />
          </button>

          {storeMenuOpen && stores.length > 1 && (
            <div className="absolute top-full left-0 mt-1 w-64 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
              {stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => handleStoreSwitch(store)}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                    store.id === currentStore?.id ? 'bg-primary/5 text-primary font-medium' : ''
                  }`}
                >
                  <div>{store.name}</div>
                  <div className="text-xs text-gray-500">{store.enterprise_name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Global search trigger */}
      <button
        onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      >
        <Search size={16} />
        <span>Rechercher...</span>
        <kbd className="ml-2 px-1.5 py-0.5 text-[10px] bg-white dark:bg-gray-600 rounded shadow-sm">Ctrl K</kbd>
      </button>

      {/* Right side */}
      <div className="flex items-center gap-1 sm:gap-4">
        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
        >
          {theme === 'dark' ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
        </button>

        {/* Alerts */}
        <button
          onClick={() => navigate('/alerts')}
          className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <Bell size={20} className="text-gray-600 dark:text-gray-300" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-medium">
              {user?.first_name?.[0]}
              {user?.last_name?.[0]}
            </div>
            {user && (
              <div className="text-left hidden md:block">
                <div className="text-sm font-medium dark:text-gray-200">{user.first_name} {user.last_name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{ROLE_LABELS[user.role]}</div>
              </div>
            )}
            <ChevronDown size={16} className="text-gray-400 dark:text-gray-500" />
          </button>

          {userMenuOpen && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
              <button
                onClick={() => { setUserMenuOpen(false); navigate('/profile'); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200 rounded-t-lg"
              >
                <UserIcon size={16} /> Mon profil
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger hover:bg-red-50 dark:hover:bg-gray-700 rounded-b-lg"
              >
                <LogOut size={16} /> Deconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
