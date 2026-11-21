import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  isLoading?: boolean;
}

export function StatCard({ label, value, hint, icon, isLoading = false }: StatCardProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-navy-900/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <span className="text-sky-400/80">{icon}</span>
      </div>
      {isLoading ? (
        <div className="mt-3 h-9 w-24 animate-pulse rounded-md bg-white/5" />
      ) : (
        <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-white">{value}</p>
      )}
      {hint && <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
