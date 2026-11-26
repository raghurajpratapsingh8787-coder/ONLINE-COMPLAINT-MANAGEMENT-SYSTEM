import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { db, newObjectId, UserDoc } from '../config/database';
import { env } from '../config/env';
import {
  AuthenticatedRequest,
  authLimiter,
  clearRefreshCookie,
  csrfProtection,
  requireAuth,
  requireRoles,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
} from '../middleware/security';
import { emailService } from '../services/emailService';
import {
  changePasswordSchema,
  claimAdminSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/schemas';

const router = Router();

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function toSafeUser(user: UserDoc) {
  const dept = user.departmentId
    ? db.state.departments.find((d) => d.id === user.departmentId)
    : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    departmentName: dept?.name || null,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    title: user.title,
    isEmailVerified: user.isEmailVerified,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

function createSessionTokens(user: UserDoc, req: AuthenticatedRequest) {
  const sessionId = newObjectId();
  const refreshToken = signRefreshToken(user.id, sessionId);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.state.sessions.unshift({
    id: sessionId,
    userId: user.id,
    refreshTokenHash: hashToken(refreshToken),
    userAgent: String(req.headers['user-agent'] || 'Unknown Browser').slice(0, 180),
    ipAddress: req.ip || '127.0.0.1',
    expiresAt,
    revokedAt: null,
    createdAt: new Date().toISOString(),
  });
  db.persist();

  const accessToken = signAccessToken(user, sessionId);
  return { accessToken, refreshToken, sessionId };
}

router.get('/bootstrap-status', (_req, res) => {
  const admin = db.state.users.find((u) => u.role === 'SUPER_ADMIN');
  res.json({
    adminClaimed: db.state.adminClaimed && Boolean(admin?.passwordHash),
    adminName: admin?.name || 'Raghuraj Pratap Singh',
    adminEmail: admin?.email || 'raghurajpratapsingh8787@gmail.com',
    databaseMode: db.mode,
    smtpConfigured: emailService.isConfigured(),
  });
});

// One-time atomic first-run Super Admin setup when ADMIN_INITIAL_PASSWORD is not set in env
router.post('/claim-admin', authLimiter, async (req, res, next) => {
  try {
    const admin = db.state.users.find((u) => u.role === 'SUPER_ADMIN');
    if (!admin) {
      res.status(404).json({ error: 'Administrator record not initialized.' });
      return;
    }
    if (db.state.adminClaimed && admin.passwordHash) {
      res.status(409).json({ error: 'Administrator account has already been initialized. Please sign in.' });
      return;
    }

    const parsed = claimAdminSchema.parse(req.body);
    admin.passwordHash = await bcrypt.hash(parsed.password, 12);
    admin.updatedAt = new Date().toISOString();
    db.state.adminClaimed = true;

    db.addAuditLog({
      actorUserId: admin.id,
      actorName: admin.name,
      actorRole: admin.role,
      action: 'SUPER_ADMIN_CLAIMED',
      entityType: 'User',
      entityId: admin.id,
      details: 'Super Admin credentials securely initialized on first run.',
      ipAddress: req.ip || '127.0.0.1',
    });

    const { accessToken, refreshToken } = createSessionTokens(admin, req);
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ accessToken, user: toSafeUser(admin) });
  } catch (err) {
    next(err);
  }
});

// Public self-registration — STRICTLY creates USER role only (no privilege escalation)
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.parse(req.body);
    const exists = db.state.users.some((u) => u.email.toLowerCase() === parsed.email.toLowerCase());
    if (exists) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);
    const now = new Date().toISOString();
    const user: UserDoc = {
      id: newObjectId(),
      name: parsed.name,
      email: parsed.email,
      passwordHash,
      role: 'USER',
      departmentId: db.state.departments[0]?.id || null,
      phone: parsed.phone,
      avatarUrl: '',
      title: parsed.title || 'Member',
      isEmailVerified: false,
      isActive: true,
      failedLoginAttempts: 0,
      lockUntil: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    };

    db.state.users.push(user);
    db.addAuditLog({
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      details: `New standard user registered (${user.email}).`,
      ipAddress: req.ip || '127.0.0.1',
    });

    const { accessToken, refreshToken } = createSessionTokens(user, req);
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ accessToken, user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const user = db.state.users.find((u) => u.email.toLowerCase() === parsed.email.toLowerCase());

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'This account has been deactivated by an administrator.' });
      return;
    }

    if (user.lockUntil && new Date(user.lockUntil).getTime() > Date.now()) {
      res.status(423).json({ error: 'Account temporarily locked after repeated failed attempts. Try again in 15 minutes.' });
      return;
    }

    const valid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!valid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      db.persist();
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.updatedAt = new Date().toISOString();

    db.addAuditLog({
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'USER_LOGIN',
      entityType: 'Session',
      entityId: user.id,
      details: `Authenticated sign-in (${user.role}).`,
      ipAddress: req.ip || '127.0.0.1',
    });

    const { accessToken, refreshToken } = createSessionTokens(user, req);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', csrfProtection, (req, res) => {
  const rawToken = req.cookies?.rd_refresh;
  if (!rawToken || typeof rawToken !== 'string') {
    res.status(200).json({ authenticated: false, accessToken: null, user: null });
    return;
  }

  try {
    const decoded = jwt.verify(rawToken, env.JWT_REFRESH_SECRET) as { sub: string; sid: string };
    const session = db.state.sessions.find((s) => s.id === decoded.sid && s.userId === decoded.sub);
    if (!session || session.revokedAt || new Date(session.expiresAt).getTime() < Date.now()) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Session expired or revoked.' });
      return;
    }

    if (session.refreshTokenHash !== hashToken(rawToken)) {
      // Refresh token reuse detection — revoke session immediately
      session.revokedAt = new Date().toISOString();
      db.persist();
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Session security verification failed. Please sign in again.' });
      return;
    }

    const user = db.state.users.find((u) => u.id === decoded.sub && u.isActive);
    if (!user) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'User not found or inactive.' });
      return;
    }

    // Rotate refresh token
    const nextRefresh = signRefreshToken(user.id, session.id);
    session.refreshTokenHash = hashToken(nextRefresh);
    session.expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.persist();

    const accessToken = signAccessToken(user, session.id);
    setRefreshCookie(res, nextRefresh);
    res.json({ accessToken, user: toSafeUser(user) });
  } catch {
    clearRefreshCookie(res);
    res.status(401).json({ error: 'Invalid refresh token.' });
  }
});

router.post('/logout', csrfProtection, (req: AuthenticatedRequest, res) => {
  const rawToken = req.cookies?.rd_refresh;
  if (rawToken && typeof rawToken === 'string') {
    const tokenHash = hashToken(rawToken);
    const session = db.state.sessions.find((s) => s.refreshTokenHash === tokenHash);
    if (session) {
      session.revokedAt = new Date().toISOString();
      db.persist();
    }
  }
  clearRefreshCookie(res);
  res.json({ ok: true });
});

router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = db.state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (user) {
      const token = crypto.randomBytes(24).toString('hex');
      user.resetTokenHash = hashToken(token);
      user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      db.persist();
      await emailService.send({
        to: user.email,
        subject: '[ResolveDesk] Password Reset Verification',
        text: `Use this reset code within 30 minutes: ${token}`,
      });
    }
    res.json({
      message: 'If an account matches that email, password reset instructions have been dispatched.',
      smtpConfigured: emailService.isConfigured(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.parse(req.body);
    const user = db.state.users.find((u) => u.email.toLowerCase() === parsed.email.toLowerCase());
    if (
      !user ||
      !user.resetTokenHash ||
      !user.resetTokenExpiresAt ||
      new Date(user.resetTokenExpiresAt).getTime() < Date.now() ||
      user.resetTokenHash !== hashToken(parsed.token)
    ) {
      res.status(400).json({ error: 'Invalid or expired reset token.' });
      return;
    }

    user.passwordHash = await bcrypt.hash(parsed.newPassword, 12);
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    // Revoke all existing sessions on password reset
    for (const s of db.state.sessions) {
      if (s.userId === user.id && !s.revokedAt) s.revokedAt = new Date().toISOString();
    }
    db.persist();
    res.json({ message: 'Password updated successfully. Please sign in with your new credentials.' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: toSafeUser(req.user!) });
});

router.patch('/profile', requireAuth, (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = updateProfileSchema.parse(req.body);
    const user = req.user!;
    if (parsed.name !== undefined) user.name = parsed.name;
    if (parsed.phone !== undefined) user.phone = parsed.phone;
    if (parsed.title !== undefined) user.title = parsed.title;
    user.updatedAt = new Date().toISOString();
    db.persist();
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-email', requireAuth, requireRoles('SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
  const targetId = typeof req.body?.userId === 'string' ? req.body.userId : req.user!.id;
  const target = db.state.users.find((u) => u.id === targetId);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  target.isEmailVerified = true;
  target.updatedAt = new Date().toISOString();
  db.persist();
  res.json({ user: toSafeUser(target) });
});

router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = changePasswordSchema.parse(req.body);
    const user = req.user!;
    const ok = await bcrypt.compare(parsed.currentPassword, user.passwordHash);
    if (!ok) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    user.passwordHash = await bcrypt.hash(parsed.newPassword, 12);
    user.updatedAt = new Date().toISOString();
    // Revoke all other active sessions on password change
    for (const s of db.state.sessions) {
      if (s.userId === user.id && s.id !== req.sessionId && !s.revokedAt) {
        s.revokedAt = new Date().toISOString();
      }
    }
    db.addAuditLog({
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: user.id,
      details: 'Account password updated by user; other active sessions revoked.',
      ipAddress: req.ip || '127.0.0.1',
    });
    db.persist();
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
});

router.get('/sessions', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const sessions = db.state.sessions
    .filter((s) => s.userId === user.id && !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now())
    .map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s.id === req.sessionId,
    }));
  res.json({ sessions });
});

router.delete('/sessions/:sessionId', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const session = db.state.sessions.find((s) => s.id === req.params.sessionId && s.userId === user.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  session.revokedAt = new Date().toISOString();
  db.persist();
  res.json({ ok: true });
});

export default router;
