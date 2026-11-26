import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { ComplaintDoc, db, UserDoc } from '../config/database';
import { computeAverageResolutionHours, evaluateSlaStatus, sanitizeComplaintForViewer } from '../utils/domainRules';

export function streamComplaintPdf(res: Response, complaint: ComplaintDoc, viewer: UserDoc): void {
  const dept = db.state.departments.find((d) => d.id === complaint.departmentId);
  const submitter = db.state.users.find((u) => u.id === complaint.submittedById);
  const assignee = complaint.assignedStaffId
    ? db.state.users.find((u) => u.id === complaint.assignedStaffId)
    : null;
  const safe = sanitizeComplaintForViewer(
    {
      ...complaint,
      departmentName: dept?.name,
      submittedByName: submitter?.name,
      submittedByEmail: submitter?.email,
      assignedStaffName: assignee?.name || null,
    },
    { id: viewer.id, role: viewer.role }
  );

  const timeline = db.state.statusHistory
    .filter((h) => h.complaintId === complaint.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const sla = evaluateSlaStatus(complaint.createdAt, complaint.slaDeadline, complaint.status, complaint.resolvedAt);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${complaint.referenceId}-report.pdf"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text('ResolveDesk — Official Complaint Dossier');
  doc.moveDown(0.25);
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#475569')
    .text(`Generated ${new Date().toLocaleString()} · Platform Admin: Raghuraj Pratap Singh (raghurajpratapsingh8787@gmail.com)`);
  doc.moveDown(1);

  doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold').text(`${safe.referenceId} — ${safe.title}`);
  doc.moveDown(0.5);

  const metaRows: Array<[string, string]> = [
    ['Status', safe.status],
    ['Priority', safe.priority],
    ['Category', safe.category],
    ['Department', safe.departmentName || 'N/A'],
    ['Location', safe.location],
    ['Incident Date', new Date(safe.incidentDate).toLocaleString()],
    ['Submitted By', safe.isAnonymous && viewer.id !== complaint.submittedById ? 'Anonymous Submitter' : `${safe.submittedByName || 'Unknown'} (${safe.submittedByEmail || ''})`],
    ['Assigned Staff', safe.assignedStaffName || 'Unassigned'],
    ['SLA Status', `${sla.status} (Deadline: ${new Date(safe.slaDeadline).toLocaleString()})`],
    ['Escalation Level', `Level ${safe.escalationLevel}`],
  ];

  doc.fontSize(10);
  for (const [label, value] of metaRows) {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);
  }

  doc.moveDown(1);
  doc.fontSize(11).font('Helvetica-Bold').text('Complaint Description');
  doc.moveDown(0.25);
  doc.fontSize(10).font('Helvetica').text(safe.description, { align: 'left', lineGap: 3 });

  if (safe.resolutionSummary) {
    doc.moveDown(1);
    doc.fontSize(11).font('Helvetica-Bold').text('Resolution Summary');
    doc.moveDown(0.25);
    doc.fontSize(10).font('Helvetica').text(safe.resolutionSummary, { lineGap: 3 });
  }

  if (safe.rejectionReason) {
    doc.moveDown(1);
    doc.fontSize(11).font('Helvetica-Bold').text('Rejection Justification');
    doc.moveDown(0.25);
    doc.fontSize(10).font('Helvetica').text(safe.rejectionReason, { lineGap: 3 });
  }

  doc.moveDown(1);
  doc.fontSize(11).font('Helvetica-Bold').text('Progress & Audit Timeline');
  doc.moveDown(0.35);

  for (const entry of timeline) {
    doc
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .text(`${new Date(entry.createdAt).toLocaleString()} — ${entry.toStatus} (${entry.updatedByName})`);
    doc.fontSize(9).font('Helvetica').fillColor('#334155').text(`  ${entry.description}`);
    if (entry.comment) {
      doc.fontSize(8.5).fillColor('#64748B').text(`  Note: ${entry.comment}`);
    }
    doc.fillColor('#0F172A').moveDown(0.35);
  }

  doc.end();
}

export function streamExecutiveSummaryPdf(res: Response, viewer: UserDoc): void {
  const isDeptScoped = viewer.role === 'DEPARTMENT_ADMIN' && Boolean(viewer.departmentId);
  const complaints = db.state.complaints.filter(
    (c) => c.status !== 'Draft' && (!isDeptScoped || c.departmentId === viewer.departmentId)
  );
  const departments = isDeptScoped
    ? db.state.departments.filter((d) => d.id === viewer.departmentId)
    : db.state.departments;
  const resolved = complaints.filter((c) => c.status === 'Resolved');
  const escalated = complaints.filter((c) => c.status === 'Escalated' || c.escalationLevel > 0);
  const avgHours = computeAverageResolutionHours(complaints);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ResolveDesk-Executive-Analytics-${new Date().toISOString().slice(0, 10)}.pdf"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  doc.pipe(res);

  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .text(isDeptScoped ? 'ResolveDesk — Departmental Analytics & SLA Report' : 'ResolveDesk — Executive Analytics & SLA Report');
  doc.moveDown(0.25);
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#475569')
    .text(`Generated ${new Date().toLocaleString()} · Chief Systems Architect: Raghuraj Pratap Singh (raghurajpratapsingh8787@gmail.com)`);
  doc.moveDown(1);

  doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text('System Overview Metrics');
  doc.moveDown(0.4);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Total Active & Historical Complaints: ${complaints.length}`);
  doc.text(`Resolved Complaints: ${resolved.length} (${complaints.length ? Math.round((resolved.length / complaints.length) * 100) : 0}% Resolution Rate)`);
  doc.text(`Escalated Cases: ${escalated.length}`);
  doc.text(`Average Resolution Time: ${avgHours} hours`);
  doc.moveDown(1);

  doc.fontSize(12).font('Helvetica-Bold').text('Department Performance Breakdown');
  doc.moveDown(0.4);

  for (const dept of departments) {
    const deptComplaints = complaints.filter((c) => c.departmentId === dept.id);
    const deptResolved = deptComplaints.filter((c) => c.status === 'Resolved').length;
    const deptOpen = deptComplaints.filter((c) => !['Resolved', 'Rejected'].includes(c.status)).length;
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(`${dept.name} (${dept.code})`, { continued: true })
      .font('Helvetica')
      .text(` — Total: ${deptComplaints.length} | Open: ${deptOpen} | Resolved: ${deptResolved}`);
  }

  doc.end();
}
