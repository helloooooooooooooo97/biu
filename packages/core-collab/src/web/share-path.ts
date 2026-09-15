export function shareTokenFromPath(pathname: string) {
  const match = String(pathname ?? '').match(/^\/share\/([^/]+)\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}
