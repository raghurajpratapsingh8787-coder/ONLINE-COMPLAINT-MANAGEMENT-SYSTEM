import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { ComplaintPriority, ComplaintStatus, SlaInfo } from '../../types';

export function AnimatedCounter({ value, suffix = '', decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame = 0;
    const duration = 520;
    const start = performance.now();
    const initial = display;
    const delta = value - initial;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(initial + delta * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const formatted = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString();
  return (
    <span className="font-mono tabular-nums">
      {formatted}
      {suffix}
    </span>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {children}
    </motion.div>
  );
}

export function StatusText({ status }: { status: ComplaintStatus | string }) {
  const map: Record<string, string> = {
    Draft: 'text-slate-500 dark:text-slate-400',
    Submitted: 'text-blue-700 dark:text-blue-400',
    'Under Review': 'text-indigo-700 dark:text-indigo-400',
    Assigned: 'text-sky-700 dark:text-sky-400',
    'In Progress': 'text-amber-700 dark:text-amber-400',
    'Awaiting Response': 'text-orange-700 dark:text-orange-400',
    Resolved: 'text-emerald-700 dark:text-emerald-400',
    Rejected: 'text-slate-600 dark:text-slate-400',
    Reopened: 'text-violet-700 dark:text-violet-400',
    Escalated: 'text-red-700 dark:text-red-400',
  };
  return <span className={`text-xs font-semibold whitespace-nowrap ${map[status] || 'text-slate-600 dark:text-slate-300'}`}>{status}</span>;
}

export function PriorityText({ priority }: { priority: ComplaintPriority | string }) {
  const map: Record<string, string> = {
    Critical: 'text-red-700 dark:text-red-400 font-semibold',
    High: 'text-amber-700 dark:text-amber-400 font-semibold',
    Medium: 'text-blue-700 dark:text-blue-400 font-medium',
    Low: 'text-slate-600 dark:text-slate-400 font-medium',
  };
  return <span className={`text-xs whitespace-nowrap ${map[priority] || 'text-slate-600'}`}>{priority}</span>;
}

export function SlaLabel({ sla }: { sla: SlaInfo }) {
  if (sla.status === 'MET') {
    return <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">SLA Met</span>;
  }
  if (sla.status === 'BREACHED') {
    const hrs = Math.max(1, Math.round(sla.overdueMs / 3600000));
    return <span className="text-xs font-semibold text-red-700 dark:text-red-400 font-mono tabular-nums whitespace-nowrap">Overdue {hrs}h</span>;
  }
  if (sla.status === 'APPROACHING') {
    const hrs = Math.max(1, Math.round(sla.remainingMs / 3600000));
    return <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 font-mono tabular-nums whitespace-nowrap">{hrs}h left</span>;
  }
  if (sla.status === 'PAUSED') {
    return <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Draft</span>;
  }
  const hrs = Math.max(1, Math.round(sla.remainingMs / 3600000));
  return <span className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap">{hrs}h left</span>;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
          <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 flex-1 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800 hidden md:block" />
          <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

export function ModalDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`relative z-10 w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#0F1629] border border-slate-200 dark:border-slate-800 shadow-2xl p-6`}
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
                {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="pt-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
