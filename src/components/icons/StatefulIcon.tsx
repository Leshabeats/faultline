import type { ComponentHealth, ComponentKind } from '../../domain/system'

interface StatefulIconProps {
  kind: ComponentKind
  health: ComponentHealth
  size?: number
  decorative?: boolean
}

const SvgShell = ({
  children,
  kind,
  health,
  size = 52,
  decorative = false,
}: StatefulIconProps & { children: React.ReactNode }) => (
  <svg
    className={`stateful-icon icon-${kind} health-${health}`}
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden={decorative || undefined}
    role={decorative ? undefined : 'img'}
    aria-label={decorative ? undefined : `${kind} ${health}`}
  >
    {children}
  </svg>
)

const Client = (props: StatefulIconProps) => (
  <SvgShell {...props}>
    <circle className="icon-halo icon-halo-a" cx="32" cy="32" r="25" />
    <circle className="icon-halo icon-halo-b" cx="32" cy="32" r="19" />
    <circle className="icon-fill-soft" cx="24" cy="25" r="5" />
    <circle className="icon-fill-soft" cx="40" cy="25" r="5" />
    <path className="icon-stroke" d="M15 44c1.5-7 5-10 9-10s7.5 3 9 10" />
    <path className="icon-stroke" d="M31 44c1.5-7 5-10 9-10s7.5 3 9 10" />
  </SvgShell>
)

const Gateway = (props: StatefulIconProps) => (
  <SvgShell {...props}>
    <circle className="icon-fill-soft" cx="32" cy="32" r="21" />
    <circle className="icon-stroke" cx="32" cy="32" r="20" />
    <path className="icon-stroke" d="M12 32h40M32 12c7 6 10 13 10 20S39 46 32 52M32 12c-7 6-10 13-10 20s3 14 10 20" />
    <g className="icon-orbit">
      <path className="icon-stroke-strong" d="M13 42c12 9 31 8 41-3" />
      <circle className="icon-dot" cx="53" cy="39" r="3" />
    </g>
  </SvgShell>
)

const Service = (props: StatefulIconProps) => (
  <SvgShell {...props}>
    <path className="icon-fill-soft" d="m32 10 20 11v23L32 55 12 44V21z" />
    <path className="icon-stroke" d="m32 10 20 11v23L32 55 12 44V21zM12 21l20 12 20-12M32 33v22" />
    <circle className="icon-service-pulse" cx="24" cy="34" r="5" />
    <circle className="icon-service-core" cx="24" cy="34" r="2" />
  </SvgShell>
)

const Cache = (props: StatefulIconProps) => (
  <SvgShell {...props}>
    <circle className="icon-halo icon-halo-a" cx="32" cy="32" r="27" />
    <circle className="icon-halo icon-halo-b" cx="32" cy="32" r="21" />
    <g className="cache-layers">
      <path className="cache-layer cache-layer-top" d="m14 19 18-9 18 9-18 9z" />
      <path className="cache-layer cache-layer-middle" d="m14 29 18 9 18-9v9l-18 9-18-9z" />
      <path className="cache-layer cache-layer-bottom" d="m14 40 18 9 18-9v9l-18 9-18-9z" />
    </g>
    {(props.health === 'failed' || props.health === 'degraded') && (
      <>
        <path className="icon-fracture" d="m27 45 5-4-2 7 5 2-7 7" />
        <circle className="icon-failure-badge" cx="50" cy="48" r="8" />
        <path className="icon-failure-x" d="m47 45 6 6m0-6-6 6" />
      </>
    )}
  </SvgShell>
)

const Database = (props: StatefulIconProps) => {
  const level = props.health === 'hot' ? 47 : props.health === 'degraded' ? 38 : 27
  return (
    <SvgShell {...props}>
      <defs>
        <clipPath id={`db-fill-${props.health}`}>
          <path d="M15 17c0-5 7.6-9 17-9s17 4 17 9v31c0 5-7.6 9-17 9s-17-4-17-9z" />
        </clipPath>
      </defs>
      <rect
        className="icon-db-fill"
        x="15"
        y={64 - level}
        width="34"
        height={level}
        clipPath={`url(#db-fill-${props.health})`}
      />
      <ellipse className="icon-stroke" cx="32" cy="17" rx="17" ry="9" />
      <path className="icon-stroke" d="M15 17v31c0 5 7.6 9 17 9s17-4 17-9V17M15 34c0 5 7.6 9 17 9s17-4 17-9" />
      <g className="icon-db-orbit">
        <path className="icon-orbit-path" d="M43 7c8 2 13 8 13 15" />
        <circle className="icon-dot" cx="56" cy="22" r="3" />
      </g>
    </SvgShell>
  )
}

const Queue = (props: StatefulIconProps) => (
  <SvgShell {...props}>
    {[18, 31, 44].map((y, index) => (
      <g key={y} className={`queue-track queue-track-${index + 1}`}>
        <rect className="queue-rail" x="10" y={y} width="39" height="8" rx="4" />
        <rect className="queue-message" x="15" y={y + 2} width="12" height="4" rx="2" />
        <path className="icon-stroke" d={`M51 ${y + 4}h6m-3-3 3 3-3 3`} />
      </g>
    ))}
    {props.health === 'backlog' && (
      <circle className="icon-failure-badge" cx="52" cy="13" r="7" />
    )}
  </SvgShell>
)

const Region = (props: StatefulIconProps) => (
  <SvgShell {...props}>
    <path className="icon-fill-soft" d="M16 55V10m0 3c12-6 20 7 32 0v25c-12 7-20-6-32 0" />
    <path className="icon-stroke" d="M16 55V10m0 3c12-6 20 7 32 0v25c-12 7-20-6-32 0" />
  </SvgShell>
)

export function StatefulIcon(props: StatefulIconProps) {
  switch (props.kind) {
    case 'client':
      return <Client {...props} />
    case 'gateway':
      return <Gateway {...props} />
    case 'service':
      return <Service {...props} />
    case 'cache':
      return <Cache {...props} />
    case 'database':
      return <Database {...props} />
    case 'queue':
      return <Queue {...props} />
    case 'region':
      return <Region {...props} />
  }
}
