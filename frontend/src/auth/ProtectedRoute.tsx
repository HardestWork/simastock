/** Route guard that checks authentication and optional role access. */
import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './auth-store';
import { useCapabilities } from '@/lib/capabilities';
import { useModuleMatrix } from '@/lib/module-access';
import { useStoreStore } from '@/store-context/store-store';
import type { Capability, ModuleCode, UserRole } from '@/api/types';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  allowedCapabilities?: Capability[];
  requiredModules?: ModuleCode[];
  superuserOnly?: boolean;
  children?: React.ReactNode;
}

export default function ProtectedRoute({
  allowedRoles,
  allowedCapabilities,
  requiredModules,
  superuserOnly = false,
  children,
}: ProtectedRouteProps) {
  const { isAuthenticated, user, stores, isLoading, initialized, loadUser } = useAuthStore();
  const currentStore = useStoreStore((s) => s.currentStore);
  const capabilities = useCapabilities();
  const { moduleMatrix, isLoading: isModuleMatrixLoading } = useModuleMatrix();

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

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Wait for store context to be initialized before checking modules/capabilities.
  // On page refresh, AppLayout's useEffect sets currentStore asynchronously — if we
  // check capabilities before that, the empty list causes a false redirect to /dashboard.
  const needsStoreContext =
    (requiredModules && requiredModules.length > 0) ||
    (allowedCapabilities && allowedCapabilities.length > 0);
  if (needsStoreContext && stores.length > 0 && !currentStore) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (superuserOnly && user.is_superuser !== true) {
    return <Navigate to="/dashboard" replace />;
  }

  const hasRoleAccess = !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(user.role);
  if (!hasRoleAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requiredModules && requiredModules.length > 0 && isModuleMatrixLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (requiredModules && requiredModules.length > 0) {
    const hasRequiredModules = requiredModules.every((moduleCode) => Boolean(moduleMatrix[moduleCode]));
    if (!hasRequiredModules) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  if (user.is_superuser === true) {
    return children ? <>{children}</> : <Outlet />;
  }

  if (allowedCapabilities && allowedCapabilities.length > 0) {
    const hasRequiredCapability = allowedCapabilities.some((cap) => capabilities.includes(cap));
    if (!hasRequiredCapability) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children ? <>{children}</> : <Outlet />;
}
