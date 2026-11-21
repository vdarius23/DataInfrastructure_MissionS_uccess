import { useEffect, useState } from "react";
import { fetchTripDetail } from "../api/client";
import { formatDuration, formatSigned, formatUtcTimestamp, metersPerSecondToKmh } from "../lib/format";
import type { SensorEvent, TripDetail } from "../types";
import { AlertIcon } from "./Icons";

const KIND_LABEL = {
  harsh_braking: "Harsh braking",
  harsh_acceleration: "Harsh acceleration",
} as const;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; trip: TripDetail };

interface TripDetailPanelProps {
  sessionId: string;
}

export function TripDetailPanel({ sessionId }: TripDetailPanelProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchTripDetail(sessionId)
      .then((trip) => {
        if (!cancelled) setState({ status: "ready", trip });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Could not load this trip.";
        if (!cancelled) setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <section aria-label={`Driving performance for trip ${sessionId}`} className="trip-detail">
      {state.status === "loading" && <div className="h-32 animate-pulse rounded-lg bg-white/[0.04]" />}
      {state.status === "error" && <p role="alert" className="flex items-center gap-2 text-sm text-rose-200"><AlertIcon className="h-4 w-4 shrink-0" />{state.message}</p>}
      {state.status === "ready" && <Cockpit trip={state.trip} />}
    </section>
  );
}

function Cockpit({ trip }: { trip: TripDetail }) {
  const totalPenalty = trip.score_deductions.reduce((sum, deduction) => sum + deduction.points, 0);
  const orderedSamples = [...trip.samples].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const score = Math.max(0, Math.min(100, trip.smoothness_score));
  const circumference = 2 * Math.PI * 82;
  return (
    <div className="cockpit">
      <div className="score-instrument">
        <svg viewBox="0 0 220 220" role="img" aria-label={`Driver smoothness score ${score} out of 100`}>
          <circle cx="110" cy="110" r="82" className="score-track" />
          <circle cx="110" cy="110" r="82" className="score-arc" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} />
          <text x="110" y="88" textAnchor="middle" className="score-kicker">DRIVER SCORE</text>
          <text x="110" y="139" textAnchor="middle" className="score-value">{score}</text>
          <text x="110" y="164" textAnchor="middle" className="score-out-of">/ 100</text>
        </svg>
        <span className="score-grade">{score >= 90 ? "SMOOTH" : score >= 70 ? "MODERATE" : "ROUGH"}</span>
        <span className="score-formula">100{trip.score_deductions.map((d) => ` − ${d.points}`).join("")} = {trip.smoothness_score}</span>
      </div>
      <div className="trace-stack">
        <TraceChart title="SPEED PROFILE" unit="km/h" values={orderedSamples.map((e) => e.speed_mps * 3.6)} color="speed-line" />
        <TraceChart title="BRAKING / ACCELERATION" unit="m/s²" values={orderedSamples.map((e) => e.acceleration_y)} color="accel-line" brakingThreshold={trip.driving_events.length > 0} />
      </div>
      <div className="trip-readout">
        <span><small>TRIP ID</small>{trip.session_id}</span>
        <span><small>DEVICE ID</small>{trip.device_id}</span>
        <span><small>STARTED · UTC</small>{formatUtcTimestamp(trip.started_at)}</span>
        <span><small>ENDED · UTC</small>{formatUtcTimestamp(trip.ended_at)}</span>
        <span><small>DURATION</small>{formatDuration(trip.duration_seconds)}</span>
        <span><small>SENSOR EVENTS</small>{trip.event_count}</span>
        <span><small>AVG SPEED</small>{metersPerSecondToKmh(trip.avg_speed_mps).toFixed(1)} km/h</span>
        <span><small>MAX SPEED</small>{metersPerSecondToKmh(trip.max_speed_mps).toFixed(1)} km/h</span>
        <span><small>HARSH BRAKING</small>{trip.harsh_braking_count}</span>
        <span><small>HARSH ACCEL.</small>{trip.harsh_acceleration_count}</span>
      </div>
      {trip.driving_events.length > 0 && (
        <ol className="event-readouts">
          {trip.driving_events.map((event) => {
            const deduction = trip.score_deductions.find(
              (item) => item.kind === event.kind && Date.parse(item.at) === Date.parse(event.start),
            );
            return (
            <li key={`${event.kind}-${event.start}`}>
              <b>{KIND_LABEL[event.kind]}</b><span>{formatUtcTimestamp(event.start)}–{formatUtcTimestamp(event.end)} UTC</span>
              <span>{metersPerSecondToKmh(event.speed_before_mps).toFixed(0)} → {metersPerSecondToKmh(event.speed_after_mps).toFixed(0)} km/h</span>
              <span>peak {formatSigned(event.peak_acceleration_mps2, 1)} m/s²</span>
              <strong>−{deduction?.points ?? 0} pts</strong>
            </li>
            );
          })}
        </ol>
      )}
      {totalPenalty > 100 && <p className="chart-note">The score is clamped at 0.</p>}
      <SensorSamplesTable samples={orderedSamples} />
    </div>
  );
}

export function SensorSamplesTable({ samples, title = "Raw sensor readings" }: { samples: SensorEvent[]; title?: string }) {
  return (
    <details className="sensor-samples">
      <summary>{title} <span>{samples.length} samples · all backend fields</span></summary>
      <div className="sensor-samples__scroll">
        <table>
          <thead>
            <tr>
              <th>Event ID</th><th>Device ID</th><th>Session ID</th><th>Measured · UTC</th><th>Received · UTC</th>
              <th>Latitude</th><th>Longitude</th><th>Speed</th><th>Accel X</th><th>Accel Y</th><th>Accel Z</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((sample) => (
              <tr key={sample.event_id}>
                <td>{sample.event_id}</td><td>{sample.device_id}</td><td>{sample.session_id}</td>
                <td>{formatUtcTimestamp(sample.timestamp)}</td><td>{formatUtcTimestamp(sample.received_at)}</td>
                <td>{sample.latitude.toFixed(5)}</td><td>{sample.longitude.toFixed(5)}</td>
                <td>{metersPerSecondToKmh(sample.speed_mps).toFixed(1)} km/h</td>
                <td>{formatSigned(sample.acceleration_x, 2)}</td><td>{formatSigned(sample.acceleration_y, 2)}</td><td>{formatSigned(sample.acceleration_z, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function TraceChart({ title, unit, values, color, brakingThreshold = false }: { title: string; unit: string; values: number[]; color: string; brakingThreshold?: boolean }) {
  const width = 560;
  const height = 120;
  const min = Math.min(...values, brakingThreshold ? -3 : 0);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = values.length < 2 ? width / 2 : 16 + (index / (values.length - 1)) * (width - 32);
    const y = height - 12 - ((value - min) / Math.max(1, max - min)) * (height - 24);
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="trace-card">
      <div className="trace-heading"><b>{title}</b><span>{unit} · {values.length} samples</span></div>
      {values.length > 0 ? (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label={`${title} chart`} role="img">
          {[25, 55, 85].map((y) => <line key={y} x1="12" x2={width - 12} y1={y} y2={y} className="chart-grid" />)}
          {brakingThreshold && <line x1="12" x2={width - 12} y1="76" y2="76" className="brake-threshold" />}
          <polyline points={points} className={color} />
          {values.length === 1 && <circle cx={width / 2} cy={height - 12 - ((values[0] - min) / Math.max(1, max - min)) * (height - 24)} r="4" className={color} />}
        </svg>
      ) : <div className="chart-empty">Waiting for trip samples</div>}
    </div>
  );
}
