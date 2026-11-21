import type { ConnectionState } from "../types";

const labels: Record<ConnectionState, string> = {
  online: "API connected",
  degraded: "Database unavailable",
  offline: "API offline",
};

export function ConnectionIndicator({ state }: { state: ConnectionState }) {
  return (
    <div className={`connection connection--${state}`} role="status" aria-live="polite">
      <span className="connection__dot" aria-hidden="true" />
      <span>{labels[state]}</span>
    </div>
  );
}
