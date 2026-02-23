/** Route guard that checks authentication and optional role access. */
import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './auth-store';
import { useCapabilities } from '@/lib/capabilities';
import type { Capability, UserRole } from '@/api/types';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  allowedCapabilities?: Capability[];
  children?: React.ReactNode;
}

export default function ProtectedRoute({
  allowedRoles,
  allowedCapabilities,
  children,
}: ProtectedRouteProps) {
  const { isAuthenticated, user, isLoading, initialized, loadUser } = useAuthStore();
  const capabilities = useCapabilities();

  useEffect(() => {
    if (!initialized) {
      void loadUser();
    }
  }, [initialized, loadUser]);

  if (isLoading || !initialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Capability-based access takes precedence when store capabilities are available.
  if (allowedCapabilities && allowedCapabilities.length > 0 && capabilities.length > 0) {
    const hasRequiredCapability = allowedCapabilities.some((cap) => capabilities.includes(cap));
    if (!hasRequiredCapability) {
      return <Navigate to="/dashboard" replace />;
    }
  } else if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Legacy role-based fallback (or while capabilities are not loaded yet).
    return <Navigate to="/dashboard" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
