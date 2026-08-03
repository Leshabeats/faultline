import {
  Check,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  Gauge,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import type {
  CapacityTuning,
  CelebrityThreshold,
  FanoutBatchSize,
  FanoutStrategy,
  FanoutWorkerCount,
  NewsFeedBottleneck,
  NewsFeedReport,
  Locale,
} from '../domain/system'
import { NEWS_FEED_MODEL_LABEL, normalizeNewsFeedTuning } from '../newsFeed/model'

export type FanoutPrediction = NewsFeedBottleneck

interface FanoutPanelProps {
  open: boolean
  locale: Locale
  tuning: CapacityTuning
  report: NewsFeedReport
  baseline: NewsFeedReport
  prediction: FanoutPrediction | null
  rationale: string
  predictionLocked: boolean
  onPredictionChange: (value: FanoutPrediction) => void
  onRationaleChange: (value: string) => void
  onCommitPrediction: () => void
  onTuningChange: (value: CapacityTuning) => void
  onDefend: () => void
  onReset: () => void
  onOpenInterviewer: () => void
  onClose: () => void
}

const bottleneckLabels: Record<NewsFeedBottleneck, string> = {
  'fanout-queue': 'Fan-out queue',
  workers: 'Worker fleet',
  'timeline-cache': 'Timeline cache',
  'post-store': 'Post store',
}

const predictions: Array<{ value: FanoutPrediction; detail: string }> = [
  { value: 'fanout-queue', detail: 'Backlog grows faster than it drains' },
  { value: 'workers', detail: 'Delivery throughput reaches its ceiling' },
  { value: 'timeline-cache', detail: 'A celebrity becomes a hot key' },
  { value: 'post-store', detail: 'Read amplification overloads storage' },
]

const statusLabels: Record<NewsFeedReport['status'], string> = {
  'within-envelope': 'Within envelope',
  'at-risk': 'At risk',
  saturated: 'Saturated',
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

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
      <div
        className="tuning-segments"
        role="group"
        aria-label={label}
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
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

export function FanoutPanel({
  open,
  locale,
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
}: FanoutPanelProps) {
  const ru = locale === 'ru'
  const values = normalizeNewsFeedTuning(tuning)
  const correctPrediction = prediction === baseline.bottleneck
  const costDelta = report.cost.total - baseline.cost.total

  return (
    <aside className={`interviewer-panel bottleneck-panel fanout-panel ${open ? 'is-open' : 'is-closed'}`}>
      <div className="sheet-handle" aria-hidden="true" />
      <header className="interviewer-header bottleneck-header">
        <div>
          <strong>{ru ? 'Защита от скачка' : 'Celebrity Defense'}</strong>
          <span>{NEWS_FEED_MODEL_LABEL}</span>
        </div>
        <div className="panel-header-actions">
          <button type="button" onClick={onOpenInterviewer} aria-label="Open interviewer" title="Interviewer">
            <MessageCircle size={19} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close celebrity defense">
            <ChevronLeft size={21} />
          </button>
        </div>
      </header>

      <div className="interviewer-body bottleneck-body">
        <div className="defense-step-rail" aria-label="Defense progress">
          <span className="is-complete"><i>1</i> {ru ? 'Прогноз' : 'Predict'}</span>
          <span className={predictionLocked ? 'is-active' : ''}><i>2</i> {ru ? 'Настройка' : 'Tune'}</span>
          <span><i>3</i> {ru ? 'Защита' : 'Defend'}</span>
        </div>

        {!predictionLocked ? (
          <section className="prediction-gate">
            <div className="defense-heading">
              <Sparkles size={22} />
              <div>
                <h2>{ru ? 'Что сломается первым?' : 'What breaks first?'}</h2>
                <p>{ru ? 'Один пост. 50 миллионов подписчиков. Сначала зафиксируйте прогноз.' : 'One post. 50 million followers. Commit before seeing the model.'}</p>
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
              <span>{ru ? 'Ваше рассуждение' : 'Your reasoning'}</span>
              <textarea
                value={rationale}
                onChange={(event) => onRationaleChange(event.target.value)}
                placeholder={ru ? 'Назовите множитель, определяющий прогноз…' : 'Name the multiplier that drives your prediction…'}
              />
            </label>
            <button
              className="commit-prediction"
              type="button"
              disabled={!prediction || rationale.trim().length < 8}
              onClick={onCommitPrediction}
            >
              {ru ? 'Зафиксировать прогноз' : 'Commit prediction'} <ChevronDown size={17} />
            </button>
          </section>
        ) : (
          <>
            <section className={`prediction-result ${correctPrediction ? 'is-correct' : 'is-missed'}`}>
              <span>{correctPrediction ? <ShieldCheck size={18} /> : <Gauge size={18} />}</span>
              <div>
                <strong>{correctPrediction ? 'Prediction holds' : 'Model found a different limit'}</strong>
                <p>
                  Untuned, the spike saturates the {bottleneckLabels[baseline.bottleneck].toLowerCase()}.
                  {report.bottleneck !== baseline.bottleneck
                    ? ` Tuning moves pressure to the ${bottleneckLabels[report.bottleneck].toLowerCase()}.`
                    : ''}
                </p>
              </div>
            </section>

            <section className="capacity-outcome celebrity-outcome" aria-live="polite">
              <header>
                <div>
                  <span className={`capacity-status is-${report.status}`}><i /> {statusLabels[report.status]}</span>
                  <strong>{currency.format(report.cost.total)}<small>/mo</small></strong>
                </div>
                <span className="estimate-label">Estimated</span>
              </header>
              <div className="defense-metrics">
                <div className={report.metrics.p99 < baseline.metrics.p99 ? 'defense-metric is-good' : 'defense-metric is-warning'}>
                  <span>{ru ? 'Свежесть p99' : 'Freshness p99'}</span>
                  <strong>{report.metrics.p99 >= 1_000 ? `${(report.metrics.p99 / 1_000).toFixed(1)} s` : `${report.metrics.p99} ms`}</strong>
                  <small>{ru ? 'было' : 'was'} {baseline.metrics.p99 >= 1_000 ? `${(baseline.metrics.p99 / 1_000).toFixed(1)} s` : `${baseline.metrics.p99} ms`}</small>
                </div>
                <div className={report.metrics.queueDepth < baseline.metrics.queueDepth ? 'defense-metric is-good' : 'defense-metric is-warning'}>
                  <span>{ru ? 'Отставание' : 'Backlog'}</span>
                  <strong>{compact.format(report.metrics.queueDepth)}</strong>
                  <small>{ru ? 'было' : 'was'} {compact.format(baseline.metrics.queueDepth)}</small>
                </div>
                <div className="defense-metric">
                  <span>{ru ? 'Доставок/с' : 'Deliveries/s'}</span>
                  <strong>{compact.format(report.metrics.throughput)}</strong>
                  <small>{ru ? 'было' : 'was'} {compact.format(baseline.metrics.throughput)}</small>
                </div>
              </div>
              <p className={`cost-delta ${costDelta > 0 ? 'is-increase' : 'is-saving'}`}>
                <CircleDollarSign size={15} />
                {costDelta === 0
                  ? ru ? 'Та же месячная стоимость, что без настройки.' : 'Same monthly envelope as the untuned design.'
                  : `${costDelta > 0 ? '+' : '−'}${currency.format(Math.abs(costDelta))}${ru ? '/мес относительно базы.' : '/mo versus untuned.'}`}
              </p>
            </section>

            <section className="tuning-section">
              <div className="section-title-row">
                <div>
                  <h2>{ru ? 'Настройте fan-out путь' : 'Tune the fan-out path'}</h2>
                  <p>{ru ? 'Каждый выбор сразу меняет скачок и стоимость.' : 'Every choice updates the spike and cost live.'}</p>
                </div>
                <button type="button" onClick={onReset} aria-label="Reset fan-out tuning" title="Reset tuning">
                  <RotateCcw size={16} />
                </button>
              </div>
              <SegmentedControl<FanoutStrategy>
                label={ru ? 'Стратегия fan-out' : 'Fan-out strategy'}
                value={values.strategy}
                options={[
                  { value: 'write', label: 'Write' },
                  { value: 'read', label: 'Read' },
                  { value: 'hybrid', label: 'Hybrid' },
                ]}
                onChange={(fanoutStrategy) => onTuningChange({ ...tuning, fanoutStrategy })}
              />
              <SegmentedControl<FanoutWorkerCount>
                label={ru ? 'Воркеры' : 'Workers'}
                value={values.workers}
                options={[
                  { value: 4, label: '4' },
                  { value: 16, label: '16' },
                  { value: 64, label: '64' },
                ]}
                onChange={(fanoutWorkers) => onTuningChange({ ...tuning, fanoutWorkers })}
              />
              <SegmentedControl<FanoutBatchSize>
                label={ru ? 'Размер батча' : 'Batch size'}
                value={values.batchSize}
                options={[
                  { value: 100, label: '100' },
                  { value: 500, label: '500' },
                  { value: 2000, label: '2k' },
                ]}
                onChange={(fanoutBatchSize) => onTuningChange({ ...tuning, fanoutBatchSize })}
              />
              <SegmentedControl<CelebrityThreshold>
                label={ru ? 'Порог знаменитости' : 'Celebrity threshold'}
                value={values.celebrityThreshold}
                options={[
                  { value: 100_000, label: '100k' },
                  { value: 1_000_000, label: '1M' },
                  { value: 10_000_000, label: '10M' },
                ]}
                onChange={(celebrityThreshold) => onTuningChange({ ...tuning, celebrityThreshold })}
              />
              <div className="tuning-control tuning-toggle-row">
                <span><UsersRound size={15} /> {ru ? 'Идемпотентная доставка' : 'Idempotent delivery'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={values.deduplication}
                  className={`tuning-switch ${values.deduplication ? 'is-active' : ''}`}
                  aria-label="Deduplicate timeline delivery"
                  onClick={() => onTuningChange({ ...tuning, deduplication: !values.deduplication })}
                >
                  <i />
                </button>
              </div>
            </section>

            <details className="capacity-assumptions">
              <summary><span>{ru ? 'Почему такая оценка' : 'Why this estimate'}</span><ChevronDown size={16} /></summary>
              <dl>
                <div><dt>Fan-out jobs</dt><dd>{compact.format(report.workload.fanoutJobsPerSecond)}/s</dd></div>
                <div><dt>Worker load</dt><dd>{Math.round(report.utilization.workers * 100)}%</dd></div>
                <div><dt>Duplicate rate</dt><dd>{report.duplicateRate.toFixed(2)}%</dd></div>
                <div><dt>Celebrity reach</dt><dd>{compact.format(report.workload.celebrityFollowers)}</dd></div>
              </dl>
              <ul>{report.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
            </details>

            <button className="defend-design" type="button" onClick={onDefend}>
              <MessageCircle size={18} /> {ru ? 'Защитить решение' : 'Defend this design'}
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
