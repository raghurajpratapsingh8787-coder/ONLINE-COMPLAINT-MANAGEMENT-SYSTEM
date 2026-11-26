import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileUp,
  Save,
  Shield,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { useToast } from '../context/ToastContext';
import {
  ComplaintCategory,
  ComplaintItem,
  ComplaintPriority,
  ContactPreference,
  DepartmentItem,
} from '../types';
import { PageShell } from '../components/ui/MotionPrimitives';

const CATEGORIES: ComplaintCategory[] = [
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

const PRIORITIES: ComplaintPriority[] = ['Low', 'Medium', 'High', 'Critical'];
const CONTACTS: ContactPreference[] = ['Email', 'Phone', 'In-App Only', 'Anonymous'];

export default function SubmitComplaintPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdComplaint, setCreatedComplaint] = useState<ComplaintItem | null>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ComplaintCategory>('Technical');
  const [departmentId, setDepartmentId] = useState('');
  const [priority, setPriority] = useState<ComplaintPriority>('Medium');
  const [location, setLocation] = useState('');
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 16));
  const [contactPreference, setContactPreference] = useState<ContactPreference>('Email');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiRequest<{ departments: DepartmentItem[] }>('/api/departments'),
  });

  const activeDepts = (deptData?.departments || []).filter((d) => d.status === 'Active');
  const selectedDeptId = departmentId || activeDepts[0]?.id || '';
  const selectedDept = activeDepts.find((d) => d.id === selectedDeptId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []);
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    const valid: File[] = [];
    for (const f of incoming) {
      if (!allowed.includes(f.type)) {
        setError(`Unsupported file "${f.name}". Only JPG, PNG, and PDF files are accepted.`);
        continue;
      }
      if (f.size > 5 * 1024 * 1024) {
        setError(`File "${f.name}" exceeds the 5 MB upload limit.`);
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => [...prev, ...valid].slice(0, 5));
    e.target.value = '';
  };

  const validateStep1 = () => {
    if (title.trim().length < 5) {
      setError('Complaint title must be at least 5 characters.');
      return false;
    }
    if (description.trim().length < 20) {
      setError('Please provide a detailed description (at least 20 characters).');
      return false;
    }
    if (!selectedDeptId) {
      setError('Select a target department.');
      return false;
    }
    setError('');
    return true;
  };

  const validateStep2 = () => {
    if (location.trim().length < 2) {
      setError('Incident location is required.');
      return false;
    }
    if (!incidentDate) {
      setError('Incident date and time is required.');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async (saveAsDraft: boolean) => {
    if (!validateStep1() || !validateStep2()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiRequest<{ complaint: ComplaintItem }>('/api/complaints', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          departmentId: selectedDeptId,
          priority,
          location: location.trim(),
          incidentDate: new Date(incidentDate).toISOString(),
          contactPreference: isAnonymous ? 'Anonymous' : contactPreference,
          isAnonymous,
          saveAsDraft,
        }),
      });

      // Upload attached evidence files sequentially
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        await apiRequest(`/api/attachments/complaints/${res.complaint.id}`, {
          method: 'POST',
          body: fd,
        });
      }

      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });

      setCreatedComplaint(res.complaint);
      toast(saveAsDraft ? 'Draft saved' : 'Complaint submitted', {
        description: `Reference ID: ${res.complaint.referenceId}`,
        variant: 'success',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (createdComplaint) {
    return (
      <PageShell>
        <div className="max-w-2xl mx-auto py-8">
          <div className="rounded-2xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 p-8 text-center space-y-5">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                {createdComplaint.referenceId}
              </p>
              <h1 className="text-2xl font-display font-bold">
                {createdComplaint.status === 'Draft' ? 'Complaint Draft Saved' : 'Complaint Officially Registered'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                Your reference number has been generated and logged with SLA target{' '}
                <span className="font-mono">{new Date(createdComplaint.slaDeadline).toLocaleString()}</span>.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                to={`/complaints/detail/${createdComplaint.id}`}
                className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                Open Case Dossier <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => navigate('/complaints')}
                className="h-10 px-5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                Return to Queue
              </button>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Submit New Complaint</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Complete the guided intake form to generate a tracked institutional reference number.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { num: 1, label: '01. Core Details' },
            { num: 2, label: '02. Location & Privacy' },
            { num: 3, label: '03. Evidence & Review' },
          ].map((item) => (
            <button
              key={item.num}
              type="button"
              onClick={() => {
                if (item.num === 1) setStep(1);
                else if (item.num === 2 && validateStep1()) setStep(2);
                else if (item.num === 3 && validateStep1() && validateStep2()) setStep(3);
              }}
              className={`py-2.5 px-3 rounded-lg text-left text-xs font-semibold border transition-colors ${
                step === item.num
                  ? 'bg-blue-600 text-white border-blue-600'
                  : step > item.num
                    ? 'bg-white dark:bg-[#0F1629] text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                    : 'bg-white dark:bg-[#0F1629] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 p-6 sm:p-8 space-y-6">
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/70 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {step === 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              <div>
                <label htmlFor="cmp-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Complaint Title *
                </label>
                <input
                  id="cmp-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={180}
                  placeholder="Concise summary of the grievance or incident"
                  className="w-full h-10 px-3.5 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="cmp-category" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Category *
                  </label>
                  <select
                    id="cmp-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                    className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="cmp-dept" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Target Department *
                  </label>
                  <select
                    id="cmp-dept"
                    value={selectedDeptId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
                  >
                    {activeDepts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="cmp-priority" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Priority Level *
                  </label>
                  <select
                    id="cmp-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as ComplaintPriority)}
                    className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="cmp-desc" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Detailed Description * (min 20 chars)
                  </label>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {description.length} / 4000
                  </span>
                </div>
                <textarea
                  id="cmp-desc"
                  rows={5}
                  maxLength={4000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what happened, affected systems or individuals, and any prior steps taken..."
                  className="w-full p-3.5 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (validateStep1()) setStep(2);
                  }}
                  className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cmp-loc" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Incident Location *
                  </label>
                  <input
                    id="cmp-loc"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Engineering Block B, Room 204"
                    className="w-full h-10 px-3.5 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
                  />
                </div>

                <div>
                  <label htmlFor="cmp-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Incident Date & Time *
                  </label>
                  <input
                    id="cmp-date"
                    type="datetime-local"
                    value={incidentDate}
                    onChange={(e) => setIncidentDate(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg text-sm font-mono bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cmp-contact" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Contact Preference
                </label>
                <select
                  id="cmp-contact"
                  disabled={isAnonymous}
                  value={isAnonymous ? 'Anonymous' : contactPreference}
                  onChange={(e) => setContactPreference(e.target.value as ContactPreference)}
                  className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 disabled:opacity-60"
                >
                  {CONTACTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="mt-1 rounded border-slate-300"
                />
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Submit Anonymously
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Your name and email will be masked from department handlers and public tracking views while keeping you able to track progress inside your account.
                  </p>
                </div>
              </label>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (validateStep2()) setStep(3);
                  }}
                  className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  Review & Evidence <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Supporting Evidence (Optional · JPG, PNG, PDF up to 5 MB each)
                </label>
                <label className="flex flex-col items-center justify-center p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 bg-slate-50/70 dark:bg-[#090E1A] cursor-pointer transition-colors">
                  <FileUp className="w-5 h-5 text-blue-600 dark:text-blue-400 mb-1.5" />
                  <span className="text-xs font-semibold">Click to select evidence files</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Stored securely outside public web roots with signature verification
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>

                {files.length > 0 && (
                  <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {files.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="truncate font-medium">{f.name}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono text-slate-400">{Math.round(f.size / 1024)} KB</span>
                          <button
                            type="button"
                            aria-label={`Remove ${f.name}`}
                            onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                            className="text-red-500 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Structured Review Summary */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#090E1A] border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Submission Review</h2>
                <div className="grid sm:grid-cols-2 gap-2">
                  <p><span className="text-slate-500">Title:</span> <span className="font-medium">{title}</span></p>
                  <p><span className="text-slate-500">Category:</span> <span className="font-medium">{category}</span></p>
                  <p><span className="text-slate-500">Department:</span> <span className="font-medium">{selectedDept?.name}</span></p>
                  <p><span className="text-slate-500">Priority:</span> <span className="font-medium">{priority}</span></p>
                  <p><span className="text-slate-500">Location:</span> <span className="font-medium">{location}</span></p>
                  <p><span className="text-slate-500">Identity:</span> <span className="font-medium">{isAnonymous ? 'Anonymous (Protected)' : contactPreference}</span></p>
                </div>
                <p className="pt-2 border-t border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  {description}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSubmit(true)}
                    className="h-10 px-4 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Draft
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSubmit(false)}
                    className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2"
                  >
                    <span>{submitting ? 'Submitting...' : 'Submit Complaint'}</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
