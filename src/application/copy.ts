import type {
  CapacityTuning,
  ComponentKind,
  FaultMode,
  Locale,
  CapacityReport,
  NewsFeedReport,
  ScenarioId,
} from '../domain/system'
import { faultLabels, componentLabels } from '../i18n'
import { normalizeNewsFeedTuning } from '../newsFeed/model'
import type { ReplayImportErrorCode, ReplayKeyMomentV1 } from '../replay'

export const applicationCopy = {
  en: {
    componentRemoved: 'Component removed',
    connectionRemoved: 'Connection removed',
    connectionAdded: 'Connection added',
    topologyRecalculated: 'Topology recalculated',
    layoutUpdated: 'Architecture layout updated',
    connectToModel: 'Connect it to change the live model',
    capacityUpdated: 'Capacity tuning updated',
    referenceRestored: 'Reference tuning restored',
    designSubmitted: 'Design submitted',
    attemptSaved: 'Attempt saved',
    replayInHistory: 'Replay is available in History',
    replayNotSaved: 'Replay not saved',
    storageUnavailable: 'Local storage is unavailable',
    replayCopied: 'Replay copied',
    scenarioCopied: 'Scenario copied',
    replayReadyToImport: 'The full attempt is ready to import',
    snapshotReadyToShare: 'Architecture snapshot is ready to share',
    shareUnavailable: 'Share unavailable',
    clipboardDenied: 'Clipboard access was not granted',
    deleteFailed: 'Could not delete replay',
    importFailed: 'Replay import failed',
    scenarioMigrated: 'Scenario migrated',
    replayImported: 'Replay imported',
    migratedNotice: 'Imported and migrated the v0.1 scenario snapshot.',
    importedNotice: 'Replay imported and saved on this device.',
    migratedDetail: 'The v0.1 snapshot is now replayable',
    importedDetail: 'Saved to this device',
    fileUnreadable: 'The selected replay file could not be read.',
    answerReviewed: 'Answer reviewed',
    focus: 'Focus',
    designReady: 'Design ready to defend',
  },
  ru: {
    componentRemoved: 'Компонент удалён',
    connectionRemoved: 'Связь удалена',
    connectionAdded: 'Связь добавлена',
    topologyRecalculated: 'Топология пересчитана',
    layoutUpdated: 'Расположение схемы обновлено',
    connectToModel: 'Подключите компонент, чтобы изменить модель',
    capacityUpdated: 'Параметры ёмкости обновлены',
    referenceRestored: 'Эталонные параметры восстановлены',
    designSubmitted: 'Решение отправлено',
    attemptSaved: 'Попытка сохранена',
    replayInHistory: 'Повтор доступен в истории',
    replayNotSaved: 'Повтор не сохранён',
    storageUnavailable: 'Локальное хранилище недоступно',
    replayCopied: 'Повтор скопирован',
    scenarioCopied: 'Сценарий скопирован',
    replayReadyToImport: 'Полная попытка готова к импорту',
    snapshotReadyToShare: 'Снимок архитектуры готов к отправке',
    shareUnavailable: 'Не удалось поделиться',
    clipboardDenied: 'Нет доступа к буферу обмена',
    deleteFailed: 'Не удалось удалить повтор',
    importFailed: 'Не удалось импортировать повтор',
    scenarioMigrated: 'Сценарий перенесён',
    replayImported: 'Повтор импортирован',
    migratedNotice: 'Снимок сценария v0.1 импортирован и обновлён.',
    importedNotice: 'Повтор импортирован и сохранён на этом устройстве.',
    migratedDetail: 'Снимок v0.1 теперь можно воспроизвести',
    importedDetail: 'Сохранено на этом устройстве',
    fileUnreadable: 'Не удалось прочитать выбранный файл повтора.',
    answerReviewed: 'Ответ разобран',
    focus: 'Фокус',
    designReady: 'Решение готово к защите',
  },
} as const

export const componentAddedCopy = (
  locale: Locale,
  kind: ComponentKind,
  label: string,
) => ({
  eventTitle: locale === 'ru'
    ? `Добавлен компонент: ${componentLabels.ru[kind]}`
    : `${componentLabels.en[kind]} added`,
  timelineTitle: locale === 'ru' ? `${label}: компонент добавлен` : `${label} added`,
  detail: applicationCopy[locale].connectToModel,
})

export const capacityChangeDetail = (
  locale: Locale,
  changedKey?: keyof CapacityTuning,
) => {
  if (!changedKey) return applicationCopy[locale].referenceRestored
  if (locale === 'en') return `${changedKey.replace(/([A-Z])/g, ' $1').toLowerCase()} updated`
  const labels: Partial<Record<keyof CapacityTuning, string>> = {
    cacheHitRate: 'Hit rate кеша',
    indexedLookup: 'Индексированный поиск',
    poolSize: 'Пул соединений',
    readReplicas: 'Реплики чтения',
    databaseProfile: 'Профиль БД',
    pricingPackId: 'Тарифный профиль',
    benchmarkPackId: 'Профиль производительности',
    fanoutStrategy: 'Стратегия fan-out',
    fanoutWorkers: 'Количество воркеров',
    fanoutBatchSize: 'Размер пакета fan-out',
    celebrityThreshold: 'Порог знаменитости',
    deduplication: 'Дедупликация',
  }
  return `Изменено: ${labels[changedKey] ?? changedKey}`
}

export const bottleneckCopy = (locale: Locale, value: string) => {
  if (locale === 'en') return value.replace(/-/g, ' ')
  return ({
    cache: 'кеш',
    service: 'API-сервис',
    'connection-pool': 'пул соединений',
    database: 'основная БД',
    'fanout-queue': 'fan-out очередь',
    workers: 'воркеры',
    'timeline-cache': 'кеш лент',
    'post-store': 'хранилище постов',
  } as Record<string, string>)[value] ?? value.replace(/-/g, ' ')
}

export const scoreDimensionCopy = (locale: Locale, dimension: string, fallback: string) => {
  if (locale === 'en') return fallback
  return ({
    reliability: 'Надёжность',
    performance: 'Производительность',
    freshness: 'Свежесть',
    resilience: 'Устойчивость',
    clarity: 'Ясность',
  } as Record<string, string>)[dimension] ?? fallback
}

export function capacityAssumptionsCopy(
  locale: Locale,
  report: CapacityReport,
) {
  if (locale === 'en') return report.assumptions
  const verified = report.calibration.pricing.status === 'verified-rates'
  const capacityEvidence = report.calibration.capacity.status === 'mixed-measured'
    ? 'локальные замеры'
    : 'эталонная оценка'
  return [
    '100 созданий ссылок/с, хранение 5 лет и 200 Б сырых данных на запись.',
    `Основа профиля ёмкости: ${capacityEvidence}; значения производительности остаются учебной моделью.`,
    'Реплика чтения даёт 85% ёмкости основной БД.',
    `${report.workload.databaseShards} шард. БД делят логический датасет; каждый слой реплик хранит одну полную копию разделённых данных.`,
    verified
      ? 'Тарифы AWS проверены; объёмы потребления рассчитаны. Без скидок и free tier.'
      : 'Учебные цены нужны для сравнения решений и не являются тарифом облачного провайдера.',
    verified
      ? 'Не учтены трафик, бэкапы, observability, NAT, публичные IPv4, поддержка и налоги.'
      : 'Хранилище рассчитано по учебной ставке за GiB-месяц.',
  ]
}

export function newsFeedAssumptionsCopy(
  locale: Locale,
  report: NewsFeedReport,
  tuning: CapacityTuning,
) {
  if (locale === 'en') return report.assumptions
  const values = normalizeNewsFeedTuning(tuning)
  return [
    'Обычный пост в среднем доставляется 240 подписчикам.',
    `Пропускная способность воркеров: ${values.workers} ворк. × пакет ${values.batchSize} × 80 пакетов/с.`,
    'В кейсе скачка один пост направляется 50 миллионам подписчиков.',
    'Месячная стоимость очереди учитывает выбранную штатную нагрузку за 30 дней и один скачок знаменитости в день.',
    'Стоимость — прозрачная учебная оценка, а не предложение облачного провайдера.',
  ]
}

export function replayImportErrorCopy(
  locale: Locale,
  code: ReplayImportErrorCode,
  fallback: string,
) {
  if (locale === 'en') return fallback
  return {
    'too-large': 'Файл повтора превышает безопасный размер.',
    'invalid-json': 'Файл повтора содержит некорректный JSON.',
    'invalid-replay': 'JSON не содержит корректный повтор Faultline.',
    'unsupported-version': 'Версия этого повтора пока не поддерживается.',
  }[code]
}

export interface DefenseCopyInput {
  locale: Locale
  scenario: ScenarioId
  capacity: CapacityTuning
  monthlyCost: number
}

export function defenseCopy({
  locale,
  scenario,
  capacity,
  monthlyCost,
}: DefenseCopyInput) {
  const roundedCost = Math.round(monthlyCost)
  if (scenario === 'news-feed') {
    const tuning = normalizeNewsFeedTuning(capacity)
    const strategy = locale === 'ru'
      ? { write: 'fan-out при записи', read: 'fan-out при чтении', hybrid: 'гибридный fan-out' }[tuning.strategy]
      : `${tuning.strategy} fan-out`
    return locale === 'ru'
      ? {
          prompt: `Вы выбрали ${strategy}, ${tuning.workers} воркеров, пакеты по ${tuning.batchSize} событий и ${tuning.deduplication ? 'идемпотентную доставку' : 'доставку без дедупликации'}. Защитите компромисс при стоимости ${roundedCost} USD/мес.`,
          feedback: 'Объясните, когда аккаунт нужно переводить между fan-out при записи и чтении и какой порог задержки очереди запускает это решение.',
          eventTitle: applicationCopy.ru.designReady,
          eventDetail: 'Интервьюер проверяет свежесть, стоимость и семантику доставки',
        }
      : {
          prompt: `You chose ${strategy}, ${tuning.workers} workers, batches of ${tuning.batchSize}, and ${tuning.deduplication ? 'idempotent delivery' : 'no deduplication'}. Defend the ${roundedCost} USD/month trade-off.`,
          feedback: 'Explain when you would move an account between write and read fan-out, and which queue-lag alarm changes that decision.',
          eventTitle: applicationCopy.en.designReady,
          eventDetail: 'Interviewer is challenging freshness, cost, and delivery semantics',
        }
  }

  const lookup = locale === 'ru'
    ? capacity.indexedLookup ? 'индексированный поиск' : 'поиск с риском полного сканирования'
    : capacity.indexedLookup ? 'an indexed lookup' : 'a scan-prone lookup'
  const databaseProfile = locale === 'ru'
    ? {
        compact: 'компактный',
        balanced: 'сбалансированный',
        performance: 'производительный',
      }[capacity.databaseProfile]
    : capacity.databaseProfile
  return locale === 'ru'
    ? {
        prompt: `Вы выбрали ${lookup}, ${capacity.readReplicas} репл. чтения и ${databaseProfile} профиль БД. Защитите компромисс при стоимости ${roundedCost} USD/мес.`,
        feedback: 'Объясните, какое предположение вы проверите бенчмарком первым и при каком результате измените решение.',
        eventTitle: applicationCopy.ru.designReady,
        eventDetail: 'Интервьюер проверяет стоимость и предположения об узком месте',
      }
    : {
        prompt: `You chose ${lookup}, ${capacity.readReplicas} read replica${capacity.readReplicas === 1 ? '' : 's'}, and a ${databaseProfile} database. Defend the ${roundedCost} USD/month trade-off.`,
        feedback: 'Explain which assumption you would benchmark first and what would make you reverse this decision.',
        eventTitle: applicationCopy.en.designReady,
        eventDetail: 'Interviewer is challenging the cost and bottleneck assumptions',
      }
}

export function fallbackKeyMoment(
  locale: Locale,
  fault: FaultMode,
  atMs: number,
): ReplayKeyMomentV1 {
  if (fault !== 'none') {
    const title = fault === 'cache-outage'
      ? locale === 'ru' ? 'Попытка началась при недоступном Redis' : 'Attempt started with Redis unavailable'
      : fault === 'celebrity-spike'
        ? locale === 'ru' ? 'Попытка началась со скачка на 50 млн подписчиков' : 'Attempt started with a 50M-follower spike'
        : locale === 'ru'
          ? `Попытка началась со сбоя «${faultLabels.ru[fault].toLowerCase()}»`
          : `Attempt started with ${faultLabels.en[fault].toLowerCase()}`
    return {
      title,
      detail: locale === 'ru'
        ? 'Сбой уже был активен в исходном состоянии.'
        : 'This failure was already active in the initial state.',
      tone: 'critical',
      atMs: 0,
    }
  }
  return {
    title: locale === 'ru'
      ? 'Решение отправлено без включённого сбоя'
      : 'Design submitted without an injected failure',
    detail: locale === 'ru'
      ? 'Зафиксировано итоговое состояние архитектуры.'
      : 'The submission captured the final architecture state.',
    tone: 'neutral',
    atMs,
  }
}
