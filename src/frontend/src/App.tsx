import { useState } from "react";
import { ConnectionIndicator } from "./components/ConnectionIndicator";
import { EventsTable } from "./components/EventsTable";
import { TripsTable } from "./components/TripsTable";
import { ClockIcon, DatabaseIcon, LogoMark, PhoneIcon, RefreshIcon, RouteIcon } from "./components/Icons";
import { StatCard } from "./components/StatCard";
import { EmptyState, ErrorState, StaleDataBanner, TableSkeleton } from "./components/StatePanels";
import { useDashboardData } from "./hooks/useDashboardData";
import { formatClockTime, formatCount, formatRelativeTime, formatUtcTimestamp } from "./lib/format";

const EVENTS_LIMIT = 50;
const AUTO_REFRESH_MS = 5000;

export default function App() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { data, trips, tripsError, connection, apiVersion, isLoading, error, lastUpdated, refresh } =
    useDashboardData(EVENTS_LIMIT, autoRefresh ? AUTO_REFRESH_MS : null);

  const isInitialLoad = data === null && isLoading;
  const latestEvent = data?.events[0];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-navy-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-sky-500/20 to-teal-400/20 text-sky-300 ring-1 ring-sky-400/30">
              <LogoMark className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">DriveSense</h1>
              <p className="text-xs text-slate-400">Driver Behavior Intelligence</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ConnectionIndicator status={connection} version={apiVersion} />
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                className="h-4 w-4 accent-teal-400"
              />
              Auto-refresh 5s
            </label>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshIcon className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="h-px bg-linear-to-r from-transparent via-sky-500/40 to-transparent" />
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-white">Live sensor feed</h2>
            <p className="mt-1 text-sm text-slate-400">
              GPS and accelerometer events received from phones, retrieved live from the DriveSense API.
            </p>
          </div>
          {lastUpdated && (
            <p className="text-xs text-slate-500">Last updated {formatClockTime(lastUpdated)}</p>
          )}
        </div>

        {error && data && <StaleDataBanner message={error} />}

        <section aria-label="Summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total events"
            value={data ? formatCount(data.total_events) : "—"}
            hint="Stored in PostgreSQL"
            icon={<DatabaseIcon />}
            isLoading={isInitialLoad}
          />
          <StatCard
            label="Unique devices"
            value={data ? formatCount(data.unique_devices) : "—"}
            hint="Distinct device_id values"
            icon={<PhoneIcon />}
            isLoading={isInitialLoad}
          />
          <StatCard
            label="Trips / sessions"
            value={data ? formatCount(data.unique_sessions) : "—"}
            hint="Distinct session_id values"
            icon={<RouteIcon />}
            isLoading={isInitialLoad}
          />
          <StatCard
            label="Latest event"
            value={latestEvent ? formatRelativeTime(latestEvent.timestamp) : "—"}
            hint={latestEvent ? `${formatUtcTimestamp(latestEvent.timestamp)} UTC` : "No events yet"}
            icon={<ClockIcon />}
            isLoading={isInitialLoad}
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-white/5 bg-navy-900/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Trips</h2>
            <p className="text-xs text-slate-500">
              Smoothness = 100 − 10 per harsh brake − 5 per harsh acceleration
            </p>
          </div>

          {tripsError && trips && <StaleDataBanner message={tripsError} />}

          {trips === null && isLoading ? (
            <TableSkeleton rows={4} />
          ) : trips === null ? (
            <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
              <h3 className="text-base font-semibold text-white">Could not load trips</h3>
              <p className="mt-1 max-w-md text-sm text-slate-400">
                {tripsError ?? "The trips data is unavailable."}
              </p>
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-4 rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                Try again
              </button>
            </div>
          ) : trips.count === 0 ? (
            <div className="px-6 py-12 text-center">
              <h3 className="text-base font-semibold text-white">No trips yet</h3>
              <p className="mt-1 text-sm text-slate-400">
                Send sensor events with the phone simulator, then refresh the dashboard.
              </p>
            </div>
          ) : (
            <TripsTable trips={trips.trips} />
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-white/5 bg-navy-900/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Recent sensor events</h2>
            {data && (
              <p className="text-xs text-slate-500">
                Showing {formatCount(data.count)} of {formatCount(data.total_events)} · newest first
              </p>
            )}
          </div>

          {isInitialLoad ? (
            <TableSkeleton />
          ) : data === null ? (
            <ErrorState message={error ?? "Unknown error."} onRetry={() => void refresh()} />
          ) : data.count === 0 ? (
            <EmptyState />
          ) : (
            <EventsTable events={data.events} />
          )}
        </section>
      </main>

      <footer className="border-t border-white/5">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
          DriveSense MVP foundation · Phone simulator → FastAPI → PostgreSQL → React
        </p>
      </footer>
    </div>
  );
}
