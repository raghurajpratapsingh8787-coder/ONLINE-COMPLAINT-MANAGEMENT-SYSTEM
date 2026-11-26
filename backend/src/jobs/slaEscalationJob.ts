import { db, newObjectId } from '../config/database';
import { env } from '../config/env';
import { evaluateSlaStatus } from '../utils/domainRules';
import { broadcastComplaintUpdate, dispatchNotification } from '../services/socketService';

export async function runSlaEscalationSweep(): Promise<{ checked: number; escalated: number }> {
  const activeStatuses = ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Awaiting Response', 'Reopened'];
  const candidates = db.state.complaints.filter((c) => activeStatuses.includes(c.status));
  let escalatedCount = 0;

  for (const complaint of candidates) {
    const sla = evaluateSlaStatus(complaint.createdAt, complaint.slaDeadline, complaint.status, complaint.resolvedAt);
    const policy = db.state.slaPolicies.find((p) => p.priority === complaint.priority);

    if (sla.status === 'BREACHED' && policy?.autoEscalateOnBreach && complaint.escalationLevel === 0) {
      const prevStatus = complaint.status;
      complaint.status = 'Escalated';
      complaint.escalationLevel = 1;
      complaint.updatedAt = new Date().toISOString();

      const targetAdmin =
        db.state.users.find(
          (u) =>
            u.role === policy.escalateToRole &&
            (policy.escalateToRole === 'SUPER_ADMIN' || u.departmentId === complaint.departmentId)
        ) || db.state.users.find((u) => u.role === 'SUPER_ADMIN');

      db.state.escalations.unshift({
        id: newObjectId(),
        complaintId: complaint.id,
        level: 1,
        type: 'AUTOMATIC',
        reason: `Automatic SLA breach escalation (${complaint.priority} deadline exceeded).`,
        escalatedByUserId: null,
        escalatedToUserId: targetAdmin?.id || null,
        createdAt: new Date().toISOString(),
      });

      db.state.statusHistory.push({
        id: newObjectId(),
        complaintId: complaint.id,
        fromStatus: prevStatus,
        toStatus: 'Escalated',
        updatedByUserId: targetAdmin?.id || complaint.submittedById,
        updatedByName: 'SLA Escalation Engine',
        description: 'Complaint automatically escalated due to SLA resolution target breach.',
        comment: `Escalated to ${targetAdmin?.name || 'Super Admin'} (Level 1).`,
        createdAt: new Date().toISOString(),
      });

      db.addAuditLog({
        actorUserId: null,
        actorName: 'SLA Escalation Engine',
        actorRole: 'SYSTEM',
        action: 'AUTO_ESCALATION_TRIGGERED',
        entityType: 'Complaint',
        entityId: complaint.referenceId,
        details: `Auto-escalated ${complaint.referenceId} (${complaint.priority}) to Level 1 after breaching SLA deadline.`,
        ipAddress: 'system',
      });

      const notifyIds = [targetAdmin?.id, complaint.assignedStaffId, complaint.submittedById].filter(
        (v): v is string => Boolean(v)
      );

      await dispatchNotification({
        userIds: notifyIds,
        eventType: 'COMPLAINT_ESCALATED',
        title: `SLA Breach Escalation: ${complaint.referenceId}`,
        message: `"${complaint.title}" exceeded its ${complaint.priority} SLA deadline and has been automatically escalated.`,
        complaintId: complaint.id,
        referenceId: complaint.referenceId,
        sendEmail: true,
      });

      broadcastComplaintUpdate(complaint.id, { status: 'Escalated', escalationLevel: 1 });
      escalatedCount += 1;
    }
  }

  if (escalatedCount > 0) {
    db.persist();
  }

  return { checked: candidates.length, escalated: escalatedCount };
}

let timer: NodeJS.Timeout | null = null;

export function startSlaScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runSlaEscalationSweep().catch((err) => {
      console.error('[SLA Scheduler] Sweep error:', (err as Error).message);
    });
  }, env.SLA_CHECK_INTERVAL_MS);
  timer.unref();
}
