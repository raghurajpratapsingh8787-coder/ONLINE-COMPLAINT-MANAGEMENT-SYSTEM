import { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { db, newObjectId, NotificationDoc, UserDoc } from '../config/database';
import { env } from '../config/env';
import { AccessTokenPayload, isOriginAllowed } from '../middleware/security';
import { emailService } from './emailService';

interface AuthedSocket extends Socket {
  user?: UserDoc;
}

let io: Server | null = null;

export function canUserAccessComplaint(user: UserDoc, complaintId: string): boolean {
  const complaint = db.state.complaints.find((c) => c.id === complaintId);
  if (!complaint) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'DEPARTMENT_ADMIN') {
    return complaint.departmentId === user.departmentId || complaint.submittedById === user.id;
  }
  if (user.role === 'STAFF') {
    return (
      complaint.assignedStaffId === user.id ||
      complaint.submittedById === user.id ||
      complaint.departmentId === user.departmentId
    );
  }
  return complaint.submittedById === user.id;
}

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
      if (isOriginAllowed(origin, host)) {
        return callback(null, true);
      }
      return callback('Origin not allowed by Socket.IO CORS policy', false);
    },
    cors: {
      origin: true,
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use((socket: AuthedSocket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.headers.authorization?.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.slice(7)
        : undefined);

    if (!token) {
      return next(new Error('Socket authentication token required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
      const user = db.state.users.find((u) => u.id === decoded.sub && u.isActive);
      const session = db.state.sessions.find((s) => s.id === decoded.sid && !s.revokedAt);
      if (!user || !session) {
        return next(new Error('Invalid socket session'));
      }
      socket.user = user;
      return next();
    } catch {
      return next(new Error('Invalid or expired socket token'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const user = socket.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    socket.join(`user:${user.id}`);
    socket.join(`role:${user.role}`);
    if (user.departmentId) {
      socket.join(`department:${user.departmentId}`);
    }

    socket.on('complaint:join', (complaintId: string, ack?: (res: { ok: boolean; error?: string }) => void) => {
      if (typeof complaintId !== 'string' || !canUserAccessComplaint(user, complaintId)) {
        ack?.({ ok: false, error: 'Unauthorized complaint room access' });
        return;
      }
      socket.join(`complaint:${complaintId}`);
      ack?.({ ok: true });
    });

    socket.on('complaint:leave', (complaintId: string) => {
      if (typeof complaintId === 'string') {
        socket.leave(`complaint:${complaintId}`);
      }
    });
  });

  return io;
}

export async function dispatchNotification(params: {
  userIds: string[];
  eventType: string;
  title: string;
  message: string;
  complaintId?: string | null;
  referenceId?: string | null;
  sendEmail?: boolean;
}): Promise<NotificationDoc[]> {
  const uniqueIds = Array.from(new Set(params.userIds.filter(Boolean)));
  const created: NotificationDoc[] = [];

  for (const userId of uniqueIds) {
    const notif: NotificationDoc = {
      id: newObjectId(),
      userId,
      eventType: params.eventType,
      title: params.title,
      message: params.message,
      complaintId: params.complaintId || null,
      referenceId: params.referenceId || null,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    db.state.notifications.unshift(notif);
    created.push(notif);

    if (io) {
      io.to(`user:${userId}`).emit('notification:new', notif);
    }

    if (params.sendEmail) {
      const recipient = db.state.users.find((u) => u.id === userId);
      if (recipient?.email) {
        void emailService.send({
          to: recipient.email,
          subject: `[ResolveDesk] ${params.title}`,
          text: `${params.message}\n\nReference: ${params.referenceId || 'N/A'}\nPortal: ${env.APP_URL}`,
        });
      }
    }
  }

  db.persist();
  return created;
}

export function broadcastComplaintUpdate(complaintId: string, payload: Record<string, unknown>): void {
  if (!io) return;
  io.to(`complaint:${complaintId}`).emit('complaint:updated', { complaintId, ...payload });
  io.to('role:SUPER_ADMIN').emit('dashboard:refresh', { complaintId, ...payload });
}

export function broadcastCommentCreated(
  complaintId: string,
  comment: Record<string, unknown>,
  isInternal: boolean
): void {
  if (!io) return;
  if (isInternal) {
    // Only emit internal notes to staff/admin sockets inside the room
    const room = io.sockets.adapter.rooms.get(`complaint:${complaintId}`);
    if (room) {
      for (const socketId of room) {
        const s = io.sockets.sockets.get(socketId) as AuthedSocket | undefined;
        if (s?.user && s.user.role !== 'USER') {
          s.emit('comment:created', { complaintId, comment });
        }
      }
    }
  } else {
    io.to(`complaint:${complaintId}`).emit('comment:created', { complaintId, comment });
  }
}
