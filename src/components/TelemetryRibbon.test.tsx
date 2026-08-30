import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TelemetryRibbon } from './TelemetryRibbon'

describe('TelemetryRibbon', () => {
  it('can omit a sparkline when a displayed override has no matching history', () => {
    const html = renderToStaticMarkup(
      <TelemetryRibbon
        locale="en"
        history={[
          { tick: 0, throughput: 10_000, p99: 40, errorRate: 0.2, dbCpu: 20, cacheMiss: 10, queueDepth: 0 },
          { tick: 1, throughput: 20_000, p99: 55, errorRate: 0.4, dbCpu: 80, cacheMiss: 14, queueDepth: 5 },
        ]}
        labels={{ dbCpu: 'Infra / mo' }}
        values={{ dbCpu: '$1,250' }}
        hiddenSparklines={['dbCpu']}
      />,
    )

    expect(html).toContain('Infra / mo')
    expect(html).toContain('$1,250')
    expect(html.match(/class="sparkline /g)).toHaveLength(3)
  })
})
