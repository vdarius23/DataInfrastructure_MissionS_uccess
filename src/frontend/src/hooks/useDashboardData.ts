import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, fetchEvents, fetchHealth, fetchTrips } from "../api/client";
import type { EventListResponse, TripListResponse } from "../types";

export type ConnectionStatus = "checking" | "online" | "degraded" | "offline";

interface DashboardState {
  data: EventListResponse | null;
  trips: TripListResponse | null;
  tripsError: string | null;
  connection: ConnectionStatus;
  apiVersion: string | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const INITIAL_STATE: DashboardState = {
  data: null,
  trips: null,
  tripsError: null,
  connection: "checking",
  apiVersion: null,
  isLoading: true,
  error: null,
  lastUpdated: null,
};

function describeError(reason: unknown): string {
  if (reason instanceof ApiRequestError) return reason.message;
  if (reason instanceof Error) return reason.message;
  return "Unexpected error while loading data.";
}

/**
 * Loads API health, recent events and trips together; keeps the last good data on failure.
 * When `autoRefreshMs` is set, refreshes on that interval while the browser tab is visible.
 */
export function useDashboardData(limit: number, autoRefreshMs: number | null = null) {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const isRequestInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (isRequestInFlight.current) return;
    isRequestInFlight.current = true;
    setState((previous) => ({ ...previous, isLoading: true }));

    const [health, events, trips] = await Promise.allSettled([
      fetchHealth(),
      fetchEvents(limit),
      fetchTrips(10),
    ]);

    setState((previous) => ({
      data: events.status === "fulfilled" ? events.value : previous.data,
      trips: trips.status === "fulfilled" ? trips.value : previous.trips,
      tripsError: trips.status === "rejected" ? describeError(trips.reason) : null,
      error: events.status === "rejected" ? describeError(events.reason) : null,
      connection:
        health.status === "rejected" ? "offline" : health.value.status === "ok" ? "online" : "degraded",
      apiVersion: health.status === "fulfilled" ? health.value.version : previous.apiVersion,
      isLoading: false,
      lastUpdated: events.status === "fulfilled" ? new Date() : previous.lastUpdated,
    }));
    isRequestInFlight.current = false;
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefreshMs) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, autoRefreshMs);
    return () => window.clearInterval(timer); // stop the timer when switched off or unmounted
  }, [autoRefreshMs, refresh]);

  return { ...state, refresh };
}
