/** Main application layout with sidebar + topbar + content area. */
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import SearchPalette from '@/components/shared/SearchPalette';
import { useAuthStore } from '@/auth/auth-store';
import { useStoreStore } from '@/store-context/store-store';

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { stores, user, loadUser, isAuthenticated, initialized } = useAuthStore();
  const { initializeStore, currentStore } = useStoreStore();

  // Load user data if route is already authenticated but profile is not hydrated.
  useEffect(() => {
    if (initialized && isAuthenticated && !user) {
      void loadUser();
    }
  }, [initialized, isAuthenticated, user, loadUser]);

  // Initialize store context when stores are loaded
  useEffect(() => {
    if (stores.length > 0 && !currentStore) {
      initializeStore(stores);
    }
  }, [stores, currentStore, initializeStore]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div
        className={`transition-all duration-200 print:ml-0 ${
          sidebarCollapsed ? 'ml-16' : 'ml-60'
        }`}
      >
        <Topbar />
        <main className="p-6 dark:text-gray-100">
          <Outlet />
        </main>
      </div>
      <SearchPalette />
    </div>
  );
}
