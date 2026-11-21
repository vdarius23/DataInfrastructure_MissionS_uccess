/**
 * API response types based on the DriveSense code tour. The backend's
 * schemas.py was not included, so event properties remain optional until
 * they can be matched to the authoritative API contract.
 */
export interface HealthResponse {
  status: string;
  [key: string]: unknown;
}

export interface DashboardEvent {
  id?: string | number;
  event_id?: string | number;
  timestamp?: string;
  occurred_at?: string;
  created_at?: string;
  device_id?: string | number;
  session_id?: string | number;
  event_type?: string;
  type?: string;
  speed_mps?: number;
  latitude?: number;
  longitude?: number;
  [key: string]: unknown;
}

export interface EventListResponse {
  count: number;
  total_events: number;
  unique_devices: number;
  unique_sessions: number;
  events: DashboardEvent[];
}

export type ConnectionState = "online" | "degraded" | "offline";

export interface DashboardState {
  data: EventListResponse | null;
  connection: ConnectionState;
  error: string | null;
  isLoading: boolean;
  lastUpdated: Date | null;
}
