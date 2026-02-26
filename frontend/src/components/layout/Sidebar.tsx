/** Main sidebar navigation grouped by domain and filtered by module/role/capability. */
import { Fragment, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Banknote,
  Package,
  Layers,
  Users,
  Target,
  CreditCard,
  Wallet,
  Truck,
  BarChart3,
  BarChart2,
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
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/auth/auth-store';
import { useCapabilities } from '@/lib/capabilities';
import { useModuleMatrix } from '@/lib/module-access';
import type { UserRole, Capability, ModuleCode } from '@/api/types';

type NavSection = '' | 'OPERATIONS' | 'PILOTAGE' | 'ADMINISTRATION';

const SECTION_LABELS: Record<Exclude<NavSection, ''>, string> = {
  OPERATIONS: 'Operations',
  PILOTAGE: 'Pilotage',
  ADMINISTRATION: 'Administration',
};

interface SubItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  module?: ModuleCode;
  roles?: UserRole[];
  capability?: Capability;
  superuserOnly?: boolean;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  section: NavSection;
  module?: ModuleCode;
  roles: UserRole[];
  capability?: Capability;
  children?: SubItem[];
}

const navItems: NavItem[] = [
  {
    section: '',
    path: '/dashboard',
    label: 'Tableau de bord',
    icon: <LayoutDashboard size={20} />,
    module: 'CORE',
    roles: ['ADMIN', 'MANAGER', 'SALES', 'CASHIER', 'STOCKER'],
  },

  {
    section: 'OPERATIONS',
    path: '/pos',
    label: 'Point de Vente',
    icon: <ShoppingCart size={20} />,
    module: 'SELL',
    roles: ['SALES', 'MANAGER', 'ADMIN'],
    capability: 'CAN_SELL',
  },
  {
    section: 'OPERATIONS',
    path: '/quotes',
    label: 'Devis',
    icon: <FileText size={20} />,
    module: 'SELL',
    roles: ['SALES', 'MANAGER', 'ADMIN'],
    capability: 'CAN_SELL',
  },
  {
    section: 'OPERATIONS',
    path: '/commercial',
    label: 'Commercial CRM',
    icon: <Target size={20} />,
    module: 'COMMERCIAL',
    roles: ['SALES', 'MANAGER', 'ADMIN'],
    children: [
      {
        path: '/commercial',
        label: 'Pipeline',
        icon: <Target size={15} />,
        module: 'COMMERCIAL',
        roles: ['SALES', 'MANAGER', 'ADMIN'],
      },
      {
        path: '/commercial/prospects',
        label: 'Prospects',
        icon: <Users size={15} />,
        module: 'COMMERCIAL',
        roles: ['SALES', 'MANAGER', 'ADMIN'],
      },
      {
        path: '/commercial/tasks',
        label: 'Relances',
        icon: <ClipboardList size={15} />,
        module: 'COMMERCIAL',
        roles: ['SALES', 'MANAGER', 'ADMIN'],
      },
      {
        path: '/commercial/incentives',
        label: 'Primes',
        icon: <Wallet size={15} />,
        module: 'COMMERCIAL',
        roles: ['SALES', 'MANAGER', 'ADMIN'],
      },
    ],
  },
  {
    section: 'OPERATIONS',
    path: '/cashier',
    label: 'Caisse',
    icon: <Banknote size={20} />,
    module: 'CASH',
    roles: ['CASHIER', 'MANAGER', 'ADMIN'],
    children: [
      {
        path: '/cashier',
        label: 'Tableau de bord',
        icon: <Banknote size={15} />,
        module: 'CASH',
        roles: ['CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_CASH',
      },
      {
        path: '/cashier/analytics',
        label: 'Mon Analyse',
        icon: <Shield size={15} />,
        module: 'ANALYTICS_CASHIER',
        roles: ['CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_CASH',
      },
      {
        path: '/cashier/team-analytics',
        label: 'Equipe Caisse',
        icon: <Users size={15} />,
        module: 'ANALYTICS_CASHIER',
        roles: ['MANAGER', 'ADMIN'],
      },
    ],
  },
  {
    section: 'OPERATIONS',
    path: '/catalog',
    label: 'Catalogue',
    icon: <Package size={20} />,
    module: 'SELL',
    roles: ['SALES', 'MANAGER', 'ADMIN', 'STOCKER'],
    children: [
      { path: '/catalog', label: 'Produits', icon: <Package size={15} />, module: 'SELL' },
      {
        path: '/catalog/categories',
        label: 'Categories',
        icon: <FolderTree size={15} />,
        module: 'STOCK',
        roles: ['MANAGER', 'ADMIN'],
      },
      {
        path: '/catalog/brands',
        label: 'Marques',
        icon: <Tag size={15} />,
        module: 'STOCK',
        roles: ['MANAGER', 'ADMIN'],
      },
    ],
  },
  {
    section: 'OPERATIONS',
    path: '/stock',
    label: 'Stock',
    icon: <Layers size={20} />,
    module: 'STOCK',
    roles: ['STOCKER', 'MANAGER', 'ADMIN'],
    capability: 'CAN_STOCK',
    children: [
      { path: '/stock', label: 'Niveaux', icon: <Layers size={15} />, module: 'STOCK' },
      { path: '/stock/movements', label: 'Mouvements', icon: <History size={15} />, module: 'STOCK' },
      { path: '/stock/entry', label: 'Entrees', icon: <PackagePlus size={15} />, module: 'STOCK' },
      { path: '/stock/adjust', label: 'Ajustements', icon: <PackageMinus size={15} />, module: 'STOCK' },
      { path: '/stock/transfers', label: 'Transferts', icon: <ArrowRightLeft size={15} />, module: 'STOCK' },
      { path: '/stock/counts', label: 'Inventaires', icon: <ClipboardList size={15} />, module: 'STOCK' },
      { path: '/stock/analytics', label: 'Analyse Stock', icon: <BarChart2 size={15} />, module: 'ANALYTICS_STOCK' },
    ],
  },
  {
    section: 'OPERATIONS',
    path: '/customers',
    label: 'Clients & Credit',
    icon: <Users size={20} />,
    module: 'CUSTOMER',
    roles: ['SALES', 'MANAGER', 'ADMIN', 'CASHIER'],
    children: [
      {
        path: '/customers',
        label: 'Clients',
        icon: <Users size={15} />,
        module: 'CUSTOMER',
        roles: ['SALES', 'MANAGER', 'ADMIN', 'CASHIER'],
      },
      {
        path: '/credits',
        label: 'Credits',
        icon: <CreditCard size={15} />,
        module: 'CUSTOMER',
        roles: ['MANAGER', 'ADMIN', 'CASHIER'],
      },
      {
        path: '/customers/intelligence',
        label: 'Intelligence',
        icon: <Sparkles size={15} />,
        module: 'CLIENT_INTEL',
        roles: ['MANAGER', 'ADMIN'],
      },
    ],
  },
  {
    section: 'OPERATIONS',
    path: '/expenses',
    label: 'Depenses',
    icon: <Wallet size={20} />,
    module: 'EXPENSE',
    roles: ['CASHIER', 'MANAGER', 'ADMIN'],
    capability: 'CAN_VIEW_EXPENSE_REPORTS',
    children: [
      {
        path: '/expenses',
        label: 'Liste',
        icon: <Wallet size={15} />,
        module: 'EXPENSE',
        roles: ['CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_VIEW_EXPENSE_REPORTS',
      },
      {
        path: '/expenses/dashboard',
        label: 'Dashboard',
        icon: <PieChart size={15} />,
        module: 'EXPENSE',
        roles: ['CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_VIEW_EXPENSE_REPORTS',
      },
      {
        path: '/expenses/settings',
        label: 'Parametres',
        icon: <Settings size={15} />,
        module: 'EXPENSE',
        roles: ['MANAGER', 'ADMIN'],
        capability: 'CAN_SET_BUDGETS',
      },
    ],
  },
  {
    section: 'OPERATIONS',
    path: '/purchases',
    label: 'Achats',
    icon: <Truck size={20} />,
    module: 'PURCHASE',
    roles: ['MANAGER', 'ADMIN'],
    children: [
      {
        path: '/purchases/orders',
        label: 'Bons de commande',
        icon: <ClipboardList size={15} />,
        module: 'PURCHASE',
      },
      {
        path: '/purchases/suppliers',
        label: 'Fournisseurs',
        icon: <Building2 size={15} />,
        module: 'PURCHASE',
      },
    ],
  },

  {
    section: 'PILOTAGE',
    path: '/objectives',
    label: 'Objectifs',
    icon: <Target size={20} />,
    module: 'SELLER_PERF',
    roles: ['SALES', 'MANAGER', 'ADMIN'],
    children: [
      {
        path: '/objectives/my-goal',
        label: 'Mon Objectif',
        icon: <Target size={15} />,
        module: 'SELLER_PERF',
        roles: ['SALES', 'MANAGER', 'ADMIN'],
      },
      {
        path: '/objectives/admin',
        label: 'Administration',
        icon: <Settings size={15} />,
        module: 'SELLER_PERF',
        roles: ['MANAGER', 'ADMIN'],
      },
    ],
  },
  {
    section: 'PILOTAGE',
    path: '/reports',
    label: 'Rapports',
    icon: <BarChart3 size={20} />,
    module: 'ANALYTICS_MANAGER',
    roles: ['MANAGER', 'ADMIN'],
    capability: 'CAN_VIEW_REPORTS',
  },
  {
    section: 'PILOTAGE',
    path: '/statistics',
    label: 'Statistiques',
    icon: <PieChart size={20} />,
    module: 'ANALYTICS_MANAGER',
    roles: ['MANAGER', 'ADMIN'],
    capability: 'CAN_VIEW_REPORTS',
  },
  {
    section: 'PILOTAGE',
    path: '/analytics',
    label: 'Analytics AI',
    icon: <Brain size={20} />,
    module: 'ANALYTICS_MANAGER',
    roles: ['MANAGER', 'ADMIN'],
  },
  {
    section: 'PILOTAGE',
    path: '/dg/dashboard',
    label: 'Dashboard DG',
    icon: <LayoutDashboard size={20} />,
    module: 'ANALYTICS_DG',
    roles: ['MANAGER', 'ADMIN'],
  },
  {
    section: 'PILOTAGE',
    path: '/alerts',
    label: 'Alertes',
    icon: <Bell size={20} />,
    module: 'ALERTS',
    roles: ['ADMIN', 'MANAGER', 'SALES', 'CASHIER', 'STOCKER'],
  },

  {
    section: 'ADMINISTRATION',
    path: '/settings',
    label: 'Parametres',
    icon: <Settings size={20} />,
    module: 'CORE',
    roles: ['ADMIN'],
    children: [
      { path: '/settings/stores', label: 'Magasins', icon: <Wrench size={15} />, module: 'CORE' },
      { path: '/settings/invoice', label: 'Facturation', icon: <FileText size={15} />, module: 'CORE' },
      { path: '/settings/structure', label: 'Structure', icon: <Building2 size={15} />, module: 'CORE' },
      { path: '/settings/subscriptions', label: 'Abonnements', icon: <CreditCard size={15} />, module: 'CORE' },
      { path: '/settings/modules', label: 'Modules payants', icon: <Layers size={15} />, module: 'CORE' },
      { path: '/settings/permissions', label: 'Permissions', icon: <Shield size={15} />, module: 'CORE' },
      { path: '/settings/users', label: 'Utilisateurs', icon: <UserCog size={15} />, module: 'CORE' },
      { path: '/settings/enterprises', label: 'Entreprises', icon: <Building2 size={15} />, module: 'CORE', superuserOnly: true },
      { path: '/settings/enterprise-setup', label: 'Creer entreprise', icon: <PlusCircle size={15} />, module: 'CORE', superuserOnly: true },
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
  const { isModuleEnabled } = useModuleMatrix();
  const location = useLocation();
  const isPrivilegedRole = !!user && (user.role === 'ADMIN' || user.role === 'MANAGER' || user.is_superuser === true);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => {
      const initial = new Set<string>();
      navItems.forEach((item) => {
        const hasActiveChild = item.children?.some((child) => location.pathname.startsWith(child.path));
        if (item.children && (location.pathname.startsWith(item.path) || hasActiveChild)) {
          initial.add(item.path);
        }
      });
      return initial;
    },
  );

  const visibleItems = navItems.filter((item) => {
    if (!user) return false;
    if (!isModuleEnabled(item.module)) return false;
    const hasRoleAccess = item.roles.includes(user.role);
    if (item.capability && capabilities.length > 0) {
      if (isPrivilegedRole && hasRoleAccess) return true;
      return capabilities.includes(item.capability);
    }
    return hasRoleAccess;
  });

  const sections: { key: NavSection; items: typeof visibleItems }[] = useMemo(() => {
    const grouped: { key: NavSection; items: typeof visibleItems }[] = [];
    for (const item of visibleItems) {
      const last = grouped[grouped.length - 1];
      if (!last || last.key !== item.section) {
        grouped.push({ key: item.section, items: [item] });
      } else {
        last.items.push(item);
      }
    }
    return grouped;
  }, [visibleItems]);

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
      <div className="flex items-center h-16 px-3 border-b border-white/8 shrink-0">
        <img
          src={collapsed ? '/logo-icon.png' : '/logo-full.png'}
          alt="SimaStock"
          className={collapsed ? 'h-8 mx-auto' : 'h-10'}
        />
        <button
          onClick={onToggle}
          className="ml-auto p-1.5 rounded-lg hover:bg-white/8 transition-colors shrink-0 text-white/50 hover:text-white"
        >
          <ChevronLeft
            size={18}
            className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 pb-4">
        {sections.map(({ key, items }, sectionIdx) => (
          <Fragment key={key || '__root'}>
            {collapsed
              ? sectionIdx > 0
                ? <div className="mx-3 my-2.5 h-px bg-white/10" />
                : null
              : key
                ? (
                  <div className="px-4 pt-5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30 select-none">
                    {SECTION_LABELS[key as Exclude<NavSection, ''>]}
                  </div>
                )
                : null}

            {items.map((item) => {
              const isSuperuser = user?.is_superuser ?? false;
              const filteredChildren = item.children?.filter((child) => {
                if (child.superuserOnly && !isSuperuser) return false;
                if (!isModuleEnabled(child.module)) return false;
                if (child.capability && capabilities.length > 0) {
                  const hasChildRoleAccess = !child.roles || (user ? child.roles.includes(user.role) : false);
                  if (isPrivilegedRole && hasChildRoleAccess) return true;
                  return capabilities.includes(child.capability);
                }
                if (child.roles && user && !child.roles.includes(user.role)) return false;
                return true;
              });

              const hasChildren = Boolean(filteredChildren && filteredChildren.length > 0);
              const isExpanded = expandedSections.has(item.path);
              const childRouteActive = Boolean(filteredChildren?.some((child) => location.pathname.startsWith(child.path)));
              const isSectionActive = location.pathname.startsWith(item.path) || childRouteActive;

              if (hasChildren && !collapsed) {
                return (
                  <div key={item.path}>
                    <button
                      onClick={() => toggleSection(item.path)}
                      className={`flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg transition-colors w-[calc(100%-0.75rem)] text-left ${
                        isSectionActive
                          ? 'bg-white/11 text-white'
                          : 'text-white/60 hover:bg-white/7 hover:text-white'
                      }`}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span className="text-sm flex-1">{item.label}</span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform text-white/40 ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="ml-7 mt-0.5 mb-0.5 border-l border-white/10 pl-1">
                        {filteredChildren!.map((child) => (
                          <NavLink
                            key={child.path}
                            to={child.path}
                            end={child.path === item.path}
                            className={({ isActive }) =>
                              `flex items-center gap-2.5 px-3 py-2 mr-1.5 rounded-lg transition-colors text-sm ${
                                isActive
                                  ? 'bg-white/10 text-white'
                                  : 'text-white/45 hover:bg-white/6 hover:text-white/80'
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
                  to={item.path}
                  end={!hasChildren}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg transition-colors ${
                      isActive || (hasChildren && isSectionActive)
                        ? 'bg-white/11 text-white'
                        : 'text-white/60 hover:bg-white/7 hover:text-white'
                    }`
                  }
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span className="text-sm">{item.label}</span>}
                </NavLink>
              );
            })}
          </Fragment>
        ))}
      </nav>
    </aside>
  );
}
