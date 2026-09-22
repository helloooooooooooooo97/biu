import { memo, useSyncExternalStore } from 'react'
import {
  getChatOutlineFilter,
  setChatOutlineFilter,
  subscribeChatOutline,
  type ChatOutlineFilter,
} from './chat-outline.ts'

export const ChatOutlineFilterFields = memo(function ChatOutlineFilterFields() {
  const filter = useSyncExternalStore(subscribeChatOutline, getChatOutlineFilter, (): ChatOutlineFilter => 'user')
  return (
    <div className="session-config-row" data-testid="chat-outline-filter">
      <span className="session-config-k">消息大纲</span>
      <div className="session-config-v">
        <div className="session-config-seg" role="radiogroup" aria-label="消息大纲">
          <button
            type="button"
            className={filter === 'user' ? 'is-on' : ''}
            aria-pressed={filter === 'user'}
            onClick={() => setChatOutlineFilter('user')}
          >
            只看我发的
          </button>
          <button
            type="button"
            className={filter === 'all' ? 'is-on' : ''}
            aria-pressed={filter === 'all'}
            onClick={() => setChatOutlineFilter('all')}
          >
            全部消息
          </button>
        </div>
        <span className="session-config-hint">
          {filter === 'all' ? '含机器人主动发出的消息。' : '侧栏大纲只列出你发出的消息。'}
        </span>
      </div>
    </div>
  )
})
