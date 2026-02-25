/** Route guard that checks authentication and optional role access. */
import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './auth-store';
import { useCapabilities } from '@/lib/capabilities';
import { useModuleMatrix } from '@/lib/module-access';
import type { Capability, ModuleCode, UserRole } from '@/api/types';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  allowedCapabilities?: Capability[];
  requiredModules?: ModuleCode[];
  children?: React.ReactNode;
}

export default function ProtectedRoute({
  allowedRoles,
  allowedCapabilities,
  requiredModules,
  children,
}: ProtectedRouteProps) {
  const { isAuthenticated, user, isLoading, initialized, loadUser } = useAuthStore();
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

  const isPrivilegedRole = user.role === 'ADMIN' || user.role === 'MANAGER' || user.is_superuser === true;
  if (isPrivilegedRole) {
    return children ? <>{children}</> : <Outlet />;
  }

  if (allowedCapabilities && allowedCapabilities.length > 0 && capabilities.length > 0) {
    const hasRequiredCapability = allowedCapabilities.some((cap) => capabilities.includes(cap));
    if (!hasRequiredCapability) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children ? <>{children}</> : <Outlet />;
}
