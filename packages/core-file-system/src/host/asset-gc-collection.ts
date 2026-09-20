import type { CollectionSpec } from '@biu/type-file-system'
import { REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import type { AssetGcHooks } from './asset-gc-run.ts'
import { listWorkspaceGcCandidates, previewWorkspaceAssetGc, runWorkspaceAssetGc } from './asset-gc-run.ts'

const STATUS = {
  id: 'status',
  title: '资产回收',
}

export function assetGcCollection(hooks: () => AssetGcHooks): CollectionSpec {
  return {
    id: 'asset-gc',
    path: '/asset-gc',
    label: '资产回收',
    view: {
      moduleId: 'asset-gc',
      route: '/db-asset-gc',
      title: '资产回收',
      inspector: false,
      icon: 'trash',
      blurb:
        '工作区资产回收。db_list /asset-gc。预览 db_action /asset-gc/status action=preview（不删）。执行 db_action /asset-gc/status action=run。看观察期 db_action /asset-gc/status action=candidates。',
      order: 19,
    },
    records: { update: false, create: false, delete: false },
    schema: {
      labelField: 'title',
      columns: ['title'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '标题' },
      },
    },
    actions: [
        {
          id: 'preview',
          label: '预览',
          description: '列出本轮会进观察期或删除的文件，不删。',
          allowMissing: true,
          run: () => previewWorkspaceAssetGc(hooks()),
        },
        {
          id: 'run',
          label: '执行回收',
          description: '按候选制跑一轮 GC。观察期内的文件不会立刻删。',
          allowMissing: true,
          confirm: '确定执行资产回收？观察期满的文件会被删除。',
          run: () => runWorkspaceAssetGc(hooks()),
        },
        {
          id: 'candidates',
          label: '观察期',
          description: '列出 gc_candidates。',
          allowMissing: true,
          run: () => listWorkspaceGcCandidates(hooks()),
        },
    ],
    list: async () => [{ ...STATUS }],
    get: async (id) => (id === STATUS.id ? { ...STATUS } : null),
  }
}
