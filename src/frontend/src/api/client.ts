import type { EventListResponse, HealthResponse } from "../types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 8_000;

export class ApiRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function requestJson<T>(path: string, acceptedStatuses: number[] = []): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const isAccepted = response.ok || acceptedStatuses.includes(response.status);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (!isAccepted) {
        throw new ApiRequestError(`Request failed (${response.status})`, response.status);
      }
      throw new ApiRequestError("The API returned an unreadable response.", response.status);
    }

    if (!isAccepted) {
      throw new ApiRequestError(readApiError(body) ?? `Request failed (${response.status})`, response.status);
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiRequestError("The request timed out. Check the API and try again.");
    }
    if (error instanceof TypeError) {
      throw new ApiRequestError("Could not reach the API. Check your connection and try again.");
    }
    throw new ApiRequestError("Something went wrong while contacting the API.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function readApiError(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return null;
  const detail = error as { message?: unknown; detail?: unknown };
  if (typeof detail.message === "string") return detail.message;
  if (typeof detail.detail === "string") return detail.detail;
  return null;
}

/** A 503 is an expected health response when the API is up but its DB is down. */
export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health", [503]);
}

export function fetchEvents(limit: number): Promise<EventListResponse> {
  return requestJson<EventListResponse>(`/api/events?limit=${encodeURIComponent(limit)}`);
}
