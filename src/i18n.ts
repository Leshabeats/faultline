import type { ComponentKind, FaultMode, Locale, ScenarioId } from './domain/system'
import type { ChallengeDefinition } from './challenges/types'

export const UI_COPY = {
  en: {
    load: 'Load',
    fault: 'Fault',
    add: 'Add',
    pause: 'Pause',
    run: 'Run',
    done: 'Done',
    history: 'Attempt history',
    share: 'Copy scenario snapshot',
    challenges: 'Challenge pack',
    currentBrief: 'View current brief',
    ramping: 'Ramping traffic',
    live: 'live',
    inspect: 'Inspect',
    close: 'Close',
    overview: 'Overview',
    contract: 'Contract',
    scaling: 'Scaling',
    role: 'Role in the path',
    responsibilities: 'Responsibilities',
    dataContract: 'Contract & data',
    topology: 'Topology',
    replicas: 'Replicas',
    shards: 'Shards',
    replicaHelp: 'Copies improve read capacity and availability.',
    shardHelp: 'Partitions split the keyspace and multiply storage capacity.',
    topologyHint: 'These controls change the simulation, capacity, and cost.',
    unavailableBecause: 'Unavailable because Cache outage is active.',
    clearFault: 'Restore Redis',
    failureDirector: 'Failure Director',
    failReplica: 'Take one replica offline',
    failComponent: 'Take component offline',
    restoreComponent: 'Restore component',
    partitionConnection: 'Partition connection',
    restoreConnection: 'Restore connection',
    connection: 'Connection',
    connectionHealthy: 'Traffic is flowing normally.',
    connectionPartitioned: 'Traffic stops at this boundary.',
    causalPath: 'Causal path',
    blastRadius: 'Blast radius',
    affectedComponents: {
      one: 'affected component',
      few: 'affected components',
      other: 'affected components',
    },
    oneReplicaOffline: 'One replica offline',
    instanceOffline: 'Instance offline',
    noFault: 'No fault',
    selected: 'Selected component',
    requests: 'requests/s',
  },
  ru: {
    load: 'Нагрузка',
    fault: 'Сбой',
    add: 'Добавить',
    pause: 'Пауза',
    run: 'Запустить',
    done: 'Готово',
    history: 'История попыток',
    share: 'Скопировать сценарий',
    challenges: 'Задачи',
    currentBrief: 'Открыть условие задачи',
    ramping: 'Разгон трафика',
    live: 'сейчас',
    inspect: 'Открыть',
    close: 'Закрыть',
    overview: 'Обзор',
    contract: 'Контракт',
    scaling: 'Масштабирование',
    role: 'Роль в запросе',
    responsibilities: 'Ответственность',
    dataContract: 'Контракт и данные',
    topology: 'Топология',
    replicas: 'Реплики',
    shards: 'Шарды',
    replicaHelp: 'Копии повышают доступность и ёмкость чтения.',
    shardHelp: 'Партиции делят keyspace и увеличивают ёмкость хранения.',
    topologyHint: 'Эти настройки меняют симуляцию, ёмкость и стоимость.',
    unavailableBecause: 'Redis недоступен, потому что включён сбой кеша.',
    clearFault: 'Восстановить Redis',
    failureDirector: 'Режиссёр отказов',
    failReplica: 'Отключить одну реплику',
    failComponent: 'Отключить компонент',
    restoreComponent: 'Восстановить компонент',
    partitionConnection: 'Разорвать соединение',
    restoreConnection: 'Восстановить соединение',
    connection: 'Соединение',
    connectionHealthy: 'Трафик проходит штатно.',
    connectionPartitioned: 'Трафик останавливается на этой границе.',
    causalPath: 'Причинная цепочка',
    blastRadius: 'Радиус поражения',
    affectedComponents: {
      one: 'компонент затронут',
      few: 'компонента затронуто',
      other: 'компонентов затронуто',
    },
    oneReplicaOffline: 'Одна реплика отключена',
    instanceOffline: 'Экземпляр отключён',
    noFault: 'Без сбоя',
    selected: 'Выбранный компонент',
    requests: 'запросов/с',
  },
} as const

export function formatAffectedComponents(locale: Locale, count: number) {
  const category = new Intl.PluralRules(locale).select(count)
  const form = category === 'one' || category === 'few' ? category : 'other'
  return `${count} ${UI_COPY[locale].affectedComponents[form]}`
}

export const componentLabels: Record<Locale, Record<ComponentKind, string>> = {
  en: {
    client: 'Clients', gateway: 'Gateway', service: 'Service', cache: 'Cache',
    queue: 'Queue', database: 'Database', region: 'Region',
  },
  ru: {
    client: 'Клиенты', gateway: 'Шлюз', service: 'Сервис', cache: 'Кеш',
    queue: 'Очередь', database: 'База данных', region: 'Регион',
  },
}

export const faultLabels: Record<Locale, Record<FaultMode, string>> = {
  en: {
    none: 'No fault', 'component-outage': 'Component outage', 'cache-outage': 'Cache outage', 'slow-database': 'Slow database',
    'network-partition': 'Network partition', 'retry-storm': 'Retry storm',
    'celebrity-spike': 'Celebrity spike', 'worker-outage': 'Worker outage',
    'hot-key': 'Hot key', 'duplicate-delivery': 'Duplicate delivery',
  },
  ru: {
    none: 'Без сбоя', 'component-outage': 'Отказ компонента', 'cache-outage': 'Отказ кеша', 'slow-database': 'Медленная БД',
    'network-partition': 'Разрыв сети', 'retry-storm': 'Шторм повторов',
    'celebrity-spike': 'Скачок знаменитости', 'worker-outage': 'Отказ воркеров',
    'hot-key': 'Горячий ключ', 'duplicate-delivery': 'Дубли доставки',
  },
}

export const scenarioLabels: Record<Locale, Record<ScenarioId, { title: string; difficulty: string }>> = {
  en: {
    'url-shortener': { title: 'URL Shortener', difficulty: 'Medium' },
    'news-feed': { title: 'News Feed', difficulty: 'Hard' },
  },
  ru: {
    'url-shortener': { title: 'Сервис коротких ссылок', difficulty: 'Средняя' },
    'news-feed': { title: 'Лента новостей', difficulty: 'Сложная' },
  },
}

const seededNodeLabels: Record<ScenarioId, Record<string, { en: string; ru: string }>> = {
  'url-shortener': {
    clients: { en: 'Clients', ru: 'Клиенты' },
    edge: { en: 'Edge', ru: 'Edge-шлюз' },
    api: { en: 'Short Link API', ru: 'Short Link API' },
    cache: { en: 'Redis', ru: 'Redis' },
    database: { en: 'Primary DB', ru: 'Основная БД' },
    queue: { en: 'Queue', ru: 'Очередь' },
  },
  'news-feed': {
    'feed-users': { en: 'Users', ru: 'Пользователи' },
    'feed-api': { en: 'Feed API', ru: 'Feed API' },
    'post-store': { en: 'Post Store', ru: 'Хранилище постов' },
    'fanout-queue': { en: 'Fan-out Queue', ru: 'Fan-out очередь' },
    'fanout-workers': { en: 'Workers', ru: 'Воркеры' },
    'timeline-cache': { en: 'Timeline Cache', ru: 'Кеш лент' },
  },
}

export const localizeNodeLabel = (
  locale: Locale,
  scenario: ScenarioId,
  id: string,
  fallback: string,
) => seededNodeLabels[scenario][id]?.[locale] ?? fallback

export function localizeNodeDetail(locale: Locale, detail: string) {
  if (locale === 'en') return detail
  return detail
    .replace('Healthy', 'Исправен')
    .replace('Warm', 'Прогрет')
    .replace('Live', 'Работает')
    .replace('Unavailable', 'Недоступен')
    .replace('Saturated', 'Насыщен')
    .replace('Not on active path', 'Вне активного пути')
    .replace('Route degraded', 'Маршрут деградировал')
    .replace('No route', 'Нет маршрута')
    .replace('Partitioned', 'Сеть разделена')
    .replace('Ready', 'Готов')
    .replace('Connected', 'Подключён')
    .replace('Draining', 'Опустошается')
    .replace('Half fleet down', 'Половина флота недоступна')
    .replace('One replica offline', 'Одна реплика отключена')
    .replace('Instance offline', 'Экземпляр отключён')
    .replace('Blast radius', 'Радиус поражения')
    .replace('Celebrity hot key', 'Горячий ключ знаменитости')
    .replace(' req/s', ' запр/с')
    .replace(' reads/s', ' чтений/с')
    .replace(' deliveries/s', ' доставок/с')
    .replace(' queued', ' в очереди')
    .replace(' backlog', ' отставание')
    .replace(' miss', ' промахов')
    .replace(' busy', ' занято')
    .replace(' capacity', ' ёмкости')
}

export function initialLocale(): Locale {
  try {
    const stored = window.localStorage.getItem('faultline.locale')
    if (stored === 'ru' || stored === 'en') return stored
    return window.navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
  } catch {
    return 'en'
  }
}

export function localizeChallengeDefinition(
  challenge: ChallengeDefinition,
  locale: Locale,
): ChallengeDefinition {
  if (locale === 'en') return challenge
  if (challenge.id === 'news-feed') return {
    ...challenge,
    title: 'Проблема знаменитости',
    difficulty: 'Hard',
    summary: 'Спроектируйте домашнюю ленту, которая остаётся свежей, когда один пост нужно доставить десяткам миллионов подписчиков.',
    requirements: [
      'Надёжно сохранить пост до начала fan-out.',
      'Возвращать ранжированную ленту с ограниченной задержкой.',
      'Не допускать дублей при повторной доставке.',
      'Выбрать fan-out on write, on read или гибрид для разных аккаунтов.',
    ],
    scale: [
      '2 000 постов и 30 000 чтений ленты в секунду',
      '50 миллионов подписчиков у крупнейшего аккаунта',
      'p99 свежести ниже 5 секунд во время скачка',
      'At-least-once очередь с идемпотентными consumer-ами',
    ],
    cases: [
      { ...challenge.cases[0], title: 'Обычный трафик', description: '1×, все компоненты исправны' },
      { ...challenge.cases[1], title: 'Скачок знаменитости', description: 'Один пост направлен в 50 миллионов лент' },
      { ...challenge.cases[2], title: 'Отказ воркеров', description: 'Половина fan-out флота недоступна' },
      { ...challenge.cases[3], title: 'Скрытый кейс кеша', description: 'Откроется после отправки решения' },
      { ...challenge.cases[4], title: 'Скрытый кейс доставки', description: 'Откроется после отправки решения' },
    ],
    rubric: ['Надёжность', 'Свежесть', 'Устойчивость', 'Ясность'],
  }
  return {
    ...challenge,
    title: 'Сервис коротких ссылок',
    difficulty: 'Medium',
    summary: 'Спроектируйте глобально доступный сервис, который создаёт короткие ссылки и выполняет редиректы с предсказуемой задержкой при всплесках трафика.',
    requirements: [
      'Создавать короткий URL для валидного длинного адреса.',
      'Перенаправлять короткий код на адрес назначения.',
      'Поддерживать expiry без повторного использования идентификаторов.',
      'Определить доступность и консистентность при частичном отказе.',
    ],
    scale: [
      '100 созданий ссылок в секунду',
      '100 000 редиректов в секунду',
      'p99 редиректа ниже 120 мс в штатном режиме',
      'Пять лет хранения ссылок',
    ],
    cases: [
      { ...challenge.cases[0], title: 'Обычное чтение', description: '1×, все компоненты исправны' },
      { ...challenge.cases[1], title: 'Пусковой всплеск 10×', description: 'Трафик чтения внезапно возрастает' },
      { ...challenge.cases[2], title: 'Отказ кеша', description: 'Одна реплика кеша недоступна' },
      { ...challenge.cases[3], title: 'Скрытый кейс надёжности', description: 'Откроется после отправки решения' },
      { ...challenge.cases[4], title: 'Скрытый кейс перегрузки', description: 'Откроется после отправки решения' },
    ],
    rubric: ['Масштабирование', 'Надёжность', 'Консистентность', 'Стоимость', 'Ясность'],
  }
}
