/** Paths the LAN share listener may serve. Everything else stays on localhost. */
export function isShareApiPath(pathname: string) {
  return pathname === '/api/share' || pathname.startsWith('/api/share/')
}

export function isSharePublicPath(pathname: string) {
  if (isShareApiPath(pathname)) return true
  if (pathname === '/share' || pathname.startsWith('/share/')) return true
  if (pathname.startsWith('/assets/')) return true
  return [
    '/favicon.ico',
    '/icon.png',
    '/icon.svg',
    '/manifest.webmanifest',
    '/manifest.json',
    '/robots.txt',
  ].includes(pathname)
}
