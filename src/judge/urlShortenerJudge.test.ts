import { describe, expect, it } from 'vitest'
import type { SimulationInput } from '../domain/system'
import { computeSimulation } from '../simulation/engine'
import { judgeUrlShortener } from './urlShortenerJudge'
import type { TopologySummary } from './types'

const starterTopology: TopologySummary = {
  componentCounts: {
    client: 1,
    gateway: 1,
    service: 1,
    cache: 1,
    queue: 1,
    database: 1,
  },
  criticalPathConnected: true,
  nodeCount: 6,
  edgeCount: 5,
}

const resilientTopology: TopologySummary = {
  componentCounts: {
    client: 1,
    gateway: 2,
    service: 2,
    cache: 2,
    queue: 1,
    database: 2,
  },
  criticalPathConnected: true,
  nodeCount: 10,
  edgeCount: 11,
}

describe('judgeUrlShortener', () => {
  it('runs three public and two redacted hidden cases', () => {
    const report = judgeUrlShortener(starterTopology)
    const publicCases = report.cases.filter(
      (item) => item.visibility === 'public',
    )
    const hiddenCases = report.cases.filter(
      (item) => item.visibility === 'hidden',
    )

    expect(report.totalCases).toBe(5)
    expect(publicCases).toHaveLength(3)
    expect(hiddenCases).toHaveLength(2)
    expect(hiddenCases).toEqual([
      {
        visibility: 'hidden',
        ordinal: 1,
        label: 'Hidden case 1',
        passed: false,
      },
      {
        visibility: 'hidden',
        ordinal: 2,
        label: 'Hidden case 2',
        passed: false,
      },
    ])

    for (const hiddenCase of hiddenCases) {
      expect(Object.keys(hiddenCase).sort()).toEqual(
        ['label', 'ordinal', 'passed', 'visibility'].sort(),
      )
      expect(JSON.stringify(hiddenCase)).not.toContain('partition')
      expect(JSON.stringify(hiddenCase)).not.toContain('retry')
      expect(JSON.stringify(hiddenCase)).not.toContain('metrics')
    }
  })

  it('is repeatable and does not mutate the submitted topology', () => {
    const before = structuredClone(resilientTopology)
    const first = judgeUrlShortener(resilientTopology)
    const second = judgeUrlShortener(resilientTopology)

    expect(first).toEqual(second)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(resilientTopology).toEqual(before)
  })

  it('awards a full score only when the topology survives every case', () => {
    const report = judgeUrlShortener(resilientTopology)

    expect(report.passed).toBe(true)
    expect(report.passedCases).toBe(5)
    expect(report.score).toBe(100)
    expect(report.scoreBreakdown.map((item) => item.points)).toEqual([
      25, 25, 25, 25,
    ])
  })

  it('lets the starter pass healthy traffic but fail resilience cases', () => {
    const report = judgeUrlShortener(starterTopology)
    const publicCases = report.cases.filter(
      (item) => item.visibility === 'public',
    )

    expect(publicCases.map((item) => [item.caseId, item.passed])).toEqual([
      ['normal-read-path', true],
      ['launch-burst', true],
      ['cache-outage', false],
    ])
    expect(report.passed).toBe(false)
    expect(report.score).toBeGreaterThan(50)
    expect(report.score).toBeLessThan(100)
  })

  it('does not count cache shards as independent surviving replicas', () => {
    const report = judgeUrlShortener({
      ...resilientTopology,
      componentCounts: { ...resilientTopology.componentCounts, cache: 2 },
      replicaCounts: { cache: 1, database: 2 },
    })
    const cacheOutage = report.cases.find(
      (item) => item.visibility === 'public' && item.caseId === 'cache-outage',
    )

    expect(cacheOutage?.visibility).toBe('public')
    if (!cacheOutage || cacheOutage.visibility !== 'public') return
    expect(cacheOutage.assertions).toContainEqual({
      id: 'replica-cache-2',
      label: 'Provides a surviving cache replica',
      passed: false,
    })
  })

  it('passes topology data into all five simulations at a fixed tick', () => {
    const inputs: SimulationInput[] = []
    const simulate = (input: SimulationInput) => {
      inputs.push(input)
      return computeSimulation(input)
    }

    judgeUrlShortener(starterTopology, { simulate })

    expect(inputs).toHaveLength(5)
    expect(inputs.map(({ loadMultiplier, fault }) => [loadMultiplier, fault])).toEqual([
      [1, 'none'],
      [10, 'none'],
      [10, 'cache-outage'],
      [3, 'network-partition'],
      [10, 'retry-storm'],
    ])
    for (const input of inputs) {
      expect(input).toMatchObject({
        tick: 0,
        nodeCount: 6,
        edgeCount: 5,
        componentCounts: starterTopology.componentCounts,
        criticalPathConnected: true,
      })
    }
  })

  it('fails a disconnected submission and validates invalid summaries', () => {
    const disconnected = judgeUrlShortener({
      ...starterTopology,
      criticalPathConnected: false,
    })

    expect(disconnected.passedCases).toBe(0)
    expect(disconnected.score).toBeLessThan(50)
    expect(() =>
      judgeUrlShortener({ ...starterTopology, nodeCount: Number.NaN }),
    ).toThrow(/nodeCount/)
    expect(() =>
      judgeUrlShortener({ ...starterTopology, edgeCount: -1 }),
    ).toThrow(/edgeCount/)
    expect(() =>
      judgeUrlShortener({
        ...starterTopology,
        componentCounts: { ...starterTopology.componentCounts, cache: -1 },
      }),
    ).toThrow(/component count/)
    expect(() =>
      judgeUrlShortener({
        ...starterTopology,
        replicaCounts: { cache: Number.NaN },
      }),
    ).toThrow(/replica count/)
  })
})
