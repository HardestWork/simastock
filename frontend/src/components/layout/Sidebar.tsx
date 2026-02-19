/** Main sidebar navigation — filtered by user role and capabilities. */
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Banknote,
  Package,
  Layers,
  Users,
  CreditCard,
  Truck,
  BarChart3,
  Brain,
  Bell,
  Settings,
  ChevronLeft,
  ChevronDown,
  ArrowRightLeft,
  ClipboardList,
  PackagePlus,
  PackageMinus,
  History,
  FolderTree,
  Tag,
  UserCog,
  Wrench,
  FileText,
  Building2,
  Shield,
  PlusCircle,
  PieChart,
} from 'lucide-react';
import { useAuthStore } from '@/auth/auth-store';
import { useCapabilities } from '@/lib/capabilities';
import type { UserRole, Capability } from '@/api/types';

interface SubItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  superuserOnly?: boolean;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[];
  capability?: Capability;
  children?: SubItem[];
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Tableau de bord', icon: <LayoutDashboard size={20} />, roles: ['ADMIN', 'MANAGER', 'SALES', 'CASHIER', 'STOCKER'] },
  { path: '/pos', label: 'Point de Vente', icon: <ShoppingCart size={20} />, roles: ['SALES', 'MANAGER', 'ADMIN'], capability: 'CAN_SELL' },
  { path: '/quotes', label: 'Devis', icon: <FileText size={20} />, roles: ['SALES', 'MANAGER', 'ADMIN'], capability: 'CAN_SELL' },
  { path: '/cashier', label: 'Caisse', icon: <Banknote size={20} />, roles: ['CASHIER', 'MANAGER', 'ADMIN'], capability: 'CAN_CASH' },
  {
    path: '/catalog', label: 'Catalogue', icon: <Package size={20} />, roles: ['SALES', 'MANAGER', 'ADMIN', 'STOCKER'],
    children: [
      { path: '/catalog', label: 'Produits', icon: <Package size={16} /> },
      { path: '/catalog/categories', label: 'Categories', icon: <FolderTree size={16} /> },
      { path: '/catalog/brands', label: 'Marques', icon: <Tag size={16} /> },
    ],
  },
  {
    path: '/stock', label: 'Stock', icon: <Layers size={20} />, roles: ['STOCKER', 'MANAGER', 'ADMIN'], capability: 'CAN_STOCK',
    children: [
      { path: '/stock', label: 'Niveaux', icon: <Layers size={16} /> },
      { path: '/stock/movements', label: 'Mouvements', icon: <History size={16} /> },
      { path: '/stock/entry', label: 'Entrees', icon: <PackagePlus size={16} /> },
      { path: '/stock/adjust', label: 'Ajustements', icon: <PackageMinus size={16} /> },
      { path: '/stock/transfers', label: 'Transferts', icon: <ArrowRightLeft size={16} /> },
      { path: '/stock/counts', label: 'Inventaires', icon: <ClipboardList size={16} /> },
    ],
  },
  { path: '/customers', label: 'Clients', icon: <Users size={20} />, roles: ['SALES', 'MANAGER', 'ADMIN', 'CASHIER'] },
  { path: '/credits', label: 'Credits', icon: <CreditCard size={20} />, roles: ['MANAGER', 'ADMIN', 'CASHIER'] },
  { path: '/purchases', label: 'Achats', icon: <Truck size={20} />, roles: ['MANAGER', 'ADMIN'] },
  { path: '/reports', label: 'Rapports', icon: <BarChart3 size={20} />, roles: ['MANAGER', 'ADMIN'], capability: 'CAN_VIEW_REPORTS' },
  { path: '/statistics', label: 'Statistiques', icon: <PieChart size={20} />, roles: ['MANAGER', 'ADMIN'], capability: 'CAN_VIEW_REPORTS' },
  { path: '/analytics', label: 'Analytics AI', icon: <Brain size={20} />, roles: ['MANAGER', 'ADMIN'] },
  { path: '/alerts', label: 'Alertes', icon: <Bell size={20} />, roles: ['ADMIN', 'MANAGER', 'SALES', 'CASHIER', 'STOCKER'] },
  {
    path: '/settings', label: 'Parametres', icon: <Settings size={20} />, roles: ['ADMIN'],
    children: [
      { path: '/settings/stores', label: 'Magasins', icon: <Wrench size={16} /> },
      { path: '/settings/invoice', label: 'Facturation', icon: <FileText size={16} /> },
      { path: '/settings/structure', label: 'Structure', icon: <Building2 size={16} /> },
      { path: '/settings/permissions', label: 'Permissions', icon: <Shield size={16} /> },
      { path: '/settings/users', label: 'Utilisateurs', icon: <UserCog size={16} /> },
      { path: '/settings/enterprises', label: 'Entreprises', icon: <Building2 size={16} />, superuserOnly: true },
      { path: '/settings/enterprise-setup', label: 'Creer entreprise', icon: <PlusCircle size={16} />, superuserOnly: true },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const capabilities = useCapabilities();
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => {
      const initial = new Set<string>();
      // Auto-expand section if current path matches
      navItems.forEach((item) => {
        if (item.children && location.pathname.startsWith(item.path)) {
          initial.add(item.path);
        }
      });
      return initial;
    },
  );

  const visibleItems = navItems.filter((item) => {
    if (!user) return false;
    if (!item.roles.includes(user.role)) return false;
    // Capability-based filtering: if item has a capability requirement,
    // check that the user has it (capabilities list comes from backend
    // and already handles the feature flag + role fallback).
    if (item.capability && capabilities.length > 0 && !capabilities.includes(item.capability)) {
      return false;
    }
    return true;
  });

  const toggleSection = (path: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-sidebar text-white transition-all duration-200 z-30 flex flex-col print:hidden ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo / Brand */}
      <div className="flex items-center h-16 px-3 border-b border-white/10">
        <img
          src={collapsed ? '/logo-icon.png' : '/logo-full.png'}
          alt="SimaStock"
          className={collapsed ? 'h-8 mx-auto' : 'h-10'}
        />
        <button
          onClick={onToggle}
          className="ml-auto p-1 rounded hover:bg-sidebar-hover transition-colors shrink-0"
        >
          <ChevronLeft
            size={20}
            className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {visibleItems.map((item) => {
          const isSuperuser = user?.is_superuser ?? false;
          const filteredChildren = item.children?.filter(
            (child) => !child.superuserOnly || isSuperuser,
          );
          const hasChildren = filteredChildren && filteredChildren.length > 0;
          const isExpanded = expandedSections.has(item.path);
          const isSectionActive = location.pathname.startsWith(item.path);

          if (hasChildren && !collapsed) {
            return (
              <div key={item.path}>
                <button
                  onClick={() => toggleSection(item.path)}
                  className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors w-[calc(100%-1rem)] ${
                    isSectionActive
                      ? 'bg-sidebar-active text-white'
                      : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span className="text-sm flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {isExpanded && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {filteredChildren!.map((child) => (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        end={child.path === item.path}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-4 py-2 mx-2 rounded-lg transition-colors text-sm ${
                            isActive
                              ? 'bg-white/10 text-white'
                              : 'text-gray-400 hover:bg-sidebar-hover hover:text-white'
                          }`
                        }
                      >
                        {child.icon}
                        <span>{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.path}
              to={hasChildren ? item.path : item.path}
              end={hasChildren}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors ${
                  isActive || (hasChildren && isSectionActive)
                    ? 'bg-sidebar-active text-white'
                    : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
                }`
              }
            >
              {item.icon}
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
