import type { CollectionInfo } from '@biu/type-file-system'
import { mergeTableViews } from '../catalog-views.ts'
import { isSystemCollection } from './database-path.ts'
import { getDatabaseUi } from './database-ui.ts'
import type { SavedView } from './saved-view.ts'

export function viewsForRegisteredCollection(
  path: string,
  tables: CollectionInfo[],
  user: SavedView[],
) {
  const listed = getDatabaseUi()?.chrome(path).listViews?.(tables, user)
  if (listed) return listed as SavedView[]
  const table = tables.find((item) => item.path === path) ?? { path, label: path.replace(/^\//, '') }
  if (isSystemCollection(path)) return mergeTableViews(table, user, { ownership: false })
  return mergeTableViews(table, user)
}
