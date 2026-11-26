import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCheck, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../services/api';
import { DepartmentItem, StaffItem, UserRole } from '../types';
import { ModalDialog, PageShell, TableSkeleton } from '../components/ui/MotionPrimitives';

export function StaffManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'STAFF' | 'DEPARTMENT_ADMIN'>('STAFF');
  const [departmentId, setDepartmentId] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiRequest<{ staff: StaffItem[] }>('/api/staff'),
  });

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiRequest<{ departments: DepartmentItem[] }>('/api/departments'),
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          role: user?.role === 'DEPARTMENT_ADMIN' ? 'STAFF' : role,
          departmentId: user?.role === 'DEPARTMENT_ADMIN' ? user.departmentId : departmentId || deptData?.departments[0]?.id,
          employeeCode,
          designation,
          phone,
        }),
      });
      setModalOpen(false);
      setName('');
      setEmail('');
      setPassword('');
      setEmployeeCode('');
      setDesignation('');
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast('Staff member onboarded', { variant: 'success' });
    } catch (err) {
      toast('Onboarding failed', { description: (err as Error).message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Staff Management & Workload</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Monitor handler capacity, active queues, overdue cases, and average resolution turnaround.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDepartmentId(user?.departmentId || deptData?.departments[0]?.id || '');
            setModalOpen(true);
          }}
          className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Onboard Staff
        </button>
      </div>

      <div className="rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={6} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4 text-right">Assigned</th>
                  <th className="py-3 px-4 text-right">Pending</th>
                  <th className="py-3 px-4 text-right">Resolved</th>
                  <th className="py-3 px-4 text-right">Overdue</th>
                  <th className="py-3 px-4 text-right">Avg Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-sm">
                {(data?.staff || []).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>{s.name}</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{s.employeeCode}</span> · {s.designation}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700 dark:text-slate-300">
                      {s.departmentName}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-600 dark:text-slate-400">
                      {s.role.replace('_', ' ')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">{s.workload.assigned}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {s.workload.pending}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                      {s.workload.resolved}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
                      {s.workload.overdue}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                      {s.workload.avgResolutionHours}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalDialog open={modalOpen} onClose={() => setModalOpen(false)} title="Onboard Staff Member">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="st-name" className="block text-xs font-semibold mb-1">Full Name *</label>
              <input id="st-name" required value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700" />
            </div>
            <div>
              <label htmlFor="st-code" className="block text-xs font-semibold mb-1">Employee Code *</label>
              <input id="st-code" required value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="EMP-1042" className="w-full h-10 px-3 rounded-lg text-sm font-mono bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="st-email" className="block text-xs font-semibold mb-1">Email *</label>
              <input id="st-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700" />
            </div>
            <div>
              <label htmlFor="st-pass" className="block text-xs font-semibold mb-1">Initial Password *</label>
              <input id="st-pass" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars, 1 upper, 1 digit" className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="st-dept" className="block text-xs font-semibold mb-1">Department *</label>
              <select id="st-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={user?.role === 'DEPARTMENT_ADMIN'} className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700">
                {(deptData?.departments || []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="st-role" className="block text-xs font-semibold mb-1">Role *</label>
              <select id="st-role" value={role} onChange={(e) => setRole(e.target.value as 'STAFF' | 'DEPARTMENT_ADMIN')} disabled={user?.role === 'DEPARTMENT_ADMIN'} className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700">
                <option value="STAFF">Staff Handler</option>
                {user?.role === 'SUPER_ADMIN' && <option value="DEPARTMENT_ADMIN">Department Admin</option>}
              </select>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="st-desig" className="block text-xs font-semibold mb-1">Designation *</label>
              <input id="st-desig" required value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Facilities Engineer" className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700" />
            </div>
            <div>
              <label htmlFor="st-phone" className="block text-xs font-semibold mb-1">Phone</label>
              <input id="st-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold">Cancel</button>
            <button type="submit" disabled={saving} className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
              {saving ? 'Onboarding...' : 'Create Staff Account'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </PageShell>
  );
}

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  departmentName: string;
  title: string;
  isEmailVerified: boolean;
  isActive: boolean;
  filedCount: number;
  createdAt: string;
}

export function UsersManagementPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiRequest<{ users: AdminUserRow[] }>('/api/users'),
  });

  const handleUpdateUser = async (id: string, body: { role?: UserRole; isActive?: boolean }) => {
    try {
      await apiRequest(`/api/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast('User access updated', { variant: 'success' });
    } catch (err) {
      toast('Update failed', { description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Users & Access Control</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Super Admin role governance across administrators, department handlers, and institutional members.
        </p>
      </div>

      <div className="rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={6} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4 text-right">Filed Cases</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Account Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-sm">
                {(data?.users || []).map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{u.name}</span>
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">{u.departmentName}</td>
                      <td className="py-3.5 px-4">
                        <select
                          aria-label={`Role for ${u.name}`}
                          disabled={isSelf}
                          value={u.role}
                          onChange={(e) => handleUpdateUser(u.id, { role: e.target.value as UserRole })}
                          className="h-8 px-2.5 rounded-lg text-xs font-medium bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800 disabled:opacity-60"
                        >
                          <option value="SUPER_ADMIN">Super Admin</option>
                          <option value="DEPARTMENT_ADMIN">Department Admin</option>
                          <option value="STAFF">Staff</option>
                          <option value="USER">User</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">{u.filedCount}</td>
                      <td className="py-3.5 px-4 text-xs font-semibold">
                        <span className={u.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                          {u.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => handleUpdateUser(u.id, { isActive: !u.isActive })}
                          className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {u.isActive ? 'Suspend' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
