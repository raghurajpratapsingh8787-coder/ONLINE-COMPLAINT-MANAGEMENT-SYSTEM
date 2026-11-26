import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Lock,
  Paperclip,
  Send,
  Star,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetchBlob, apiRequest } from '../services/api';
import {
  AttachmentItem,
  CommentItem,
  ComplaintItem,
  ComplaintPriority,
  ComplaintStatus,
  DepartmentItem,
  StaffItem,
  TimelineEntry,
} from '../types';
import {
  ModalDialog,
  PageShell,
  PriorityText,
  SlaLabel,
  StatusText,
} from '../components/ui/MotionPrimitives';

interface DetailResponse {
  complaint: ComplaintItem;
  timeline: TimelineEntry[];
  comments: CommentItem[];
  attachments: AttachmentItem[];
  assignments: Array<{
    id: string;
    assignedToName: string;
    assignedByName: string;
    departmentName: string;
    notes: string;
    createdAt: string;
  }>;
  escalations: Array<{
    id: string;
    level: number;
    type: 'AUTOMATIC' | 'MANUAL';
    reason: string;
    escalatedByName: string;
    escalatedToName: string;
    createdAt: string;
  }>;
  feedback: { id: string; rating: number; comment: string; createdAt: string } | null;
}

const NEXT_STATUSES: Record<ComplaintStatus, ComplaintStatus[]> = {
  Draft: ['Submitted'],
  Submitted: ['Under Review', 'Assigned', 'Rejected'],
  'Under Review': ['Assigned', 'In Progress', 'Awaiting Response', 'Rejected'],
  Assigned: ['In Progress', 'Awaiting Response', 'Resolved', 'Rejected'],
  'In Progress': ['Awaiting Response', 'Resolved', 'Rejected'],
  'Awaiting Response': ['In Progress', 'Resolved', 'Rejected'],
  Resolved: ['Reopened'],
  Rejected: ['Reopened'],
  Reopened: ['Under Review', 'Assigned', 'In Progress', 'Resolved'],
  Escalated: ['Under Review', 'Assigned', 'In Progress', 'Awaiting Response', 'Resolved', 'Rejected'],
};

export default function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, socket } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Comment state
  const [commentBody, setCommentBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isInfoRequest, setIsInfoRequest] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  // Assignment modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignDeptId, setAssignDeptId] = useState('');
  const [assignStaffId, setAssignStaffId] = useState('');
  const [assignPriority, setAssignPriority] = useState<ComplaintPriority>('Medium');
  const [assignNotes, setAssignNotes] = useState('');

  // Status transition modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<ComplaintStatus>('In Progress');
  const [statusNote, setStatusNote] = useState('');

  // Escalation modal
  const [escalateModalOpen, setEscalateModalOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');

  // Preview modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>('');
  const [previewName, setPreviewName] = useState<string>('');

  // Feedback
  const [rating, setRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');

  const isStaffOrAdmin = user?.role !== 'USER';
  const canAssign = user?.role === 'SUPER_ADMIN' || user?.role === 'DEPARTMENT_ADMIN';

  const { data, isLoading, error } = useQuery({
    queryKey: ['complaint', id],
    queryFn: () => apiRequest<DetailResponse>(`/api/complaints/${id}`),
    enabled: Boolean(id),
  });

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiRequest<{ departments: DepartmentItem[] }>('/api/departments'),
    enabled: canAssign,
  });

  const { data: staffData } = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiRequest<{ staff: StaffItem[] }>('/api/staff'),
    enabled: isStaffOrAdmin,
  });

  // Join Socket.IO complaint room for live updates
  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('complaint:join', id);
    return () => {
      socket.emit('complaint:leave', id);
    };
  }, [socket, id]);

  useEffect(() => {
    if (data?.complaint) {
      setAssignDeptId(data.complaint.departmentId);
      setAssignStaffId(data.complaint.assignedStaffId || '');
      setAssignPriority(data.complaint.priority);
    }
  }, [data?.complaint]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['complaint', id] });
    void queryClient.invalidateQueries({ queryKey: ['complaints'] });
    void queryClient.invalidateQueries({ queryKey: ['analytics'] });
  };

  if (isLoading) {
    return (
      <PageShell>
        <div className="h-48 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800 animate-pulse" />
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell>
        <div className="p-8 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
            {(error as Error)?.message || 'Unable to load complaint details.'}
          </p>
          <Link to="/complaints" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Back to Complaints
          </Link>
        </div>
      </PageShell>
    );
  }

  const { complaint, timeline, comments, attachments, escalations, feedback } = data;
  const availableTransitions = (NEXT_STATUSES[complaint.status] || []).filter((next) => {
    if (user?.role === 'USER') {
      return (complaint.status === 'Draft' && next === 'Submitted') || next === 'Reopened';
    }
    return true;
  });

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPostingComment(true);
    try {
      await apiRequest(`/api/complaints/${complaint.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          body: commentBody.trim(),
          isInternal: isStaffOrAdmin ? isInternal : false,
          isInfoRequest: isStaffOrAdmin ? isInfoRequest : false,
        }),
      });
      setCommentBody('');
      setIsInternal(false);
      setIsInfoRequest(false);
      invalidate();
      toast('Message posted', { variant: 'success' });
    } catch (err) {
      toast('Failed to post message', { description: (err as Error).message, variant: 'error' });
    } finally {
      setPostingComment(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(`/api/complaints/${complaint.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          departmentId: assignDeptId,
          assignedStaffId: assignStaffId || null,
          priority: assignPriority,
          notes: assignNotes,
        }),
      });
      setAssignModalOpen(false);
      setAssignNotes('');
      invalidate();
      toast('Assignment updated', { variant: 'success' });
    } catch (err) {
      toast('Assignment failed', { description: (err as Error).message, variant: 'error' });
    }
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, string> = { status: targetStatus, comment: statusNote };
      if (targetStatus === 'Resolved') payload.resolutionSummary = statusNote;
      if (targetStatus === 'Rejected' || targetStatus === 'Reopened') payload.reason = statusNote;

      await apiRequest(`/api/complaints/${complaint.id}/status`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setStatusModalOpen(false);
      setStatusNote('');
      invalidate();
      toast(`Status updated to ${targetStatus}`, { variant: 'success' });
    } catch (err) {
      toast('Status update rejected', { description: (err as Error).message, variant: 'error' });
    }
  };

  const handleEscalateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(`/api/complaints/${complaint.id}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ reason: escalateReason }),
      });
      setEscalateModalOpen(false);
      setEscalateReason('');
      invalidate();
      toast('Complaint escalated', { variant: 'info' });
    } catch (err) {
      toast('Escalation failed', { description: (err as Error).message, variant: 'error' });
    }
  };

  const handleUploadEvidence = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (isStaffOrAdmin && complaint.status === 'In Progress') {
        fd.append('isResolutionEvidence', 'true');
      }
      await apiRequest(`/api/attachments/complaints/${complaint.id}`, { method: 'POST', body: fd });
      invalidate();
      toast('Evidence uploaded securely', { description: file.name, variant: 'success' });
    } catch (err) {
      toast('Upload rejected', { description: (err as Error).message, variant: 'error' });
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadAttachment = async (att: AttachmentItem, inline = false) => {
    try {
      const { blob, contentType } = await apiFetchBlob(
        `/api/attachments/${att.id}/download${inline ? '?inline=true' : ''}`
      );
      const url = URL.createObjectURL(blob);
      if (inline) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(url);
        setPreviewType(contentType);
        setPreviewName(att.originalFilename);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = att.originalFilename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      toast('Download failed', { description: (err as Error).message, variant: 'error' });
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    try {
      await apiRequest(`/api/attachments/${attId}`, { method: 'DELETE' });
      invalidate();
      toast('Attachment removed', { variant: 'info' });
    } catch (err) {
      toast('Unable to delete attachment', { description: (err as Error).message, variant: 'error' });
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const { blob } = await apiFetchBlob(`/api/complaints/${complaint.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${complaint.referenceId}-dossier.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast('PDF export failed', { description: (err as Error).message, variant: 'error' });
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(`/api/complaints/${complaint.id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment: feedbackComment }),
      });
      invalidate();
      toast('Feedback submitted', { variant: 'success' });
    } catch (err) {
      toast('Unable to submit feedback', { description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <PageShell>
      {/* Top Action Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            to="/complaints"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Complaints
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
              {complaint.referenceId}
            </span>
            <span className="text-slate-400">·</span>
            <StatusText status={complaint.status} />
            <span className="text-slate-400">·</span>
            <PriorityText priority={complaint.priority} />
            <span className="text-slate-400">·</span>
            <SlaLabel sla={complaint.sla} />
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-white">
            {complaint.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1629] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> PDF Dossier
          </button>

          {canAssign && (
            <button
              type="button"
              onClick={() => setAssignModalOpen(true)}
              className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1629] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" /> Assign / Route
            </button>
          )}

          {isStaffOrAdmin && !['Resolved', 'Rejected'].includes(complaint.status) && (
            <button
              type="button"
              onClick={() => setEscalateModalOpen(true)}
              className="h-9 px-3.5 rounded-lg border border-red-300 dark:border-red-900/70 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Escalate
            </button>
          )}

          {availableTransitions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTargetStatus(availableTransitions[0]);
                setStatusModalOpen(true);
              }}
              className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Update Status
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left: Description, Resolution, Evidence, Real-Time Comments */}
        <div className="lg:col-span-8 space-y-6">
          <section className="p-6 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-4">
            <h2 className="text-sm font-semibold">Case Description</h2>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {complaint.description}
            </p>

            {complaint.resolutionSummary && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Resolution Summary {complaint.resolvedByName ? `· ${complaint.resolvedByName}` : ''}
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {complaint.resolutionSummary}
                </p>
              </div>
            )}

            {complaint.rejectionReason && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">Rejection Justification</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {complaint.rejectionReason}
                </p>
              </div>
            )}
          </section>

          {/* Secure Evidence Vault */}
          <section className="p-6 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">Evidence & Attachments Vault</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Authorized JPG, PNG, and PDF files (max 5 MB) stored privately outside public web roots
                </p>
              </div>
              <label className="h-8 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" /> Upload File
                <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleUploadEvidence} className="sr-only" />
              </label>
            </div>

            {attachments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                No evidence files attached yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {attachments.map((att) => (
                  <div key={att.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {att.mimeType === 'application/pdf' ? (
                        <FileText className="w-4 h-4 text-red-500 shrink-0" />
                      ) : (
                        <Paperclip className="w-4 h-4 text-blue-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{att.originalFilename}</p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {Math.max(1, Math.round(att.sizeBytes / 1024))} KB · {att.mimeType}
                          {att.isResolutionEvidence ? ' · Resolution Evidence' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(att, true)}
                        aria-label={`Preview ${att.originalFilename}`}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(att, false)}
                        aria-label={`Download ${att.originalFilename}`}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {(att.uploadedByUserId === user?.id || user?.role === 'SUPER_ADMIN') && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att.id)}
                          aria-label={`Delete ${att.originalFilename}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Real-Time Communication & Internal Staff Notes */}
          <section className="p-6 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Real-Time Case Communication</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Messages broadcast live via authenticated Socket.IO rooms. Internal notes remain strictly hidden from complainants.
              </p>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                  No messages exchanged on this case yet.
                </p>
              ) : (
                comments.map((cm) => (
                  <div
                    key={cm.id}
                    className={`p-3.5 rounded-xl border text-sm ${
                      cm.isInternal
                        ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                        : cm.isInfoRequest
                          ? 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60'
                          : 'bg-slate-50 dark:bg-[#090E1A] border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                      <div className="flex items-center gap-2 font-semibold">
                        <span>{cm.authorName}</span>
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          {cm.authorRole.replace('_', ' ')}
                        </span>
                        {cm.isInternal && (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                            <Lock className="w-3 h-3" /> Internal Staff Note
                          </span>
                        )}
                        {cm.isInfoRequest && (
                          <span className="text-blue-700 dark:text-blue-400">Additional Info Requested</span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(cm.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {cm.body}
                    </p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handlePostComment} className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <textarea
                rows={3}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={isInternal ? 'Write a private staff-only note...' : 'Write a response or status clarification...'}
                aria-label="Case comment message"
                className="w-full p-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                {isStaffOrAdmin ? (
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => {
                          setIsInternal(e.target.checked);
                          if (e.target.checked) setIsInfoRequest(false);
                        }}
                      />
                      <span>Private internal staff note</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInfoRequest}
                        onChange={(e) => {
                          setIsInfoRequest(e.target.checked);
                          if (e.target.checked) setIsInternal(false);
                        }}
                      />
                      <span>Request additional info</span>
                    </label>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">Visible to assigned department staff</span>
                )}
                <button
                  type="submit"
                  disabled={postingComment || !commentBody.trim()}
                  className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Send Message
                </button>
              </div>
            </form>
          </section>

          {/* Resolution Feedback (Visible on Resolved cases) */}
          {complaint.status === 'Resolved' && (
            <section className="p-6 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-3">
              <h2 className="text-sm font-semibold">Resolution Feedback</h2>
              {feedback ? (
                <div className="text-sm space-y-1">
                  <p className="font-mono text-amber-500 font-semibold">
                    Rating: {feedback.rating} / 5 Stars
                  </p>
                  <p className="text-slate-600 dark:text-slate-400">{feedback.comment || 'No comment provided.'}</p>
                </div>
              ) : (
                <form onSubmit={handleSubmitFeedback} className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        aria-label={`Rate ${n} out of 5`}
                        className={`p-1 ${n <= rating ? 'text-amber-500' : 'text-slate-300 dark:text-slate-700'}`}
                      >
                        <Star className="w-5 h-5 fill-current" />
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    placeholder="Share your experience with the resolution process..."
                    className="w-full p-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
                  />
                  <button
                    type="submit"
                    className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                  >
                    Submit Feedback
                  </button>
                </form>
              )}
            </section>
          )}
        </div>

        {/* Right: Metadata, SLA Progress, Visual Progress Timeline, Escalation Log */}
        <div className="lg:col-span-4 space-y-6">
          <section className="p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-4">
            <h2 className="text-sm font-semibold">Case Metadata & SLA</h2>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">SLA Window Elapsed</span>
                <SlaLabel sla={complaint.sla} />
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    complaint.sla.status === 'BREACHED'
                      ? 'bg-red-600'
                      : complaint.sla.status === 'APPROACHING'
                        ? 'bg-amber-500'
                        : 'bg-blue-600'
                  }`}
                  style={{ width: `${complaint.sla.percentElapsed}%` }}
                />
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-2.5 text-xs pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Department</dt>
                <dd className="font-medium text-right">{complaint.departmentName}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Category</dt>
                <dd className="font-medium text-right">{complaint.category}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Assigned Staff</dt>
                <dd className="font-medium text-right">{complaint.assignedStaffName || 'Unassigned'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Submitted By</dt>
                <dd className="font-medium text-right">{complaint.submittedByName}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Location</dt>
                <dd className="font-medium text-right">{complaint.location}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Incident Date</dt>
                <dd className="font-mono text-right">{new Date(complaint.incidentDate).toLocaleDateString()}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">SLA Deadline</dt>
                <dd className="font-mono text-right">{new Date(complaint.slaDeadline).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Escalation Level</dt>
                <dd className="font-mono font-semibold text-right">Level {complaint.escalationLevel}</dd>
              </div>
            </dl>
          </section>

          {/* Visual Complaint Progress Timeline */}
          <section className="p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-4">
            <h2 className="text-sm font-semibold">Progress Timeline</h2>
            <ol className="relative border-l border-slate-200 dark:border-slate-800 ml-2 space-y-4">
              {timeline.map((entry) => (
                <li key={entry.id} className="pl-4 relative">
                  <span className="w-2 h-2 rounded-full bg-blue-600 absolute -left-[4.5px] top-1.5" />
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <StatusText status={entry.toStatus} />
                    <span className="font-mono text-[10px] text-slate-400">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">{entry.description}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    By {entry.updatedByName}
                    {entry.comment ? ` · "${entry.comment}"` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {escalations.length > 0 && (
            <section className="p-5 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-3">
              <h2 className="text-sm font-semibold text-red-600 dark:text-red-400">Escalation History</h2>
              <div className="space-y-2.5 text-xs">
                {escalations.map((esc) => (
                  <div key={esc.id} className="pb-2.5 border-b last:border-0 border-slate-100 dark:border-slate-800">
                    <p className="font-semibold">
                      Level {esc.level} ({esc.type}) · {esc.escalatedByName}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">{esc.reason}</p>
                    <p className="font-mono text-[10px] text-slate-400 mt-0.5">
                      {new Date(esc.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Assign / Route Modal */}
      <ModalDialog
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Assign & Route Complaint"
        subtitle={`Update department ownership and staff handler for ${complaint.referenceId}`}
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div>
            <label htmlFor="assign-dept" className="block text-xs font-semibold mb-1.5">Department</label>
            <select
              id="assign-dept"
              value={assignDeptId}
              onChange={(e) => setAssignDeptId(e.target.value)}
              disabled={user?.role === 'DEPARTMENT_ADMIN'}
              className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            >
              {(deptData?.departments || []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="assign-staff" className="block text-xs font-semibold mb-1.5">Assigned Staff Member</label>
            <select
              id="assign-staff"
              value={assignStaffId}
              onChange={(e) => setAssignStaffId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            >
              <option value="">Unassigned (Department Queue)</option>
              {(staffData?.staff || [])
                .filter((s) => !assignDeptId || s.departmentId === assignDeptId || user?.role === 'SUPER_ADMIN')
                .map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.name} ({s.departmentCode} · {s.workload.pending} active)
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="assign-priority" className="block text-xs font-semibold mb-1.5">Priority</label>
            <select
              id="assign-priority"
              value={assignPriority}
              onChange={(e) => setAssignPriority(e.target.value as ComplaintPriority)}
              className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            >
              {(['Low', 'Medium', 'High', 'Critical'] as ComplaintPriority[]).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="assign-notes" className="block text-xs font-semibold mb-1.5">Assignment Notes</label>
            <textarea
              id="assign-notes"
              rows={3}
              value={assignNotes}
              onChange={(e) => setAssignNotes(e.target.value)}
              placeholder="Optional instructions for the assigned handler..."
              className="w-full p-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAssignModalOpen(false)} className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold">
              Cancel
            </button>
            <button type="submit" className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
              Save Assignment
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Validated Status Transition Modal */}
      <ModalDialog
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title="Update Workflow Status"
        subtitle={`Current status: ${complaint.status}`}
      >
        <form onSubmit={handleStatusSubmit} className="space-y-4">
          <div>
            <label htmlFor="next-status" className="block text-xs font-semibold mb-1.5">New Status</label>
            <select
              id="next-status"
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as ComplaintStatus)}
              className="w-full h-10 px-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            >
              {availableTransitions.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status-note" className="block text-xs font-semibold mb-1.5">
              {targetStatus === 'Resolved'
                ? 'Resolution Summary * (min 10 chars)'
                : targetStatus === 'Rejected'
                  ? 'Rejection Reason * (min 10 chars)'
                  : targetStatus === 'Reopened'
                    ? 'Reason for Reopening *'
                    : 'Transition Comment'}
            </label>
            <textarea
              id="status-note"
              rows={4}
              required={['Resolved', 'Rejected', 'Reopened'].includes(targetStatus)}
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder="Document the verified action or rationale..."
              className="w-full p-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setStatusModalOpen(false)} className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold">
              Cancel
            </button>
            <button type="submit" className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
              Confirm Transition
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Manual Escalation Modal */}
      <ModalDialog
        open={escalateModalOpen}
        onClose={() => setEscalateModalOpen(false)}
        title="Escalate Complaint"
        subtitle={`Raise ${complaint.referenceId} to Level ${complaint.escalationLevel + 1} oversight`}
      >
        <form onSubmit={handleEscalateSubmit} className="space-y-4">
          <div>
            <label htmlFor="esc-reason" className="block text-xs font-semibold mb-1.5">
              Escalation Justification * (min 10 chars)
            </label>
            <textarea
              id="esc-reason"
              rows={4}
              required
              minLength={10}
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              placeholder="Explain SLA risk, institutional impact, or blocker requiring leadership intervention..."
              className="w-full p-3 rounded-lg text-sm bg-slate-50 dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEscalateModalOpen(false)} className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold">
              Cancel
            </button>
            <button type="submit" className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold">
              Escalate Case
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Inline Evidence Preview Modal */}
      <ModalDialog
        open={Boolean(previewUrl)}
        onClose={() => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
        }}
        title={previewName || 'Evidence Preview'}
        maxWidth="max-w-3xl"
      >
        {previewUrl && previewType.startsWith('image/') && (
          <img src={previewUrl} alt={previewName} className="w-full max-h-[65vh] object-contain rounded-lg" />
        )}
        {previewUrl && previewType === 'application/pdf' && (
          <iframe src={previewUrl} title={previewName} className="w-full h-[65vh] rounded-lg border border-slate-200 dark:border-slate-800" />
        )}
      </ModalDialog>
    </PageShell>
  );
}
