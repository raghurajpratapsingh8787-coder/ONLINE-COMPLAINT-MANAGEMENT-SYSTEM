import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import DashboardLayout from './layouts/DashboardLayout';
import AuthPortalPage from './pages/AuthPortalPage';
import ComplaintDetailPage from './pages/ComplaintDetailPage';
import ComplaintsListPage from './pages/ComplaintsListPage';
import DepartmentsPage from './pages/DepartmentsPage';
import {
  AuditLogsPage,
  NotificationsPage,
  ProfilePage,
  SettingsSlaPage,
} from './pages/NotificationsAuditSettingsPages';
import OverviewDashboard from './pages/OverviewDashboard';
import ReportsAnalyticsPage from './pages/ReportsAnalyticsPage';
import { StaffManagementPage, UsersManagementPage } from './pages/StaffAndUsersPages';
import SubmitComplaintPage from './pages/SubmitComplaintPage';
import TrackingPage from './pages/TrackingPage';
import { UserRole } from './types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: 1,
    },
  },
});

function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: UserRole[];
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#090E1A]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white font-display font-bold flex items-center justify-center animate-pulse">
            RD
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Loading ResolveDesk...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AuthProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/auth" element={<AuthPortalPage />} />

                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <DashboardLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<OverviewDashboard />} />
                    <Route path="submit" element={<SubmitComplaintPage />} />
                    <Route path="track" element={<TrackingPage />} />

                    <Route path="complaints" element={<ComplaintsListPage presetStatus="All" pageTitle="All Complaints" />} />
                    <Route
                      path="complaints/new"
                      element={
                        <ComplaintsListPage
                          presetStatus="New"
                          pageTitle="New Complaints"
                          pageSubtitle="Recently submitted and under-review complaints awaiting triage."
                        />
                      }
                    />
                    <Route
                      path="complaints/assigned"
                      element={
                        <ProtectedRoute roles={['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'STAFF']}>
                          <ComplaintsListPage
                            presetStatus="All"
                            assignedToMe
                            pageTitle="Assigned to Me"
                            pageSubtitle="Complaints currently routed directly to your workload queue."
                          />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="complaints/pending"
                      element={
                        <ComplaintsListPage
                          presetStatus="Pending"
                          pageTitle="Pending Complaints"
                          pageSubtitle="Open cases awaiting assignment, review, or complainant response."
                        />
                      }
                    />
                    <Route
                      path="complaints/in-progress"
                      element={
                        <ComplaintsListPage
                          presetStatus="In Progress"
                          pageTitle="In Progress"
                          pageSubtitle="Cases actively undergoing investigation and field remediation."
                        />
                      }
                    />
                    <Route
                      path="complaints/resolved"
                      element={
                        <ComplaintsListPage
                          presetStatus="Resolved"
                          pageTitle="Resolved Complaints"
                          pageSubtitle="Completed cases with documented resolution summaries and feedback."
                        />
                      }
                    />
                    <Route
                      path="complaints/rejected"
                      element={
                        <ComplaintsListPage
                          presetStatus="Rejected"
                          pageTitle="Rejected Complaints"
                          pageSubtitle="Closed complaints with policy justification notes."
                        />
                      }
                    />
                    <Route
                      path="complaints/escalated"
                      element={
                        <ComplaintsListPage
                          presetStatus="Escalated"
                          pageTitle="Escalated Complaints"
                          pageSubtitle="SLA-breached or manually escalated cases requiring immediate oversight."
                        />
                      }
                    />
                    <Route path="complaints/detail/:id" element={<ComplaintDetailPage />} />

                    <Route
                      path="departments"
                      element={
                        <ProtectedRoute roles={['SUPER_ADMIN', 'DEPARTMENT_ADMIN']}>
                          <DepartmentsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="staff"
                      element={
                        <ProtectedRoute roles={['SUPER_ADMIN', 'DEPARTMENT_ADMIN']}>
                          <StaffManagementPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="users"
                      element={
                        <ProtectedRoute roles={['SUPER_ADMIN']}>
                          <UsersManagementPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="analytics"
                      element={
                        <ProtectedRoute roles={['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'STAFF']}>
                          <ReportsAnalyticsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route
                      path="audit-logs"
                      element={
                        <ProtectedRoute roles={['SUPER_ADMIN']}>
                          <AuditLogsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="settings"
                      element={
                        <ProtectedRoute roles={['SUPER_ADMIN', 'DEPARTMENT_ADMIN']}>
                          <SettingsSlaPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="profile" element={<ProfilePage />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
            </AuthProvider>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
