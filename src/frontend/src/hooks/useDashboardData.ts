import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, fetchEvents, fetchHealth } from "../api/client";
import type { ConnectionState, DashboardState } from "../types";

const EVENT_LIMIT = 50;

function describeError(reason: unknown): string {
  if (reason instanceof ApiRequestError) return reason.message;
  if (reason instanceof Error) return reason.message;
  return "Could not refresh dashboard data.";
}

function getConnectionState(status: string): ConnectionState {
  return status === "ok" ? "online" : "degraded";
}

export function useDashboardData() {
  const latestRequest = useRef(0);
  const [state, setState] = useState<DashboardState>({
    data: null,
    connection: "offline",
    error: null,
    isLoading: true,
    lastUpdated: null,
  });

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setState((previous) => ({ ...previous, isLoading: true }));

    const [health, events] = await Promise.allSettled([fetchHealth(), fetchEvents(EVENT_LIMIT)]);
    if (requestId !== latestRequest.current) return;

    setState((previous) => ({
      data: events.status === "fulfilled" ? events.value : previous.data,
      connection: health.status === "rejected" ? "offline" : getConnectionState(health.value.status),
      error: events.status === "rejected" ? describeError(events.reason) : null,
      isLoading: false,
      lastUpdated: events.status === "fulfilled" ? new Date() : previous.lastUpdated,
    }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
