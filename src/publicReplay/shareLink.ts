export function publicReplayShareUrl(id: string, href?: string) {
  if (href && href.length > 0) return href
  return `/#/r/${id}`
}
