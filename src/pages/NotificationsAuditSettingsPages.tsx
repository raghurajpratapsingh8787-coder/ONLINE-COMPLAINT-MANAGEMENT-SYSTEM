import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  KeyRound,
  Play,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../services/api';
import { AuditLogItem, NotificationItem, SafeUser, SLAPolicyItem } from '../types';
import { PageShell, PriorityText, TableSkeleton } from '../components/ui/MotionPrimitives';

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications'),
  });

  const handleMarkRead = async (id: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const handleMarkAll = async () => {
    await apiRequest('/api/notifications/read-all', { method: 'POST' });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    toast('All notifications marked read', { variant: 'success' });
  };

  return (
    <PageShell>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Notification Center</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time alerts for submissions, assignments, status changes, and SLA escalations.
          </p>
        </div>
        {(data?.unreadCount || 0) > 0 && (
          <button
            type="button"
            onClick={handleMarkAll}
            className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <CheckCheck className="w-4 h-4" /> Mark All Read
          </button>
        )}
      </div>

      <div className="rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={5} />
        ) : (data?.notifications || []).length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400">
            No notifications recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {(data?.notifications || []).map((n) => (
              <div
                key={n.id}
                className={`px-5 py-4 flex items-start justify-between gap-4 ${
                  !n.isRead ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{n.title}</p>
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{n.message}</p>
                    {n.complaintId && (
                      <Link
                        to={`/complaints/detail/${n.complaintId}`}
                        className="inline-block text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline mt-1.5"
                      >
                        Inspect {n.referenceId || 'Complaint'} →
                      </Link>
                    )}
                  </div>
                </div>
                {!n.isRead && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(n.id)}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
                  >
                    Mark read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

export function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('All');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', search, entityType],
    queryFn: () =>
      apiRequest<{ logs: AuditLogItem[] }>(
        `/api/audit-logs?search=${encodeURIComponent(search)}&entityType=${encodeURIComponent(entityType)}`
      ),
  });

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Security & Administrative Audit Logs</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Immutable operational trail of authentication events, assignments, status decisions, and policy updates.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by actor, action, or complaint reference..."
            aria-label="Filter audit logs"
            className="w-full h-9 pl-9 pr-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800"
          />
        </div>
        <select
          aria-label="Filter entity type"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="h-9 px-3 rounded-lg text-xs font-medium bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800"
        >
          <option value="All">Entity: All</option>
          <option value="Complaint">Complaint</option>
          <option value="User">User</option>
          <option value="Department">Department</option>
          <option value="SLAPolicy">SLAPolicy</option>
          <option value="ComplaintAttachment">Attachment</option>
          <option value="Session">Session</option>
        </select>
      </div>

      <div className="rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={7} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                {(data?.logs || []).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{log.actorName}</span>
                      <span className="text-slate-400 ml-1.5">({log.actorRole})</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {log.entityType} · {log.entityId}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 max-w-md">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}

export function SettingsSlaPage() {
  const { user, bootstrap } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['sla-policies'],
    queryFn: () => apiRequest<{ policies: SLAPolicyItem[] }>('/api/sla-policies'),
  });

  const [drafts, setDrafts] = useState<SLAPolicyItem[]>([]);
  const [sweeping, setSweeping] = useState(false);

  useEffect(() => {
    if (data?.policies) setDrafts(data.policies);
  }, [data?.policies]);

  const handleSavePolicy = async (policy: SLAPolicyItem) => {
    try {
      await apiRequest('/api/sla-policies', {
        method: 'PUT',
        body: JSON.stringify({
          priority: policy.priority,
          responseTargetHours: Number(policy.responseTargetHours),
          resolutionTargetHours: Number(policy.resolutionTargetHours),
          autoEscalateOnBreach: policy.autoEscalateOnBreach,
          escalateToRole: policy.escalateToRole,
        }),
      });
      void queryClient.invalidateQueries({ queryKey: ['sla-policies'] });
      toast(`${policy.priority} SLA policy updated`, { variant: 'success' });
    } catch (err) {
      toast('Policy update failed', { description: (err as Error).message, variant: 'error' });
    }
  };

  const handleRunSweep = async () => {
    setSweeping(true);
    try {
      const res = await apiRequest<{ checked: number; escalated: number }>('/api/sla-policies/run-sweep', {
        method: 'POST',
      });
      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast('SLA Escalation Sweep Complete', {
        description: `Evaluated ${res.checked} open cases · ${res.escalated} newly escalated.`,
        variant: 'info',
      });
    } catch (err) {
      toast('Sweep failed', { description: (err as Error).message, variant: 'error' });
    } finally {
      setSweeping(false);
    }
  };

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  return (
    <PageShell>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">SLA Policies & System Configuration</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure priority resolution targets, automated escalation routing, and external infrastructure integrations.
          </p>
        </div>
        <button
          type="button"
          disabled={sweeping}
          onClick={handleRunSweep}
          className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Play className="w-3.5 h-3.5" /> {sweeping ? 'Scanning...' : 'Run SLA Escalation Check'}
        </button>
      </div>

      <section className="rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800/80">
          <h2 className="text-sm font-semibold">Configurable Priority SLA Targets</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {drafts.map((policy, idx) => (
            <div key={policy.id} className="p-5 grid md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-2">
                <span className="block text-[11px] text-slate-400 mb-1">Priority</span>
                <PriorityText priority={policy.priority} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Response (Hours)</label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  disabled={!isSuperAdmin}
                  value={policy.responseTargetHours}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...policy, responseTargetHours: Number(e.target.value) };
                    setDrafts(next);
                  }}
                  className="w-full h-9 px-3 rounded-lg text-sm font-mono bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Resolution (Hours)</label>
                <input
                  type="number"
                  min={1}
                  max={2160}
                  disabled={!isSuperAdmin}
                  value={policy.resolutionTargetHours}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...policy, resolutionTargetHours: Number(e.target.value) };
                    setDrafts(next);
                  }}
                  className="w-full h-9 px-3 rounded-lg text-sm font-mono bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Escalate To</label>
                <select
                  disabled={!isSuperAdmin}
                  value={policy.escalateToRole}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = {
                      ...policy,
                      escalateToRole: e.target.value as 'DEPARTMENT_ADMIN' | 'SUPER_ADMIN',
                    };
                    setDrafts(next);
                  }}
                  className="w-full h-9 px-2.5 rounded-lg text-xs bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
                >
                  <option value="SUPER_ADMIN">Super Admin</option>
                  <option value="DEPARTMENT_ADMIN">Department Admin</option>
                </select>
              </div>
              <div className="md:col-span-2 flex items-center h-9">
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={policy.autoEscalateOnBreach}
                    onChange={(e) => {
                      const next = [...drafts];
                      next[idx] = { ...policy, autoEscalateOnBreach: e.target.checked };
                      setDrafts(next);
                    }}
                  />
                  <span>Auto-escalate</span>
                </label>
              </div>
              <div className="md:col-span-2 text-right">
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => handleSavePolicy(policy)}
                    className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" /> Save
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="p-6 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-3">
        <h2 className="text-sm font-semibold">External Service Configuration</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800 space-y-1">
            <p className="font-semibold text-slate-900 dark:text-white">MongoDB Persistence Engine</p>
            <p className="text-slate-600 dark:text-slate-400">
              Active Mode:{' '}
              <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                {bootstrap?.databaseMode === 'mongodb' ? 'Connected MongoDB (Mongoose)' : 'Local Persistent Store (Mongoose Ready)'}
              </span>
            </p>
            <p className="text-slate-500">
              Set <code className="font-mono">MONGODB_URI</code> in your environment secrets to connect directly to MongoDB Atlas or self-hosted MongoDB.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800 space-y-1">
            <p className="font-semibold text-slate-900 dark:text-white">Nodemailer SMTP Delivery</p>
            <p className="text-slate-600 dark:text-slate-400">
              Status:{' '}
              <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                {bootstrap?.smtpConfigured ? 'SMTP Active' : 'In-App Notifications Active (SMTP Optional)'}
              </span>
            </p>
            <p className="text-slate-500">
              Configure <code className="font-mono">SMTP_HOST</code>, <code className="font-mono">SMTP_USER</code>, and <code className="font-mono">SMTP_PASS</code> in <code className="font-mono">.env</code> to enable outbound email alerts.
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

export function ProfilePage() {
  const { user, updateUserLocal } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [title, setTitle] = useState(user?.title || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const { data: sessionData } = useQuery({
    queryKey: ['sessions'],
    queryFn: () =>
      apiRequest<{
        sessions: Array<{
          id: string;
          userAgent: string;
          ipAddress: string;
          createdAt: string;
          expiresAt: string;
          isCurrent: boolean;
        }>;
      }>('/api/auth/sessions'),
  });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ user: SafeUser }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, phone, title }),
      });
      updateUserLocal(res.user);
      toast('Profile updated', { variant: 'success' });
    } catch (err) {
      toast('Update failed', { description: (err as Error).message, variant: 'error' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      toast('Password updated successfully', { variant: 'success' });
    } catch (err) {
      toast('Password update failed', { description: (err as Error).message, variant: 'error' });
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    await apiRequest(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' });
    void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    toast('Session revoked', { variant: 'info' });
  };

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Profile & Account Security</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage your personal details, credentials, and active refresh sessions.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-6 p-6 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-4"
        >
          <div className="flex items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-blue-600 text-white text-lg font-bold flex items-center justify-center">
                {(user?.name || 'U').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-base font-display font-bold">{user?.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {user?.email} · {user?.role.replace('_', ' ')}
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="prof-name" className="block text-xs font-semibold mb-1">Full Name</label>
            <input
              id="prof-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label htmlFor="prof-title" className="block text-xs font-semibold mb-1">Title / Affiliation</label>
            <input
              id="prof-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label htmlFor="prof-phone" className="block text-xs font-semibold mb-1">Phone</label>
            <input
              id="prof-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            />
          </div>
          <button type="submit" className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
            Save Profile
          </button>
        </form>

        <div className="lg:col-span-6 space-y-6">
          <form
            onSubmit={handleChangePassword}
            className="p-6 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-4"
          >
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Change Password
            </h2>
            <div>
              <label htmlFor="cur-pass" className="block text-xs font-semibold mb-1">Current Password</label>
              <input
                id="cur-pass"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
              />
            </div>
            <div>
              <label htmlFor="new-pass" className="block text-xs font-semibold mb-1">New Password</label>
              <input
                id="new-pass"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars, 1 uppercase, 1 digit"
                className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
              />
            </div>
            <button type="submit" className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold">
              Update Password
            </button>
          </form>

          <section className="p-6 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Active Sessions
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {(sessionData?.sessions || []).map((s) => (
                <div key={s.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {s.isCurrent ? 'Current Browser Session' : 'Authenticated Device'}
                    </p>
                    <p className="text-slate-500 truncate font-mono text-[11px]">
                      {s.ipAddress} · Started {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!s.isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.id)}
                      aria-label="Revoke session"
                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
