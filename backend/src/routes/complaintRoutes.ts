import crypto from 'node:crypto';
import { Router } from 'express';
import { ComplaintDoc, db, newObjectId, UserDoc } from '../config/database';
import { AuthenticatedRequest, requireAuth, requireRoles, trackingLimiter } from '../middleware/security';
import { streamComplaintPdf } from '../services/pdfService';
import {
  broadcastCommentCreated,
  broadcastComplaintUpdate,
  canUserAccessComplaint,
  dispatchNotification,
} from '../services/socketService';
import {
  computeSlaDeadline,
  evaluateSlaStatus,
  maskComplaintForPublicTracking,
  sanitizeComplaintForViewer,
  validateStatusTransition,
} from '../utils/domainRules';
import {
  assignComplaintSchema,
  commentSchema,
  createComplaintSchema,
  escalateSchema,
  feedbackSchema,
  transitionStatusSchema,
  updateComplaintSchema,
} from '../validators/schemas';

const router = Router();

function enrichComplaint(c: ComplaintDoc, viewer: UserDoc) {
  const dept = db.state.departments.find((d) => d.id === c.departmentId);
  const submitter = db.state.users.find((u) => u.id === c.submittedById);
  const assignee = c.assignedStaffId ? db.state.users.find((u) => u.id === c.assignedStaffId) : null;
  const resolvedBy = c.resolvedById ? db.state.users.find((u) => u.id === c.resolvedById) : null;

  const base = sanitizeComplaintForViewer(
    {
      ...c,
      departmentName: dept?.name || 'Unassigned',
      submittedByName: submitter?.name || 'Unknown',
      submittedByEmail: submitter?.email || '',
      assignedStaffName: assignee?.name || null,
      resolvedByName: resolvedBy?.name || null,
    },
    { id: viewer.id, role: viewer.role }
  );

  const sla = evaluateSlaStatus(c.createdAt, c.slaDeadline, c.status, c.resolvedAt);
  const attachmentsCount = db.state.attachments.filter((a) => a.complaintId === c.id).length;
  const commentsCount = db.state.comments.filter(
    (cm) => cm.complaintId === c.id && (viewer.role !== 'USER' || !cm.isInternal)
  ).length;

  return {
    ...base,
    departmentCode: dept?.code || '',
    sla,
    attachmentsCount,
    commentsCount,
  };
}

// Public rate-limited reference tracker (NEVER leaks submitter PII or internal staff notes)
router.get('/track/:referenceId', trackingLimiter, (req, res) => {
  const ref = String(req.params.referenceId || '').trim().toUpperCase();
  const complaint = db.state.complaints.find(
    (c) => c.referenceId.toUpperCase() === ref && c.status !== 'Draft'
  );
  if (!complaint) {
    res.status(404).json({ error: 'No complaint found matching that reference number.' });
    return;
  }

  const dept = db.state.departments.find((d) => d.id === complaint.departmentId);
  const assignee = complaint.assignedStaffId
    ? db.state.users.find((u) => u.id === complaint.assignedStaffId)
    : null;

  const masked = maskComplaintForPublicTracking({
    ...complaint,
    departmentName: dept?.name,
    assignedStaffName: assignee?.name || null,
  });

  const timeline = db.state.statusHistory
    .filter((h) => h.complaintId === complaint.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((h) => ({
      id: h.id,
      status: h.toStatus,
      description: h.description,
      updatedBy: h.updatedByUserId === complaint.submittedById ? 'Complainant' : h.updatedByName,
      createdAt: h.createdAt,
    }));

  const sla = evaluateSlaStatus(complaint.createdAt, complaint.slaDeadline, complaint.status, complaint.resolvedAt);
  res.json({ complaint: masked, timeline, sla });
});

// List complaints with strict role scoping, filtering, search, pagination
router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const viewer = req.user!;
  const {
    status,
    priority,
    category,
    departmentId,
    assignedToMe,
    search,
    sortBy = 'createdAt',
    sortDir = 'desc',
    page = '1',
    limit = '20',
  } = req.query as Record<string, string | undefined>;

  let list = db.state.complaints.filter((c) => {
    if (c.status === 'Draft' && c.submittedById !== viewer.id) return false;
    if (viewer.role === 'SUPER_ADMIN') return true;
    if (viewer.role === 'DEPARTMENT_ADMIN') {
      return c.departmentId === viewer.departmentId || c.submittedById === viewer.id;
    }
    if (viewer.role === 'STAFF') {
      return c.assignedStaffId === viewer.id || c.departmentId === viewer.departmentId || c.submittedById === viewer.id;
    }
    return c.submittedById === viewer.id;
  });

  if (status && status !== 'All') {
    if (status === 'Pending') {
      list = list.filter((c) => ['Submitted', 'Under Review', 'Assigned', 'Awaiting Response', 'Reopened'].includes(c.status));
    } else if (status === 'New') {
      list = list.filter((c) => c.status === 'Submitted' || c.status === 'Under Review');
    } else {
      list = list.filter((c) => c.status === status);
    }
  }

  if (priority && priority !== 'All') {
    list = list.filter((c) => c.priority === priority);
  }
  if (category && category !== 'All') {
    list = list.filter((c) => c.category === category);
  }
  if (departmentId && departmentId !== 'All') {
    list = list.filter((c) => c.departmentId === departmentId);
  }
  if (assignedToMe === 'true') {
    list = list.filter((c) => c.assignedStaffId === viewer.id);
  }
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter((c) => {
      const dept = db.state.departments.find((d) => d.id === c.departmentId);
      return (
        c.referenceId.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        (dept?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }

  const priorityRank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  list.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'priority') {
      cmp = (priorityRank[a.priority] || 0) - (priorityRank[b.priority] || 0);
    } else if (sortBy === 'updatedAt') {
      cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    } else if (sortBy === 'slaDeadline') {
      cmp = new Date(a.slaDeadline).getTime() - new Date(b.slaDeadline).getTime();
    } else {
      cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const paged = list.slice((safePage - 1) * safeLimit, safePage * safeLimit);

  res.json({
    complaints: paged.map((c) => enrichComplaint(c, viewer)),
    pagination: { page: safePage, limit: safeLimit, total, totalPages },
  });
});

// Create complaint (with duplicate protection & draft support)
router.post('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const viewer = req.user!;
    const parsed = createComplaintSchema.parse(req.body);

    const dept = db.state.departments.find((d) => d.id === parsed.departmentId && d.status === 'Active');
    if (!dept) {
      res.status(400).json({ error: 'Selected department is invalid or inactive.' });
      return;
    }

    const dedupeHash = crypto
      .createHash('sha256')
      .update(`${viewer.id}:${parsed.title.toLowerCase()}:${parsed.departmentId}`)
      .digest('hex');

    if (!parsed.saveAsDraft) {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const duplicate = db.state.complaints.find(
        (c) =>
          c.dedupeHash === dedupeHash &&
          c.status !== 'Draft' &&
          new Date(c.createdAt).getTime() > fiveMinutesAgo
      );
      if (duplicate) {
        res.status(409).json({
          error: `Duplicate submission detected. Your similar complaint (${duplicate.referenceId}) was already submitted recently.`,
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const targetHours = db.getSlaTargetHours(parsed.priority, dept.id);
    const slaDeadline = computeSlaDeadline(now, targetHours).toISOString();

    const complaint: ComplaintDoc = {
      id: newObjectId(),
      referenceId: db.nextReferenceId(),
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      departmentId: dept.id,
      priority: parsed.priority,
      status: parsed.saveAsDraft ? 'Draft' : 'Submitted',
      location: parsed.location,
      incidentDate: new Date(parsed.incidentDate).toISOString(),
      contactPreference: parsed.isAnonymous ? 'Anonymous' : parsed.contactPreference,
      isAnonymous: parsed.isAnonymous,
      submittedById: viewer.id,
      assignedStaffId: null,
      expectedResolutionDate: slaDeadline,
      slaDeadline,
      resolutionSummary: null,
      resolvedAt: null,
      resolvedById: null,
      rejectionReason: null,
      escalationLevel: 0,
      dedupeHash,
      createdAt: now,
      updatedAt: now,
    };

    db.state.complaints.unshift(complaint);
    db.state.statusHistory.push({
      id: newObjectId(),
      complaintId: complaint.id,
      fromStatus: null,
      toStatus: complaint.status,
      updatedByUserId: viewer.id,
      updatedByName: complaint.isAnonymous ? 'Anonymous Submitter' : viewer.name,
      description: parsed.saveAsDraft
        ? 'Complaint saved as draft.'
        : `Complaint submitted to ${dept.name}.`,
      comment: `Reference ID ${complaint.referenceId} · Priority: ${complaint.priority}`,
      createdAt: now,
    });

    db.addAuditLog({
      actorUserId: viewer.id,
      actorName: complaint.isAnonymous ? 'Anonymous Submitter' : viewer.name,
      actorRole: viewer.role,
      action: parsed.saveAsDraft ? 'COMPLAINT_DRAFT_SAVED' : 'COMPLAINT_SUBMITTED',
      entityType: 'Complaint',
      entityId: complaint.referenceId,
      details: `${complaint.status}: "${complaint.title}" (${complaint.category}, ${complaint.priority}).`,
      ipAddress: req.ip || '127.0.0.1',
    });

    db.persist();

    if (!parsed.saveAsDraft) {
      const adminIds = db.state.users
        .filter(
          (u) =>
            u.role === 'SUPER_ADMIN' ||
            (u.role === 'DEPARTMENT_ADMIN' && u.departmentId === dept.id)
        )
        .map((u) => u.id);

      await dispatchNotification({
        userIds: [...adminIds, viewer.id],
        eventType: 'COMPLAINT_SUBMITTED',
        title: `Complaint Registered: ${complaint.referenceId}`,
        message: `"${complaint.title}" was submitted to ${dept.name} (${complaint.priority} priority).`,
        complaintId: complaint.id,
        referenceId: complaint.referenceId,
        sendEmail: true,
      });

      broadcastComplaintUpdate(complaint.id, { status: complaint.status, event: 'created' });
    }

    res.status(201).json({ complaint: enrichComplaint(complaint, viewer) });
  } catch (err) {
    next(err);
  }
});

// Get single complaint with full timeline, comments (filtered by role), attachments, assignments, escalations, feedback
router.get('/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const viewer = req.user!;
  const complaint = db.state.complaints.find((c) => c.id === req.params.id);
  if (!complaint) {
    res.status(404).json({ error: 'Complaint not found.' });
    return;
  }
  if (!canUserAccessComplaint(viewer, complaint.id)) {
    res.status(403).json({ error: 'You are not authorized to view this complaint.' });
    return;
  }

  const timeline = db.state.statusHistory
    .filter((h) => h.complaintId === complaint.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Strictly prevent internal staff notes from ever being returned to USER role
  const comments = db.state.comments
    .filter((cm) => cm.complaintId === complaint.id && (viewer.role !== 'USER' || !cm.isInternal))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const attachments = db.state.attachments
    .filter((a) => a.complaintId === complaint.id)
    .map((a) => ({
      id: a.id,
      originalFilename: a.originalFilename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      isResolutionEvidence: a.isResolutionEvidence,
      uploadedByUserId: a.uploadedByUserId,
      createdAt: a.createdAt,
    }));

  const assignments = db.state.assignments
    .filter((a) => a.complaintId === complaint.id)
    .map((a) => {
      const assignedTo = a.assignedToUserId ? db.state.users.find((u) => u.id === a.assignedToUserId) : null;
      const assignedBy = db.state.users.find((u) => u.id === a.assignedByUserId);
      const dept = db.state.departments.find((d) => d.id === a.departmentId);
      return {
        ...a,
        assignedToName: assignedTo?.name || 'Unassigned',
        assignedByName: assignedBy?.name || 'System',
        departmentName: dept?.name || '',
      };
    });

  const escalations = db.state.escalations
    .filter((e) => e.complaintId === complaint.id)
    .map((e) => {
      const by = e.escalatedByUserId ? db.state.users.find((u) => u.id === e.escalatedByUserId) : null;
      const to = e.escalatedToUserId ? db.state.users.find((u) => u.id === e.escalatedToUserId) : null;
      return {
        ...e,
        escalatedByName: by?.name || 'SLA Escalation Engine',
        escalatedToName: to?.name || 'Super Admin',
      };
    });

  const feedback = db.state.feedback.find((f) => f.complaintId === complaint.id) || null;

  res.json({
    complaint: enrichComplaint(complaint, viewer),
    timeline,
    comments,
    attachments,
    assignments,
    escalations,
    feedback,
  });
});

// Edit eligible complaint (Draft or Submitted by owner, or Admin)
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const viewer = req.user!;
    const complaint = db.state.complaints.find((c) => c.id === req.params.id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const isOwner = complaint.submittedById === viewer.id;
    const isAdmin = viewer.role === 'SUPER_ADMIN' || (viewer.role === 'DEPARTMENT_ADMIN' && complaint.departmentId === viewer.departmentId);
    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: 'Not authorized to edit this complaint.' });
      return;
    }
    if (isOwner && !isAdmin && !['Draft', 'Submitted'].includes(complaint.status)) {
      res.status(400).json({ error: 'Complaints can only be edited while in Draft or Submitted status.' });
      return;
    }

    const parsed = updateComplaintSchema.parse(req.body);
    if (parsed.departmentId !== undefined && parsed.departmentId !== complaint.departmentId) {
      if (viewer.role === 'DEPARTMENT_ADMIN' && parsed.departmentId !== viewer.departmentId) {
        res.status(403).json({ error: 'Department admins cannot transfer complaints to another department.' });
        return;
      }
      const targetDept = db.state.departments.find((d) => d.id === parsed.departmentId && d.status === 'Active');
      if (!targetDept) {
        res.status(400).json({ error: 'Selected department is invalid or inactive.' });
        return;
      }
      complaint.departmentId = targetDept.id;
    }
    if (parsed.title !== undefined) complaint.title = parsed.title;
    if (parsed.description !== undefined) complaint.description = parsed.description;
    if (parsed.category !== undefined) complaint.category = parsed.category;
    if (parsed.priority !== undefined) {
      complaint.priority = parsed.priority;
      const targetHours = db.getSlaTargetHours(parsed.priority, complaint.departmentId);
      complaint.slaDeadline = computeSlaDeadline(complaint.createdAt, targetHours).toISOString();
    }
    if (parsed.location !== undefined) complaint.location = parsed.location;
    if (parsed.incidentDate !== undefined) complaint.incidentDate = new Date(parsed.incidentDate).toISOString();
    if (parsed.isAnonymous !== undefined) complaint.isAnonymous = parsed.isAnonymous;
    if (parsed.contactPreference !== undefined) {
      complaint.contactPreference = complaint.isAnonymous ? 'Anonymous' : parsed.contactPreference;
    } else if (complaint.isAnonymous) {
      complaint.contactPreference = 'Anonymous';
    }

    if (parsed.submitDraft && complaint.status === 'Draft') {
      complaint.status = 'Submitted';
      db.state.statusHistory.push({
        id: newObjectId(),
        complaintId: complaint.id,
        fromStatus: 'Draft',
        toStatus: 'Submitted',
        updatedByUserId: viewer.id,
        updatedByName: complaint.isAnonymous ? 'Anonymous Submitter' : viewer.name,
        description: 'Draft finalized and formally submitted.',
        comment: `Reference ID ${complaint.referenceId} active.`,
        createdAt: new Date().toISOString(),
      });
    }

    complaint.updatedAt = new Date().toISOString();
    db.addAuditLog({
      actorUserId: viewer.id,
      actorName: complaint.isAnonymous && isOwner ? 'Anonymous Submitter' : viewer.name,
      actorRole: viewer.role,
      action: 'COMPLAINT_UPDATED',
      entityType: 'Complaint',
      entityId: complaint.referenceId,
      details: `Updated complaint ${complaint.referenceId} (${complaint.status}).`,
      ipAddress: req.ip || '127.0.0.1',
    });
    db.persist();
    broadcastComplaintUpdate(complaint.id, { status: complaint.status });
    res.json({ complaint: enrichComplaint(complaint, viewer) });
  } catch (err) {
    next(err);
  }
});

// Assign / Reassign complaint to department & staff
router.post('/:id/assign', requireAuth, requireRoles('SUPER_ADMIN', 'DEPARTMENT_ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const viewer = req.user!;
    const complaint = db.state.complaints.find((c) => c.id === req.params.id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    if (viewer.role === 'DEPARTMENT_ADMIN' && complaint.departmentId !== viewer.departmentId) {
      res.status(403).json({ error: 'Department admins can only manage complaints within their department.' });
      return;
    }

    const parsed = assignComplaintSchema.parse(req.body);
    if (viewer.role === 'DEPARTMENT_ADMIN' && parsed.departmentId !== viewer.departmentId) {
      res.status(403).json({ error: 'Department admins cannot transfer complaints to another department.' });
      return;
    }

    const dept = db.state.departments.find((d) => d.id === parsed.departmentId && d.status === 'Active');
    if (!dept) {
      res.status(400).json({ error: 'Target department not found or inactive.' });
      return;
    }

    let assignee: UserDoc | null = null;
    if (parsed.assignedStaffId) {
      assignee =
        db.state.users.find(
          (u) =>
            u.id === parsed.assignedStaffId &&
            u.isActive &&
            ['STAFF', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN'].includes(u.role)
        ) || null;
      if (!assignee) {
        res.status(400).json({ error: 'Selected staff member is invalid or inactive.' });
        return;
      }
      if (viewer.role === 'DEPARTMENT_ADMIN' && assignee.departmentId !== viewer.departmentId) {
        res.status(403).json({ error: 'Cannot assign staff outside your department.' });
        return;
      }
    }

    const previousStaffId = complaint.assignedStaffId;
    const prevStatus = complaint.status;
    complaint.departmentId = dept.id;
    complaint.assignedStaffId = assignee?.id || null;
    if (parsed.priority) {
      complaint.priority = parsed.priority;
      const targetHours = db.getSlaTargetHours(parsed.priority, dept.id);
      complaint.slaDeadline = computeSlaDeadline(complaint.createdAt, targetHours).toISOString();
    }
    if (parsed.expectedResolutionDate) {
      complaint.expectedResolutionDate = new Date(parsed.expectedResolutionDate).toISOString();
    }
    if (assignee && ['Submitted', 'Under Review', 'Reopened'].includes(complaint.status)) {
      complaint.status = 'Assigned';
    }
    complaint.updatedAt = new Date().toISOString();

    const now = new Date().toISOString();
    db.state.assignments.unshift({
      id: newObjectId(),
      complaintId: complaint.id,
      departmentId: dept.id,
      assignedToUserId: assignee?.id || null,
      assignedByUserId: viewer.id,
      previousAssignedToUserId: previousStaffId,
      notes: parsed.notes,
      expectedResolutionDate: complaint.expectedResolutionDate,
      createdAt: now,
    });

    db.state.statusHistory.push({
      id: newObjectId(),
      complaintId: complaint.id,
      fromStatus: prevStatus,
      toStatus: complaint.status,
      updatedByUserId: viewer.id,
      updatedByName: viewer.name,
      description: assignee
        ? `Assigned to ${assignee.name} (${dept.name}).`
        : `Routed to ${dept.name} queue.`,
      comment: parsed.notes || 'Assignment updated.',
      createdAt: now,
    });

    db.addAuditLog({
      actorUserId: viewer.id,
      actorName: viewer.name,
      actorRole: viewer.role,
      action: 'COMPLAINT_ASSIGNED',
      entityType: 'Complaint',
      entityId: complaint.referenceId,
      details: `Assigned ${complaint.referenceId} to ${assignee?.name || 'Department Queue'} (${dept.name}).`,
      ipAddress: req.ip || '127.0.0.1',
    });

    db.persist();

    const notifyTargets = [assignee?.id, complaint.submittedById].filter((v): v is string => Boolean(v));
    await dispatchNotification({
      userIds: notifyTargets,
      eventType: 'COMPLAINT_ASSIGNED',
      title: `Complaint Assigned: ${complaint.referenceId}`,
      message: assignee
        ? `"${complaint.title}" has been assigned to ${assignee.name} (${dept.name}).`
        : `"${complaint.title}" has been routed to ${dept.name}.`,
      complaintId: complaint.id,
      referenceId: complaint.referenceId,
      sendEmail: true,
    });

    broadcastComplaintUpdate(complaint.id, { status: complaint.status, assignedStaffId: complaint.assignedStaffId });
    res.json({ complaint: enrichComplaint(complaint, viewer) });
  } catch (err) {
    next(err);
  }
});

// Status transition endpoint (validated state machine, resolution summary, rejection reason, reopen)
router.post('/:id/status', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const viewer = req.user!;
    const complaint = db.state.complaints.find((c) => c.id === req.params.id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    if (!canUserAccessComplaint(viewer, complaint.id)) {
      res.status(403).json({ error: 'Not authorized to update this complaint.' });
      return;
    }
    if (viewer.role === 'STAFF' && complaint.assignedStaffId !== viewer.id && complaint.departmentId !== viewer.departmentId) {
      res.status(403).json({ error: 'Staff may only update assigned or departmental complaints.' });
      return;
    }

    const parsed = transitionStatusSchema.parse(req.body);
    const check = validateStatusTransition({
      fromStatus: complaint.status,
      toStatus: parsed.status,
      actorRole: viewer.role,
      reason: parsed.reason,
      resolutionSummary: parsed.resolutionSummary,
    });

    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }

    const prevStatus = complaint.status;
    const now = new Date().toISOString();
    complaint.status = parsed.status;
    complaint.updatedAt = now;

    if (parsed.status === 'Resolved') {
      complaint.resolutionSummary = parsed.resolutionSummary!.trim();
      complaint.resolvedAt = now;
      complaint.resolvedById = viewer.id;
    } else if (parsed.status === 'Rejected') {
      complaint.rejectionReason = parsed.reason!.trim();
      complaint.resolvedAt = now;
      complaint.resolvedById = viewer.id;
    } else if (parsed.status === 'Reopened') {
      complaint.resolvedAt = null;
    }

    db.state.statusHistory.push({
      id: newObjectId(),
      complaintId: complaint.id,
      fromStatus: prevStatus,
      toStatus: parsed.status,
      updatedByUserId: viewer.id,
      updatedByName: viewer.role === 'USER' && complaint.isAnonymous ? 'Anonymous Submitter' : viewer.name,
      description: `Status transitioned from ${prevStatus} to ${parsed.status}.`,
      comment: parsed.resolutionSummary || parsed.reason || parsed.comment || '',
      createdAt: now,
    });

    db.addAuditLog({
      actorUserId: viewer.id,
      actorName: viewer.name,
      actorRole: viewer.role,
      action: `STATUS_${parsed.status.toUpperCase().replace(/\s+/g, '_')}`,
      entityType: 'Complaint',
      entityId: complaint.referenceId,
      details: `${complaint.referenceId}: ${prevStatus} -> ${parsed.status}.`,
      ipAddress: req.ip || '127.0.0.1',
    });

    db.persist();

    const notifyTargets = [complaint.submittedById, complaint.assignedStaffId].filter(
      (id): id is string => Boolean(id) && id !== viewer.id
    );
    const eventType =
      parsed.status === 'Resolved'
        ? 'COMPLAINT_RESOLVED'
        : parsed.status === 'Rejected'
          ? 'COMPLAINT_REJECTED'
          : 'STATUS_CHANGED';

    await dispatchNotification({
      userIds: notifyTargets,
      eventType,
      title: `${complaint.referenceId} is now ${parsed.status}`,
      message:
        parsed.resolutionSummary ||
        parsed.reason ||
        parsed.comment ||
        `Status updated from ${prevStatus} to ${parsed.status}.`,
      complaintId: complaint.id,
      referenceId: complaint.referenceId,
      sendEmail: true,
    });

    broadcastComplaintUpdate(complaint.id, { status: complaint.status });
    res.json({ complaint: enrichComplaint(complaint, viewer) });
  } catch (err) {
    next(err);
  }
});

// Manual Escalation
router.post('/:id/escalate', requireAuth, requireRoles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'STAFF'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const viewer = req.user!;
    const complaint = db.state.complaints.find((c) => c.id === req.params.id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    if (!canUserAccessComplaint(viewer, complaint.id)) {
      res.status(403).json({ error: 'Not authorized to escalate this complaint.' });
      return;
    }

    const parsed = escalateSchema.parse(req.body);
    const prevStatus = complaint.status;
    const now = new Date().toISOString();
    complaint.escalationLevel += 1;
    complaint.status = 'Escalated';
    complaint.updatedAt = now;

    const superAdmin = db.state.users.find((u) => u.role === 'SUPER_ADMIN');
    let targetUserId: string | null = superAdmin?.id || null;
    if (parsed.escalatedToUserId) {
      const targetAdmin = db.state.users.find(
        (u) =>
          u.id === parsed.escalatedToUserId &&
          u.isActive &&
          (u.role === 'SUPER_ADMIN' || u.role === 'DEPARTMENT_ADMIN')
      );
      if (!targetAdmin) {
        res.status(400).json({ error: 'Escalation target must be an active administrator.' });
        return;
      }
      targetUserId = targetAdmin.id;
    }

    db.state.escalations.unshift({
      id: newObjectId(),
      complaintId: complaint.id,
      level: complaint.escalationLevel,
      type: 'MANUAL',
      reason: parsed.reason,
      escalatedByUserId: viewer.id,
      escalatedToUserId: targetUserId,
      createdAt: now,
    });

    db.state.statusHistory.push({
      id: newObjectId(),
      complaintId: complaint.id,
      fromStatus: prevStatus,
      toStatus: 'Escalated',
      updatedByUserId: viewer.id,
      updatedByName: viewer.name,
      description: `Manually escalated to Level ${complaint.escalationLevel}.`,
      comment: parsed.reason,
      createdAt: now,
    });

    db.addAuditLog({
      actorUserId: viewer.id,
      actorName: viewer.name,
      actorRole: viewer.role,
      action: 'MANUAL_ESCALATION',
      entityType: 'Complaint',
      entityId: complaint.referenceId,
      details: `Escalated ${complaint.referenceId} to Level ${complaint.escalationLevel}: ${parsed.reason}`,
      ipAddress: req.ip || '127.0.0.1',
    });

    db.persist();

    await dispatchNotification({
      userIds: [targetUserId, complaint.assignedStaffId, complaint.submittedById].filter(
        (id): id is string => Boolean(id) && id !== viewer.id
      ),
      eventType: 'COMPLAINT_ESCALATED',
      title: `Escalation Level ${complaint.escalationLevel}: ${complaint.referenceId}`,
      message: parsed.reason,
      complaintId: complaint.id,
      referenceId: complaint.referenceId,
      sendEmail: true,
    });

    broadcastComplaintUpdate(complaint.id, { status: 'Escalated', escalationLevel: complaint.escalationLevel });
    res.json({ complaint: enrichComplaint(complaint, viewer) });
  } catch (err) {
    next(err);
  }
});

// Comments & Internal Notes
router.post('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const viewer = req.user!;
    const complaint = db.state.complaints.find((c) => c.id === req.params.id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    if (!canUserAccessComplaint(viewer, complaint.id)) {
      res.status(403).json({ error: 'Not authorized to comment on this complaint.' });
      return;
    }

    const parsed = commentSchema.parse(req.body);
    if (viewer.role === 'USER' && (parsed.isInternal || parsed.isInfoRequest)) {
      res.status(403).json({ error: 'Internal notes and info requests are restricted to staff.' });
      return;
    }

    const now = new Date().toISOString();
    const comment = {
      id: newObjectId(),
      complaintId: complaint.id,
      authorUserId: viewer.id,
      authorName: viewer.role === 'USER' && complaint.isAnonymous ? 'Anonymous Submitter' : viewer.name,
      authorRole: viewer.role,
      body: parsed.body,
      isInternal: parsed.isInternal,
      isInfoRequest: parsed.isInfoRequest,
      createdAt: now,
    };

    db.state.comments.push(comment);
    complaint.updatedAt = now;

    if (parsed.isInfoRequest && ['Under Review', 'Assigned', 'In Progress'].includes(complaint.status)) {
      const prevStatus = complaint.status;
      complaint.status = 'Awaiting Response';
      db.state.statusHistory.push({
        id: newObjectId(),
        complaintId: complaint.id,
        fromStatus: prevStatus,
        toStatus: 'Awaiting Response',
        updatedByUserId: viewer.id,
        updatedByName: viewer.name,
        description: 'Additional information requested from complainant.',
        comment: parsed.body.slice(0, 140),
        createdAt: now,
      });
    }

    db.persist();
    broadcastCommentCreated(complaint.id, comment, parsed.isInternal);

    if (!parsed.isInternal) {
      const targets = [complaint.submittedById, complaint.assignedStaffId].filter(
        (id): id is string => Boolean(id) && id !== viewer.id
      );
      await dispatchNotification({
        userIds: targets,
        eventType: parsed.isInfoRequest ? 'INFO_REQUESTED' : 'STAFF_RESPONSE',
        title: parsed.isInfoRequest
          ? `Information Requested: ${complaint.referenceId}`
          : `New Message on ${complaint.referenceId}`,
        message: `${comment.authorName}: ${parsed.body.slice(0, 160)}`,
        complaintId: complaint.id,
        referenceId: complaint.referenceId,
        sendEmail: parsed.isInfoRequest,
      });
    }

    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
});

// Submitter Feedback on Resolved Complaint
router.post('/:id/feedback', requireAuth, (req: AuthenticatedRequest, res, next) => {
  try {
    const viewer = req.user!;
    const complaint = db.state.complaints.find((c) => c.id === req.params.id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    if (complaint.submittedById !== viewer.id && viewer.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Only the complainant may submit resolution feedback.' });
      return;
    }
    if (complaint.status !== 'Resolved') {
      res.status(400).json({ error: 'Feedback can only be submitted once a complaint is Resolved.' });
      return;
    }

    const parsed = feedbackSchema.parse(req.body);
    const existingIdx = db.state.feedback.findIndex((f) => f.complaintId === complaint.id);
    const record = {
      id: existingIdx >= 0 ? db.state.feedback[existingIdx].id : newObjectId(),
      complaintId: complaint.id,
      userId: viewer.id,
      rating: parsed.rating,
      comment: parsed.comment,
      createdAt: new Date().toISOString(),
    };
    if (existingIdx >= 0) db.state.feedback[existingIdx] = record;
    else db.state.feedback.push(record);
    db.persist();
    res.status(201).json({ feedback: record });
  } catch (err) {
    next(err);
  }
});

// Download PDF Dossier
router.get('/:id/pdf', requireAuth, (req: AuthenticatedRequest, res) => {
  const viewer = req.user!;
  const complaint = db.state.complaints.find((c) => c.id === req.params.id);
  if (!complaint) {
    res.status(404).json({ error: 'Complaint not found.' });
    return;
  }
  if (!canUserAccessComplaint(viewer, complaint.id)) {
    res.status(403).json({ error: 'Not authorized to download this report.' });
    return;
  }
  streamComplaintPdf(res, complaint, viewer);
});

export default router;
