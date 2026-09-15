import type { CollectionChrome } from '@biu/type-file-system/ui'
import { DEFAULT_CHROME_PATH } from '@biu/type-file-system/ui'
import { PageEditor, PageBlockContent, getPageEditor } from '@biu/core-editor/web'
import { sessionsChrome } from '../packages/core-chat/src/web/sessions-chrome.tsx'
import { SkillsContent } from '@biu/host-skills/web'
import { pluginsChrome } from '../packages/core-plugin-system/src/web/chrome.tsx'
import { tasksChrome } from '../packages/core-task-system/src/web/chrome.tsx'
import { DatabaseUiService, getDatabaseUi } from '../packages/core-file-system/src/web/database-ui.ts'
import { facetsChrome } from '../packages/core-file-system/src/web/facet-chrome.tsx'
import { viewsChrome } from '../packages/core-file-system/src/web/views-chrome.ts'
import { pageBlocksChrome } from '../packages/core-file-system/src/web/page-blocks-chrome.ts'
import { FACETS_COLLECTION_PATH, PAGE_BLOCKS_COLLECTION_PATH, VIEWS_COLLECTION_PATH } from '../packages/core-file-system/src/web/database-path.ts'
import type { Context } from 'cordis'

/** 和工作台同一套 decorate：按表覆盖 db_content，不要 if 路径硬套 Markdown。 */
export function installShareCollectionChrome(ctx: Context) {
  new DatabaseUiService(ctx)
  const ui = getDatabaseUi()
  if (!ui) return
  ui.decorate(DEFAULT_CHROME_PATH, { Content: PageEditor })
  ui.decorate(PAGE_BLOCKS_COLLECTION_PATH, {
    ...pageBlocksChrome(() => getPageEditor()?.blocks() ?? []),
    Content: PageBlockContent,
  })
  ui.decorate('/sessions', sessionsChrome())
  ui.decorate('/skills', { Content: SkillsContent })
  ui.decorate('/plugins', pluginsChrome)
  ui.decorate('/tasks', tasksChrome)
  ui.decorate(FACETS_COLLECTION_PATH, facetsChrome)
  ui.decorate(VIEWS_COLLECTION_PATH, viewsChrome)
}

export function shareChromeFor(collection: string): CollectionChrome {
  return getDatabaseUi()?.chrome(collection) ?? {}
}
