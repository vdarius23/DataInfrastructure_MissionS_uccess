import { AlertIcon, InboxIcon } from "./Icons";

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading sensor events">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-8 animate-pulse rounded-md bg-white/[0.04]" />
      ))}
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/10 text-sky-300 ring-1 ring-sky-400/20">
        <InboxIcon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-white">No sensor events yet</h3>
      <p className="mt-1 max-w-md text-sm text-slate-400">
        The API is ready but nothing has been stored. Send synthetic GPS and accelerometer events
        with the phone simulator, then press Refresh.
      </p>
      <code className="mt-4 max-w-full overflow-x-auto rounded-md bg-navy-950 px-3 py-2 font-mono text-xs text-teal-200 ring-1 ring-white/10">
        python src/mobile/simulator/send_events.py
      </code>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/20">
        <AlertIcon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-white">Could not load sensor events</h3>
      <p className="mt-1 max-w-md text-sm text-slate-400">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        Try again
      </button>
    </div>
  );
}

export function StaleDataBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
    >
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-medium">Refresh failed:</span> {message} Showing the last successfully
        loaded data.
      </p>
    </div>
  );
}
