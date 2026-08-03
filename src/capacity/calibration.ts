import type {
  BenchmarkPackId,
  DatabaseProfile,
  PricingPackId,
} from '../domain/system'
import localM1ProPackDocument from './packs/local-m1-pro-2026.08.json'

export type CapacityAuthority = 'estimated' | 'measured' | 'derived'

export interface CapacityDatum {
  value: number
  authority: CapacityAuthority
  basis: string
}

export interface BenchmarkMeasurement {
  component: 'database' | 'database-write' | 'cache' | 'service'
  tool: string
  toolVersion: string
  target: string
  command: string
  result: {
    throughputRps: number
    latencyAverageMs?: number
    latencyP99Ms?: number
    failedPercent: number
  }
}

export interface BenchmarkPackV1 {
  schema: 'faultline.benchmark-pack'
  version: 1
  id: string
  label: string
  measuredAt?: string
  environment?: {
    hardware: string
    os: string
    virtualization: string
  }
  capacities: {
    serviceRpsPerNode: CapacityDatum
    cacheRpsPerNode: CapacityDatum
    databaseReadRps: Record<DatabaseProfile, CapacityDatum>
  }
  measurements: BenchmarkMeasurement[]
}

export type BenchmarkPackParseResult =
  | { ok: true; value: BenchmarkPackV1 }
  | { ok: false; error: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
) => Object.keys(value).every((key) => keys.includes(key))

const isBoundedString = (value: unknown, max = 1_000): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isDatum = (value: unknown): value is CapacityDatum =>
  isRecord(value) &&
  hasOnlyKeys(value, ['value', 'authority', 'basis']) &&
  isFiniteNonNegative(value.value) &&
  value.value > 0 &&
  ['estimated', 'measured', 'derived'].includes(value.authority as string) &&
  isBoundedString(value.basis)

const isResult = (value: unknown): value is BenchmarkMeasurement['result'] =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    'throughputRps',
    'latencyAverageMs',
    'latencyP99Ms',
    'failedPercent',
  ]) &&
  isFiniteNonNegative(value.throughputRps) &&
  value.throughputRps > 0 &&
  (value.latencyAverageMs === undefined || isFiniteNonNegative(value.latencyAverageMs)) &&
  (value.latencyP99Ms === undefined || isFiniteNonNegative(value.latencyP99Ms)) &&
  isFiniteNonNegative(value.failedPercent) &&
  value.failedPercent <= 100

const isMeasurement = (value: unknown): value is BenchmarkMeasurement =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    'component',
    'tool',
    'toolVersion',
    'target',
    'command',
    'result',
  ]) &&
  ['database', 'database-write', 'cache', 'service'].includes(value.component as string) &&
  isBoundedString(value.tool, 100) &&
  isBoundedString(value.toolVersion, 100) &&
  isBoundedString(value.target) &&
  isBoundedString(value.command, 2_000) &&
  isResult(value.result)

export function parseBenchmarkPack(serialized: string): BenchmarkPackParseResult {
  if (serialized.length > 100_000) {
    return { ok: false, error: 'Benchmark pack exceeds the 100 KB import limit.' }
  }

  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    return { ok: false, error: 'Benchmark pack is not valid JSON.' }
  }

  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'schema',
      'version',
      'id',
      'label',
      'measuredAt',
      'environment',
      'capacities',
      'measurements',
    ]) ||
    value.schema !== 'faultline.benchmark-pack' ||
    value.version !== 1 ||
    !isBoundedString(value.id, 100) ||
    !isBoundedString(value.label, 200) ||
    (value.measuredAt !== undefined &&
      (!isBoundedString(value.measuredAt, 100) || !Number.isFinite(Date.parse(value.measuredAt)))) ||
    !isRecord(value.capacities) ||
    !hasOnlyKeys(value.capacities, [
      'serviceRpsPerNode',
      'cacheRpsPerNode',
      'databaseReadRps',
    ]) ||
    !isDatum(value.capacities.serviceRpsPerNode) ||
    !isDatum(value.capacities.cacheRpsPerNode) ||
    !isRecord(value.capacities.databaseReadRps) ||
    !hasOnlyKeys(value.capacities.databaseReadRps, [
      'compact',
      'balanced',
      'performance',
    ]) ||
    !isDatum(value.capacities.databaseReadRps.compact) ||
    !isDatum(value.capacities.databaseReadRps.balanced) ||
    !isDatum(value.capacities.databaseReadRps.performance) ||
    !Array.isArray(value.measurements) ||
    value.measurements.length > 20 ||
    !value.measurements.every(isMeasurement)
  ) {
    return { ok: false, error: 'Benchmark pack does not match faultline.benchmark-pack v1.' }
  }

  if (value.environment !== undefined) {
    if (
      !isRecord(value.environment) ||
      !hasOnlyKeys(value.environment, ['hardware', 'os', 'virtualization']) ||
      !isBoundedString(value.environment.hardware) ||
      !isBoundedString(value.environment.os) ||
      !isBoundedString(value.environment.virtualization)
    ) {
      return { ok: false, error: 'Benchmark pack environment metadata is invalid.' }
    }
  }

  return { ok: true, value: value as unknown as BenchmarkPackV1 }
}

export interface BenchmarkPack extends Omit<BenchmarkPackV1, 'id'> {
  id: BenchmarkPackId
  status: 'estimated' | 'mixed-measured'
}

const referenceBenchmarkPack: BenchmarkPack = {
  schema: 'faultline.benchmark-pack',
  version: 1,
  id: 'reference-2026.08',
  label: 'Reference estimate',
  status: 'estimated',
  capacities: {
    serviceRpsPerNode: {
      value: 38_000,
      authority: 'estimated',
      basis: 'Transparent interview-scenario reference unit.',
    },
    cacheRpsPerNode: {
      value: 80_000,
      authority: 'estimated',
      basis: 'Transparent interview-scenario reference unit.',
    },
    databaseReadRps: {
      compact: {
        value: 12_000,
        authority: 'estimated',
        basis: 'Reference capacity for the 4 vCPU profile.',
      },
      balanced: {
        value: 24_000,
        authority: 'estimated',
        basis: 'Reference capacity for the 8 vCPU profile.',
      },
      performance: {
        value: 50_000,
        authority: 'estimated',
        basis: 'Reference capacity for the 16 vCPU profile.',
      },
    },
  },
  measurements: [],
}

const localPackResult = parseBenchmarkPack(JSON.stringify(localM1ProPackDocument))
if (!localPackResult.ok || localPackResult.value.id !== 'local-m1-pro-2026.08') {
  throw new Error(localPackResult.ok ? 'Unexpected built-in benchmark id.' : localPackResult.error)
}

const localM1ProBenchmarkPack: BenchmarkPack = {
  ...localPackResult.value,
  id: 'local-m1-pro-2026.08',
  status: 'mixed-measured',
}

export const BENCHMARK_PACKS: Record<BenchmarkPackId, BenchmarkPack> = {
  'reference-2026.08': referenceBenchmarkPack,
  'local-m1-pro-2026.08': localM1ProBenchmarkPack,
}

export const resolveBenchmarkPack = (id?: BenchmarkPackId) =>
  BENCHMARK_PACKS[id ?? 'reference-2026.08']

export interface PricingSource {
  service: string
  url: string
  publicationDate?: string
  checkedAt: string
}

interface ReferenceRates {
  mode: 'reference'
  gatewayNodeMonthly: number
  serviceNodeMonthly: number
  cacheNodeMonthly: number
  queueNodeMonthly: number
  databaseNodeMonthly: Record<DatabaseProfile, number>
  databaseStorageGiBMonth: number
}

interface AwsOnDemandRates {
  mode: 'aws-on-demand'
  hoursPerMonth: number
  fargateVcpuSecond: number
  fargateMemoryGbSecond: number
  serviceTaskVcpu: number
  serviceTaskMemoryGb: number
  albHour: number
  albLcuHour: number
  albBytesPerRedirect: number
  albRequestsPerConnection: number
  valkeyNodeHour: number
  sqsRequest: number
  sqsOperationsPerCreate: number
  databaseNodeHour: Record<DatabaseProfile, number>
  databaseStorageGiBMonth: number
}

export interface PricingPack {
  id: PricingPackId
  label: string
  status: 'reference' | 'verified-rates'
  provider: 'reference' | 'aws'
  region?: string
  currency: 'USD'
  checkedAt: string
  sources: PricingSource[]
  rates: ReferenceRates | AwsOnDemandRates
}

const awsCheckedAt = '2026-08-03'

export const PRICING_PACKS: Record<PricingPackId, PricingPack> = {
  'reference-2026.08': {
    id: 'reference-2026.08',
    label: 'Reference units',
    status: 'reference',
    provider: 'reference',
    currency: 'USD',
    checkedAt: '2026-08-01',
    sources: [],
    rates: {
      mode: 'reference',
      gatewayNodeMonthly: 70,
      serviceNodeMonthly: 96,
      cacheNodeMonthly: 138,
      queueNodeMonthly: 54,
      databaseNodeMonthly: {
        compact: 420,
        balanced: 840,
        performance: 1_680,
      },
      databaseStorageGiBMonth: 0.115,
    },
  },
  'aws-us-east-1-2026.07': {
    id: 'aws-us-east-1-2026.07',
    label: 'AWS us-east-1',
    status: 'verified-rates',
    provider: 'aws',
    region: 'us-east-1',
    currency: 'USD',
    checkedAt: awsCheckedAt,
    sources: [
      {
        service: 'AWS Fargate',
        url: 'https://aws.amazon.com/fargate/pricing/',
        checkedAt: awsCheckedAt,
      },
      {
        service: 'Application Load Balancer',
        url: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/us-east-1/index.json',
        publicationDate: '2026-07-20T18:49:50Z',
        checkedAt: awsCheckedAt,
      },
      {
        service: 'ElastiCache for Valkey',
        url: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonElastiCache/current/us-east-1/index.json',
        publicationDate: '2026-07-15T23:16:20Z',
        checkedAt: awsCheckedAt,
      },
      {
        service: 'Amazon RDS for PostgreSQL and gp3',
        url: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-east-1/index.json',
        publicationDate: '2026-07-29T23:42:48Z',
        checkedAt: awsCheckedAt,
      },
      {
        service: 'Amazon SQS Standard',
        url: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSQueueService/current/us-east-1/index.json',
        publicationDate: '2025-08-28T20:07:13Z',
        checkedAt: awsCheckedAt,
      },
    ],
    rates: {
      mode: 'aws-on-demand',
      hoursPerMonth: 720,
      fargateVcpuSecond: 0.000011244,
      fargateMemoryGbSecond: 0.000001235,
      serviceTaskVcpu: 1,
      serviceTaskMemoryGb: 2,
      albHour: 0.0225,
      albLcuHour: 0.008,
      albBytesPerRedirect: 768,
      albRequestsPerConnection: 100,
      valkeyNodeHour: 0.1752,
      sqsRequest: 0.0000004,
      sqsOperationsPerCreate: 3,
      databaseNodeHour: {
        compact: 0.478,
        balanced: 0.956,
        performance: 1.913,
      },
      databaseStorageGiBMonth: 0.115,
    },
  },
}

export const resolvePricingPack = (id?: PricingPackId) =>
  PRICING_PACKS[id ?? 'reference-2026.08']

export const pricingPackOptions = Object.values(PRICING_PACKS).map((pack) => ({
  value: pack.id,
  label: pack.provider === 'aws' ? 'AWS' : 'Reference',
}))

export const benchmarkPackOptions = Object.values(BENCHMARK_PACKS).map((pack) => ({
  value: pack.id,
  label: pack.status === 'mixed-measured' ? 'Local measured' : 'Reference',
}))
