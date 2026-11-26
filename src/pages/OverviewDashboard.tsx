import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  FilePlus2,
  FolderKanban,
  Inbox,
  Timer,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiFetchBlob, apiRequest } from '../services/api';
import {
  AnimatedCounter,
  PageShell,
  PriorityText,
  SlaLabel,
  StatusText,
  TableSkeleton,
} from '../components/ui/MotionPrimitives';
import { SlaInfo } from '../types';

interface OverviewResponse {
  kpis: {
    total: number;
    newComplaints: number;
    pending: number;
    inProgress: number;
    resolved: number;
    rejected: number;
    escalated: number;
    avgResolutionHours: number;
    resolutionRate: number;
    slaComplianceRate: number;
    slaApproaching: number;
    slaBreached: number;
    slaMetOrOnTrack: number;
  };
  monthlyTrends: Array<{ month: string; submitted: number; resolved: number; escalated: number; avgHours: number }>;
  departmentBreakdown: Array<{
    id: string;
    name: string;
    code: string;
    total: number;
    open: number;
    resolved: number;
    resolutionRate: number;
    avgHours: number;
  }>;
  statusDistribution: Array<{ name: string; value: number }>;
  dailyActivity: Array<{ day: string; date: string; created: number; resolved: number }>;
  staffWorkload: Array<{
    userId: string;
    name: string;
    designation: string;
    departmentCode: string;
    assigned: number;
    open: number;
    resolved: number;
    overdue: number;
    avgHours: number;
  }>;
  recentComplaints: Array<{
    id: string;
    referenceId: string;
    title: string;
    category: string;
    departmentName: string;
    priority: string;
    status: string;
    assignedStaffName: string;
    sla: SlaInfo;
    createdAt: string;
  }>;
  urgentComplaints: Array<{
    id: string;
    referenceId: string;
    title: string;
    departmentName: string;
    priority: string;
    status: string;
    sla: SlaInfo;
  }>;
  recentlyResolved: Array<{
    id: string;
    referenceId: string;
    title: string;
    departmentName: string;
    assignedStaffName: string;
    resolvedAt: string | null;
  }>;
  latestActivities: Array<{
    id: string;
    complaintId: string;
    referenceId: string;
    status: string;
    updatedByName: string;
    description: string;
    createdAt: string;
  }>;
}

const PIE_COLORS = ['#2563EB', '#6366F1', '#0EA5E9', '#D97706', '#EA580C', '#16A34A', '#64748B', '#8B5CF6', '#DC2626'];

export default function OverviewDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => apiRequest<OverviewResponse>('/api/analytics/overview'),
  });

  const gridColor = theme === 'dark' ? '#1E293B' : '#E2E8F0';
  const axisColor = theme === 'dark' ? '#94A3B8' : '#64748B';
  const tooltipStyle = {
    backgroundColor: theme === 'dark' ? '#0F1629' : '#FFFFFF',
    borderColor: theme === 'dark' ? '#1E293B' : '#E2E8F0',
    borderRadius: '10px',
    fontSize: '12px',
    color: theme === 'dark' ? '#F8FAFC' : '#0F172A',
  };

  const handleExportPdf = async () => {
    const { blob } = await apiFetchBlob('/api/analytics/report.pdf');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ResolveDesk-Executive-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = data?.kpis;
  const kpiCards = [
    { label: 'Total Complaints', value: kpis?.total ?? 0, icon: FolderKanban, to: '/complaints', accent: 'text-blue-600 dark:text-blue-400' },
    { label: 'New Complaints', value: kpis?.newComplaints ?? 0, icon: Inbox, to: '/complaints/new', accent: 'text-indigo-600 dark:text-indigo-400' },
    { label: 'Pending Review', value: kpis?.pending ?? 0, icon: Clock, to: '/complaints/pending', accent: 'text-sky-600 dark:text-sky-400' },
    { label: 'In Progress', value: kpis?.inProgress ?? 0, icon: Wrench, to: '/complaints/in-progress', accent: 'text-amber-600 dark:text-amber-400' },
    { label: 'Resolved Cases', value: kpis?.resolved ?? 0, icon: CheckCircle2, to: '/complaints/resolved', accent: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Rejected Cases', value: kpis?.rejected ?? 0, icon: XCircle, to: '/complaints/rejected', accent: 'text-slate-600 dark:text-slate-400' },
    { label: 'Escalated Cases', value: kpis?.escalated ?? 0, icon: AlertTriangle, to: '/complaints/escalated', accent: 'text-red-600 dark:text-red-400' },
    {
      label: 'Avg Resolution',
      value: kpis?.avgResolutionHours ?? 0,
      suffix: 'h',
      decimals: 1,
      icon: Timer,
      to: '/analytics',
      accent: 'text-blue-600 dark:text-blue-400',
    },
  ];

  return (
    <PageShell>
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-white">
            Executive Operations Overview
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Live grievance metrics, department throughput, and SLA compliance for {user?.name}.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {(user?.role === 'SUPER_ADMIN' || user?.role === 'DEPARTMENT_ADMIN') && (
            <button
              type="button"
              onClick={handleExportPdf}
              className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1629] hover:bg-slate-50 dark:hover:bg-slate-800/70 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF Report</span>
            </button>
          )}
          <Link
            to="/submit"
            className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Submit Complaint</span>
          </Link>
        </div>
      </div>

      {/* 8 Animated KPI Cards */}
      <section aria-label="Key Performance Metrics" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: idx * 0.035 }}
            >
              <Link
                to={card.to}
                className="group block p-4 sm:p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 hover:border-blue-500/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                    {card.label}
                  </span>
                  <Icon className={`w-4 h-4 shrink-0 ${card.accent}`} />
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <span className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-slate-900 dark:text-white">
                    {isLoading ? (
                      <span className="inline-block h-7 w-12 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                    ) : (
                      <AnimatedCounter value={card.value} suffix={card.suffix} decimals={card.decimals} />
                    )}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </section>

      {/* Primary Charts Row (Monthly Trends + Status Distribution) */}
      <section className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Monthly Complaint Trends</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Submitted vs resolved intake across 6 months</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 rounded-full bg-blue-600" />
                Submitted
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 rounded-full bg-emerald-600" />
                Resolved
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.monthlyTrends || []}>
                <defs>
                  <linearGradient id="gradSubmitted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16A34A" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="month" stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="submitted" name="Submitted" stroke="#2563EB" strokeWidth={2} fill="url(#gradSubmitted)" />
                <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#16A34A" strokeWidth={2} fill="url(#gradResolved)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 flex flex-col">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Status Distribution</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Current workflow stage breakdown</p>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.statusDistribution || []}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {(data?.statusDistribution || []).map((entry, idx) => (
                    <Cell key={entry.name} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            {(data?.statusDistribution || []).slice(0, 6).map((entry, idx) => (
              <div key={entry.name} className="flex items-center justify-between gap-1.5 min-w-0">
                <span className="flex items-center gap-1.5 truncate text-slate-600 dark:text-slate-400">
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                  />
                  <span className="truncate">{entry.name}</span>
                </span>
                <span className="font-mono font-medium text-slate-900 dark:text-slate-200 tabular-nums shrink-0">
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-auto pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Resolution Rate</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {kpis?.resolutionRate ?? 0}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">SLA Compliance</span>
              <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                {kpis?.slaComplianceRate ?? 100}%
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Secondary Charts Row (Department-Wise + Avg Resolution Time + Daily Activity) */}
      <section className="grid lg:grid-cols-3 gap-5">
        <div className="p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Department-Wise Volume</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Open vs resolved per unit</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.departmentBreakdown || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="code" stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="open" name="Open" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="#16A34A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Average Resolution Time</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Mean turnaround in hours</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.monthlyTrends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="month" stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="avgHours" name="Avg Hours" stroke="#6366F1" strokeWidth={2.2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Daily Complaint Activity</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">7-day intake and closures</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.dailyActivity || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="day" stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="created" name="Submitted" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="#16A34A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Operational Queues: Urgent + Recent Complaints */}
      <section className="grid lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Recent Complaints</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Latest cases registered across departments</p>
            </div>
            <Link to="/complaints" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              View all
            </Link>
          </div>
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4">Reference</th>
                    <th className="py-2.5 px-4">Title</th>
                    <th className="py-2.5 px-4">Priority</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-sm">
                  {(data?.recentComplaints || []).map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        <Link to={`/complaints/detail/${c.id}`} className="hover:underline">
                          {c.referenceId}
                        </Link>
                      </td>
                      <td className="py-3 px-4 max-w-[260px]">
                        <Link to={`/complaints/detail/${c.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1">
                          {c.title}
                        </Link>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {c.departmentName} · {c.assignedStaffName}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <PriorityText priority={c.priority} />
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={c.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <SlaLabel sla={c.sla} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Urgent & SLA Priority Queue</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Critical, High, and Escalated cases needing attention</p>
            </div>
            <Link to="/complaints/escalated" className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">
              Escalations
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70 flex-1">
            {(data?.urgentComplaints || []).length === 0 ? (
              <p className="p-6 text-xs text-slate-500 dark:text-slate-400 text-center">No urgent complaints pending.</p>
            ) : (
              (data?.urgentComplaints || []).map((c) => (
                <Link
                  key={c.id}
                  to={`/complaints/detail/${c.id}`}
                  className="block px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{c.referenceId}</span>
                    <SlaLabel sla={c.sla} />
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5 line-clamp-1">{c.title}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>{c.departmentName}</span>
                    <span>·</span>
                    <PriorityText priority={c.priority} />
                    <span>·</span>
                    <StatusText status={c.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Bottom Operational Row: Staff Workload + Latest Activities + Recently Resolved */}
      <section className="grid lg:grid-cols-3 gap-5">
        <div className="rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Staff Workload</h2>
            <Link to="/staff" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              Directory
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {(data?.staffWorkload || []).slice(0, 5).map((s) => (
              <div key={s.userId} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {s.departmentCode} · {s.designation}
                  </p>
                </div>
                <div className="text-right font-mono text-xs tabular-nums shrink-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{s.open} open</p>
                  <p className="text-emerald-600 dark:text-emerald-400">{s.resolved} resolved</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800/80">
            <h2 className="text-sm font-semibold">Latest Activity Stream</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70 max-h-72 overflow-y-auto">
            {(data?.latestActivities || []).slice(0, 6).map((act) => (
              <Link
                key={act.id}
                to={`/complaints/detail/${act.complaintId}`}
                className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{act.referenceId}</span>
                  <StatusText status={act.status} />
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 line-clamp-1">{act.description}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {act.updatedByName} · {new Date(act.createdAt).toLocaleString()}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recently Resolved</h2>
            <Link to="/complaints/resolved" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {(data?.recentlyResolved || []).length === 0 ? (
              <p className="p-6 text-xs text-slate-500 dark:text-slate-400 text-center">No resolved complaints yet.</p>
            ) : (
              (data?.recentlyResolved || []).map((c) => (
                <Link
                  key={c.id}
                  to={`/complaints/detail/${c.id}`}
                  className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{c.referenceId}</span>
                    <span className="text-slate-400 font-mono">
                      {c.resolvedAt ? new Date(c.resolvedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <p className="text-sm font-medium mt-0.5 line-clamp-1">{c.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {c.departmentName} · Resolved by {c.assignedStaffName}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
