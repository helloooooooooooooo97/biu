import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { parseSharePath } from '../packages/core-file-system/src/share-snapshot.ts'
import { ShareRoot } from '../packages/core-file-system/src/web/share-page.tsx'
import { applyStoredTheme } from '@biu/web-app-shell/theme'
import { applyPagePrefs } from '../packages/core-file-system/src/web/page-width.ts'
import { bootShareRuntime, loadSharePagePlugins } from './share-plugins.ts'
import { shareChromeFor } from './share-chrome.ts'

export function isShareHref(pathname = window.location.pathname) {
  return Boolean(parseSharePath(pathname))
}

/** LAN :3142 only allows /share APIs. Boot pageEditor so page blocks can register. */
export function mountShareApp(el: HTMLElement) {
  document.documentElement.classList.add('share')
  applyStoredTheme()
  applyPagePrefs()
  bootShareRuntime()
  createRoot(el).render(
    <BrowserRouter>
      <ShareRoot chromeFor={shareChromeFor} loadPlugins={loadSharePagePlugins} />
    </BrowserRouter>,
  )
}
