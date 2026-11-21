// TypeScript mirror of the backend API contract (src/backend/app/schemas.py).
// Keep both in sync; contract changes must be coordinated (see TEAM_WORKFLOW.md).

export interface SensorEvent {
  event_id: string;
  device_id: string;
  session_id: string;
  /** ISO 8601 UTC timestamp of the measurement. */
  timestamp: string;
  /** ISO 8601 UTC timestamp when the API stored the event. */
  received_at: string;
  latitude: number;
  longitude: number;
  speed_mps: number;
  acceleration_x: number;
  acceleration_y: number;
  acceleration_z: number;
}

export interface EventListResponse {
  total_events: number;
  unique_devices: number;
  unique_sessions: number;
  limit: number;
  count: number;
  events: SensorEvent[];
}

export interface HealthResponse {
  status: "ok" | "degraded";
  database: "ok" | "unavailable";
  version: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string | null; message: string; type?: string | null }[];
  };
}