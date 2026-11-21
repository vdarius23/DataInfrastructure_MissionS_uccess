import {
  formatCoordinate,
  formatSigned,
  formatUtcTimestamp,
  metersPerSecondToKmh,
} from "../lib/format";
import type { SensorEvent } from "../types";

const COLUMNS: { label: string; numeric?: boolean }[] = [
  { label: "Time (UTC)" },
  { label: "Event" },
  { label: "Device" },
  { label: "Session" },
  { label: "Latitude", numeric: true },
  { label: "Longitude", numeric: true },
  { label: "Speed", numeric: true },
  { label: "Acc X", numeric: true },
  { label: "Acc Y", numeric: true },
  { label: "Acc Z", numeric: true },
];

export function EventsTable({ events }: { events: SensorEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">Recent sensor events, newest first</caption>
        <thead className="border-b border-white/5 text-xs uppercase tracking-wider text-slate-400">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={`whitespace-nowrap px-4 py-3 font-medium ${column.numeric ? "text-right" : ""}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {events.map((event) => (
            <tr key={event.event_id} className="transition-colors hover:bg-white/[0.03]">
              <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-300">
                {formatUtcTimestamp(event.timestamp)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400" title={event.event_id}>
                {event.event_id.length > 16 ? `${event.event_id.slice(0, 16)}…` : event.event_id}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-200 ring-1 ring-sky-400/20">
                  {event.device_id}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400" title={event.session_id}>
                {event.session_id}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {formatCoordinate(event.latitude)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {formatCoordinate(event.longitude)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                <span className="text-white">{event.speed_mps.toFixed(1)} m/s</span>
                <span className="ml-2 text-xs text-slate-500">
                  {metersPerSecondToKmh(event.speed_mps).toFixed(0)} km/h
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-teal-200/90">
                {formatSigned(event.acceleration_x)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-teal-200/90">
                {formatSigned(event.acceleration_y)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-teal-200/90">
                {formatSigned(event.acceleration_z)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-white/5 px-4 py-2 text-xs text-slate-500">
        Acceleration in m/s² (phone axes: X lateral, Y longitudinal, Z vertical incl. gravity).
      </p>
    </div>
  );
}
