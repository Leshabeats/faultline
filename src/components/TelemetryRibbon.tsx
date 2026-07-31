import type { TelemetryPoint } from '../domain/system'
import { formatMetric } from '../simulation/engine'

interface TelemetryRibbonProps {
  history: TelemetryPoint[]
}

type MetricKey = 'throughput' | 'p99' | 'errorRate' | 'dbCpu'

const metrics: Array<{ key: MetricKey; label: string; tone: string }> = [
  { key: 'throughput', label: 'Throughput', tone: 'healthy' },
  { key: 'p99', label: 'p99', tone: 'warning' },
  { key: 'errorRate', label: 'Errors', tone: 'critical' },
  { key: 'dbCpu', label: 'DB CPU', tone: 'critical' },
]

function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 92 + 2
      const y = 24 - ((value - min) / range) * 18
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg className={`sparkline tone-${tone}`} viewBox="0 0 96 28" aria-hidden="true">
      <polyline points={points} />
    </svg>
  )
}

export function TelemetryRibbon({ history }: TelemetryRibbonProps) {
  const latest = history[history.length - 1]
  if (!latest) return null

  return (
    <section className="telemetry-ribbon" aria-label="Live simulation metrics">
      {metrics.map(({ key, label, tone }) => (
        <div className={`telemetry-metric tone-${tone}`} key={key}>
          <span className="metric-label">
            <i aria-hidden="true" /> {label}
          </span>
          <strong>{formatMetric(latest[key], key)}</strong>
          <Sparkline values={history.map((point) => point[key])} tone={tone} />
        </div>
      ))}
    </section>
  )
}
