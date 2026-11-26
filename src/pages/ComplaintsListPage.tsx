import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, FilePlus2, Paperclip, Search } from 'lucide-react';
import { apiRequest } from '../services/api';
import { ComplaintItem, DepartmentItem } from '../types';
import {
  PageShell,
  PriorityText,
  SlaLabel,
  StatusText,
  TableSkeleton,
} from '../components/ui/MotionPrimitives';

const CATEGORIES = [
  'All',
  'Academic',
  'Technical',
  'Infrastructure',
  'Hostel',
  'Transportation',
  'Administration',
  'Finance',
  'Facilities',
  'Other',
];

const PRIORITIES = ['All', 'Critical', 'High', 'Medium', 'Low'];

interface ComplaintsListPageProps {
  presetStatus?: string;
  assignedToMe?: boolean;
  pageTitle?: string;
  pageSubtitle?: string;
}

export default function ComplaintsListPage({
  presetStatus = 'All',
  assignedToMe = false,
  pageTitle = 'All Complaints',
  pageSubtitle = 'Filter, inspect, and manage registered institutional complaints.',
}: ComplaintsListPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(presetStatus);
  const [priority, setPriority] = useState('All');
  const [category, setCategory] = useState('All');
  const [departmentId, setDepartmentId] = useState('All');
  const [sortBy, setSortBy] = useState('createdAt');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setStatus(presetStatus);
    setPage(1);
  }, [presetStatus, assignedToMe]);

  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null) setSearch(q);
  }, [searchParams]);

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiRequest<{ departments: DepartmentItem[] }>('/api/departments'),
  });

  const queryParams = new URLSearchParams({
    status,
    priority,
    category,
    departmentId,
    sortBy,
    sortDir: 'desc',
    page: String(page),
    limit: '15',
  });
  if (assignedToMe) queryParams.set('assignedToMe', 'true');
  if (search.trim()) queryParams.set('search', search.trim());

  const { data, isLoading } = useQuery({
    queryKey: ['complaints', queryParams.toString()],
    queryFn: () =>
      apiRequest<{
        complaints: ComplaintItem[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/api/complaints?${queryParams.toString()}`),
  });

  const complaints = data?.complaints || [];
  const pagination = data?.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 };

  const handleResetFilters = () => {
    setSearch('');
    setPriority('All');
    setCategory('All');
    setDepartmentId('All');
    if (presetStatus === 'All') setStatus('All');
    setSearchParams({});
    setPage(1);
  };

  return (
    <PageShell>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-white">
            {pageTitle}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{pageSubtitle}</p>
        </div>
        <Link
          to="/submit"
          className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <FilePlus2 className="w-3.5 h-3.5" />
          <span>Submit Complaint</span>
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search reference ID, title, or location..."
            aria-label="Filter complaints by keyword"
            className="w-full h-9 pl-9 pr-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        {presetStatus === 'All' && (
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-lg text-xs font-medium bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800"
          >
            <option value="All">Status: All</option>
            <option value="Draft">Draft</option>
            <option value="Submitted">Submitted</option>
            <option value="Under Review">Under Review</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Awaiting Response">Awaiting Response</option>
            <option value="Resolved">Resolved</option>
            <option value="Rejected">Rejected</option>
            <option value="Reopened">Reopened</option>
            <option value="Escalated">Escalated</option>
          </select>
        )}

        <select
          aria-label="Filter by priority"
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value);
            setPage(1);
          }}
          className="h-9 px-3 rounded-lg text-xs font-medium bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              Priority: {p}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="h-9 px-3 rounded-lg text-xs font-medium bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              Category: {c}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by department"
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value);
            setPage(1);
          }}
          className="h-9 px-3 rounded-lg text-xs font-medium bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800"
        >
          <option value="All">Department: All</option>
          {(deptData?.departments || []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort complaints"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="h-9 px-3 rounded-lg text-xs font-medium bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800"
        >
          <option value="createdAt">Sort: Newest</option>
          <option value="priority">Sort: Priority</option>
          <option value="slaDeadline">Sort: SLA Deadline</option>
          <option value="updatedAt">Sort: Last Updated</option>
        </select>

        {(search || priority !== 'All' || category !== 'All' || departmentId !== 'All') && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="h-9 px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Reset
          </button>
        )}
      </div>

      {/* Complaints Data Table */}
      <div className="rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={7} />
        ) : complaints.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">No complaints match your current view</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Adjust your filters or register a new institutional complaint to begin tracking.
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleResetFilters}
                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Clear Filters
              </button>
              <Link
                to="/submit"
                className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center"
              >
                Submit Complaint
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Complaint</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Assigned Staff</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">SLA Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-sm">
                {complaints.map((c, idx) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.18) }}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      <Link to={`/complaints/detail/${c.id}`} className="hover:underline">
                        {c.referenceId}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 max-w-[320px]">
                      <Link
                        to={`/complaints/detail/${c.id}`}
                        className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1"
                      >
                        {c.title}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span>{c.category}</span>
                        <span>·</span>
                        <span className="truncate">{c.isAnonymous ? 'Anonymous' : c.submittedByName}</span>
                        {c.attachmentsCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5 font-mono">
                              <Paperclip className="w-3 h-3" />
                              {c.attachmentsCount}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {c.departmentName}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {c.assignedStaffName || 'Unassigned'}
                    </td>
                    <td className="py-3.5 px-4">
                      <PriorityText priority={c.priority} />
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusText status={c.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <SlaLabel sla={c.sla} />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono tabular-nums">
            Showing {complaints.length} of {pagination.total} complaints
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="font-mono tabular-nums px-2">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
