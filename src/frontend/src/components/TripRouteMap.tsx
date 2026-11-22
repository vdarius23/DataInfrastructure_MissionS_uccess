import "leaflet/dist/leaflet.css";
import type { LatLngTuple } from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { formatUtcTimestamp } from "../lib/format";
import type { DrivingEvent, ScoreDeduction, SensorEvent } from "../types";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const FIT_OPTIONS = { padding: [28, 28] as [number, number], maxZoom: 17 };

const KIND_LABEL = {
  harsh_braking: "Harsh braking",
  harsh_acceleration: "Harsh acceleration",
} as const;

interface TripRouteMapProps {
  /** The trip's readings, oldest first (the same list the charts use). */
  samples: SensorEvent[];
  events: DrivingEvent[];
  deductions: ScoreDeduction[];
}

/** The sample measured closest to a given time, to place an event on the route. */
function nearestSample(samples: SensorEvent[], isoTime: string): SensorEvent {
  const target = Date.parse(isoTime);
  return samples.reduce((best, sample) =>
    Math.abs(Date.parse(sample.timestamp) - target) < Math.abs(Date.parse(best.timestamp) - target)
      ? sample
      : best,
  );
}

/** Re-measure and fit after layout so the route fills its map card. */
function FitToRoute({ route, routeKey }: { route: LatLngTuple[]; routeKey: string }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(route, FIT_OPTIONS);
    };
    fit();
    const timer = window.setTimeout(fit, 250);
    return () => window.clearTimeout(timer);
    // route changes are represented by routeKey; don't reset a user's zoom on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routeKey]);
  return null;
}

export function TripRouteMap({ samples, events, deductions }: TripRouteMapProps) {
  const route: LatLngTuple[] = samples.map((sample) => [sample.latitude, sample.longitude]);

  if (route.length === 0) {
    return (
      <div className="route-card">
        <div className="trace-heading"><b>ROUTE</b><span>no position samples</span></div>
        <div className="chart-empty">Waiting for trip samples</div>
      </div>
    );
  }

  const start = route[0];
  const end = route[route.length - 1];
  const routeKey = `${samples[0].event_id}:${route.length}`;

  return (
    <div className="route-card">
      <div className="trace-heading">
        <b>ROUTE</b>
        <span>{route.length} positions · {events.length} event{events.length === 1 ? "" : "s"}</span>
      </div>
      <MapContainer
        key={samples[0].event_id}
        bounds={route}
        boundsOptions={FIT_OPTIONS}
        scrollWheelZoom={false}
        className="route-map"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <FitToRoute route={route} routeKey={routeKey} />
        <Polyline positions={route} className="route-line" />
        <CircleMarker center={start} radius={6} className="route-start">
          <Tooltip>Start · {formatUtcTimestamp(samples[0].timestamp)} UTC</Tooltip>
        </CircleMarker>
        <CircleMarker center={end} radius={6} className="route-end">
          <Tooltip>End · {formatUtcTimestamp(samples[samples.length - 1].timestamp)} UTC</Tooltip>
        </CircleMarker>
        {events.map((event) => {
          const at = nearestSample(samples, event.start);
          const deduction = deductions.find(
            (item) => item.kind === event.kind && Date.parse(item.at) === Date.parse(event.start),
          );
          return (
            <CircleMarker
              key={`${event.kind}-${event.start}`}
              center={[at.latitude, at.longitude]}
              radius={8}
              className="route-event"
            >
              <Tooltip>
                {KIND_LABEL[event.kind]} · −{deduction?.points ?? 0} pts · {formatUtcTimestamp(event.start)} UTC
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
