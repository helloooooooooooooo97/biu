import type { CollectionChrome } from '@biu/type-file-system/ui'
import { PageEditor, PageBlockContent } from '@biu/core-editor/web'
import { sessionsChrome } from '../packages/core-chat/src/web/sessions-chrome.tsx'
import { SkillsContent } from '@biu/host-skills/web'

const pageChrome: CollectionChrome = { Content: PageEditor }
const sessionChrome = sessionsChrome()
const blocksChrome: CollectionChrome = { Content: PageBlockContent }
const skillsChrome: CollectionChrome = { Content: SkillsContent }

/** 分享页按表走各自的 db_content 呈现，不要一律套页面 Markdown。 */
export function shareChromeFor(collection: string): CollectionChrome {
  if (collection === '/sessions') return sessionChrome
  if (collection === '/page-blocks') return blocksChrome
  if (collection === '/skills') return skillsChrome
  return pageChrome
}
