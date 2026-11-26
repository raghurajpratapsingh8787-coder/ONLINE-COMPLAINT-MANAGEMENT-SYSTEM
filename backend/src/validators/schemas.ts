import { z } from 'zod';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUSES,
  CONTACT_PREFERENCES,
  USER_ROLES,
} from '../utils/domainRules';

export const claimAdminSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[0-9]/, 'Password must include a number'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Valid email address is required').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Include at least one uppercase letter')
    .regex(/[0-9]/, 'Include at least one digit'),
  phone: z.string().trim().max(30).optional().default(''),
  title: z.string().trim().max(120).optional().default('Member'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required').max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  token: z.string().min(16),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  title: z.string().trim().max(120).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});

export const createComplaintSchema = z.object({
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(180),
  description: z
    .string()
    .trim()
    .min(20, 'Description must be at least 20 characters')
    .max(4000, 'Description cannot exceed 4,000 characters'),
  category: z.enum(COMPLAINT_CATEGORIES),
  departmentId: z.string().min(8, 'Select a valid department'),
  priority: z.enum(COMPLAINT_PRIORITIES).default('Medium'),
  location: z.string().trim().min(2, 'Location is required').max(200),
  incidentDate: z.string().refine((val) => !Number.isNaN(Date.parse(val)), 'Valid incident date required'),
  contactPreference: z.enum(CONTACT_PREFERENCES).default('Email'),
  isAnonymous: z.boolean().default(false),
  saveAsDraft: z.boolean().optional().default(false),
});

export const updateComplaintSchema = z.object({
  title: z.string().trim().min(5).max(180).optional(),
  description: z.string().trim().min(20).max(4000).optional(),
  category: z.enum(COMPLAINT_CATEGORIES).optional(),
  departmentId: z.string().min(8).optional(),
  priority: z.enum(COMPLAINT_PRIORITIES).optional(),
  location: z.string().trim().min(2).max(200).optional(),
  incidentDate: z.string().refine((val) => !Number.isNaN(Date.parse(val))).optional(),
  contactPreference: z.enum(CONTACT_PREFERENCES).optional(),
  isAnonymous: z.boolean().optional(),
  submitDraft: z.boolean().optional(),
});

export const assignComplaintSchema = z.object({
  departmentId: z.string().min(8),
  assignedStaffId: z.string().min(8).nullable().optional(),
  priority: z.enum(COMPLAINT_PRIORITIES).optional(),
  expectedResolutionDate: z.string().nullable().optional(),
  notes: z.string().trim().max(1000).optional().default(''),
});

export const transitionStatusSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES),
  comment: z.string().trim().max(1500).optional().default(''),
  reason: z.string().trim().max(1500).optional(),
  resolutionSummary: z.string().trim().max(2500).optional(),
});

export const commentSchema = z.object({
  body: z.string().trim().min(2, 'Message cannot be empty').max(2000),
  isInternal: z.boolean().optional().default(false),
  isInfoRequest: z.boolean().optional().default(false),
});

export const escalateSchema = z.object({
  reason: z.string().trim().min(10, 'Provide a clear escalation reason (min 10 chars)').max(1000),
  escalatedToUserId: z.string().nullable().optional(),
});

export const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().default(''),
});

export const departmentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .transform((v) => v.toUpperCase()),
  description: z.string().trim().min(10).max(600),
  headUserId: z.string().nullable().optional().default(null),
  status: z.enum(['Active', 'Inactive']).optional().default('Active'),
  slaOverrideHours: z
    .object({
      Critical: z.number().min(1).max(720).nullable().optional(),
      High: z.number().min(1).max(720).nullable().optional(),
      Medium: z.number().min(1).max(720).nullable().optional(),
      Low: z.number().min(1).max(720).nullable().optional(),
    })
    .optional(),
});

export const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
  role: z.enum(['DEPARTMENT_ADMIN', 'STAFF']),
  departmentId: z.string().min(8),
  employeeCode: z.string().trim().min(3).max(24),
  designation: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().default(''),
  specializations: z.array(z.string().trim().min(1)).optional().default([]),
  maxActiveLoad: z.number().int().min(1).max(100).optional().default(15),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
  departmentId: z.string().nullable().optional(),
});

export const updateSlaPolicySchema = z.object({
  priority: z.enum(COMPLAINT_PRIORITIES),
  responseTargetHours: z.number().min(1).max(720),
  resolutionTargetHours: z.number().min(1).max(2160),
  autoEscalateOnBreach: z.boolean(),
  escalateToRole: z.enum(['DEPARTMENT_ADMIN', 'SUPER_ADMIN']),
});
