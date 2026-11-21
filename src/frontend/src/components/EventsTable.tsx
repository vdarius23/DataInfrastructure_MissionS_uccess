import type { DashboardEvent } from "../types";
import { formatLocation, formatSpeed, formatUtc } from "../lib/format";

interface EventsTableProps {
  events: DashboardEvent[];
}

function displayId(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "—";
}

function displayType(event: DashboardEvent): string {
  const value = event.event_type ?? event.type;
  return typeof value === "string" ? value.replaceAll("_", " ") : "—";
}

export function EventsTable({ events }: EventsTableProps) {
  return (
    <div className="table-scroll">
      <table className="events-table">
        <thead>
          <tr>
            <th scope="col">Timestamp</th>
            <th scope="col">Device</th>
            <th scope="col">Session</th>
            <th scope="col">Event type</th>
            <th scope="col">Speed</th>
            <th scope="col">Location</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, index) => (
            <tr key={displayId(event.id ?? event.event_id) === "—" ? index : displayId(event.id ?? event.event_id)}>
              <td className="cell-timestamp">{formatUtc(event.timestamp ?? event.occurred_at ?? event.created_at)}</td>
              <td className="cell-mono">{displayId(event.device_id)}</td>
              <td className="cell-mono">{displayId(event.session_id)}</td>
              <td className="cell-event">{displayType(event)}</td>
              <td className="cell-numeric">{formatSpeed(event.speed_mps)}</td>
              <td className="cell-location">{formatLocation(event.latitude, event.longitude)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
