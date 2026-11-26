import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeAverageResolutionHours,
  computeSlaDeadline,
  escapeCsvCell,
  evaluateSlaStatus,
  generateComplaintRefId,
  isOriginHostMatch,
  maskComplaintForPublicTracking,
  sanitizeComplaintForViewer,
  sanitizeNoSqlPayload,
  validateMagicBytes,
  validateStatusTransition,
} from '../utils/domainRules';

test('generateComplaintRefId formats sequential IDs cleanly', () => {
  assert.equal(generateComplaintRefId(1, 2026), 'CMP-2026-0001');
  assert.equal(generateComplaintRefId(42, 2026), 'CMP-2026-0042');
  assert.equal(generateComplaintRefId(12345, 2026), 'CMP-2026-12345');
});

test('validateStatusTransition enforces workflow rules and RBAC', () => {
  // Valid admin transition
  assert.equal(
    validateStatusTransition({
      fromStatus: 'Submitted',
      toStatus: 'Assigned',
      actorRole: 'SUPER_ADMIN',
    }).valid,
    true
  );

  // Rejecting without reason fails
  const badReject = validateStatusTransition({
    fromStatus: 'Under Review',
    toStatus: 'Rejected',
    actorRole: 'DEPARTMENT_ADMIN',
    reason: 'Too short',
  });
  assert.equal(badReject.valid, false);

  // Resolving without summary fails
  const badResolve = validateStatusTransition({
    fromStatus: 'In Progress',
    toStatus: 'Resolved',
    actorRole: 'STAFF',
    resolutionSummary: 'Done',
  });
  assert.equal(badResolve.valid, false);

  // Resolving with valid summary succeeds
  const okResolve = validateStatusTransition({
    fromStatus: 'In Progress',
    toStatus: 'Resolved',
    actorRole: 'STAFF',
    resolutionSummary: 'Replaced defective switch module and verified stable connectivity across floors.',
  });
  assert.equal(okResolve.valid, true);

  // USER cannot transition to Resolved or Rejected
  const userIllegal = validateStatusTransition({
    fromStatus: 'In Progress',
    toStatus: 'Resolved',
    actorRole: 'USER',
    resolutionSummary: 'Trying to override admin decision',
  });
  assert.equal(userIllegal.valid, false);

  // USER can reopen a Resolved complaint with a reason
  const userReopen = validateStatusTransition({
    fromStatus: 'Resolved',
    toStatus: 'Reopened',
    actorRole: 'USER',
    reason: 'Issue recurred this morning on Floor 3.',
  });
  assert.equal(userReopen.valid, true);
});

test('evaluateSlaStatus detects ON_TRACK, APPROACHING, BREACHED, and MET', () => {
  const start = new Date('2026-11-26T00:00:00.000Z');
  const deadline = computeSlaDeadline(start, 10); // 10:00Z

  assert.equal(
    evaluateSlaStatus(start, deadline, 'In Progress', null, new Date('2026-11-26T04:00:00.000Z')).status,
    'ON_TRACK'
  );
  assert.equal(
    evaluateSlaStatus(start, deadline, 'In Progress', null, new Date('2026-11-26T08:00:00.000Z')).status,
    'APPROACHING'
  );
  assert.equal(
    evaluateSlaStatus(start, deadline, 'In Progress', null, new Date('2026-11-26T12:00:00.000Z')).status,
    'BREACHED'
  );
  assert.equal(
    evaluateSlaStatus(start, deadline, 'Resolved', '2026-11-26T07:00:00.000Z').status,
    'MET'
  );
});

test('validateMagicBytes verifies JPEG, PNG, and PDF headers and rejects spoofing', () => {
  const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const pdfBuf = Buffer.from('%PDF-1.7\n1 0 obj\n', 'utf8');
  const scriptBuf = Buffer.from('<script>alert(1)</script>', 'utf8');

  assert.equal(validateMagicBytes(jpegBuf, 'image/jpeg'), true);
  assert.equal(validateMagicBytes(pngBuf, 'image/png'), true);
  assert.equal(validateMagicBytes(pdfBuf, 'application/pdf'), true);
  assert.equal(validateMagicBytes(scriptBuf, 'image/png'), false);
  assert.equal(validateMagicBytes(scriptBuf, 'application/pdf'), false);
  assert.equal(validateMagicBytes(jpegBuf, 'application/pdf'), false);
});

test('sanitizeNoSqlPayload strips MongoDB operators and prototype keys', () => {
  const dirty = {
    email: { $ne: null },
    name: 'Valid User',
    nested: { $gt: '', safe: 123, 'a.b': 'dot-key' },
    __proto__: { polluted: true },
  };
  const clean = sanitizeNoSqlPayload(dirty) as Record<string, any>;
  assert.deepEqual(clean.email, {});
  assert.equal(clean.name, 'Valid User');
  assert.deepEqual(clean.nested, { safe: 123 });
  assert.equal(Object.prototype.hasOwnProperty.call(clean, '__proto__'), false);
});

test('anonymous identity protection masks submitter from non-owners and public tracker', () => {
  const base = {
    id: 'c1',
    referenceId: 'CMP-2026-0009',
    title: 'Mess Hygiene',
    description: 'Detailed description here for testing.',
    category: 'Hostel' as const,
    departmentId: 'd1',
    departmentName: 'Hostel',
    priority: 'High' as const,
    status: 'In Progress' as const,
    location: 'Block C',
    incidentDate: '2026-11-25T10:00:00.000Z',
    contactPreference: 'Anonymous' as const,
    isAnonymous: true,
    submittedById: 'user-1',
    submittedByName: 'Aarav Malhotra',
    submittedByEmail: 'aarav@student.edu',
    assignedStaffId: 'staff-1',
    assignedStaffName: 'Ananya Verma',
    slaDeadline: '2026-11-26T10:00:00.000Z',
    escalationLevel: 0,
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T11:00:00.000Z',
  };

  const forStaff = sanitizeComplaintForViewer(base, { id: 'staff-1', role: 'STAFF' });
  assert.equal(forStaff.submittedByName, 'Anonymous Submitter');
  assert.equal(forStaff.submittedByEmail, 'Protected Identity');

  const forOwner = sanitizeComplaintForViewer(base, { id: 'user-1', role: 'USER' });
  assert.equal(forOwner.submittedByName, 'Aarav Malhotra');

  const publicView = maskComplaintForPublicTracking(base);
  assert.equal('submittedByEmail' in publicView, false);
  assert.equal(publicView.referenceId, 'CMP-2026-0009');
});

test('computeAverageResolutionHours calculates mean hours accurately', () => {
  const avg = computeAverageResolutionHours([
    { createdAt: '2026-11-20T00:00:00.000Z', resolvedAt: '2026-11-20T12:00:00.000Z', status: 'Resolved' },
    { createdAt: '2026-11-21T00:00:00.000Z', resolvedAt: '2026-11-22T00:00:00.000Z', status: 'Resolved' },
    { createdAt: '2026-11-22T00:00:00.000Z', resolvedAt: null, status: 'In Progress' },
  ]);
  assert.equal(avg, 18);
});

test('isOriginHostMatch enforces exact URL host match and blocks spoofing', () => {
  assert.equal(isOriginHostMatch('https://app.example.run.app', 'app.example.run.app'), true);
  assert.equal(isOriginHostMatch('http://localhost:3000', 'localhost:3000'), true);
  // Substring spoof attempts MUST fail
  assert.equal(isOriginHostMatch('https://app.example.run.app.evil.com', 'app.example.run.app'), false);
  assert.equal(isOriginHostMatch('https://evil.com/app.example.run.app', 'app.example.run.app'), false);
  assert.equal(isOriginHostMatch('javascript://localhost:3000', 'localhost:3000'), false);
  assert.equal(isOriginHostMatch('https://other-tenant.run.app', 'app.example.run.app'), false);
});

test('escapeCsvCell neutralizes spreadsheet formula injection and escapes quotes', () => {
  assert.equal(escapeCsvCell('=HYPERLINK("http://evil.example","Click")'), `"'=HYPERLINK(""http://evil.example"",""Click"")"`);
  assert.equal(escapeCsvCell('+SUM(A1:A5)'), `"'${'+SUM(A1:A5)'}"`);
  assert.equal(escapeCsvCell('IT & "Network" Services'), `"IT & ""Network"" Services"`);
});
