import { faultLabels } from '../i18n'
import type {
  InterviewProvider,
  InterviewRequest,
  InterviewResponse,
} from './types'

const containsAny = (value: string, terms: string[]) =>
  terms.some((term) => value.toLowerCase().includes(term))

const questionFor = (request: InterviewRequest) => {
  const { scenario, fault, loadMultiplier, metrics, locale } = request.context
  const ru = locale === 'ru'

  if (scenario === 'news-feed') {
    if (fault === 'celebrity-spike') {
      return ru
        ? 'Один пост нужно доставить в 50 миллионов лент. Для каких аккаунтов выберете fan-out при записи, при чтении или гибрид — и почему?'
        : 'One post targets 50 million timelines. Which accounts fan out on write, on read, or through a hybrid path—and why?'
    }
    if (fault === 'worker-outage') {
      return ru
        ? `Половина fan-out воркеров недоступна, а p99 свежести — ${Math.round(metrics.p99)} мс. Где должна применяться обратная нагрузка?`
        : `Half the fan-out fleet is down and freshness p99 is ${Math.round(metrics.p99)} ms. Where does backpressure live?`
    }
    if (fault === 'hot-key') {
      return ru
        ? 'Ключ ленты знаменитости стал горячим. Как его шардировать, реплицировать или обойти, не потеряв порядок?'
        : 'A celebrity timeline key is hot. How do you shard, replicate, or bypass it without losing ordering?'
    }
    if (fault === 'duplicate-delivery') {
      return ru
        ? 'Очередь повторно доставляет пакет. Где хранится ключ идемпотентности и каков срок его жизни?'
        : 'The queue redelivers a batch. Where is the idempotency key stored, and what is its retention window?'
    }
    return ru
      ? 'Проведите меня по пути от публикации до домашней ленты, включая контракт консистентности и свежести.'
      : 'Walk me through publish-to-home-timeline, including the consistency and freshness contract.'
  }

  if (fault === 'cache-outage') {
    return ru
      ? 'Redis недоступен. Как защитить базу данных от лавины одновременных cache miss?'
      : 'Redis is unavailable. How would you protect the database from a cache stampede?'
  }
  if (fault === 'slow-database') {
    return ru
      ? `Задержка БД подняла p99 до ${Math.round(metrics.p99)} мс. Где введёте обратную нагрузку или сброс трафика?`
      : `Database latency is pushing p99 to ${Math.round(metrics.p99)} ms. Where would you add backpressure or shed load?`
  }
  if (fault === 'network-partition') {
    return ru
      ? 'Edge не видит часть сервисного слоя. Какие операции должны завершаться с ошибкой, повторяться или деградировать?'
      : 'The edge cannot reach part of the service tier. Which operations should fail closed, retry, or degrade?'
  }
  if (fault === 'retry-storm') {
    return ru
      ? 'Повторы усиливают трафик. Как остановить положительную обратную связь?'
      : 'Retries are amplifying traffic. How would you stop the positive feedback loop?'
  }
  if (loadMultiplier === 10) {
    return ru
      ? 'Трафик достиг 10×. Какой компонент первым упрётся в предел ёмкости и почему?'
      : 'Traffic is at 10×. Which component reaches its capacity boundary first, and why?'
  }
  return ru
    ? 'Проведите меня по пути чтения и назовите первое численное предположение о ёмкости, которое проверите.'
    : 'Walk me through the read path and name the first explicit capacity assumption you would validate.'
}

export class LocalInterviewProvider implements InterviewProvider {
  id = 'local'
  label = 'Local preview'

  async respond(request: InterviewRequest): Promise<InterviewResponse> {
    const prompt = questionFor(request)
    const { metrics, fault, locale } = request.context
    const ru = locale === 'ru'

    if (request.action === 'hint') {
      const message = request.context.scenario === 'news-feed'
        ? ru
          ? 'Отделите надёжную публикацию от материализации ленты. Сравните fan-out работу на пост, усиление чтения, задержку очереди и идемпотентность.'
          : 'Separate durable publish from timeline materialization. Compare fan-out work per post, read amplification, queue lag, and idempotency.'
        : fault === 'cache-outage'
          ? ru
            ? 'Разложите защиту по слоям: объединение запросов, устаревшее чтение, ограничение параллелизма и повторы с jitter. Укажите владельца каждого механизма.'
            : 'Think in layers: request coalescing, stale reads, bounded concurrency, and jittered retries. State which layer owns each protection.'
          : fault === 'retry-storm'
            ? ru
              ? 'Найдите цикл: таймаут → повтор → рост нагрузки → новый таймаут. Разорвите его бюджетом повторов, jitter и сбросом нагрузки.'
              : 'Look for a feedback loop: timeout → retry → more load → longer timeout. Break it with budgets, jitter, and load shedding.'
            : ru
              ? 'Начните с самой горячей метрики, найдите её очередь и решите, где давление должно поглощаться или отклоняться.'
              : 'Start from the hottest visible metric, identify its queue, then decide where pressure should be absorbed or rejected.'
      return { message, prompt, focus: ru ? 'подсказка' : 'hint' }
    }

    if (request.action === 'review') {
      const risks = [
        metrics.dbCpu >= 90 ? ru ? `CPU БД — ${Math.round(metrics.dbCpu)}%` : `database CPU is ${Math.round(metrics.dbCpu)}%` : null,
        metrics.errorRate >= 5 ? ru ? `ошибки — ${metrics.errorRate.toFixed(1)}%` : `errors are ${metrics.errorRate.toFixed(1)}%` : null,
        metrics.p99 >= 300 ? ru ? `p99 — ${Math.round(metrics.p99)} мс` : `p99 is ${Math.round(metrics.p99)} ms` : null,
      ].filter(Boolean)

      return {
        message: risks.length
          ? ru
            ? `Система вышла за безопасные границы: ${risks.join(', ')}. Добавьте явную границу перегрузки и повторите тот же сбой.`
            : `The design is currently operating beyond a safe envelope: ${risks.join(', ')}. Add one explicit overload boundary, then test the same fault again.`
          : ru
            ? 'Система работает в безопасных границах. Теперь укажите ёмкость одной реплики и проверьте потерю одного узла.'
            : 'The current envelope is healthy. The next useful step is to state capacity per replica and test a single-node loss.',
        prompt,
        focus: ru ? 'разбор' : 'review',
      }
    }

    if (request.action === 'answer' && request.answer?.trim()) {
      const answer = request.answer.trim()
      const hasProtection = containsAny(answer, [
        'coalesc',
        'singleflight',
        'lock',
        'stale',
        'rate limit',
        'backpressure',
        'circuit',
        'jitter',
        'shed',
        'fan-out',
        'fanout',
        'idempoten',
        'dedup',
        'hybrid',
        'объедин',
        'блокиров',
        'устарев',
        'огранич',
        'обратн',
        'джиттер',
        'сброс',
        'идемпот',
        'дедупл',
        'гибрид',
      ])
      const hasTradeoff = containsAny(answer, [
        'tradeoff',
        'stale',
        'consisten',
        'availability',
        'latency',
        'cost',
        'limit',
        'компромисс',
        'устарев',
        'консистент',
        'доступност',
        'задержк',
        'стоимост',
        'огранич',
      ])

      const message = hasProtection
        ? ru
          ? `${hasTradeoff ? 'Хорошо: вы назвали механизм и его компромисс.' : 'Механизм понятен. Теперь явно назовите компромисс.'} Задайте числом лимит параллелизма или бюджет повторов и объясните, что увидит пользователь после его исчерпания.`
          : `${hasTradeoff ? 'Good: you named both a mechanism and its trade-off.' : 'Good mechanism. Now make the trade-off explicit.'} Put a number on the concurrency or retry budget, then tell me what the user sees when that budget is exhausted.`
        : ru
          ? 'Вы описали цель, но ещё не границу защиты. Назовите точный механизм, который не пропустит одновременные cache miss в базу данных.'
          : 'You described the goal, but not yet the protection boundary. Name the exact mechanism that prevents concurrent misses from reaching the database.'

      return {
        message,
        prompt,
        focus: hasProtection
          ? ru ? 'компромисс' : 'trade-off'
          : ru ? 'механизм' : 'mechanism',
      }
    }

    return {
      message: ru
        ? `Сценарий продолжен: ${faultLabels.ru[fault]}. Изучите текущее состояние перед изменением схемы.`
        : `Scenario advanced: ${faultLabels.en[fault]}. Read the live state before changing the diagram.`,
      prompt,
      focus: ru ? 'следующий вопрос' : 'next-question',
    }
  }
}
