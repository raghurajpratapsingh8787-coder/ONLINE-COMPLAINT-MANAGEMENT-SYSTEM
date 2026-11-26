import mongoose, { Schema } from 'mongoose';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUSES,
  CONTACT_PREFERENCES,
  USER_ROLES,
} from '../utils/domainRules';

// 1. User Schema
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: USER_ROLES, default: 'USER', index: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    phone: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    title: { type: String, default: '' },
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    resetTokenHash: { type: String, default: null },
    resetTokenExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// 2. Department Schema
const departmentSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 16, index: true },
    description: { type: String, required: true, maxlength: 600 },
    headUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active', index: true },
    slaOverrideHours: {
      Critical: { type: Number, default: null },
      High: { type: Number, default: null },
      Medium: { type: Number, default: null },
      Low: { type: Number, default: null },
    },
  },
  { timestamps: true }
);

// 3. Staff Schema
const staffSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    employeeCode: { type: String, required: true, unique: true, trim: true },
    designation: { type: String, required: true, trim: true },
    specializations: [{ type: String }],
    maxActiveLoad: { type: Number, default: 15 },
    availabilityStatus: { type: String, enum: ['Available', 'Busy', 'On Leave'], default: 'Available' },
  },
  { timestamps: true }
);

// 4. Complaint Schema
const complaintSchema = new Schema(
  {
    referenceId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 180 },
    description: { type: String, required: true, minlength: 20, maxlength: 4000 },
    category: { type: String, enum: COMPLAINT_CATEGORIES, required: true, index: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    priority: { type: String, enum: COMPLAINT_PRIORITIES, default: 'Medium', index: true },
    status: { type: String, enum: COMPLAINT_STATUSES, default: 'Submitted', index: true },
    location: { type: String, required: true, trim: true, maxlength: 200 },
    incidentDate: { type: Date, required: true },
    contactPreference: { type: String, enum: CONTACT_PREFERENCES, default: 'Email' },
    isAnonymous: { type: Boolean, default: false },
    submittedById: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedStaffId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    expectedResolutionDate: { type: Date, default: null },
    slaDeadline: { type: Date, required: true, index: true },
    resolutionSummary: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: null },
    escalationLevel: { type: Number, default: 0, index: true },
    dedupeHash: { type: String, index: true },
  },
  { timestamps: true }
);
complaintSchema.index({ status: 1, priority: 1, createdAt: -1 });
complaintSchema.index({ departmentId: 1, status: 1 });

// 5. ComplaintAssignment Schema
const complaintAssignmentSchema = new Schema(
  {
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    assignedToUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    previousAssignedToUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: '' },
    expectedResolutionDate: { type: Date, default: null },
  },
  { timestamps: true }
);

// 6. ComplaintStatusHistory Schema
const complaintStatusHistorySchema = new Schema(
  {
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    fromStatus: { type: String, enum: [...COMPLAINT_STATUSES, null], default: null },
    toStatus: { type: String, enum: COMPLAINT_STATUSES, required: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedByName: { type: String, required: true },
    description: { type: String, required: true },
    comment: { type: String, default: '' },
  },
  { timestamps: true }
);

// 7. ComplaintComment Schema
const complaintCommentSchema = new Schema(
  {
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    authorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, enum: USER_ROLES, required: true },
    body: { type: String, required: true, maxlength: 2000 },
    isInternal: { type: Boolean, default: false, index: true },
    isInfoRequest: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 8. ComplaintAttachment Schema
const complaintAttachmentSchema = new Schema(
  {
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    uploadedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    originalFilename: { type: String, required: true },
    storedFilename: { type: String, required: true, unique: true },
    mimeType: { type: String, enum: ['image/jpeg', 'image/png', 'application/pdf'], required: true },
    sizeBytes: { type: Number, required: true },
    isResolutionEvidence: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 9. Notification Schema
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    eventType: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', default: null },
    referenceId: { type: String, default: null },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// 10. SLAPolicy Schema
const slaPolicySchema = new Schema(
  {
    priority: { type: String, enum: COMPLAINT_PRIORITIES, required: true, unique: true },
    responseTargetHours: { type: Number, required: true, min: 1 },
    resolutionTargetHours: { type: Number, required: true, min: 1 },
    autoEscalateOnBreach: { type: Boolean, default: true },
    escalateToRole: { type: String, enum: ['DEPARTMENT_ADMIN', 'SUPER_ADMIN'], default: 'SUPER_ADMIN' },
  },
  { timestamps: true }
);

// 11. Escalation Schema
const escalationSchema = new Schema(
  {
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    level: { type: Number, required: true, min: 1 },
    type: { type: String, enum: ['AUTOMATIC', 'MANUAL'], required: true },
    reason: { type: String, required: true },
    escalatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    escalatedToUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// 12. Feedback Schema
const feedbackSchema = new Schema(
  {
    complaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', maxlength: 1000 },
  },
  { timestamps: true }
);

// 13. AuditLog Schema
const auditLogSchema = new Schema(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true },
    details: { type: String, required: true },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: true }
);

// 14. Session Schema
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
export const DepartmentModel = mongoose.models.Department || mongoose.model('Department', departmentSchema);
export const StaffModel = mongoose.models.Staff || mongoose.model('Staff', staffSchema);
export const ComplaintModel = mongoose.models.Complaint || mongoose.model('Complaint', complaintSchema);
export const ComplaintAssignmentModel =
  mongoose.models.ComplaintAssignment || mongoose.model('ComplaintAssignment', complaintAssignmentSchema);
export const ComplaintStatusHistoryModel =
  mongoose.models.ComplaintStatusHistory || mongoose.model('ComplaintStatusHistory', complaintStatusHistorySchema);
export const ComplaintCommentModel =
  mongoose.models.ComplaintComment || mongoose.model('ComplaintComment', complaintCommentSchema);
export const ComplaintAttachmentModel =
  mongoose.models.ComplaintAttachment || mongoose.model('ComplaintAttachment', complaintAttachmentSchema);
export const NotificationModel =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export const SLAPolicyModel = mongoose.models.SLAPolicy || mongoose.model('SLAPolicy', slaPolicySchema);
export const EscalationModel = mongoose.models.Escalation || mongoose.model('Escalation', escalationSchema);
export const FeedbackModel = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);
export const AuditLogModel = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export const SessionModel = mongoose.models.Session || mongoose.model('Session', sessionSchema);
