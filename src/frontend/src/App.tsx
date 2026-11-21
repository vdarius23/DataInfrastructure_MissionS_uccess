import { useEffect, useState } from "react";
import { ConnectionIndicator } from "./components/ConnectionIndicator";
import { EventsTable } from "./components/EventsTable";
import { RefreshIcon } from "./components/Icons";
import { EmptyState, ErrorState, TableSkeleton } from "./components/StatePanels";
import { StatCard } from "./components/StatCard";
import { useDashboardData } from "./hooks/useDashboardData";
import { formatNumber, formatRelativeTime } from "./lib/format";

export default function App() {
  const { data, connection, error, isLoading, lastUpdated, refresh } = useDashboardData();
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const isInitialLoad = isLoading && data === null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="DriveSense home">DriveSense</a>
        <ConnectionIndicator state={connection} />
      </header>

      <main className="dashboard">
        <section className="overview" aria-labelledby="overview-title">
          <h1 id="overview-title">Fleet overview</h1>
          <div className="stats-grid">
            <StatCard label="Total events" value={formatNumber(data?.total_events)} accent="sky" loading={isInitialLoad} />
            <StatCard label="Devices" value={formatNumber(data?.unique_devices)} accent="teal" loading={isInitialLoad} />
            <StatCard label="Sessions" value={formatNumber(data?.unique_sessions)} accent="sky" loading={isInitialLoad} />
          </div>
        </section>

        <section className="events-section" aria-labelledby="events-title">
          <div className="section-heading">
            <div>
              <h2 id="events-title">Recent events</h2>
              <p className="updated-at">Updated {formatRelativeTime(lastUpdated ? new Date(clock) : null)}</p>
            </div>
            <button className="button button--refresh" onClick={() => void refresh()} disabled={isLoading} type="button">
              <RefreshIcon className={isLoading ? "icon icon--spinning" : "icon"} />
              <span>Refresh</span>
            </button>
          </div>

          {error && data !== null && (
            <div className="refresh-banner" role="status">
              <span>{error}</span>
              <button onClick={() => void refresh()} type="button">Retry</button>
            </div>
          )}

          <div className="events-panel">
            {isInitialLoad ? (
              <TableSkeleton />
            ) : data === null ? (
              <ErrorState message={error ?? "The dashboard data is unavailable."} onRetry={() => void refresh()} />
            ) : data.count === 0 ? (
              <EmptyState />
            ) : (
              <EventsTable events={data.events} />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
