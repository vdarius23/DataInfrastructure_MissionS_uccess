import { useState } from "react";
import { ConnectionIndicator } from "./components/ConnectionIndicator";
import { RefreshIcon } from "./components/Icons";
import { EmptyState, ErrorState, StaleDataBanner, TableSkeleton } from "./components/StatePanels";
import { SensorSamplesTable, TripDetailPanel } from "./components/TripDetailPanel";
import { useDashboardData } from "./hooks/useDashboardData";
import { formatClockTime, formatCount, formatDuration, formatRelativeTime } from "./lib/format";
import type { EventListResponse, TripSummary } from "./types";

const EVENTS_LIMIT = 50;
const AUTO_REFRESH_MS = 5000;
const ALL_TIME = "all-time";

export default function App() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState(ALL_TIME);
  const { data, trips, tripsError, connection, apiVersion, isLoading, error, lastUpdated, refresh } =
    useDashboardData(EVENTS_LIMIT, autoRefresh ? AUTO_REFRESH_MS : null);
  const selectedSummary = trips?.trips.find((trip) => trip.session_id === selectedTrip);

  return (
    <div className="performance-app min-h-screen px-3 py-4 sm:px-6 sm:py-6">
      <div className="display-frame mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1680px] flex-col">
        <header className="display-header flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a className="display-wordmark" href="/" aria-label="DriveSense home"><span>//</span> DriveSense</a>
          <div className="display-header-right">
            <ConnectionIndicator status={connection} version={apiVersion} />
            <span className="display-updated">{lastUpdated ? `Updated ${formatRelativeTime(lastUpdated.toISOString())}` : "Waiting for data"}</span>
            <label className="auto-refresh-control">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
              Live
            </label>
            <button type="button" onClick={() => void refresh()} disabled={isLoading} className="display-refresh" aria-label="Refresh data">
              <RefreshIcon className={isLoading ? "h-5 w-5 animate-spin" : "h-5 w-5"} />
            </button>
          </div>
        </header>

        <div className="display-body">
          <aside className="trip-rail" aria-label="Select a trip">
            <p className="rail-label">DRIVE HISTORY</p>
            <button type="button" className={`rail-item rail-item--all ${selectedTrip === ALL_TIME ? "is-active" : ""}`} onClick={() => setSelectedTrip(ALL_TIME)} aria-pressed={selectedTrip === ALL_TIME}>
              <span className="rail-item-icon">◷</span>
              <span><b>All time</b><small>Overall evolution</small></span>
            </button>
            <div className="rail-divider" />
            <p className="rail-label rail-label--trips">RECENT TRIPS</p>
            <div className="rail-trips">
              {trips?.trips.map((trip, index) => (
                <TripRailItem key={trip.session_id} trip={trip} index={index} selected={selectedTrip === trip.session_id} onSelect={() => setSelectedTrip(trip.session_id)} />
              ))}
              {trips === null && isLoading && <div className="rail-loading">Loading trips…</div>}
              {trips && trips.count === 0 && <div className="rail-loading">No trips yet</div>}
              {tripsError && !trips && <div className="rail-loading">Trips unavailable</div>}
            </div>
            <div className="rail-bottom"><span className="rail-bottom-line" />DRIVESENSE</div>
          </aside>

          <main className="display-content">
            <div className="display-title-row">
              <div>
                <p className="display-eyebrow">DRIVER PERFORMANCE</p>
                <h1>{selectedTrip === ALL_TIME ? "All time" : "Trip overview"}</h1>
                <p className="display-subtitle">{selectedTrip === ALL_TIME ? "Your driving smoothness, across every recorded trip." : selectedTrip}</p>
              </div>
              <div className="display-date">{lastUpdated ? `LAST SYNC  ${formatClockTime(lastUpdated)}` : "AWAITING FIRST SYNC"}</div>
            </div>

            {error && data && <StaleDataBanner message={error} />}
            {error && data === null && <StaleDataBanner message={error} />}
            {tripsError && trips && <StaleDataBanner message={tripsError} />}
            {trips === null && isLoading ? <div className="display-loading"><TableSkeleton rows={3} /></div> :
              trips === null ? <ErrorState message={tripsError ?? "The trip data is unavailable."} onRetry={() => void refresh()} /> :
              trips.count === 0 ? <EmptyState /> : selectedTrip === ALL_TIME ?
                <AllTimeDisplay trips={trips.trips} tripCount={trips.count} eventStats={data} /> : selectedSummary ?
                  <TripDetailPanel key={selectedTrip} sessionId={selectedTrip} /> :
                  <div className="display-loading">Select a trip to see its details.</div>}
          </main>
        </div>

        <footer className="display-footer"><span>DriveSense</span><span>DRIVER SMOOTHNESS · TRIP HISTORY</span><span>{trips?.count ?? 0} trips recorded</span></footer>
      </div>
    </div>
  );
}

function TripRailItem({ trip, index, selected, onSelect }: { trip: TripSummary; index: number; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`rail-item ${selected ? "is-active" : ""}`} onClick={onSelect} aria-pressed={selected}>
      <span className="rail-trip-index">{String(index + 1).padStart(2, "0")}</span>
      <span className="rail-trip-copy"><b>{formatClockTime(new Date(trip.started_at))}</b><small>{formatDuration(trip.duration_seconds)} · score {trip.smoothness_score}</small></span>
      <span className={`rail-score ${trip.smoothness_score >= 85 ? "rail-score--good" : ""}`}>{trip.smoothness_score}</span>
    </button>
  );
}

function AllTimeDisplay({ trips, tripCount, eventStats }: { trips: TripSummary[]; tripCount: number; eventStats: EventListResponse | null }) {
  const count = tripCount;
  const averageScore = count ? Math.round(trips.reduce((sum, trip) => sum + trip.smoothness_score, 0) / count) : 0;
  const totalBrakes = trips.reduce((sum, trip) => sum + trip.harsh_braking_count, 0);
  const totalAcceleration = trips.reduce((sum, trip) => sum + trip.harsh_acceleration_count, 0);
  const totalDistance = trips.reduce((sum, trip) => sum + trip.avg_speed_mps * trip.duration_seconds / 1000, 0);
  const sortedTrips = [...trips].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  return (
    <div className="all-time-dashboard">
      <div className="backend-summary" aria-label="Database totals">
        <SummaryMetric label="SENSOR READINGS" value={eventStats ? formatCount(eventStats.total_events) : "—"} detail="all stored events" />
        <SummaryMetric label="DEVICES" value={eventStats ? formatCount(eventStats.unique_devices) : "—"} detail="unique device IDs" />
        <SummaryMetric label="SESSIONS" value={eventStats ? formatCount(eventStats.unique_sessions) : "—"} detail="unique trip IDs" />
        <SummaryMetric label="SAMPLES LOADED" value={eventStats ? `${formatCount(eventStats.count)} / ${formatCount(eventStats.limit)}` : "—"} detail="recent event window" />
      </div>
      <section className="cockpit" aria-label="All time driving performance">
        <ScoreInstrument score={averageScore} label="AVERAGE SCORE" detail={`Across ${count} ${count === 1 ? "trip" : "trips"}`} />
        <div className="trace-stack">
          <EvolutionChart title="SMOOTHNESS EVOLUTION" unit="score / 100" trips={sortedTrips} values={sortedTrips.map((trip) => trip.smoothness_score)} color="speed-line" min={0} max={100} />
          <EvolutionChart title="HARSH BRAKING BY TRIP" unit="events" trips={sortedTrips} values={sortedTrips.map((trip) => trip.harsh_braking_count)} color="accel-line" min={0} />
        </div>
        <div className="trip-readout all-time-readout">
          <span><small>TRIPS</small>{count}</span>
          <span><small>EST. AVG DISTANCE</small>{count ? (totalDistance / count).toFixed(1) : "0.0"} km</span>
          <span><small>HARSH BRAKING</small>{totalBrakes}</span>
          <span><small>HARSH ACCEL.</small>{totalAcceleration}</span>
        </div>
      </section>
      {eventStats && <SensorSamplesTable samples={eventStats.events} title="Recent sensor readings" />}
    </div>
  );
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="backend-summary__metric"><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>;
}

function ScoreInstrument({ score, label, detail }: { score: number; label: string; detail: string }) {
  const circumference = 2 * Math.PI * 82;
  return (
    <div className="score-instrument">
      <svg viewBox="0 0 220 220" role="img" aria-label={`${label}: ${score} out of 100`}>
        <circle cx="110" cy="110" r="82" className="score-track" />
        <circle cx="110" cy="110" r="82" className="score-arc" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} />
        <text x="110" y="88" textAnchor="middle" className="score-kicker">{label}</text>
        <text x="110" y="139" textAnchor="middle" className="score-value">{score}</text>
        <text x="110" y="164" textAnchor="middle" className="score-out-of">/ 100</text>
      </svg>
      <span className="score-grade">{score >= 90 ? "SMOOTH" : score >= 70 ? "STEADY" : "BUILDING"}</span>
      <span className="score-formula">{detail}</span>
    </div>
  );
}

function EvolutionChart({ title, unit, trips, values, color, min, max }: { title: string; unit: string; trips: TripSummary[]; values: number[]; color: string; min: number; max?: number }) {
  const width = 560;
  const height = 120;
  const low = Math.min(...values, min);
  const high = Math.max(...values, max ?? 1);
  const range = Math.max(1, high - low);
  const points = values.map((value, index) => {
    const x = values.length < 2 ? width / 2 : 18 + (index / (values.length - 1)) * (width - 36);
    const y = height - 14 - ((value - low) / range) * (height - 28);
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="trace-card">
      <div className="trace-heading"><b>{title}</b><span>{unit} · {values.length} trips</span></div>
      {values.length ? <>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label={`${title} over ${values.length} trips`} role="img">
          {[25, 55, 85].map((y) => <line key={y} x1="12" x2={width - 12} y1={y} y2={y} className="chart-grid" />)}
          <polyline points={points} className={color} />
          {values.map((value, index) => {
            const x = values.length < 2 ? width / 2 : 18 + (index / (values.length - 1)) * (width - 36);
            const y = height - 14 - ((value - low) / range) * (height - 28);
            return <circle key={trips[index].session_id} cx={x} cy={y} r="3" className="evolution-point" />;
          })}
        </svg>
        <div className="chart-endpoints"><span>{trips[0]?.session_id ?? ""}</span><span>{trips.at(-1)?.session_id ?? ""}</span></div>
      </> : <div className="chart-empty">No trip history yet</div>}
    </div>
  );
}
