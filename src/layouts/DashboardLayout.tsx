import React, { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  FilePlus2,
  FileSearch,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserCheck,
  UserCircle2,
  Users,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../services/api';
import { NotificationItem } from '../types';

interface NavEntry {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Array<'SUPER_ADMIN' | 'DEPARTMENT_ADMIN' | 'STAFF' | 'USER'>;
  end?: boolean;
}

const NAV_GROUPS: Array<{ title: string; items: NavEntry[] }> = [
  {
    title: 'Workspace',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/submit', label: 'Submit Complaint', icon: FilePlus2 },
      { to: '/track', label: 'Track Reference', icon: FileSearch },
    ],
  },
  {
    title: 'Complaint Queues',
    items: [
      { to: '/complaints', label: 'All Complaints', icon: FolderKanban, end: true },
      { to: '/complaints/new', label: 'New Complaints', icon: Inbox },
      { to: '/complaints/assigned', label: 'Assigned to Me', icon: UserCheck, roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'STAFF'] },
      { to: '/complaints/pending', label: 'Pending Complaints', icon: Clock },
      { to: '/complaints/in-progress', label: 'In Progress', icon: Wrench },
      { to: '/complaints/resolved', label: 'Resolved', icon: CheckCircle2 },
      { to: '/complaints/rejected', label: 'Rejected', icon: XCircle },
      { to: '/complaints/escalated', label: 'Escalated', icon: AlertTriangle },
    ],
  },
  {
    title: 'Operations & Governance',
    items: [
      { to: '/departments', label: 'Departments', icon: Building2, roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN'] },
      { to: '/staff', label: 'Staff Management', icon: UserCheck, roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN'] },
      { to: '/users', label: 'Users', icon: Users, roles: ['SUPER_ADMIN'] },
      { to: '/analytics', label: 'Reports & Analytics', icon: BarChart3, roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'STAFF'] },
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/audit-logs', label: 'Audit Logs', icon: ShieldCheck, roles: ['SUPER_ADMIN'] },
      { to: '/settings', label: 'Settings', icon: Settings, roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN'] },
      { to: '/profile', label: 'Profile', icon: UserCircle2 },
    ],
  },
];

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/submit': 'Submit Complaint',
  '/track': 'Track Complaint',
  '/complaints': 'All Complaints',
  '/complaints/new': 'New Complaints',
  '/complaints/assigned': 'Assigned to Me',
  '/complaints/pending': 'Pending Complaints',
  '/complaints/in-progress': 'In Progress',
  '/complaints/resolved': 'Resolved Complaints',
  '/complaints/rejected': 'Rejected Complaints',
  '/complaints/escalated': 'Escalated Complaints',
  '/departments': 'Departments',
  '/staff': 'Staff Management',
  '/users': 'Users Directory',
  '/analytics': 'Reports & Analytics',
  '/notifications': 'Notifications',
  '/audit-logs': 'Audit Logs',
  '/settings': 'SLA & Settings',
  '/profile': 'Profile & Security',
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications'),
    refetchInterval: 30000,
  });

  const unreadCount = notifData?.unreadCount || 0;
  const recentNotifs = (notifData?.notifications || []).slice(0, 6);

  const breadcrumb = useMemo(() => {
    if (location.pathname.startsWith('/complaints/detail/')) {
      return ['Complaints', 'Case Dossier'];
    }
    const title = ROUTE_TITLES[location.pathname] || 'Workspace';
    return location.pathname === '/' ? ['ResolveDesk', 'Overview'] : ['ResolveDesk', title];
  }, [location.pathname]);

  const formattedDate = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    navigate(`/complaints?search=${encodeURIComponent(trimmed)}`);
  };

  const handleMarkRead = async (id: string, complaintId?: string | null) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setNotifOpen(false);
    if (complaintId) navigate(`/complaints/detail/${complaintId}`);
  };

  const handleMarkAllRead = async () => {
    await apiRequest('/api/notifications/read-all', { method: 'POST' });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-white dark:bg-[#0C1222] border-r border-slate-200 dark:border-slate-800/90">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 shrink-0">
        <Link to="/" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-display font-bold text-sm">
            RD
          </div>
          <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-white">
            ResolveDesk
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close sidebar"
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4" aria-label="Primary sidebar navigation">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.roles || (user && item.roles.includes(user.role))
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center justify-between gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? 'bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                        }`
                      }
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.to === '/notifications' && unreadCount > 0 && (
                        <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                          {unreadCount}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-2.5 border-t border-slate-200 dark:border-slate-800/80 shrink-0">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign Out</span>
        </button>
        <div className="mt-2 px-3 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-[11px] text-slate-500 dark:text-slate-500 leading-snug">
          <p className="font-medium text-slate-700 dark:text-slate-300 truncate">Raghuraj Pratap Singh</p>
          <p className="truncate">raghurajpratapsingh8787@gmail.com</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#090E1A] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-68 max-w-[82vw] h-full"
            >
              {renderSidebarContent()}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-[#0C1222]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/90 px-4 lg:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
                {breadcrumb[0]}
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <span className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
                {breadcrumb[1]}
              </span>
            </nav>
          </div>

          <form onSubmit={handleGlobalSearch} className="hidden md:flex items-center flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search complaints by ID, title, or department..."
                aria-label="Global complaint search"
                className="w-full h-9 pl-9 pr-3 rounded-lg text-sm bg-slate-100/80 dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition"
              />
            </div>
          </form>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden xl:inline text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums mr-1 whitespace-nowrap">
              {formattedDate}
            </span>

            <Link
              to="/submit"
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700/90 bg-white dark:bg-[#131C31] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>New Complaint</span>
            </Link>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setProfileOpen(false);
                }}
                aria-label="Open notifications"
                className="relative h-9 w-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-[10px] font-mono font-bold text-white flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden z-40"
                  >
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-sm font-semibold">Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                      {recentNotifs.length === 0 ? (
                        <p className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                          You are all caught up.
                        </p>
                      ) : (
                        recentNotifs.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => handleMarkRead(n.id, n.complaintId)}
                            className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                              !n.isRead ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {n.title}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                                {new Date(n.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                              {n.message}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 text-center">
                      <Link
                        to="/notifications"
                        onClick={() => setNotifOpen(false)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        View notification history
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setNotifOpen(false);
                }}
                aria-label="Open account menu"
                className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">
                    {(user?.name || 'U').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="hidden sm:block text-left leading-tight">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 max-w-[140px] truncate">
                    {user?.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {user?.role.replace('_', ' ')}
                  </p>
                </div>
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-60 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-40"
                  >
                    <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{user?.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                    </div>
                    <Link
                      to="/profile"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <UserCircle2 className="w-4 h-4" /> Profile & Sessions
                    </Link>
                    {(user?.role === 'SUPER_ADMIN' || user?.role === 'DEPARTMENT_ADMIN') && (
                      <Link
                        to="/settings"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Settings className="w-4 h-4" /> SLA & Settings
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Active Page Outlet */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
