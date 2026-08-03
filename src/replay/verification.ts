import { urlShortenerChallenge } from '../challenges/urlShortener'
import { judgeNewsFeed, judgeUrlShortener } from '../judge'
import { computeSimulation } from '../simulation/engine'
import { analyzeTopology } from '../simulation/topology'
import { presentReplayFrame } from './presentation'
import { playReplayAt } from './reducer'
import type { ReplayAttemptV1 } from './types'

/**
 * Imported result fields are untrusted JSON. Re-run the current deterministic
 * judge against the final replay state before showing a score as verified.
 */
export function verifyImportedAttempt(
  attempt: ReplayAttemptV1,
): ReplayAttemptV1 {
  if (attempt.challengeId !== urlShortenerChallenge.id && attempt.challengeId !== 'news-feed') {
    return { ...attempt, summary: undefined }
  }
  const hasSubmission = attempt.events.some((event) => event.type === 'design.submitted')
  if (!hasSubmission) return { ...attempt, summary: undefined }

  const finalFrame = playReplayAt(attempt, attempt.durationMs)
  const scenario = attempt.challengeId === 'news-feed' ? 'news-feed' : 'url-shortener'
  const presented = presentReplayFrame(finalFrame, Math.floor(attempt.durationMs / 900), true, scenario)
  const topology = analyzeTopology(presented.nodes, presented.edges)
  const judge = scenario === 'news-feed' ? judgeNewsFeed : judgeUrlShortener
  const report = judge(
    {
      componentCounts: topology.componentCounts,
      replicaCounts: topology.replicaCounts,
      criticalPathConnected: topology.criticalPathConnected,
      nodeCount: presented.nodes.length,
      edgeCount: presented.edges.length,
    },
    {
      simulate: (input) => computeSimulation({
        ...input,
        capacity: finalFrame.capacity,
        scenario,
      }),
    },
  )
  const submission = {
    judgeVersion: report.judgeVersion,
    score: report.score,
    maxScore: report.maxScore,
    passed: report.passed,
    passedCases: report.passedCases,
    totalCases: report.totalCases,
  }
  const events = attempt.events.map((event) => event.type === 'design.submitted' ? {
    ...event,
    payload: { submission },
    timeline: {
      title: `Design submitted · ${report.score}/100`,
      detail: `${report.passedCases} of ${report.totalCases} cases passed`,
      tone: report.passed ? 'healthy' as const : report.score >= 60 ? 'warning' as const : 'critical' as const,
    },
  } : event)

  return {
    ...attempt,
    events,
    summary: {
      score: report.score,
      maxScore: report.maxScore,
      passed: report.passed,
    },
  }
}

/** Backwards-compatible export used by v0.3.1 callers and tests. */
export const verifyImportedUrlShortenerAttempt = verifyImportedAttempt
