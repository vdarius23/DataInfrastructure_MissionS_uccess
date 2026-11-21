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

/** One trip (= one session_id), mirrored from the backend's TripSummary schema. */
export interface TripSummary {
  session_id: string;
  device_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  event_count: number;
  max_speed_mps: number;
  avg_speed_mps: number;
  harsh_braking_count: number;
  harsh_acceleration_count: number;
  smoothness_score: number;
}

export interface TripListResponse {
  count: number;
  trips: TripSummary[];
}

export interface DrivingEvent {
  kind: "harsh_braking" | "harsh_acceleration";
  start: string;
  end: string;
  peak_acceleration_mps2: number;
  speed_before_mps: number;
  speed_after_mps: number;
}

export interface ScoreDeduction {
  kind: DrivingEvent["kind"];
  at: string;
  points: number;
}

export interface TripDetail extends TripSummary {
  driving_events: DrivingEvent[];
  score_deductions: ScoreDeduction[];
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
