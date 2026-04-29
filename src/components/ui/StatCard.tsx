type Trend = 'up' | 'down' | 'neutral'

interface StatCardProps {
  label: string
  value: string
  subLabel?: string
  trend?: Trend
  loading?: boolean
  accent?: string
}

const trendClass: Record<Trend, string> = {
  up: 'tw-trend-up',
  down: 'tw-trend-down',
  neutral: 'tw-trend-neutral',
}

export function StatCard({
  label,
  value,
  subLabel,
  trend = 'neutral',
  loading = false,
  accent = 'emerald',
}: StatCardProps) {
  return (
    <section className={`tw-stat-card tw-accent-${accent}`} aria-busy={loading}>
      <p className="tw-stat-label">{label}</p>
      {loading ? (
        <>
          <div className="tw-skeleton tw-skeleton-value" />
          <div className="tw-skeleton tw-skeleton-small" />
        </>
      ) : (
        <>
          <strong className="tw-stat-value">{value}</strong>
          {subLabel ? <span className={`tw-stat-sub ${trendClass[trend]}`}>{subLabel}</span> : null}
        </>
      )}
    </section>
  )
}
