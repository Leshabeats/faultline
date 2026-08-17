export type AppRoute =
  | { kind: 'workspace' }
  | { kind: 'public-replay'; id: string }

const PUBLIC_REPLAY_ID = /^[A-Za-z0-9_-]{16,64}$/

export function isPublicReplayId(value: string) {
  return PUBLIC_REPLAY_ID.test(value)
}

export function publicReplayHash(id: string) {
  return `#/r/${id}`
}

export function publicReplayPath(id: string) {
  return `/r/${id}`
}

export function readAppRoute(
  location: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location,
): AppRoute {
  const hash = location.hash.replace(/^#/, '')
  const hashMatch = hash.match(/^\/?r\/([A-Za-z0-9_-]+)/)
  if (hashMatch && isPublicReplayId(hashMatch[1])) {
    return { kind: 'public-replay', id: hashMatch[1] }
  }

  const pathMatch = location.pathname.match(/(?:^|\/)r\/([A-Za-z0-9_-]+)\/?$/)
  if (pathMatch && isPublicReplayId(pathMatch[1])) {
    return { kind: 'public-replay', id: pathMatch[1] }
  }

  const search = new URLSearchParams(location.search)
  const queryId = search.get('replay') ?? search.get('r')
  if (queryId && isPublicReplayId(queryId)) {
    return { kind: 'public-replay', id: queryId }
  }

  return { kind: 'workspace' }
}

export function publicReplayHref(id: string, origin?: string) {
  const appOrigin = (origin ?? window.location.origin).replace(/\/$/, '')
  const base = import.meta.env.BASE_URL === './' || import.meta.env.BASE_URL === ''
    ? `${appOrigin}${window.location.pathname.replace(/\/index\.html$/, '/')}`
    : `${appOrigin}${import.meta.env.BASE_URL}`
  const normalized = base.endsWith('/') ? base : `${base}/`
  return `${normalized}${publicReplayHash(id)}`
}

export function workspaceHref(
  location: Pick<Location, 'origin' | 'pathname'> = window.location,
) {
  const appOrigin = location.origin.replace(/\/$/, '')
  const base = import.meta.env.BASE_URL === './' || import.meta.env.BASE_URL === ''
    ? `${appOrigin}${location.pathname.replace(/\/r\/[A-Za-z0-9_-]+\/?$/, '/').replace(/\/index\.html$/, '/')}`
    : `${appOrigin}${import.meta.env.BASE_URL}`
  const normalized = base.endsWith('/') ? base : `${base}/`
  return normalized
}
