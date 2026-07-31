export function FaultlineMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Faultline">
      <svg className="brand-mark" viewBox="0 0 24 42" aria-hidden="true">
        <path d="M12 1 7 14l6 6-4 9 5 12" />
        <path d="m7 14-5 4m11 2 7-3m-11 12-6 3" />
      </svg>
      {!compact && <span>Faultline</span>}
    </div>
  )
}
