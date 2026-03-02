/** Main application layout with sidebar + topbar + content area. */
import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import SearchPalette from '@/components/shared/SearchPalette';
import { useAuthStore } from '@/auth/auth-store';
import { useStoreStore } from '@/store-context/store-store';

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { stores, user, loadUser, isAuthenticated, initialized } = useAuthStore();
  const { initializeStore, currentStore } = useStoreStore();
  const location = useLocation();

  // Load user data if route is already authenticated but profile is not hydrated.
  useEffect(() => {
    if (initialized && isAuthenticated && !user) {
      void loadUser();
    }
  }, [initialized, isAuthenticated, user, loadUser]);

  // Initialize store context when stores are loaded
  useEffect(() => {
    const hasCurrentStoreAccess = !!currentStore && stores.some((s) => s.id === currentStore.id);
    if (stores.length > 0 && !hasCurrentStoreAccess) {
      initializeStore(stores);
    }
  }, [stores, currentStore, initializeStore]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleMobile = useCallback(() => setMobileOpen((prev) => !prev), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="h-screen bg-canvas dark:bg-gray-900 md:flex overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar: fixed overlay on mobile, static flex item on desktop */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col shrink-0
          transition-transform duration-200 ease-in-out
          md:static md:z-auto md:translate-x-0 md:transition-none
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main content: full width on mobile, flex-1 + scrollable on desktop */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <Topbar onMenuToggle={toggleMobile} />
        <main className="p-3 sm:p-4 md:p-6 dark:text-gray-100">
          <Outlet />
        </main>
      </div>
      <SearchPalette />
    </div>
  );
}
