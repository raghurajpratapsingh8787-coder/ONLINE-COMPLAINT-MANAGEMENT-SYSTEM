export type UserRole = 'SUPER_ADMIN' | 'DEPARTMENT_ADMIN' | 'STAFF' | 'USER';

export type ComplaintCategory =
  | 'Academic'
  | 'Technical'
  | 'Infrastructure'
  | 'Hostel'
  | 'Transportation'
  | 'Administration'
  | 'Finance'
  | 'Facilities'
  | 'Other';

export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export type ComplaintStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Assigned'
  | 'In Progress'
  | 'Awaiting Response'
  | 'Resolved'
  | 'Rejected'
  | 'Reopened'
  | 'Escalated';

export type ContactPreference = 'Email' | 'Phone' | 'In-App Only' | 'Anonymous';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  departmentId: string | null;
  departmentName: string | null;
  phone: string;
  avatarUrl: string;
  title: string;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface SlaInfo {
  status: 'MET' | 'ON_TRACK' | 'APPROACHING' | 'BREACHED' | 'PAUSED';
  remainingMs: number;
  overdueMs: number;
  percentElapsed: number;
}

export interface ComplaintItem {
  id: string;
  referenceId: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  location: string;
  incidentDate: string;
  contactPreference: ContactPreference;
  isAnonymous: boolean;
  submittedById: string;
  submittedByName: string;
  submittedByEmail: string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  expectedResolutionDate: string | null;
  slaDeadline: string;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  rejectionReason: string | null;
  escalationLevel: number;
  sla: SlaInfo;
  attachmentsCount: number;
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEntry {
  id: string;
  complaintId: string;
  fromStatus: ComplaintStatus | null;
  toStatus: ComplaintStatus;
  updatedByUserId: string;
  updatedByName: string;
  description: string;
  comment: string;
  createdAt: string;
}

export interface CommentItem {
  id: string;
  complaintId: string;
  authorUserId: string;
  authorName: string;
  authorRole: UserRole;
  body: string;
  isInternal: boolean;
  isInfoRequest: boolean;
  createdAt: string;
}

export interface AttachmentItem {
  id: string;
  originalFilename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;
  isResolutionEvidence: boolean;
  uploadedByUserId: string;
  createdAt: string;
}

export interface DepartmentItem {
  id: string;
  name: string;
  code: string;
  description: string;
  headUserId: string | null;
  headName: string;
  status: 'Active' | 'Inactive';
  staffCount: number;
  totalComplaints: number;
  activeComplaints: number;
  resolvedComplaints: number;
  slaOverrideHours: {
    Critical: number | null;
    High: number | null;
    Medium: number | null;
    Low: number | null;
  };
  createdAt: string;
}

export interface StaffItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  employeeCode: string;
  designation: string;
  specializations: string[];
  maxActiveLoad: number;
  availabilityStatus: 'Available' | 'Busy' | 'On Leave';
  workload: {
    assigned: number;
    pending: number;
    resolved: number;
    overdue: number;
    avgResolutionHours: number;
  };
}

export interface NotificationItem {
  id: string;
  userId: string;
  eventType: string;
  title: string;
  message: string;
  complaintId: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface SLAPolicyItem {
  id: string;
  priority: ComplaintPriority;
  responseTargetHours: number;
  resolutionTargetHours: number;
  autoEscalateOnBreach: boolean;
  escalateToRole: 'DEPARTMENT_ADMIN' | 'SUPER_ADMIN';
  updatedAt: string;
}

export interface AuditLogItem {
  id: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}
