import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { apiFetchBlob, apiRequest } from '../services/api';
import { AnimatedCounter, PageShell } from '../components/ui/MotionPrimitives';

export default function ReportsAnalyticsPage() {
  const { theme } = useTheme();
  const { data } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => apiRequest<any>('/api/analytics/overview'),
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
    a.download = `ResolveDesk-Analytics-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const rows = (data?.departmentBreakdown || []) as Array<{
      code: string;
      name: string;
      total: number;
      open: number;
      resolved: number;
      resolutionRate: number;
      avgHours: number;
    }>;
    const safeCell = (val: string | number) => {
      const raw = String(val ?? '');
      const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${neutralized.replace(/"/g, '""')}"`;
    };
    const csvLines = [
      'Code,Department,Total,Open,Resolved,ResolutionRatePct,AvgResolutionHours',
      ...rows.map((r) =>
        [r.code, r.name, r.total, r.open, r.resolved, r.resolutionRate, r.avgHours].map(safeCell).join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ResolveDesk-Department-KPIs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = data?.kpis;

  return (
    <PageShell>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Reports & SLA Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Compliance telemetry, resolution velocity, and departmental accountability exports.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1629] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Executive PDF
          </button>
        </div>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'SLA Compliance Rate', value: kpis?.slaComplianceRate ?? 100, suffix: '%', color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Resolution Rate', value: kpis?.resolutionRate ?? 0, suffix: '%', color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Approaching Deadline', value: kpis?.slaApproaching ?? 0, suffix: '', color: 'text-amber-600 dark:text-amber-400' },
          { label: 'SLA Breached Cases', value: kpis?.slaBreached ?? 0, suffix: '', color: 'text-red-600 dark:text-red-400' },
        ].map((m) => (
          <div key={m.label} className="p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{m.label}</p>
            <p className={`text-3xl font-display font-bold mt-2 ${m.color}`}>
              <AnimatedCounter value={m.value} suffix={m.suffix} />
            </p>
          </div>
        ))}
      </section>

      <section className="grid lg:grid-cols-2 gap-5">
        <div className="p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90">
          <h2 className="text-sm font-semibold">Department Resolution Comparison</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Open vs resolved volume per department</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.departmentBreakdown || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="code" stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="total" name="Total" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="#16A34A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90">
          <h2 className="text-sm font-semibold">Resolution Turnaround Velocity</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Monthly average hours to resolution</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.monthlyTrends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="month" stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="avgHours" name="Avg Resolution Hours" stroke="#2563EB" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800/80">
          <h2 className="text-sm font-semibold">Department Performance Matrix</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Open</th>
                <th className="py-3 px-4 text-right">Resolved</th>
                <th className="py-3 px-4 text-right">Resolution Rate</th>
                <th className="py-3 px-4 text-right">Avg Turnaround</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-sm">
              {(data?.departmentBreakdown || []).map((d: any) => (
                <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{d.code}</td>
                  <td className="py-3 px-4 font-medium">{d.name}</td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">{d.total}</td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-amber-600 dark:text-amber-400">{d.open}</td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">{d.resolved}</td>
                  <td className="py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums">{d.resolutionRate}%</td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">{d.avgHours}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}
