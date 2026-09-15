import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PageEditor } from '@biu/core-editor/web'
import { parseSharePath } from '../packages/core-file-system/src/share-snapshot.ts'
import { ShareRoot } from '../packages/core-file-system/src/web/share-page.tsx'
import { applyStoredTheme } from '@biu/web-app-shell/theme'
import { bootShareRuntime, loadSharePagePlugins } from './share-plugins.ts'

export function isShareHref(pathname = window.location.pathname) {
  return Boolean(parseSharePath(pathname))
}

/** LAN :3142 only allows /share APIs. Boot pageEditor so page blocks can register. */
export function mountShareApp(el: HTMLElement) {
  document.documentElement.classList.add('share')
  applyStoredTheme()
  bootShareRuntime()
  createRoot(el).render(
    <BrowserRouter>
      <ShareRoot chrome={{ Content: PageEditor }} loadPlugins={loadSharePagePlugins} />
    </BrowserRouter>,
  )
}
