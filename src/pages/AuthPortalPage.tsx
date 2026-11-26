import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSearch,
  KeyRound,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../services/api';
import { PriorityText, SlaLabel, StatusText } from '../components/ui/MotionPrimitives';
import { SlaInfo } from '../types';

type PortalTab = 'signin' | 'register' | 'claim' | 'forgot' | 'track';

interface PublicTrackingResult {
  complaint: {
    referenceId: string;
    title: string;
    category: string;
    departmentName: string;
    priority: string;
    status: string;
    assignedStaffName: string;
    submittedAt: string;
    updatedAt: string;
    slaDeadline: string;
    escalationLevel: number;
    resolutionSummary: string | null;
  };
  timeline: Array<{
    id: string;
    status: string;
    description: string;
    updatedBy: string;
    createdAt: string;
  }>;
  sla: SlaInfo;
}

export default function AuthPortalPage() {
  const { user, bootstrap, login, register, claimAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<PortalTab>('signin');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [claimPassword, setClaimPassword] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');

  // Public Tracker state
  const [trackRef, setTrackRef] = useState('CMP-2026-0001');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState('');
  const [trackResult, setTrackResult] = useState<PublicTrackingResult | null>(null);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (bootstrap && !bootstrap.adminClaimed) {
      setTab('claim');
    }
  }, [bootstrap]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      toast('Signed in successfully', { variant: 'success' });
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register({ name, email, password, phone, title });
      toast('Account created', { description: 'Welcome to ResolveDesk.', variant: 'success' });
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await claimAdmin(claimPassword);
      toast('Super Admin initialized', {
        description: 'Signed in as Raghuraj Pratap Singh.',
        variant: 'success',
      });
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setForgotMessage('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
        skipAuthRetry: true,
      });
      setForgotMessage(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublicTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackRef.trim()) return;
    setTrackError('');
    setTrackLoading(true);
    try {
      const res = await apiRequest<PublicTrackingResult>(
        `/api/complaints/track/${encodeURIComponent(trackRef.trim())}`,
        { skipAuthRetry: true }
      );
      setTrackResult(res);
    } catch (err) {
      setTrackResult(null);
      setTrackError((err as Error).message);
    } finally {
      setTrackLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090E1A] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="h-16 px-6 lg:px-10 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-8 bg-white/80 dark:bg-[#0C1222]/80 backdrop-blur-md">
        <span className="font-display font-bold text-lg tracking-tight whitespace-nowrap shrink-0">
          ResolveDesk
        </span>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => {
              setTab('signin');
              setError('');
            }}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap ${
              tab === 'signin' ? 'text-blue-600 dark:text-blue-400' : ''
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setError('');
            }}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap ${
              tab === 'register' ? 'text-blue-600 dark:text-blue-400' : ''
            }`}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('track');
              setError('');
            }}
            className={`hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap ${
              tab === 'track' ? 'text-blue-600 dark:text-blue-400' : ''
            }`}
          >
            Track Reference
          </button>
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Split Grid */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 lg:py-16 grid lg:grid-cols-12 gap-10 items-start">
        {/* Left Overview Column */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="lg:col-span-6 space-y-8"
        >
          <div className="space-y-4">
            <p className="text-xs font-semibold tracking-wider uppercase text-blue-600 dark:text-blue-400">
              Enterprise Grievance & SLA Governance
            </p>
            <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
              Structured complaint resolution built for institutions.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
              Submit, assign, verify evidence, monitor configurable SLA deadlines, and communicate in real time across academic, hostel, IT, and administrative departments.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-1.5">
              <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold">Role-Enforced Security</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Server-side RBAC, anonymous identity protection, private staff notes, and magic-byte validated evidence downloads.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 space-y-1.5">
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold">Automated SLA Escalation</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Configurable priority targets with scheduled breach detection, real-time Socket.IO alerts, and complete audit trails.
              </p>
            </div>
          </div>

          {/* Author & Administrator Credit */}
          <div className="flex items-center gap-4 pt-4 border-t border-slate-200 dark:border-slate-800/80">
            <img
              src="/src/assets/images/avatar_admin_raghuraj_1795709590416.jpg"
              alt="Raghuraj Pratap Singh"
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Raghuraj Pratap Singh
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chief Systems Architect & Super Admin · raghurajpratapsingh8787@gmail.com
              </p>
            </div>
          </div>
        </motion.section>

        {/* Right Interactive Auth / Tracker Panel */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.05 }}
          className="lg:col-span-6"
        >
          <div className="rounded-2xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800/90 p-6 sm:p-8 shadow-sm">
            {/* Segmented Mode Switcher */}
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#162036] mb-6">
              {bootstrap && !bootstrap.adminClaimed && (
                <button
                  type="button"
                  onClick={() => {
                    setTab('claim');
                    setError('');
                  }}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    tab === 'claim'
                      ? 'bg-white dark:bg-[#0F1629] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Admin Setup
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setTab('signin');
                  setError('');
                }}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === 'signin'
                    ? 'bg-white dark:bg-[#0F1629] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setError('');
                }}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === 'register'
                    ? 'bg-white dark:bg-[#0F1629] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Register
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('track');
                  setError('');
                }}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === 'track'
                    ? 'bg-white dark:bg-[#0F1629] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Track ID
              </button>
            </div>

            {error && (
              <div role="alert" className="mb-5 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/70 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {/* First-Run Super Admin Claim */}
            {tab === 'claim' && bootstrap && !bootstrap.adminClaimed && (
              <form onSubmit={handleClaimAdmin} className="space-y-4">
                <div>
                  <h2 className="text-lg font-display font-bold">Initialize Super Admin Access</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Set a password once to activate the Super Admin console for <strong>{bootstrap.adminName}</strong> ({bootstrap.adminEmail}). This one-time setup locks automatically upon completion.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Administrator Email
                  </label>
                  <input
                    type="email"
                    readOnly
                    value={bootstrap.adminEmail}
                    className="w-full h-10 px-3 rounded-lg text-sm bg-slate-100 dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                  />
                </div>

                <div>
                  <label htmlFor="claim-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Choose Super Admin Password
                  </label>
                  <input
                    id="claim-password"
                    type="password"
                    required
                    minLength={8}
                    value={claimPassword}
                    onChange={(e) => setClaimPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    className="w-full h-10 px-3 rounded-lg text-sm bg-white dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{submitting ? 'Initializing...' : 'Activate Super Admin & Enter Dashboard'}</span>
                </button>
              </form>
            )}

            {/* Sign In */}
            {tab === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <h2 className="text-lg font-display font-bold">Sign in to ResolveDesk</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Access your institutional complaints, SLA analytics, and real-time updates.
                  </p>
                </div>

                <div>
                  <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="raghurajpratapsingh8787@gmail.com"
                      className="w-full h-10 pl-9 pr-3 rounded-lg text-sm bg-white dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setTab('forgot');
                        setError('');
                      }}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full h-10 pl-9 pr-3 rounded-lg text-sm bg-white dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <span>{submitting ? 'Signing in...' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* Register */}
            {tab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <h2 className="text-lg font-display font-bold">Create Member Account</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Submit complaints, upload supporting evidence, and track resolution progress.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Full Name
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Full name"
                      className="w-full h-10 px-3 rounded-lg text-sm bg-white dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Phone (Optional)
                    </label>
                    <input
                      id="reg-phone"
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98..."
                      className="w-full h-10 px-3 rounded-lg text-sm bg-white dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email Address
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@institution.edu"
                    className="w-full h-10 px-3 rounded-lg text-sm bg-white dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>

                <div>
                  <label htmlFor="reg-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Role / Department Affiliation
                  </label>
                  <input
                    id="reg-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., B.Tech Computer Science — Sem VI"
                    className="w-full h-10 px-3 rounded-lg text-sm bg-white dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>

                <div>
                  <label htmlFor="reg-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Password
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 uppercase, 1 digit"
                    className="w-full h-10 px-3 rounded-lg text-sm bg-white dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{submitting ? 'Creating Account...' : 'Create Member Account'}</span>
                </button>
              </form>
            )}

            {/* Forgot Password */}
            {tab === 'forgot' && (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <h2 className="text-lg font-display font-bold">Reset Account Password</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Enter your registered email to receive a single-use password reset code.
                  </p>
                </div>
                {forgotMessage && (
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{forgotMessage}</span>
                  </div>
                )}
                <div>
                  <label htmlFor="forgot-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg text-sm bg-white dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                  >
                    Send Reset Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('signin')}
                    className="px-4 h-10 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                  >
                    Back
                  </button>
                </div>
              </form>
            )}

            {/* Rate-Limited Public Reference Tracker */}
            {tab === 'track' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-display font-bold">Public Reference Lookup</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Check live status and progress timeline using your Complaint Reference ID. Personal details and internal staff notes are never exposed.
                  </p>
                </div>

                <form onSubmit={handlePublicTrack} className="flex gap-2">
                  <input
                    type="text"
                    value={trackRef}
                    onChange={(e) => setTrackRef(e.target.value)}
                    placeholder="e.g. CMP-2026-0001"
                    aria-label="Complaint Reference ID"
                    className="flex-1 h-10 px-3 rounded-lg text-sm font-mono uppercase bg-white dark:bg-[#090E1A] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <button
                    type="submit"
                    disabled={trackLoading}
                    className="px-4 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <FileSearch className="w-4 h-4" />
                    <span>{trackLoading ? 'Looking up...' : 'Track'}</span>
                  </button>
                </form>

                {trackError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{trackError}</p>
                )}

                {trackResult && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {trackResult.complaint.referenceId}
                        </span>
                        <div className="flex items-center gap-2">
                          <StatusText status={trackResult.complaint.status} />
                          <span className="text-slate-400">·</span>
                          <PriorityText priority={trackResult.complaint.priority} />
                        </div>
                      </div>
                      <h3 className="text-sm font-semibold">{trackResult.complaint.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {trackResult.complaint.departmentName} · Assigned: {trackResult.complaint.assignedStaffName} ·{' '}
                        <SlaLabel sla={trackResult.sla} />
                      </p>
                    </div>

                    <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                      {trackResult.timeline.map((step) => (
                        <div key={step.id} className="flex gap-3 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {step.status}{' '}
                              <span className="font-normal text-slate-500 dark:text-slate-400">
                                · {step.updatedBy} · {new Date(step.createdAt).toLocaleString()}
                              </span>
                            </p>
                            <p className="text-slate-600 dark:text-slate-400 mt-0.5">{step.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.section>
      </main>
    </div>
  );
}
