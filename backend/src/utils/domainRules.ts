export const USER_ROLES = ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'STAFF', 'USER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const COMPLAINT_CATEGORIES = [
  'Academic',
  'Technical',
  'Infrastructure',
  'Hostel',
  'Transportation',
  'Administration',
  'Finance',
  'Facilities',
  'Other',
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type ComplaintPriority = (typeof COMPLAINT_PRIORITIES)[number];

export const COMPLAINT_STATUSES = [
  'Draft',
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Awaiting Response',
  'Resolved',
  'Rejected',
  'Reopened',
  'Escalated',
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const CONTACT_PREFERENCES = ['Email', 'Phone', 'In-App Only', 'Anonymous'] as const;
export type ContactPreference = (typeof CONTACT_PREFERENCES)[number];

export const ALLOWED_STATUS_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  Draft: ['Submitted'],
  Submitted: ['Under Review', 'Assigned', 'Rejected', 'Escalated'],
  'Under Review': ['Assigned', 'In Progress', 'Awaiting Response', 'Rejected', 'Escalated'],
  Assigned: ['In Progress', 'Awaiting Response', 'Resolved', 'Rejected', 'Escalated'],
  'In Progress': ['Awaiting Response', 'Resolved', 'Rejected', 'Escalated'],
  'Awaiting Response': ['In Progress', 'Resolved', 'Rejected', 'Escalated'],
  Resolved: ['Reopened'],
  Rejected: ['Reopened'],
  Reopened: ['Under Review', 'Assigned', 'In Progress', 'Resolved', 'Escalated'],
  Escalated: ['Under Review', 'Assigned', 'In Progress', 'Awaiting Response', 'Resolved', 'Rejected'],
};

export interface TransitionValidationInput {
  fromStatus: ComplaintStatus;
  toStatus: ComplaintStatus;
  actorRole: UserRole;
  reason?: string;
  resolutionSummary?: string;
}

export interface TransitionValidationResult {
  valid: boolean;
  error?: string;
}

export function validateStatusTransition(input: TransitionValidationInput): TransitionValidationResult {
  const { fromStatus, toStatus, actorRole, reason, resolutionSummary } = input;

  if (fromStatus === toStatus) {
    return { valid: false, error: `Complaint is already in "${toStatus}" status.` };
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    return {
      valid: false,
      error: `Transition from "${fromStatus}" to "${toStatus}" is not permitted.`,
    };
  }

  if (actorRole === 'USER') {
    const userAllowed =
      (fromStatus === 'Draft' && toStatus === 'Submitted') ||
      ((fromStatus === 'Resolved' || fromStatus === 'Rejected') && toStatus === 'Reopened');
    if (!userAllowed) {
      return {
        valid: false,
        error: 'Users may only submit drafts or reopen resolved/rejected complaints.',
      };
    }
  }

  if (toStatus === 'Rejected' && (!reason || reason.trim().length < 10)) {
    return {
      valid: false,
      error: 'A rejection reason of at least 10 characters is required.',
    };
  }

  if (toStatus === 'Resolved' && (!resolutionSummary || resolutionSummary.trim().length < 10)) {
    return {
      valid: false,
      error: 'A resolution summary of at least 10 characters is required.',
    };
  }

  if (toStatus === 'Reopened' && (!reason || reason.trim().length < 5)) {
    return {
      valid: false,
      error: 'Please provide a brief reason for reopening this complaint.',
    };
  }

  return { valid: true };
}

export function generateComplaintRefId(sequenceNumber: number, year = new Date().getFullYear()): string {
  const padded = String(Math.max(1, Math.floor(sequenceNumber))).padStart(4, '0');
  return `CMP-${year}-${padded}`;
}

export interface SlaEvaluation {
  status: 'MET' | 'ON_TRACK' | 'APPROACHING' | 'BREACHED' | 'PAUSED';
  remainingMs: number;
  overdueMs: number;
  percentElapsed: number;
}

export function computeSlaDeadline(createdAt: Date | string, targetHours: number): Date {
  const start = new Date(createdAt).getTime();
  const safeHours = Math.max(1, targetHours);
  return new Date(start + safeHours * 60 * 60 * 1000);
}

export function evaluateSlaStatus(
  createdAt: Date | string,
  deadline: Date | string,
  complaintStatus: ComplaintStatus,
  resolvedAt?: Date | string | null,
  now: Date = new Date()
): SlaEvaluation {
  const startMs = new Date(createdAt).getTime();
  const deadlineMs = new Date(deadline).getTime();
  const totalWindow = Math.max(1, deadlineMs - startMs);

  if (complaintStatus === 'Draft') {
    return { status: 'PAUSED', remainingMs: totalWindow, overdueMs: 0, percentElapsed: 0 };
  }

  if (complaintStatus === 'Resolved' || complaintStatus === 'Rejected') {
    const finishMs = resolvedAt ? new Date(resolvedAt).getTime() : now.getTime();
    const breached = finishMs > deadlineMs;
    return {
      status: breached ? 'BREACHED' : 'MET',
      remainingMs: Math.max(0, deadlineMs - finishMs),
      overdueMs: Math.max(0, finishMs - deadlineMs),
      percentElapsed: Math.min(100, Math.round(((finishMs - startMs) / totalWindow) * 100)),
    };
  }

  const nowMs = now.getTime();
  const remainingMs = deadlineMs - nowMs;
  const elapsedMs = Math.max(0, nowMs - startMs);
  const percentElapsed = Math.min(100, Math.round((elapsedMs / totalWindow) * 100));

  if (remainingMs <= 0) {
    return {
      status: 'BREACHED',
      remainingMs: 0,
      overdueMs: Math.abs(remainingMs),
      percentElapsed: 100,
    };
  }

  if (percentElapsed >= 75) {
    return { status: 'APPROACHING', remainingMs, overdueMs: 0, percentElapsed };
  }

  return { status: 'ON_TRACK', remainingMs, overdueMs: 0, percentElapsed };
}

export const ALLOWED_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 4) return false;
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeType === 'application/pdf') {
    return (
      buffer.length >= 5 &&
      buffer[0] === 0x25 && // %
      buffer[1] === 0x50 && // P
      buffer[2] === 0x44 && // D
      buffer[3] === 0x46 && // F
      buffer[4] === 0x2d // -
    );
  }
  return false;
}

export function sanitizeNoSqlPayload<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeNoSqlPayload(item)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.startsWith('$') || k === '__proto__' || k === 'constructor' || k === 'prototype' || k.includes('.')) {
      continue;
    }
    clean[k] = sanitizeNoSqlPayload(v);
  }
  return clean as T;
}

export interface SanitizableComplaint {
  id: string;
  referenceId: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  departmentId: string;
  departmentName?: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  location: string;
  incidentDate: string;
  contactPreference: ContactPreference;
  isAnonymous: boolean;
  submittedById: string;
  submittedByName?: string;
  submittedByEmail?: string;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
  expectedResolutionDate?: string | null;
  slaDeadline: string;
  resolutionSummary?: string | null;
  resolvedAt?: string | null;
  resolvedByName?: string | null;
  rejectionReason?: string | null;
  escalationLevel: number;
  createdAt: string;
  updatedAt: string;
}

export function sanitizeComplaintForViewer(
  complaint: SanitizableComplaint,
  viewer: { id: string; role: UserRole }
): SanitizableComplaint {
  const copy = { ...complaint };
  if (copy.isAnonymous && viewer.id !== copy.submittedById) {
    copy.submittedByName = 'Anonymous Submitter';
    copy.submittedByEmail = 'Protected Identity';
    copy.submittedById = 'anonymous';
  }
  return copy;
}

export function maskComplaintForPublicTracking(complaint: SanitizableComplaint) {
  return {
    referenceId: complaint.referenceId,
    title: complaint.title,
    category: complaint.category,
    departmentName: complaint.departmentName || 'Assigned Department',
    priority: complaint.priority,
    status: complaint.status,
    assignedStaffName: complaint.assignedStaffName || 'Unassigned',
    submittedAt: complaint.createdAt,
    updatedAt: complaint.updatedAt,
    slaDeadline: complaint.slaDeadline,
    escalationLevel: complaint.escalationLevel,
    resolutionSummary: complaint.status === 'Resolved' ? complaint.resolutionSummary : null,
  };
}

export function computeAverageResolutionHours(
  complaints: Array<{ createdAt: string; resolvedAt?: string | null; status: ComplaintStatus }>
): number {
  const resolved = complaints.filter((c) => c.status === 'Resolved' && c.resolvedAt);
  if (resolved.length === 0) return 0;
  const totalHours = resolved.reduce((acc, c) => {
    const start = new Date(c.createdAt).getTime();
    const end = new Date(c.resolvedAt as string).getTime();
    return acc + Math.max(0.5, (end - start) / (1000 * 60 * 60));
  }, 0);
  return Math.round((totalHours / resolved.length) * 10) / 10;
}

export function isOriginHostMatch(origin: string | undefined, hostHeader: string | undefined): boolean {
  if (!origin || !hostHeader) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const expectedHost = hostHeader.split(',')[0].trim().toLowerCase();
    if (!expectedHost) return false;
    return parsed.host.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = String(value ?? '');
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

