import type { ChallengeDefinition } from './types'

export const newsFeedChallenge: ChallengeDefinition = {
  id: 'news-feed',
  title: 'The Celebrity Problem',
  difficulty: 'Hard',
  summary:
    'Design a home timeline that stays fresh when one post suddenly needs to reach tens of millions of followers.',
  requirements: [
    'Publish a post durably before fan-out begins.',
    'Return a ranked home timeline with bounded staleness.',
    'Prevent retries from creating duplicate timeline entries.',
    'Choose which accounts fan out on write, read, or a hybrid path.',
  ],
  scale: [
    '2,000 posts and 30,000 timeline reads per second',
    '50 million followers for the largest account',
    'p99 timeline freshness below 5 seconds during a spike',
    'At-least-once queue delivery with idempotent consumers',
  ],
  cases: [
    {
      id: 'normal-feed',
      title: 'Normal feed traffic',
      description: '1× traffic, all components healthy',
      load: 1,
      fault: 'none',
    },
    {
      id: 'celebrity-spike',
      title: 'Celebrity spike',
      description: 'One post targets 50 million timelines',
      load: 10,
      fault: 'celebrity-spike',
    },
    {
      id: 'worker-outage',
      title: 'Worker outage',
      description: 'Half the fan-out fleet becomes unavailable',
      load: 3,
      fault: 'worker-outage',
    },
    {
      id: 'hidden-hot-key',
      title: 'Hidden cache case',
      description: 'Revealed after submission',
      load: 10,
      fault: 'hot-key',
      hidden: true,
    },
    {
      id: 'hidden-duplicate-delivery',
      title: 'Hidden delivery case',
      description: 'Revealed after submission',
      load: 3,
      fault: 'duplicate-delivery',
      hidden: true,
    },
  ],
  rubric: ['Reliability', 'Freshness', 'Resilience', 'Clarity'],
}
