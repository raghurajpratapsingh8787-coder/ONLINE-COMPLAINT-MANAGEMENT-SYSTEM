import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Edit3, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../services/api';
import { DepartmentItem, StaffItem } from '../types';
import { ModalDialog, PageShell, TableSkeleton } from '../components/ui/MotionPrimitives';

export default function DepartmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentItem | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [headUserId, setHeadUserId] = useState('');
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');
  const [saving, setSaving] = useState(false);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const { data, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiRequest<{ departments: DepartmentItem[] }>('/api/departments'),
  });

  const { data: staffData } = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiRequest<{ staff: StaffItem[] }>('/api/staff'),
    enabled: isSuperAdmin,
  });

  const openCreate = () => {
    setEditing(null);
    setName('');
    setCode('');
    setDescription('');
    setHeadUserId('');
    setStatus('Active');
    setModalOpen(true);
  };

  const openEdit = (dept: DepartmentItem) => {
    setEditing(dept);
    setName(dept.name);
    setCode(dept.code);
    setDescription(dept.description);
    setHeadUserId(dept.headUserId || '');
    setStatus(dept.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        code,
        description,
        headUserId: headUserId || null,
        status,
      };
      if (editing) {
        await apiRequest(`/api/departments/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        toast('Department updated', { variant: 'success' });
      } else {
        await apiRequest('/api/departments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast('Department created', { variant: 'success' });
      }
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
    } catch (err) {
      toast('Operation failed', { description: (err as Error).message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dept: DepartmentItem) => {
    try {
      await apiRequest(`/api/departments/${dept.id}`, { method: 'DELETE' });
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast(`Deleted ${dept.name}`, { variant: 'info' });
    } catch (err) {
      toast('Cannot delete department', { description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <PageShell>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Departments</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage institutional units, department heads, active caseloads, and routing codes.
          </p>
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Create Department
          </button>
        )}
      </div>

      <div className="rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={6} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Department Head</th>
                  <th className="py-3 px-4 text-right">Staff</th>
                  <th className="py-3 px-4 text-right">Active Cases</th>
                  <th className="py-3 px-4 text-right">Resolved</th>
                  <th className="py-3 px-4">Status</th>
                  {isSuperAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-sm">
                {(data?.departments || []).map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                      {d.code}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{d.name}</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{d.description}</p>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700 dark:text-slate-300">{d.headName}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">{d.staffCount}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {d.activeComplaints}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                      {d.resolvedComplaints}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold">
                      <span className={d.status === 'Active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                        {d.status}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(d)}
                          aria-label={`Edit ${d.name}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(d)}
                          aria-label={`Delete ${d.name}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Create Department'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="dept-name" className="block text-xs font-semibold mb-1.5">Department Name *</label>
              <input
                id="dept-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
              />
            </div>
            <div>
              <label htmlFor="dept-code" className="block text-xs font-semibold mb-1.5">Code *</label>
              <input
                id="dept-code"
                required
                maxLength={16}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. LIBR"
                className="w-full h-10 px-3 rounded-lg text-sm font-mono uppercase bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
              />
            </div>
          </div>

          <div>
            <label htmlFor="dept-desc" className="block text-xs font-semibold mb-1.5">Description *</label>
            <textarea
              id="dept-desc"
              required
              minLength={10}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="dept-head" className="block text-xs font-semibold mb-1.5">Department Head</label>
              <select
                id="dept-head"
                value={headUserId}
                onChange={(e) => setHeadUserId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
              >
                <option value="">Unassigned</option>
                {(staffData?.staff || []).map((s) => (
                  <option key={s.userId} value={s.userId}>{s.name} ({s.designation})</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dept-status" className="block text-xs font-semibold mb-1.5">Status</label>
              <select
                id="dept-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'Active' | 'Inactive')}
                className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
              {saving ? 'Saving...' : editing ? 'Update Department' : 'Create Department'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </PageShell>
  );
}
