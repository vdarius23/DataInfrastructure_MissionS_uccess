import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, fetchEvents, fetchHealth } from "../api/client";
import type { EventListResponse } from "../types";

export type ConnectionStatus = "checking" | "online" | "degraded" | "offline";

interface DashboardState {
  data: EventListResponse | null;
  connection: ConnectionStatus;
  apiVersion: string | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const INITIAL_STATE: DashboardState = {
  data: null,
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
 * Loads API health and recent events together; keeps the last good data on failure.
 * When `autoRefreshMs` is set, refreshes on that interval while the browser tab is visible.
 */
export function useDashboardData(limit: number, autoRefreshMs: number | null = null) {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setState((previous) => ({ ...previous, isLoading: true }));

    const [health, events] = await Promise.allSettled([fetchHealth(), fetchEvents(limit)]);
    if (requestId !== latestRequest.current) return; // a newer refresh superseded this one

    setState((previous) => ({
      data: events.status === "fulfilled" ? events.value : previous.data,
      error: events.status === "rejected" ? describeError(events.reason) : null,
      connection:
        health.status === "rejected" ? "offline" : health.value.status === "ok" ? "online" : "degraded",
      apiVersion: health.status === "fulfilled" ? health.value.version : previous.apiVersion,
      isLoading: false,
      lastUpdated: events.status === "fulfilled" ? new Date() : previous.lastUpdated,
    }));
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
