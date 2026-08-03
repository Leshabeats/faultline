import { FAULT_LABELS } from '../domain/system'
import type {
  InterviewProvider,
  InterviewRequest,
  InterviewResponse,
} from './types'

const containsAny = (value: string, terms: string[]) =>
  terms.some((term) => value.toLowerCase().includes(term))

const questionFor = (request: InterviewRequest) => {
  const { scenario, fault, loadMultiplier, metrics } = request.context

  if (scenario === 'news-feed') {
    if (fault === 'celebrity-spike') {
      return 'One post targets 50 million timelines. Which accounts fan out on write, on read, or through a hybrid path—and why?'
    }
    if (fault === 'worker-outage') {
      return `Half the fan-out fleet is down and freshness p99 is ${Math.round(metrics.p99)} ms. Where does backpressure live?`
    }
    if (fault === 'hot-key') {
      return 'A celebrity timeline key is hot. How do you shard, replicate, or bypass it without losing ordering?'
    }
    if (fault === 'duplicate-delivery') {
      return 'The queue redelivers a batch. Where is the idempotency key stored, and what is its retention window?'
    }
    return 'Walk me through publish-to-home-timeline, including the consistency and freshness contract.'
  }

  if (fault === 'cache-outage') {
    return 'Redis is unavailable. How would you protect the database from a cache stampede?'
  }
  if (fault === 'slow-database') {
    return `Database latency is pushing p99 to ${Math.round(metrics.p99)} ms. Where would you add backpressure or shed load?`
  }
  if (fault === 'network-partition') {
    return 'The edge cannot reach part of the service tier. Which operations should fail closed, retry, or degrade?'
  }
  if (fault === 'retry-storm') {
    return 'Retries are amplifying traffic. How would you stop the positive feedback loop?'
  }
  if (loadMultiplier === 10) {
    return 'Traffic is at 10×. Which component reaches its capacity boundary first, and why?'
  }
  return 'Walk me through the read path and name the first explicit capacity assumption you would validate.'
}

export class LocalInterviewProvider implements InterviewProvider {
  id = 'local'
  label = 'Local preview'

  async respond(request: InterviewRequest): Promise<InterviewResponse> {
    const prompt = questionFor(request)
    const { metrics, fault } = request.context

    if (request.action === 'hint') {
      const message =
        request.context.scenario === 'news-feed'
          ? 'Separate durable publish from timeline materialization. Compare fan-out work per post, read amplification, queue lag, and idempotency.'
          : fault === 'cache-outage'
          ? 'Think in layers: request coalescing, stale reads, bounded concurrency, and jittered retries. State which layer owns each protection.'
          : fault === 'retry-storm'
            ? 'Look for a feedback loop: timeout → retry → more load → longer timeout. Break it with budgets, jitter, and load shedding.'
            : 'Start from the hottest visible metric, identify its queue, then decide where pressure should be absorbed or rejected.'
      return { message, prompt, focus: 'hint' }
    }

    if (request.action === 'review') {
      const risks = [
        metrics.dbCpu >= 90 ? `database CPU is ${Math.round(metrics.dbCpu)}%` : null,
        metrics.errorRate >= 5 ? `errors are ${metrics.errorRate.toFixed(1)}%` : null,
        metrics.p99 >= 300 ? `p99 is ${Math.round(metrics.p99)} ms` : null,
      ].filter(Boolean)

      return {
        message: risks.length
          ? `The design is currently operating beyond a safe envelope: ${risks.join(', ')}. Add one explicit overload boundary, then test the same fault again.`
          : 'The current envelope is healthy. The next useful step is to state capacity per replica and test a single-node loss.',
        prompt,
        focus: 'review',
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
      ])
      const hasTradeoff = containsAny(answer, [
        'tradeoff',
        'stale',
        'consisten',
        'availability',
        'latency',
        'cost',
        'limit',
      ])

      const message = hasProtection
        ? `${hasTradeoff ? 'Good: you named both a mechanism and its trade-off.' : 'Good mechanism. Now make the trade-off explicit.'} Put a number on the concurrency or retry budget, then tell me what the user sees when that budget is exhausted.`
        : 'You described the goal, but not yet the protection boundary. Name the exact mechanism that prevents concurrent misses from reaching the database.'

      return { message, prompt, focus: hasProtection ? 'trade-off' : 'mechanism' }
    }

    return {
      message: `Scenario advanced: ${FAULT_LABELS[fault]}. Read the live state before changing the diagram.`,
      prompt,
      focus: 'next-question',
    }
  }
}
