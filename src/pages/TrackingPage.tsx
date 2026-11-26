import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileSearch } from 'lucide-react';
import { apiRequest } from '../services/api';
import { ComplaintItem, SlaInfo } from '../types';
import { PageShell, PriorityText, SlaLabel, StatusText } from '../components/ui/MotionPrimitives';

interface TrackLookup {
  complaint: {
    referenceId: string;
    title: string;
    category: string;
    departmentName: string;
    priority: string;
    status: string;
    assignedStaffName: string;
    submittedAt: string;
    updatedAt: string;
    slaDeadline: string;
    escalationLevel: number;
    resolutionSummary: string | null;
  };
  timeline: Array<{
    id: string;
    status: string;
    description: string;
    updatedBy: string;
    createdAt: string;
  }>;
  sla: SlaInfo;
}

export default function TrackingPage() {
  const [refInput, setRefInput] = useState('CMP-2026-0001');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TrackLookup | null>(null);

  const { data: recentData } = useQuery({
    queryKey: ['complaints', 'track-list'],
    queryFn: () => apiRequest<{ complaints: ComplaintItem[] }>('/api/complaints?limit=8'),
  });

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refInput.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<TrackLookup>(
        `/api/complaints/track/${encodeURIComponent(refInput.trim())}`
      );
      setResult(res);
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Complaint Tracking</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Verify live case milestones by Reference ID or inspect your accessible complaint queue.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 p-6 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-5">
          <form onSubmit={handleLookup} className="flex gap-2">
            <input
              type="text"
              value={refInput}
              onChange={(e) => setRefInput(e.target.value)}
              placeholder="Enter Reference ID (e.g. CMP-2026-0001)"
              aria-label="Complaint Reference ID"
              className="flex-1 h-10 px-3.5 rounded-lg text-sm font-mono uppercase bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileSearch className="w-4 h-4" />
              <span>{loading ? 'Searching...' : 'Track Progress'}</span>
            </button>
          </form>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          {result && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-5">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                    {result.complaint.referenceId}
                  </span>
                  <span className="text-slate-400">·</span>
                  <StatusText status={result.complaint.status} />
                  <span className="text-slate-400">·</span>
                  <PriorityText priority={result.complaint.priority} />
                  <span className="text-slate-400">·</span>
                  <SlaLabel sla={result.sla} />
                </div>
                <h2 className="text-base font-display font-bold">{result.complaint.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {result.complaint.category} · {result.complaint.departmentName} · Assigned:{' '}
                  {result.complaint.assignedStaffName}
                </p>
              </div>

              <ol className="relative border-l border-slate-200 dark:border-slate-800 ml-2 space-y-4">
                {result.timeline.map((step) => (
                  <li key={step.id} className="pl-4 relative">
                    <span className="w-2 h-2 rounded-full bg-blue-600 absolute -left-[4.5px] top-1.5" />
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <StatusText status={step.status} />
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(step.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">{step.description}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Updated by {step.updatedBy}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <section className="lg:col-span-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800/80">
            <h2 className="text-sm font-semibold">Recent Accessible Cases</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {(recentData?.complaints || []).map((c) => (
              <div key={c.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setRefInput(c.referenceId)}
                    className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {c.referenceId}
                  </button>
                  <p className="text-xs font-medium truncate mt-0.5">{c.title}</p>
                  <p className="text-[11px] text-slate-500">{c.departmentName}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <div><StatusText status={c.status} /></div>
                  <Link to={`/complaints/detail/${c.id}`} className="text-[11px] text-slate-500 hover:text-blue-500">
                    Open →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
