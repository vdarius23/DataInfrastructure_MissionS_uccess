import type { ConnectionStatus } from "../hooks/useDashboardData";

const STYLES: Record<ConnectionStatus, { label: string; dot: string; badge: string }> = {
  checking: {
    label: "Checking API…",
    dot: "bg-slate-400 animate-pulse",
    badge: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  },
  online: {
    label: "API connected",
    dot: "bg-teal-400",
    badge: "border-teal-400/30 bg-teal-400/10 text-teal-200",
  },
  degraded: {
    label: "API degraded · database unavailable",
    dot: "bg-amber-400",
    badge: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  },
  offline: {
    label: "API unreachable",
    dot: "bg-rose-500",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  },
};

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  version: string | null;
}

export function ConnectionIndicator({ status, version }: ConnectionIndicatorProps) {
  const style = STYLES[status];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${style.badge}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
      <span>{style.label}</span>
      {version && status !== "offline" && <span className="text-slate-400">v{version}</span>}
    </div>
  );
}
