import {
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  Database,
  Gauge,
  FlaskConical,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import type {
  BottleneckKind,
  CapacityReport,
  CapacityTuning,
  Locale,
} from '../domain/system'
import { CAPACITY_MODEL_LABEL } from '../capacity/model'
import {
  benchmarkPackOptions,
  pricingPackOptions,
  resolveBenchmarkPack,
  resolvePricingPack,
} from '../capacity/calibration'

export type BottleneckPrediction = BottleneckKind

interface BottleneckPanelProps {
  open: boolean
  locale: Locale
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

function ComparisonMetric({
  label,
  value,
  baseline,
  tone,
  locale,
}: {
  label: string
  value: string
  baseline: string
  tone?: 'good' | 'warning'
  locale: Locale
}) {
  return (
    <div className={`defense-metric ${tone ? `is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{locale === 'ru' ? 'было' : 'was'} {baseline}</small>
    </div>
  )
}

export function BottleneckPanel({
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
}: BottleneckPanelProps) {
  const ru = locale === 'ru'
  const labels: Record<BottleneckKind, string> = ru ? {
    cache: 'Кеш',
    service: 'API-сервис',
    'connection-pool': 'Пул соединений',
    database: 'Основная БД',
  } : bottleneckLabels
  const localizedPredictions = ru ? [
    { value: 'cache' as const, detail: 'Miss rate и доступность кеша' },
    { value: 'connection-pool' as const, detail: 'Параллельная работа с БД' },
    { value: 'database' as const, detail: 'Запросы и ёмкость чтения' },
    { value: 'service' as const, detail: 'Насыщение реплик приложения' },
  ] : predictions
  const correctPrediction = prediction === baseline.bottleneck
  const nextLimitMoved = report.bottleneck !== baseline.bottleneck
  const costDelta = report.cost.total - baseline.cost.total
  const pricingPack = resolvePricingPack(report.calibration.pricing.id)
  const benchmarkPack = resolveBenchmarkPack(report.calibration.capacity.id)

  return (
    <aside className={`interviewer-panel bottleneck-panel ${open ? 'is-open' : 'is-closed'}`}>
      <div className="sheet-handle" aria-hidden="true" />
      <header className="interviewer-header bottleneck-header">
        <div>
          <strong>{ru ? 'Защита узкого места' : 'Bottleneck Defense'}</strong>
          <span>{CAPACITY_MODEL_LABEL}</span>
        </div>
        <div className="panel-header-actions">
          <button type="button" onClick={onOpenInterviewer} aria-label={ru ? 'Открыть интервьюера' : 'Open interviewer'} title={ru ? 'Интервьюер' : 'Interviewer'}>
            <MessageCircle size={19} />
          </button>
          <button type="button" onClick={onClose} aria-label={ru ? 'Закрыть защиту' : 'Close bottleneck defense'}>
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
              <Gauge size={22} />
              <div>
                <h2>{ru ? 'Что насытится первым?' : 'What saturates first?'}</h2>
                <p>{ru
                  ? `${Math.round(report.workload.redirectRps / 1000)}k редиректов/с. Зафиксируйте прогноз до просмотра модели.`
                  : `${Math.round(report.workload.redirectRps / 1000)}k redirects/s. Commit before seeing the model.`}</p>
              </div>
            </div>
            <div className="prediction-options" role="radiogroup" aria-label="Predicted first bottleneck">
              {localizedPredictions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={prediction === option.value}
                  className={prediction === option.value ? 'is-selected' : ''}
                  onClick={() => onPredictionChange(option.value)}
                >
                  <span>
                    <strong>{labels[option.value]}</strong>
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
                placeholder={ru ? 'Назовите допущение, определяющее прогноз…' : 'State the assumption that drives your prediction…'}
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
                <strong>{correctPrediction
                  ? ru ? 'Прогноз подтвердился' : 'Prediction holds'
                  : ru ? 'Модель нашла другое ограничение' : 'Model found a different limit'}</strong>
                <p>
                  {ru
                    ? correctPrediction
                      ? `Без настройки первым отказывает: ${labels[baseline.bottleneck].toLowerCase()}.`
                      : `Ваш выбор: ${prediction ? labels[prediction].toLowerCase() : '—'}; модель указывает на ${labels[baseline.bottleneck].toLowerCase()}.`
                    : correctPrediction
                      ? `The untuned design fails first at ${labels[baseline.bottleneck].toLowerCase()}.`
                      : `You chose ${prediction ? labels[prediction].toLowerCase() : '—'}; the untuned model points to ${labels[baseline.bottleneck].toLowerCase()}.`}
                  {nextLimitMoved ? ru
                    ? ` После настройки нагрузка смещается на ${labels[report.bottleneck].toLowerCase()}.`
                    : ` After tuning, pressure moves to ${labels[report.bottleneck].toLowerCase()}.` : ''}
                </p>
              </div>
            </section>

            <section className="capacity-outcome" aria-live="polite">
              <header>
                <div>
                  <span className={`capacity-status is-${report.status}`}><i /> {ru
                    ? ({ 'within-envelope': 'В пределах', 'at-risk': 'Под риском', saturated: 'Насыщено' } as const)[report.status]
                    : statusLabels[report.status]}</span>
                  <strong>{currency.format(report.cost.total)}<small>{ru ? '/мес' : '/mo'}</small></strong>
                </div>
                <span className="estimate-label">{ru ? 'Оценка' : 'Estimated'}</span>
              </header>
              <div className="defense-metrics">
                <ComparisonMetric
                  label="p99"
                  value={`${report.metrics.p99} ms`}
                  baseline={`${baseline.metrics.p99} ms`}
                  tone={report.metrics.p99 < baseline.metrics.p99 ? 'good' : 'warning'}
                  locale={locale}
                />
                <ComparisonMetric
                  label="DB CPU"
                  value={`${report.metrics.dbCpu}%`}
                  baseline={`${baseline.metrics.dbCpu}%`}
                  tone={report.metrics.dbCpu < baseline.metrics.dbCpu ? 'good' : 'warning'}
                  locale={locale}
                />
                <ComparisonMetric
                  label={ru ? 'Цена / 1M' : 'Cost / 1M'}
                  value={`$${report.cost.perMillionRedirects.toFixed(3)}`}
                  baseline={`$${baseline.cost.perMillionRedirects.toFixed(3)}`}
                  locale={locale}
                />
              </div>
              <p className={`cost-delta ${costDelta > 0 ? 'is-increase' : 'is-saving'}`}>
                <CircleDollarSign size={15} />
                {costDelta === 0
                  ? ru ? 'Та же месячная стоимость, что без настройки.' : 'Same monthly envelope as the untuned design.'
                  : ru
                    ? `${costDelta > 0 ? '+' : '−'}${currency.format(Math.abs(costDelta))}/мес относительно базовой схемы.`
                    : `${costDelta > 0 ? '+' : '−'}${currency.format(Math.abs(costDelta))}/mo versus untuned.`}
              </p>
            </section>

            <section className="calibration-section">
              <div className="section-title-row calibration-heading">
                <div>
                  <h2>{ru ? 'Калибровка' : 'Calibration'}</h2>
                  <p>{ru ? 'Цены и данные о ёмкости проверяются отдельно.' : 'Verified rates and capacity evidence stay separate.'}</p>
                </div>
              </div>
              <SegmentedControl
                label={ru ? 'Цены' : 'Pricing'}
                value={report.calibration.pricing.id}
                options={pricingPackOptions}
                onChange={(pricingPackId) => onTuningChange({ ...tuning, pricingPackId })}
              />
              <div className="calibration-evidence">
                <BadgeCheck size={15} />
                <span>
                  <strong>
                    {pricingPack.status === 'verified-rates'
                      ? ru ? 'Проверенные тарифы' : 'Verified unit rates'
                      : ru ? 'Учебные единицы' : 'Reference units'}
                  </strong>
                  <small>
                    {pricingPack.status === 'verified-rates'
                      ? `${pricingPack.region} · checked ${pricingPack.checkedAt} · ${pricingPack.sources.length} sources`
                      : ru ? 'Учебная база · без тарифа провайдера' : 'Training baseline · no provider rate card'}
                  </small>
                </span>
              </div>
              <SegmentedControl
                label={ru ? 'Ёмкость' : 'Capacity'}
                value={report.calibration.capacity.id}
                options={benchmarkPackOptions}
                onChange={(benchmarkPackId) => onTuningChange({ ...tuning, benchmarkPackId })}
              />
              <div className="calibration-evidence is-benchmark">
                <FlaskConical size={15} />
                <span>
                  <strong>
                    {benchmarkPack.status === 'mixed-measured'
                      ? ru ? 'Измерено + рассчитано' : 'Measured + derived'
                      : ru ? 'Оценочная ёмкость' : 'Estimated capacity'}
                  </strong>
                  <small>
                    {benchmarkPack.environment?.hardware ?? (ru ? 'Прозрачная учебная база' : 'Transparent scenario baseline')}
                  </small>
                </span>
              </div>
            </section>

            <section className="tuning-section">
              <div className="section-title-row">
                <div>
                  <h2>{ru ? 'Настройте путь чтения' : 'Tune the read path'}</h2>
                  <p>{ru ? 'Каждый выбор сразу меняет трафик и стоимость.' : 'Every choice updates traffic and cost live.'}</p>
                </div>
                <button type="button" onClick={onReset} aria-label={ru ? 'Сбросить настройки' : 'Reset tuning'} title={ru ? 'Сбросить настройки' : 'Reset tuning'}>
                  <RotateCcw size={16} />
                </button>
              </div>

              <SegmentedControl
                label={ru ? 'Цель кеша' : 'Cache target'}
                value={tuning.cacheHitRate}
                options={[
                  { value: 0.9, label: '90%' },
                  { value: 0.95, label: '95%' },
                  { value: 0.99, label: '99%' },
                ]}
                onChange={(cacheHitRate) => onTuningChange({ ...tuning, cacheHitRate })}
              />
              <div className="tuning-control tuning-toggle-row">
                <span><Database size={15} /> {ru ? 'Индекс поиска' : 'Lookup index'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={tuning.indexedLookup}
                  className={`tuning-switch ${tuning.indexedLookup ? 'is-active' : ''}`}
                  aria-label={ru ? 'Использовать индекс' : 'Use indexed lookup'}
                  onClick={() => onTuningChange({ ...tuning, indexedLookup: !tuning.indexedLookup })}
                >
                  <i />
                </button>
              </div>
              <SegmentedControl
                label={ru ? 'Пул соединений' : 'Connection pool'}
                value={tuning.poolSize}
                options={[
                  { value: 100, label: '100' },
                  { value: 300, label: '300' },
                  { value: 600, label: '600' },
                ]}
                onChange={(poolSize) => onTuningChange({ ...tuning, poolSize })}
              />
              <SegmentedControl
                label={ru ? 'Реплики чтения' : 'Read replicas'}
                value={tuning.readReplicas}
                options={[
                  { value: 0, label: ru ? 'Нет' : 'None' },
                  { value: 1, label: '+1' },
                  { value: 2, label: '+2' },
                ]}
                onChange={(readReplicas) => onTuningChange({ ...tuning, readReplicas })}
              />
              <SegmentedControl
                label={ru ? 'Профиль БД' : 'Database profile'}
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
                <span>{ru ? 'Почему такая оценка' : 'Why this estimate'}</span>
                <ChevronDown size={16} />
              </summary>
              <dl>
                <div><dt>{ru ? 'Чтение БД' : 'DB reads'}</dt><dd>{Math.round(report.workload.databaseReadRps / 1000)}k/s</dd></div>
                <div><dt>{ru ? 'Загрузка кеша' : 'Cache utilization'}</dt><dd>{percent(report.utilization.cache)}</dd></div>
                <div><dt>{ru ? 'Эффективный hit rate' : 'Effective hit rate'}</dt><dd>{percent(report.workload.effectiveCacheHitRate)}</dd></div>
                <div><dt>{ru ? 'Строк хранится' : 'Retained rows'}</dt><dd>{(report.workload.retainedRows / 1_000_000_000).toFixed(1)}B</dd></div>
                <div><dt>{ru ? 'Сырые данные' : 'Raw storage'}</dt><dd>{(report.workload.rawStorageGiB / 1024).toFixed(1)} TiB</dd></div>
              </dl>
              <ul>
                {report.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
              </ul>
              {pricingPack.sources.length > 0 && (
                <div className="calibration-sources">
                  <span>{ru ? 'Источники цен' : 'Rate sources'}</span>
                  <div>
                    {pricingPack.sources.map((source) => (
                      <a key={source.service} href={source.url} target="_blank" rel="noreferrer">
                        {source.service}
                      </a>
                    ))}
                  </div>
                </div>
              )}
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
