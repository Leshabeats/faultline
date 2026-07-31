import type { ChallengeDefinition } from './types'

export const urlShortenerChallenge: ChallengeDefinition = {
  id: 'url-shortener',
  title: 'Design a URL Shortener',
  difficulty: 'Medium',
  summary:
    'Design a globally available service that creates short links and redirects readers with predictable latency under burst traffic.',
  requirements: [
    'Create a short URL for a valid long URL.',
    'Redirect a short code to its destination.',
    'Support optional expiry without reusing identifiers.',
    'Define the availability and consistency behavior during partial failure.',
  ],
  scale: [
    '100 creates per second',
    '100,000 redirects per second',
    'p99 redirect latency below 120 ms in the normal envelope',
    'Five years of link retention',
  ],
  cases: [
    {
      id: 'normal-read-path',
      title: 'Normal read path',
      description: '1× traffic, all components healthy',
      load: 1,
      fault: 'none',
    },
    {
      id: 'launch-burst',
      title: '10× launch burst',
      description: 'Read traffic spikes without warning',
      load: 10,
      fault: 'none',
    },
    {
      id: 'cache-outage',
      title: 'Cache outage',
      description: 'One cache replica becomes unavailable',
      load: 10,
      fault: 'cache-outage',
    },
    {
      id: 'hidden-partition',
      title: 'Hidden reliability case',
      description: 'Revealed after submission',
      load: 3,
      fault: 'network-partition',
      hidden: true,
    },
    {
      id: 'hidden-feedback-loop',
      title: 'Hidden overload case',
      description: 'Revealed after submission',
      load: 10,
      fault: 'retry-storm',
      hidden: true,
    },
  ],
  rubric: ['Scalability', 'Reliability', 'Consistency', 'Cost', 'Clarity'],
}
