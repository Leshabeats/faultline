import {
  Check,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  Database,
  Gauge,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import type {
  BottleneckKind,
  CapacityReport,
  CapacityTuning,
} from '../domain/system'
import { CAPACITY_MODEL_LABEL } from '../capacity/model'

export type BottleneckPrediction = BottleneckKind

interface BottleneckPanelProps {
  open: boolean
  tuning: CapacityTuning
  report: CapacityReport
  baseline: CapacityReport
  prediction: BottleneckPrediction | null
  rationale: string
  predictionLocked: boolean
  onPredictionChange: (value: BottleneckPrediction) => void
  onRationaleChange: (value: string) => void
  onCommitPrediction: () => void
  onTuningChange: (value: CapacityTuning) => void
  onDefend: () => void
  onReset: () => void
  onOpenInterviewer: () => void
  onClose: () => void
}

const bottleneckLabels: Record<BottleneckKind, string> = {
  cache: 'Cache tier',
  service: 'API service',
  'connection-pool': 'Connection pool',
  database: 'Primary database',
}

const predictions: Array<{
  value: BottleneckPrediction
  detail: string
}> = [
  { value: 'cache', detail: 'Miss rate and cache availability' },
  { value: 'connection-pool', detail: 'Concurrent database work' },
  { value: 'database', detail: 'Query work and read capacity' },
  { value: 'service', detail: 'Application replica saturation' },
]

const statusLabels: Record<CapacityReport['status'], string> = {
  'within-envelope': 'Within envelope',
  'at-risk': 'At risk',
  saturated: 'Saturated',
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const percent = (value: number) => `${Math.round(value * 100)}%`

function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="tuning-control">
      <span>{label}</span>
      <div className="tuning-segments" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? 'is-active' : ''}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ComparisonMetric({
  label,
  value,
  baseline,
  tone,
}: {
  label: string
  value: string
  baseline: string
  tone?: 'good' | 'warning'
}) {
  return (
    <div className={`defense-metric ${tone ? `is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>was {baseline}</small>
    </div>
  )
}

export function BottleneckPanel({
  open,
  tuning,
  report,
  baseline,
  prediction,
  rationale,
  predictionLocked,
  onPredictionChange,
  onRationaleChange,
  onCommitPrediction,
  onTuningChange,
  onDefend,
  onReset,
  onOpenInterviewer,
  onClose,
}: BottleneckPanelProps) {
  const correctPrediction = prediction === baseline.bottleneck
  const nextLimitMoved = report.bottleneck !== baseline.bottleneck
  const costDelta = report.cost.total - baseline.cost.total

  return (
    <aside className={`interviewer-panel bottleneck-panel ${open ? 'is-open' : 'is-closed'}`}>
      <div className="sheet-handle" aria-hidden="true" />
      <header className="interviewer-header bottleneck-header">
        <div>
          <strong>Bottleneck Defense</strong>
          <span>{CAPACITY_MODEL_LABEL}</span>
        </div>
        <div className="panel-header-actions">
          <button type="button" onClick={onOpenInterviewer} aria-label="Open interviewer" title="Interviewer">
            <MessageCircle size={19} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close bottleneck defense">
            <ChevronLeft size={21} />
          </button>
        </div>
      </header>

      <div className="interviewer-body bottleneck-body">
        <div className="defense-step-rail" aria-label="Defense progress">
          <span className="is-complete"><i>1</i> Predict</span>
          <span className={predictionLocked ? 'is-active' : ''}><i>2</i> Tune</span>
          <span><i>3</i> Defend</span>
        </div>

        {!predictionLocked ? (
          <section className="prediction-gate">
            <div className="defense-heading">
              <Gauge size={22} />
              <div>
                <h2>What saturates first?</h2>
                <p>100k redirects/s. Redis is unavailable. Commit before seeing the model.</p>
              </div>
            </div>
            <div className="prediction-options" role="radiogroup" aria-label="Predicted first bottleneck">
              {predictions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={prediction === option.value}
                  className={prediction === option.value ? 'is-selected' : ''}
                  onClick={() => onPredictionChange(option.value)}
                >
                  <span>
                    <strong>{bottleneckLabels[option.value]}</strong>
                    <small>{option.detail}</small>
                  </span>
                  <i>{prediction === option.value ? <Check size={14} /> : null}</i>
                </button>
              ))}
            </div>
            <label className="prediction-rationale">
              <span>Your reasoning</span>
              <textarea
                value={rationale}
                onChange={(event) => onRationaleChange(event.target.value)}
                placeholder="State the assumption that drives your prediction…"
              />
            </label>
            <button
              className="commit-prediction"
              type="button"
              disabled={!prediction || rationale.trim().length < 8}
              onClick={onCommitPrediction}
            >
              Commit prediction <ChevronDown size={17} />
            </button>
          </section>
        ) : (
          <>
            <section className={`prediction-result ${correctPrediction ? 'is-correct' : 'is-missed'}`}>
              <span>{correctPrediction ? <ShieldCheck size={18} /> : <Gauge size={18} />}</span>
              <div>
                <strong>{correctPrediction ? 'Prediction holds' : 'Model found a different limit'}</strong>
                <p>
                  {correctPrediction
                    ? `The untuned design fails first at ${bottleneckLabels[baseline.bottleneck].toLowerCase()}.`
                    : `You chose ${prediction ? bottleneckLabels[prediction].toLowerCase() : '—'}; the untuned model points to ${bottleneckLabels[baseline.bottleneck].toLowerCase()}.`}
                  {nextLimitMoved
                    ? ` After tuning, pressure moves to ${bottleneckLabels[report.bottleneck].toLowerCase()}.`
                    : ''}
                </p>
              </div>
            </section>

            <section className="capacity-outcome" aria-live="polite">
              <header>
                <div>
                  <span className={`capacity-status is-${report.status}`}><i /> {statusLabels[report.status]}</span>
                  <strong>{currency.format(report.cost.total)}<small>/mo</small></strong>
                </div>
                <span className="estimate-label">Estimated</span>
              </header>
              <div className="defense-metrics">
                <ComparisonMetric
                  label="p99"
                  value={`${report.metrics.p99} ms`}
                  baseline={`${baseline.metrics.p99} ms`}
                  tone={report.metrics.p99 < baseline.metrics.p99 ? 'good' : 'warning'}
                />
                <ComparisonMetric
                  label="DB CPU"
                  value={`${report.metrics.dbCpu}%`}
                  baseline={`${baseline.metrics.dbCpu}%`}
                  tone={report.metrics.dbCpu < baseline.metrics.dbCpu ? 'good' : 'warning'}
                />
                <ComparisonMetric
                  label="Cost / 1M"
                  value={`$${report.cost.perMillionRedirects.toFixed(3)}`}
                  baseline={`$${baseline.cost.perMillionRedirects.toFixed(3)}`}
                />
              </div>
              <p className={`cost-delta ${costDelta > 0 ? 'is-increase' : 'is-saving'}`}>
                <CircleDollarSign size={15} />
                {costDelta === 0
                  ? 'Same monthly envelope as the untuned design.'
                  : `${costDelta > 0 ? '+' : '−'}${currency.format(Math.abs(costDelta))}/mo versus untuned.`}
              </p>
            </section>

            <section className="tuning-section">
              <div className="section-title-row">
                <div>
                  <h2>Tune the read path</h2>
                  <p>Every choice updates traffic and cost live.</p>
                </div>
                <button type="button" onClick={onReset} aria-label="Reset tuning" title="Reset tuning">
                  <RotateCcw size={16} />
                </button>
              </div>

              <SegmentedControl
                label="Cache target"
                value={tuning.cacheHitRate}
                options={[
                  { value: 0.9, label: '90%' },
                  { value: 0.95, label: '95%' },
                  { value: 0.99, label: '99%' },
                ]}
                onChange={(cacheHitRate) => onTuningChange({ ...tuning, cacheHitRate })}
              />
              <div className="tuning-control tuning-toggle-row">
                <span><Database size={15} /> Lookup index</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={tuning.indexedLookup}
                  className={`tuning-switch ${tuning.indexedLookup ? 'is-active' : ''}`}
                  aria-label="Use indexed lookup"
                  onClick={() => onTuningChange({ ...tuning, indexedLookup: !tuning.indexedLookup })}
                >
                  <i />
                </button>
              </div>
              <SegmentedControl
                label="Connection pool"
                value={tuning.poolSize}
                options={[
                  { value: 100, label: '100' },
                  { value: 300, label: '300' },
                  { value: 600, label: '600' },
                ]}
                onChange={(poolSize) => onTuningChange({ ...tuning, poolSize })}
              />
              <SegmentedControl
                label="Read replicas"
                value={tuning.readReplicas}
                options={[
                  { value: 0, label: 'None' },
                  { value: 1, label: '+1' },
                  { value: 2, label: '+2' },
                ]}
                onChange={(readReplicas) => onTuningChange({ ...tuning, readReplicas })}
              />
              <SegmentedControl
                label="Database profile"
                value={tuning.databaseProfile}
                options={[
                  { value: 'compact', label: '4 vCPU' },
                  { value: 'balanced', label: '8 vCPU' },
                  { value: 'performance', label: '16 vCPU' },
                ]}
                onChange={(databaseProfile) => onTuningChange({ ...tuning, databaseProfile })}
              />
            </section>

            <details className="capacity-assumptions">
              <summary>
                <span>Why this estimate</span>
                <ChevronDown size={16} />
              </summary>
              <dl>
                <div><dt>DB reads</dt><dd>{Math.round(report.workload.databaseReadRps / 1000)}k/s</dd></div>
                <div><dt>Effective hit rate</dt><dd>{percent(report.workload.effectiveCacheHitRate)}</dd></div>
                <div><dt>Retained rows</dt><dd>{(report.workload.retainedRows / 1_000_000_000).toFixed(1)}B</dd></div>
                <div><dt>Raw storage</dt><dd>{(report.workload.rawStorageGiB / 1024).toFixed(1)} TiB</dd></div>
              </dl>
              <ul>
                {report.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
              </ul>
            </details>

            <button className="defend-design" type="button" onClick={onDefend}>
              <MessageCircle size={18} /> Defend this design
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
