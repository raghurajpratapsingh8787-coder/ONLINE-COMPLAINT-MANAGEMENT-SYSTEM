import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { apiRequest, getAccessToken, setAccessToken } from '../services/api';
import { NotificationItem, SafeUser } from '../types';
import { useToast } from './ToastContext';

interface BootstrapStatus {
  adminClaimed: boolean;
  adminName: string;
  adminEmail: string;
  databaseMode: 'mongodb' | 'local-persistent';
  smtpConfigured: boolean;
}

interface AuthContextValue {
  user: SafeUser | null;
  loading: boolean;
  bootstrap: BootstrapStatus | null;
  socket: Socket | null;
  socketConnected: boolean;
  refreshBootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { name: string; email: string; password: string; phone?: string; title?: string }) => Promise<void>;
  claimAdmin: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserLocal: (user: SafeUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const refreshBootstrap = useCallback(async () => {
    try {
      const info = await apiRequest<BootstrapStatus>('/api/auth/bootstrap-status', { skipAuthRetry: true });
      setBootstrap(info);
    } catch {
      // ignore transient error
    }
  }, []);

  const connectSocket = useCallback(
    (token: string) => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      const s = io(window.location.origin, {
        path: '/socket.io',
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 8,
      });

      s.on('connect', () => setSocketConnected(true));
      s.on('disconnect', () => setSocketConnected(false));

      s.on('notification:new', (notif: NotificationItem) => {
        toast(notif.title, { description: notif.message, variant: 'info' });
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        void queryClient.invalidateQueries({ queryKey: ['analytics'] });
        void queryClient.invalidateQueries({ queryKey: ['complaints'] });
      });

      s.on('complaint:updated', ({ complaintId }: { complaintId: string }) => {
        void queryClient.invalidateQueries({ queryKey: ['complaint', complaintId] });
        void queryClient.invalidateQueries({ queryKey: ['complaints'] });
        void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      });

      s.on('comment:created', ({ complaintId }: { complaintId: string }) => {
        void queryClient.invalidateQueries({ queryKey: ['complaint', complaintId] });
      });

      s.on('dashboard:refresh', () => {
        void queryClient.invalidateQueries({ queryKey: ['analytics'] });
        void queryClient.invalidateQueries({ queryKey: ['complaints'] });
      });

      socketRef.current = s;
    },
    [queryClient, toast]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      await refreshBootstrap();
      try {
        const res = await apiRequest<{ accessToken: string; user: SafeUser }>('/api/auth/refresh', {
          method: 'POST',
          skipAuthRetry: true,
        });
        if (active && res.accessToken && res.user) {
          setAccessToken(res.accessToken);
          setUser(res.user);
          connectSocket(res.accessToken);
        }
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connectSocket, refreshBootstrap]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest<{ accessToken: string; user: SafeUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuthRetry: true,
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    connectSocket(res.accessToken);
    queryClient.clear();
  };

  const register = async (payload: { name: string; email: string; password: string; phone?: string; title?: string }) => {
    const res = await apiRequest<{ accessToken: string; user: SafeUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuthRetry: true,
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    connectSocket(res.accessToken);
    queryClient.clear();
  };

  const claimAdmin = async (password: string) => {
    const res = await apiRequest<{ accessToken: string; user: SafeUser }>('/api/auth/claim-admin', {
      method: 'POST',
      body: JSON.stringify({ password }),
      skipAuthRetry: true,
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    await refreshBootstrap();
    connectSocket(res.accessToken);
    queryClient.clear();
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', skipAuthRetry: true });
    } catch {
      // ignore logout network errors
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSocketConnected(false);
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  };

  const updateUserLocal = (nextUser: SafeUser) => {
    setUser(nextUser);
    const token = getAccessToken();
    if (token && !socketRef.current) connectSocket(token);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        bootstrap,
        socket: socketRef.current,
        socketConnected,
        refreshBootstrap,
        login,
        register,
        claimAdmin,
        logout,
        updateUserLocal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
