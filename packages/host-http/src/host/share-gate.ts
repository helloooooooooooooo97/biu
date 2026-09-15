/** Paths the LAN share listener may serve. Everything else stays on localhost. */
export function isShareApiPath(pathname: string) {
  return pathname === '/api/share' || pathname.startsWith('/api/share/')
}

export function isSharePublicPath(pathname: string) {
  if (isShareApiPath(pathname)) return true
  if (pathname.startsWith('/api') || pathname === '/ws' || pathname.startsWith('/ws/')) return false
  if (pathname === '/share' || pathname.startsWith('/share/')) return true
  if (pathname.startsWith('/assets/')) return true
  // Static agent-avatar geometry used by PersonFace on the share page.
  if (pathname.startsWith('/grok-bot/')) return true
  if (pathname.startsWith('/@')) return true
  if (pathname.startsWith('/src/') || pathname.startsWith('/packages/') || pathname.startsWith('/node_modules/') || pathname.startsWith('/web/')) return true
  if (pathname.startsWith('/.plugin')) return true
  return [
    '/favicon.ico',
    '/icon.png',
    '/icon.svg',
    '/manifest.webmanifest',
    '/manifest.json',
    '/robots.txt',
  ].includes(pathname)
}
