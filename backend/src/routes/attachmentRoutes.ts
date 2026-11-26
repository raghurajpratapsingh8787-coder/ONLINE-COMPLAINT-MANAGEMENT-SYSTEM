import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { db, newObjectId } from '../config/database';
import { env } from '../config/env';
import { AuthenticatedRequest, requireAuth } from '../middleware/security';
import { canUserAccessComplaint } from '../services/socketService';
import { ALLOWED_UPLOAD_MIME_TYPES, validateMagicBytes } from '../utils/domainRules';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.UPLOAD_MAX_BYTES,
    files: 5,
  },
});

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

function safeResolveUploadPath(storedFilename: string): string | null {
  const cleaned = path.basename(storedFilename);
  const resolved = path.resolve(env.UPLOAD_DIR, cleaned);
  if (!resolved.startsWith(env.UPLOAD_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

router.post('/complaints/:complaintId', requireAuth, upload.single('file'), (req: AuthenticatedRequest, res) => {
  const viewer = req.user!;
  const complaint = db.state.complaints.find((c) => c.id === req.params.complaintId);
  if (!complaint) {
    res.status(404).json({ error: 'Complaint not found.' });
    return;
  }
  if (!canUserAccessComplaint(viewer, complaint.id)) {
    res.status(403).json({ error: 'Not authorized to attach evidence to this complaint.' });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file provided.' });
    return;
  }

  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number])) {
    res.status(400).json({ error: 'Unsupported file type. Only JPG, JPEG, PNG, and PDF files are permitted.' });
    return;
  }

  if (!validateMagicBytes(file.buffer, file.mimetype)) {
    res.status(400).json({ error: 'File signature verification failed. Uploaded file does not match its declared type.' });
    return;
  }

  const ext = MIME_TO_EXT[file.mimetype];
  const storedFilename = `${crypto.randomUUID()}${ext}`;
  const targetPath = safeResolveUploadPath(storedFilename);
  if (!targetPath) {
    res.status(400).json({ error: 'Invalid upload path.' });
    return;
  }

  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(targetPath, file.buffer);

  const isResolutionEvidence = String(req.body?.isResolutionEvidence || '') === 'true' && viewer.role !== 'USER';

  const record = {
    id: newObjectId(),
    complaintId: complaint.id,
    uploadedByUserId: viewer.id,
    originalFilename: path.basename(file.originalname).replace(/[^\w.\-\s()]/g, '_').slice(0, 140),
    storedFilename,
    mimeType: file.mimetype as 'image/jpeg' | 'image/png' | 'application/pdf',
    sizeBytes: file.size,
    isResolutionEvidence,
    createdAt: new Date().toISOString(),
  };

  db.state.attachments.push(record);
  db.addAuditLog({
    actorUserId: viewer.id,
    actorName: viewer.name,
    actorRole: viewer.role,
    action: 'EVIDENCE_UPLOADED',
    entityType: 'ComplaintAttachment',
    entityId: record.id,
    details: `Uploaded ${record.originalFilename} (${Math.round(record.sizeBytes / 1024)} KB) to ${complaint.referenceId}.`,
    ipAddress: req.ip || '127.0.0.1',
  });
  db.persist();

  res.status(201).json({
    attachment: {
      id: record.id,
      originalFilename: record.originalFilename,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      isResolutionEvidence: record.isResolutionEvidence,
      uploadedByUserId: record.uploadedByUserId,
      createdAt: record.createdAt,
    },
  });
});

router.get('/:attachmentId/download', requireAuth, (req: AuthenticatedRequest, res) => {
  const viewer = req.user!;
  const record = db.state.attachments.find((a) => a.id === req.params.attachmentId);
  if (!record) {
    res.status(404).json({ error: 'Attachment not found.' });
    return;
  }
  if (!canUserAccessComplaint(viewer, record.complaintId)) {
    res.status(403).json({ error: 'Unauthorized attachment access.' });
    return;
  }

  const filePath = safeResolveUploadPath(record.storedFilename);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Stored file not available.' });
    return;
  }

  const inline = req.query.inline === 'true';
  res.setHeader('Content-Type', record.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${record.originalFilename.replace(/"/g, '')}"`
  );
  fs.createReadStream(filePath).pipe(res);
});

router.delete('/:attachmentId', requireAuth, (req: AuthenticatedRequest, res) => {
  const viewer = req.user!;
  const idx = db.state.attachments.findIndex((a) => a.id === req.params.attachmentId);
  if (idx < 0) {
    res.status(404).json({ error: 'Attachment not found.' });
    return;
  }

  const record = db.state.attachments[idx];
  const isUploader = record.uploadedByUserId === viewer.id;
  if (!isUploader && viewer.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Only the uploader or Super Admin can delete this attachment.' });
    return;
  }

  const filePath = safeResolveUploadPath(record.storedFilename);
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  db.state.attachments.splice(idx, 1);
  db.addAuditLog({
    actorUserId: viewer.id,
    actorName: viewer.name,
    actorRole: viewer.role,
    action: 'EVIDENCE_DELETED',
    entityType: 'ComplaintAttachment',
    entityId: record.id,
    details: `Deleted evidence file ${record.originalFilename}.`,
    ipAddress: req.ip || '127.0.0.1',
  });
  db.persist();
  res.json({ ok: true });
});

export default router;
