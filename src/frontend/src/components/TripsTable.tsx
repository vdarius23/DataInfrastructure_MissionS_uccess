import { formatDuration, formatUtcTimestamp, metersPerSecondToKmh } from "../lib/format";
import type { TripSummary } from "../types";

function scoreBadge(score: number): { label: string; className: string } {
  if (score >= 90) return { label: "Smooth", className: "bg-teal-400/10 text-teal-200 ring-teal-400/30" };
  if (score >= 70) return { label: "Moderate", className: "bg-amber-400/10 text-amber-200 ring-amber-400/30" };
  return { label: "Rough", className: "bg-rose-500/10 text-rose-200 ring-rose-500/30" };
}

const HEADERS: { label: string; numeric?: boolean }[] = [
  { label: "Trip" },
  { label: "Device" },
  { label: "Started (UTC)" },
  { label: "Duration", numeric: true },
  { label: "Samples", numeric: true },
  { label: "Max speed", numeric: true },
  { label: "Harsh brakes", numeric: true },
  { label: "Harsh accel.", numeric: true },
  { label: "Smoothness", numeric: true },
];

interface TripsTableProps {
  trips: TripSummary[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}

export function TripsTable({ trips, selectedSessionId, onSelect }: TripsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">Recent trips with smoothness scores</caption>
        <thead className="border-b border-white/5 text-xs uppercase tracking-wider text-slate-400">
          <tr>
            {HEADERS.map((header) => (
              <th
                key={header.label}
                scope="col"
                className={`whitespace-nowrap px-4 py-3 font-medium ${header.numeric ? "text-right" : ""}`}
              >
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {trips.map((trip) => {
            const badge = scoreBadge(trip.smoothness_score);
            const isSelected = trip.session_id === selectedSessionId;
            return (
              <tr
                key={trip.session_id}
                className={`transition-colors ${isSelected ? "bg-sky-500/10" : "hover:bg-white/[0.03]"}`}
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(trip.session_id)}
                    aria-pressed={isSelected}
                    className="rounded font-mono text-xs text-sky-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    {trip.session_id}
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-300">{trip.device_id}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-300">
                  {formatUtcTimestamp(trip.started_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {formatDuration(trip.duration_seconds)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{trip.event_count}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {metersPerSecondToKmh(trip.max_speed_mps).toFixed(0)} km/h
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${trip.harsh_braking_count > 0 ? "text-rose-300" : "text-slate-500"}`}
                >
                  {trip.harsh_braking_count}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${trip.harsh_acceleration_count > 0 ? "text-amber-300" : "text-slate-500"}`}
                >
                  {trip.harsh_acceleration_count}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <span
                    className={`inline-flex items-center gap-2 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${badge.className}`}
                  >
                    <span className="text-sm font-semibold tabular-nums">{trip.smoothness_score}</span>
                    {badge.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
