interface StatCardProps {
  label: string;
  value: string;
  accent: "sky" | "teal";
  loading?: boolean;
}

export function StatCard({ label, value, accent, loading = false }: StatCardProps) {
  return (
    <section className={`stat-card stat-card--${accent}`} aria-label={label}>
      <h2 className="stat-card__label">{label}</h2>
      {loading ? (
        <span className="skeleton skeleton--value" aria-label="Loading" />
      ) : (
        <p className="stat-card__value">{value}</p>
      )}
    </section>
  );
}
