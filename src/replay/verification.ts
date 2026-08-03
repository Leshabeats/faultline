import { urlShortenerChallenge } from '../challenges/urlShortener'
import { judgeUrlShortener } from '../judge'
import { analyzeTopology } from '../simulation/topology'
import { presentReplayFrame } from './presentation'
import { playReplayAt } from './reducer'
import type { ReplayAttemptV1 } from './types'

/**
 * Imported result fields are untrusted JSON. Re-run the current deterministic
 * judge against the final replay state before showing a score as verified.
 */
export function verifyImportedUrlShortenerAttempt(
  attempt: ReplayAttemptV1,
): ReplayAttemptV1 {
  if (attempt.challengeId !== urlShortenerChallenge.id) {
    return { ...attempt, summary: undefined }
  }
  const hasSubmission = attempt.events.some((event) => event.type === 'design.submitted')
  if (!hasSubmission) return { ...attempt, summary: undefined }

  const finalFrame = playReplayAt(attempt, attempt.durationMs)
  const presented = presentReplayFrame(finalFrame, Math.floor(attempt.durationMs / 900), true)
  const topology = analyzeTopology(presented.nodes, presented.edges)
  const report = judgeUrlShortener({
    componentCounts: topology.componentCounts,
    criticalPathConnected: topology.criticalPathConnected,
    nodeCount: presented.nodes.length,
    edgeCount: presented.edges.length,
  })
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
