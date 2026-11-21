export function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US").format(value)
    : "—";
}

export function formatUtc(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function formatRelativeTime(value: Date | null): string {
  if (!value) return "Not updated yet";
  const seconds = Math.max(0, Math.floor((Date.now() - value.getTime()) / 1_000));
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function formatSpeed(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value * 3.6)} km/h`;
}

export function formatLocation(latitude: unknown, longitude: unknown): string {
  if (typeof latitude !== "number" || typeof longitude !== "number") return "—";
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}
