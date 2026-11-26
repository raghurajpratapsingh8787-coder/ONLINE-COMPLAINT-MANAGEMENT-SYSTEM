import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from './env';
import {
  AuditLogModel,
  ComplaintAssignmentModel,
  ComplaintAttachmentModel,
  ComplaintCommentModel,
  ComplaintModel,
  ComplaintStatusHistoryModel,
  DepartmentModel,
  EscalationModel,
  FeedbackModel,
  NotificationModel,
  SessionModel,
  SLAPolicyModel,
  StaffModel,
  UserModel,
} from '../models/mongooseModels';
import {
  ComplaintCategory,
  ComplaintPriority,
  ComplaintStatus,
  ContactPreference,
  UserRole,
  computeSlaDeadline,
  generateComplaintRefId,
} from '../utils/domainRules';

export interface UserDoc {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  departmentId: string | null;
  phone: string;
  avatarUrl: string;
  title: string;
  isEmailVerified: boolean;
  isActive: boolean;
  failedLoginAttempts: number;
  lockUntil: string | null;
  resetTokenHash: string | null;
  resetTokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentDoc {
  id: string;
  name: string;
  code: string;
  description: string;
  headUserId: string | null;
  status: 'Active' | 'Inactive';
  slaOverrideHours: {
    Critical: number | null;
    High: number | null;
    Medium: number | null;
    Low: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface StaffDoc {
  id: string;
  userId: string;
  departmentId: string;
  employeeCode: string;
  designation: string;
  specializations: string[];
  maxActiveLoad: number;
  availabilityStatus: 'Available' | 'Busy' | 'On Leave';
  createdAt: string;
  updatedAt: string;
}

export interface ComplaintDoc {
  id: string;
  referenceId: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  departmentId: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  location: string;
  incidentDate: string;
  contactPreference: ContactPreference;
  isAnonymous: boolean;
  submittedById: string;
  assignedStaffId: string | null;
  expectedResolutionDate: string | null;
  slaDeadline: string;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  rejectionReason: string | null;
  escalationLevel: number;
  dedupeHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplaintAssignmentDoc {
  id: string;
  complaintId: string;
  departmentId: string;
  assignedToUserId: string | null;
  assignedByUserId: string;
  previousAssignedToUserId: string | null;
  notes: string;
  expectedResolutionDate: string | null;
  createdAt: string;
}

export interface ComplaintStatusHistoryDoc {
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

export interface ComplaintCommentDoc {
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

export interface ComplaintAttachmentDoc {
  id: string;
  complaintId: string;
  uploadedByUserId: string;
  originalFilename: string;
  storedFilename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;
  isResolutionEvidence: boolean;
  createdAt: string;
}

export interface NotificationDoc {
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

export interface SLAPolicyDoc {
  id: string;
  priority: ComplaintPriority;
  responseTargetHours: number;
  resolutionTargetHours: number;
  autoEscalateOnBreach: boolean;
  escalateToRole: 'DEPARTMENT_ADMIN' | 'SUPER_ADMIN';
  updatedAt: string;
}

export interface EscalationDoc {
  id: string;
  complaintId: string;
  level: number;
  type: 'AUTOMATIC' | 'MANUAL';
  reason: string;
  escalatedByUserId: string | null;
  escalatedToUserId: string | null;
  createdAt: string;
}

export interface FeedbackDoc {
  id: string;
  complaintId: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface AuditLogDoc {
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

export interface SessionDoc {
  id: string;
  userId: string;
  refreshTokenHash: string;
  userAgent: string;
  ipAddress: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface StoreState {
  complaintSequence: number;
  adminClaimed: boolean;
  users: UserDoc[];
  departments: DepartmentDoc[];
  staff: StaffDoc[];
  complaints: ComplaintDoc[];
  assignments: ComplaintAssignmentDoc[];
  statusHistory: ComplaintStatusHistoryDoc[];
  comments: ComplaintCommentDoc[];
  attachments: ComplaintAttachmentDoc[];
  notifications: NotificationDoc[];
  slaPolicies: SLAPolicyDoc[];
  escalations: EscalationDoc[];
  feedback: FeedbackDoc[];
  auditLogs: AuditLogDoc[];
  sessions: SessionDoc[];
}

export function newObjectId(): string {
  return new mongoose.Types.ObjectId().toHexString();
}

const STORE_FILE = path.join(env.DATA_DIR, 'resolvedesk-store.json');

class DatabaseService {
  public mode: 'mongodb' | 'local-persistent' = 'local-persistent';
  private ready = false;
  public state: StoreState = this.emptyState();

  private emptyState(): StoreState {
    return {
      complaintSequence: 0,
      adminClaimed: false,
      users: [],
      departments: [],
      staff: [],
      complaints: [],
      assignments: [],
      statusHistory: [],
      comments: [],
      attachments: [],
      notifications: [],
      slaPolicies: [],
      escalations: [],
      feedback: [],
      auditLogs: [],
      sessions: [],
    };
  }

  public async init(): Promise<void> {
    if (this.ready) return;

    fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
    fs.mkdirSync(env.DATA_DIR, { recursive: true });

    if (env.MONGODB_URI) {
      try {
        await mongoose.connect(env.MONGODB_URI, {
          serverSelectionTimeoutMS: 5000,
        });
        this.mode = 'mongodb';
        await this.loadFromMongoIntoCache();
        if (this.state.departments.length === 0) {
          await this.seedInitialData();
          await this.syncCacheToMongo();
        }
        this.ready = true;
        console.log('[Database] Connected to MongoDB via Mongoose.');
        return;
      } catch (err) {
        console.warn('[Database] MongoDB connection unavailable, using local persistent store:', (err as Error).message);
      }
    }

    this.mode = 'local-persistent';
    if (fs.existsSync(STORE_FILE)) {
      try {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as StoreState;
        this.state = { ...this.emptyState(), ...parsed };
      } catch {
        this.state = this.emptyState();
      }
    }

    if (this.state.departments.length === 0) {
      await this.seedInitialData();
      this.persist();
    }

    if (env.ADMIN_INITIAL_PASSWORD) {
      const admin = this.state.users.find((u) => u.role === 'SUPER_ADMIN');
      if (admin) {
        admin.passwordHash = await bcrypt.hash(env.ADMIN_INITIAL_PASSWORD, 12);
        this.state.adminClaimed = true;
        this.persist();
      }
    }

    this.ready = true;
    console.log(`[Database] Ready in ${this.mode} mode (${this.state.complaints.length} complaints loaded).`);
  }

  public persist(): void {
    try {
      fs.mkdirSync(env.DATA_DIR, { recursive: true });
      const tmp = `${STORE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
      fs.renameSync(tmp, STORE_FILE);
    } catch (err) {
      console.error('[Database] Failed to persist local store:', (err as Error).message);
    }

    if (this.mode === 'mongodb' && mongoose.connection.readyState === 1) {
      void this.syncCacheToMongo().catch((err) => {
        console.error('[Database] MongoDB sync error:', (err as Error).message);
      });
    }
  }

  private async loadFromMongoIntoCache(): Promise<void> {
    const mapId = <T extends Record<string, unknown>>(doc: T) => {
      const obj = { ...doc } as Record<string, unknown>;
      obj.id = String(obj._id || obj.id);
      delete obj._id;
      delete obj.__v;
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val instanceof Date) obj[key] = val.toISOString();
        else if (val && typeof val === 'object' && '_bsontype' in val) obj[key] = String(val);
      }
      return obj;
    };

    const [
      users,
      departments,
      staff,
      complaints,
      assignments,
      statusHistory,
      comments,
      attachments,
      notifications,
      slaPolicies,
      escalations,
      feedback,
      auditLogs,
      sessions,
    ] = await Promise.all([
      UserModel.find().lean(),
      DepartmentModel.find().lean(),
      StaffModel.find().lean(),
      ComplaintModel.find().lean(),
      ComplaintAssignmentModel.find().lean(),
      ComplaintStatusHistoryModel.find().lean(),
      ComplaintCommentModel.find().lean(),
      ComplaintAttachmentModel.find().lean(),
      NotificationModel.find().lean(),
      SLAPolicyModel.find().lean(),
      EscalationModel.find().lean(),
      FeedbackModel.find().lean(),
      AuditLogModel.find().lean(),
      SessionModel.find().lean(),
    ]);

    this.state = {
      complaintSequence: complaints.length,
      adminClaimed: users.some((u) => u.role === 'SUPER_ADMIN' && Boolean(u.passwordHash)),
      users: users.map((d) => mapId(d) as unknown as UserDoc),
      departments: departments.map((d) => mapId(d) as unknown as DepartmentDoc),
      staff: staff.map((d) => mapId(d) as unknown as StaffDoc),
      complaints: complaints.map((d) => mapId(d) as unknown as ComplaintDoc),
      assignments: assignments.map((d) => mapId(d) as unknown as ComplaintAssignmentDoc),
      statusHistory: statusHistory.map((d) => mapId(d) as unknown as ComplaintStatusHistoryDoc),
      comments: comments.map((d) => mapId(d) as unknown as ComplaintCommentDoc),
      attachments: attachments.map((d) => mapId(d) as unknown as ComplaintAttachmentDoc),
      notifications: notifications.map((d) => mapId(d) as unknown as NotificationDoc),
      slaPolicies: slaPolicies.map((d) => mapId(d) as unknown as SLAPolicyDoc),
      escalations: escalations.map((d) => mapId(d) as unknown as EscalationDoc),
      feedback: feedback.map((d) => mapId(d) as unknown as FeedbackDoc),
      auditLogs: auditLogs.map((d) => mapId(d) as unknown as AuditLogDoc),
      sessions: sessions.map((d) => mapId(d) as unknown as SessionDoc),
    };
  }

  private async syncCacheToMongo(): Promise<void> {
    const upsertAll = async (Model: mongoose.Model<any>, items: Array<{ id: string }>) => {
      if (!items.length) return;
      const ops = items.map((item) => {
        const { id, ...rest } = item;
        return {
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(id) },
            update: { $set: rest },
            upsert: true,
          },
        };
      });
      await Model.bulkWrite(ops, { ordered: false });
    };

    await Promise.all([
      upsertAll(DepartmentModel, this.state.departments),
      upsertAll(UserModel, this.state.users),
      upsertAll(StaffModel, this.state.staff),
      upsertAll(SLAPolicyModel, this.state.slaPolicies),
      upsertAll(ComplaintModel, this.state.complaints),
      upsertAll(ComplaintAssignmentModel, this.state.assignments),
      upsertAll(ComplaintStatusHistoryModel, this.state.statusHistory),
      upsertAll(ComplaintCommentModel, this.state.comments),
      upsertAll(ComplaintAttachmentModel, this.state.attachments),
      upsertAll(NotificationModel, this.state.notifications),
      upsertAll(EscalationModel, this.state.escalations),
      upsertAll(FeedbackModel, this.state.feedback),
      upsertAll(AuditLogModel, this.state.auditLogs),
      upsertAll(SessionModel, this.state.sessions),
    ]);
  }

  public nextReferenceId(): string {
    this.state.complaintSequence += 1;
    return generateComplaintRefId(this.state.complaintSequence, new Date().getFullYear());
  }

  public getSlaTargetHours(priority: ComplaintPriority, departmentId?: string): number {
    if (departmentId) {
      const dept = this.state.departments.find((d) => d.id === departmentId);
      const override = dept?.slaOverrideHours?.[priority];
      if (typeof override === 'number' && override >= 1) return override;
    }
    const policy = this.state.slaPolicies.find((p) => p.priority === priority);
    if (policy) return policy.resolutionTargetHours;
    const defaults: Record<ComplaintPriority, number> = {
      Critical: 8,
      High: 24,
      Medium: 72,
      Low: 120,
    };
    return defaults[priority];
  }

  public addAuditLog(entry: Omit<AuditLogDoc, 'id' | 'createdAt'>): AuditLogDoc {
    const doc: AuditLogDoc = {
      id: newObjectId(),
      ...entry,
      createdAt: new Date().toISOString(),
    };
    this.state.auditLogs.unshift(doc);
    return doc;
  }

  private async seedInitialData(): Promise<void> {
    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();
    const daysAgo = (d: number) => new Date(now - d * 24 * 3600 * 1000).toISOString();

    this.state.slaPolicies = [
      {
        id: newObjectId(),
        priority: 'Critical',
        responseTargetHours: 2,
        resolutionTargetHours: 8,
        autoEscalateOnBreach: true,
        escalateToRole: 'SUPER_ADMIN',
        updatedAt: daysAgo(30),
      },
      {
        id: newObjectId(),
        priority: 'High',
        responseTargetHours: 4,
        resolutionTargetHours: 24,
        autoEscalateOnBreach: true,
        escalateToRole: 'DEPARTMENT_ADMIN',
        updatedAt: daysAgo(30),
      },
      {
        id: newObjectId(),
        priority: 'Medium',
        responseTargetHours: 12,
        resolutionTargetHours: 72,
        autoEscalateOnBreach: true,
        escalateToRole: 'DEPARTMENT_ADMIN',
        updatedAt: daysAgo(30),
      },
      {
        id: newObjectId(),
        priority: 'Low',
        responseTargetHours: 24,
        resolutionTargetHours: 120,
        autoEscalateOnBreach: false,
        escalateToRole: 'DEPARTMENT_ADMIN',
        updatedAt: daysAgo(30),
      },
    ];

    const deptIds = {
      acad: newObjectId(),
      tech: newObjectId(),
      infra: newObjectId(),
      hostel: newObjectId(),
      trans: newObjectId(),
      fin: newObjectId(),
      admin: newObjectId(),
    };

    const userIds = {
      superAdmin: newObjectId(),
      deptAdminTech: newObjectId(),
      deptAdminInfra: newObjectId(),
      staffPriya: newObjectId(),
      staffVikram: newObjectId(),
      staffAnanya: newObjectId(),
      staffRohan: newObjectId(),
      studentAarav: newObjectId(),
      studentMeera: newObjectId(),
    };

    this.state.departments = [
      {
        id: deptIds.acad,
        name: 'Academic Affairs',
        code: 'ACAD',
        description: 'Examination scheduling, faculty grievances, grading reviews, and curriculum operations.',
        headUserId: userIds.superAdmin,
        status: 'Active',
        slaOverrideHours: { Critical: null, High: null, Medium: null, Low: null },
        createdAt: daysAgo(90),
        updatedAt: daysAgo(5),
      },
      {
        id: deptIds.tech,
        name: 'IT & Network Services',
        code: 'ITNS',
        description: 'Campus Wi-Fi infrastructure, ERP portal access, laboratory workstations, and cybersecurity.',
        headUserId: userIds.deptAdminTech,
        status: 'Active',
        slaOverrideHours: { Critical: 6, High: 18, Medium: null, Low: null },
        createdAt: daysAgo(90),
        updatedAt: daysAgo(2),
      },
      {
        id: deptIds.infra,
        name: 'Campus Infrastructure',
        code: 'INFRA',
        description: 'Lecture hall maintenance, HVAC systems, electrical grids, and structural safety.',
        headUserId: userIds.deptAdminInfra,
        status: 'Active',
        slaOverrideHours: { Critical: null, High: null, Medium: null, Low: null },
        createdAt: daysAgo(90),
        updatedAt: daysAgo(4),
      },
      {
        id: deptIds.hostel,
        name: 'Hostel & Residential Life',
        code: 'HOST',
        description: 'Student residential blocks, mess hygiene, water supply, and hostel security.',
        headUserId: userIds.deptAdminInfra,
        status: 'Active',
        slaOverrideHours: { Critical: 6, High: null, Medium: null, Low: null },
        createdAt: daysAgo(90),
        updatedAt: daysAgo(3),
      },
      {
        id: deptIds.trans,
        name: 'Campus Transportation',
        code: 'TRAN',
        description: 'Shuttle routes, fleet scheduling, transit pass grievances, and campus parking.',
        headUserId: userIds.deptAdminInfra,
        status: 'Active',
        slaOverrideHours: { Critical: null, High: null, Medium: null, Low: null },
        createdAt: daysAgo(90),
        updatedAt: daysAgo(7),
      },
      {
        id: deptIds.fin,
        name: 'Finance & Accounts',
        code: 'FINA',
        description: 'Fee receipts, scholarship disbursements, refund processing, and billing inquiries.',
        headUserId: userIds.superAdmin,
        status: 'Active',
        slaOverrideHours: { Critical: null, High: null, Medium: 48, Low: null },
        createdAt: daysAgo(90),
        updatedAt: daysAgo(6),
      },
      {
        id: deptIds.admin,
        name: 'Central Administration',
        code: 'ADMN',
        description: 'Registrar services, institutional documentation, ID cards, and administrative policy.',
        headUserId: userIds.superAdmin,
        status: 'Active',
        slaOverrideHours: { Critical: null, High: null, Medium: null, Low: null },
        createdAt: daysAgo(90),
        updatedAt: daysAgo(1),
      },
    ];

    const adminPasswordHash = env.ADMIN_INITIAL_PASSWORD
      ? await bcrypt.hash(env.ADMIN_INITIAL_PASSWORD, 12)
      : '';
    this.state.adminClaimed = Boolean(adminPasswordHash);

    const lockedHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

    this.state.users = [
      {
        id: userIds.superAdmin,
        name: 'Raghuraj Pratap Singh',
        email: 'raghurajpratapsingh8787@gmail.com',
        passwordHash: adminPasswordHash,
        role: 'SUPER_ADMIN',
        departmentId: deptIds.admin,
        phone: '+91 98765 43210',
        avatarUrl: '/src/assets/images/avatar_admin_raghuraj_1795709590416.jpg',
        title: 'Chief Systems Architect & Super Admin',
        isEmailVerified: true,
        isActive: true,
        failedLoginAttempts: 0,
        lockUntil: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        createdAt: daysAgo(90),
        updatedAt: daysAgo(1),
      },
      {
        id: userIds.deptAdminTech,
        name: 'Dr. Kavita Deshmukh',
        email: 'kavita.deshmukh@resolvedesk.edu',
        passwordHash: lockedHash,
        role: 'DEPARTMENT_ADMIN',
        departmentId: deptIds.tech,
        phone: '+91 98112 20411',
        avatarUrl: '',
        title: 'Head of IT & Network Services',
        isEmailVerified: true,
        isActive: true,
        failedLoginAttempts: 0,
        lockUntil: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        createdAt: daysAgo(85),
        updatedAt: daysAgo(2),
      },
      {
        id: userIds.deptAdminInfra,
        name: 'Rajeshwar Nair',
        email: 'rajeshwar.nair@resolvedesk.edu',
        passwordHash: lockedHash,
        role: 'DEPARTMENT_ADMIN',
        departmentId: deptIds.infra,
        phone: '+91 98112 31099',
        avatarUrl: '',
        title: 'Director of Campus Operations',
        isEmailVerified: true,
        isActive: true,
        failedLoginAttempts: 0,
        lockUntil: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        createdAt: daysAgo(82),
        updatedAt: daysAgo(3),
      },
      {
        id: userIds.staffPriya,
        name: 'Priya Sharma',
        email: 'priya.sharma@resolvedesk.edu',
        passwordHash: lockedHash,
        role: 'STAFF',
        departmentId: deptIds.tech,
        phone: '+91 98110 77812',
        avatarUrl: '',
        title: 'Senior Network Engineer',
        isEmailVerified: true,
        isActive: true,
        failedLoginAttempts: 0,
        lockUntil: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        createdAt: daysAgo(78),
        updatedAt: daysAgo(2),
      },
      {
        id: userIds.staffVikram,
        name: 'Vikramaditya Joshi',
        email: 'vikram.joshi@resolvedesk.edu',
        passwordHash: lockedHash,
        role: 'STAFF',
        departmentId: deptIds.infra,
        phone: '+91 98110 88214',
        avatarUrl: '',
        title: 'Facilities & Electrical Specialist',
        isEmailVerified: true,
        isActive: true,
        failedLoginAttempts: 0,
        lockUntil: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        createdAt: daysAgo(75),
        updatedAt: daysAgo(2),
      },
      {
        id: userIds.staffAnanya,
        name: 'Ananya Verma',
        email: 'ananya.verma@resolvedesk.edu',
        passwordHash: lockedHash,
        role: 'STAFF',
        departmentId: deptIds.hostel,
        phone: '+91 98110 44120',
        avatarUrl: '',
        title: 'Hostel Welfare Officer',
        isEmailVerified: true,
        isActive: true,
        failedLoginAttempts: 0,
        lockUntil: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        createdAt: daysAgo(72),
        updatedAt: daysAgo(4),
      },
      {
        id: userIds.staffRohan,
        name: 'Rohan Kulkarni',
        email: 'rohan.kulkarni@resolvedesk.edu',
        passwordHash: lockedHash,
        role: 'STAFF',
        departmentId: deptIds.fin,
        phone: '+91 98110 55901',
        avatarUrl: '',
        title: 'Accounts & Scholarship Analyst',
        isEmailVerified: true,
        isActive: true,
        failedLoginAttempts: 0,
        lockUntil: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        createdAt: daysAgo(68),
        updatedAt: daysAgo(1),
      },
      {
        id: userIds.studentAarav,
        name: 'Aarav Malhotra',
        email: 'aarav.malhotra@student.resolvedesk.edu',
        passwordHash: lockedHash,
        role: 'USER',
        departmentId: deptIds.acad,
        phone: '+91 97111 22334',
        avatarUrl: '',
        title: 'B.Tech Computer Science — Sem VI',
        isEmailVerified: true,
        isActive: true,
        failedLoginAttempts: 0,
        lockUntil: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        createdAt: daysAgo(60),
        updatedAt: daysAgo(3),
      },
      {
        id: userIds.studentMeera,
        name: 'Meera Iyer',
        email: 'meera.iyer@student.resolvedesk.edu',
        passwordHash: lockedHash,
        role: 'USER',
        departmentId: deptIds.acad,
        phone: '+91 97111 99812',
        avatarUrl: '',
        title: 'M.Sc Data Science — Sem II',
        isEmailVerified: true,
        isActive: true,
        failedLoginAttempts: 0,
        lockUntil: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        createdAt: daysAgo(55),
        updatedAt: daysAgo(1),
      },
    ];

    this.state.staff = [
      {
        id: newObjectId(),
        userId: userIds.deptAdminTech,
        departmentId: deptIds.tech,
        employeeCode: 'EMP-1002',
        designation: 'Head of IT & Network Services',
        specializations: ['Enterprise Networking', 'ERP Systems', 'Security'],
        maxActiveLoad: 12,
        availabilityStatus: 'Available',
        createdAt: daysAgo(85),
        updatedAt: daysAgo(2),
      },
      {
        id: newObjectId(),
        userId: userIds.deptAdminInfra,
        departmentId: deptIds.infra,
        employeeCode: 'EMP-1003',
        designation: 'Director of Campus Operations',
        specializations: ['Civil Infrastructure', 'HVAC', 'Safety Audits'],
        maxActiveLoad: 12,
        availabilityStatus: 'Available',
        createdAt: daysAgo(82),
        updatedAt: daysAgo(3),
      },
      {
        id: newObjectId(),
        userId: userIds.staffPriya,
        departmentId: deptIds.tech,
        employeeCode: 'EMP-1011',
        designation: 'Senior Network Engineer',
        specializations: ['Wi-Fi Access Points', 'VLANs', 'Lab Systems'],
        maxActiveLoad: 15,
        availabilityStatus: 'Available',
        createdAt: daysAgo(78),
        updatedAt: daysAgo(2),
      },
      {
        id: newObjectId(),
        userId: userIds.staffVikram,
        departmentId: deptIds.infra,
        employeeCode: 'EMP-1014',
        designation: 'Facilities & Electrical Specialist',
        specializations: ['Power Backup', 'Air Conditioning', 'Lighting'],
        maxActiveLoad: 15,
        availabilityStatus: 'Busy',
        createdAt: daysAgo(75),
        updatedAt: daysAgo(2),
      },
      {
        id: newObjectId(),
        userId: userIds.staffAnanya,
        departmentId: deptIds.hostel,
        employeeCode: 'EMP-1019',
        designation: 'Hostel Welfare Officer',
        specializations: ['Hostel Maintenance', 'Dining Quality', 'Water Supply'],
        maxActiveLoad: 15,
        availabilityStatus: 'Available',
        createdAt: daysAgo(72),
        updatedAt: daysAgo(4),
      },
      {
        id: newObjectId(),
        userId: userIds.staffRohan,
        departmentId: deptIds.fin,
        employeeCode: 'EMP-1024',
        designation: 'Accounts & Scholarship Analyst',
        specializations: ['Tuition Refunds', 'Merit Scholarships', 'Fee Portals'],
        maxActiveLoad: 15,
        availabilityStatus: 'Available',
        createdAt: daysAgo(68),
        updatedAt: daysAgo(1),
      },
    ];

    const seedComplaints: Array<{
      title: string;
      description: string;
      category: ComplaintCategory;
      departmentId: string;
      priority: ComplaintPriority;
      status: ComplaintStatus;
      location: string;
      incidentDate: string;
      contactPreference: ContactPreference;
      isAnonymous: boolean;
      submittedById: string;
      assignedStaffId: string | null;
      createdAt: string;
      resolvedAt?: string | null;
      resolutionSummary?: string | null;
      rejectionReason?: string | null;
      escalationLevel?: number;
    }> = [
      {
        title: 'Core Wi-Fi Outage in Engineering Block B & Innovation Lab',
        description:
          'Wireless access points across Floors 2 and 3 of Engineering Block B have been dropping packets every 4 minutes since 09:00 AM, disrupting live lab assessments and cloud coursework.',
        category: 'Technical',
        departmentId: deptIds.tech,
        priority: 'Critical',
        status: 'Escalated',
        location: 'Engineering Block B, Floors 2–3',
        incidentDate: hoursAgo(14),
        contactPreference: 'Email',
        isAnonymous: false,
        submittedById: userIds.studentAarav,
        assignedStaffId: userIds.staffPriya,
        createdAt: hoursAgo(12),
        escalationLevel: 1,
      },
      {
        title: 'Water Purifier & RO Unit Malfunction in Hostel Block C',
        description:
          'The drinking water filtration unit on the 2nd floor of Hostel Block C is showing a red TDS warning light and emitting metallic odor. Over 120 residents depend on this unit.',
        category: 'Hostel',
        departmentId: deptIds.hostel,
        priority: 'Critical',
        status: 'In Progress',
        location: 'Hostel Block C, Wing 2',
        incidentDate: hoursAgo(5),
        contactPreference: 'In-App Only',
        isAnonymous: true,
        submittedById: userIds.studentMeera,
        assignedStaffId: userIds.staffAnanya,
        createdAt: hoursAgo(4),
      },
      {
        title: 'Central Auditorium HVAC Cooling Failure During Seminar',
        description:
          'Air conditioning chillers in Main Auditorium Hall A stopped cooling halfway through the morning technical symposium, raising indoor temperature above 32°C.',
        category: 'Infrastructure',
        departmentId: deptIds.infra,
        priority: 'High',
        status: 'Assigned',
        location: 'Main Auditorium, Hall A',
        incidentDate: hoursAgo(18),
        contactPreference: 'Email',
        isAnonymous: false,
        submittedById: userIds.studentAarav,
        assignedStaffId: userIds.staffVikram,
        createdAt: hoursAgo(15),
      },
      {
        title: 'Merit Scholarship Disbursement Delayed Past Semester Deadline',
        description:
          'My approved national merit scholarship tranche for Semester VI has not been credited to the fee ledger despite verification completion three weeks ago.',
        category: 'Finance',
        departmentId: deptIds.fin,
        priority: 'High',
        status: 'Awaiting Response',
        location: 'Accounts Office, Admin Block',
        incidentDate: hoursAgo(22),
        contactPreference: 'Email',
        isAnonymous: false,
        submittedById: userIds.studentMeera,
        assignedStaffId: userIds.staffRohan,
        createdAt: hoursAgo(18),
      },
      {
        title: 'Campus Shuttle Route 4 Consistently Skipping North Gate Stop',
        description:
          'For the past four mornings, the 08:15 AM Route 4 campus shuttle bypassed North Gate Bus Bay without stopping, forcing 25+ students to miss first-hour lab attendance.',
        category: 'Transportation',
        departmentId: deptIds.trans,
        priority: 'Medium',
        status: 'Submitted',
        location: 'North Gate Transit Bay',
        incidentDate: hoursAgo(26),
        contactPreference: 'Phone',
        isAnonymous: false,
        submittedById: userIds.studentAarav,
        assignedStaffId: null,
        createdAt: hoursAgo(6),
      },
      {
        title: 'Biometric Attendance Terminal Unresponsive in Computer Lab 4',
        description:
          'Students entering Computer Lab 4 are unable to register lab hours because the biometric scanner displays a network timeout error after firmware maintenance.',
        category: 'Technical',
        departmentId: deptIds.tech,
        priority: 'Medium',
        status: 'Under Review',
        location: 'Computer Science Building, Lab 4',
        incidentDate: hoursAgo(30),
        contactPreference: 'Email',
        isAnonymous: false,
        submittedById: userIds.studentMeera,
        assignedStaffId: userIds.deptAdminTech,
        createdAt: hoursAgo(20),
      },
      {
        title: 'Library Reading Room Lighting Flicker & Backup UPS Noise',
        description:
          'Overhead LED panels along Study Aisles 5–8 flicker continuously when the generator switches over, making late-evening exam preparation difficult.',
        category: 'Facilities',
        departmentId: deptIds.infra,
        priority: 'Medium',
        status: 'Resolved',
        location: 'Central Library, Mezzanine Floor',
        incidentDate: daysAgo(8),
        contactPreference: 'Email',
        isAnonymous: false,
        submittedById: userIds.studentAarav,
        assignedStaffId: userIds.staffVikram,
        createdAt: daysAgo(7),
        resolvedAt: daysAgo(5),
        resolutionSummary:
          'Replaced two faulty LED ballast drivers and rebalanced the UPS inverter load on Aisle 5–8 circuits. Verified zero flicker during simulated power failover.',
      },
      {
        title: 'ERP Portal Hall Ticket Download Returning 502 Gateway Error',
        description:
          'Multiple final-year students encountered intermittent 502 errors when generating end-semester hall tickets on the student portal during peak traffic.',
        category: 'Academic',
        departmentId: deptIds.tech,
        priority: 'High',
        status: 'Resolved',
        location: 'Student ERP Portal (Online)',
        incidentDate: daysAgo(12),
        contactPreference: 'Email',
        isAnonymous: false,
        submittedById: userIds.studentMeera,
        assignedStaffId: userIds.staffPriya,
        createdAt: daysAgo(11),
        resolvedAt: daysAgo(10),
        resolutionSummary:
          'Scaled PDF worker containers from 2 to 6 replicas and increased reverse-proxy upstream timeouts. Confirmed 100% hall ticket generation success across 1,400 requests.',
      },
      {
        title: 'Hostel Mess Dinner Hygiene & Temperature Compliance Concern',
        description:
          'Serving warmers in Hostel Mess Hall 2 were switched off early during dinner hours and several serving trays lacked covers. Requesting immediate inspection.',
        category: 'Hostel',
        departmentId: deptIds.hostel,
        priority: 'High',
        status: 'Reopened',
        location: 'Hostel Mess Hall 2',
        incidentDate: hoursAgo(20),
        contactPreference: 'Anonymous',
        isAnonymous: true,
        submittedById: userIds.studentAarav,
        assignedStaffId: userIds.staffAnanya,
        createdAt: hoursAgo(16),
      },
      {
        title: 'Duplicate Fee Late Penalty Applied After Approved Extension',
        description:
          'An automatic late fee of ₹1,500 was posted to my tuition ledger even though the Dean of Academic Affairs approved an extension letter on November 10.',
        category: 'Finance',
        departmentId: deptIds.fin,
        priority: 'Medium',
        status: 'Resolved',
        location: 'Finance Portal & Ledger',
        incidentDate: daysAgo(16),
        contactPreference: 'Email',
        isAnonymous: false,
        submittedById: userIds.studentAarav,
        assignedStaffId: userIds.staffRohan,
        createdAt: daysAgo(15),
        resolvedAt: daysAgo(13),
        resolutionSummary:
          'Verified signed Dean extension approval, reversed the ₹1,500 automated penalty entry, and issued an updated zero-balance fee clearance receipt.',
      },
      {
        title: 'Request to Waive Mandatory Library Overdue Fine Without Return',
        description:
          'Requesting cancellation of overdue fines for four reference textbooks borrowed last semester that have not yet been returned to the circulation desk.',
        category: 'Administration',
        departmentId: deptIds.admin,
        priority: 'Low',
        status: 'Rejected',
        location: 'Central Library Circulation',
        incidentDate: daysAgo(20),
        contactPreference: 'Email',
        isAnonymous: false,
        submittedById: userIds.studentMeera,
        assignedStaffId: userIds.superAdmin,
        createdAt: daysAgo(19),
        resolvedAt: daysAgo(18),
        rejectionReason:
          'Per institutional library policy Section 4.2, overdue fines cannot be waived while borrowed reference materials remain unreturned. Please return books first to request a fee review.',
      },
      {
        title: 'Parking Gate RFID Barrier Sensor Misalignment',
        description:
          'The East Gate faculty and student two-wheeler RFID barrier fails to detect valid campus stickers during morning rain, creating a queue onto the main road.',
        category: 'Infrastructure',
        departmentId: deptIds.infra,
        priority: 'Low',
        status: 'Submitted',
        location: 'East Gate Vehicle Checkpoint',
        incidentDate: hoursAgo(10),
        contactPreference: 'In-App Only',
        isAnonymous: false,
        submittedById: userIds.studentMeera,
        assignedStaffId: null,
        createdAt: hoursAgo(3),
      },
    ];

    for (const item of seedComplaints) {
      const id = newObjectId();
      const referenceId = this.nextReferenceId();
      const targetHours = this.getSlaTargetHours(item.priority, item.departmentId);
      const slaDeadline = computeSlaDeadline(item.createdAt, targetHours).toISOString();

      const doc: ComplaintDoc = {
        id,
        referenceId,
        title: item.title,
        description: item.description,
        category: item.category,
        departmentId: item.departmentId,
        priority: item.priority,
        status: item.status,
        location: item.location,
        incidentDate: item.incidentDate,
        contactPreference: item.contactPreference,
        isAnonymous: item.isAnonymous,
        submittedById: item.submittedById,
        assignedStaffId: item.assignedStaffId,
        expectedResolutionDate: slaDeadline,
        slaDeadline,
        resolutionSummary: item.resolutionSummary || null,
        resolvedAt: item.resolvedAt || null,
        resolvedById: item.resolvedAt ? item.assignedStaffId || userIds.superAdmin : null,
        rejectionReason: item.rejectionReason || null,
        escalationLevel: item.escalationLevel || 0,
        dedupeHash: crypto
          .createHash('sha256')
          .update(`${item.submittedById}:${item.title.toLowerCase()}`)
          .digest('hex'),
        createdAt: item.createdAt,
        updatedAt: item.resolvedAt || item.createdAt,
      };
      this.state.complaints.push(doc);

      const submitter = this.state.users.find((u) => u.id === item.submittedById)!;
      const assignee = item.assignedStaffId
        ? this.state.users.find((u) => u.id === item.assignedStaffId)
        : null;

      this.state.statusHistory.push({
        id: newObjectId(),
        complaintId: id,
        fromStatus: null,
        toStatus: 'Submitted',
        updatedByUserId: submitter.id,
        updatedByName: item.isAnonymous ? 'Anonymous Submitter' : submitter.name,
        description: 'Complaint filed and registered in ResolveDesk.',
        comment: `Reference ID ${referenceId} generated with ${item.priority} priority.`,
        createdAt: item.createdAt,
      });

      if (assignee && item.status !== 'Submitted') {
        this.state.assignments.push({
          id: newObjectId(),
          complaintId: id,
          departmentId: item.departmentId,
          assignedToUserId: assignee.id,
          assignedByUserId: userIds.superAdmin,
          previousAssignedToUserId: null,
          notes: 'Assigned according to department specialization and active workload.',
          expectedResolutionDate: slaDeadline,
          createdAt: new Date(new Date(item.createdAt).getTime() + 25 * 60 * 1000).toISOString(),
        });

        this.state.statusHistory.push({
          id: newObjectId(),
          complaintId: id,
          fromStatus: 'Submitted',
          toStatus: item.status === 'Under Review' ? 'Under Review' : 'Assigned',
          updatedByUserId: userIds.superAdmin,
          updatedByName: 'Raghuraj Pratap Singh',
          description: `Routed to ${assignee.name} for investigation.`,
          comment: 'SLA timer active.',
          createdAt: new Date(new Date(item.createdAt).getTime() + 30 * 60 * 1000).toISOString(),
        });
      }

      if (['In Progress', 'Awaiting Response', 'Resolved', 'Rejected', 'Reopened', 'Escalated'].includes(item.status)) {
        this.state.statusHistory.push({
          id: newObjectId(),
          complaintId: id,
          fromStatus: 'Assigned',
          toStatus: item.status,
          updatedByUserId: assignee?.id || userIds.superAdmin,
          updatedByName: assignee?.name || 'Raghuraj Pratap Singh',
          description:
            item.status === 'Resolved'
              ? 'Complaint resolved with verified corrective action.'
              : item.status === 'Rejected'
                ? 'Complaint closed with institutional policy explanation.'
                : item.status === 'Escalated'
                  ? 'Automatic SLA escalation triggered after critical window breach.'
                  : item.status === 'Awaiting Response'
                    ? 'Requested additional supporting documentation from complainant.'
                    : item.status === 'Reopened'
                      ? 'Reopened following post-resolution follow-up concern.'
                      : 'Active diagnostics and field work underway.',
          comment: item.resolutionSummary || item.rejectionReason || 'Status updated in workflow.',
          createdAt: item.resolvedAt || new Date(new Date(item.createdAt).getTime() + 90 * 60 * 1000).toISOString(),
        });
      }

      if (item.status === 'Escalated') {
        this.state.escalations.push({
          id: newObjectId(),
          complaintId: id,
          level: 1,
          type: 'AUTOMATIC',
          reason: 'Critical SLA threshold exceeded (6h ITNS override). Escalated to Super Admin.',
          escalatedByUserId: null,
          escalatedToUserId: userIds.superAdmin,
          createdAt: hoursAgo(2),
        });
      }

      if (item.status === 'Resolved') {
        this.state.feedback.push({
          id: newObjectId(),
          complaintId: id,
          userId: item.submittedById,
          rating: 5,
          comment: 'Prompt turnaround and transparent status updates throughout the resolution.',
          createdAt: new Date(new Date(item.resolvedAt!).getTime() + 3600 * 1000).toISOString(),
        });
      }
    }

    const firstComplaint = this.state.complaints[0];
    const fourthComplaint = this.state.complaints[3];
    if (firstComplaint) {
      this.state.comments.push(
        {
          id: newObjectId(),
          complaintId: firstComplaint.id,
          authorUserId: userIds.staffPriya,
          authorName: 'Priya Sharma',
          authorRole: 'STAFF',
          body: 'We have isolated a failing PoE distribution switch on Floor 2 of Block B. Hardware swap is scheduled with vendor backup unit.',
          isInternal: false,
          isInfoRequest: false,
          createdAt: hoursAgo(5),
        },
        {
          id: newObjectId(),
          complaintId: firstComplaint.id,
          authorUserId: userIds.deptAdminTech,
          authorName: 'Dr. Kavita Deshmukh',
          authorRole: 'DEPARTMENT_ADMIN',
          body: 'Internal Note: Spare Cisco Catalyst switch reserved from Data Center rack 4. Coordinate downtime window with Exam Cell.',
          isInternal: true,
          isInfoRequest: false,
          createdAt: hoursAgo(3),
        }
      );
    }
    if (fourthComplaint) {
      this.state.comments.push({
        id: newObjectId(),
        complaintId: fourthComplaint.id,
        authorUserId: userIds.staffRohan,
        authorName: 'Rohan Kulkarni',
        authorRole: 'STAFF',
        body: 'Please upload the stamped scholarship sanction PDF or bank IFSC confirmation so we can release the ledger credit today.',
        isInternal: false,
        isInfoRequest: true,
        createdAt: daysAgo(1),
      });
    }

    this.state.notifications = [
      {
        id: newObjectId(),
        userId: userIds.superAdmin,
        eventType: 'COMPLAINT_ESCALATED',
        title: 'SLA Escalation: CMP-2026-0001',
        message: 'Core Wi-Fi Outage in Engineering Block B exceeded the Critical SLA target and was escalated to Level 1.',
        complaintId: firstComplaint?.id || null,
        referenceId: firstComplaint?.referenceId || null,
        isRead: false,
        createdAt: hoursAgo(2),
      },
      {
        id: newObjectId(),
        userId: userIds.superAdmin,
        eventType: 'COMPLAINT_SUBMITTED',
        title: 'New Complaint Filed: CMP-2026-0005',
        message: 'Campus Shuttle Route 4 Consistently Skipping North Gate Stop awaits department triage.',
        complaintId: this.state.complaints[4]?.id || null,
        referenceId: this.state.complaints[4]?.referenceId || null,
        isRead: false,
        createdAt: hoursAgo(6),
      },
      {
        id: newObjectId(),
        userId: userIds.superAdmin,
        eventType: 'COMPLAINT_RESOLVED',
        title: 'Resolution Confirmed: CMP-2026-0007',
        message: 'Library Reading Room Lighting Flicker was resolved by Vikramaditya Joshi (5/5 feedback).',
        complaintId: this.state.complaints[6]?.id || null,
        referenceId: this.state.complaints[6]?.referenceId || null,
        isRead: true,
        createdAt: daysAgo(5),
      },
    ];

    this.state.auditLogs = [
      {
        id: newObjectId(),
        actorUserId: userIds.superAdmin,
        actorName: 'Raghuraj Pratap Singh',
        actorRole: 'SUPER_ADMIN',
        action: 'SLA_POLICY_INITIALIZED',
        entityType: 'SLAPolicy',
        entityId: this.state.slaPolicies[0].id,
        details: 'Initialized configurable priority SLA targets (Critical 8h, High 24h, Medium 72h, Low 120h).',
        ipAddress: '127.0.0.1',
        createdAt: daysAgo(30),
      },
      {
        id: newObjectId(),
        actorUserId: null,
        actorName: 'SLA Escalation Engine',
        actorRole: 'SYSTEM',
        action: 'AUTO_ESCALATION_TRIGGERED',
        entityType: 'Complaint',
        entityId: firstComplaint?.referenceId || 'CMP-2026-0001',
        details: 'Escalated CMP-2026-0001 to Level 1 after breaching 6h ITNS Critical SLA deadline.',
        ipAddress: 'system',
        createdAt: hoursAgo(2),
      },
      {
        id: newObjectId(),
        actorUserId: userIds.deptAdminTech,
        actorName: 'Dr. Kavita Deshmukh',
        actorRole: 'DEPARTMENT_ADMIN',
        action: 'COMPLAINT_ASSIGNED',
        entityType: 'Complaint',
        entityId: firstComplaint?.referenceId || 'CMP-2026-0001',
        details: 'Assigned CMP-2026-0001 to Senior Network Engineer Priya Sharma.',
        ipAddress: '10.0.4.12',
        createdAt: hoursAgo(11),
      },
    ];
  }
}

export const db = new DatabaseService();
