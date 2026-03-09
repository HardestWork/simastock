/** Main sidebar — PreAdmin exact style (white bg, submenu-hdr sections, bullet sub-items). */
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
  ScrollText,
  Sparkles,
  UserCheck,
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
  RotateCcw,
  ScanFace,
  MapPin,
  MessageSquare,
  CalendarDays,
} from 'lucide-react';
import { useAuthStore } from '@/auth/auth-store';
import { useCapabilities } from '@/lib/capabilities';
import { useModuleMatrix } from '@/lib/module-access';
import type { UserRole, Capability, ModuleCode } from '@/api/types';

type NavSection =
  | ''
  | 'VENTES'
  | 'COMMERCIAL'
  | 'FINANCE'
  | 'LOGISTIQUE'
  | 'RH'
  | 'PILOTAGE'
  | 'ADMINISTRATION';

const SECTION_LABELS: Record<Exclude<NavSection, ''>, string> = {
  VENTES: 'Ventes',
  COMMERCIAL: 'Commercial',
  FINANCE: 'Finance',
  LOGISTIQUE: 'Logistique',
  RH: 'Ressources Humaines',
  PILOTAGE: 'Pilotage',
  ADMINISTRATION: 'Administration',
};

const SECTION_ORDER: NavSection[] = [
  '',
  'VENTES',
  'COMMERCIAL',
  'FINANCE',
  'LOGISTIQUE',
  'RH',
  'PILOTAGE',
  'ADMINISTRATION',
];

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
    icon: <LayoutDashboard size={16} />,
    module: 'CORE',
    roles: ['ADMIN', 'MANAGER', 'HR', 'COMMERCIAL', 'SALES', 'CASHIER', 'SALES_CASHIER', 'STOCKER'],
  },
  {
    section: '',
    path: '/alerts',
    label: 'Alertes',
    icon: <Bell size={16} />,
    module: 'ALERTS',
    roles: ['ADMIN', 'MANAGER', 'HR', 'COMMERCIAL', 'SALES', 'CASHIER', 'SALES_CASHIER', 'STOCKER'],
  },

  {
    section: 'VENTES',
    path: '/pos',
    label: 'Point de Vente',
    icon: <ShoppingCart size={16} />,
    module: 'SELL',
    roles: ['SALES', 'CASHIER', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
    capability: 'CAN_SELL',
  },
  {
    section: 'VENTES',
    path: '/quotes',
    label: 'Devis',
    icon: <FileText size={16} />,
    module: 'SELL',
    roles: ['COMMERCIAL', 'SALES', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
    capability: 'CAN_MANAGE_LEADS',
  },
  {
    section: 'VENTES',
    path: '/customers',
    label: 'Clients & Credit',
    icon: <Users size={16} />,
    module: 'CUSTOMER',
    roles: ['COMMERCIAL', 'SALES', 'MANAGER', 'ADMIN', 'CASHIER', 'SALES_CASHIER'],
    children: [
      {
        path: '/customers',
        label: 'Clients',
        icon: <Users size={14} />,
        module: 'CUSTOMER',
        roles: ['COMMERCIAL', 'SALES', 'MANAGER', 'ADMIN', 'CASHIER', 'SALES_CASHIER'],
      },
      {
        path: '/credits',
        label: 'Credits',
        icon: <CreditCard size={14} />,
        module: 'CUSTOMER',
        roles: ['MANAGER', 'ADMIN', 'CASHIER', 'SALES_CASHIER'],
      },
      {
        path: '/customers/intelligence',
        label: 'Intelligence',
        icon: <Sparkles size={14} />,
        module: 'CLIENT_INTEL',
        roles: ['MANAGER', 'ADMIN'],
      },
    ],
  },
  {
    section: 'VENTES',
    path: '/sales/refunds',
    label: 'Remboursements',
    icon: <RotateCcw size={16} />,
    module: 'SELL',
    roles: ['CASHIER', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
    capability: 'CAN_REFUND',
  },
  {
    section: 'VENTES',
    path: '/coupons',
    label: 'Codes promo',
    icon: <Tag size={16} />,
    module: 'SELL',
    roles: ['MANAGER', 'ADMIN'],
  },
  {
    section: 'COMMERCIAL',
    path: '/commercial',
    label: 'Commercial CRM',
    icon: <Target size={16} />,
    module: 'COMMERCIAL',
    roles: ['COMMERCIAL', 'SALES', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
    children: [
      {
        path: '/commercial',
        label: 'Pipeline',
        icon: <Target size={14} />,
        module: 'COMMERCIAL',
        roles: ['COMMERCIAL', 'SALES', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_MANAGE_OPPORTUNITIES',
      },
      {
        path: '/commercial/prospects',
        label: 'Prospects',
        icon: <Users size={14} />,
        module: 'COMMERCIAL',
        roles: ['COMMERCIAL', 'SALES', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_MANAGE_LEADS',
      },
      {
        path: '/commercial/tasks',
        label: 'Relances',
        icon: <ClipboardList size={14} />,
        module: 'COMMERCIAL',
        roles: ['COMMERCIAL', 'SALES', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_LOG_ACTIVITY',
      },
      {
        path: '/commercial/incentives',
        label: 'Primes',
        icon: <Wallet size={14} />,
        module: 'COMMERCIAL',
        roles: ['COMMERCIAL', 'SALES', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_APPROVE_COMMERCIAL_BONUS',
      },
    ],
  },
  {
    section: 'FINANCE',
    path: '/cashier',
    label: 'Caisse',
    icon: <Banknote size={16} />,
    module: 'CASH',
    roles: ['CASHIER', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
    children: [
      {
        path: '/cashier',
        label: 'Tableau de bord',
        icon: <Banknote size={14} />,
        module: 'CASH',
        roles: ['CASHIER', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_CASH',
      },
      {
        path: '/cashier/analytics',
        label: 'Mon Analyse',
        icon: <Shield size={14} />,
        module: 'ANALYTICS_CASHIER',
        roles: ['CASHIER', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_CASH',
      },
      {
        path: '/cashier/team-analytics',
        label: 'Equipe Caisse',
        icon: <Users size={14} />,
        module: 'ANALYTICS_CASHIER',
        roles: ['MANAGER', 'ADMIN'],
      },
    ],
  },
  {
    section: 'FINANCE',
    path: '/expenses',
    label: 'Depenses',
    icon: <Wallet size={16} />,
    module: 'EXPENSE',
    roles: ['CASHIER', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
    capability: 'CAN_VIEW_EXPENSE_REPORTS',
    children: [
      {
        path: '/expenses',
        label: 'Liste',
        icon: <Wallet size={14} />,
        module: 'EXPENSE',
        roles: ['CASHIER', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_VIEW_EXPENSE_REPORTS',
      },
      {
        path: '/expenses/dashboard',
        label: 'Dashboard',
        icon: <PieChart size={14} />,
        module: 'EXPENSE',
        roles: ['CASHIER', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
        capability: 'CAN_VIEW_EXPENSE_REPORTS',
      },
      {
        path: '/expenses/settings',
        label: 'Parametres',
        icon: <Settings size={14} />,
        module: 'EXPENSE',
        roles: ['MANAGER', 'ADMIN'],
        capability: 'CAN_SET_BUDGETS',
      },
    ],
  },
  {
    section: 'FINANCE',
    path: '/accounting',
    label: 'Comptabilite',
    icon: <FileText size={16} />,
    module: 'ACCOUNTING',
    roles: ['MANAGER', 'ADMIN'],
    children: [
      {
        path: '/accounting/chart',
        label: 'Plan comptable',
        icon: <FolderTree size={14} />,
        module: 'ACCOUNTING',
        roles: ['MANAGER', 'ADMIN'],
      },
      {
        path: '/accounting/entries',
        label: 'Ecritures',
        icon: <ClipboardList size={14} />,
        module: 'ACCOUNTING',
        roles: ['MANAGER', 'ADMIN'],
      },
      {
        path: '/accounting/balance',
        label: 'Balance generale',
        icon: <BarChart2 size={14} />,
        module: 'ACCOUNTING',
        roles: ['MANAGER', 'ADMIN'],
      },
      {
        path: '/accounting/ledger',
        label: 'Grand livre',
        icon: <FileText size={14} />,
        module: 'ACCOUNTING',
        roles: ['MANAGER', 'ADMIN'],
      },
      {
        path: '/accounting/bilan',
        label: 'Bilan',
        icon: <BarChart2 size={14} />,
        module: 'ACCOUNTING',
        roles: ['MANAGER', 'ADMIN'],
      },
      {
        path: '/accounting/compte-resultat',
        label: 'Compte de resultat',
        icon: <TrendingUp size={14} />,
        module: 'ACCOUNTING',
        roles: ['MANAGER', 'ADMIN'],
      },
      {
        path: '/accounting/settings',
        label: 'Parametres',
        icon: <Settings size={14} />,
        module: 'ACCOUNTING',
        roles: ['ADMIN'],
      },
    ],
  },
  {
    section: 'LOGISTIQUE',
    path: '/catalog',
    label: 'Catalogue',
    icon: <Package size={16} />,
    module: 'SELL',
    roles: ['SALES', 'SALES_CASHIER', 'MANAGER', 'ADMIN', 'STOCKER'],
    children: [
      { path: '/catalog', label: 'Produits', icon: <Package size={14} />, module: 'SELL' },
      {
        path: '/catalog/categories',
        label: 'Categories',
        icon: <FolderTree size={14} />,
        module: 'STOCK',
        roles: ['MANAGER', 'ADMIN'],
      },
      {
        path: '/catalog/brands',
        label: 'Marques',
        icon: <Tag size={14} />,
        module: 'STOCK',
        roles: ['MANAGER', 'ADMIN'],
      },
    ],
  },
  {
    section: 'LOGISTIQUE',
    path: '/stock',
    label: 'Stock',
    icon: <Layers size={16} />,
    module: 'STOCK',
    roles: ['STOCKER', 'MANAGER', 'ADMIN'],
    capability: 'CAN_STOCK',
    children: [
      { path: '/stock', label: 'Niveaux', icon: <Layers size={14} />, module: 'STOCK' },
      { path: '/stock/movements', label: 'Mouvements', icon: <History size={14} />, module: 'STOCK' },
      { path: '/stock/entry', label: 'Entrees', icon: <PackagePlus size={14} />, module: 'STOCK' },
      { path: '/stock/adjust', label: 'Ajustements', icon: <PackageMinus size={14} />, module: 'STOCK' },
      { path: '/stock/transfers', label: 'Transferts', icon: <ArrowRightLeft size={14} />, module: 'STOCK' },
      { path: '/stock/counts', label: 'Inventaires', icon: <ClipboardList size={14} />, module: 'STOCK' },
      { path: '/stock/analytics', label: 'Analyse Stock', icon: <BarChart2 size={14} />, module: 'ANALYTICS_STOCK' },
    ],
  },
  {
    section: 'LOGISTIQUE',
    path: '/purchases',
    label: 'Achats',
    icon: <Truck size={16} />,
    module: 'PURCHASE',
    roles: ['MANAGER', 'ADMIN'],
    children: [
      {
        path: '/purchases/orders',
        label: 'Bons de commande',
        icon: <ClipboardList size={14} />,
        module: 'PURCHASE',
      },
      {
        path: '/purchases/suppliers',
        label: 'Fournisseurs',
        icon: <Building2 size={14} />,
        module: 'PURCHASE',
      },
    ],
  },
  {
    section: 'LOGISTIQUE',
    path: '/delivery',
    label: 'Livraisons',
    icon: <MapPin size={16} />,
    module: 'DELIVERY',
    roles: ['ADMIN', 'MANAGER', 'SALES', 'SALES_CASHIER', 'STOCKER', 'DELIVERY'],
  },
  {
    section: 'RH',
    path: '/hrm',
    label: 'Ressources Humaines',
    icon: <UserCheck size={16} />,
    module: 'HRM',
    roles: ['HR', 'MANAGER', 'ADMIN'],
    children: [
      {
        path: '/hrm/organisation',
        label: 'Organisation',
        icon: <Building2 size={14} />,
        module: 'HRM',
        roles: ['HR', 'MANAGER', 'ADMIN'],
        capability: 'CAN_MANAGE_HRM',
      },
      {
        path: '/hrm/employees',
        label: 'Employes',
        icon: <Users size={14} />,
        module: 'HRM',
        roles: ['HR', 'MANAGER', 'ADMIN'],
        capability: 'CAN_VIEW_HRM',
      },
      {
        path: '/hrm/leaves',
        label: 'Conges',
        icon: <Calendar size={14} />,
        module: 'HRM',
        roles: ['HR', 'MANAGER', 'ADMIN'],
        capability: 'CAN_VIEW_HRM',
      },
      {
        path: '/hrm/attendance',
        label: 'Pointage',
        icon: <Clock size={14} />,
        module: 'HRM',
        roles: ['HR', 'MANAGER', 'ADMIN'],
        capability: 'CAN_VIEW_HRM',
      },
      {
        path: '/hrm/kiosk',
        label: 'Kiosque pointage',
        icon: <ScanFace size={14} />,
        module: 'HRM',
        roles: ['HR', 'MANAGER', 'ADMIN'],
        capability: 'CAN_MANAGE_HRM',
      },
      {
        path: '/hrm/payroll',
        label: 'Paie',
        icon: <DollarSign size={14} />,
        module: 'HRM',
        roles: ['HR', 'MANAGER', 'ADMIN'],
        capability: 'CAN_VIEW_HRM',
      },
      {
        path: '/hrm/planning',
        label: 'Planning',
        icon: <CalendarDays size={14} />,
        module: 'PLANNING',
        roles: ['HR', 'MANAGER', 'ADMIN'],
      },
    ],
  },
  {
    section: 'PILOTAGE',
    path: '/objectives',
    label: 'Objectifs',
    icon: <Target size={16} />,
    module: 'SELLER_PERF',
    roles: ['COMMERCIAL', 'SALES', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
    children: [
      {
        path: '/objectives/my-goal',
        label: 'Mon Objectif',
        icon: <Target size={14} />,
        module: 'SELLER_PERF',
        roles: ['COMMERCIAL', 'SALES', 'SALES_CASHIER', 'MANAGER', 'ADMIN'],
      },
      {
        path: '/objectives/admin',
        label: 'Administration',
        icon: <Settings size={14} />,
        module: 'SELLER_PERF',
        roles: ['MANAGER', 'ADMIN'],
      },
    ],
  },
  {
    section: 'PILOTAGE',
    path: '/reports',
    label: 'Rapports',
    icon: <BarChart3 size={16} />,
    module: 'ANALYTICS_MANAGER',
    roles: ['MANAGER', 'ADMIN'],
    capability: 'CAN_VIEW_REPORTS',
  },
  {
    section: 'PILOTAGE',
    path: '/reports/cashflow',
    label: 'Trésorerie',
    icon: <TrendingUp size={16} />,
    module: 'SELL',
    roles: ['MANAGER', 'ADMIN'],
  },
  {
    section: 'PILOTAGE',
    path: '/reports/debts',
    label: 'Créances & Dettes',
    icon: <CreditCard size={16} />,
    module: 'SELL',
    roles: ['MANAGER', 'ADMIN'],
  },
  {
    section: 'PILOTAGE',
    path: '/statistics',
    label: 'Statistiques',
    icon: <PieChart size={16} />,
    module: 'ANALYTICS_MANAGER',
    roles: ['MANAGER', 'ADMIN'],
    capability: 'CAN_VIEW_REPORTS',
  },
  {
    section: 'PILOTAGE',
    path: '/analytics',
    label: 'Analytics AI',
    icon: <Brain size={16} />,
    module: 'ANALYTICS_MANAGER',
    roles: ['MANAGER', 'ADMIN'],
  },
  {
    section: 'PILOTAGE',
    path: '/dg/dashboard',
    label: 'Dashboard DG',
    icon: <LayoutDashboard size={16} />,
    module: 'ANALYTICS_DG',
    roles: ['MANAGER', 'ADMIN'],
  },
  {
    section: 'PILOTAGE',
    path: '/communications',
    label: 'Communication',
    icon: <MessageSquare size={16} />,
    module: 'COMMUNICATION',
    roles: ['ADMIN', 'MANAGER', 'COMMERCIAL'],
  },
  {
    section: 'PILOTAGE',
    path: '/audit-logs',
    label: "Journal d'audit",
    icon: <ScrollText size={16} />,
    module: 'ANALYTICS_MANAGER',
    roles: ['MANAGER', 'ADMIN'],
  },
  {
    section: 'ADMINISTRATION',
    path: '/settings',
    label: 'Parametres',
    icon: <Settings size={16} />,
    module: 'CORE',
    roles: ['MANAGER', 'ADMIN'],
    children: [
      { path: '/settings/stores', label: 'Magasins', icon: <Wrench size={14} />, module: 'CORE', capability: 'CAN_MANAGE_STORES' },
      { path: '/settings/invoice', label: 'Facturation', icon: <FileText size={14} />, module: 'CORE', capability: 'CAN_MANAGE_STORES' },
      { path: '/settings/structure', label: 'Structure', icon: <Building2 size={14} />, module: 'CORE', capability: 'CAN_MANAGE_STORES' },
      { path: '/settings/subscriptions', label: 'Abonnements', icon: <CreditCard size={14} />, module: 'CORE', superuserOnly: true },
      { path: '/settings/modules', label: 'Modules payants', icon: <Layers size={14} />, module: 'CORE', superuserOnly: true },
      { path: '/settings/permissions', label: 'Permissions', icon: <Shield size={14} />, module: 'CORE', capability: 'CAN_MANAGE_USERS' },
      { path: '/settings/users', label: 'Utilisateurs', icon: <UserCog size={14} />, module: 'CORE', capability: 'CAN_MANAGE_USERS' },
      { path: '/settings/enterprises', label: 'Entreprises', icon: <Building2 size={14} />, module: 'CORE', superuserOnly: true },
      { path: '/settings/enterprise-setup', label: 'Creer entreprise', icon: <PlusCircle size={14} />, module: 'CORE', superuserOnly: true },
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
  const isSuperuser = user?.is_superuser === true;

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

  const canAccessSubItem = (child: SubItem): boolean => {
    if (!user) return false;
    if (child.superuserOnly && !user.is_superuser) return false;
    if (!isModuleEnabled(child.module)) return false;
    if (child.roles && !child.roles.includes(user.role)) return false;
    if (child.capability) {
      if (isSuperuser) return true;
      return capabilities.includes(child.capability);
    }
    return true;
  };

  const visibleItems = navItems.filter((item) => {
    if (!user) return false;
    if (!isModuleEnabled(item.module)) return false;
    if (!item.roles.includes(user.role)) return false;

    if (item.children?.length) {
      return item.children.some((child) => canAccessSubItem(child));
    }

    if (item.capability) {
      if (isSuperuser) return true;
      return capabilities.includes(item.capability);
    }
    return true;
  });

  const sections: { key: NavSection; items: typeof visibleItems }[] = useMemo(() => {
    const grouped = new Map<NavSection, typeof visibleItems>();
    for (const section of SECTION_ORDER) grouped.set(section, []);
    for (const item of visibleItems) grouped.get(item.section)?.push(item);
    return SECTION_ORDER
      .map((section) => ({ key: section, items: grouped.get(section) ?? [] }))
      .filter(({ items }) => items.length > 0);
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
      className={`h-full bg-white dark:bg-gray-800 border-r border-[#E6EAED] dark:border-gray-700 flex flex-col print:hidden transition-all duration-200 ${
        collapsed ? 'w-[72px]' : 'w-[252px]'
      }`}
    >
      {/* ── Logo + toggle ── */}
      <div className="flex items-center h-[65px] px-4 shrink-0 border-b border-[#E6EAED] dark:border-gray-700">
        {!collapsed ? (
          <>
            <img src="/logo-full.png" alt="SimaStock" className="h-9 w-auto object-contain flex-1 min-w-0" />
            <button
              onClick={onToggle}
              className="ml-2 p-1.5 rounded-[5px] text-[#637381] hover:bg-[#F9FAFB] dark:hover:bg-gray-700 transition-colors shrink-0"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        ) : (
          <button
            onClick={onToggle}
            className="mx-auto p-1.5 rounded-[5px] text-[#637381] hover:bg-[#F9FAFB] dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={16} className="rotate-180" />
          </button>
        )}
      </div>

      {/* ── Navigation (PreAdmin: sidebar-inner > sidebar-menu) ── */}
      <nav className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          {sections.map(({ key, items }, sectionIdx) => (
            <Fragment key={key || '__root'}>

              {/* Section header — submenu-hdr style */}
              {collapsed
                ? sectionIdx > 0
                  ? <div className="h-px my-3 bg-[#E6EAED] dark:bg-gray-700" />
                  : null
                : key
                  ? (
                    <h6
                      className="text-[12px] font-bold mb-2 select-none text-[#092C4C] dark:text-gray-300"
                      style={{ margin: sectionIdx === 0 ? '0 0 8px 0' : '16px 0 8px 0' }}
                    >
                      {SECTION_LABELS[key as Exclude<NavSection, ''>]}
                    </h6>
                  )
                  : null}

              {/* Items list */}
              <ul className="mb-0">
                {items.map((item) => {
                  const filteredChildren = item.children?.filter((child) => {
                    if (child.superuserOnly && !isSuperuser) return false;
                    return canAccessSubItem(child);
                  });
                  const hasChildren = Boolean(filteredChildren?.length);
                  const isExpanded = expandedSections.has(item.path);
                  const childRouteActive = Boolean(
                    filteredChildren?.some((child) => location.pathname.startsWith(child.path)),
                  );
                  const isSectionActive = location.pathname.startsWith(item.path) || childRouteActive;

                  /* ── Parent with children ── */
                  if (hasChildren && !collapsed) {
                    return (
                      <li key={item.path} className="mb-0.5">
                        <button
                          onClick={() => toggleSection(item.path)}
                          className={`w-full flex items-center rounded-[5px] transition-colors px-[15px] py-[10px] ${
                            isSectionActive
                              ? 'bg-primary/8'
                              : 'hover:bg-primary/8'
                          }`}
                        >
                          {/* Icon */}
                          <span
                            className={`mr-[10px] shrink-0 ${isSectionActive ? 'text-primary' : 'text-[#637381] dark:text-gray-400'}`}
                          >
                            {item.icon}
                          </span>
                          {/* Label */}
                          <span
                            className={`text-[15px] font-medium flex-1 text-left ${isSectionActive ? 'text-primary' : 'text-[#646B72] dark:text-gray-300'}`}
                          >
                            {item.label}
                          </span>
                          {/* Chevron */}
                          <ChevronDown
                            size={14}
                            className={`shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''} ${isSectionActive ? 'text-primary' : 'text-[#9CA3AF] dark:text-gray-500'}`}
                          />
                        </button>

                        {/* Sub-items — PreAdmin bullet dot style */}
                        {isExpanded && (
                          <ul className="pt-1.5 pb-4 border-b border-gray-200/50 dark:border-gray-700">
                            {filteredChildren!.map((child) => {
                              const childActive = child.path === item.path
                                ? location.pathname === child.path
                                : location.pathname.startsWith(child.path);
                              return (
                                <li key={child.path}>
                                  <NavLink
                                    to={child.path}
                                    end={child.path === item.path}
                                    className={`flex items-center relative transition-colors rounded-[5px] py-2 pr-3 text-[14px] font-medium ${
                                      childActive
                                        ? 'text-primary'
                                        : 'text-[#092C4C] dark:text-gray-300 hover:text-primary dark:hover:text-primary'
                                    }`}
                                    style={{ paddingLeft: '40px' }}
                                  >
                                    {/* Bullet dot (PreAdmin ::after) */}
                                    <span
                                      className="absolute border-2 rounded-full"
                                      style={{
                                        width: '8px',
                                        height: '8px',
                                        left: '16px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: childActive ? 'var(--color-primary)' : 'rgba(50,71,92,0.38)',
                                        borderColor: childActive ? 'rgba(15,76,154,0.3)' : 'transparent',
                                      }}
                                    />
                                    {child.label}
                                  </NavLink>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  }

                  /* ── Leaf nav item ── */
                  return (
                    <li key={item.path} className="mb-0.5">
                      <NavLink
                        to={item.path}
                        end={!hasChildren}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          `flex items-center rounded-[5px] transition-colors px-[15px] py-[10px] ${
                            isActive || (hasChildren && isSectionActive)
                              ? 'bg-primary/8'
                              : 'hover:bg-primary/8'
                          } ${collapsed ? 'justify-center px-0 py-3' : ''}`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {/* Icon */}
                            <span
                              className={`${collapsed ? '' : 'mr-[10px] shrink-0'} ${
                                isActive || (hasChildren && isSectionActive)
                                  ? 'text-primary'
                                  : 'text-[#637381] dark:text-gray-400'
                              }`}
                            >
                              {item.icon}
                            </span>
                            {/* Label (hidden when collapsed) */}
                            {!collapsed && (
                              <span
                                className={`text-[15px] font-medium ${
                                  isActive || (hasChildren && isSectionActive)
                                    ? 'text-primary'
                                    : 'text-[#646B72] dark:text-gray-300'
                                }`}
                              >
                                {item.label}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>

            </Fragment>
          ))}
        </div>
      </nav>
    </aside>
  );
}
