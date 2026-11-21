import type { ApiErrorBody, EventListResponse, HealthResponse, TripDetail, TripListResponse } from "../types";

// Empty by default: the dashboard calls the API on its own origin and nginx (Docker)
// or the Vite dev server proxies /api and /health to FastAPI.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 8000;

export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly code: string;

  constructor(message: string, status: number | null, code: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return typeof error === "object" && error !== null && "message" in error && "code" in error;
}

async function requestJson<T>(path: string, acceptedErrorStatuses: number[] = []): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    throw new ApiRequestError(
      timedOut ? "The DriveSense API did not respond in time." : "Cannot reach the DriveSense API.",
      null,
      timedOut ? "timeout" : "network_error",
    );
  } finally {
    window.clearTimeout(timer);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok && !acceptedErrorStatuses.includes(response.status)) {
    const apiError = isApiErrorBody(body) ? body.error : null;
    throw new ApiRequestError(
      apiError?.message ?? `The API returned HTTP ${response.status}.`,
      response.status,
      apiError?.code ?? "http_error",
    );
  }
  if (body === null) {
    throw new ApiRequestError("The API returned an invalid response.", response.status, "invalid_response");
  }
  return body as T;
}

/** GET /health. A 503 is a valid answer (API up, database down). */
export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health", [503]);
}

/** GET /api/events?limit=N */
export function fetchEvents(limit: number): Promise<EventListResponse> {
  return requestJson<EventListResponse>(`/api/events?limit=${encodeURIComponent(limit)}`);
}

/** GET /api/trips, or /api/trips?limit=N when a bounded history is requested. */
export function fetchTrips(limit?: number): Promise<TripListResponse> {
  const query = limit === undefined ? "" : `?limit=${encodeURIComponent(limit)}`;
  return requestJson<TripListResponse>(`/api/trips${query}`);
}

/** GET /api/trips/{session_id}: one trip with driving events and score deductions. */
export function fetchTripDetail(sessionId: string): Promise<TripDetail> {
  return requestJson<TripDetail>(`/api/trips/${encodeURIComponent(sessionId)}`);
}
