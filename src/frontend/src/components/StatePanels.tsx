import { CarIcon } from "./Icons";

export function TableSkeleton() {
  return (
    <div className="table-skeleton" aria-label="Loading events" role="status">
      <span className="sr-only">Loading events</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton skeleton--cell skeleton--wide" />
          <span className="skeleton skeleton--cell" />
          <span className="skeleton skeleton--cell" />
          <span className="skeleton skeleton--cell skeleton--short" />
          <span className="skeleton skeleton--cell" />
          <span className="skeleton skeleton--cell skeleton--short" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="empty-state">
      <CarIcon className="empty-state__icon" />
      <h3>No events yet</h3>
      <p>Start the simulator to generate telemetry events.</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <div>
        <h3>Couldn’t load events</h3>
        <p>{message}</p>
      </div>
      <button className="button button--secondary" onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  );
}
