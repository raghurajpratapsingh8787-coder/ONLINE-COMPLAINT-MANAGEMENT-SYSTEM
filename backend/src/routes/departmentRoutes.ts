import { Router } from 'express';
import { db, newObjectId } from '../config/database';
import { AuthenticatedRequest, requireAuth, requireRoles } from '../middleware/security';
import { departmentSchema } from '../validators/schemas';

const router = Router();

router.get('/', requireAuth, (_req, res) => {
  const departments = db.state.departments.map((d) => {
    const head = d.headUserId ? db.state.users.find((u) => u.id === d.headUserId) : null;
    const deptComplaints = db.state.complaints.filter((c) => c.departmentId === d.id && c.status !== 'Draft');
    const activeComplaints = deptComplaints.filter((c) => !['Resolved', 'Rejected'].includes(c.status)).length;
    const resolvedComplaints = deptComplaints.filter((c) => c.status === 'Resolved').length;
    const staffCount = db.state.staff.filter((s) => s.departmentId === d.id).length;

    return {
      ...d,
      headName: head?.name || 'Unassigned',
      staffCount,
      totalComplaints: deptComplaints.length,
      activeComplaints,
      resolvedComplaints,
    };
  });
  res.json({ departments });
});

router.post('/', requireAuth, requireRoles('SUPER_ADMIN'), (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = departmentSchema.parse(req.body);
    if (db.state.departments.some((d) => d.code === parsed.code || d.name.toLowerCase() === parsed.name.toLowerCase())) {
      res.status(409).json({ error: 'Department name or code already exists.' });
      return;
    }
    if (parsed.headUserId) {
      const validHead = db.state.users.some(
        (u) => u.id === parsed.headUserId && u.isActive && u.role !== 'USER'
      );
      if (!validHead) {
        res.status(400).json({ error: 'Selected department head must be an active staff or administrator account.' });
        return;
      }
    }

    const now = new Date().toISOString();
    const dept = {
      id: newObjectId(),
      name: parsed.name,
      code: parsed.code,
      description: parsed.description,
      headUserId: parsed.headUserId || null,
      status: parsed.status,
      slaOverrideHours: {
        Critical: parsed.slaOverrideHours?.Critical ?? null,
        High: parsed.slaOverrideHours?.High ?? null,
        Medium: parsed.slaOverrideHours?.Medium ?? null,
        Low: parsed.slaOverrideHours?.Low ?? null,
      },
      createdAt: now,
      updatedAt: now,
    };

    db.state.departments.push(dept);
    db.addAuditLog({
      actorUserId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'DEPARTMENT_CREATED',
      entityType: 'Department',
      entityId: dept.id,
      details: `Created department ${dept.name} (${dept.code}).`,
      ipAddress: req.ip || '127.0.0.1',
    });
    db.persist();

    res.status(201).json({ department: dept });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireAuth, requireRoles('SUPER_ADMIN'), (req: AuthenticatedRequest, res, next) => {
  try {
    const dept = db.state.departments.find((d) => d.id === req.params.id);
    if (!dept) {
      res.status(404).json({ error: 'Department not found.' });
      return;
    }

    const parsed = departmentSchema.partial().parse(req.body);
    if (parsed.name !== undefined) dept.name = parsed.name;
    if (parsed.code !== undefined) dept.code = parsed.code;
    if (parsed.description !== undefined) dept.description = parsed.description;
    if (parsed.headUserId) {
      const validHead = db.state.users.some(
        (u) => u.id === parsed.headUserId && u.isActive && u.role !== 'USER'
      );
      if (!validHead) {
        res.status(400).json({ error: 'Selected department head must be an active staff or administrator account.' });
        return;
      }
    }
    if (parsed.headUserId !== undefined) dept.headUserId = parsed.headUserId;
    if (parsed.status !== undefined) dept.status = parsed.status;
    if (parsed.slaOverrideHours !== undefined) {
      dept.slaOverrideHours = {
        Critical: parsed.slaOverrideHours.Critical ?? dept.slaOverrideHours.Critical,
        High: parsed.slaOverrideHours.High ?? dept.slaOverrideHours.High,
        Medium: parsed.slaOverrideHours.Medium ?? dept.slaOverrideHours.Medium,
        Low: parsed.slaOverrideHours.Low ?? dept.slaOverrideHours.Low,
      };
    }
    dept.updatedAt = new Date().toISOString();

    db.addAuditLog({
      actorUserId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'DEPARTMENT_UPDATED',
      entityType: 'Department',
      entityId: dept.id,
      details: `Updated department ${dept.name} (${dept.code}).`,
      ipAddress: req.ip || '127.0.0.1',
    });
    db.persist();
    res.json({ department: dept });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requireRoles('SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
  const idx = db.state.departments.findIndex((d) => d.id === req.params.id);
  if (idx < 0) {
    res.status(404).json({ error: 'Department not found.' });
    return;
  }

  const dept = db.state.departments[idx];
  const openCount = db.state.complaints.filter(
    (c) => c.departmentId === dept.id && !['Resolved', 'Rejected'].includes(c.status)
  ).length;
  if (openCount > 0) {
    res.status(400).json({
      error: `Cannot delete ${dept.name} while ${openCount} open complaint(s) remain assigned to it.`,
    });
    return;
  }

  db.state.departments.splice(idx, 1);
  db.addAuditLog({
    actorUserId: req.user!.id,
    actorName: req.user!.name,
    actorRole: req.user!.role,
    action: 'DEPARTMENT_DELETED',
    entityType: 'Department',
    entityId: dept.id,
    details: `Removed department ${dept.name} (${dept.code}).`,
    ipAddress: req.ip || '127.0.0.1',
  });
  db.persist();
  res.json({ ok: true });
});

export default router;
