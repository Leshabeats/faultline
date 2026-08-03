import { describe, expect, it } from 'vitest'
import {
  BENCHMARK_PACKS,
  parseBenchmarkPack,
  resolvePricingPack,
} from './calibration'

describe('calibration packs', () => {
  it('loads the measured local benchmark with reproducible provenance', () => {
    const pack = BENCHMARK_PACKS['local-m1-pro-2026.08']
    const { status: _status, ...document } = pack
    const parsed = parseBenchmarkPack(JSON.stringify(document))

    expect(parsed.ok).toBe(true)
    expect(pack.status).toBe('mixed-measured')
    expect(pack.capacities.cacheRpsPerNode.value).toBe(39_984.01)
    expect(pack.capacities.databaseReadRps.compact.value).toBeCloseTo(9_459.997947)
    expect(pack.measurements).toHaveLength(3)
    expect(pack.measurements[0].command).toContain('pgbench -S')
  })

  it('fails closed for unknown fields and malformed numbers', () => {
    const pack = BENCHMARK_PACKS['local-m1-pro-2026.08']
    const withUnknownField = JSON.stringify({ ...pack, trustMe: true })
    const withNegativeCapacity = JSON.stringify({
      ...pack,
      capacities: {
        ...pack.capacities,
        cacheRpsPerNode: {
          ...pack.capacities.cacheRpsPerNode,
          value: -1,
        },
      },
    })

    expect(parseBenchmarkPack(withUnknownField).ok).toBe(false)
    expect(parseBenchmarkPack(withNegativeCapacity).ok).toBe(false)
    expect(parseBenchmarkPack('{not json').ok).toBe(false)
  })

  it('pins the AWS pack to exact public rate-card values', () => {
    const pack = resolvePricingPack('aws-us-east-1-2026.07')
    expect(pack.status).toBe('verified-rates')
    expect(pack.region).toBe('us-east-1')
    expect(pack.sources).toHaveLength(5)
    expect(pack.rates.mode).toBe('aws-on-demand')

    if (pack.rates.mode !== 'aws-on-demand') throw new Error('Expected AWS rates')
    expect(pack.rates.albHour).toBe(0.0225)
    expect(pack.rates.albLcuHour).toBe(0.008)
    expect(pack.rates.valkeyNodeHour).toBe(0.1752)
    expect(pack.rates.sqsRequest).toBe(0.0000004)
    expect(pack.rates.databaseNodeHour).toEqual({
      compact: 0.478,
      balanced: 0.956,
      performance: 1.913,
    })
    expect(pack.rates.databaseStorageGiBMonth).toBe(0.115)
  })
})
