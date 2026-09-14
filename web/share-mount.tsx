import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { parseSharePath } from '../packages/core-file-system/src/share-snapshot.ts'
import { ShareRoot } from '../packages/core-file-system/src/web/share-page.tsx'

export function isShareHref(pathname = window.location.pathname) {
  return Boolean(parseSharePath(pathname))
}

/** LAN :3142 only allows /share APIs. Don't boot the full plugin tree. */
export function mountShareApp(el: HTMLElement) {
  createRoot(el).render(
    <BrowserRouter>
      <ShareRoot />
    </BrowserRouter>,
  )
}
