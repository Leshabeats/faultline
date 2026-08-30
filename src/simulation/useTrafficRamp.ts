import { useEffect, useRef, useState } from 'react'

const RAMP_DURATION_MS = 2_800

const easeInOutCubic = (value: number) => value < 0.5
  ? 4 * value * value * value
  : 1 - ((-2 * value + 2) ** 3) / 2

export function useTrafficRamp(target: number, running: boolean, resetKey = 'default') {
  const [current, setCurrent] = useState(target)
  const [appliedResetKey, setAppliedResetKey] = useState(resetKey)
  const currentRef = useRef(current)
  const resetRequested = appliedResetKey !== resetKey
  const displayed = resetRequested ? target : current
  currentRef.current = displayed

  useEffect(() => {
    if (resetRequested) {
      setAppliedResetKey(resetKey)
      setCurrent(target)
      return
    }
    if (!running) return
    const from = currentRef.current
    if (Math.abs(from - target) < 0.01) {
      setCurrent(target)
      return
    }

    const startedAt = performance.now()
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / RAMP_DURATION_MS)
      const next = from + (target - from) * easeInOutCubic(progress)
      currentRef.current = next
      setCurrent(next)
      if (progress < 1) frame = window.requestAnimationFrame(step)
    }
    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [appliedResetKey, resetKey, resetRequested, running, target])

  return displayed
}
